import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { swapPlaceholderImages } from './lib/frameArt';
import { androidRelease } from './modules/settings/appRelease';
import { whatsappEnabled } from './modules/notifications/whatsapp.service';
import { smsEnabled } from './modules/auth/otp.service';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import { env, isProd } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import path from 'path';
import { localPublicDir, localUploadDir } from './lib/storage';
import { errorHandler } from './middleware/error';
import { getSettings, upiManualAvailable } from './modules/settings/settings.service';
import QRCode from 'qrcode';
import { siteRoutes } from './modules/site/download.page';
import authRoutes from './modules/auth/auth.routes';
import catalogRoutes from './modules/catalog/catalog.routes';
import lensRoutes from './modules/lens/lens.routes';
import rxRoutes from './modules/prescriptions/prescriptions.routes';
import cartRoutes from './modules/cart/cart.routes';
import orderRoutes from './modules/orders/orders.routes';
import paymentRoutes, { razorpayWebhook } from './modules/payments/payments.routes';
import shippingRoutes from './modules/shipping/shipping.routes';
import adminRoutes from './modules/admin/admin.routes';
import assistantRoutes from './modules/assistant/assistant.routes';
import reviewRoutes from './modules/reviews/reviews.routes';
import storeRoutes from './modules/stores/stores.routes';
import eyeTestRoutes from './modules/eyetest/eyetest.routes';
import loyaltyRoutes from './modules/loyalty/loyalty.routes';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'", 'blob:', 'data:'], // web app reads picked photos before uploading
        mediaSrc: ["'self'", 'blob:'],
        workerSrc: ["'self'", 'blob:'],
        manifestSrc: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // product images load in the app
  }));
  // Gzip every response: cuts the 2.2 MB web-app bundle to about a quarter, so pages open much faster.
  app.use(compression());
  app.use(cors({ origin: env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(',') }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));

  // Webhooks need the raw body: mount before express.json().
  app.post('/v1/payments/razorpay/webhook', ...razorpayWebhook);

  app.use('/v1/assistant', express.json({ limit: '2mb' }));   // Ask Lensio photos
  app.use(express.json({ limit: '1mb' }));
  // Sample frames have text placeholder photos: send drawn frame pictures instead, everywhere.
  app.use('/v1', (req, res, next) => {
    const json = res.json.bind(res);
    res.json = (body: unknown) => json(swapPlaceholderImages(body, `${req.protocol}://${req.get('host')}`));
    next();
  });
  app.use('/v1', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));

  app.get('/health', async (_req, res) => {
    try { await prisma.$queryRaw`SELECT 1`; res.json({ ok: true }); }
    catch { res.status(503).json({ ok: false }); }
  });

  app.get('/v1/config', async (_req, res, next) => {
    try {
      const [s, rel] = await Promise.all([getSettings(), androidRelease()]);
      res.json({
        supportWhatsApp: env.SUPPORT_WHATSAPP_NUMBER,
        razorpayKeyId: env.RAZORPAY_KEY_ID ?? null,
        payments: { razorpay: !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET), upiManual: upiManualAvailable(s), cod: s.codEnabled },
        app: { androidApkUrl: rel.apkUrl, latestVersion: rel.version, minVersion: rel.minVersion, notes: rel.notes },
        instagramUrl: s.instagramUrl,
        auth: { phoneOtp: whatsappEnabled() || smsEnabled(), otpWhatsApp: whatsappEnabled(), otpSms: smsEnabled(), emailCode: true, password: true },
        loyalty: { enabled: s.loyaltyEnabled, pointsPer100: s.loyaltyPointsPer100, maxRedeemPercent: s.loyaltyMaxRedeemPercent, pointValueRupees: 1 },
        firstOrderCoupon: 'FIRST10',
        assistantAi: !!(env.GEMINI_API_KEY || env.GEMINI_API_KEY_2),
        version: '3.1.3',
      });
    } catch (e) { next(e); }
  });

  // Renders a UPI QR as PNG (used by the admin settings preview). Only upi:// links are accepted.
  app.get('/v1/qr', async (req, res, next) => {
    try {
      const data = String(req.query.data ?? '');
      if (!data.startsWith('upi://pay?') || data.length > 500) return res.status(400).end();
      res.type('png').set('Cache-Control', 'no-store').send(await QRCode.toBuffer(data, { margin: 1, width: 360 }));
    } catch (e) { next(e); }
  });

  app.use('/v1/auth', authRoutes);
  app.use('/v1/catalog', catalogRoutes);
  app.use('/v1/lens', lensRoutes);
  app.use('/v1/prescriptions', rxRoutes);
  app.use('/v1/cart', cartRoutes);
  app.use('/v1/orders', orderRoutes);
  app.use('/v1/payments', paymentRoutes);
  app.use('/v1/shipping', shippingRoutes);
  app.use('/v1/admin', adminRoutes);
  app.use('/v1/assistant', assistantRoutes);
  app.use('/v1/reviews', reviewRoutes);
  app.use('/v1/stores', storeRoutes);
  app.use('/v1/eye-test', eyeTestRoutes);
  app.use('/v1/loyalty', loyaltyRoutes);

  if (!isProd) app.use('/dev-files', express.static(localUploadDir));
  app.use('/media', express.static(localPublicDir, { maxAge: '365d', immutable: true }));
  // Admin panel: https://<your-api>/admin
  app.use('/admin', express.static(path.resolve(__dirname, '../public/admin'), {
    index: 'index.html',
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'), // browsers re-check after each update
  }));
  // The try-on page alone may run WebAssembly with eval: MediaPipe (face measurement) needs it.
  // It loads only our own scripts; the shop, web app and admin keep the strict policy.
  app.use('/try-on', (_req, res, next) => {
    const csp = res.getHeader('Content-Security-Policy');
    if (typeof csp === 'string') res.setHeader('Content-Security-Policy', csp.replace("script-src 'self'", "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'"));
    next();
  });
  // AI try-on page (plain HTML + self-hosted face detection). Embedded by the web app (iframe) and Android app (WebView).
  app.use('/try-on', express.static(path.resolve(__dirname, '../public/tryon'), {
    index: 'index.html',
    setHeaders: (res, file) => res.setHeader('Cache-Control', /\.(bin|json)$|face-api\.js$/.test(file) ? 'public, max-age=604800' : 'no-cache'),
  }));
  app.use('/tryon/models', express.static(path.resolve(__dirname, '../public/tryon/models'), { maxAge: '7d' }));
  // MediaPipe Face Mesh (iris tracking for size measurement). Loaded only when a customer taps "Measure my size".
  app.use('/tryon/mp', express.static(path.resolve(__dirname, '../public/tryon/mp'), { maxAge: '30d', immutable: true }));
  app.get(['/tryon/face-api.js', '/tryon/tryon.js'], (req, res) => res.sendFile(path.resolve(__dirname, '../public/tryon', path.basename(req.path)), { maxAge: req.path.endsWith('face-api.js') ? '7d' : 0 }));
  // Android APK download page at /download. The web app (iPhone, computers, any browser) is served at / below.
  app.use(siteRoutes);

  // ---- Web app (built from mobile/ with `npm run build:web`) ----
  const webDir = path.resolve(__dirname, '../public/web');
  // Hashed bundles and fonts never change, so browsers can cache them for a year.
  app.use('/_expo', express.static(path.join(webDir, '_expo'), { maxAge: '365d', immutable: true }));
  app.use('/assets', express.static(path.join(webDir, 'assets'), { maxAge: '365d', immutable: true }));
  app.use(express.static(webDir, { index: false, maxAge: '1h' }));
  // Any other page path (e.g. /product/vista, /order/123) opens the web app, which handles routing itself.
  app.get(/^\/(?!v1\/|admin|media\/|dev-files\/|health|download|try-on).*/, (req, res, next) => {
    if (!req.accepts('html')) return next();
    res.set('Cache-Control', 'no-cache').sendFile(path.join(webDir, 'index.html'), (err) => {
      if (err) res.redirect('/download'); // web app not built yet
    });
  });

  app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }));
  app.use(errorHandler);
  return app;
}
