import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('30d'),
  CORS_ORIGINS: z.string().default('*'),
  PUBLIC_BASE_URL: z.string().default('http://localhost:4000'),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  SHIPROCKET_EMAIL: z.string().optional(),
  SHIPROCKET_PASSWORD: z.string().optional(),
  SHIPROCKET_PICKUP_LOCATION: z.string().default('Primary'),
  SHIPROCKET_WEBHOOK_TOKEN: z.string().optional(),
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_TEMPLATE_LANG: z.string().default('en'),
  WHATSAPP_OTP_TEMPLATE: z.string().default('login_code'),          // Authentication template with a "Copy code" button
  OWNER_WHATSAPP_NUMBERS: z.string().optional(),                     // comma-separated 10-digit numbers for owner alerts
  SUPPORT_WHATSAPP_NUMBER: z.string().default('919999999999'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('ap-south-1'),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),
  SEED_ON_START: z.string().optional(),
  /** Setup mode: print OTP codes to the server log when SMS isn't configured yet. Turn off before launch. */
  OTP_LOG_CODES: z.string().optional(),
  /** Fixed sign-in for App Store / Play review, e.g. REVIEW_PHONE=9000000001 REVIEW_OTP=246810 */
  REVIEW_PHONE: z.string().optional(),
  REVIEW_OTP: z.string().regex(/^\d{6}$/).optional(),
  REVIEW_EMAIL: z.string().optional(),
  ADMIN_PHONES: z.string().default(''),
  /** Comma-separated emails that become ADMIN when they sign in. */
  ADMIN_EMAILS: z.string().default(''),
  /** Brevo (free: 300 emails/day). Sends sign-in codes and order updates by email. */
  BREVO_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  MAIL_FROM_NAME: z.string().default('Lensio'),
  /** Google Gemini API key (free tier at aistudio.google.com) for the in-app AI assistant. */
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  /** Instagram API (Instagram Login, professional account) long-lived token, for importing posts as products. */
  INSTAGRAM_ACCESS_TOKEN: z.string().optional(),
  PAYMENT_HOLD_MINUTES: z.coerce.number().default(30),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';

if (isProd) {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET || !env.RAZORPAY_WEBHOOK_SECRET)
    console.warn('Razorpay keys not set: customers pay by UPI (QR) until you add them.');
  if (!env.BREVO_API_KEY || !env.MAIL_FROM)
    console.warn(env.OTP_LOG_CODES === 'true'
      ? 'SETUP MODE: email not configured, sign-in codes are printed to this log. Add BREVO_API_KEY + MAIL_FROM, then remove OTP_LOG_CODES.'
      : 'Email (Brevo) not configured: password sign-in works, but email codes and password resets will not be sent.');
  if (env.STORAGE_DRIVER === 's3' && !env.S3_PUBLIC_URL) {
    console.error('Set S3_PUBLIC_URL so product photos have public links.');
    process.exit(1);
  }
  if (env.STORAGE_DRIVER === 'local') {
    console.warn('STORAGE_DRIVER=local in production: uploaded images will be lost on redeploy. Use s3.');
  }
}
