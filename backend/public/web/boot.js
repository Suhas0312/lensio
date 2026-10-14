(function () {
  if (typeof self.structuredClone !== 'function') self.structuredClone = function (v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); };
  if (!Array.prototype.at) Object.defineProperty(Array.prototype, 'at', { configurable: true, writable: true, value: function (i) { i = Math.trunc(i) || 0; if (i < 0) i += this.length; return this[i]; } });
  if (!Object.hasOwn) Object.hasOwn = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
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
})();