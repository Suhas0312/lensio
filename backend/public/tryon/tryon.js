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
  window.__lensioTryon = S; window.__lensioTryonReport = (shape, measure) => { if (measure) S.measure = measure; if (shape) S.shape = shape; showReport(); }; // for diagnostics

  // ---------- Face shape → frame suggestions (styling guidance, not a measurement) ----------
  const SUIT = {
    round: { label: 'Round', tip: 'Angular frames add definition.', shapes: ['RECTANGLE', 'SQUARE', 'WAYFARER', 'GEOMETRIC'] },
    square: { label: 'Square', tip: 'Curved frames soften strong angles.', shapes: ['ROUND', 'OVAL', 'CAT_EYE', 'AVIATOR'] },
    oval: { label: 'Oval', tip: 'Balanced proportions suit most styles.', shapes: ['WAYFARER', 'AVIATOR', 'RECTANGLE', 'SQUARE', 'ROUND'] },
    heart: { label: 'Heart', tip: 'Bottom-heavy or rounded frames balance a wider forehead.', shapes: ['AVIATOR', 'ROUND', 'OVAL', 'RECTANGLE'] },
    long: { label: 'Long', tip: 'Deeper, bolder frames shorten the face visually.', shapes: ['SQUARE', 'WAYFARER', 'AVIATOR', 'GEOMETRIC'] },
  };
  /** Face shape from the 3D scan proportions (more reliable than the 68-point live estimate). */
  function classifyMesh(m) {
    if (m.ratio >= 1.48) return 'long';
    if (m.brow / m.jaw > 1.28) return 'heart';
    if (m.ratio < 1.25) return m.jaw > 0.82 ? 'square' : 'round';
    return 'oval';
  }
  const AVOID = {
    round: { shapes: ['ROUND', 'OVAL'], why: 'Very round frames repeat the curves of your face.' },
    square: { shapes: ['SQUARE', 'RECTANGLE', 'GEOMETRIC'], why: 'Sharp, boxy frames make a strong jaw look heavier.' },
    oval: { shapes: [], why: 'Almost every shape suits you. Keep the frame about as wide as your face.' },
    heart: { shapes: ['CAT_EYE', 'GEOMETRIC'], why: 'Top-heavy, upswept frames widen the forehead further.' },
    long: { shapes: ['OVAL'], why: 'Small, narrow frames make the face look longer.' },
  };
  const WHY = {
    round: 'Straight lines and corners add structure to soft, round features.',
    square: 'Curves and rounded edges soften a strong jaw and forehead.',
    oval: 'Balanced proportions: you can wear bold or subtle styles.',
    heart: 'Frames wider at the bottom, or rounded, balance a wider forehead and narrow chin.',
    long: 'Deep, bold frames with a strong top line make the face look shorter and more balanced.',
  };
  const SHAPE_NAME = { RECTANGLE: 'Rectangle', ROUND: 'Round', CAT_EYE: 'Cat-eye', AVIATOR: 'Aviator', WAYFARER: 'Wayfarer', SQUARE: 'Square', OVAL: 'Oval', GEOMETRIC: 'Geometric' };

  /** AI face scan report: shape, size, PD, best and avoid shapes with reasons, and frames that suit + fit. */
  function showReport() {
    const m = S.measure, sh = S.shape, box = $('#report');
    if (!box || !m || !sh) return;
    const best = SUIT[sh].shapes, avoid = AVOID[sh];
    const score = (f) => (best.includes(f.shape) ? 3 : 0) + (hasSize(f, m.size) ? 3 : 0) - (avoid.shapes.includes(f.shape) ? 4 : 0) + (f.rating || 0) / 5;
    const picks = [...S.frames].sort((a, b) => score(b) - score(a)).filter((f) => score(f) > 0).slice(0, 6);
    const esc = (t) => String(t).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
    box.innerHTML = `
      <div class="muted small">✨ Your AI face scan</div>
      <div class="rgrid">
        <div><span class="muted small">Face shape</span><b>${SUIT[sh].label}</b></div>
        <div><span class="muted small">Face width</span><b>${m.face} mm</b></div>
        <div><span class="muted small">PD</span><b>${m.pd ? m.pd + ' mm' : '—'}</b></div>
        <div><span class="muted small">Frame size</span><b>${SIZE_LABEL[m.size]}</b></div>
      </div>
      <p class="small" style="margin:8px 0 4px"><b>Best for you:</b> ${best.map((s) => `<span class="tag ok">${SHAPE_NAME[s]}</span>`).join(' ')}</p>
      <p class="muted small" style="margin:0 0 6px">${WHY[sh]}</p>
      ${avoid.shapes.length ? `<p class="small" style="margin:6px 0 4px"><b>Go easy on:</b> ${avoid.shapes.map((s) => `<span class="tag no">${SHAPE_NAME[s]}</span>`).join(' ')}</p>` : ''}
      <p class="muted small" style="margin:0 0 8px">${avoid.why}</p>
      ${picks.length ? `<div class="muted small" style="margin-top:6px">Recommended for you (suits your shape and fits your size)</div>
      <div class="picks">${picks.map((f) => `<button class="pick" data-id="${esc(f.id)}"><img src="${esc(thumbOf(f))}" alt=""><span>${esc(f.name)}</span><small>${inr(f.basePrice)}${best.includes(f.shape) ? ' · suits you' : ''}</small></button>`).join('')}</div>` : ''}
      <p class="muted small" style="margin:8px 0 0">Shape advice is a styling guide. Size is a camera estimate (±2 mm); for an exact size use the numbers on your current glasses.</p>`;
    box.hidden = false;
    renderStrip();
    try { localStorage.setItem('lensio.scan', JSON.stringify({ shape: sh, at: Date.now() })); } catch { /* private mode */ }
    if (S.voice) speak(`Your face shape is ${SUIT[sh].label}. Best frames for you: ${best.slice(0, 2).map((s) => SHAPE_NAME[s]).join(' and ')}.`, true);
  }

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
    // Opened from a product page with a colour: show that colour on the face straight away.
    const want = (qs.get('color') || '').replace('#', '').toLowerCase();
    if (want && pick.slug === qs.get('frame')) {
      const c = colorsOf(pick).find((x) => x.hex.replace('#', '').toLowerCase() === want);
      if (c && c.hex !== S.color) { S.color = c.hex; try { await showOverlay(); } catch { /* keep the default colour */ } }
    }
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
    S.tried = [f.id, ...(S.tried || []).filter((x) => x !== f.id)].slice(0, 4);   // "Compare 4 frames" shows these first
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
    const g = guide(lm, W, H);
    if (g) return { why: g, lm };
    const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H }), d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    // Horizontal iris width only: eyelids cover the top and bottom of the iris, which made vertical readings
    // too small and every size too big.
    const irisA = d(P(469), P(471)), irisB = d(P(474), P(476));
    const iris = (irisA + irisB) / 2;
    if (iris < (S.mode === 'photo' ? 12 : 14)) return { why: 'far', lm };       // need enough pixels for ~1 mm
    const l = P(234), rt = P(454), nose = P(1), w = d(l, rt);
    if (Math.abs(irisA - irisB) / iris > 0.10) return { why: 'turned', lm };
    const mm = IRIS_MM / iris;
    // Face-shape proportions from the 3D mesh: length (forehead 10 → chin 152), cheekbones (234–454),
    // jaw (172–397) and forehead/brow width (54–284).
    const shape = { ratio: d(P(10), P(152)) / w, jaw: d(P(172), P(397)) / w, brow: d(P(54), P(284)) / w };
    return { pd: d(P(468), P(473)) * mm, face: w * mm, lm, shape };
  }
  /**
   * AI face alignment: head pose from the 3D face mesh (MediaPipe gives depth per point).
   * Returns what the customer should do, or null when the face is straight, level and close enough.
   */
  function guide(lm, W, H) {
    const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H, z: lm[i].z * W });
    const l = P(234), r = P(454), nose = P(1), chin = P(152), brow = P(10), eL = P(33), eR = P(263);
    const faceW = Math.hypot(r.x - l.x, r.y - l.y);
    if (faceW < W * 0.22) return 'far';
    if (faceW > W * 0.78) return 'near';
    if (Math.abs(nose.x / W - 0.5) > 0.22 || Math.abs(nose.y / H - 0.47) > 0.25) return 'center';
    const roll = Math.atan2(eR.y - eL.y, eR.x - eL.x);
    if (Math.abs(roll) > 0.06) return 'tilt';
    // yaw: depth difference between the two cheeks (3D), backed up by where the nose sits
    const yaw = (r.z - l.z) / faceW, off = (nose.x - (l.x + r.x) / 2) / faceW;
    if (yaw > 0.12 || off > 0.05) return 'right';   // camera image: nose to the right = turned to their left
    if (yaw < -0.12 || off < -0.05) return 'left';
    // pitch: nose position between forehead and chin
    const pitch = (nose.y - brow.y) / (chin.y - brow.y);
    if (pitch < 0.47) return 'down';                    // looking up → lower the chin
    if (pitch > 0.63) return 'up';
    return null;
  }
  const SAY = {
    noface: 'Look at the camera, please.', far: 'Come a little closer.', near: 'Move back a little.',
    tilt: 'Keep your head level.', left: 'Turn slightly to your left.', right: 'Turn slightly to your right.',
    down: 'Lower your chin a little.', up: 'Raise your chin a little.', turned: 'Look straight at the camera.',
    hold: 'Perfect. Hold still.', center: 'Move your face into the circle.',
  };
  const ARROW = { left: '⬅', right: '➡', up: '⬆', down: '⬇', far: '⤢', near: '⤡', tilt: '⟲', center: '◎' };
  let lastSaid = '', lastSaidAt = 0;
  /** Speaks a short instruction (app: phone's voice; browser: built-in voice). Never repeats too often. */
  function speak(text, force) {
    if (!S.voice || !text) return;
    const now = Date.now();
    if (!force && (now - lastSaidAt < 2600 || (text === lastSaid && now - lastSaidAt < 6000))) return;
    lastSaid = text; lastSaidAt = now;
    if (inRN) { post({ type: 'speak', text }); return; }
    try {
      const u = new SpeechSynthesisUtterance(text); u.lang = 'en-IN'; u.rate = 1.02;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch { /* no voice in this browser */ }
  }
  // Face-scan overlay: oval guide, mesh points, progress ring.
  const hud = document.createElement('canvas'); hud.className = 'hud'; stage.appendChild(hud);
  function drawHud(lm, W, H, ok, progress, hint) {
    const sw = stage.clientWidth, sh = stage.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (hud.width !== sw * dpr) { hud.width = sw * dpr; hud.height = sh * dpr; }
    const g = hud.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, sw, sh);
    const col = ok ? '#22e3a0' : '#f5b84b';
    // oval target
    g.save(); g.strokeStyle = col; g.lineWidth = 3; g.setLineDash([10, 8]);
    g.beginPath(); g.ellipse(sw / 2, sh * 0.45, sw * 0.27, sh * 0.33, 0, 0, Math.PI * 2); g.stroke(); g.restore();
    if (lm) {
      g.fillStyle = col;
      for (let i = 0; i < 468; i += 3) { const p = mapPoint({ x: lm[i].x * W, y: lm[i].y * H }); g.globalAlpha = 0.55; g.fillRect(p.x - 1, p.y - 1, 2, 2); }
      g.globalAlpha = 1;
      for (const i of [468, 473]) { const p = mapPoint({ x: lm[i].x * W, y: lm[i].y * H }); g.strokeStyle = '#22d3ee'; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, 6, 0, Math.PI * 2); g.stroke(); }
      // scanning line
      const t = (Date.now() % 1600) / 1600, y = sh * (0.12 + 0.66 * t);
      const grd = g.createLinearGradient(0, y - 18, 0, y + 2); grd.addColorStop(0, 'rgba(34,211,238,0)'); grd.addColorStop(1, 'rgba(34,211,238,.55)');
      g.fillStyle = grd; g.fillRect(sw * 0.2, y - 18, sw * 0.6, 20);
    }
    // progress ring
    g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,.15)'; g.beginPath(); g.arc(sw - 38, 38, 22, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#7c3aed'; g.beginPath(); g.arc(sw - 38, 38, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress); g.stroke();
    g.fillStyle = '#fff'; g.font = '700 12px Quicksand, system-ui'; g.textAlign = 'center'; g.fillText(`${Math.round(progress * 100)}%`, sw - 38, 42);
    if (hint && ARROW[hint]) { g.font = '700 54px system-ui'; g.fillStyle = col; g.fillText(ARROW[hint], sw / 2, sh * 0.88); }
    g.textAlign = 'start';
  }
  const clearHud = () => { const g = hud.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, hud.width, hud.height); };

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
        drawHud(r.lm, photo.naturalWidth, photo.naturalHeight, !!r.pd, r.pd ? 1 : 0, r.why);
        if (r.pd) samples.push(r); else { toast(r.why === 'far' ? 'Use a closer, sharper photo.' : `${SAY[r.why] || 'Use a front-facing photo'} Use a photo facing the camera, eyes open, no glasses.`); }
        setTimeout(clearHud, 2500);
      } else {
        const NEED = 40, until = Date.now() + 30000; let last = '', wasOk = false;
        speak('Take off your glasses and look straight at the camera.', true);
        while (samples.length < NEED && Date.now() < until && S.mode === 'live') {
          const vw = video.videoWidth, vh = video.videoHeight;
          const r = sampleFrom(await meshOnce(fm, video), vw, vh);
          const ok = !!r.pd;
          if (ok) samples.push(r); else { last = r.why; if (r.why !== 'turned' || samples.length < 5) samples.length = Math.max(0, samples.length - 2); }
          drawHud(r.lm, vw, vh, ok, samples.length / NEED, ok ? null : r.why);
          if (ok && !wasOk) speak(SAY.hold); else if (!ok) speak(SAY[r.why]);
          wasOk = ok;
          st(ok ? `Scanning… hold still ${Math.round(samples.length / NEED * 100)}%` : `${SAY[last] || 'Measuring…'}`);
          await new Promise((res) => setTimeout(res, 50));
        }
        clearHud();
        if (samples.length < 16) { toast('Could not measure. Remove your glasses, face the camera in good light, and try again.'); samples.length = 0; }
        else if (spread(samples.map((s) => s.pd)) > 2.5) { toast('You moved a little. Keep still and tap Measure again for an exact reading.'); samples.length = 0; }
      }
      if (samples.length >= (S.mode === 'photo' ? 1 : 8)) {
        const face = trimmed(samples.map((s) => s.face)), pd = trimmed(samples.map((s) => s.pd));
        if (pd < 50 || pd > 78 || face < 110 || face > 170) toast('That measurement looks off. Try again in better light, facing the camera.');
        else {
          applyMeasure({ face: Math.round(face), pd: Math.round(pd), size: sizeFor(face), photo: S.mode === 'photo', source: 'camera' });
          const avg = (k) => trimmed(samples.map((s) => s.shape[k]));
          const shape = classifyMesh({ ratio: avg('ratio'), jaw: avg('jaw'), brow: avg('brow') });
          S.shape = shape;
          $('#shapeText').innerHTML = `Your face looks <b>${SUIT[shape].label.toLowerCase()}</b> (3D scan). ${SUIT[shape].tip} Frames marked <b>Suits you</b> are shown first.`;
          showReport();
          speak(`Done. Your size is ${SIZE_LABEL[S.measure.size]}. P D ${Math.round(pd)} millimetres.`, true);
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
        : !m.face
          ? `PD <b>${m.pd} mm</b> <span class="muted small">(card method, ±1 mm)</span><br><span class="muted small">Run ✨ AI face scan or enter your glasses numbers for your frame size.</span>`
          : `Face width <b>${m.face} mm</b> · PD <b>${m.pd} mm</b>${m.pdSource === 'card' ? ' <span class="muted small">(card, ±1 mm)</span>' : ''}<br>Your size: <b>${SIZE_LABEL[m.size]}</b> <span class="muted small">(${SIZE_RANGE[m.size]}) · camera estimate ±2 mm${m.photo ? ', from a photo' : ''}</span><br><span class="muted small">For an exact size, use the numbers from your current glasses below.</span>`)
      : 'Tap <b>✨ AI face scan</b> (live camera, glasses off) for your face shape and size, or pick a size.';
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
  /** The photo (or live camera frame) without any glasses, as a canvas the size of the picture area. */
  function backgroundCanvas() {
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
    return { c, W, H, dpr };
  }
  /** "Compare 4 frames": the same photo wearing the current frame and the next three in the list, labelled. */
  async function compareShot() {
    if (!lastBase || !S.sel) return null;
    const tried = (S.tried || []).map((id) => S.frames.find((x) => x.id === id)).filter((f) => f && f !== S.sel);
    const frames = [S.sel, ...tried, ...orderedFrames().filter((f) => f !== S.sel && !tried.includes(f))].slice(0, 4);
    const { c: base, W, H } = lastBase, pose = lastPose;
    const tileW = W, tileH = H, out = document.createElement('canvas');
    const cols = frames.length > 1 ? 2 : 1, rows = Math.ceil(frames.length / cols), label = 34;
    out.width = cols * tileW; out.height = rows * (tileH + label);
    const g = out.getContext('2d'); g.fillStyle = '#040722'; g.fillRect(0, 0, out.width, out.height);
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i], x = (i % cols) * tileW, y = Math.floor(i / cols) * (tileH + label);
      g.drawImage(base, x, y, tileW, tileH);
      try {
        const img = new Image(); img.src = await frameOverlay(f, f === S.sel ? S.color : colorsOf(f)[0].hex); await img.decode();
        const w = pose.w * ((f.frameWidthMm || 136) / ((S.sel.frameWidthMm) || 136)), h = w * img.naturalHeight / img.naturalWidth;
        g.save(); g.translate(x + pose.cx, y + pose.cy); g.rotate(pose.rot); g.drawImage(img, -w / 2, -h / 2, w, h); g.restore();
      } catch { /* frame picture unavailable: tile shows the photo only */ }
      g.fillStyle = i === 0 ? '#7c3aed' : '#10143a'; g.fillRect(x, y + tileH, tileW, label);
      g.fillStyle = '#fff'; g.font = '700 14px Quicksand, system-ui, sans-serif';
      g.fillText(`${i + 1}. ${f.name}`.slice(0, 30), x + 10, y + tileH + 22);
      g.font = '600 13px Quicksand, system-ui, sans-serif'; const pr = inr(f.basePrice); g.fillText(pr, x + tileW - 10 - g.measureText(pr).width, y + tileH + 22);
    }
    g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '600 12px Quicksand, sans-serif'; g.fillText('Lensio · compare frames', 10, 16);
    return out.toDataURL('image/jpeg', 0.9);
  }
  let lastBase = null, lastPose = null, singleShot = null;
  async function capture() {
    lastBase = backgroundCanvas(); lastPose = currentPose();
    const { W, H, dpr } = lastBase;
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
    lastShot = singleShot = c.toDataURL('image/jpeg', 0.92);
    $('#cmpBtn').textContent = '🔲 Compare 4 frames'; $('#cmpBtn').dataset.on = '';
    $('#cmpBtn').hidden = orderedFrames().length < 2;
    // The plain photo (no frame drawn on it), for "Use this photo for size & frames"
    lastRaw = null;
    if (S.mode === 'live' && video.videoWidth) {
      const r = document.createElement('canvas'); r.width = video.videoWidth; r.height = video.videoHeight;
      const rg = r.getContext('2d'); rg.translate(r.width, 0); rg.scale(-1, 1); rg.drawImage(video, 0, 0);
      lastRaw = r.toDataURL('image/jpeg', 0.95);
    } else if (S.mode === 'photo') lastRaw = photo.src;
    $('#useShotBtn').hidden = !lastRaw;
    $('#shotImg').src = lastShot; $('#shot').style.display = 'flex';
    // Show the 4-frame comparison straight away (one tap on the button switches back to one frame).
    const cb = $('#cmpBtn'); cb.dataset.on = ''; cb.textContent = '🔲 Compare 4 frames';
    if (S.frames.length > 1) cb.click();
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
  // In the Android app, the app's own picker offers Gallery and Files; in browsers the phone's picker does.
  $('#selfieBtn').addEventListener('click', () => (inRN && window.__lensioNativePicker ? post({ type: 'pickPhoto' }) : $('#selfieIn').click()));
  window.__lensioUsePhoto = (dataUrl) => {
    try {
      const [head, b64] = String(dataUrl).split(',');
      const type = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
      const bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      useSelfie(new File([bytes], 'photo.jpg', { type }));
    } catch { toast('Could not open that photo. Try another one.'); }
  };
  $('#selfieIn').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; useSelfie(f); });
  // Computers: drop a photo onto the picture area.
  stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('drop'); });
  stage.addEventListener('dragleave', () => stage.classList.remove('drop'));
  stage.addEventListener('drop', (e) => { e.preventDefault(); stage.classList.remove('drop'); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) useSelfie(f); });
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
  $('#cmpBtn').addEventListener('click', async () => {
    const b = $('#cmpBtn');
    if (b.dataset.on) { lastShot = singleShot; b.dataset.on = ''; b.textContent = '🔲 Compare 4 frames'; }
    else {
      b.disabled = true; b.textContent = 'Making comparison…';
      const url = await compareShot(); b.disabled = false;
      if (!url) { b.textContent = '🔲 Compare 4 frames'; return; }
      lastShot = url; b.dataset.on = '1'; b.textContent = '👓 Show one frame';
    }
    $('#shotImg').src = lastShot;
  });
  $('#report').addEventListener('click', (e) => { const b = e.target.closest('.pick'); if (b) { select(b.dataset.id); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
  // ---------- Precise PD with a card (ISO/IEC 7810 ID-1 card: 85.60 mm wide) ----------
  const CARD_MM = 85.6;
  const pd = { img: null, L: null, R: null, x1: 0, x2: 0, drag: null, scale: 1 };
  window.__lensioPd = pd; // for diagnostics
  function pdOpen() { $('#pdTool').hidden = false; $('#pdStep1').hidden = false; $('#pdStep2').hidden = true; speak('Hold a bank card flat against your forehead, just above your eyebrows. Look straight at the camera.', true); }
  function pdClose() { $('#pdTool').hidden = true; }
  async function pdShoot() {
    if (S.mode !== 'live') { await startCam(); await new Promise((r) => setTimeout(r, 900)); }
    if (S.mode !== 'live' || !video.videoWidth) { toast('Turn on the camera, or use a photo from your gallery.'); return; }
    pdClose();
    for (const n of [3, 2, 1]) { status(`💳 Hold the card on your forehead… ${n}`); speak(String(n), true); await new Promise((r) => setTimeout(r, 900)); }
    const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);                      // not mirrored: true geometry
    status('<span class="dot"></span>Photo taken');
    await pdAnalyse(c.toDataURL('image/jpeg', 0.95));
  }
  async function pdAnalyse(url) {
    const img = new Image(); img.src = url; await img.decode();
    $('#pdTool').hidden = false; $('#pdStep1').hidden = true; $('#pdStep2').hidden = false;
    $('#pdResult').textContent = 'Finding your pupils…';
    const W = img.naturalWidth, H = img.naturalHeight;
    let L = null, R = null, irisPx = null;
    try {
      const fm = await mesh(); const res = await meshOnce(fm, img);
      const lm = res && res.multiFaceLandmarks && res.multiFaceLandmarks[0];
      if (lm && lm.length > 473) {
        L = { x: lm[468].x * W, y: lm[468].y * H }; R = { x: lm[473].x * W, y: lm[473].y * H };
        irisPx = (Math.hypot((lm[469].x - lm[471].x) * W, (lm[469].y - lm[471].y) * H) + Math.hypot((lm[474].x - lm[476].x) * W, (lm[474].y - lm[476].y) * H)) / 2;
      }
    } catch { /* manual placement below */ }
    if (!L) { L = { x: W * 0.4, y: H * 0.45 }; R = { x: W * 0.6, y: H * 0.45 }; toast('Could not find your eyes automatically: drag the blue dots onto your pupils.'); }
    // first guess for the card edges: card ≈ 85.6 mm, iris ≈ 11.7 mm
    const cx = (L.x + R.x) / 2, half = irisPx ? (CARD_MM / 11.7) * irisPx / 2 : Math.abs(R.x - L.x) * 0.68;
    Object.assign(pd, { img, L, R, x1: cx - half, x2: cx + half, drag: null });
    pdDraw();
  }
  function pdDraw() {
    const cv = $('#pdCanvas'), img = pd.img; if (!img) return;
    cv.width = img.naturalWidth; cv.height = img.naturalHeight; pd.scale = img.naturalWidth / (cv.clientWidth || img.naturalWidth);
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
    const lw = Math.max(2, cv.width / 400);
    g.strokeStyle = '#f43f5e'; g.lineWidth = lw * 1.5;
    for (const x of [pd.x1, pd.x2]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, cv.height); g.stroke(); g.fillStyle = '#f43f5e'; g.fillRect(x - lw * 6, cv.height / 2 - lw * 18, lw * 12, lw * 36); }
    g.fillStyle = '#22d3ee'; g.strokeStyle = '#fff'; g.lineWidth = lw;
    for (const p of [pd.L, pd.R]) { g.beginPath(); g.arc(p.x, p.y, lw * 4, 0, 7); g.fill(); g.stroke(); }
    g.strokeStyle = '#22d3ee'; g.setLineDash([lw * 4, lw * 3]); g.beginPath(); g.moveTo(pd.L.x, pd.L.y); g.lineTo(pd.R.x, pd.R.y); g.stroke(); g.setLineDash([]);
    const cardPx = Math.abs(pd.x2 - pd.x1), eyePx = Math.hypot(pd.R.x - pd.L.x, pd.R.y - pd.L.y);
    const value = cardPx > 20 ? eyePx * CARD_MM / cardPx : null;
    pd.value = value && value > 40 && value < 85 ? Math.round(value * 2) / 2 : null;   // to the nearest 0.5 mm
    $('#pdResult').innerHTML = pd.value ? `Your PD: <b style="font-size:20px">${pd.value} mm</b> <span class="muted small">(card method, typically ±1 mm when the lines sit on the card edges)</span>`
      : 'Move the red lines onto the card edges.';
  }
  function pdLoupe(px, py) {
    const lo = $('#pdLoupe'), g = lo.getContext('2d'), z = 3, r = 75 / z;
    lo.style.display = 'block'; g.clearRect(0, 0, 150, 150);
    g.drawImage($('#pdCanvas'), px - r, py - r, r * 2, r * 2, 0, 0, 150, 150);
    g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(75, 60); g.lineTo(75, 90); g.moveTo(60, 75); g.lineTo(90, 75); g.stroke();
  }
  function pdPointer(e) {
    const cv = $('#pdCanvas'), rect = cv.getBoundingClientRect(), k = cv.width / rect.width;
    const x = (e.clientX - rect.left) * k, y = (e.clientY - rect.top) * k;
    if (e.type === 'pointerdown') {
      const near = (p) => Math.hypot(p.x - x, p.y - y) < 30 * k;
      pd.drag = near(pd.L) ? 'L' : near(pd.R) ? 'R' : Math.abs(x - pd.x1) < Math.abs(x - pd.x2) ? 'x1' : 'x2';
      cv.setPointerCapture(e.pointerId);
    }
    if (!pd.drag) return;
    if (pd.drag === 'L' || pd.drag === 'R') pd[pd.drag] = { x, y }; else pd[pd.drag] = x;
    pdDraw(); pdLoupe(x, y);
    if (e.type === 'pointerup' || e.type === 'pointercancel') { pd.drag = null; $('#pdLoupe').style.display = 'none'; }
  }
  function pdUse() {
    if (!pd.value) { toast('Line up the red lines with the card edges first.'); return; }
    const m = S.measure || { face: null, size: null, source: 'card' };
    applyMeasure({ ...m, pd: pd.value, pdSource: 'card', size: m.size || S.sizeFilter || null });
    pdClose(); renderSize(); place();
    toast(`PD saved: ${pd.value} mm`); speak(`Your PD is ${pd.value} millimetres.`, true);
  }
  $('#cardPdBtn').addEventListener('click', pdOpen);
  $('#pdClose').addEventListener('click', pdClose);
  $('#pdShoot').addEventListener('click', pdShoot);
  $('#pdPick').addEventListener('click', () => $('#pdFile').click());
  $('#pdFile').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) pdAnalyse(URL.createObjectURL(f)); e.target.value = ''; });
  $('#pdRetake').addEventListener('click', () => { $('#pdStep1').hidden = false; $('#pdStep2').hidden = true; });
  $('#pdUse').addEventListener('click', pdUse);
  for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) $('#pdCanvas').addEventListener(ev, pdPointer);

  $('#exactBtn').addEventListener('click', () => { $('#exactBox').hidden = !$('#exactBox').hidden; });
  $('#exSave').addEventListener('click', exactFromGlasses);
  S.voice = true;
  $('#voiceChk').addEventListener('change', () => { S.voice = $('#voiceChk').checked; if (!S.voice) { try { speechSynthesis.cancel(); } catch { /* none */ } } });
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
  // ← stays visible inside the app and website too: the Try on screen has no other back button.
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
