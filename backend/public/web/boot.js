(function () {
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
})();