/* Lensio admin panel. Served by the API at /admin; talks to /v1/admin/*.
 * No inline handlers (the API's CSP forbids them): all actions use data-act attributes. */
(() => {
  'use strict';
  const API = '/v1';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = (p) => '₹' + (p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const tc = (s) => String(s).toLowerCase().split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  const when = (d) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  const SHAPES = ['RECTANGLE', 'ROUND', 'CAT_EYE', 'AVIATOR', 'WAYFARER', 'SQUARE', 'OVAL', 'GEOMETRIC'];
  const MATERIALS = ['ACETATE', 'METAL', 'TITANIUM', 'TR90', 'MIXED'];
  const GENDERS = ['UNISEX', 'MEN', 'WOMEN', 'KIDS'];
  const SIZES = ['SMALL', 'MEDIUM', 'WIDE'];
  const STATUS = ['PAYMENT_PENDING', 'PLACED', 'PRESCRIPTION_VERIFIED', 'LENS_CUTTING_FITTING', 'QUALITY_CHECK', 'DISPATCHED', 'DELIVERED', 'CANCELLED'];
  const NEXT = {
    PLACED: ['PRESCRIPTION_VERIFIED', 'LENS_CUTTING_FITTING', 'CANCELLED'], PRESCRIPTION_VERIFIED: ['LENS_CUTTING_FITTING', 'CANCELLED'],
    LENS_CUTTING_FITTING: ['QUALITY_CHECK'], QUALITY_CHECK: ['DISPATCHED', 'LENS_CUTTING_FITTING'], DISPATCHED: ['DELIVERED'],
  };
  const sizeFor = (w) => (w < 132 ? 'SMALL' : w <= 140 ? 'MEDIUM' : 'WIDE');
  const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

  const S = { token: localStorage.getItem('lensio.admin.token'), user: null, view: 'products', data: {}, edit: null, login: { step: 'password' }, alerts: { list: [], unseen: 0, since: Date.now() } };

  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2800); }

  async function api(path, opts = {}) {
    const headers = {};
    if (S.token) headers.Authorization = 'Bearer ' + S.token;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(API + path, { method: opts.method || (opts.body !== undefined || opts.form ? 'POST' : 'GET'), headers, body: opts.form || (opts.body !== undefined ? JSON.stringify(opts.body) : undefined) });
    if (r.status === 204) return null;
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { logout(); throw new Error('Your session expired. Sign in again.'); }
    if (!r.ok) {
      const e = new Error(j?.error?.message || 'Request failed'); e.details = j?.error?.details;
      const fe = j?.error?.details?.fieldErrors; const fo = j?.error?.details?.formErrors;
      if (fe && Object.keys(fe).length) e.message += ': ' + Object.entries(fe).map(([k, v]) => `${k} — ${v[0]}`).join('; ');
      else if (fo && fo.length) e.message += ': ' + fo.join('; ');
      throw e;
    }
    return j;
  }
  function finishLogin(r) {
    if (!['ADMIN', 'OPTICIAN'].includes(r.user.role)) {
      S.login.err = 'This email is not an admin. Add it to ADMIN_EMAILS in Render → Environment, wait for the restart, then sign in again.'; return render();
    }
    S.token = r.token; S.user = r.user; localStorage.setItem('lensio.admin.token', r.token); S.login = { step: 'password' };
    if (location.hash.includes('order=')) return openFromHash();
    return load('products');
  }
  function logout() { S.token = null; S.user = null; localStorage.removeItem('lensio.admin.token'); render(); }

  // ---------------- Views ----------------
  function shell(inner) {
    const tabs = [['products', 'Frames'], ['pricing', 'Lens prices'], ['orders', 'Orders'], ['rx', 'Prescriptions'], ['reviews', 'Reviews'], ['rewards', 'Rewards'], ['stores', 'Stores'], ['eyetest', 'Eye tests'], ['settings', 'Settings']];
    return `<header><img src="wordmark.png" alt="Lensio"><nav>${tabs.map(([k, l]) => `<button data-act="nav" data-v="${k}" class="${S.view === k ? 'on' : ''}">${l}</button>`).join('')}</nav>
      <button class="link" data-act="alertsOpen" style="color:#fff;font-size:15px" aria-label="Alerts">🔔${S.alerts.unseen ? ` <span class="pill bad" style="background:#FF5C7A;color:#fff">${S.alerts.unseen}</span>` : ''}</button>
      <span class="who">${esc(S.user.email || (S.user.phone ? '+91 ' + S.user.phone : ''))} · ${tc(S.user.role)} · v2.0</span><button class="link" style="color:#A3A8D2" data-act="logout">Sign out</button></header><main>${inner}</main>`;
  }

  function loginView() {
    const L = S.login;
    const email = `<label>Admin email<input id="lemail" type="email" autocomplete="username" placeholder="you@example.com" value="${esc(L.email || '')}"></label>`;
    let body;
    if (L.step === 'password') body = `${email}
      <label>Password<input id="lpass" type="password" autocomplete="current-password"></label>
      <button class="btn p" data-act="loginPassword">Sign in</button>
      <button class="link" data-act="loginToCode">Forgot password, or first time? Email me a code</button>`;
    else if (L.step === 'codeEmail') body = `${email}
      <button class="btn p" data-act="sendCode">Email me a code</button>
      <button class="link" data-act="loginToPassword">Sign in with password instead</button>`;
    else body = `<p>We emailed a 6-digit code to <b>${esc(L.email)}</b>. Check spam if it's not in your inbox.</p>
      <label>Code<input id="lcode" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="6-digit code"></label>
      <label>Set a password (optional)<input id="lnewpass" type="password" autocomplete="new-password" placeholder="At least 8 characters"></label>
      <button class="btn p" data-act="verifyCode">Sign in</button>
      <button class="link" data-act="loginToCode">Use a different email</button>`;
    return `<div class="login"><div class="logo"><img src="wordmark.png" alt="Lensio" style="height:40px"></div><h1>Admin sign in</h1>${body}
      <p class="muted small">Only emails listed in ADMIN_EMAILS on the server can open the admin panel.</p>
      <div class="err" id="lerr">${esc(L.err || '')}</div></div>`;
  }

  // Products list
  function productsView() {
    const list = S.data.products;
    if (!list) return shell('<p class="muted">Loading frames…</p>');
    const rows = list.map((p) => {
      const stock = p.variants.reduce((s, v) => s + v.stock, 0);
      return `<tr class="click" data-act="editProduct" data-id="${p.id}">
        <td>${p.images[0] ? `<img class="thumb" src="${esc(p.images[0].url)}" alt="">` : '<div class="thumb"></div>'}</td>
        <td><b>${esc(p.name)}</b><div class="small muted">${tc(p.shape)} · ${tc(p.material)}${p.isSunglasses ? ' · Sunglasses' : ''}</div></td>
        <td>${inr(p.basePrice)}<div class="small muted" style="text-decoration:line-through">${inr(p.mrp)}</div></td>
        <td>${p.variants.length} colour${p.variants.length > 1 ? 's' : ''}</td>
        <td><span class="pill ${stock === 0 ? 'bad' : stock <= 5 ? 'warn' : 'ok'}">${stock} in stock</span></td>
        <td><span class="pill ${p.isActive ? 'ok' : ''}">${p.isActive ? 'Live' : 'Hidden'}</span>${p.images.length ? '' : ' <span class="pill warn">No photos</span>'}</td></tr>`;
    }).join('');
    return shell(`<div class="bar"><h1 class="grow">Frames</h1><input id="psearch" placeholder="Search name or SKU" style="max-width:260px" value="${esc(S.data.q || '')}"><button class="btn" data-act="igOpen">📸 Import from Instagram</button><button class="btn" data-act="quickAdd">⚡ Quick add from photos</button><button class="btn p" data-act="newProduct">Add frame</button></div>
      <div class="card">${list.length ? `<div class="tablewrap"><table><thead><tr><th></th><th>Frame</th><th>Price</th><th>Colours</th><th>Stock</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`
        : `<p>No frames yet. Add frames one at a time, or pick many photos at once with Quick add.</p><div style="display:flex;gap:8px"><button class="btn" data-act="quickAdd">⚡ Quick add from photos</button><button class="btn p" data-act="newProduct">Add frame</button></div>`}</div>
      <input type="file" id="quickInput" accept="image/jpeg,image/png,image/webp" multiple hidden>`);
  }

  function blankProduct() {
    return { name: '', slug: '', brand: 'Lensio', description: '', shape: 'RECTANGLE', material: 'ACETATE', gender: 'UNISEX', isSunglasses: false,
      basePrice: '', mrp: '', lensWidthMm: 52, bridgeMm: 18, templeMm: 140, frameWidthMm: 136, weightGrams: '', tryOnImage: null, isActive: true,
      images: [], variants: [{ sku: '', colorName: 'Black', colorHex: '#1B1B1F', size: 'MEDIUM', stock: 10, priceDelta: 0 }], _slugTouched: false };
  }

  function editorView() {
    const p = S.edit;
    const opt = (list, v) => list.map((x) => `<option value="${x}" ${x === v ? 'selected' : ''}>${tc(x)}</option>`).join('');
    const photos = p.images.map((u, i) => `<div class="photo">${i === 0 ? '<span class="main">Main photo</span>' : ''}<img src="${esc(u)}" alt="Photo ${i + 1}">
      <div class="tools"><button data-act="imgMove" data-i="${i}" data-d="-1" aria-label="Move left" ${i === 0 ? 'disabled' : ''}>←</button><button data-act="imgDel" data-i="${i}">Remove</button><button data-act="imgMove" data-i="${i}" data-d="1" aria-label="Move right" ${i === p.images.length - 1 ? 'disabled' : ''}>→</button></div></div>`).join('');
    const vrows = p.variants.map((v, i) => `<div class="vrow">
      <label>Colour name<input data-v="${i}" data-k="colorName" value="${esc(v.colorName)}"></label>
      <label>Swatch<input type="color" data-v="${i}" data-k="colorHex" value="${esc(v.colorHex)}"></label>
      <label>Size<select data-v="${i}" data-k="size">${opt(SIZES, v.size)}</select></label>
      <label>SKU<input data-v="${i}" data-k="sku" value="${esc(v.sku)}" placeholder="Auto if empty"></label>
      <label>Stock<input type="number" min="0" data-v="${i}" data-k="stock" value="${esc(v.stock)}"></label>
      <label>Extra ₹<input type="number" data-v="${i}" data-k="priceDelta" value="${esc(v.priceDelta / 100 || 0)}" title="Added to the frame price for this colour"></label>
      <button class="x" data-act="varDel" data-i="${i}" aria-label="Remove colour" ${p.variants.length === 1 ? 'disabled' : ''}>×</button></div>`).join('');
    const off = p.mrp && p.basePrice ? Math.round((1 - p.basePrice / p.mrp) * 100) : 0;
    return shell(`<div class="bar"><button class="link" data-act="nav" data-v="products">← Frames</button><h1 class="grow">${p.id ? esc(p.name) : 'Add a frame'}</h1>
        ${p.id ? `<button class="btn" data-act="toggleActive">${p.isActive ? 'Hide from app' : 'Show in app'}</button>` : ''}</div>
      <div style="display:flex;flex-direction:column;gap:18px">
      <div class="card"><h2>Photos</h2><p class="muted small">JPG, PNG or WebP, up to 5 MB each. Use a front view on a white background as the main photo. Drag several in at once.</p>
        <div class="photos">${photos}<button class="drop" data-act="pickImages" id="drop">Add photos<br><span class="small">or drop them here</span></button></div>
        <input type="file" id="imgInput" accept="image/jpeg,image/png,image/webp" multiple hidden></div>

      <div class="card"><h2>Details</h2><div class="grid2">
        <label>Frame name<input data-f="name" value="${esc(p.name)}" placeholder="e.g. Vista Rectangle"></label>
        <label>Web address (slug)<input data-f="slug" value="${esc(p.slug)}" placeholder="vista-rectangle"></label>
        <label>Brand<input data-f="brand" value="${esc(p.brand)}"></label>
        <label>Shape<select data-f="shape">${opt(SHAPES, p.shape)}</select></label>
        <label>Material<select data-f="material">${opt(MATERIALS, p.material)}</select></label>
        <label>For<select data-f="gender">${opt(GENDERS, p.gender)}</select></label></div>
        <label>Description<textarea data-f="description" placeholder="Material, hinges, fit, what it suits">${esc(p.description)}</textarea></label>
        <label class="check"><input type="checkbox" data-f="isSunglasses" ${p.isSunglasses ? 'checked' : ''}> These are sunglasses</label></div>

      <div class="card"><h2>Price</h2><div class="grid4">
        <label>Selling price (₹)<input type="number" min="1" data-f="basePrice" data-money value="${p.basePrice === '' ? '' : p.basePrice / 100}"></label>
        <label>MRP (₹)<input type="number" min="1" data-f="mrp" data-money value="${p.mrp === '' ? '' : p.mrp / 100}"></label></div>
        <p class="muted small" id="offLine">${off > 0 ? `Shows as ${off}% off in the app.` : 'Set MRP higher than the selling price to show a discount.'} This is the frame price. Lens and coating prices are added on top; set them under Lens prices.</p></div>

      <div class="card"><h2>Measurements (mm)</h2><p class="muted small">Printed inside the temple arm as lens–bridge–temple, e.g. 52-18-140. Frame width is the full front width.</p><div class="grid4">
        <label>Lens width<input type="number" data-f="lensWidthMm" value="${esc(p.lensWidthMm)}"></label>
        <label>Bridge<input type="number" data-f="bridgeMm" value="${esc(p.bridgeMm)}"></label>
        <label>Temple length<input type="number" data-f="templeMm" value="${esc(p.templeMm)}"></label>
        <label>Frame width<input type="number" data-f="frameWidthMm" value="${esc(p.frameWidthMm)}"></label>
        <label>Weight (g)<input type="number" data-f="weightGrams" value="${esc(p.weightGrams ?? '')}"></label></div>
        <p class="muted small" id="sizeLine">Size band: <b>${tc(sizeFor(+p.frameWidthMm))}</b> (under 132 small, 132–140 medium, over 140 wide).</p></div>

      <div class="card"><div class="bar" style="margin:0"><h2 class="grow">Colours and stock</h2><button class="btn" data-act="varAdd">Add colour</button></div>${vrows}</div>

      <div class="card"><h2>Instagram post (optional)</h2><p class="muted small">Link the Instagram post for this frame. Customers see a <b>View on Instagram</b> button on the product page.</p>
        <label>Post link<input data-f="instagramPostUrl" value="${esc(p.instagramPostUrl || '')}" placeholder="https://www.instagram.com/p/…"></label></div>
      <div class="card"><h2>Try-on image (optional)</h2><p class="muted small">Not required: the Try on page uses the <b>main photo</b> automatically and removes a white background. For the best look, upload a front-view PNG with a transparent background.${p.id ? ` <a href="/try-on/?frame=${encodeURIComponent(p.slug)}" target="_blank" rel="noopener">Preview try-on →</a>` : ''}</p>
        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">${p.tryOnImage ? `<img src="${esc(p.tryOnImage)}" alt="Try-on image" style="height:70px;background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0/16px 16px;border-radius:8px;padding:6px">` : ''}
        <button class="btn" data-act="pickTryon">${p.tryOnImage ? 'Replace PNG' : 'Upload PNG'}</button>${p.tryOnImage ? '<button class="btn danger" data-act="tryonDel">Remove</button>' : ''}</div>
        <input type="file" id="tryInput" accept="image/png,image/webp" hidden></div>

      <div class="err" id="perr"></div>
      <div class="sticky"><button class="btn" data-act="nav" data-v="products">Cancel</button><button class="btn p" data-act="saveProduct">${p.id ? 'Save changes' : 'Add frame'}</button></div></div>`);
  }

  function alertsView() {
    return shell(`<div class="bar"><h1 class="grow">Alerts</h1><span class="muted small">Updated every 30 seconds while this page is open</span></div>
      <div class="card">${S.alerts.list.map((a) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)">
        <span>${{ new_order: '🛍️', payment: '💰', prescription: '👓', courier: '⚠️' }[a.kind] || '🔔'} ${esc(a.text)}<br><span class="small muted">${when(a.at)}</span></span>
        <button class="btn" data-act="openAlert" data-id="${a.orderId}">Open</button></div>`).join('')}</div>`);
  }
  // Short two-tone chime (no sound file needed).
  function chime() {
    try {
      const C = window.AudioContext || window.webkitAudioContext; const ctx = new C();
      [880, 1320].forEach((f, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
        const t = ctx.currentTime + i * 0.18; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); o.start(t); o.stop(t + 0.32); });
    } catch { /* audio blocked until the page is clicked once */ }
  }
  async function pollAlerts() {
    if (!S.user) return;
    try {
      const r = await api('/admin/alerts?since=' + S.alerts.since);
      S.alerts.since = r.now;
      const seen = new Set(S.alerts.list.map((a) => a.kind + a.orderId + a.text));
      const fresh = r.events.filter((e) => !seen.has(e.kind + e.orderId + e.text));
      if (!fresh.length) return;
      S.alerts.list = [...fresh, ...S.alerts.list].slice(0, 50);
      S.alerts.unseen += fresh.length;
      document.title = `(${S.alerts.unseen}) Lensio admin`;
      chime(); toast(fresh[0].text + (fresh.length > 1 ? ` (+${fresh.length - 1} more)` : ''));
      if ('Notification' in window && Notification.permission === 'granted') {
        for (const e of fresh.slice(0, 3)) { const n = new Notification('Lensio', { body: e.text, icon: 'mark.png', tag: e.kind + e.orderId }); n.onclick = () => { window.focus(); location.hash = 'order=' + e.orderId; }; }
      }
      if (S.view === 'orders') load('orders'); else render();
    } catch { /* offline or signed out: try again next time */ }
  }
  setInterval(pollAlerts, 30_000);
  // Links in alert emails open the order: /admin/#order=<id>
  async function openFromHash() {
    const m = location.hash.match(/order=([\w-]+)/); if (!m || !S.user) return;
    S.view = 'order'; S.data.order = null; render(); S.data.order = await api('/admin/orders/' + m[1]); render();
  }
  window.addEventListener('hashchange', openFromHash);

  // Quick add: many frames at once from photos
  function quickView() {
    const rows = S.quick || [];
    const opt = (list, v) => list.map((x) => `<option value="${x}" ${x === v ? 'selected' : ''}>${tc(x)}</option>`).join('');
    return shell(`<div class="bar"><button class="link" data-act="nav" data-v="products">← Frames</button><h1 class="grow">Quick add from photos</h1>
        <button class="btn" data-act="quickMore">Add more photos</button></div>
      <p class="muted">One photo = one frame. Fill in the name and price; everything else has sensible defaults you can edit later (open the frame to add measurements, more photos and colours). Tip: save the product photos from your Instagram posts to your computer first, then pick them all here.</p>
      <div class="card"><div class="tablewrap"><table style="min-width:900px"><thead><tr><th>Photo</th><th>Name <span class="small muted">(or paste an Instagram caption)</span></th><th>Price ₹</th><th>MRP ₹</th><th>Shape</th><th>For</th><th>Sunglasses</th><th>Stock</th><th></th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr>
        <td>${r.url ? `<img class="thumb" src="${esc(r.url)}" alt="">` : '<span class="small muted">Uploading…</span>'}</td>
        <td><input data-q="${i}" data-k="name" value="${esc(r.name)}"><button class="link small" data-act="quickCaption" data-i="${i}">📋 Fill from caption</button></td>
        <td style="width:110px"><input type="number" min="1" data-q="${i}" data-k="price" value="${esc(r.price)}"></td>
        <td style="width:110px"><input type="number" min="1" data-q="${i}" data-k="mrp" value="${esc(r.mrp)}" placeholder="optional"></td>
        <td><select data-q="${i}" data-k="shape">${opt(SHAPES, r.shape)}</select></td>
        <td><select data-q="${i}" data-k="gender">${opt(GENDERS, r.gender)}</select></td>
        <td style="text-align:center"><input type="checkbox" data-q="${i}" data-k="sun" ${r.sun ? 'checked' : ''} style="width:18px;height:18px"></td>
        <td style="width:90px"><input type="number" min="0" data-q="${i}" data-k="stock" value="${esc(r.stock)}"></td>
        <td><button class="link" data-act="quickDel" data-i="${i}" style="color:var(--bad)">Remove</button><div class="err small">${esc(r.err || '')}</div></td></tr>`).join('')}
      </tbody></table></div></div>
      <input type="file" id="quickInput" accept="image/jpeg,image/png,image/webp" multiple hidden>
      <div class="sticky"><button class="btn" data-act="nav" data-v="products">Cancel</button><button class="btn p" data-act="quickSave" ${rows.length ? '' : 'disabled'}>Create ${rows.length} frame${rows.length === 1 ? '' : 's'}</button></div>`);
  }
  const guessName = (file, i) => {
    const base = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    return /^(img|dsc|pxl|photo|image|screenshot|whatsapp)\b|^\d+$/i.test(base) || base.length < 3 ? `New frame ${i + 1}` : base.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60);
  };
  async function quickFiles(files) {
    S.quick = S.quick || [];
    const start = S.quick.length;
    const add = [...files].map((f, i) => ({ file: f, url: null, name: guessName(f, start + i), price: '', mrp: '', shape: 'RECTANGLE', gender: 'UNISEX', sun: /sun|shade|polar/i.test(f.name), stock: 10 }));
    S.quick.push(...add); S.view = 'quick'; render();
    for (const r of add) { const [u] = await uploadFiles([r.file], 'products'); r.url = u || null; if (!u) r.err = 'Upload failed'; if (S.view === 'quick') render(); }
  }
  async function quickSave(btn) {
    const rows = S.quick || []; let ok = 0;
    for (const r of rows) r.err = !r.url ? 'Photo not uploaded' : !r.name.trim() ? 'Name needed' : !(+r.price > 0) ? 'Price needed' : '';
    if (rows.some((r) => r.err)) return render();
    btn.disabled = true;
    for (const r of [...rows]) {
      const price = Math.round(+r.price * 100), mrp = Math.max(price, Math.round((+r.mrp || +r.price) * 100));
      const slug = `${slugify(r.name)}-${Math.random().toString(36).slice(2, 6)}`;
      try {
        await api('/admin/products', { body: {
          name: r.name.trim(), slug, brand: 'Lensio', description: r.name.trim(), shape: r.shape, material: 'ACETATE', gender: r.gender,
          isSunglasses: !!r.sun, basePrice: price, mrp, lensWidthMm: 52, bridgeMm: 18, templeMm: 140, frameWidthMm: 136, isActive: true,
          images: [r.url], variants: [{ sku: slug.toUpperCase().slice(0, 60), colorName: 'Black', colorHex: '#1B1B1F', size: 'MEDIUM', stock: Math.max(0, parseInt(r.stock, 10) || 0), priceDelta: 0 }],
        } });
        ok++; S.quick.splice(S.quick.indexOf(r), 1);
      } catch (x) { r.err = x.message; }
    }
    toast(`${ok} frame${ok === 1 ? '' : 's'} added${S.quick.length ? `, ${S.quick.length} need attention` : ''}`);
    if (!S.quick.length) { S.data.products = null; return load('products'); }
    render();
  }

  // Pricing
  function pricingView() {
    const d = S.data.pricing;
    if (!d) return shell('<p class="muted">Loading prices…</p>');
    const row = (x, kind) => `<tr><td><b>${esc(x.name)}</b><div class="small muted">${esc(x.description)}</div></td>${kind === 'lens' ? `<td>${tc(x.lensType)}</td><td>${x.index}</td>` : ''}
      <td style="width:150px"><input type="number" min="0" value="${x.price / 100}" data-price="${kind}" data-id="${x.id}" aria-label="Price for ${esc(x.name)}"></td>
      <td><label class="check"><input type="checkbox" data-active="${kind}" data-id="${x.id}" ${x.isActive ? 'checked' : ''}> Offered</label></td></tr>`;
    return shell(`<div class="bar"><h1 class="grow">Lens prices</h1><span class="muted small">Prices save when you leave the box.</span></div>
      <div style="display:flex;flex-direction:column;gap:18px">
      <div class="card"><h2>Lens packages</h2><p class="muted small">Added to the frame price when a customer picks this lens. Use 0 for "included".</p><div class="tablewrap"><table><thead><tr><th>Lens</th><th>Type</th><th>Index</th><th>Price (₹)</th><th></th></tr></thead><tbody>${d.lensPackages.map((x) => row(x, 'lens')).join('')}</tbody></table></div></div>
      <div class="card"><h2>Coatings</h2><div class="tablewrap"><table><thead><tr><th>Coating</th><th>Price (₹)</th><th></th></tr></thead><tbody>${d.coatings.map((x) => row(x, 'coat')).join('')}</tbody></table></div></div>
      <div class="card"><h2>Coupons</h2><div class="tablewrap"><table><thead><tr><th>Code</th><th>What it does</th><th></th></tr></thead><tbody>${d.coupons.map((c) => `<tr><td><b>${esc(c.code)}</b></td><td class="small">${esc(c.description)}</td><td><label class="check"><input type="checkbox" data-active="coupon" data-id="${c.id}" ${c.isActive ? 'checked' : ''}> Active</label></td></tr>`).join('')}</tbody></table></div></div></div>`);
  }

  // Orders
  function ordersView() {
    const d = S.data.orders;
    const f = S.data.orderStatus || '';
    const filters = `<select id="ostatus" style="max-width:240px"><option value="">All orders</option>${STATUS.map((s) => `<option value="${s}" ${s === f ? 'selected' : ''}>${tc(s)}</option>`).join('')}</select>`;
    if (!d) return shell(`<div class="bar"><h1 class="grow">Orders</h1>${filters}</div><p class="muted">Loading…</p>`);
    const tc2 = d.toCheckCount || 0;
    const checkBtn = `<button class="btn ${S.data.toCheck ? 'p' : ''}" data-act="toggleToCheck">Payments to check${tc2 ? ` (${tc2})` : ''}</button>`;
    return shell(`<div class="bar"><h1 class="grow">Orders</h1>${checkBtn}<input id="osearch" placeholder="Order number, email or phone" style="max-width:220px" value="${esc(S.data.oq || '')}">${filters}</div>
      <div class="card">${d.items.length ? `<div class="tablewrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Placed</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead><tbody>
      ${d.items.map((o) => `<tr class="click" data-act="openOrder" data-id="${o.id}"><td><b>${esc(o.orderNumber)}</b><div class="small muted">${o.items.length} item${o.items.length > 1 ? 's' : ''}</div></td>
        <td>${esc(o.user?.name || '—')}<div class="small muted">${esc(o.user?.email || '')}</div>${(o.address?.phone || o.user?.phone) ? `<div class="small"><a href="tel:+91${esc(o.address?.phone || o.user.phone)}">+91 ${esc(o.address?.phone || o.user.phone)}</a></div>` : ''}</td><td class="small">${when(o.createdAt)}</td><td>${inr(o.total)}</td><td class="small">${o.paymentMethod === 'UPI_MANUAL' ? 'UPI (QR)' : tc(o.paymentMethod)}</td>
        <td><span class="pill ${o.status === 'CANCELLED' ? 'bad' : o.status === 'DELIVERED' ? 'ok' : o.status === 'PAYMENT_PENDING' ? 'warn' : ''}">${o.payments?.[0]?.status === 'SUBMITTED' && o.status === 'PAYMENT_PENDING' ? 'Check payment' : tc(o.status)}</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No orders match.</p>'}</div>`);
  }

  function orderView() {
    const o = S.data.order;
    if (!o) return shell('<p class="muted">Loading…</p>');
    const a = o.shippingSnapshot || {};
    const next = NEXT[o.status] || [];
    return shell(`<div class="bar"><button class="link" data-act="nav" data-v="orders">← Orders</button><h1 class="grow">${esc(o.orderNumber)}</h1><span class="pill">${tc(o.status)}</span></div>
      <div class="grid2" style="align-items:start">
      <div class="card"><h2>Items</h2>${o.items.map((i) => `<div style="display:flex;flex-direction:column;gap:4px;padding-bottom:10px;border-bottom:1px solid var(--line)">
          <div style="display:flex;justify-content:space-between"><b>${esc(i.productName)}</b><span>${inr(i.unitPrice * i.quantity)}</span></div>
          <span class="small muted">${esc(i.variantLabel)} · ${esc(i.lensPackage?.name || 'Frame only')}${i.coatingCodes.length ? ' + ' + i.coatingCodes.map(tc).join(', ') : ''}</span>
          ${i.prescription ? `<span class="small">Prescription: <span class="pill ${i.prescription.status === 'VERIFIED' ? 'ok' : i.prescription.status === 'REJECTED' ? 'bad' : 'warn'}">${tc(i.prescription.status)}</span>
            ${i.prescription.source === 'MANUAL' ? `R ${i.prescription.odSph ?? 0}/${i.prescription.odCyl ?? 0}×${i.prescription.odAxis ?? '-'} · L ${i.prescription.osSph ?? 0}/${i.prescription.osCyl ?? 0}×${i.prescription.osAxis ?? '-'} · PD ${i.prescription.pdTotal ?? '-'}` : ''}
            ${i.prescriptionImageUrl ? `<a href="${esc(i.prescriptionImageUrl)}" target="_blank" rel="noopener">View photo</a>` : ''}</span>`
            : i.lensPackage && i.lensPackage.lensType !== 'ZERO_POWER' ? '<span class="pill warn">Waiting for prescription</span>' : ''}</div>`).join('')}
        <div style="display:flex;justify-content:space-between"><span class="muted">Subtotal</span><span>${inr(o.subtotal)}</span></div>
        ${o.discount ? `<div style="display:flex;justify-content:space-between"><span class="muted">Discount ${esc(o.couponCode || '')}</span><span>−${inr(o.discount)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between"><span class="muted">Delivery + COD fee</span><span>${inr(o.shippingFee + o.codFee)}</span></div>
        <div style="display:flex;justify-content:space-between"><b>Total</b><b>${inr(o.total)}</b></div></div>
      <div style="display:flex;flex-direction:column;gap:18px">
        ${payCard(o)}
        <div class="card"><h2>Move order</h2>${next.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap">${next.map((s) => `<button class="btn ${s === 'CANCELLED' ? 'danger' : 'p'}" data-act="setStatus" data-s="${s}">${s === 'CANCELLED' ? 'Cancel order' : moveLabel(s, o)}</button>`).join('')}</div>
          <p class="muted small">The customer gets a WhatsApp message for each step. "Dispatched" books the Shiprocket courier.</p>` : '<p class="muted">No further steps.</p>'}
          ${o.awbCode ? `<p class="small">AWB ${esc(o.awbCode)} · ${esc(o.courierName || '')} ${o.trackingUrl ? `· <a href="${esc(o.trackingUrl)}" target="_blank" rel="noopener">Track</a>` : ''}</p>` : ''}</div>
        ${trackCard(o)}
        ${deliveryCard(o)}
        <div class="card"><h2>History</h2>${o.events.map((e) => `<div class="small"><b>${tc(e.status)}</b> · ${when(e.createdAt)}${e.note ? ' · ' + esc(e.note) : ''}</div>`).join('')}</div>
      </div></div>`);
  }

  /** Delivery contact for the courier / delivery agent: call, WhatsApp, copy or share in one tap. */
  function agentText(o) {
    const a = o.address, cod = o.paymentMethod === 'COD' && !o.payments.some((p) => p.status === 'COD_COLLECTED');
    return [`Lensio order ${o.orderNumber}`, `Customer: ${a.fullName}`, `Mobile: +91 ${a.phone}`,
      a.altPhone ? `Alternate: +91 ${a.altPhone}` : '',
      `Address: ${[a.line1, a.line2, a.landmark ? 'Near ' + a.landmark : '', a.city, a.state + ' ' + a.pincode].filter(Boolean).join(', ')}`,
      `Maps: https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([a.line1, a.line2, a.city, a.pincode].filter(Boolean).join(', '))}`,
      cod ? `COLLECT CASH: ${inr(o.total)}` : 'Prepaid: do not collect cash'].filter(Boolean).join('\n');
  }
  /** The customer update for the order's current step, ready to send from the shop's own WhatsApp. */
  const STEP_TEXT = {
    PAYMENT_PENDING: ['Awaiting payment', 'Please complete the payment in the Lensio app to confirm your order.'],
    PLACED: ['Order placed', "Thank you! We'll message you at every step."],
    PRESCRIPTION_VERIFIED: ['Prescription verified', 'Our optician has checked your prescription.'],
    LENS_CUTTING_FITTING: ['Lens cutting & fitting', 'This usually takes 2–4 days.'],
    QUALITY_CHECK: ['Quality check', 'Your glasses are being checked before packing.'],
    DISPATCHED: ['Dispatched', ''],
    DELIVERED: ['Delivered', 'Enjoy your new glasses! Reply here if anything needs adjusting.'],
    CANCELLED: ['Cancelled', 'Any payment made will be refunded in 5–7 working days.'],
  };
  function customerUpdateText(o) {
    const [head, detail] = STEP_TEXT[o.status] || [tc(o.status), ''];
    const track = o.status === 'DISPATCHED' ? (o.trackingUrl ? `Track it: ${o.trackingUrl}` : 'It will reach you soon.') : detail;
    return `Hi ${o.address.fullName || o.user?.name || 'there'}, your Lensio order ${o.orderNumber} is now: *${head}*. ${track}`.trim();
  }
  const waTo = (phone, text) => `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;

  function deliveryCard(o) {
    const a = o.address, cod = o.paymentMethod === 'COD' && !o.payments.some((p) => p.status === 'COD_COLLECTED');
    const ph = (n, label) => `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:4px 0"><b>${label}</b> <a href="tel:+91${esc(n)}">+91 ${esc(n)}</a>
      <a class="btn" style="padding:5px 10px;text-decoration:none" href="tel:+91${esc(n)}">📞 Call</a>
      <a class="btn" style="padding:5px 10px;text-decoration:none" href="https://wa.me/91${esc(n)}" target="_blank" rel="noopener">💬 WhatsApp</a></div>`;
    return `<div class="card"><h2>Deliver to</h2>
      <p style="margin:0 0 6px"><b>${esc(a.fullName)}</b><br>${esc(a.line1)}${a.line2 ? ', ' + esc(a.line2) : ''}${a.landmark ? `<br>Near ${esc(a.landmark)}` : ''}<br>${esc(a.city)}, ${esc(a.state)} ${esc(a.pincode)}</p>
      ${ph(a.phone, 'Mobile' + (o.user?.phoneVerified && o.user.phone === a.phone ? ' <span class="pill ok">✓ verified</span>' : ''))}${a.altPhone ? ph(a.altPhone, 'Alternate') : ''}
      ${o.user?.phone && o.user.phone !== a.phone && o.user.phone !== a.altPhone ? `<p class="small muted">Account mobile: <a href="tel:+91${esc(o.user.phone)}">+91 ${esc(o.user.phone)}</a></p>` : ''}
      ${cod ? `<p><span class="pill warn">Cash on delivery: collect ${inr(o.total)}</span></p>` : '<p><span class="pill ok">Prepaid</span></p>'}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <a class="btn p" style="text-decoration:none" href="${esc(waTo(a.phone, customerUpdateText(o)))}" target="_blank" rel="noopener">💬 Send “${esc((STEP_TEXT[o.status] || [tc(o.status)])[0])}” to customer</a>
        <button class="btn p" data-act="agentShare">📤 Send to delivery agent</button>
        <button class="btn" data-act="agentCopy">📋 Copy details</button></div>
      <p class="small muted">Sends the name, mobile numbers, address with a Maps link and the cash to collect. Pick the agent in WhatsApp.</p>
      <p class="small muted">Payment: ${o.paymentMethod === 'UPI_MANUAL' ? 'UPI (QR)' : tc(o.paymentMethod)} · ${o.payments.map((p) => tc(p.status)).join(', ')}</p></div>`;
  }

  function moveLabel(s, o) {
    if (s === 'DISPATCHED') return o.integrations?.shiprocket ? '📦 Ready to ship: book courier' : '📦 Mark dispatched';
    if (s === 'QUALITY_CHECK') return '✓ Lenses fitted: quality check';
    if (s === 'LENS_CUTTING_FITTING') return o.status === 'QUALITY_CHECK' ? '↺ Failed QC: back to fitting' : 'Start lens cutting & fitting';
    if (s === 'PRESCRIPTION_VERIFIED') return 'Prescription verified';
    if (s === 'DELIVERED') return 'Mark delivered';
    return tc(s);
  }

  function payCard(o) {
    if (o.paymentMethod === 'COD') {
      const cod = o.payments.find((p) => p.status === 'COD_PENDING' || p.status === 'COD_COLLECTED');
      if (!cod || o.status === 'CANCELLED') return '';
      if (cod.status === 'COD_COLLECTED') return `<div class="card"><h2>Cash on delivery</h2><p><span class="pill ok">Cash collected</span> ${inr(o.total)}</p></div>`;
      return `<div class="card"><h2>Cash on delivery</h2><p class="muted">Collect <b>${inr(o.total)}</b> on delivery.</p>
        ${o.status === 'DELIVERED' ? '<div><button class="btn p" data-act="codCollected">Cash received from courier</button></div><p class="small muted">Press this once the courier (or your delivery person) hands over the cash.</p>' : '<p class="small muted">You can mark the cash as collected after the order is delivered.</p>'}</div>`;
    }
    if (o.paymentMethod !== 'UPI_MANUAL') return '';
    const p = o.payments[0];
    if (o.status !== 'PAYMENT_PENDING') {
      return p?.status === 'CAPTURED' ? `<div class="card"><h2>UPI payment</h2><p><span class="pill ok">Confirmed</span> ${inr(o.total)}${p.utr ? ` · UTR <b>${esc(p.utr)}</b>` : ''}</p>
        ${o.status === 'CANCELLED' ? '<p class="small" style="color:var(--warn)">This order was cancelled after payment. Refund the customer from your UPI app.</p>' : ''}</div>` : '';
    }
    if (!p || p.status === 'CREATED') return `<div class="card"><h2>UPI payment</h2><p class="muted">Waiting for the customer to pay ${inr(o.total)} and enter their UPI reference number.</p>
      <p class="small muted">If the money already arrived in your account, you can confirm it anyway.</p><div><button class="btn" data-act="confirmPay">Confirm payment received</button></div></div>`;
    if (p.status === 'FAILED') return `<div class="card"><h2>UPI payment</h2><p><span class="pill bad">Rejected</span> ${esc(p.failureReason || '')}</p><p class="small muted">The customer can enter a new reference number.</p><div><button class="btn" data-act="confirmPay">Confirm payment received</button></div></div>`;
    return `<div class="card" style="border-color:var(--warn)"><h2>Check this payment</h2>
      <p>Look for <b>${inr(o.total)}</b> with UPI reference <b style="font-size:18px;letter-spacing:.5px">${esc(p.utr)}</b> in your bank or UPI app.</p>
      ${p.proofUrl ? `<a href="${esc(p.proofUrl)}" target="_blank" rel="noopener"><img src="${esc(p.proofUrl)}" alt="Payment screenshot" style="max-width:220px;border-radius:10px;border:1px solid var(--line)"></a>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn p" data-act="confirmPay">Money received — confirm</button><button class="btn danger" data-act="rejectPay">Not received</button></div>
      <p class="small muted">Confirming moves the order to "Order placed" and messages the customer.</p></div>`;
  }

  function trackCard(o) {
    if (o.status === 'CANCELLED' || o.status === 'PAYMENT_PENDING') return '';
    const ups = (o.tracking || []).map((t) => `<div class="small" style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--line)">
      <span><b>${esc(t.message)}</b>${t.location ? ' · ' + esc(t.location) : ''}<br><span class="muted">${when(t.at)} · ${t.source === 'courier' ? 'Courier' : 'You'}</span></span>
      <button class="link" data-act="delTrack" data-id="${t.id}" aria-label="Delete update" style="color:var(--bad)">×</button></div>`).join('');
    return `<div class="card"><h2>Courier & live tracking</h2>
      <p class="muted small">Customers see these updates live on their order screen and get an email. Shiprocket adds courier scans automatically when it's connected.</p>
      <div class="grid2">
        <label>Courier<input id="trCourier" placeholder="e.g. DTDC, Delhivery, own delivery" value="${esc(o.courierName || '')}"></label>
        <label>Tracking number (AWB)<input id="trAwb" value="${esc(o.awbCode || '')}"></label></div>
      <label>Courier tracking link (optional)<input id="trUrl" placeholder="https://…" value="${esc(o.trackingUrl || '')}"></label>
      <div class="grid2">
        <label>Update<input id="trMsg" list="trPresets" placeholder="e.g. Out for delivery"></label>
        <label>Location (optional)<input id="trLoc" placeholder="e.g. Bengaluru hub"></label></div>
      <datalist id="trPresets"><option value="Lenses ordered from lab"><option value="Packed and ready to ship"><option value="Picked up by courier"><option value="In transit"><option value="Reached nearest hub"><option value="Out for delivery"><option value="Delivery attempted, customer not available"></datalist>
      <div><button class="btn p" data-act="addTrack">Add update</button></div>
      ${ups ? `<div>${ups}</div>` : '<p class="muted small">No updates yet.</p>'}</div>`;
  }


  // ---------- Reviews ----------
  function reviewsView() {
    const list = S.data.reviews; const f = S.data.reviewFilter || 'PENDING';
    const chips = ['PENDING', 'APPROVED', 'REJECTED'].map((x) => `<button class="btn ${f === x ? 'p' : ''}" data-act="revFilter" data-v="${x}">${tc(x)}</button>`).join('');
    if (!list) return shell(`<div class="bar"><h1 class="grow">Reviews</h1>${chips}</div><p class="muted">Loading…</p>`);
    const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
    return shell(`<div class="bar"><h1 class="grow">Reviews</h1>${chips}</div>
      <p class="muted small">Only customers whose order was delivered can review. ${S.data.settings?.reviewsAutoApprove === false ? 'New reviews wait here for approval.' : 'New reviews go live straight away (change this in Settings); you can still hide any review here.'}</p>
      ${list.length ? list.map((r) => `<div class="card" style="margin-bottom:12px">
        <div class="bar" style="margin:0"><b class="grow">${esc(r.product?.name || '')} <span style="color:#F5A524">${stars(r.rating)}</span></b><span class="small muted">${when(r.createdAt)}</span></div>
        ${r.title ? `<b>${esc(r.title)}</b>` : ''}<p style="margin:0">${esc(r.body)}</p>
        ${r.photos?.length ? `<div style="display:flex;gap:8px">${r.photos.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener"><img class="thumb" src="${esc(u)}" alt=""></a>`).join('')}</div>` : ''}
        <div class="small muted">${esc(r.user?.name || '')} · ${esc(r.user?.email || '')} · <span class="pill ${r.status === 'APPROVED' ? 'ok' : r.status === 'REJECTED' ? 'bad' : 'warn'}">${tc(r.status)}</span></div>
        <div style="display:flex;gap:8px">${r.status !== 'APPROVED' ? `<button class="btn p" data-act="revMod" data-id="${r.id}" data-d="APPROVED">Approve</button>` : ''}
          ${r.status !== 'REJECTED' ? `<button class="btn" data-act="revMod" data-id="${r.id}" data-d="REJECTED">Hide</button>` : ''}
          <button class="btn danger" data-act="revDel" data-id="${r.id}">Delete</button></div></div>`).join('') : '<div class="card"><p class="muted">No reviews here.</p></div>'}`);
  }

  // ---------- Rewards: gift cards + loyalty points ----------
  function rewardsView() {
    const cards = S.data.giftcards;
    return shell(`<div class="bar"><h1 class="grow">Rewards</h1></div><div style="display:flex;flex-direction:column;gap:18px">
      <div class="card"><h2>Issue a gift card</h2>
        <p class="muted small">Creates a code like <b>LENS-ABCD-2345</b>. Customers enter it at checkout; any balance left stays on the card for next time. Use it for gift cards you sell in store, refunds as store credit, or giveaways.</p>
        <div class="grid4"><label>Value (₹)<input id="gcValue" type="number" min="1" placeholder="1000"></label>
          <label>Buyer name<input id="gcBuyer" placeholder="optional"></label>
          <label>Send to email<input id="gcTo" type="email" placeholder="optional"></label>
          <label>Expires on<input id="gcExp" type="date"></label></div>
        <label>Message<input id="gcMsg" placeholder="Happy birthday! (optional)"></label>
        <div class="err" id="gcErr"></div><div><button class="btn p" data-act="gcIssue">Create gift card</button></div></div>
      <div class="card"><h2>Gift cards</h2>${!cards ? '<p class="muted">Loading…</p>' : cards.length ? `<div class="tablewrap"><table><thead><tr><th>Code</th><th>Value</th><th>Balance left</th><th>For</th><th>Created</th><th></th></tr></thead><tbody>
        ${cards.map((c) => `<tr><td><b style="font-family:monospace">${esc(c.code)}</b></td><td>${inr(c.initialValue)}</td><td>${inr(c.balance)}</td>
          <td class="small">${esc(c.recipientEmail || c.purchaserName || '—')}${c.expiresAt ? `<div class="muted">expires ${new Date(c.expiresAt).toLocaleDateString('en-IN')}</div>` : ''}</td><td class="small">${when(c.createdAt)}</td>
          <td><label class="check"><input type="checkbox" data-gc="${c.id}" ${c.isActive ? 'checked' : ''}> Active</label></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No gift cards yet.</p>'}</div>
      <div class="card"><h2>Loyalty points</h2>
        <p class="muted small">Customers earn <b>${S.data.settings?.loyaltyPointsPer100 ?? 5} points per ₹100</b> when an order is delivered (1 point = ₹1 off a future order, up to ${S.data.settings?.loyaltyMaxRedeemPercent ?? 20}% of an order). Change the rates in Settings. Add or remove points for a customer here, e.g. as a goodwill gesture:</p>
        <div class="grid4"><label>Customer email<input id="lpEmail" type="email"></label><label>Points (+ to add, − to remove)<input id="lpPts" type="number" placeholder="50"></label><label>Reason<input id="lpNote" placeholder="optional"></label></div>
        <div class="err" id="lpErr"></div><div><button class="btn" data-act="lpAdjust">Update points</button></div></div></div>`);
  }

  // ---------- Stores ----------
  function storesView() {
    const list = S.data.stores; const e = S.data.storeEdit;
    const field = (k, label, ph = '', type = 'text') => `<label>${label}<input data-st="${k}" type="${type}" value="${esc(e?.[k] ?? '')}" placeholder="${ph}"></label>`;
    return shell(`<div class="bar"><h1 class="grow">Stores</h1><button class="btn p" data-act="storeNew">Add store</button></div>
      <p class="muted small">Your shops appear in the app's store locator, sorted by distance from the customer. To get latitude/longitude: open the shop in Google Maps, long-press the pin and copy the two numbers.</p>
      ${e ? `<div class="card" style="margin-bottom:18px"><h2>${e.id ? 'Edit store' : 'New store'}</h2><div class="grid2">
        ${field('name', 'Store name', 'Lensio HSR Layout')}${field('phone', 'Phone', '9876543210')}</div>
        ${field('addressLine', 'Address', 'No. 12, 27th Main, Sector 2')}
        <div class="grid4">${field('city', 'City')}${field('state', 'State')}${field('pincode', 'PIN code')}${field('hours', 'Opening hours', 'Mon–Sat 10am–8pm')}</div>
        <div class="grid4">${field('latitude', 'Latitude', '12.9116', 'number')}${field('longitude', 'Longitude', '77.6389', 'number')}</div>
        <label class="check"><input type="checkbox" data-st="isActive" ${e.isActive !== false ? 'checked' : ''}> Show in the app</label>
        <div class="err" id="stErr"></div><div style="display:flex;gap:8px"><button class="btn p" data-act="storeSave">Save store</button><button class="btn" data-act="storeCancel">Cancel</button>
        ${e.id ? '<button class="btn danger" data-act="storeDel">Delete</button>' : ''}</div></div>` : ''}
      <div class="card">${!list ? '<p class="muted">Loading…</p>' : list.length ? list.map((st) => `<div class="bar" style="margin:0;padding:8px 0;border-bottom:1px solid var(--line)">
        <div class="grow"><b>${esc(st.name)}</b> ${st.isActive ? '' : '<span class="pill">Hidden</span>'}<div class="small muted">${esc(st.addressLine)}, ${esc(st.city)} ${esc(st.pincode)} · ${esc(st.hours || '')}${st.latitude == null ? ' · <span style="color:var(--warn)">no map location</span>' : ''}</div></div>
        <button class="btn" data-act="storeEdit" data-id="${st.id}">Edit</button></div>`).join('') : '<p class="muted">No stores yet. Add your shop so customers can find and visit it.</p>'}</div>`);
  }

  // ---------- Home eye-test requests ----------
  function eyeTestView() {
    const list = S.data.eyetests;
    if (!list) return shell('<h1>Home eye tests</h1><p class="muted">Loading…</p>');
    return shell(`<div class="bar"><h1 class="grow">Home eye-test requests</h1></div>
      <p class="muted small">Customers request a home visit from the app. Call them to confirm a time, then mark it Scheduled. You get an email for each new request.</p>
      ${list.length ? list.map((x) => `<div class="card" style="margin-bottom:12px">
        <div class="bar" style="margin:0"><b class="grow">${esc(x.fullName)} · +91 ${esc(x.phone)}</b><span class="pill ${x.status === 'COMPLETED' ? 'ok' : x.status === 'SCHEDULED' ? '' : 'warn'}">${tc(x.status)}</span></div>
        <div class="small">${esc(x.addressLine)}, ${esc(x.city)} ${esc(x.pincode)}</div>
        <div class="small">Prefers <b>${new Date(x.preferredDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</b> · ${esc(x.preferredSlot)}${x.notes ? ` · “${esc(x.notes)}”` : ''}</div>
        ${x.scheduledFor ? `<div class="small">Scheduled: <b>${when(x.scheduledFor)}</b></div>` : ''}
        <div class="grid2" style="align-items:end"><label>Visit time<input type="datetime-local" data-et="${x.id}" data-k="scheduledFor"></label><label>Note<input data-et="${x.id}" data-k="staffNote" value="${esc(x.staffNote || '')}" placeholder="e.g. Optometrist: Priya"></label></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn" href="tel:+91${esc(x.phone)}" style="text-decoration:none">📞 Call</a>
          <button class="btn p" data-act="etSet" data-id="${x.id}" data-s="SCHEDULED">Mark scheduled</button>
          <button class="btn" data-act="etSet" data-id="${x.id}" data-s="COMPLETED">Completed</button>
          <button class="btn danger" data-act="etSet" data-id="${x.id}" data-s="CANCELLED">Cancel</button></div></div>`).join('') : '<div class="card"><p class="muted">No requests yet.</p></div>'}`);
  }


  // ---------- Instagram import ----------
  function igView() {
    const d = S.data.ig || {};
    const opt = (list, v) => list.map((x) => `<option value="${x}" ${x === v ? 'selected' : ''}>${tc(x)}</option>`).join('');
    if (d.loading) return shell('<h1>Import from Instagram</h1><p class="muted">Loading your posts…</p>');
    if (d.status && !d.status.connected) return shell(`<div class="bar"><button class="link" data-act="nav" data-v="products">← Frames</button><h1 class="grow">Import from Instagram</h1></div>
      <div class="card"><h2>Connect your Instagram account</h2>
        <p>Instagram only lets apps read your posts through its official API, with a <b>professional (business or creator) account</b>. It's free, and you set it up once:</p>
        <ol class="small" style="line-height:1.7">
          <li>In the Instagram app: <b>Settings → Account type and tools → Switch to professional account</b> (if you haven't already).</li>
          <li>Go to <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com/apps</a> → <b>Create app</b> → use case <b>“Manage messaging & content on Instagram”</b>.</li>
          <li>In the app: <b>Instagram → API setup with Instagram login</b> → <b>Add account</b> → log in as <b>@lensio_sku</b> → <b>Generate token</b>.</li>
          <li>Copy the token and paste it below.</li></ol>
        ${d.status.error ? `<p class="err">${esc(d.status.error)}</p>` : ''}
        <label>Access token<input id="igToken" type="password" placeholder="IGAA…" autocomplete="off"></label>
        <div class="err" id="igErr"></div><div><button class="btn p" data-act="igConnect">Connect</button></div>
        <p class="muted small">The token is stored only on your server and renewed automatically every week. Prefer not to connect? Save photos from your posts and use <b>⚡ Quick add</b>, where you can paste each caption.</p></div>`);
    const posts = d.posts || [];
    const sel = posts.filter((p) => p._on);
    return shell(`<div class="bar"><button class="link" data-act="nav" data-v="products">← Frames</button><h1 class="grow">Import from Instagram</h1>
        <span class="small muted">Connected as <b>@${esc(d.status?.username || '')}</b> · <button class="link small" data-act="igDisconnect">Disconnect</button></span></div>
      <p class="muted">Tick the posts to add as frames. Name, price, shape and type are read from each caption; check them before importing. Photos are copied to your storage.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px">
      ${posts.map((p, i) => `<div class="card" style="gap:8px;${p._on ? 'border-color:var(--violet)' : ''}${p.imported ? ';opacity:.55' : ''}">
        <div style="position:relative"><img src="${esc(p.images[0])}" alt="" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px">
          ${p.images.length > 1 ? `<span class="pill" style="position:absolute;top:6px;right:6px;background:#040722;color:#fff">${p.images.length} photos</span>` : ''}</div>
        ${p.imported ? '<span class="pill ok">Already in your shop</span>' : `<label class="check"><input type="checkbox" data-igi="${i}" data-k="_on" ${p._on ? 'checked' : ''}> Import this post</label>`}
        <div class="small muted" style="max-height:54px;overflow:hidden">${esc(p.caption.slice(0, 140))}</div>
        ${!p.imported ? `<label>Name<input data-igi="${i}" data-k="name" value="${esc(p.f.name)}"></label>
        <div class="ig2"><label>Price ₹<input type="number" data-igi="${i}" data-k="price" value="${esc(p.f.price ?? '')}"></label><label>MRP ₹<input type="number" data-igi="${i}" data-k="mrp" value="${esc(p.f.mrp ?? '')}" placeholder="optional"></label></div>
        <div class="ig2"><label>Shape<select data-igi="${i}" data-k="shape">${opt(SHAPES, p.f.shape)}</select></label><label>For<select data-igi="${i}" data-k="gender">${opt(GENDERS, p.f.gender)}</select></label></div>
        <div class="ig2"><label class="check"><input type="checkbox" data-igi="${i}" data-k="sunglasses" ${p.f.sunglasses ? 'checked' : ''}> Sunglasses</label><label>Stock<input type="number" data-igi="${i}" data-k="stock" value="${esc(p.f.stock)}"></label></div>
        <a class="small" href="${esc(p.permalink)}" target="_blank" rel="noopener">Open post ↗</a>${p._err ? `<div class="err small">${esc(p._err)}</div>` : ''}` : ''}</div>`).join('')}</div>
      ${d.next ? '<div style="margin-top:14px"><button class="btn" data-act="igMore">Load older posts</button></div>' : ''}
      <div class="sticky"><span class="grow small muted" style="align-self:center;padding-left:10px">${sel.length} selected</span><button class="btn p" data-act="igImport" ${sel.length ? '' : 'disabled'}>Import ${sel.length || ''} as frames</button></div>`);
  }
  const igPrep = (list) => list.map((p) => ({ ...p, _on: false, f: { name: p.guess.name, price: p.guess.price, mrp: p.guess.mrp, shape: p.guess.shape, gender: p.guess.gender, sunglasses: p.guess.sunglasses, stock: 10 } }));
  async function igLoad() {
    S.data.ig = { loading: true }; S.view = 'ig'; render();
    const status = await api('/admin/instagram/status');
    if (!status.connected) { S.data.ig = { status }; return render(); }
    try { const r = await api('/admin/instagram/posts'); S.data.ig = { status, posts: igPrep(r.posts), next: r.next }; }
    catch (x) { S.data.ig = { status: { connected: false, error: x.message } }; }
    render();
  }

  // Settings
  function settingsView() {
    const s = S.data.settings;
    if (!s) return shell('<p class="muted">Loading…</p>');
    return shell(`<div class="bar"><h1 class="grow">Settings</h1></div><div style="display:flex;flex-direction:column;gap:18px;max-width:760px">
      <div class="card"><h2>UPI payments</h2>
        <p class="muted small">Customers pay you directly by UPI. Enter your UPI ID and the app shows a QR with the exact order amount filled in, plus a button that opens their UPI app. No fees.</p>
        <label>Your UPI ID<input id="setUpi" placeholder="e.g. lensio@okaxis or 9876543210@ybl" value="${esc(s.upiId || '')}"></label>
        <label>Name shown to customers when they pay<input id="setPayee" value="${esc(s.upiPayeeName)}"></label>
        <details><summary class="small" style="cursor:pointer;font-weight:700">Or use a QR image instead of a UPI ID</summary>
          <p class="muted small">Only used when no UPI ID is entered. Customers then have to type the amount themselves, so a UPI ID is better.</p>
          <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">${s.upiQrImage ? `<img src="${esc(s.upiQrImage)}" alt="Your QR" style="width:120px;border-radius:10px;border:1px solid var(--line)">` : ''}
          <button class="btn" data-act="pickQr">${s.upiQrImage ? 'Replace QR image' : 'Upload QR image'}</button>${s.upiQrImage ? '<button class="btn danger" data-act="qrDel">Remove</button>' : ''}</div>
          <input type="file" id="qrInput" accept="image/png,image/jpeg,image/webp" hidden></details>
        ${s.upiId ? `<p class="small">Test it: <b>scan this with your own phone</b>. It should open your UPI app paying ₹1 to ${esc(s.upiPayeeName)}.</p><img id="testQr" alt="Test QR" style="width:150px;border-radius:10px;border:1px solid var(--line);background:#fff">` : ''}
      </div>
      <div class="card"><h2>Loyalty points and reviews</h2>
        <label class="check"><input type="checkbox" id="setLoyal" ${s.loyaltyEnabled !== false ? 'checked' : ''}> Customers earn and spend loyalty points</label>
        <div class="grid4"><label>Points per ₹100 spent<input id="setPts" type="number" min="0" value="${esc(s.loyaltyPointsPer100 ?? 5)}"></label>
          <label>Max % of an order paid with points<input id="setPtsMax" type="number" min="0" max="100" value="${esc(s.loyaltyMaxRedeemPercent ?? 20)}"></label></div>
        <p class="muted small">1 point = ₹1. Points are added when an order is delivered and taken back if it's cancelled. With 5 points per ₹100, a ₹2,000 order earns 100 points (₹100 off next time).</p>
        <label class="check"><input type="checkbox" id="setRevAuto" ${s.reviewsAutoApprove !== false ? 'checked' : ''}> Publish customer reviews straight away (untick to approve each one first)</label></div>
      <div class="card"><h2>Instagram</h2>
        <p class="muted small">Shown in the app (Home and Account), on the download page, and known to the AI assistant.</p>
        <label>Instagram profile link<input id="setInsta" placeholder="https://www.instagram.com/yourshop" value="${esc(s.instagramUrl || '')}"></label></div>
      <div class="card"><h2>AI assistant: shop information</h2>
        <p class="muted small">The in-app assistant uses this to answer questions about your shop. Write it like you'd tell a new staff member: returns and exchanges, warranty, store address and hours, delivery areas, anything customers often ask.</p>
        <textarea id="setInfo" rows="6" placeholder="e.g. Returns: 7 days for unused frames. Lenses made to prescription can't be returned. Store: HSR Layout, Bengaluru, open 10am–8pm. We deliver across India.">${esc(s.shopInfo || '')}</textarea></div>
      <div class="card"><h2>Android app download</h2>
        <p class="muted small">Customers install the app from <a href="/download" target="_blank" rel="noopener">your download page</a>. Upload the APK to Cloudflare R2, then paste its public link here. When you release a new version, update both fields and the app tells customers to update.</p>
        <label>APK download link<input id="setApk" placeholder="https://pub-….r2.dev/lensio-1.0.0.apk" value="${esc(s.androidApkUrl || '')}"></label>
        <label>Latest version<input id="setVer" placeholder="1.0.0" value="${esc(s.androidLatestVersion || '')}" style="max-width:160px"></label>
        <label>What's new (shown in the app's update window)<textarea id="setNotes" rows="3" maxlength="600" placeholder="e.g. Faster try-on, new frames, bug fixes.">${esc(s.androidUpdateNotes || '')}</textarea></label>
        <label>Minimum version (optional)<input id="setMinVer" placeholder="leave empty" value="${esc(s.androidMinVersion || '')}" style="max-width:160px"></label>
        <p class="small"><b>Share these links (they never change):</b><br>
          Download page: <a href="/download" target="_blank" rel="noopener">${esc(location.origin)}/download</a><br>
          Direct APK (always the newest version): <a href="/download/lensio.apk" target="_blank" rel="noopener">${esc(location.origin)}/download/lensio.apk</a></p>
        <p class="muted small">Customers on an older app than <b>Latest version</b> get an update window when they open the app; they can choose “Later”. Apps older than <b>Minimum version</b> can't skip it: use this only when an old app would stop working. Updating installs over the existing app, so customers stay signed in and keep their orders.</p></div>
      <div class="card"><h2>Automation</h2>
        <p class="muted small">Orders move on by themselves where no hands-on work is needed. Customers are messaged at each step.</p>
        <label class="check"><input type="checkbox" id="setAlerts" ${s.ownerEmailAlerts ? 'checked' : ''}> <span><b>Email me</b> about new orders, UPI payments to check, prescriptions to review, cancellations and courier problems (sent to every address in ADMIN_EMAILS)</span></label>
        <label class="check"><input type="checkbox" id="setAutoLens" ${s.autoStartLensWork ? 'checked' : ''}> <span>When a prescription is verified, <b>start lens cutting & fitting</b> automatically</span></label>
        <label class="check"><input type="checkbox" id="setFrameQc" ${s.frameOnlyToQc ? 'checked' : ''}> <span><b>Frame-only orders</b> skip the lens steps and go straight to quality check</span></label>
        <label class="check"><input type="checkbox" id="setAutoRx" ${s.autoApproveTypedRx ? 'checked' : ''}> <span><b>Auto-approve typed prescriptions</b> that pass every check and aren't high power. Uploaded photos and high powers are always reviewed by a person. Leave this off if your optician should check every prescription.</span></label>
        <p class="muted small" style="margin:0">Courier steps (picked up, in transit, out for delivery, delivered) are automatic once Shiprocket is connected. Until then, add them under an order's <b>Courier & live tracking</b>.</p>
        <div><button class="btn" data-act="enableNotif">${'Notification' in window && Notification.permission === 'granted' ? '✓ Desktop pop-ups are on' : '🔔 Turn on desktop pop-ups'}</button></div></div>
      <div class="card"><h2>Cash on delivery</h2><label class="check"><input type="checkbox" id="setCod" ${s.codEnabled ? 'checked' : ''}> Offer Cash on Delivery (₹49 fee, orders up to ₹10,000)</label></div>
      <div class="err" id="serr"></div>
      <div><button class="btn p" data-act="saveSettings">Save settings</button></div></div>`);
  }

  // Prescription review
  function rxView() {
    const list = S.data.rx;
    if (!list) return shell('<p class="muted">Loading…</p>');
    const n = (v) => (v == null ? '' : Number(v));
    return shell(`<div class="bar"><h1 class="grow">Prescriptions to check</h1><span class="muted small">${list.length} waiting</span></div>
      ${list.length ? list.map((p) => `<div class="card" style="margin-bottom:18px" data-rx="${p.id}">
        <div class="bar" style="margin:0"><h2 class="grow">${esc(p.user.name || 'Customer')} · ${esc(p.user.email || (p.user.phone ? '+91 ' + p.user.phone : ''))}</h2>${p.isHighPower ? '<span class="pill warn">High power</span>' : ''}
        <span class="small muted">${p.orderItems.map((i) => `${esc(i.order.orderNumber)} (${esc(i.lensPackage?.name || '')})`).join(', ')}</span></div>
        <div class="grid2" style="align-items:start">
          <div>${p.imageUrl ? `<a href="${esc(p.imageUrl)}" target="_blank" rel="noopener"><img class="rximg" src="${esc(p.imageUrl)}" alt="Prescription photo"></a>` : '<p class="muted">Entered by the customer. Check the values look right.</p>'}</div>
          <div style="display:flex;flex-direction:column;gap:10px">
            <div class="eyes"><span></span><b class="small">SPH</b><b class="small">CYL</b><b class="small">AXIS</b><b class="small">ADD</b>
              ${['od', 'os'].map((e) => `<b class="small">${e === 'od' ? 'Right (OD)' : 'Left (OS)'}</b>${['Sph', 'Cyl', 'Axis', 'Add'].map((k) => `<input data-rxk="${e}.${k.toLowerCase()}" value="${n(p[e + k])}" inputmode="decimal" aria-label="${e} ${k}">`).join('')}`).join('')}</div>
            <label>PD (mm)<input data-rxk="pdTotal" value="${n(p.pdTotal)}" inputmode="decimal" style="max-width:140px"></label>
            <label>Note to customer (for rejections)<input data-rxk="note" placeholder="e.g. The photo is blurry. Please upload a clearer one."></label>
            <div class="err" data-rxerr></div>
            <div style="display:flex;gap:8px"><button class="btn p" data-act="rxReview" data-d="VERIFIED" data-id="${p.id}">Verify</button><button class="btn danger" data-act="rxReview" data-d="REJECTED" data-id="${p.id}">Reject</button></div>
          </div></div></div>`).join('') : '<div class="card"><p>Nothing to check. New prescriptions appear here when an order is placed.</p></div>'}`);
  }

  // ---------------- Render + data ----------------
  function render() {
    const app = $('#app');
    if (!S.token || !S.user) { app.innerHTML = loginView(); return; }
    const v = S.view;
    app.innerHTML = v === 'products' ? productsView() : v === 'edit' ? editorView() : v === 'pricing' ? pricingView()
      : v === 'orders' ? ordersView() : v === 'order' ? orderView() : v === 'settings' ? settingsView() : v === 'quick' ? quickView() : v === 'alerts' ? alertsView() : v === 'reviews' ? reviewsView() : v === 'rewards' ? rewardsView() : v === 'stores' ? storesView() : v === 'eyetest' ? eyeTestView() : v === 'ig' ? igView() : rxView();
    if (v === 'settings') drawTestQr();
    if (v === 'edit') wireDrop();
  }

  async function load(view) {
    S.view = view; render();
    try {
      if (view === 'products') S.data.products = await api('/admin/products' + (S.data.q ? '?q=' + encodeURIComponent(S.data.q) : ''));
      if (view === 'pricing') S.data.pricing = await api('/admin/pricing');
      if (view === 'orders') {
        const q = new URLSearchParams(); if (S.data.orderStatus) q.set('status', S.data.orderStatus); if (S.data.oq) q.set('q', S.data.oq); if (S.data.toCheck) q.set('toCheck', 'true');
        S.data.orders = await api('/admin/orders?' + q);
      }
      if (view === 'rx') S.data.rx = await api('/admin/prescriptions/queue');
      if (view === 'settings') S.data.settings = await api('/admin/settings');
      if (view === 'reviews') { S.data.settings = S.data.settings || await api('/admin/settings'); S.data.reviews = await api('/admin/reviews?status=' + (S.data.reviewFilter || 'PENDING')); }
      if (view === 'rewards') { S.data.settings = S.data.settings || await api('/admin/settings'); S.data.giftcards = await api('/admin/giftcards'); }
      if (view === 'stores') S.data.stores = await api('/admin/stores');
      if (view === 'eyetest') S.data.eyetests = await api('/admin/eye-test');
    } catch (e) { toast(e.message); }
    if (S.view === view) render();
  }

  async function uploadFiles(files, kind) {
    const out = [];
    for (const f of files) {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { toast(`${f.name}: use JPG, PNG or WebP`); continue; }
      if (f.size > 5 * 1024 * 1024) { toast(`${f.name} is over 5 MB`); continue; }
      const fd = new FormData(); fd.append('file', f); fd.append('kind', kind);
      try { toast(`Uploading ${f.name}…`); out.push((await api('/admin/uploads', { form: fd })).url); } catch (e) { toast(e.message); }
    }
    return out;
  }

  // Test QR preview uses the same UPI link format the app uses (₹1).
  function drawTestQr() {
    const img = $('#testQr'); const s = S.data.settings; if (!img || !s?.upiId) return;
    const enc = (v) => encodeURIComponent(v).replace(/%40/g, '@');
    const uri = `upi://pay?pa=${enc(s.upiId)}&pn=${enc(s.upiPayeeName)}&am=1.00&cu=INR&tn=${enc('Lensio test')}`;
    img.src = '/v1/qr?data=' + encodeURIComponent(uri);
  }

  function wireDrop() {
    const d = $('#drop'); if (!d) return;
    ['dragenter', 'dragover'].forEach((ev) => d.addEventListener(ev, (e) => { e.preventDefault(); d.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => d.addEventListener(ev, (e) => { e.preventDefault(); d.classList.remove('over'); }));
    d.addEventListener('drop', async (e) => { const urls = await uploadFiles([...e.dataTransfer.files], 'products'); S.edit.images.push(...urls); render(); if (urls.length) toast('Photos added. Save to publish them.'); });
  }

  function productPayload() {
    const p = S.edit;
    const base = slugify(p.slug || p.name);
    return {
      name: p.name.trim(), slug: base, brand: p.brand || 'Lensio', description: p.description.trim() || p.name,
      shape: p.shape, material: p.material, gender: p.gender, isSunglasses: !!p.isSunglasses,
      basePrice: Math.round(+p.basePrice), mrp: Math.round(+p.mrp),
      lensWidthMm: +p.lensWidthMm, bridgeMm: +p.bridgeMm, templeMm: +p.templeMm, frameWidthMm: +p.frameWidthMm,
      weightGrams: p.weightGrams === '' || p.weightGrams == null ? null : +p.weightGrams, tryOnImage: p.tryOnImage || null, isActive: p.isActive, instagramPostUrl: (p.instagramPostUrl || '').trim().split('?')[0] || null,
      images: p.images,
      variants: p.variants.map((v, i) => ({ ...(v.id ? { id: v.id } : {}), sku: (v.sku || `${base}-${slugify(v.colorName) || i}-${v.size[0]}`).toUpperCase().slice(0, 60),
        colorName: v.colorName.trim(), colorHex: v.colorHex, size: v.size, stock: Math.max(0, parseInt(v.stock, 10) || 0), priceDelta: Math.round(+v.priceDelta || 0) })),
    };
  }

  // ---------------- Events ----------------
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
    const act = el.dataset.act;
    try {
      if (act === 'nav') { S.edit = null; return load(el.dataset.v); }
      if (act === 'logout') return logout();
      if (act === 'loginToCode') { S.login = { step: 'codeEmail', email: $('#lemail')?.value || S.login.email }; return render(); }
      if (act === 'loginToPassword') { S.login = { step: 'password', email: $('#lemail')?.value || S.login.email }; return render(); }
      if (act === 'loginPassword') {
        S.login.email = $('#lemail').value.trim(); S.login.err = '';
        return finishLogin(await api('/auth/login', { body: { email: S.login.email, password: $('#lpass').value } }));
      }
      if (act === 'sendCode') {
        S.login.email = $('#lemail').value.trim(); S.login.err = '';
        await api('/auth/email-code/send', { body: { email: S.login.email } }); S.login.step = 'code'; return render();
      }
      if (act === 'verifyCode') {
        const np = $('#lnewpass').value;
        return finishLogin(await api('/auth/email-code/verify', { body: { email: S.login.email, code: $('#lcode').value.trim(), ...(np ? { newPassword: np } : {}) } }));
      }
      if (act === 'enableNotif') {
        if (!('Notification' in window)) return toast('This browser does not support desktop pop-ups');
        const r = await Notification.requestPermission(); toast(r === 'granted' ? 'Desktop pop-ups are on' : 'Pop-ups were blocked in the browser'); return render();
      }
      if (act === 'alertsOpen') {
        S.alerts.unseen = 0; document.title = 'Lensio admin';
        if (!S.alerts.list.length) { toast('No new alerts. New orders and payments show up here.'); return render(); }
        S.view = 'alerts'; return render();
      }
      if (act === 'openAlert') { S.alerts.unseen = 0; S.view = 'order'; S.data.order = null; render(); S.data.order = await api('/admin/orders/' + el.dataset.id); return render(); }
      if (act === 'quickAdd' || act === 'quickMore') { if (act === 'quickAdd') S.quick = []; return $('#quickInput').click(); }
      if (act === 'quickDel') { S.quick.splice(+el.dataset.i, 1); return render(); }
      if (act === 'quickSave') return quickSave(el);
      if (act === 'newProduct') { S.edit = blankProduct(); S.view = 'edit'; return render(); }
      if (act === 'editProduct') {
        const p = await api('/admin/products/' + el.dataset.id);
        S.edit = { ...p, images: p.images.map((i) => i.url), weightGrams: p.weightGrams ?? '', _slugTouched: true }; S.view = 'edit'; return render();
      }
      if (act === 'pickImages') return $('#imgInput').click();
      if (act === 'pickTryon') return $('#tryInput').click();
      if (act === 'tryonDel') { S.edit.tryOnImage = null; return render(); }
      if (act === 'imgDel') { S.edit.images.splice(+el.dataset.i, 1); return render(); }
      if (act === 'imgMove') { const i = +el.dataset.i, j = i + +el.dataset.d, a = S.edit.images; [a[i], a[j]] = [a[j], a[i]]; return render(); }
      if (act === 'varAdd') { const last = S.edit.variants.at(-1); S.edit.variants.push({ sku: '', colorName: '', colorHex: '#6B3E26', size: last?.size || sizeFor(+S.edit.frameWidthMm), stock: 10, priceDelta: 0 }); return render(); }
      if (act === 'varDel') { S.edit.variants.splice(+el.dataset.i, 1); return render(); }
      if (act === 'toggleActive') {
        S.edit.isActive = !S.edit.isActive; await api('/admin/products/' + S.edit.id, { method: 'PATCH', body: { isActive: S.edit.isActive } });
        toast(S.edit.isActive ? 'Frame is live in the app' : 'Frame hidden from the app'); return render();
      }
      if (act === 'saveProduct') {
        const err = $('#perr'); err.textContent = '';
        const p = S.edit;
        if (!p.name.trim()) { err.textContent = 'Give the frame a name.'; return; }
        if (!(+p.basePrice > 0) || !(+p.mrp > 0)) { err.textContent = 'Enter the selling price and MRP.'; return; }
        if (p.variants.some((v) => !v.colorName.trim())) { err.textContent = 'Every colour needs a name.'; return; }
        if (!p.images.length && !confirm('This frame has no photos. Save anyway?')) return;
        el.disabled = true;
        try {
          const body = productPayload();
          const saved = p.id ? await api('/admin/products/' + p.id, { method: 'PUT', body }) : await api('/admin/products', { body });
          toast(p.id ? 'Changes saved' : 'Frame added'); S.edit = null; S.data.products = null; return load('products');
        } catch (x) { err.textContent = x.message; el.disabled = false; return; }
      }
      if (act === 'addTrack') {
        const message = $('#trMsg').value.trim();
        if (message.length < 2) return toast('Type an update, e.g. "Out for delivery"');
        el.disabled = true;
        await api(`/admin/orders/${S.data.order.id}/tracking`, { body: { message, location: $('#trLoc').value.trim() || undefined,
          courierName: $('#trCourier').value.trim() || undefined, awbCode: $('#trAwb').value.trim() || undefined, trackingUrl: $('#trUrl').value.trim() || '' } });
        toast('Update sent to the customer'); S.data.order = await api('/admin/orders/' + S.data.order.id); return render();
      }
      if (act === 'delTrack') {
        if (!confirm('Delete this update?')) return;
        await api(`/admin/orders/${S.data.order.id}/tracking/${el.dataset.id}`, { method: 'DELETE' });
        S.data.order = await api('/admin/orders/' + S.data.order.id); return render();
      }
      if (act === 'toggleToCheck') { S.data.toCheck = !S.data.toCheck; return load('orders'); }
      if (act === 'confirmPay') {
        if (!confirm(`Confirm that ${inr(S.data.order.total)} has arrived in your account?`)) return;
        el.disabled = true; await api(`/admin/orders/${S.data.order.id}/confirm-payment`, { body: {} });
        toast('Payment confirmed. Order placed.'); S.data.order = await api('/admin/orders/' + S.data.order.id); return render();
      }
      if (act === 'agentShare') {
        window.open('https://wa.me/?text=' + encodeURIComponent(agentText(S.data.order)), '_blank', 'noopener');
        if (confirm('Also tell the customer the order is out for delivery?')) {
          await api(`/admin/orders/${S.data.order.id}/out-for-delivery`, { body: {} });
          if (!S.whatsappAuto) {
            const o = S.data.order, cod = o.paymentMethod === 'COD' && !o.payments.some((p) => p.status === 'COD_COLLECTED');
            setTimeout(() => window.open(waTo(o.address.phone, `Hi ${o.address.fullName}, your Lensio order ${o.orderNumber} is *out for delivery*. ${cod ? `Please keep ${inr(o.total)} ready in cash. ` : ''}Our delivery partner will call you before arriving.`), '_blank', 'noopener'), 400);
          }
          toast('Customer told: out for delivery');
        }
        return;
      }
      if (act === 'agentCopy') {
        try { await navigator.clipboard.writeText(agentText(S.data.order)); toast('Delivery details copied'); }
        catch { prompt('Copy these details:', agentText(S.data.order)); }
        return;
      }
      if (act === 'codCollected') {
        if (!confirm(`Confirm that ${inr(S.data.order.total)} cash has been received?`)) return;
        el.disabled = true; await api(`/admin/orders/${S.data.order.id}/cod-collected`, { body: {} });
        toast('Cash marked as collected'); S.data.order = await api('/admin/orders/' + S.data.order.id); return render();
      }
      if (act === 'rejectPay') {
        const reason = prompt('Tell the customer what went wrong', 'We could not find this payment. Check the UPI reference number and enter it again.');
        if (!reason) return;
        await api(`/admin/orders/${S.data.order.id}/reject-payment`, { body: { reason } });
        toast('Customer asked to check their payment'); S.data.order = await api('/admin/orders/' + S.data.order.id); return render();
      }
      if (act === 'pickQr') return $('#qrInput').click();
      if (act === 'qrDel') { S.data.settings = await api('/admin/settings', { method: 'PUT', body: { upiQrImage: null } }); toast('QR image removed'); return render(); }
      if (act === 'saveSettings') {
        $('#serr').textContent = '';
        try {
          S.data.settings = await api('/admin/settings', { method: 'PUT', body: {
            upiId: $('#setUpi').value.trim() || null, upiPayeeName: $('#setPayee').value.trim() || 'Lensio', codEnabled: $('#setCod').checked,
            androidApkUrl: $('#setApk').value.trim() || null, androidLatestVersion: $('#setVer').value.trim() || null, androidMinVersion: $('#setMinVer').value.trim() || null, androidUpdateNotes: $('#setNotes').value.trim() || null, shopInfo: $('#setInfo').value.trim() || null,
            instagramUrl: ($('#setInsta').value.trim().split('?')[0]) || null,
            ownerEmailAlerts: $('#setAlerts').checked, autoStartLensWork: $('#setAutoLens').checked,
            frameOnlyToQc: $('#setFrameQc').checked, autoApproveTypedRx: $('#setAutoRx').checked,
            loyaltyEnabled: $('#setLoyal').checked, loyaltyPointsPer100: Math.max(0, parseInt($('#setPts').value, 10) || 0),
            loyaltyMaxRedeemPercent: Math.min(100, Math.max(0, parseInt($('#setPtsMax').value, 10) || 0)), reviewsAutoApprove: $('#setRevAuto').checked } });
          toast('Settings saved'); return render();
        } catch (x) { $('#serr').textContent = x.message; return; }
      }
      if (act === 'igOpen') return igLoad();
      if (act === 'igConnect') {
        $('#igErr').textContent = '';
        try { const r = await api('/admin/instagram/token', { method: 'PUT', body: { token: $('#igToken').value } }); toast(`Connected to @${r.username}`); return igLoad(); }
        catch (x) { $('#igErr').textContent = x.message; return; }
      }
      if (act === 'igDisconnect') { if (!confirm('Disconnect Instagram?')) return; await api('/admin/instagram/token', { method: 'DELETE' }); return igLoad(); }
      if (act === 'igMore') {
        const r = await api('/admin/instagram/posts?after=' + encodeURIComponent(S.data.ig.next));
        S.data.ig.posts.push(...igPrep(r.posts)); S.data.ig.next = r.next; return render();
      }
      if (act === 'igImport') {
        const sel = S.data.ig.posts.filter((p) => p._on && !p.imported);
        for (const p of sel) p._err = !p.f.name?.trim() ? 'Name needed' : !(+p.f.price > 0) ? 'Price needed' : '';
        if (sel.some((p) => p._err)) return render();
        el.disabled = true; toast(`Importing ${sel.length} post${sel.length > 1 ? 's' : ''}… this can take a minute`);
        const res = await api('/admin/instagram/import', { body: { items: sel.map((p) => ({ id: p.id, name: p.f.name.trim(), price: +p.f.price, mrp: +p.f.mrp || null,
          shape: p.f.shape, gender: p.f.gender, sunglasses: !!p.f.sunglasses, stock: parseInt(p.f.stock, 10) || 0 })) } });
        let ok = 0;
        for (const r of res) { const p = S.data.ig.posts.find((x) => x.id === r.id); if (!p) continue; if (r.ok) { ok++; p.imported = true; p._on = false; } else p._err = r.error; }
        toast(`${ok} frame${ok === 1 ? '' : 's'} added from Instagram`); return render();
      }
      if (act === 'quickCaption') {
        const cap = prompt('Paste the Instagram caption for this photo:'); if (!cap) return;
        const g = await api('/admin/instagram/parse', { body: { caption: cap } });
        const r = S.quick[+el.dataset.i];
        Object.assign(r, { name: g.name, price: g.price ?? r.price, mrp: g.mrp ?? '', shape: g.shape, gender: g.gender, sun: g.sunglasses });
        toast('Filled from caption; check the details'); return render();
      }
      if (act === 'revFilter') { S.data.reviewFilter = el.dataset.v; S.data.reviews = null; return load('reviews'); }
      if (act === 'revMod') { await api(`/admin/reviews/${el.dataset.id}/moderate`, { body: { decision: el.dataset.d } }); toast(el.dataset.d === 'APPROVED' ? 'Review published' : 'Review hidden'); return load('reviews'); }
      if (act === 'revDel') { if (!confirm('Delete this review permanently?')) return; await api(`/admin/reviews/${el.dataset.id}`, { method: 'DELETE' }); toast('Review deleted'); return load('reviews'); }
      if (act === 'gcIssue') {
        const v = +$('#gcValue').value; $('#gcErr').textContent = '';
        if (!(v > 0)) { $('#gcErr').textContent = 'Enter the gift card value in rupees.'; return; }
        try {
          const c = await api('/admin/giftcards', { body: { valueRupees: v, purchaserName: $('#gcBuyer').value.trim() || undefined, recipientEmail: $('#gcTo').value.trim() || undefined,
            message: $('#gcMsg').value.trim() || undefined, expiresAt: $('#gcExp').value || undefined } });
          toast(`Gift card ${c.code} created`); return load('rewards');
        } catch (x) { $('#gcErr').textContent = x.message; return; }
      }
      if (act === 'lpAdjust') {
        $('#lpErr').textContent = '';
        try {
          const u = await api('/admin/loyalty/adjust', { body: { email: $('#lpEmail').value.trim(), points: parseInt($('#lpPts').value, 10) || 0, note: $('#lpNote').value.trim() || undefined } });
          toast(`${u.email} now has ${u.pointsBalance} points`); $('#lpPts').value = '';
        } catch (x) { $('#lpErr').textContent = x.message; }
        return;
      }
      if (act === 'storeNew') { S.data.storeEdit = { isActive: true }; return render(); }
      if (act === 'storeEdit') { S.data.storeEdit = { ...S.data.stores.find((x) => x.id === el.dataset.id) }; return render(); }
      if (act === 'storeCancel') { S.data.storeEdit = null; return render(); }
      if (act === 'storeDel') { if (!confirm('Delete this store?')) return; await api(`/admin/stores/${S.data.storeEdit.id}`, { method: 'DELETE' }); S.data.storeEdit = null; toast('Store deleted'); return load('stores'); }
      if (act === 'storeSave') {
        const e = S.data.storeEdit; $('#stErr').textContent = '';
        const num = (v) => (v === '' || v == null ? undefined : Number(v));
        const body = { name: e.name, addressLine: e.addressLine, city: e.city, state: e.state, pincode: String(e.pincode || '').trim(), phone: e.phone || undefined,
          hours: e.hours || undefined, latitude: num(e.latitude), longitude: num(e.longitude), isActive: e.isActive !== false, sortOrder: e.sortOrder || 0 };
        try { await api('/admin/stores' + (e.id ? '/' + e.id : ''), { method: e.id ? 'PUT' : 'POST', body }); S.data.storeEdit = null; toast('Store saved'); return load('stores'); }
        catch (x) { $('#stErr').textContent = x.message; return; }
      }
      if (act === 'etSet') {
        const id = el.dataset.id, g = (k) => $(`[data-et="${id}"][data-k="${k}"]`)?.value;
        const body = { status: el.dataset.s, staffNote: g('staffNote') || undefined, ...(g('scheduledFor') ? { scheduledFor: new Date(g('scheduledFor')).toISOString() } : {}) };
        if (el.dataset.s === 'CANCELLED' && !confirm('Cancel this request?')) return;
        await api(`/admin/eye-test/${id}`, { body }); toast('Updated'); return load('eyetest');
      }
      if (act === 'openOrder') { S.view = 'order'; S.data.order = null; render(); S.data.order = await api('/admin/orders/' + el.dataset.id); return render(); }
      if (act === 'setStatus') {
        const s = el.dataset.s;
        if (s === 'CANCELLED' && !confirm('Cancel this order? Stock goes back and any online payment is refunded.')) return;
        el.disabled = true;
        await api(`/admin/orders/${S.data.order.id}/status`, { body: { status: s } });
        toast('Moved to ' + tc(s)); S.data.order = await api('/admin/orders/' + S.data.order.id);
        if (!S.whatsappAuto && confirm('Send this update to the customer on WhatsApp now?')) {
          window.open(waTo(S.data.order.address.phone, customerUpdateText(S.data.order)), '_blank', 'noopener');
        }
        return render();
      }
      if (act === 'rxReview') {
        const card = el.closest('[data-rx]'); const g = (k) => card.querySelector(`[data-rxk="${k}"]`).value.trim();
        const num = (k) => (g(k) === '' ? null : Number(g(k)));
        const decision = el.dataset.d;
        const body = { decision, note: g('note') || undefined };
        if (decision === 'VERIFIED') body.values = {
          od: { sph: num('od.sph'), cyl: num('od.cyl'), axis: num('od.axis'), add: num('od.add') },
          os: { sph: num('os.sph'), cyl: num('os.cyl'), axis: num('os.axis'), add: num('os.add') }, pdTotal: num('pdTotal'),
        };
        try { await api(`/admin/prescriptions/${el.dataset.id}/review`, { body }); toast(decision === 'VERIFIED' ? 'Verified. The order moves to lens cutting.' : 'Rejected'); return load('rx'); }
        catch (x) { card.querySelector('[data-rxerr]').innerHTML = esc(x.message) + (x.details?.errors ? '<br>' + x.details.errors.map((y) => esc(y.message)).join('<br>') : ''); }
      }
    } catch (x) { toast(x.message); if (['loginPassword', 'sendCode', 'verifyCode'].includes(act)) { S.login.err = x.message; render(); } }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || S.user) return;
    const b = $('.login .btn.p'); if (b) b.click();
  });

  // Field edits in the product editor
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (S.view === 'edit' && S.edit) {
      if (t.dataset.f) {
        const k = t.dataset.f;
        S.edit[k] = t.type === 'checkbox' ? t.checked : t.hasAttribute('data-money') ? (t.value === '' ? '' : Math.round(+t.value * 100)) : t.value;
        if (k === 'slug') S.edit._slugTouched = true;
        if (k === 'name' && !S.edit._slugTouched) { S.edit.slug = slugify(t.value); const s = $('[data-f="slug"]'); if (s) s.value = S.edit.slug; }
        if (k === 'frameWidthMm') { const l = $('#sizeLine'); if (l) l.innerHTML = `Size band: <b>${tc(sizeFor(+t.value))}</b> (under 132 small, 132–140 medium, over 140 wide).`; }
        if (k === 'basePrice' || k === 'mrp') { const p = S.edit, off = p.mrp && p.basePrice ? Math.round((1 - p.basePrice / p.mrp) * 100) : 0; const l = $('#offLine'); if (l) l.firstChild.textContent = off > 0 ? `Shows as ${off}% off in the app. ` : 'Set MRP higher than the selling price to show a discount. '; }
      }
      if (t.dataset.v !== undefined && t.dataset.k) {
        const v = S.edit.variants[+t.dataset.v];
        v[t.dataset.k] = t.dataset.k === 'priceDelta' ? Math.round(+t.value * 100) : t.value;
      }
    }
    if (t.dataset.igi !== undefined && S.data.ig?.posts) {
      const p = S.data.ig.posts[+t.dataset.igi]; const k = t.dataset.k; const v = t.type === 'checkbox' ? t.checked : t.value;
      if (k === '_on') { p._on = v; render(); } else p.f[k] = v;
    }
    if (t.dataset.st !== undefined && S.data.storeEdit) S.data.storeEdit[t.dataset.st] = t.type === 'checkbox' ? t.checked : t.value;
    if (t.dataset.q !== undefined && S.quick) {
      const r = S.quick[+t.dataset.q]; if (r) r[t.dataset.k] = t.type === 'checkbox' ? t.checked : t.value;
    }
    if (t.id === 'psearch') { clearTimeout(t._h); t._h = setTimeout(() => { S.data.q = t.value; load('products').then(() => { const s = $('#psearch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }); }, 350); }
    if (t.id === 'osearch') { clearTimeout(t._h); t._h = setTimeout(() => { S.data.oq = t.value; load('orders').then(() => { const s = $('#osearch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }); }, 350); }
  });

  document.addEventListener('change', async (e) => {
    const t = e.target;
    try {
      if (t.dataset.gc) { await api(`/admin/giftcards/${t.dataset.gc}`, { method: 'PATCH', body: { isActive: t.checked } }); toast(t.checked ? 'Gift card active' : 'Gift card turned off'); }
      if (t.id === 'quickInput') { const fs = [...t.files]; t.value = ''; if (fs.length) quickFiles(fs); }
      if (t.id === 'imgInput') { const urls = await uploadFiles([...t.files], 'products'); S.edit.images.push(...urls); render(); if (urls.length) toast('Photos added. Save to publish them.'); }
      if (t.id === 'tryInput') { const [u] = await uploadFiles([...t.files].slice(0, 1), 'tryon'); if (u) { S.edit.tryOnImage = u; render(); } }
      if (t.id === 'qrInput') { const [u] = await uploadFiles([...t.files].slice(0, 1), 'settings'); if (u) { S.data.settings = await api('/admin/settings', { method: 'PUT', body: { upiQrImage: u } }); toast('QR image saved'); render(); } }
      if (t.id === 'ostatus') { S.data.orderStatus = t.value; load('orders'); }
      if (t.dataset.price) {
        const price = Math.round(+t.value * 100); if (!(price >= 0)) return toast('Enter a price of 0 or more');
        await api(`/admin/${t.dataset.price === 'lens' ? 'lens-packages' : 'coatings'}/${t.dataset.id}`, { method: 'PATCH', body: { price } }); toast('Price saved');
      }
      if (t.dataset.active) {
        const path = { lens: 'lens-packages', coat: 'coatings', coupon: 'coupons' }[t.dataset.active];
        await api(`/admin/${path}/${t.dataset.id}`, { method: 'PATCH', body: { isActive: t.checked } }); toast('Saved');
      }
    } catch (x) { toast(x.message); }
  });

  // Boot
  (async () => {
    // When the WhatsApp Business API is connected, updates go out automatically; otherwise offer one-tap sending from your own WhatsApp.
    api('/config').then((c) => { S.whatsappAuto = !!c.auth?.otpWhatsApp; }).catch(() => {});
    if (S.token) { try { S.user = await api('/auth/me'); if (!['ADMIN', 'OPTICIAN'].includes(S.user.role)) logout(); } catch { S.token = null; } }
    if (S.user) { if (location.hash.includes('order=')) openFromHash(); else load('products'); } else render();
  })();
})();
