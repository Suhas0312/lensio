/**
 * Turns the Expo web export (dist/) into an installable web app and copies it to the backend.
 * Run from mobile/:  npm run build:web
 */
const fs = require('fs');
const path = require('path');
const dist = path.join(__dirname, '..', 'dist');
const out = path.join(__dirname, '..', '..', 'backend', 'public', 'web');

const head = `
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Lensio" />
    <meta property="og:title" content="Lensio — Your lens, our world" />
    <meta property="og:description" content="Frames with lenses, made to your prescription." />
    <meta property="og:image" content="/icons/icon-512.png" />
    <style>html,body{background:#040722}</style>`;
// Loaded before the app: fills gaps in older browsers (e.g. iPhones before iOS 15.4) and, if the app still
// can't start, shows a helpful message with the error instead of a blank page.
const boot = `(function () {
  if (typeof self.structuredClone !== 'function') self.structuredClone = function (v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); };
  if (!Array.prototype.at) Object.defineProperty(Array.prototype, 'at', { configurable: true, writable: true, value: function (i) { i = Math.trunc(i) || 0; if (i < 0) i += this.length; return this[i]; } });
  if (!Object.hasOwn) Object.hasOwn = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  // Safari (iPhone, Mac) has webkitSpeechRecognition but not webkitSpeechGrammarList / webkitSpeechRecognitionEvent;
  // the voice-search library reads all three when it loads, which crashed the whole app. Provide harmless stand-ins.
  if (typeof self.webkitSpeechRecognition !== 'undefined' || typeof self.SpeechRecognition !== 'undefined') {
    var GL = function () { this.length = 0; }; GL.prototype.addFromString = function () {}; GL.prototype.addFromURI = function () {}; GL.prototype.item = function () { return null; };
    if (typeof self.webkitSpeechGrammarList === 'undefined') self.webkitSpeechGrammarList = self.SpeechGrammarList || GL;
    if (typeof self.SpeechGrammarList === 'undefined') self.SpeechGrammarList = self.webkitSpeechGrammarList;
    if (typeof self.webkitSpeechRecognitionEvent === 'undefined') self.webkitSpeechRecognitionEvent = self.SpeechRecognitionEvent || Event;
    if (typeof self.SpeechRecognitionEvent === 'undefined') self.SpeechRecognitionEvent = self.webkitSpeechRecognitionEvent;
  }
  // Safari has webkitSpeechRecognition but not the grammar/event classes the voice-search library expects.
  // Without these stand-ins the whole app crashed on iPhone and Mac ("Can't find variable: webkitSpeechGrammarList").
  function Grammars() { this.length = 0; this.addFromString = function () {}; this.addFromURI = function () {}; this.item = function () { return null; }; }
  function SpeechEvent() {}
  if (typeof self.webkitSpeechRecognition !== 'undefined') {
    if (typeof self.webkitSpeechGrammarList === 'undefined') self.webkitSpeechGrammarList = Grammars;
    if (typeof self.webkitSpeechRecognitionEvent === 'undefined') self.webkitSpeechRecognitionEvent = SpeechEvent;
  }
  if (typeof self.SpeechRecognition !== 'undefined') {
    if (typeof self.SpeechGrammarList === 'undefined') self.SpeechGrammarList = Grammars;
    if (typeof self.SpeechRecognitionEvent === 'undefined') self.SpeechRecognitionEvent = SpeechEvent;
  }
  var errors = [];
  addEventListener('error', function (e) { errors.push(String(e.message || e.error || e)); });
  addEventListener('unhandledrejection', function (e) { errors.push(String(e.reason && e.reason.message || e.reason)); });
  setTimeout(function () {
    var root = document.getElementById('root');
    if (!root || root.children.length || !errors.length) return;
    root.innerHTML = '<div style="font-family:system-ui,sans-serif;color:#fff;max-width:420px;margin:15vh auto;padding:24px;text-align:center">' +
      '<h2 style="margin:0 0 8px">Lensio could not open in this browser</h2>' +
      '<p style="color:#b7bad6">Please update your browser (or your phone software) and try again, or open Lensio in Chrome or Safari.</p>' +
      '<p><a style="color:#22d3ee" href="/download">Download the Android app</a></p>' +
      '<p style="color:#6f7396;font-size:12px;word-break:break-word">Details for support: ' + errors.slice(0, 2).join(' | ').replace(/[<>&]/g, '') + '</p></div>';
  }, 6000);
})();`;
fs.writeFileSync(path.join(dist, 'boot.js'), boot);

let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
html = html.replace(/<meta name="viewport"[^>]*\/>/, '').replace('</title>', '</title>' + head + '\n    <script src="/boot.js?v=' + Date.now() + '"></script>');
fs.writeFileSync(path.join(dist, 'index.html'), html);

fs.mkdirSync(path.join(dist, 'icons'), { recursive: true });
for (const f of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'])
  fs.copyFileSync(path.join(__dirname, '..', 'assets', 'web', f), path.join(dist, 'icons', f));
fs.writeFileSync(path.join(dist, 'manifest.webmanifest'), JSON.stringify({
  name: 'Lensio', short_name: 'Lensio', description: 'Frames with lenses, made to your prescription.',
  start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait',
  background_color: '#040722', theme_color: '#040722',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2));

// The app only uses Ionicons; drop the other icon fonts to keep the upload small (GitHub: 100 files per upload).
const fontDir = path.join(dist, 'assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts');
if (fs.existsSync(fontDir)) for (const f of fs.readdirSync(fontDir)) if (!f.startsWith('Ionicons.')) fs.rmSync(path.join(fontDir, f));

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(dist, out, { recursive: true });
console.log('Web app copied to backend/public/web');
