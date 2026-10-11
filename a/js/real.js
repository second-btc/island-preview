// 반실사 에셋 (전부 CC0): Poly Haven 텍스처·HDR·고사리·범선, Quaternius 남녀 캐릭터·애니메이션, 직접 생성하는 식물·구름
(function (I) {
  const T = window.THREE;
  const DIR = 'assets/real/';
  const R = { tex: {}, wind: { value: 0 }, leafMats: [], ready: false };
  const tl = new T.TextureLoader();

  function tex(name, srgb) {
    const t = tl.load(DIR + 'tex/' + name);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    if (srgb) t.encoding = T.sRGBEncoding;
    t.anisotropy = 8;
    return t;
  }

  function loadTextures() {
    for (const k of ['sand', 'grass', 'jungle', 'bark', 'deck', 'thatch'])
      R.tex[k] = { diff: tex(k + '_diff.jpg', true), nor: tex(k + '_nor.jpg', false), rough: tex(k + '_rough.jpg', false) };
    R.tex.rock = { diff: tex('rock_diff.jpg', true), nor: tex('rock_nor.jpg', false) };
    R.tex.water = tex('waternormals.jpg', false);
  }

  // ---------- 바람: 잎·풀 재질의 정점을 시간에 따라 흔든다 ----------
  // sharp: 알파 경계를 화면 1픽셀로 날카롭게 + 멀리(작은 밉맵)서 잎이 가늘어지지 않게 알파를 보정 (Golus 방식).
  // 가는 잎이 멀리서 반투명 빗살·줄무늬로 보이던 것(야자 잎 모아레)을 막는다. alphaToCoverage와 함께 쓴다
  const SHARP_ALPHA = `
    #ifdef USE_ALPHATEST
      #ifdef USE_MAP
        { vec2 tsz = vec2(textureSize(map, 0)), ddx = dFdx(vUv * tsz), ddy = dFdy(vUv * tsz);
          float lod = max(0.0, 0.5 * log2(max(dot(ddx, ddx), dot(ddy, ddy))));
          diffuseColor.a *= 1.0 + lod * 0.2; }
      #endif
      diffuseColor.a = clamp((diffuseColor.a - alphaTest) / max(fwidth(diffuseColor.a), 0.0001) + 0.5, 0.0, 1.0);
      if (diffuseColor.a < 0.02) discard;
    #endif`;
  // 양면 잎의 뒷면 법선을 뒤집지 않는 정점 법선 그대로 (위로 기울여 둔 법선이 뒷면에서 아래를 향해 까맣게 되지 않게)
  const KEEP_NORMAL = 'float faceDirection = 1.0;\nvec3 normal = normalize( vNormal );\nvec3 geometryNormal = normal;';
  function windify(mat, amp, sharp, keepNormal) {
    mat.onBeforeCompile = (sh) => {
      if (keepNormal) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', KEEP_NORMAL);
      sh.uniforms.uWind = R.wind;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          #else
            vec3 ip = vec3(0.0);
          #endif
          float sway = sin(uWind * 1.6 + ip.x * 0.37 + ip.z * 0.29) * 0.6 + sin(uWind * 2.9 + ip.x * 0.8) * 0.4;
          float w = clamp(position.y, 0.0, 1.0) * ${amp.toFixed(3)};
          transformed.x += sway * w;
          transformed.z += cos(uWind * 1.3 + ip.z * 0.41) * w * 0.6;`);
      // 카메라 코앞의 잎은 점점 성기게(디더) 지운다: 덤불 속으로 들어간 카메라에 커다란 평면 잎이 화면을 막지 않게
      sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', `${sharp ? SHARP_ALPHA : '#include <alphatest_fragment>'}
          { float cdist = length(vViewPosition), dth = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
            if (cdist < 1.15 && dth > (cdist - 0.35) / 0.8) discard; }`);
    };
    R.leafMats.push(mat);
    return mat;
  }

  // ---------- 캔버스로 그리는 텍스처 ----------
  function canvas(w, h, draw) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new T.CanvasTexture(cv);
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 8;
    return t;
  }

  // 잎 텍스처: 캔버스에 그린 뒤, 투명한 곳에 가장 가까운 잎 색을 번지게 채운다.
  // (그냥 쓰면 투명 픽셀이 검정/흰색이라 멀리서 밉맵이 섞일 때 잎 가장자리에 테두리·빗살 무늬가 생긴다)
  function bledTexture(w, h, draw) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    draw(g, w, h);
    const src = g.getImageData(0, 0, w, h).data, out = new Uint8Array(w * h * 4);
    // 행 순서를 뒤집어 캔버스 텍스처와 같은 방향으로
    for (let y = 0; y < h; y++) out.set(src.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    let cur = out;
    for (let pass = 0; pass < 6; pass++) {
      const nxt = cur.slice();
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const k = (y * w + x) * 4;
          if (cur[k + 3] > 8 || (pass > 0 && cur[k] + cur[k + 1] + cur[k + 2] > 0)) continue;
          let r = 0, gg = 0, b = 0, n = 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const q = (yy * w + xx) * 4;
            if (cur[q] + cur[q + 1] + cur[q + 2] === 0 && cur[q + 3] <= 8) continue;
            r += cur[q]; gg += cur[q + 1]; b += cur[q + 2]; n++;
          }
          if (n) { nxt[k] = r / n; nxt[k + 1] = gg / n; nxt[k + 2] = b / n; }
        }
      cur = nxt;
    }
    const t = new T.DataTexture(cur, w, h, T.RGBAFormat);
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = T.LinearMipmapLinearFilter;
    t.magFilter = T.LinearFilter;
    t.wrapS = t.wrapT = T.ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
  }

  // 야자 잎: 가운데 잎맥 + 양옆으로 비스듬히 뻗은 작은 잎(소엽).
  // 가는 선 46쌍이던 때는 멀리서 빗살·줄무늬(모아레)로 보였다 → 30쌍으로 줄이고 가운데가 넓은 잎 모양으로 채워 그린다
  function frondTexture() {
    return bledTexture(256, 1024, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const cx = w / 2, N = 30;
      for (let i = 0; i < N; i++) {
        const t = (i + 0.5) / N, y = h * (1 - t) - 6;
        const len = Math.sin(Math.PI * Math.min(1, t * 1.08 + 0.05)) * (w * 0.47) * (0.86 + Math.random() * 0.2);
        for (const side of [-1, 1]) {
          const ang = side * (0.98 + t * 0.32 + (Math.random() - 0.5) * 0.14);
          const ex = cx + Math.sin(ang) * len, ey = y - Math.cos(ang) * len * 0.62 + len * 0.3;
          const wid = (13 + Math.random() * 5) * (0.7 + 0.3 * Math.sin(Math.PI * t)); // 잎 가운데 폭(px)
          const nx = -(ey - y), ny = ex - cx, nl = Math.hypot(nx, ny) || 1; // 잎 방향에 수직
          const mx = (cx + ex) / 2 + (nx / nl) * 2, my = (y + ey) / 2 + (ny / nl) * 2 - 5; // 살짝 휜 가운데
          const gr = g.createLinearGradient(cx, y, ex, ey);
          gr.addColorStop(0, `hsl(${92 + Math.random() * 10}, ${42 + Math.random() * 10}%, ${19 + Math.random() * 5}%)`);
          gr.addColorStop(0.55, `hsl(${84 + Math.random() * 12}, ${48 + Math.random() * 10}%, ${29 + Math.random() * 7}%)`);
          gr.addColorStop(1, `hsl(${76 + Math.random() * 14}, ${50 + Math.random() * 12}%, ${36 + Math.random() * 9}%)`);
          g.fillStyle = gr;
          g.beginPath();
          g.moveTo(cx, y - 3);
          g.quadraticCurveTo(mx + (nx / nl) * wid, my + (ny / nl) * wid, ex, ey);
          g.quadraticCurveTo(mx - (nx / nl) * wid * 0.8, my - (ny / nl) * wid * 0.8, cx, y + 3);
          g.closePath();
          g.fill();
          // 소엽 가운데 잎맥 (아주 옅게)
          g.strokeStyle = 'rgba(40, 52, 20, 0.35)';
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(cx, y);
          g.quadraticCurveTo(mx, my, ex, ey);
          g.stroke();
        }
      }
      g.strokeStyle = '#5b5a2c';
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(cx, h);
      g.lineTo(cx, 6);
      g.stroke();
    });
  }

  // 넓은 잎 뭉치 (열대 활엽수 수관용): 겹쳐진 타원 잎들
  function leafClusterTexture() {
    return canvas(512, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * w * 0.42;
        const x = w / 2 + Math.cos(a) * r, y = h / 2 + Math.sin(a) * r * 0.85;
        const L = 26 + Math.random() * 30, ang = Math.random() * Math.PI;
        const light = 22 + Math.random() * 26 + (1 - y / h) * 10;
        g.save();
        g.translate(x, y);
        g.rotate(ang);
        g.fillStyle = `hsl(${92 + Math.random() * 34}, ${32 + Math.random() * 22}%, ${light * 0.85}%)`;
        g.beginPath();
        g.ellipse(0, 0, L, L * 0.38, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = `hsla(90, 40%, ${light + 12}%, 0.5)`;
        g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(-L, 0); g.lineTo(L, 0); g.stroke();
        g.restore();
      }
    });
  }

  // 바나나 잎: 길고 넓은 잎, 가운데 잎맥, 군데군데 찢어진 가장자리
  function bananaTexture() {
    return canvas(256, 1024, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const cx = w / 2;
      for (let y = 8; y < h - 4; y += 3) {
        const t = y / h, half = Math.sin(Math.PI * Math.min(1, (1 - t) * 1.05 + 0.03)) * w * 0.46;
        const tear = Math.random() < 0.05 ? Math.random() * half * 0.9 : 0;
        const light = 30 + t * 10 + Math.random() * 4;
        g.fillStyle = `hsl(${100 + Math.random() * 8}, 55%, ${light}%)`;
        g.fillRect(cx - half + (tear && Math.random() < 0.5 ? tear : 0), y, half * 2 - tear, 3);
      }
      g.strokeStyle = 'hsl(80, 45%, 62%)';
      g.lineWidth = 7;
      g.beginPath(); g.moveTo(cx, h); g.lineTo(cx, 4); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.08)';
      g.lineWidth = 1;
      for (let y = 20; y < h; y += 14) { g.beginPath(); g.moveTo(cx, y); g.lineTo(0, y - 30); g.moveTo(cx, y); g.lineTo(w, y - 30); g.stroke(); }
    });
  }

  // 몬스테라 잎: 둥근 하트 모양 + 갈라진 틈과 구멍
  function monsteraTexture() {
    return canvas(512, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const gr = g.createRadialGradient(w * 0.5, h * 0.6, 20, w * 0.5, h * 0.5, w * 0.5);
      gr.addColorStop(0, '#2f6b2c');
      gr.addColorStop(1, '#1d4a1f');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(w * 0.5, h * 0.95);
      g.bezierCurveTo(w * -0.05, h * 0.8, w * 0.05, h * 0.05, w * 0.5, h * 0.12);
      g.bezierCurveTo(w * 0.95, h * 0.05, w * 1.05, h * 0.8, w * 0.5, h * 0.95);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI * 0.9 + (i / 8) * Math.PI * 0.8 + (i > 4 ? Math.PI * 0.2 : 0);
        g.lineWidth = 10;
        g.beginPath();
        g.moveTo(w * 0.5 + Math.cos(a) * w * 0.48, h * 0.55 + Math.sin(a) * h * 0.48);
        g.lineTo(w * 0.5 + Math.cos(a) * w * 0.3, h * 0.55 + Math.sin(a) * h * 0.3);
        g.stroke();
        g.beginPath();
        g.ellipse(w * 0.5 + Math.cos(a) * w * 0.2, h * 0.55 + Math.sin(a) * h * 0.2, 9, 5, a, 0, Math.PI * 2);
        g.fill();
      }
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = '#4f8a3c';
      g.lineWidth = 5;
      g.beginPath(); g.moveTo(w * 0.5, h * 0.95); g.lineTo(w * 0.5, h * 0.15); g.stroke();
    });
  }

  // 히비스커스 꽃 덤불: 잎 위에 빨강·분홍·노랑 꽃
  function flowerBushTexture() {
    return canvas(256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (let i = 0; i < 120; i++) {
        const x = w * (0.15 + Math.random() * 0.7), y = h * (0.25 + Math.random() * 0.75);
        g.fillStyle = `hsl(${100 + Math.random() * 25}, 50%, ${18 + Math.random() * 18}%)`;
        g.beginPath(); g.ellipse(x, y, 14, 6, Math.random() * 3, 0, Math.PI * 2); g.fill();
      }
      const cols = ['#e8343f', '#ff5e8a', '#ffb43a', '#ffffff'];
      for (let i = 0; i < 14; i++) {
        const x = w * (0.2 + Math.random() * 0.6), y = h * (0.25 + Math.random() * 0.55), c = cols[Math.floor(Math.random() * cols.length)];
        for (let k = 0; k < 5; k++) { g.fillStyle = c; g.beginPath(); g.ellipse(x + Math.cos(k * 1.26) * 7, y + Math.sin(k * 1.26) * 7, 7, 5, k * 1.26, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#ffe27a'; g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
      }
    });
  }

  // 부드러운 뭉게구름
  function cloudTexture() {
    return canvas(256, 256, (g, w, h) => {
      for (let i = 0; i < 40; i++) {
        const x = w * (0.2 + Math.random() * 0.6), y = h * (0.35 + Math.random() * 0.35), r = w * (0.08 + Math.random() * 0.16);
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.55)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
      }
    });
  }

  // 텐트 천: 주인 색 줄무늬
  function fabricTexture(color) {
    return canvas(128, 128, (g, w, h) => {
      g.fillStyle = color;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 12, h);
      for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    });
  }

  // ---------- 지오메트리 도우미 ----------
  function merge(geos) {
    const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
    const out = new T.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const total = parts.reduce((s, g) => s + g.attributes[name].array.length, 0);
      const arr = new Float32Array(total);
      let off = 0;
      for (const g of parts) { arr.set(g.attributes[name].array, off); off += g.attributes[name].array.length; }
      out.setAttribute(name, new T.BufferAttribute(arr, name === 'uv' ? 2 : 3));
    }
    return out;
  }

  // 수관을 둥근 덩어리처럼: 법선을 중심에서 바깥으로 기울이고, 안쪽·아래쪽 잎은 어둡게
  function shadeCanopy(g, c, k, rad) {
    const p = g.attributes.position, n = g.attributes.normal, col = new Float32Array(p.count * 3), v = new T.Vector3(), d = new T.Vector3();
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < p.count; i++) { minY = Math.min(minY, p.getY(i)); maxY = Math.max(maxY, p.getY(i)); }
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      d.copy(v).sub(c);
      const len = d.length();
      d.normalize();
      const nn = new T.Vector3(n.getX(i), n.getY(i), n.getZ(i));
      if (nn.dot(d) < 0) nn.negate(); // 양면 잎: 바깥쪽을 향하게
      nn.lerp(d, k).normalize();
      n.setXYZ(i, nn.x, nn.y, nn.z);
      const up = (v.y - minY) / Math.max(1e-4, maxY - minY), out = Math.min(1, len / rad);
      const ao = 0.62 + 0.38 * Math.min(1, up * 0.7 + out * 0.5);
      col[i * 3] = ao; col[i * 3 + 1] = ao; col[i * 3 + 2] = ao;
    }
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    return g;
  }

  // 야자수 한 그루 (높이 1 기준). seed로 휘어짐·잎 개수가 달라진다
  function palmGeometry(seed) {
    const rnd = I.rng.make(seed);
    const lean = 0.12 + rnd() * 0.22, curve = 0.6 + rnd() * 0.8;
    const center = (t) => new T.Vector3(lean * Math.pow(t, curve + 1), t, lean * 0.25 * Math.sin(t * 2));
    // 줄기: 마디가 있는 원통을 직접 쌓는다
    const N = 24, RS = 9, pos = [], nor = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, c = center(t), r = 0.042 * (1 - t * 0.38) * (1 + 0.07 * Math.abs(Math.sin(t * 46)));
      for (let j = 0; j <= RS; j++) {
        const a = (j / RS) * Math.PI * 2, nx = Math.cos(a), nz = Math.sin(a);
        pos.push(c.x + nx * r, c.y, c.z + nz * r);
        nor.push(nx, 0, nz);
        uv.push(j / RS, t * 5);
      }
    }
    for (let i = 0; i < N; i++)
      for (let j = 0; j < RS; j++) {
        const a = i * (RS + 1) + j, b = a + RS + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const trunk = new T.BufferGeometry();
    trunk.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    trunk.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    trunk.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    trunk.setIndex(idx);

    // 잎: 위로 솟았다가 처지는 띠 모양 판
    const top = center(1), fronds = [];
    const n = 15 + Math.floor(rnd() * 5);
    for (let k = 0; k < n; k++) {
      const az = (k / n) * Math.PI * 2 + rnd() * 0.4, L = 0.55 + rnd() * 0.22, W = 0.22 + rnd() * 0.06;
      const up0 = 0.55 + rnd() * 0.5, down = -0.9 - rnd() * 0.6, SEG = 7;
      const dir = new T.Vector3(Math.cos(az), 0, Math.sin(az)), side = new T.Vector3(-dir.z, 0, dir.x);
      const fp = [], fn = [], fu = [], fi = [];
      let p = top.clone();
      for (let s = 0; s <= SEG; s++) {
        const t = s / SEG, th = up0 + (down - up0) * t;
        if (s > 0) p = p.clone().add(dir.clone().multiplyScalar(Math.cos(th) * L / SEG)).add(new T.Vector3(0, Math.sin(th) * L / SEG, 0));
        const half = (W / 2) * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05));
        const droop = new T.Vector3(0, -half * 0.35, 0); // 잎 가장자리가 살짝 아래로 접힘
        for (const sd of [-1, 1]) {
          const q = p.clone().add(side.clone().multiplyScalar(sd * half)).add(droop);
          fp.push(q.x, q.y, q.z);
          fn.push(0, 1, 0);
          fu.push(sd < 0 ? 0 : 1, t);
        }
      }
      for (let s = 0; s < SEG; s++) { const a = s * 2; fi.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(fp, 3));
      g.setAttribute('normal', new T.Float32BufferAttribute(fn, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(fu, 2));
      g.setIndex(fi);
      g.computeVertexNormals();
      fronds.push(g);
    }
    // 코코넛
    for (let k = 0; k < 3; k++) {
      const c = new T.SphereGeometry(0.028, 7, 5);
      c.translate(top.x + Math.cos(k * 2.1) * 0.035, top.y - 0.04, top.z + Math.sin(k * 2.1) * 0.035);
      fronds.push(c);
    }
    return { trunk, leaves: shadeCanopy(merge(fronds), top.clone().add(new T.Vector3(0, -0.05, 0)), 0.45, 0.6) };
  }

  // 굽은 줄기 (높이 1, 굵기 r0)
  function trunkGeo(center, r0, taper, N, RS) {
    const pos = [], nor = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, c = center(t), r = r0 * (1 - t * taper);
      for (let j = 0; j <= RS; j++) {
        const a = (j / RS) * Math.PI * 2, nx = Math.cos(a), nz = Math.sin(a);
        pos.push(c.x + nx * r, c.y, c.z + nz * r);
        nor.push(nx, 0, nz);
        uv.push(j / RS, t * 4);
      }
    }
    for (let i = 0; i < N; i++)
      for (let j = 0; j < RS; j++) { const a = i * (RS + 1) + j, b = a + RS + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  // 정사각 잎 판 하나를 p 위치에, 법선 방향 n으로
  function card(size, p, yaw, pitch, roll) {
    const g = new T.PlaneGeometry(size, size);
    g.rotateX(pitch); g.rotateZ(roll || 0); g.rotateY(yaw);
    g.translate(p.x, p.y, p.z);
    return g;
  }

  // 열대 활엽수: 굵은 줄기 + 둥근 수관(잎 뭉치 판 여러 장)
  function broadleafGeometry(seed) {
    const rnd = I.rng.make(seed);
    const lean = (rnd() - 0.5) * 0.15;
    const trunk = trunkGeo((t) => new T.Vector3(lean * t * t, t * 0.62, 0), 0.05, 0.45, 10, 8);
    const leaves = [];
    const n = 38 + Math.floor(rnd() * 10);
    // 수관 안에 작은 덩어리 2~3개 → 구름처럼 울퉁불퉁한 실루엣
    const lobes = [0, 1, 2].map(() => new T.Vector3(lean + (rnd() - 0.5) * 0.3, 0.7 + rnd() * 0.16, (rnd() - 0.5) * 0.3));
    for (let k = 0; k < n; k++) {
      const lb = lobes[k % lobes.length], a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.25, h = (rnd() - 0.45) * 0.26;
      const p = new T.Vector3(lb.x + Math.cos(a) * r, lb.y + h - r * 0.2, lb.z + Math.sin(a) * r);
      leaves.push(card(0.26 + rnd() * 0.14, p, rnd() * Math.PI, -Math.PI / 2 + (rnd() - 0.5) * 1.4, (rnd() - 0.5) * 0.9));
    }
    return { trunk, leaves: shadeCanopy(merge(leaves), new T.Vector3(lean, 0.72, 0), 0.75, 0.42) };
  }

  // 바나나 나무: 짧은 줄기 + 크게 휘어지는 넓은 잎 몇 장
  function bananaGeometry(seed) {
    const rnd = I.rng.make(seed);
    const stem = trunkGeo((t) => new T.Vector3(0, t * 0.45, 0), 0.045, 0.3, 6, 8);
    const leaves = [];
    const n = 6 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const az = (k / n) * Math.PI * 2 + rnd() * 0.5, L = 0.55 + rnd() * 0.2, W = 0.2, SEG = 6;
      const dir = new T.Vector3(Math.cos(az), 0, Math.sin(az)), side = new T.Vector3(-dir.z, 0, dir.x);
      const fp = [], fu = [], fi = [];
      let p = new T.Vector3(0, 0.42, 0);
      for (let s2 = 0; s2 <= SEG; s2++) {
        const t = s2 / SEG, th = 1.1 - t * 1.9;
        if (s2 > 0) p = p.clone().add(dir.clone().multiplyScalar(Math.cos(th) * L / SEG)).add(new T.Vector3(0, Math.sin(th) * L / SEG, 0));
        for (const sd of [-1, 1]) { const q = p.clone().add(side.clone().multiplyScalar(sd * W / 2)); fp.push(q.x, q.y, q.z); fu.push(sd < 0 ? 0 : 1, t); }
      }
      for (let s2 = 0; s2 < SEG; s2++) { const a = s2 * 2; fi.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(fp, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(fu, 2));
      g.setIndex(fi);
      g.computeVertexNormals();
      leaves.push(g);
    }
    return { trunk: stem, leaves: merge(leaves) };
  }

  // 몬스테라 덤불: 땅 가까이 비스듬히 펼친 큰 잎들 (높이 1 기준)
  function monsteraGeometry(seed) {
    const rnd = I.rng.make(seed), leaves = [];
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + rnd() * 0.6, r = 0.15 + rnd() * 0.25;
      leaves.push(card(0.5 + rnd() * 0.25, new T.Vector3(Math.cos(a) * r, 0.25 + rnd() * 0.45, Math.sin(a) * r), -a + Math.PI / 2, -0.6 - rnd() * 0.6, (rnd() - 0.5) * 0.4));
    }
    return merge(leaves);
  }

  // 꽃 덤불: 엇갈린 판 3장
  function bushGeo() {
    const gs = [];
    for (let k = 0; k < 3; k++) { const g = new T.PlaneGeometry(1.1, 1, 1, 1).translate(0, 0.5, 0); g.rotateY((k / 3) * Math.PI); gs.push(g); }
    return merge(gs);
  }

  // 풀 덤불: 엇갈린 판 3장 (높이 1 기준)
  // 바위: 구를 울퉁불퉁하게 부풀린 뒤 평면 몇 개로 깎아 각진 면을 만든다 (대포알처럼 둥글지 않게)
  function rockGeometry(seed) {
    const rnd = I.rng.make(seed), g = new T.IcosahedronGeometry(0.5, 3), p = g.attributes.position, v = new T.Vector3();
    const cuts = [];
    for (let k = 0; k < 7; k++) {
      const n = new T.Vector3(rnd() * 2 - 1, rnd() * 1.6 - 0.3, rnd() * 2 - 1).normalize();
      cuts.push([n, 0.28 + rnd() * 0.14]);
    }
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = Math.sin(v.x * 7.1 + 1.3) * Math.sin(v.y * 6.3 + 2.1) * Math.sin(v.z * 7.7 + 0.4);
      v.multiplyScalar(1 + n * 0.12);
      for (const [cn, d] of cuts) { const t = v.dot(cn); if (t > d) v.addScaledVector(cn, d - t); }
      if (v.y < -0.2) v.y = -0.2 + (v.y + 0.2) * 0.3; // 바닥은 납작하게
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }

  // 풀 포기: 가늘고 휜 풀잎 띠 여러 장을 둥글게 모은 입체 덤불.
  // (예전 십자 카드 3장은 위·옆에서 보면 별 모양 스티커처럼 납작해 보였다)
  // 정점색 = 밑동 그늘(어둡게) → 끝은 밝은 연두. 법선은 위·바깥으로 기울여 포기 전체가 둥근 덩어리처럼, 땅과 같은 밝기로 녹아들게.
  // aSide = 풀잎 가장자리 쪽 반폭(부호=왼/오른), aWdir = 폭 방향 → 셰이더가 멀리서 풀잎을 굵혀 1픽셀 아래로 가늘어지지 않게 한다
  function grassTuft(sd) {
    const rnd = I.rng.make(sd);
    const pos = [], nor = [], col = [], side = [], wdir = [], idx = [];
    const NB = 18, SEG = 3;
    for (let b = 0; b < NB; b++) {
      const a = rnd() * Math.PI * 2, r0 = Math.pow(rnd(), 0.7) * 0.13;
      const bx = Math.cos(a) * r0, bz = Math.sin(a) * r0;
      const h = 0.45 + rnd() * 0.55;
      const lean = (0.12 + rnd() * 0.42) * (0.5 + r0 * 4.5); // 바깥 풀잎일수록 더 눕는다 (가운데는 곧게 → 분수 모양 포기)
      const la = a + (rnd() - 0.5) * 0.7, lx = Math.cos(la), lz = Math.sin(la);
      const tw = la + Math.PI / 2 + (rnd() - 0.5) * 0.8, wx = Math.cos(tw), wz = Math.sin(tw);
      const hw0 = 0.032 + rnd() * 0.022, lit = 0.88 + rnd() * 0.24, yel = rnd();
      const base = pos.length / 3;
      for (let s = 0; s <= SEG; s++) {
        const t = s / SEG, off = lean * h * t * t, y = h * (t - 0.28 * lean * t * t * t);
        const cx = bx + lx * off, cz = bz + lz * off;
        // 둥근 포기 법선: 위 + 바깥(가운데에서 먼 만큼)
        const ox = cx * 1.5 + lx * 0.2 * t, oz = cz * 1.5 + lz * 0.2 * t, nl = Math.hypot(ox, 1, oz);
        const ao = 0.36 + 0.64 * Math.pow(t, 0.65);
        const cr = ao * lit * (1 + t * yel * 0.08), cg = ao * lit, cb = ao * lit * (1 - t * 0.1);
        for (const k of s === SEG ? [0] : [-1, 1]) {
          const hw = hw0 * (1 - t * 0.72) * k;
          pos.push(cx + wx * hw, y, cz + wz * hw);
          nor.push(ox / nl, 1 / nl, oz / nl);
          col.push(cr, cg, cb);
          side.push(hw);
          wdir.push(wx, wz);
        }
      }
      for (let s = 0; s < SEG; s++) {
        const a0 = base + s * 2;
        if (s < SEG - 1) idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
        else idx.push(a0, a0 + 1, a0 + 2);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setAttribute('aSide', new T.Float32BufferAttribute(side, 1));
    g.setAttribute('aWdir', new T.Float32BufferAttribute(wdir, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }
  // 풀 재질: 밑동은 고정, 끝으로 갈수록 휘는 바람 + 들판을 건너가는 바람결(잎이 눕는 곳이 밝게 번진다)
  // + 멀리선 풀잎을 굵게 + 아주 먼 풀은 땅속으로 눕혀 지운다 (지도에서 수천 포기가 점처럼 깜빡이지 않게)
  R.grassUni = { uPx: { value: 0.0015 }, uFar: { value: new T.Vector2(80, 125) } };
  function grassMaterial() {
    const mat = new T.MeshStandardMaterial({ vertexColors: true, side: T.DoubleSide, roughness: 1, metalness: 0, envMapIntensity: 0.4 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uWind = R.wind;
      sh.uniforms.uPx = R.grassUni.uPx;
      sh.uniforms.uFar = R.grassUni.uFar;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uWind, uPx; uniform vec2 uFar; attribute float aSide; attribute vec2 aWdir; varying float vGust;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 ip = vec3(0.0); float isc = 1.0;
          #ifdef USE_INSTANCING
            ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
            isc = max(0.05, length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2])));
          #endif
          float cd = distance(cameraPosition, ip);
          transformed.xz += aWdir * sign(aSide) * max(0.0, cd * uPx / isc - abs(aSide));
          float tip = clamp(position.y, 0.0, 1.0), bend = tip * tip;
          float gust = sin(dot(ip.xz, vec2(0.11, 0.045)) - uWind * 1.3) * 0.5 + 0.5;
          gust *= gust;
          float sway = sin(uWind * 2.2 + ip.x * 0.9 + ip.z * 0.7) * 0.3 + gust * 0.85;
          transformed.x += sway * bend * 0.2;
          transformed.z += (sway * 0.4 + sin(uWind * 1.7 + ip.z * 1.3) * 0.18) * bend * 0.2;
          transformed.y -= gust * bend * 0.07;
          vGust = gust * tip;
          float fade = smoothstep(uFar.y, uFar.x, cd);
          transformed.y = transformed.y * fade - (1.0 - fade) * 0.08;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vGust;')
        .replace('#include <normal_fragment_begin>', KEEP_NORMAL)
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 1.0 + vGust * 0.14;');
    };
    return mat;
  }

  // 고사리 잎(깃꼴): 가운데 잎줄기 양옆으로 작은 잎(깃조각)이 줄지어 나고, 깃조각마다 둥근 톱니
  function fernFrondTexture() {
    return bledTexture(256, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const cx = w / 2, N = 21;
      for (let i = 0; i < N; i++) {
        const t = (i + 0.5) / N, y = (h - 10) * (1 - t) + 4;
        const len = w * 0.47 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.95)), 0.75) * (1 - 0.3 * t) * (0.9 + Math.random() * 0.14);
        for (const sd of [-1, 1]) {
          const ang = sd * (1.0 + t * 0.25 + (Math.random() - 0.5) * 0.1); // 잎줄기에서 비스듬히 위로
          const dx = Math.sin(ang), dy = -Math.cos(ang) * 0.55 - 0.18;
          const dl = Math.hypot(dx, dy), ux = dx / dl, uy = dy / dl;
          const wid = len * 0.2 + 3, M = 7;
          const l0 = 25 + Math.random() * 9, l1 = 38 + Math.random() * 10;
          for (let m = M; m >= 0; m--) {
            const p = m / M, px = cx + ux * len * p, py = y + uy * len * p - Math.sin(p * Math.PI) * 4;
            const r = wid * (1 - p * 0.72) * (0.85 + (m % 2) * 0.25);
            g.fillStyle = `hsl(${96 - p * 10 + Math.random() * 6}, ${44 + Math.random() * 10}%, ${l0 + (l1 - l0) * p + Math.random() * 3}%)`;
            g.beginPath();
            g.ellipse(px, py, r * 1.15, r * 0.82, Math.atan2(uy, ux), 0, Math.PI * 2);
            g.fill();
          }
          g.strokeStyle = 'rgba(48, 66, 22, 0.55)';
          g.lineWidth = 1.6;
          g.beginPath();
          g.moveTo(cx, y);
          g.quadraticCurveTo(cx + ux * len * 0.5, y + uy * len * 0.5 - 4, cx + ux * len, y + uy * len);
          g.stroke();
        }
      }
      // 잎줄기
      g.strokeStyle = '#5f6b2c';
      g.lineCap = 'round';
      for (let k = 0; k < 12; k++) {
        const t0 = k / 12, t1 = (k + 1) / 12;
        g.lineWidth = 5.5 * (1 - t0 * 0.8);
        g.beginPath();
        g.moveTo(cx, (h - 10) * (1 - t0) + 8);
        g.lineTo(cx, (h - 10) * (1 - t1) + 6);
        g.stroke();
      }
    });
  }
  // 고사리 포기: 휜 띠 모양 잎 여러 장이 둥글게 펼쳐진다. 큰 포기 하나 + 옆에 작은 포기 (잎 한 장 = 삼각형 24개)
  // 실사 스캔 고사리는 포기당 삼각형 6천 개라 가까운 240포기만 그릴 수 있었다
  function fernGeometry(sd) {
    const rnd = I.rng.make(sd);
    const pos = [], nor = [], uv = [], col = [], idx = [];
    const plant = (px, pz, size, nf) => {
      for (let f = 0; f < nf; f++) {
        const az = (f / nf) * Math.PI * 2 + (rnd() - 0.5) * 0.55;
        const young = f % 3 === 0;
        const L = size * ((young ? 0.72 : 0.92) + rnd() * 0.18);
        const rise = young ? 1.05 : 0.72 + rnd() * 0.25, reach = young ? 0.55 : 0.82 + rnd() * 0.12;
        const tipY = young ? 0.45 : 0.08 + rnd() * 0.14;
        const ca = Math.cos(az), sa = Math.sin(az), sx = -sa, sz = ca;
        const P0 = [0.02 * size, 0], P1 = [L * 0.3, L * rise * 0.72], P2 = [L * reach, L * tipY];
        const W = L * 0.21, lit = 0.9 + rnd() * 0.2, base = pos.length / 3, SEG = 6;
        for (let s = 0; s <= SEG; s++) {
          const t = s / SEG, it = 1 - t;
          const r = it * it * P0[0] + 2 * it * t * P1[0] + t * t * P2[0], y = it * it * P0[1] + 2 * it * t * P1[1] + t * t * P2[1];
          const dr = 2 * it * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0]), dy = 2 * it * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1]), tl = Math.hypot(dr, dy) || 1;
          const tx = (ca * dr) / tl, ty = dy / tl, tz = (sa * dr) / tl;
          // 잎 면 법선 = 옆 × 진행 방향 (위쪽 면)
          const N0 = [-sz * ty, sz * tx - sx * tz, sx * ty];
          const wv = W * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.12)));
          const arch = 0.07 * L * Math.sin(Math.PI * Math.min(1, t * 1.2));
          const cxp = px + ca * r, czp = pz + sa * r;
          for (const k of [-1, 0, 1]) {
            pos.push(cxp + sx * wv * k, y - (k ? arch : 0), czp + sz * wv * k);
            uv.push(0.5 + k * 0.5, t);
            let n0 = N0[0] + sx * k * 0.45, n1 = N0[1] + 0.6, n2 = N0[2] + sz * k * 0.45;
            const nl = Math.hypot(n0, n1, n2) || 1;
            nor.push(n0 / nl, n1 / nl, n2 / nl);
            const ao = (0.62 + 0.38 * Math.min(1, t * 1.8)) * lit;
            col.push(ao, ao, ao);
          }
        }
        for (let s = 0; s < SEG; s++) {
          const a = base + s * 3;
          idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
        }
      }
    };
    plant(0, 0, 1, 9);
    const a2 = rnd() * Math.PI * 2;
    plant(Math.cos(a2) * 0.85, Math.sin(a2) * 0.85, 0.62, 7);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingBox();
    // 높이 1로 맞춘다 (배치할 때 높이 h만큼 키운다)
    const hgt = g.boundingBox.max.y || 1;
    g.scale(1 / hgt, 1 / hgt, 1 / hgt);
    g.computeBoundingSphere();
    return g;
  }

  // ---------- 외부 모델 ----------
  function gltf(path) {
    return new T.GLTFLoader().loadAsync(DIR + path);
  }
  function partsOf(scene) {
    scene.updateMatrixWorld(true);
    const parts = [];
    scene.traverse((o) => { if (o.isMesh) parts.push({ geo: o.geometry.clone().applyMatrix4(o.matrixWorld), mat: o.material }); });
    const box = new T.Box3().setFromObject(scene);
    return { parts, h: box.max.y - box.min.y, y0: box.min.y };
  }

  function loadAll(renderer, scene) {
    loadTextures();
    R.frondTex = frondTexture();
    R.cloudTex = cloudTexture();
    R.fabric = fabricTexture;
    R.palmVariants = [11, 23, 37, 51].map((s) => palmGeometry(s));
    R.grassVariants = [11, 23, 37].map((sd) => grassTuft(sd));
    R.fernVariants = [5, 41].map((sd) => fernGeometry(sd));
    R.broadVariants = [5, 17, 29].map((sd) => broadleafGeometry(sd));
    R.bananaVariants = [7, 19].map((sd) => bananaGeometry(sd));
    R.monsteraGeo = monsteraGeometry(3);
    R.bushGeo = bushGeo();
    R.rockGeo = rockGeometry(7);
    R.rockGeo2 = rockGeometry(19);
    R.rockGeo3 = rockGeometry(31);
    R.mats = {
      bark: new T.MeshStandardMaterial({ map: R.tex.bark.diff, normalMap: R.tex.bark.nor, roughnessMap: R.tex.bark.rough, color: '#c9b49a' }),
      // 야자·활엽수 잎은 법선을 수관 바깥으로 돌려 둔 것(shadeCanopy) → 뒷면에서 뒤집으면 위에서 볼 때 잎이 아래를 향해 시커멓게 보였다
      frond: windify(new T.MeshStandardMaterial({ map: R.frondTex, alphaTest: 0.45, alphaToCoverage: true, vertexColors: true, side: T.DoubleSide, roughness: 0.75 }), 0.06, true, true),
      grass: grassMaterial(),
      fern: windify(new T.MeshStandardMaterial({ map: fernFrondTexture(), alphaTest: 0.45, alphaToCoverage: true, vertexColors: true, side: T.DoubleSide, roughness: 0.78 }), 0.05, true, true),
      canopy: windify(new T.MeshStandardMaterial({ map: leafClusterTexture(), alphaTest: 0.5, alphaToCoverage: true, vertexColors: true, side: T.DoubleSide, roughness: 0.8 }), 0.03, false, true),
      banana: windify(new T.MeshStandardMaterial({ map: bananaTexture(), alphaTest: 0.45, side: T.DoubleSide, roughness: 0.7 }), 0.08),
      monstera: windify(new T.MeshStandardMaterial({ map: monsteraTexture(), alphaTest: 0.5, side: T.DoubleSide, roughness: 0.65 }), 0.05),
      flowers: windify(new T.MeshStandardMaterial({ map: flowerBushTexture(), alphaTest: 0.45, side: T.DoubleSide, roughness: 0.8 }), 0.06),
      stem: new T.MeshStandardMaterial({ map: R.tex.bark.diff, color: '#9cae6a', roughness: 0.8 }),
      rock: new T.MeshStandardMaterial({ map: R.tex.rock.diff, normalMap: R.tex.rock.nor, color: '#9a9590', roughness: 0.95 }),
      deck: new T.MeshStandardMaterial({ map: R.tex.deck.diff, normalMap: R.tex.deck.nor, roughnessMap: R.tex.deck.rough }),
      wall: new T.MeshStandardMaterial({ map: R.tex.deck.diff, normalMap: R.tex.deck.nor, color: '#f1e2c6' }),
      thatch: new T.MeshStandardMaterial({ map: R.tex.thatch.diff, normalMap: R.tex.thatch.nor, roughnessMap: R.tex.thatch.rough }),
      dark: new T.MeshStandardMaterial({ color: '#2a2622', roughness: 0.6 }),
    };
    const jobs = [];
    // 하늘 HDR → 실사 조명·반사
    if (T.RGBELoader)
      jobs.push(new T.RGBELoader().loadAsync(DIR + 'hdr/sky.hdr').then((t) => {
        t.mapping = T.EquirectangularReflectionMapping;
        const pm = new T.PMREMGenerator(renderer);
        R.env = pm.fromEquirectangular(t).texture;
        scene.environment = R.env;
        t.dispose();
        pm.dispose();
      }).catch(() => {}));
    jobs.push(gltf('models/dutch_ship_medium/dutch_ship_medium_1k.gltf').then((g) => { R.ship = g.scene; }).catch(() => {}));
    // 실사 바위 절벽면 스캔 (Poly Haven, CC0): 폭포 절벽 테두리·턱 양옆·급류 골짜기·호수 출구
    R.rockFaces = [];
    ['rock_face_01', 'rock_face_02'].forEach((id, i) => jobs.push(gltf('models/' + id + '/' + id + '_1k.gltf').then((g) => { R.rockFaces[i] = partsOf(g.scene); }).catch(() => {})));
    // 생존자 캐릭터: 남녀 모델 + 공용 애니메이션(같은 뼈대)
    R.people = {};
    jobs.push(gltf('char/UAL1_Standard.glb').then((g) => { R.clips = g.animations; }).catch(() => {}));
    for (const [key, file] of [['male', 'Superhero_Male_FullBody'], ['female', 'Superhero_Female_FullBody']])
      jobs.push(gltf('char/ubc/' + file + '.gltf').then((g) => { R.people[key] = g.scene; }).catch(() => {}));
    R.hair = {};
    for (const n of ['Hair_SimpleParted', 'Hair_Beard', 'Eyebrows_Regular', 'Hair_Long', 'Eyebrows_Female'])
      jobs.push(gltf('char/ubc/hair/' + n + '.gltf').then((g) => { R.hair[n] = g.scene; }).catch(() => {}));
    return Promise.all(jobs).then(() => { R.ready = true; return R; });
  }

  // 생존자 캐릭터. 애니메이션 이름은 Quaternius Universal Animation Library 기준
  const ANIM = { idle: 'Idle_Loop', walk: 'Walk_Loop', run: 'Jog_Fwd_Loop', sprint: 'Sprint_Loop', swim: 'Swim_Fwd_Loop', float: 'Swim_Idle_Loop', kneel: 'Fixing_Kneeling', sit: 'Sitting_Idle_Loop', jumpStart: 'Jump_Start', jumpLoop: 'Jump_Loop', jumpLand: 'Jump_Land' };
  // 생존자 옷: 기본 몸(속옷 차림) 위에 셔츠·바지·부츠를 셰이더로 입힌다.
  // 모델은 T자세(팔이 어깨 높이로 수평)라 몸 좌표의 높이·좌우 폭으로 부위를 나눈다
  function dressUp(o, gender) {
    const female = gender === 'female';
    const C = female
      ? { shirt: '#e2d8c2', pants: '#5c4a35', boots: '#2b211a', sleeve: 0.0 }
      : { shirt: '#c9bc98', pants: '#4a3a2a', boots: '#2b211a', sleeve: 1.0 };
    o.traverse((m) => {
      if (!m.isSkinnedMesh || !m.material || !/Superhero|SuperHero|Body/i.test((m.material.name || '') + m.name)) return;
      const g = m.geometry;
      g.computeBoundingBox();
      const bb = g.boundingBox, H = bb.max.y - bb.min.y;
      const mat = m.material.clone();
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uB = { value: new T.Vector4(bb.min.y, H, C.sleeve, female ? 1 : 0) };
        sh.uniforms.uShirt = { value: new T.Color(C.shirt) };
        sh.uniforms.uPants = { value: new T.Color(C.pants) };
        sh.uniforms.uBoots = { value: new T.Color(C.boots) };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLoc;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLoc = position;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
            varying vec3 vLoc; uniform vec4 uB; uniform vec3 uShirt, uPants, uBoots;
            // x: 부츠, y: 바지, z: 셔츠 (몸 높이 0=발 ~ 1=머리, 좌우 폭은 몸 높이 기준)
            vec3 clothMask(){
              float y = (vLoc.y - uB.x) / uB.y, ax = abs(vLoc.x) / uB.y;
              float boots = 1.0 - smoothstep(0.075, 0.09, y);
              float pants = smoothstep(0.07, 0.085, y) * (1.0 - smoothstep(0.56, 0.575, y)) * (1.0 - smoothstep(0.17, 0.19, ax));
              float torso = smoothstep(0.545, 0.56, y) * (1.0 - smoothstep(0.79 + 0.025 * step(0.06, ax), 0.805 + 0.025 * step(0.06, ax), y)) * (1.0 - smoothstep(0.12, 0.13, ax));
              float sleeve = uB.z * smoothstep(0.73, 0.745, y) * (1.0 - smoothstep(0.835, 0.85, y)) * (1.0 - smoothstep(0.24, 0.255, ax));
              return vec3(boots, pants * (1.0 - boots), max(torso, sleeve));
            }
            float clothNoise(vec3 p){ return fract(sin(dot(floor(p * 140.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`)
          .replace('#include <map_fragment>', `#include <map_fragment>
            vec3 cm = clothMask();
            float weave = 0.92 + 0.08 * clothNoise(vLoc) + 0.05 * sin(vLoc.y * 260.0) * sin(vLoc.x * 240.0);
            float fold = 0.88 + 0.12 * sin(vLoc.y * 38.0 + sin(vLoc.x * 22.0) * 2.0);
            diffuseColor.rgb = mix(diffuseColor.rgb, uBoots * weave, cm.x);
            diffuseColor.rgb = mix(diffuseColor.rgb, uPants * weave * fold, cm.y);
            diffuseColor.rgb = mix(diffuseColor.rgb, uShirt * weave * fold, cm.z);`)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            { vec3 cm2 = clothMask(); normal = normalize(mix(normal, geometryNormal, max(cm2.y, cm2.z) * 0.75)); } // 옷 위로 근육 결이 비치지 않게`)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n{ vec3 cm3 = clothMask(); roughnessFactor = mix(roughnessFactor, 0.95, max(cm3.x, max(cm3.y, cm3.z))); }');
      };
      m.material = mat;
    });
  }

  function character(height, gender) {
    const src = R.people && (R.people[gender] || R.people.male);
    if (!src || !R.clips || !T.SkeletonUtils) return null;
    const o = T.SkeletonUtils.clone(src);
    // 머리카락·수염·눈썹을 머리 뼈에 붙인다 (모델 좌표 기준이라 머리 뼈 기준으로 바꿔서)
    o.updateMatrixWorld(true);
    let head = null;
    o.traverse((b) => { if (!head && b.isBone && b.name === 'Head') head = b; });
    const HAIR = gender === 'female' ? ['Hair_Long', 'Eyebrows_Female'] : ['Hair_SimpleParted', 'Hair_Beard', 'Eyebrows_Regular'];
    if (head)
      for (const n of HAIR) {
        if (!R.hair[n]) continue;
        const h = R.hair[n].clone(true);
        const g = new T.Group();
        g.add(h);
        g.applyMatrix4(new T.Matrix4().copy(head.matrixWorld).invert());
        h.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.material = m.material.clone(); m.material.side = T.DoubleSide; m.material.alphaTest = 0.4; } });
        head.add(g);
      }
    o.traverse((m) => {
      if (!m.isMesh) return;
      m.castShadow = true;
      m.frustumCulled = false;
      if (m.material && m.material.name && m.material.name.indexOf('Hair') >= 0) { m.material.side = T.DoubleSide; }
    });
    dressUp(o, gender);
    o.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(o), k = height / (box.max.y - box.min.y);
    o.scale.setScalar(k);
    o.position.y = -box.min.y * k;
    const wrap = new T.Group();
    wrap.add(o);
    const mixer = new T.AnimationMixer(o), actions = {};
    for (const [key, name] of Object.entries(ANIM)) {
      const clip = R.clips.find((c) => c.name === name);
      if (!clip) continue;
      actions[key] = mixer.clipAction(clip);
      if (key === 'jumpStart' || key === 'jumpLand' || key === 'kneel') { actions[key].setLoop(T.LoopOnce, 1); actions[key].clampWhenFinished = true; }
    }
    return { obj: wrap, mixer, actions, gender };
  }

  I.real = { R, loadAll, character, merge };
})(window.Island);
