/* Lensio AI try-on. Runs entirely in the browser (or the app's WebView):
 * face detection (face-api.js, self-hosted), automatic frame placement, face-shape suggestions, capture.
 * No face images leave the device. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const qs = new URLSearchParams(location.search);
  const EMBED = qs.get('embed') === '1';          // opened inside the Lensio app
  const inRN = !!window.ReactNativeWebView;         // Android/iOS app WebView
  const post = (msg) => {
    if (inRN) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    else if (EMBED && window.parent !== window) window.parent.postMessage({ lensio: true, ...msg }, location.origin);
  };
  const inr = (p) => '₹' + Math.round(p / 100).toLocaleString('en-IN');
  const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3000); };
  const status = (html) => { $('#status').innerHTML = html; };

  const stage = $('#stage'), video = $('#video'), photo = $('#photo'), overlay = $('#overlay');
  const S = { frames: [], sel: null, mode: 'none', stream: null, face: null, shape: null, manual: null, manualUntil: 0, busy: false, ready: false };
  window.__lensioTryon = S; // for diagnostics

  // ---------- Face shape → frame suggestions (styling guidance, not a measurement) ----------
  const SUIT = {
    round: { label: 'Round', tip: 'Angular frames add definition.', shapes: ['RECTANGLE', 'SQUARE', 'WAYFARER', 'GEOMETRIC'] },
    square: { label: 'Square', tip: 'Curved frames soften strong angles.', shapes: ['ROUND', 'OVAL', 'CAT_EYE', 'AVIATOR'] },
    oval: { label: 'Oval', tip: 'Balanced proportions suit most styles.', shapes: ['WAYFARER', 'AVIATOR', 'RECTANGLE', 'SQUARE', 'ROUND'] },
    heart: { label: 'Heart', tip: 'Bottom-heavy or rounded frames balance a wider forehead.', shapes: ['AVIATOR', 'ROUND', 'OVAL', 'RECTANGLE'] },
    long: { label: 'Long', tip: 'Deeper, bolder frames shorten the face visually.', shapes: ['SQUARE', 'WAYFARER', 'AVIATOR', 'GEOMETRIC'] },
  };
  function classify(pts) {
    const d = (a, b) => Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y);
    const browMid = { x: (pts[19].x + pts[24].x) / 2, y: (pts[19].y + pts[24].y) / 2 };
    const faceW = d(0, 16), jawW = d(4, 12), browW = d(17, 26);
    const faceH = Math.hypot(pts[8].x - browMid.x, pts[8].y - browMid.y) * 1.35; // brow→chin, scaled to approximate hairline→chin
    const ratio = faceH / faceW;
    if (ratio >= 1.5) return 'long';
    if (browW / jawW > 1.25) return 'heart';
    if (ratio < 1.25) return jawW / faceW > 0.8 ? 'square' : 'round';
    return 'oval';
  }

  // ---------- Frame images: remove white background + crop (only for normal product photos) ----------
  async function prepareFrameImage(product) {
    const img = new Image();
    img.src = `/v1/catalog/products/${product.id}/tryon-image`;
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight;
    const scale = Math.min(1, 900 / w);
    const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, c.width, c.height);
    const data = g.getImageData(0, 0, c.width, c.height), px = data.data;
    // Already transparent (an uploaded try-on PNG)? Then just crop.
    let transparent = 0; for (let i = 3; i < px.length; i += 16) if (px[i] < 200) transparent++;
    const hasAlpha = transparent > px.length / 16 * 0.05;
    if (!hasAlpha) {
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i], gg = px[i + 1], b = px[i + 2];
        const mn = Math.min(r, gg, b), mx = Math.max(r, gg, b);
        if (mx - mn < 28 && mn > 200) {                       // near-white, low saturation → background
          px[i + 3] = mn >= 238 ? 0 : Math.round(255 * (238 - mn) / 38);
        }
      }
      g.putImageData(data, 0, 0);
    }
    // Crop to visible pixels
    let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      if (px[(y * c.width + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 <= x0 || y1 <= y0) return null;
    // A front view of glasses is wide (about 2.2–3.5× its height). Anything else (side view, a model wearing it, text) → use a drawn frame.
    const ratio = (x1 - x0 + 1) / (y1 - y0 + 1);
    if (ratio < 1.7 || ratio > 5) return null;
    const out = document.createElement('canvas'); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
    out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }

  // ---------- Drawn frames (Lenskart-style) ----------
  // Frames without a real front-view photo get a picture drawn by the server from their shape, material,
  // measurements and colour (the same picture the shop shows).
  const PLACEHOLDER = /placehold\.co|placeholder|dummyimage|via\.placeholder|\/frame\.png/i;
  function needsDrawn(f) {
    if (f.tryOnImage) return false;
    const url = f.images && f.images[0] && f.images[0].url;
    return !url || PLACEHOLDER.test(url);
  }
  function colorsOf(f) {
    const seen = new Set(), out = [];
    for (const v of f.variants || []) if (v.colorHex && !seen.has(v.colorHex.toLowerCase())) { seen.add(v.colorHex.toLowerCase()); out.push({ hex: v.colorHex, name: v.colorName || '' }); }
    return out.length ? out : [{ hex: '#1B1F3B', name: 'Black' }];
  }
  const drawnUrl = (f, hex, pad) => `/v1/catalog/products/${encodeURIComponent(f.id)}/frame.png?c=${encodeURIComponent(hex.replace('#', ''))}${pad ? '&pad=1' : ''}`;
  async function drawnFrame(f, hex) {
    const key = 'd:' + hex; f._cache = f._cache || {};
    if (!f._cache[key]) {
      const img = new Image(); img.src = drawnUrl(f, hex); await img.decode();
      f._cache[key] = img.src;
    }
    return f._cache[key];
  }
  /** The overlay for a frame in a colour: real try-on PNG or photo when usable, otherwise a drawn frame. */
  async function frameOverlay(f, hex) {
    if (!f._drawn && !needsDrawn(f)) {
      try {
        if (!f._photo) f._photo = await prepareFrameImage(f);
        if (f._photo) return f._photo;
      } catch { /* fall through to the drawn frame */ }
      f._drawn = true;
    }
    f._drawn = true;
    return drawnFrame(f, hex);
  }

  // ---------- Frames ----------
  async function loadFrames() {
    const items = [];
    for (let page = 1; page <= 4; page++) {
      const r = await fetch(`/v1/catalog/products?limit=50&sort=popular&page=${page}`);
      if (!r.ok) throw new Error('frames ' + r.status);
      const j = await r.json(); items.push(...(j.items || []));
      if (page >= (j.pages || 1)) break;
    }
    S.frames = items;
    if (!S.frames.length) { $('#strip').innerHTML = '<p class="muted small">No frames yet.</p>'; return; }
    renderStrip();
    const pick = S.frames.find((f) => f.slug === qs.get('frame')) || S.frames[0];
    await select(pick.id);
  }
  function orderedFrames() {
    const sized = S.frames.filter((f) => hasSize(f, S.sizeFilter));
    const list = sized.length ? sized : S.frames;
    if (!S.shape) return list;
    const good = SUIT[S.shape].shapes;
    return [...list].sort((a, b) => (good.includes(b.shape) ? 1 : 0) - (good.includes(a.shape) ? 1 : 0));
  }
  function thumbOf(f) {
    if (f._thumb) return f._thumb;
    if (needsDrawn(f) || f._drawn) return (f._thumb = drawnUrl(f, colorsOf(f)[0].hex, true));
    if (!f._thumbing) {
      f._thumbing = true;
      thumbQueue = thumbQueue.then(() => frameOverlay(f, colorsOf(f)[0].hex)).then((u) => {
        f._thumb = f._drawn ? drawnUrl(f, colorsOf(f)[0].hex, true) : u;
        const im = document.querySelector(`.fr[data-id="${f.id}"] img`); if (im) im.src = f._thumb;
      }).catch(() => {});
    }
    return '';
  }
  let thumbQueue = Promise.resolve();
  function renderStrip() {
    const good = S.shape ? SUIT[S.shape].shapes : [];
    const none = S.sizeFilter && !S.frames.some((f) => hasSize(f, S.sizeFilter));
    $('#sizeNone').hidden = !none;
    if (none) $('#sizeNone').textContent = `No ${SIZE_LABEL[S.sizeFilter].toLowerCase()} frames in stock right now. Showing all frames.`;
    $('#strip').innerHTML = orderedFrames().map((f) => `<button class="fr ${S.sel?.id === f.id ? 'on' : ''}" data-id="${f.id}" aria-label="${f.name.replace(/"/g, '')}">
      ${good.includes(f.shape) ? '<span class="tag">Suits you</span>' : ''}
      <img src="${thumbOf(f)}" alt="" loading="lazy">
      <div class="n">${f.name.replace(/</g, '&lt;')}</div><div class="pr">${inr(f.basePrice)}</div></button>`).join('');
  }
  function renderSwatches() {
    const f = S.sel, box = $('#swatches');
    if (!f || !f._drawn) { box.hidden = true; return; }
    const cs = colorsOf(f);
    box.hidden = cs.length < 2;
    box.innerHTML = cs.map((c) => `<button class="sw ${c.hex === S.color ? 'on' : ''}" data-hex="${c.hex}" title="${c.name.replace(/"/g, '')}" aria-label="${c.name.replace(/"/g, '') || c.hex}" style="--c:${c.hex}"></button>`).join('')
      + `<span class="muted small" id="swName">${(cs.find((c) => c.hex === S.color) || cs[0]).name.replace(/</g, '&lt;')}</span>`;
  }
  function showSel(f) {
    $('#selMeta').innerHTML = `${inr(f.basePrice)} · ${f.lensWidthMm}-${f.bridgeMm}-${f.templeMm} mm · ${f.frameWidthMm} mm wide${fitNote(f)}`;
  }
  async function showOverlay() {
    const f = S.sel; if (!f) return;
    const url = await frameOverlay(f, S.color);
    if (S.sel !== f) return;                                 // user picked another frame meanwhile
    overlay.src = url; await overlay.decode();
    renderSwatches();
    place();
  }
  async function select(id) {
    const f = S.frames.find((x) => x.id === id); if (!f) return;
    S.sel = f; S.manual = null; S.color = colorsOf(f)[0].hex;
    $('#selCard').hidden = false; $('#selName').textContent = f.name;
    showSel(f);
    renderStrip();
    try {
      status('Preparing frame…');
      await showOverlay();
      status(S.face ? `<span class="dot"></span>${S.mode === 'live' ? 'Following your face' : 'Fitted to your face'}` : S.mode === 'none' ? 'Turn on the camera or upload a selfie' : 'Looking for your face…');
    } catch { toast('This frame could not be shown. Try another one.'); }
  }

  // ---------- Face detection ----------
  let modelsP = null;
  function models() {
    if (modelsP) return modelsP;
    const fa = window.faceapi;
    modelsP = (async () => {
      try { await fa.tf.setBackend('webgl'); } catch { await fa.tf.setBackend('cpu'); }
      await fa.tf.ready();
      await fa.nets.tinyFaceDetector.loadFromUri('/tryon/models');
      await fa.nets.faceLandmark68Net.loadFromUri('/tryon/models');
      S.ready = true;
    })().catch((e) => { modelsP = null; throw e; });
    return modelsP;
  }
  async function detect(input, size) {
    await models();
    const fa = window.faceapi;
    const all = await fa.detectAllFaces(input, new fa.TinyFaceDetectorOptions({ inputSize: size, scoreThreshold: 0.45 })).withFaceLandmarks();
    if (!all.length) return null;
    const f = all.sort((a, b) => b.detection.box.area - a.detection.box.area)[0];
    const pts = f.landmarks.positions;
    const avg = (arr) => ({ x: arr.reduce((s, p) => s + p.x, 0) / arr.length, y: arr.reduce((s, p) => s + p.y, 0) / arr.length });
    return { L: avg(pts.slice(36, 42)), R: avg(pts.slice(42, 48)), pts };
  }

  /** Maps a point in the video/photo to screen coordinates inside the stage. */
  function mapPoint(p) {
    const W = stage.clientWidth, H = stage.clientHeight;
    if (S.mode === 'live') {
      const vw = video.videoWidth, vh = video.videoHeight, k = Math.max(W / vw, H / vh);
      return { x: W - (p.x * k + (W - vw * k) / 2), y: p.y * k + (H - vh * k) / 2 };  // mirrored
    }
    const iw = photo.naturalWidth, ih = photo.naturalHeight, k = Math.min(W / iw, H / ih);
    return { x: p.x * k + (W - iw * k) / 2, y: p.y * k + (H - ih * k) / 2 };
  }

  function setFace(raw) {
    S.raw = raw;
    if (!raw) { S.face = null; S.raw = null; return; }
    let a = mapPoint(raw.L), b = mapPoint(raw.R);
    if (a.x > b.x) [a, b] = [b, a];                 // left eye on screen first
    const prev = S.face;
    if (prev && S.mode === 'live') {
      const move = Math.max(Math.hypot(a.x - prev.L.x, a.y - prev.L.y), Math.hypot(b.x - prev.R.x, b.y - prev.R.y));
      const k = move < 2 ? 0 : Math.min(0.65, Math.max(0.12, move / 40));   // ignore sub-2px jitter
      const mix = (p, q) => ({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k });
      S.face = { L: mix(prev.L, a), R: mix(prev.R, b) };
    } else S.face = { L: a, R: b };
    if (!S.shape) {
      S.votes = S.votes || {}; const c = classify(raw.pts); S.votes[c] = (S.votes[c] || 0) + 1;
      const total = Object.values(S.votes).reduce((x, y) => x + y, 0);
      if (total >= (S.mode === 'photo' ? 1 : 18)) {                  // ~2 s of live video, or one photo
        const shape = Object.entries(S.votes).sort((x, y) => y[1] - x[1])[0][0];
        S.shape = shape; const s = SUIT[shape];
        $('#shapeText').innerHTML = `Your face looks <b>${s.label.toLowerCase()}</b>. ${s.tip} Frames marked <b>Suits you</b> are shown first.`;
        renderStrip();                                              // re-sorted once, then the list stays put
      }
    }
  }
  function resetShape() { S.shape = null; S.votes = {}; $('#shapeText').textContent = 'We\'ll suggest frames once we see your face.'; }

  /** Frame position from the eyes: width scales with the real frame width vs. a ~62 mm pupil distance. */
  function autoPose() {
    const f = S.face, fr = S.sel; if (!f || !fr) return null;
    const dx = f.R.x - f.L.x, dy = f.R.y - f.L.y, eye = Math.hypot(dx, dy);
    const w = eye * ((fr.frameWidthMm || 136) / ((S.measure && S.measure.pd) || 63));   // measured PD → true-to-size
    return { cx: (f.L.x + f.R.x) / 2, cy: (f.L.y + f.R.y) / 2 + eye * 0.06, w, rot: Math.atan2(dy, dx) };
  }
  function currentPose() {
    const auto = $('#auto').checked;
    if (S.manual && (!auto || Date.now() < S.manualUntil)) return S.manual;
    return autoPose() || S.manual || { cx: stage.clientWidth / 2, cy: stage.clientHeight * 0.42, w: stage.clientWidth * 0.55, rot: 0 };
  }
  function place() {
    if (!overlay.naturalWidth || S.mode === 'none') { overlay.style.display = 'none'; return; }
    // Live camera: show glasses only once the face is found (no big placeholder glasses in the middle).
    if (S.mode === 'live' && !S.face && !S.manual) { overlay.style.display = 'none'; return; }
    const p = currentPose(), h = p.w * overlay.naturalHeight / overlay.naturalWidth;
    Object.assign(overlay.style, { display: 'block', width: p.w + 'px', height: h + 'px',
      transform: `translate(${p.cx - p.w / 2}px, ${p.cy - h / 2}px) rotate(${p.rot}rad)` });
    $('#captureBtn').disabled = false;
  }

  // Live tracking loop
  let loopT = null;
  function startLoop() {
    clearInterval(loopT);
    loopT = setInterval(async () => {
      if (S.mode !== 'live' || S.busy || S.measuring || !video.videoWidth) return;
      S.busy = true;
      try {
        const r = await detect(video, 224);
        if (r) { S.misses = 0; setFace(r); if (!S.following) { S.following = true; status('<span class="dot"></span>Following your face'); } }
        else if (++S.misses > 12) {                                   // ~1.5 s without a face: then say so
          if (S.following !== false) { S.following = false; status('Look at the camera'); }
        }                                                             // short misses keep the glasses where they were
        place();
      } catch { status('Face detection unavailable. Drag the frame into place'); clearInterval(loopT); }
      S.busy = false;
    }, 110);
  }

  // ---------- Sources ----------
  async function startCam() {
    if (!navigator.mediaDevices?.getUserMedia) return toast('Camera not supported here. Upload a selfie instead.');
    try {
      S.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
    } catch (e) {
      return toast(e && e.name === 'NotAllowedError' ? 'Allow camera access, or upload a selfie instead.' : 'Could not start the camera. Upload a selfie instead.');
    }
    video.srcObject = S.stream; video.hidden = false; photo.hidden = true; $('#placeholder').hidden = true;
    S.mode = 'live'; S.face = null; S.manual = null; S.misses = 0; S.following = null; resetShape();
    $('#camBtn').textContent = '⏹ Stop camera';
    status('Loading face detection…');
    await video.play().catch(() => {});
    models().then(startLoop).catch(() => status('Drag the frame into place'));
    place();
  }
  function stopCam() {
    clearInterval(loopT);
    if (S.stream) { S.stream.getTracks().forEach((t) => t.stop()); S.stream = null; }
    video.hidden = true; $('#camBtn').textContent = '📷 Live camera';
    if (S.mode === 'live') { S.mode = 'none'; $('#placeholder').hidden = false; overlay.style.display = 'none'; status('Turn on the camera or upload a selfie'); }
  }
  async function useSelfie(file) {
    if (!file || !/^image\//.test(file.type)) return toast('Choose a photo of your face.');
    stopCam();
    const url = URL.createObjectURL(file);
    photo.src = url; await photo.decode();
    photo.hidden = false; $('#placeholder').hidden = true; S.mode = 'photo'; S.face = null; S.manual = null; resetShape();
    status('Finding your face…'); place();
    try {
      const r = await detect(photo, 416);
      if (!r) { status('No face found. Drag the frame into place'); toast('Use a front-facing photo with your eyes visible.'); return; }
      setFace(r); place(); status('<span class="dot"></span>Fitted to your face');
    } catch { status('Drag the frame into place'); }
  }

  // ---------- Live measurement: face width + PD → frame size (Small / Medium / Wide) ----------
  // Scale comes from the iris, which is ~11.7 mm across in almost every adult (the method PD apps use).
  // MediaPipe Face Mesh (self-hosted, ~16 MB) is loaded only when the customer taps "Measure my size".
  const IRIS_MM = 11.7;
  const SIZE_LABEL = { SMALL: 'Small', MEDIUM: 'Medium', WIDE: 'Wide' };
  const SIZE_RANGE = { SMALL: 'frames under 132 mm', MEDIUM: 'frames 132–140 mm', WIDE: 'frames over 140 mm' };
  const sizeFor = (faceMm) => (faceMm < 132 ? 'SMALL' : faceMm <= 140 ? 'MEDIUM' : 'WIDE');
  let meshP = null;
  function mesh() {
    if (meshP) return meshP;
    meshP = new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = '/tryon/mp/face_mesh.js';
      s.onload = async () => {
        try {
          const fm = new window.FaceMesh({ locateFile: (f) => `/tryon/mp/${f}` });
          fm.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
          await fm.initialize(); resolve(fm);
        } catch (e) { reject(e); }
      };
      s.onerror = reject; document.head.appendChild(s);
    }).catch((e) => { meshP = null; throw e; });
    return meshP;
  }
  const meshOnce = (fm, image) => new Promise((res) => { fm.onResults(res); fm.send({ image }).catch(() => res(null)); });
  /** One measurement from one frame, or the reason it can't be used. */
  function sampleFrom(r, W, H) {
    const lm = r && r.multiFaceLandmarks && r.multiFaceLandmarks[0];
    if (!lm || lm.length < 478) return { why: 'noface' };
    const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H }), d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    // Horizontal iris width only: eyelids cover the top and bottom of the iris, which made vertical readings
    // too small and every size too big.
    const irisA = d(P(469), P(471)), irisB = d(P(474), P(476));
    const iris = (irisA + irisB) / 2;
    if (iris < (S.mode === 'photo' ? 12 : 14)) return { why: 'far' };            // need enough pixels for ~1 mm
    const l = P(234), rt = P(454), nose = P(1), w = d(l, rt);
    if (Math.abs(irisA - irisB) / iris > 0.10 || Math.abs(nose.x - (l.x + rt.x) / 2) / w > 0.04) return { why: 'turned' };
    const tilt = Math.abs(Math.atan2(P(473).y - P(468).y, P(473).x - P(468).x));
    if (tilt > 0.07 && tilt < Math.PI - 0.07) return { why: 'turned' };              // head tilted sideways
    const mm = IRIS_MM / iris;
    return { pd: d(P(468), P(473)) * mm, face: w * mm };
  }
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  /** Average of the middle half: ignores blinks and odd frames. */
  const trimmed = (a) => { const s = [...a].sort((x, y) => x - y), k = Math.floor(s.length / 4), m = s.slice(k, s.length - k); return m.reduce((x, y) => x + y, 0) / m.length; };
  const spread = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length * 0.75)] - s[Math.floor(s.length * 0.25)]; };
  const HINT = { noface: 'Look at the camera', far: 'Come a little closer', turned: 'Look straight at the camera' };

  /** Saves a size (camera or the customer's own glasses) and filters frames to it. */
  function applyMeasure(m) {
    S.measure = m;
    try { localStorage.setItem('lensio.measure', JSON.stringify({ ...m, at: Date.now() })); } catch { /* private mode */ }
    S.sizeFilter = m.size;
  }
  /** Exact: from the numbers printed inside the arm of glasses that already fit (e.g. 52□18-140). */
  async function exactFromGlasses() {
    const lens = +$('#exLens').value, bridge = +$('#exBridge').value, pdIn = +$('#exPd').value;
    if (!(lens >= 40 && lens <= 62) || !(bridge >= 12 && bridge <= 26)) { toast('Enter the lens (40–62) and bridge (12–26) numbers from your glasses.'); return; }
    if (pdIn && !(pdIn >= 50 && pdIn <= 78)) { toast('PD is usually between 50 and 78 mm. Leave it empty if unsure.'); return; }
    const width = 2 * lens + bridge + 12;                                       // + end pieces ≈ total frame width
    applyMeasure({ face: width, pd: pdIn || null, size: sizeFor(width), photo: false, source: 'glasses', lens, bridge });
    $('#exactBox').hidden = true;
    renderSize(); renderStrip();
    const first = orderedFrames()[0];
    if (S.sel && !hasSize(S.sel, S.sizeFilter) && first) await select(first.id); else if (S.sel) showSel(S.sel);
    place(); toast(`Your size: ${SIZE_LABEL[S.measure.size]}`);
  }

  async function measure() {
    if (S.measuring) return;
    if (S.mode === 'none') { await startCam(); if (S.mode !== 'live') return; }
    S.measuring = true; $('#measureBtn').disabled = true;
    const st = (t) => status(`📏 ${t}`);
    try {
      st('Loading measurement…');
      const fm = await mesh();
      const samples = [];
      if (S.mode === 'photo') {
        const r = sampleFrom(await meshOnce(fm, photo), photo.naturalWidth, photo.naturalHeight);
        if (r.pd) samples.push(r); else { toast(r.why === 'far' ? 'Use a closer, sharper selfie.' : 'Use a front-facing selfie, eyes open, no glasses.'); }
      } else {
        const NEED = 40, until = Date.now() + 20000; let last = '';
        while (samples.length < NEED && Date.now() < until && S.mode === 'live') {
          const r = sampleFrom(await meshOnce(fm, video), video.videoWidth, video.videoHeight);
          if (r.pd) samples.push(r); else last = r.why;
          st(samples.length ? `Measuring… keep still ${Math.round(samples.length / NEED * 100)}%` : `${HINT[last] || 'Measuring…'} · remove glasses`);
          await new Promise((res) => setTimeout(res, 60));
        }
        if (samples.length < 16) { toast('Could not measure. Remove your glasses, face the camera in good light, and try again.'); samples.length = 0; }
        else if (spread(samples.map((s) => s.pd)) > 2.5) { toast('You moved a little. Keep still and tap Measure again for an exact reading.'); samples.length = 0; }
      }
      if (samples.length >= (S.mode === 'photo' ? 1 : 8)) {
        const face = trimmed(samples.map((s) => s.face)), pd = trimmed(samples.map((s) => s.pd));
        if (pd < 50 || pd > 78 || face < 110 || face > 170) toast('That measurement looks off. Try again in better light, facing the camera.');
        else {
          applyMeasure({ face: Math.round(face), pd: Math.round(pd), size: sizeFor(face), photo: S.mode === 'photo', source: 'camera' });
          renderSize(); renderStrip();
          const first = orderedFrames()[0];
          if (S.sel && !hasSize(S.sel, S.sizeFilter) && first) await select(first.id);   // switch to a frame in their size
          else if (S.sel) showSel(S.sel);
          place();
          toast(`Your size: ${SIZE_LABEL[S.measure.size]}`);
        }
      }
    } catch { toast('Measurement is not available on this device. Pick your size below instead.'); }
    S.measuring = false; $('#measureBtn').disabled = false;
    S.following = null;                                   // let the tracking loop set the status again
    status(S.face ? `<span class="dot"></span>${S.mode === 'live' ? 'Following your face' : 'Fitted to your face'}` : S.mode === 'live' ? 'Looking for your face…' : S.mode === 'photo' ? 'Drag the frame into place' : 'Turn on the camera or upload a selfie');
  }

  /** Size card: measured result + size chips the customer can change. */
  function renderSize() {
    const m = S.measure;
    $('#sizeText').innerHTML = m
      ? (m.source === 'glasses'
        ? `From your glasses <b>${m.lens}□${m.bridge}</b> · frame width about <b>${m.face} mm</b>${m.pd ? ` · PD <b>${m.pd} mm</b>` : ''}<br>Your size: <b>${SIZE_LABEL[m.size]}</b> <span class="muted small">(${SIZE_RANGE[m.size]}) · exact</span>`
        : `Face width <b>${m.face} mm</b> · PD <b>${m.pd} mm</b><br>Your size: <b>${SIZE_LABEL[m.size]}</b> <span class="muted small">(${SIZE_RANGE[m.size]}) · camera estimate ±2 mm${m.photo ? ', from a photo' : ''}</span><br><span class="muted small">For an exact size, use the numbers from your current glasses below.</span>`)
      : 'Tap <b>Measure my size</b> (live camera, glasses off), or pick a size.';
    $('#sizeChips').innerHTML = ['', 'SMALL', 'MEDIUM', 'WIDE'].map((k) => `<button class="chip ${(S.sizeFilter || '') === k ? 'on' : ''}" data-size="${k}">${k ? SIZE_LABEL[k] + (m && m.size === k ? ' ✓' : '') : 'All sizes'}</button>`).join('');
  }
  const hasSize = (f, size) => !size || (f.variants || []).some((v) => v.size === size && (v.stock === undefined || v.stock > 0));
  function fitNote(f) {
    const m = S.measure; if (!m || !f.frameWidthMm) return '';
    const diff = f.frameWidthMm - m.face;
    return Math.abs(diff) <= 6 ? ' · <span style="color:var(--ok)">✓ Good fit for you</span>' : diff < 0 ? ' · Narrower than your face' : ' · Wider than your face';
  }

  // ---------- Manual adjust (drag / pinch / wheel) ----------
  const pointers = new Map(); let start = null;
  overlay.addEventListener('pointerdown', (e) => {
    overlay.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    start = { pose: { ...currentPose() }, pts: [...pointers.values()].map((p) => ({ ...p })) };
  });
  overlay.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId) || !start) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.values()], p = { ...start.pose };
    if (pts.length >= 2 && start.pts.length >= 2) {
      const d0 = Math.hypot(start.pts[0].x - start.pts[1].x, start.pts[0].y - start.pts[1].y);
      const d1 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      p.w = Math.max(40, start.pose.w * d1 / d0);
    } else { p.cx += pts[0].x - start.pts[0].x; p.cy += pts[0].y - start.pts[0].y; }
    S.manual = p; S.manualUntil = Date.now() + 3000; place();
  });
  const up = (e) => { pointers.delete(e.pointerId); start = pointers.size ? { pose: { ...currentPose() }, pts: [...pointers.values()] } : null; };
  overlay.addEventListener('pointerup', up); overlay.addEventListener('pointercancel', up);
  stage.addEventListener('wheel', (e) => {
    if (S.mode === 'none') return; e.preventDefault();
    const p = { ...currentPose() }; p.w = Math.max(40, p.w * (e.deltaY < 0 ? 1.05 : 0.95));
    S.manual = p; S.manualUntil = Date.now() + 3000; place();
  }, { passive: false });
  $('#auto').addEventListener('change', () => { if ($('#auto').checked) { S.manual = null; place(); } });

  // ---------- Capture ----------
  let lastShot = null, lastRaw = null;
  async function capture() {
    const W = stage.clientWidth, H = stage.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const c = document.createElement('canvas'); c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext('2d'); g.scale(dpr, dpr); g.fillStyle = '#10143a'; g.fillRect(0, 0, W, H);
    if (S.mode === 'live') {
      const vw = video.videoWidth, vh = video.videoHeight, k = Math.max(W / vw, H / vh);
      g.save(); g.translate(W, 0); g.scale(-1, 1); g.drawImage(video, (W - vw * k) / 2, (H - vh * k) / 2, vw * k, vh * k); g.restore();
    } else if (S.mode === 'photo') {
      const iw = photo.naturalWidth, ih = photo.naturalHeight, k = Math.min(W / iw, H / ih);
      g.drawImage(photo, (W - iw * k) / 2, (H - ih * k) / 2, iw * k, ih * k);
    }
    const p = currentPose(), h = p.w * overlay.naturalHeight / overlay.naturalWidth;
    g.save(); g.translate(p.cx, p.cy); g.rotate(p.rot); g.drawImage(overlay, -p.w / 2, -h / 2, p.w, h); g.restore();
    // small watermark
    g.fillStyle = 'rgba(4,7,34,.6)'; g.fillRect(W - 150, H - 30, 142, 22);
    g.fillStyle = '#fff'; g.font = '600 12px Quicksand, sans-serif'; g.fillText(`Lensio · ${S.sel ? S.sel.name : ''}`.slice(0, 26), W - 144, H - 15);
    lastShot = c.toDataURL('image/jpeg', 0.92);
    // The plain photo (no frame drawn on it), for "Use this photo for size & frames"
    lastRaw = null;
    if (S.mode === 'live' && video.videoWidth) {
      const r = document.createElement('canvas'); r.width = video.videoWidth; r.height = video.videoHeight;
      const rg = r.getContext('2d'); rg.translate(r.width, 0); rg.scale(-1, 1); rg.drawImage(video, 0, 0);
      lastRaw = r.toDataURL('image/jpeg', 0.95);
    } else if (S.mode === 'photo') lastRaw = photo.src;
    $('#useShotBtn').hidden = !lastRaw;
    $('#shotImg').src = lastShot; $('#shot').style.display = 'flex';
  }
  async function share() {
    if (inRN) { post({ type: 'capture', dataUrl: lastShot, name: S.sel?.name }); return; }   // app opens its share sheet
    try {
      const blob = await (await fetch(lastShot)).blob();
      const file = new File([blob], 'lensio-try-on.jpg', { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'My Lensio try-on' });
      else save();
    } catch { /* user closed the share sheet */ }
  }
  function save() {
    if (inRN) { post({ type: 'save', dataUrl: lastShot, name: S.sel?.name }); return; }          // app saves to the gallery
    const a = document.createElement('a'); a.href = lastShot; a.download = 'lensio-try-on.jpg'; document.body.appendChild(a); a.click(); a.remove();
    toast('Photo downloaded. On iPhone: press and hold the photo → Save to Photos.');
  }
  /** Uses the captured photo like an uploaded selfie: fits frames to it and measures the size. */
  async function useShot() {
    if (!lastRaw) return;
    $('#shot').style.display = 'none';
    const blob = await (await fetch(lastRaw)).blob();
    await useSelfie(new File([blob], 'lensio-photo.jpg', { type: 'image/jpeg' }));
    if (S.mode === 'photo') measure();
  }

  // ---------- Wiring ----------
  $('#camBtn').addEventListener('click', () => (S.stream ? stopCam() : startCam()));
  $('#selfieBtn').addEventListener('click', () => $('#selfieIn').click());
  $('#selfieIn').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; useSelfie(f); });
  $('#captureBtn').addEventListener('click', capture);
  $('#measureBtn').addEventListener('click', measure);
  $('#sizeChips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    S.sizeFilter = b.dataset.size || null; renderSize(); renderStrip();
    const first = orderedFrames()[0];
    if (S.sel && !hasSize(S.sel, S.sizeFilter) && first) select(first.id);
  });
  $('#shareBtn').addEventListener('click', share);
  $('#saveBtn').addEventListener('click', save);
  $('#useShotBtn').addEventListener('click', useShot);
  $('#exactBtn').addEventListener('click', () => { $('#exactBox').hidden = !$('#exactBox').hidden; });
  $('#exSave').addEventListener('click', exactFromGlasses);
  $('#closeShot').addEventListener('click', () => { $('#shot').style.display = 'none'; });
  $('#swatches').addEventListener('click', async (e) => {
    const b = e.target.closest('.sw'); if (!b || b.dataset.hex === S.color) return;
    S.color = b.dataset.hex; try { await showOverlay(); } catch { /* keep previous colour */ }
  });
  $('#strip').addEventListener('click', (e) => { const b = e.target.closest('.fr'); if (b) select(b.dataset.id); });
  $('#viewBtn').addEventListener('click', () => {
    if (!S.sel) return;
    const size = S.sizeFilter && hasSize(S.sel, S.sizeFilter) ? S.sizeFilter : '';
    if (EMBED) post({ type: 'open', slug: S.sel.slug, size }); else location.href = `/product/${S.sel.slug}${size ? `?size=${size}` : ''}`;
  });
  $('#back').addEventListener('click', () => { if (EMBED) post({ type: 'close' }); else if (history.length > 1) history.back(); else location.href = '/'; });
  if (EMBED) $('#back').hidden = true;  // the app has its own navigation
  // Phones resize the page constantly (address bar, rotation): re-map the last detected face to the new size.
  window.addEventListener('resize', () => {
    const raw = S.raw; S.face = null; S.manual = null;
    if (raw && S.mode !== 'none') setFace(raw);
    place();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopCam(); });

  try { const m = JSON.parse(localStorage.getItem('lensio.measure') || 'null'); if (m && m.face && Date.now() - m.at < 180 * 86400000) { S.measure = m; S.sizeFilter = m.size; } } catch { /* ignore */ }
  renderSize();
  status('Turn on the camera or upload a selfie');
  loadFrames().catch(() => { $('#strip').innerHTML = '<p class="muted small">Could not load frames. Check your connection.</p>'; });
  if (window.faceapi) models().catch(() => {}); // warm up in the background
})();
