import { Router } from 'express';
import QRCode from 'qrcode';
import { env } from '../../config/env';
import { ah } from '../../lib/asyncHandler';
import { getSettings } from '../settings/settings.service';
import { androidRelease } from '../settings/appRelease';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Public download page for the Android app (no Play Store needed). Served at /download; the web app is at /. */
export const siteRoutes = Router();

/**
 * Permanent link to the newest APK: /download/lensio.apk always redirects to the version set in
 * admin → Settings → Android app download, so the same link works for every release.
 */
siteRoutes.get(['/download/lensio.apk', '/download/latest', '/download/android'], ah(async (_req, res) => {
  const rel = await androidRelease();
  res.set('Cache-Control', 'no-store');
  if (!rel.apkUrl) return res.redirect(302, '/download');
  res.redirect(302, rel.apkUrl);
}));

siteRoutes.get('/download', ah(async (req, res) => {
  const [s, rel] = await Promise.all([getSettings(), androidRelease()]);
  const pageUrl = `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/download`;
  const qr = await QRCode.toDataURL(pageUrl, { margin: 1, width: 360 });
  const apk = rel.apkUrl;
  const wa = `https://wa.me/${env.SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent('Hi Lensio, I have a question')}`;
  res.set('Cache-Control', 'no-cache').type('html').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Lensio — Download the app</title>
<meta name="description" content="Lensio: frames with lenses made to your prescription. Download the Android app.">
<meta property="og:title" content="Lensio — Your lens, our world"><meta property="og:description" content="Frames with lenses, made to your prescription. Download the Android app.">
<meta property="og:image" content="${esc(env.PUBLIC_BASE_URL)}/admin/mark.png">
<link rel="icon" href="/admin/mark.png">
<link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
<style>
:root{box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);
 --night:#040722;--surface:#0C1138;--line:#242B66;--text:#F3F4FF;--muted:#A3A8D2;--grad:linear-gradient(90deg,#08B9DB,#7B61FF 50%,#C94EF2)}
*,*::before,*::after{box-sizing:inherit}html,body{margin:0;height:100%}
body{background:var(--night);color:var(--text);font:500 16px/1.5 'Quicksand',ui-rounded,system-ui,-apple-system,'Segoe UI',sans-serif}
main{max-width:520px;margin:0 auto;padding:40px 22px 48px;display:flex;flex-direction:column;gap:26px;align-items:center;text-align:center}
.brand img{height:40px}
h1{font-size:30px;line-height:1.2;margin:0}
p{margin:0;color:var(--muted)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:56px;padding:0 30px;border-radius:999px;background:var(--grad);color:#fff;font-weight:700;font-size:17px;text-decoration:none;width:100%;max-width:340px}
.btn.off{background:var(--surface);border:1px solid var(--line);color:var(--muted)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:20px;text-align:left;width:100%}
.card h2{font-size:17px;margin:0 0 10px}
ol{margin:0;padding-left:20px;color:var(--muted)}li{margin:6px 0}b{color:var(--text)}
.qr{background:#fff;border-radius:14px;padding:10px;width:170px}
.qrwrap{display:flex;flex-direction:column;align-items:center;gap:8px}
.small{font-size:13px}
a.link{color:#5ED3F3;font-weight:700}
@media (min-width:760px){.mobile-only{display:none}}
@media (max-width:759px){.desktop-only{display:none}}
</style></head><body><main>
<div class="brand"><img src="/admin/mark.png" alt="" style="height:64px"><br><img src="/admin/wordmark.png" alt="Lensio"></div>
<div><h1>Frames with lenses, made to your prescription</h1><p style="margin-top:10px">Browse frames, try them on with your camera, add your prescription and pay by UPI.</p></div>
${apk
  ? `<a class="btn" href="/download/lensio.apk">⬇ Download for Android${rel.version ? ` · v${esc(rel.version)}` : ''}</a>
     <p class="small" style="margin-top:-14px">Already have Lensio? Download and install: it updates the app you have. Your account and orders stay.</p>
     ${rel.notes ? `<div class="card"><h2>What's new${rel.version ? ` in ${esc(rel.version)}` : ''}</h2><p style="white-space:pre-line">${esc(rel.notes)}</p></div>` : ''}`
  : `<span class="btn off">The Android app is coming soon</span>`}
<div class="qrwrap desktop-only"><img class="qr" src="${qr}" alt="QR code to open this page on your phone"><span class="small" style="color:var(--muted)">On a computer? Scan with your Android phone.</span></div>
<div class="card"><h2>How to install</h2><ol>
<li>Tap <b>Download for Android</b> and open the downloaded file.</li>
<li>If Android asks, tap <b>Settings</b> → turn on <b>Allow from this source</b>, then go back.</li>
<li>Tap <b>Install</b>. If Play Protect warns, tap <b>More details → Install anyway</b>. It warns because the app isn't on the Play Store.</li>
<li>Open <b>Lensio</b> and create your account.</li></ol></div>
<div class="card"><h2>iPhone or computer?</h2><p>Use Lensio right in your browser, with the same frames, lenses and UPI payment.</p>
<p style="margin-top:14px"><a class="btn" href="/" style="max-width:none">Open Lensio in your browser</a></p>
<p class="small" style="margin-top:12px">On iPhone: open it in <b>Safari</b>, tap <b>Share</b>, then <b>Add to Home Screen</b>. Lensio then opens like an app.</p></div>
<p class="small">Questions? <a class="link" href="${wa}">Chat with us on WhatsApp</a>${s.instagramUrl ? ` · <a class="link" href="${esc(s.instagramUrl)}" rel="noopener">Follow us on Instagram</a>` : ''}</p>
</main></body></html>`);
}));
