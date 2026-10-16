/*
 * Lensio 3D try-on (three.js). Builds a real 3D frame (rims, bridge, lenses, temple arms) from the frame's
 * shape, size, material and colour, or loads the frame's own GLB/glTF model when the shop has added one.
 * Head pose comes from the 478-point face mesh: the frame turns, nods and tilts with the head, and an
 * invisible head shape hides the arms behind the head. Coordinates: millimetres for the model, screen pixels
 * for the scene (orthographic camera, y up, z towards the viewer).
 */
(function () {
  const T = window.THREE;
  const L3D = { supported: false, ready: false, visible: false };
  window.Lensio3D = L3D;
  if (!T) return;
  try { const c = document.createElement('canvas'); L3D.supported = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { L3D.supported = false; }
  if (!L3D.supported) return;

  let renderer, scene, camera, root, frameObj, occluder, stageEl, W = 1, H = 1, currentKey = '';

  L3D.init = function (stage) {
    stageEl = stage;
    renderer = new T.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    const cv = renderer.domElement;
    cv.id = 'view3d'; cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:none;z-index:3';
    stage.appendChild(cv);
    scene = new T.Scene();
    camera = new T.OrthographicCamera(-1, 1, 1, -1, -5000, 5000);
    scene.add(new T.HemisphereLight(0xffffff, 0x2a3048, 0.55));
    const key = new T.DirectionalLight(0xffffff, 0.75); key.position.set(-0.4, 0.8, 1); scene.add(key);
    const rim = new T.DirectionalLight(0xbfd7ff, 0.5); rim.position.set(0.6, 0.2, -0.6); scene.add(rim);
    root = new T.Group(); scene.add(root);
    // Invisible head: writes depth only, so arms going behind the head are hidden like real glasses.
    occluder = new T.Mesh(new T.SphereGeometry(1, 32, 24), new T.MeshBasicMaterial({ colorWrite: false }));
    occluder.renderOrder = -1; scene.add(occluder);
    L3D.resize(); L3D.ready = true;
  };

  L3D.resize = function () {
    if (!renderer || !stageEl) return;
    W = stageEl.clientWidth || 1; H = stageEl.clientHeight || 1;
    renderer.setSize(W, H, false);
    camera.left = -W / 2; camera.right = W / 2; camera.top = H / 2; camera.bottom = -H / 2; camera.updateProjectionMatrix();
  };

  L3D.show = function (on) { L3D.visible = on; if (renderer) renderer.domElement.style.display = on ? 'block' : 'none'; if (on) draw(); };
  L3D.canvas = () => renderer && renderer.domElement;

  // ---------- frame model (mm, x right, y up, z towards the viewer; front of the frame at z = 0) ----------
  function outline(shape, a) {
    const pts = [], N = 72;
    const se = (n, b) => { for (let i = 0; i < N; i++) { const t = (i / N) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t); pts.push([a * Math.sign(c) * Math.abs(c) ** (2 / n), b * Math.sign(s) * Math.abs(s) ** (2 / n)]); } };
    switch (shape) {
      case 'ROUND': se(2, a * 0.93); break;
      case 'OVAL': se(2, a * 0.7); break;
      case 'SQUARE': se(4.5, a * 0.84); break;
      case 'WAYFARER': se(4, a * 0.72); for (const p of pts) { if (p[1] > 0) p[0] *= 1 + 0.08 * (p[1] / (a * 0.72)); else p[0] *= 1 - 0.08 * (-p[1] / (a * 0.72)); } break;
      case 'CAT_EYE': se(3.2, a * 0.64); for (const p of pts) if (p[0] > 0 && p[1] > 0) p[1] += (p[0] / a) ** 2 * a * 0.32; break;
      case 'AVIATOR': se(2.4, a * 0.8); for (const p of pts) if (p[1] < 0) p[1] *= 1 + 0.32 * Math.max(0, -p[0] / a + 0.2); break;
      case 'GEOMETRIC': for (let i = 0; i < 6; i++) { const t = (i / 6) * Math.PI * 2; pts.push([a * Math.cos(t), a * 0.85 * Math.sin(t)]); } break;
      default: se(5, a * 0.58);                    // rectangle
    }
    return pts;
  }
  const toShape = (pts, ox, mirror) => { const s = new T.Shape(); pts.forEach(([x, y], i) => { const X = ox + (mirror ? -x : x); i ? s.lineTo(X, y) : s.moveTo(X, y); }); s.closePath(); return s; };

  function buildFrame(f, hex) {
    const g = new T.Group();
    const a = (f.lensWidthMm || 52) / 2, br = f.bridgeMm || 18, cx = br / 2 + a, temple = f.templeMm || 140;
    const metal = /METAL|TITANIUM/.test(f.material || ''), rimW = metal ? 1.3 : f.material === 'TR90' ? 2.6 : 3.4, depth = metal ? 1.6 : 4.2;
    const col = new T.Color(hex || '#1B1F3B');
    const mat = new T.MeshStandardMaterial({ color: col, metalness: metal ? 0.85 : 0.08, roughness: metal ? 0.28 : 0.38 });
    const pts = outline(f.shape, a), outer = pts.map(([x, y]) => { const r = Math.hypot(x, y) || 1; return [x + (x / r) * rimW, y + (y / r) * rimW]; });
    const lensMat = new T.MeshPhysicalMaterial(f.isSunglasses
      ? { color: col.clone().multiplyScalar(0.25), transparent: true, opacity: 0.82, roughness: 0.05, metalness: 0.1 }
      : { color: 0xddeeff, transparent: true, opacity: 0.12, roughness: 0.02, metalness: 0, clearcoat: 1 });
    let top = 0;
    for (const side of [-1, 1]) {
      const ox = side * cx, mirror = side < 0;              // nose side towards the middle
      const rimShape = toShape(outer, ox, mirror); rimShape.holes.push(toShape(pts, ox, mirror));
      const rimGeo = new T.ExtrudeGeometry(rimShape, { depth, bevelEnabled: true, bevelSize: 0.5, bevelThickness: 0.5, bevelSegments: 2, curveSegments: 8 });
      rimGeo.translate(0, 0, -depth / 2);
      g.add(new T.Mesh(rimGeo, mat));
      const lens = new T.Mesh(new T.ShapeGeometry(toShape(pts, ox, mirror)), lensMat); lens.position.z = -0.3; g.add(lens);
      top = Math.max(top, ...pts.map((p) => p[1]));
    }
    // bridge
    const by = top * 0.45;
    const bridge = new T.TubeGeometry(new T.QuadraticBezierCurve3(new T.Vector3(-br / 2 - 1, by, 0), new T.Vector3(0, by + br * 0.28, 1.5), new T.Vector3(br / 2 + 1, by, 0)), 16, metal ? 0.9 : 2, 8, false);
    g.add(new T.Mesh(bridge, mat));
    // hinges + temple arms going back to the ears (slightly outwards, bending down behind the ear)
    const hingeY = top * 0.55, hx = cx + a + rimW * 0.5;
    for (const side of [-1, 1]) {
      const x0 = side * hx;
      const end = new T.Mesh(new T.BoxGeometry(5, 4, depth + 1), mat); end.position.set(x0, hingeY, -depth / 2); g.add(end);
      const curve = new T.CatmullRomCurve3([
        new T.Vector3(x0, hingeY, -depth), new T.Vector3(x0 + side * 4, hingeY - 1, -temple * 0.45),
        new T.Vector3(x0 + side * 6, hingeY - 3, -temple * 0.82), new T.Vector3(x0 + side * 5, hingeY - 14, -temple * 0.98),
      ]);
      g.add(new T.Mesh(new T.TubeGeometry(curve, 40, metal ? 1 : 1.8, 8, false), mat));
    }
    return g;
  }

  function fitModel(obj, f) {
    // GLB models come in any unit: scale so the front is as wide as the frame, then apply the shop's calibration.
    const cal = f.tryOn3d || {};
    const box = new T.Box3().setFromObject(obj), size = new T.Vector3(); box.getSize(size);
    const center = new T.Vector3(); box.getCenter(center);
    obj.position.sub(center);
    const wrap = new T.Group(); wrap.add(obj);
    const s = (cal.scale || 1) * (f.frameWidthMm || 138) / (size.x || 1);
    wrap.scale.setScalar(s);
    wrap.position.set(0, cal.offsetY || 0, cal.offsetZ || 0);
    wrap.rotation.x = ((cal.rotX || 0) * Math.PI) / 180;
    return wrap;
  }

  /** Shows a frame in 3D: its own GLB model if it has one, otherwise one built from its measurements. */
  L3D.setFrame = function (f, hex) {
    if (!L3D.ready || !f) return Promise.resolve();
    const url = f.tryOn3d && f.tryOn3d.url;
    const key = `${f.id}|${hex}|${url || ''}`;
    if (key === currentKey) return Promise.resolve();
    currentKey = key;
    const put = (obj) => { if (currentKey !== key) return; if (frameObj) root.remove(frameObj); frameObj = obj; root.add(obj); draw(); };
    if (url && T.GLTFLoader) {
      return new Promise((resolve) => {
        // loaded through the Lensio server (the page may only load files from its own server)
        new T.GLTFLoader().load(`/v1/catalog/products/${encodeURIComponent(f.id)}/model3d`, (gltf) => { put(fitModel(gltf.scene, f)); resolve(); }, undefined, () => { put(buildFrame(f, hex)); resolve(); });
      });
    }
    put(buildFrame(f, hex));
    return Promise.resolve();
  };

  /**
   * Places the frame on the face. lm: face-mesh landmarks; toScreen(p) maps a landmark to stage pixels (mirroring
   * included); zScale converts landmark depth to the same pixels; pdMm: the wearer's PD (default 63).
   */
  let pose = null;
  L3D.update = function (lm, toScreen, zScale, pdMm) {
    if (!L3D.ready || !lm || lm.length < 474) { pose = null; draw(); return; }
    const P = (i) => { const s = toScreen(lm[i]); return new T.Vector3(s.x - W / 2, H / 2 - s.y, -lm[i].z * zScale); };
    let Lp = P(468), Rp = P(473);
    if (Lp.x > Rp.x) [Lp, Rp] = [Rp, Lp];
    const top = P(10), chin = P(152);
    const x = Rp.clone().sub(Lp), eyePx = x.length(); x.normalize();
    const y = top.clone().sub(chin); y.sub(x.clone().multiplyScalar(y.dot(x))).normalize();
    const z = new T.Vector3().crossVectors(x, y).normalize();
    const pxPerMm = eyePx / (pdMm || 63);
    const mid = Lp.clone().add(Rp).multiplyScalar(0.5);
    const next = { x, y, z, pxPerMm, mid, faceW: P(234).distanceTo(P(454)) };
    // light smoothing so small jitters don't shake the frame
    if (pose) {
      const k = 0.5;
      for (const key of ['x', 'y', 'z', 'mid']) next[key] = pose[key].clone().lerp(next[key], k);
      next.x.normalize(); next.y.normalize(); next.z.normalize();
      next.pxPerMm = pose.pxPerMm + (next.pxPerMm - pose.pxPerMm) * k;
    }
    pose = next;
    draw();
  };
  L3D.clear = function () { pose = null; draw(); };

  function draw() {
    if (!renderer || !L3D.visible) return;
    if (pose && frameObj) {
      const m = new T.Matrix4().makeBasis(pose.x, pose.y, pose.z);
      root.quaternion.setFromRotationMatrix(m);
      root.scale.setScalar(pose.pxPerMm);
      // frame sits ~12 mm in front of the eyes, lens centres at pupil height
      root.position.copy(pose.mid).add(pose.z.clone().multiplyScalar(12 * pose.pxPerMm));
      root.visible = true;
      const r = pose.faceW * 0.5;
      occluder.scale.set(r * 1.02, r * 1.25, r * 1.1);
      occluder.quaternion.copy(root.quaternion);
      occluder.position.copy(pose.mid).sub(pose.z.clone().multiplyScalar(r * 1.05)).sub(pose.y.clone().multiplyScalar(r * 0.15));
      occluder.visible = true;
    } else { root.visible = false; occluder.visible = false; }
    renderer.render(scene, camera);
  }
})();
