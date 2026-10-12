// 3D 섬 (Three.js r147). 반실사 열대 섬: 사진 텍스처 지형, HDR 조명, 반사되는 라군, 수상 방갈로, 3인칭 캐릭터.
// 모드: hero(표지, 노을) → game(지도, 한낮의 열대) ↔ walk(3인칭 걷기)
(function (I) {
  const C = I.config;
  const T = window.THREE;
  const G = C.GRID, S = 10, M = 6, R = 16;          // 셀 크기, 라군 여백(셀 수), 셀당 세분 수 (16 → 지형 격자 0.625: 분화구·협곡 모서리가 덜 각진다)
  const HALF = (G * S) / 2;
  const GW = G + 2 * M;                              // 여백 포함 셀 수
  const FG = GW * R + 1;                             // 세밀 격자 점 수
  const STEP = S / R;
  const ORIGIN = -HALF - M * S;
  const LS = C.LOT_SPLIT || 1, LOT = S / LS; // 구획: 칸 하나를 LS×LS로 나눈 소유 단위 (한 변 LOT)
  const SIZE = GW * S;
  const LAND_H = { beach: 0.4, forest: 0.75, mountain: 1.4 };
  const EYE = 0.38, WALK = 0.75, RUN = 2.4, SPRINT = 4.2, BODY_H = 0.44;
  // 지도에서 고른 곳으로 낙하: 시작 높이, 최고 낙하 속도 (공기 저항)
  const DROP_H = 11, DROP_VT = 7.5, ROLL_T = 1.15; // ROLL_T: 착지 구르기 (동작이 다시 일어서는 데 약 1.2초)
  const POLLUTION_R = 205;    // 이 거리 밖은 바이러스에 오염된 바다 (들어갈 수 없음)
  const WATER_STOP = -99;     // 바다도 헤엄쳐 다닐 수 있다 (오염 해역 전까지)

  const PALETTE = {
    // 첫 화면: 폭포를 정면으로 비추는 황금빛 오후 (해 방향은 폭포가 정해지면 맞춘다)
    hero: { top: '#2f62b8', mid: '#93bde6', hor: '#ffe0b4', sun: '#fff0d0', sunDir: [0.5, 0.35, -0.67], hemiSky: '#e6f0ff', hemiGround: '#6b5a3c', hemi: 0.42, key: 2.3, keyCol: '#ffe4bf', keyPos: [96, 90, -80], deep: '#0a4f8f', sea2: '#18aebd', shallow: '#86e6d6', stars: 0 },
    game: { top: '#2a6fcf', mid: '#8ec2ee', hor: '#e4f1fb', sun: '#fff3d9', sunDir: [0.5, 0.55, -0.67], hemiSky: '#e3f2ff', hemiGround: '#8a7a55', hemi: 0.35, key: 2.2, keyCol: '#fff1dc', keyPos: [96, 140, -80], deep: '#0a4f8f', sea2: '#18aebd', shallow: '#86e6d6', stars: 0 },
  };
  // 하루 주기: 새벽 → 낮 → 노을 → 달빛 밤 (env: HDR 반사 사용 여부, exposure: 노출)
  PALETTE.game.exposure = 1.05; PALETTE.game.env = 1;
  PALETTE.hero.exposure = 1.05; PALETTE.hero.env = 1;
  const DAY = PALETTE.game;
  const DAWN = { ...DAY, top: '#2c3f78', mid: '#b98fae', hor: '#ffc8a2', sun: '#ffd2a0', sunDir: [-0.8, 0.1, 0.55], hemiSky: '#ffd6c0', hemiGround: '#4a3a40', hemi: 0.4, key: 1.3, keyCol: '#ffc9a0', keyPos: [-95, 18, 62], deep: '#0f3f72', sea2: '#2a8fa6', shallow: '#8bd0c4', stars: 0.15, exposure: 1.0, env: 1 };
  const DUSK = { ...DAY, top: '#24386f', mid: '#d48468', hor: '#ffad6a', sun: '#ffb062', sunDir: [0.82, 0.07, -0.57], hemiSky: '#ffc49c', hemiGround: '#503828', hemi: 0.42, key: 1.5, keyCol: '#ffaa70', keyPos: [95, 14, -62], deep: '#123b6a', sea2: '#2a879a', shallow: '#7cc2b4', stars: 0.05, exposure: 1.0, env: 1 };
  // 밤: 달빛은 낮 햇빛의 1/3쯤, 그늘은 하늘빛 환경광으로 (전엔 달빛 0.75+환경광 0.62에 노출 0.95라 회백색 낮처럼 뜨고 그늘만 새까맸다)
  const NIGHT = { ...DAY, top: '#030817', mid: '#0b1835', hor: '#1b3056', sun: '#8fa3dd', sunDir: [-0.4, 0.45, 0.6], hemiSky: '#4e6aa8', hemiGround: '#1c2440', hemi: 0.58, key: 0.62, keyCol: '#a8bbff', keyPos: [-55, 75, 65], deep: '#03122a', sea2: '#0c3550', shallow: '#2b6670', stars: 1, exposure: 0.82, env: 0 };
  // 하루 = 실제 48분: 낮 약 26분 · 노을 약 6분 · 밤 약 10분 (밤이 너무 길면 처음 온 사람이 어두운 섬만 본다)
  const DAY_KEYS = [[0, DAWN], [0.05, DAY], [0.6, DAY], [0.68, DUSK], [0.74, NIGHT], [0.93, NIGHT], [1, DAWN]];
  const DAY_LEN_MS = 48 * 60 * 1000;
  let phaseOverride = null; // 테스트용 (콘솔: Island.world.setPhase(0.8))
  function dayPhase() { return phaseOverride !== null ? phaseOverride : (Date.now() % DAY_LEN_MS) / DAY_LEN_MS; }
  function timePalette(ph) {
    for (let i = 0; i < DAY_KEYS.length - 1; i++) {
      const [a, pa] = DAY_KEYS[i], [b, pb] = DAY_KEYS[i + 1];
      if (ph >= a && ph <= b) return pa === pb ? pa : lerpPalette(pa, pb, (ph - a) / (b - a));
    }
    return DAY;
  }
  function timeLabel(ph) {
    return ph < 0.05 ? '🌄 새벽' : ph < 0.6 ? '☀️ 낮' : ph < 0.72 ? '🌅 노을' : ph < 0.95 ? '🌙 밤' : '🌄 새벽';
  }
  const palFor = (m) => (m === 'hero' ? PALETTE.hero : timePalette(dayPhase()));
  const CAM = {
    hero: { tilt: 1.2, dist: 270, ty: 10, auto: 0.025 },
    game: { tilt: 0.8, dist: 230, ty: -14, auto: 0 },
  };

  function ownerColor(o) {
    return o === 'me' ? C.ME_COLOR : I.rivals.byId(o).color;
  }

  // ---------- 결정론 노이즈 ----------
  function hash(x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function blur(src, r) {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    for (let j = 0; j < FG; j++)
      for (let i = 0; i < FG; i++) {
        let s = 0, n = 0;
        for (let k = -r; k <= r; k++) { const ii = i + k; if (ii < 0 || ii >= FG) continue; s += src[j * FG + ii]; n++; }
        tmp[j * FG + i] = s / n;
      }
    for (let j = 0; j < FG; j++)
      for (let i = 0; i < FG; i++) {
        let s = 0, n = 0;
        for (let k = -r; k <= r; k++) { const jj = j + k; if (jj < 0 || jj >= FG) continue; s += tmp[jj * FG + i]; n++; }
        out[j * FG + i] = s / n;
      }
    return out;
  }
  const ss = (a0, a1, x) => { const t = Math.min(1, Math.max(0, (x - a0) / (a1 - a0))); return t * t * (3 - 2 * t); };

  // ---------- 상태 ----------
  let renderer, scene, camera, hemi, key, sky, skyMat, stars, starMat, water, waterMat, landTex;
  let terrain, decor = [], trunks = [], walkables = [], flags = new Map(), sparks, sparkMat, beamSel, beamHover, clouds = [], gulls = [];
  let outline, outlineMat, outlineKey = '';
  const flagKeys = new Map();
  let landmarks = null, lampGlow = null, bobbers = [], animals = [], faunaGrp = null;
  let field = null, seed = 1, plots = [], ownerSig = '';
  let mode = 'hero', curPal = null, cam = { ...CAM.hero }, theta = 0.5, userTheta = 0, userTilt = 0, userZoom = 0;
  let trans = null, tween = null, selId = null, hoverId = null, dbgCam = null;
  let onPick = null, onHover = null, onWalkPlot = null, onInteract = null, inputOn = true;
  const player = { x: 0, z: 0, yaw: 0, pitch: -0.05, bob: 0, plotId: null, face: 0, moving: 0, walk: false, sprint: false, jy: 0, vy: 0, air: false, land: 0, drop: false, tilt: 0, roll: 0 };
  const JUMP_V = 2.75, GRAVITY = 10;
  const keys = {}, joy = { x: 0, y: 0, far: false }; // far: 모바일에서 멀리 끌면 달리기
  const clock = new T.Clock();
  const RL = () => (I.real && I.real.R.ready ? I.real.R : null);
  let hero = null; // 3인칭 캐릭터

  // ---------- 지형: 섬 + 라군 + 산호초 ----------
  function buildField(ps, sd) {
    const land = new Uint8Array(GW * GW), cellH = new Float32Array(GW * GW);
    for (const p of ps) {
      const i = (p.y + M) * GW + (p.x + M);
      land[i] = 1;
      cellH[i] = LAND_H[p.terrain];
    }
    const landCells = [];
    for (let i = 0; i < GW * GW; i++) if (land[i]) landCells.push([i % GW, (i / GW) | 0]);
    // 바다 칸마다 섬까지 거리 → 얕은 백사장 바닥 → 라군 → 산호초 띠 → 깊은 바다
    for (let i = 0; i < GW * GW; i++) {
      if (land[i]) continue;
      const x = i % GW, y = (i / GW) | 0;
      let d = 99;
      for (const [lx, ly] of landCells) d = Math.min(d, Math.hypot(x - lx, y - ly));
      const du = d * S; // 섬까지 거리(월드 단위)
      cellH[i] = du <= 9 ? -0.3 : du <= 17 ? -0.5 : du <= 25 ? -0.6 : du <= 33 ? -0.2 : -2.8;
    }
    const f0 = new Float32Array(FG * FG);
    for (let j = 0; j < FG; j++)
      for (let i = 0; i < FG; i++) {
        const cx = Math.min(GW - 1, Math.floor(i / R)), cy = Math.min(GW - 1, Math.floor(j / R));
        f0[j * FG + i] = cellH[cy * GW + cx];
      }
    const base = blur(blur(f0, Math.round(0.4 * R)), Math.round(0.5 * R)); // 흐림 반경은 월드 단위로 고정(4·5)

    // 화산: '언덕' 구역들의 중심에서 원뿔형으로 솟은 산 + 능선 + 분화구
    const mts = ps.filter((p) => p.terrain === 'mountain');
    const pc = (p) => [ORIGIN + (p.x + M) * S + S / 2, ORIGIN + (p.y + M) * S + S / 2];
    const vc = mts.length ? mts.map(pc).reduce((a, c) => [a[0] + c[0] / mts.length, a[1] + c[1] / mts.length], [0, 0]) : [0, 0];
    const VR = 50, PEAK = 32, CR = 7.2; // CR: 분화구(백록담) 반지름
    const coneAt = (d) => PEAK * Math.pow(Math.max(0, 1 - d / VR), 1.65);
    const rimH = coneAt(CR) + 1.0, lakeLv = rimH - 1.5;
    const F = new Float32Array(FG * FG);
    for (let j = 0; j < FG; j++)
      for (let i = 0; i < FG; i++) {
        const x = ORIGIN + i * STEP, z = ORIGIN + j * STEP, k = j * FG + i, b0 = base[k];
        const landK = ss(-0.25, 0.35, b0);
        const d = Math.hypot(x - vc[0], z - vc[1]), a = Math.atan2(z - vc[1], x - vc[0]);
        let hv = 0;
        if (d < VR) {
          const t = 1 - d / VR;
          // 능선 무늬는 분화구 가까이선 잦아들어 가장자리 높이가 고르다 (호수가 한쪽으로 넘치지 않게)
          hv = PEAK * Math.pow(t, 1.65) * (1 + 0.2 * Math.sin(a * 7 + vnoise(x * 0.08, z * 0.08, sd + 21) * 4) * (1 - t * 0.4) * ss(CR * 1.1, CR * 2.6, d));
          // 분화구: 둥근 테두리 + 오목한 호수 바닥
          const rimBump = 1.0 * Math.exp(-(((d - CR) / 1.6) ** 2));
          const bowl = rimH - 6.0 * Math.pow(Math.max(0, 1 - (d / CR) ** 2), 0.8) + (vnoise(x * 0.3, z * 0.3, sd + 25) - 0.5) * 0.5;
          // 부드러운 최소값: 테두리 능선을 칼날이 아니라 둥글게
          const sa = hv + rimBump, sb = bowl, sk = 0.9, sh = Math.max(0, Math.min(1, 0.5 + (0.5 * (sb - sa)) / sk));
          hv = sb + (sa - sb) * sh - sk * sh * (1 - sh);
        }
        // 해안 쪽 완만한 구릉
        const hills = (vnoise(x * 0.05, z * 0.05, sd + 31) - 0.35) * 1.6 * ss(0.3, 0.7, b0);
        F[k] = b0 + (hv + Math.max(0, hills)) * landK;
      }

    // 폭포와 개울: 화산 중턱에서 섬이 가장 길게 뻗은 방향으로 바다까지
    let best = 0, bestLen = 0;
    for (let q = 0; q < 24; q++) {
      const a = (q / 24) * Math.PI * 2;
      let len = 0;
      while (len < 140 && sampleRaw(F, vc[0] + Math.cos(a) * len, vc[1] + Math.sin(a) * len) > 0.05) len += 1;
      if (len > bestLen) { bestLen = len; best = a; }
    }
    const river = [];
    const dirx = Math.cos(best), dirz = Math.sin(best), px = -dirz, pz = dirx;
    const s0 = CR - 2.2, s1 = bestLen + 7;
    // 폭포는 화산 중턱(반지름의 55% 지점)에 둔다
    const cliffU = Math.max(0.05, Math.min(0.6, (VR * 0.55 - s0) / (s1 - s0)));
    const sCliff = s0 + cliffU * (s1 - s0), wph = hash(3, 91, sd) * 6.283;
    for (let sDist = s0; sDist <= s1; sDist += 0.6) {
      const u = (sDist - s0) / (s1 - s0);
      // 분화구에서 폭포까지의 계곡은 한 번 크게 휘고 살짝 S자로 굽이친다 (곧은 계단은 사람이 만든 수로처럼 보인다).
      // 출구와 폭포 직전은 곧게, 굽이 반경은 협곡 폭보다 크게(작으면 협곡 단면이 안쪽에서 접힌다)
      const wt = Math.max(0, Math.min(1, (sDist - (CR + 0.4)) / Math.max(1, sCliff - 4.0 - (CR + 0.4)))), wsn = Math.sin(Math.PI * wt);
      const wig = (wph < 3.14 ? 1 : -1) * 1.8 * wsn * wsn + Math.sin(2 * Math.PI * wt) * wsn * 0.75;
      const lat = Math.sin(sDist * 0.11 + 1) * 3.2 * Math.min(1, u * 4) + wig;
      const x = vc[0] + dirx * sDist + px * lat, z = vc[1] + dirz * sDist + pz * lat;
      river.push({ x, z, u, g: sampleRaw(F, x, z) });
    }
    // 물길 높이: 위쪽은 완만, 화산 중턱에서 절벽 폭포, 그 아래로 바다까지
    const ci = river.findIndex((r) => r.u >= cliffU);
    const startH = lakeLv - 0.18, top = Math.min(startH - 0.5, river[Math.max(0, ci)].g - 0.4), drop = Math.min(12, top * 0.85);
    let prev = startH;
    for (const r of river) {
      let bed = r.u < cliffU ? startH + (top - startH) * (r.u / cliffU)
        : r.u < cliffU + 0.012 ? top - drop * ((r.u - cliffU) / 0.012)
        : r.u < cliffU + 0.05 ? top - drop - 0.8 * Math.sin(Math.PI * (r.u - cliffU - 0.012) / 0.038) // 폭포 아래 소(웅덩이)
        : (top - drop) + (-0.45 - (top - drop)) * ((r.u - cliffU - 0.05) / (1 - cliffU - 0.05));
      bed = Math.min(bed, r.g - 0.35, r.u > cliffU + 0.012 && r.u < cliffU + 0.05 ? bed : prev);
      r.bed = bed;
      prev = bed;
    }
    // 호수 안·출구는 수면 높이 그대로
    const vd = (r) => Math.hypot(r.x - vc[0], r.z - vc[1]);
    let iOut = 0;
    for (const r of river) { if (vd(r) < CR + 0.4) { r.bed = startH; r.lake = vd(r) < CR - 0.6; iOut++; } else break; }
    // 지형에 물길을 판다 (강둑은 부드럽게)
    const W = 1.5;
    for (let j = 0; j < FG; j++)
      for (let i = 0; i < FG; i++) {
        const x = ORIGIN + i * STEP, z = ORIGIN + j * STEP;
        // 가장 가까운 점의 바닥 + 주변 1.3 안의 더 낮은 바닥까지 (계단 경계에서 지형이 물 위로 튀어나오지 않게)
        let bd = 1e9, bb = 0, lo = 1e9;
        for (let q = 0; q < river.length; q += 1) {
          const r = river[q], dd = (x - r.x) * (x - r.x) + (z - r.z) * (z - r.z);
          if (dd < bd) { bd = dd; bb = r.bed; }
          if (dd < 1.7 && r.bed < lo) lo = r.bed;
        }
        bb = Math.min(bb, lo);
        bd = Math.sqrt(bd);
        if (bd < W * 1.4) {
          const k = j * FG + i, target = bb - 0.45;
          F[k] = Math.min(F[k], target + (F[k] - target) * ss(W * 0.45, W * 1.35, bd));
        }
      }
    // 폭포: 물이 넘는 넓은 바위턱 + 반원형 수직 절벽 + 깊은 소 + 앞쪽 둑
    // 진짜 절벽(한 칸에 1.2 이상 떨어지는 곳)을 찾는다. 그 위 비탈은 급류로 흘러든다
    let fq0 = river.findIndex((r, q) => q >= ci - 2 && q > 0 && river[q - 1].bed - r.bed > 1.2);
    let fall = null;
    if (fq0 > 0) {
      fq0--;
      let fq1 = fq0 + 1;
      while (fq1 < river.length - 1 && river[fq1].bed - river[fq1 + 1].bed > 1.2) fq1++;
      const lip = river[fq0], low = river[Math.min(river.length - 1, fq1 + 1)];
      const fdx = low.x - lip.x, fdz = low.z - lip.z, fl = Math.hypot(fdx, fdz) || 1;
      const fx = fdx / fl, fz = fdz / fl, BR = 7.5;
      const cx = lip.x + fx * BR, cz = lip.z + fz * BR, bottom = low.bed - 0.15, top = lip.bed, poolY = Math.max(bottom + 0.4, 0.05);
      const down = river.slice(fq1 + 2);
      for (let j = 0; j < FG; j++)
        for (let i = 0; i < FG; i++) {
          const x = ORIGIN + i * STEP, z = ORIGIN + j * STEP, k = j * FG + i;
          const along = (x - lip.x) * fx + (z - lip.z) * fz, lat = Math.abs((x - lip.x) * -fz + (z - lip.z) * fx);
          const d = Math.hypot(x - cx, z - cz);
          if (along > -3.2 && along < 0.5 && lat < 4.6) {
            const shelf = top;
            F[k] = Math.min(F[k], shelf + (F[k] - shelf) * ss(3.4, 4.6, lat));
          }
          if (d < BR + 6) {
            const front = ss(-0.1 * BR, 0.55 * BR, (x - cx) * fx + (z - cz) * fz);
            // 소 가장자리는 둥근 원이 아니라 조금 울퉁불퉁하게 (쿠키 커터로 찍은 듯 보이지 않게). 앞(강 출구) 쪽은 그대로
            const phi0 = Math.atan2((x - cx) * -fz + (z - cz) * fx, -((x - cx) * fx + (z - cz) * fz));
            const dn = d / (1 + (vnoise(phi0 * 1.4 + 9, 3.7, sd + 401) - 0.5) * 0.18 * (1 - front));
            // 바닥은 2m 가까이 깊은 그릇: 얕으면 물이 필름처럼 비쳐 땅 무늬가 보였다
            const bowl = bottom - 1.7 * (1 - Math.min(1, dn / (BR + 1.6))) ** 2;
            F[k] = Math.min(F[k], bowl + (F[k] - bowl) * ss(BR + 1.6 - front, BR + 2.4 + front * 2.5, dn));
            // 앞쪽은 낮은 바위 둑으로 물을 가둔다 (하류로 빠지는 물길만 낮게)
            if (front > 0.2 && d > BR + 0.4) {
              let rd = 1e9;
              for (const r of down) rd = Math.min(rd, Math.hypot(x - r.x, z - r.z));
              // 둑은 계단이 아니라 완만한 경사로 올린다 → 물가가 다각형이 아니라 매끈한 곡선
              const dam0 = poolY + (rd < 1.2 ? -0.35 : rd < 2.0 ? -0.05 : 0.28);
              const dam = (poolY - 0.6) + (dam0 - (poolY - 0.6)) * ss(BR + 0.3, BR + 2.0, d);
              F[k] = Math.max(F[k], dam + (F[k] - dam) * ss(BR + 2.2, BR + 5.5, d) * (F[k] > dam ? 1 : ss(BR + 3, BR + 6, d)));
            }
          }
        }
      fall = { x: lip.x, z: lip.z, top, bottom, poolY, fx, fz, cx, cz, BR, downFrom: fq1 + 1 };
      for (let q = fq1 + 1; q < river.length; q++) river[q].down = true;
    }
    // ---- 계단식 계곡: 분화구 호수 출구 → 웅덩이와 작은 폭포가 번갈아 → 폭포 위 바위턱 ----
    // 지형 격자(1칸)로는 좁은 계곡을 못 깎으므로, 경로를 0.2 간격으로 다시 뽑아 별도 바위 메시로 짓는다.
    // 여기서는 경로·수면 높이를 정하고, 그 아래 지형을 파 둔다(메시가 덮는다).
    let stream = null, F0 = null;
    if (fall) {
      const vd2 = (x, z) => Math.hypot(x - vc[0], z - vc[1]);
      const alongL = (x, z) => (x - fall.x) * fall.fx + (z - fall.z) * fall.fz;
      const i0 = river.findIndex((r) => vd2(r.x, r.z) >= CR - 1.4);
      const i1 = river.findIndex((r, q) => q > i0 && alongL(r.x, r.z) > -3.4);
      if (i0 >= 0 && i1 - i0 >= 6) {
        for (let q = i0; q <= i1; q++) river[q].inStream = true;
        const curve = new T.CatmullRomCurve3(river.slice(i0, i1 + 1).map((r) => new T.Vector3(r.x, 0, r.z)), false, 'centripetal');
        const Ltot = curve.getLength(), WO = 2.9, shelfL = fall.top + 0.1;
        const at = (s) => {
          const u = Math.max(0, Math.min(1, s / Ltot)), p = curve.getPointAt(u), t = curve.getTangentAt(u), l = Math.hypot(t.x, t.z) || 1;
          const ex = Math.max(0, s - Ltot); // 끝을 넘으면 마지막 방향으로 연장
          return { x: p.x + (t.x / l) * ex, z: p.z + (t.z / l) * ex, tx: t.x / l, tz: t.z / l, nx: -t.z / l, nz: t.x / l };
        };
        const bankAt = (s) => { const a = at(s); return Math.min(sampleRaw(F, a.x + a.nx * 2.4, a.z + a.nz * 2.4), sampleRaw(F, a.x - a.nx * 2.4, a.z - a.nz * 2.4)); };
        const minBank = (a, b) => { let m = Infinity; for (let s = a; s <= b + 1e-6; s += 0.2) m = Math.min(m, bankAt(s)); return m; };
        // 웅덩이(수면 높이) 나누기: 0번은 호수 높이 그대로 테두리를 지나 나오는 물길
        const pools = [];
        let s0 = 0;
        while (s0 < Ltot && vd2(at(s0).x, at(s0).z) < CR + 0.9) s0 += 0.1;
        pools.push({ a: 0, b: s0, L: lakeLv });
        // 계단식: 호수 출구에서 한 번 쏟아진 뒤(백록담 넘침) 완만한 여울이 흐르다, 산비탈이 급히 낮아지는 곳마다 턱에서 떨어진다.
        // 여울은 양옆 둑보다 0.9 이상 낮게(협곡 속) 약 14°로 내려가고, 둑이 여울보다 빨리 낮아져 물이 둑 위로 떠오르려 하면 그 자리에 낙하(1.5m 이상)를 만든다.
        // 마지막은 큰 폭포 위 작은 소(둥근 웅덩이)에 떨어져 바위턱으로 흘러간다.
        // (예전엔 ①평평한 웅덩이 계단 → '물웅덩이만 많다', ②웅덩이 없는 급류 띠 하나 → '물이 굵고 알차게 떨어지는 느낌이 없다')
        const bankS = (q) => { let m = 0; for (let d = -1; d <= 1.01; d += 0.5) m += bankAt(Math.max(0, Math.min(Ltot, q + d))); return m / 5; };
        const cap = (q) => bankS(q) - 0.9, LP = 3.0, SC = 0.24, DIG = 1.6, endL = shelfL + 0.12, qEnd = Ltot - LP;
        pools[0].ww = 0.72 + hash(0, 78, sd) * 0.32;
        const samples = [];
        {
          const p0 = pools[0], n0 = Math.max(3, Math.ceil((p0.b - p0.a) / 0.2));
          for (let i = 0; i <= n0; i++) { const u = i / n0, q = p0.a + (p0.b - p0.a) * u; samples.push({ ...at(q), s: q, k: 0, u, L: lakeLv, ww: p0.ww, depth: (0.08 + 0.34 * (1 - ss(0.35, 0.97, u))) * 0.8 }); }
        }
        {
          let q = s0, L = lakeLv - 0.04, chute = 0, seg = null;
          // 턱마다 물이 한쪽 홈(노치)으로 모여 떨어진다 (여울 폭 그대로 떨어지면 사람이 만든 보처럼 보인다)
          const open = (Lstart) => { const ww = 0.82 + hash(pools.length, 78, sd) * 0.18; seg = { a: q, L: Lstart, cascade: true, ww, nh: ww * 0.7, nc: (hash(pools.length, 79, sd) - 0.5) * 0.4 * ww, pts: [] }; pools.push(seg); L = Lstart; chute = 0; };
          // 첫 낙하: 호수 출구에서 바로 (2.2m 이상, 둑 아래 깊숙이)
          open(Math.min(L - 2.2, cap(q + 0.6) - DIG));
          seg.pts.push({ q: q + 0.05, L });
          while (q + 0.2 < qEnd - 0.4) {
            q += 0.2; chute += 0.2;
            const ideal = seg.L - SC * (q - seg.a), cp = cap(q);
            // 여울의 이상선(일정 기울기)이 둑보다 빨리 못 내려가 둑 위로 떠오르려 하면 → 그 자리에 턱을 만들어 둑 아래 깊숙이 떨어진다
            const deficit = ideal - cp;
            if (q < qEnd - 3.0 && chute > 1.6 && deficit > 1.0) {
              seg.b = q;
              open(Math.min(L - 1.5, cp - DIG));
              seg.pts.push({ q: q + 0.05, L });
              continue;
            }
            L = Math.max(Math.min(ideal, cp + 0.45), endL + 1.2); // 둑 위로는 못 떠오르고, 마지막 소보다 1.2 위에서 끝난다 (마지막 낙하)
            seg.pts.push({ q, L });
          }
          seg.b = q;
          pools.forEach((p, k) => {
            if (!p.pts) return;
            const n = p.pts.length;
            p.pts.forEach((pt, j) => samples.push({ ...at(pt.q), s: pt.q, k, u: n > 1 ? j / (n - 1) : 0, L: pt.L, ww: p.ww, depth: 0.14 + 0.1 * vnoise(pt.q * 0.6, 1.3, sd + 79) }));
            delete p.pts;
          });
          // 큰 폭포 위 작은 소 (둥근 웅덩이)
          const pl = { a: q, b: Ltot, L: endL, ww: 1.15 };
          pools.push(pl);
          const kl = pools.length - 1, nl = Math.max(3, Math.ceil((pl.b - pl.a) / 0.2));
          for (let j = 0; j <= nl; j++) { const u = j / nl, qq = pl.a + (pl.b - pl.a) * u + (j === 0 ? 0.05 : 0); samples.push({ ...at(qq), s: qq, k: kl, u, L: endL, ww: pl.ww, depth: 0.3 + 0.25 * (1 - ss(0.5, 1, u)) }); }
        }
        // 곡률(+면 법선 n 쪽으로 휜다): 굽이 안쪽은 협곡 단면을 줄여 서로 접히지 않게
        for (const sm of samples) { const a = at(sm.s - 0.4), b = at(sm.s + 0.4); sm.kap = Math.asin(Math.max(-1, Math.min(1, a.tx * b.tz - a.tz * b.tx))) / 0.8; }
        // 끝: 바위턱 위로 떨어진 뒤 벽이 땅속으로 숨는 꼬리 단면
        for (const ex of [0.05, 0.5, 1.0]) samples.push({ ...at(Ltot + ex), s: Ltot + ex, k: pools.length, u: 0, L: shelfL, ww: 1.2, depth: 0.2, tail: ex });
        // 벽 높이 기준: 파기 전 양옆 지형
        for (const sm of samples) {
          sm.hL = sampleRaw(F, sm.x - sm.nx * (WO - 0.35), sm.z - sm.nz * (WO - 0.35));
          sm.hR = sampleRaw(F, sm.x + sm.nx * (WO - 0.35), sm.z + sm.nz * (WO - 0.35));
        }
        F0 = F.slice();
        // 지형 파기: 물길 폭만, 계곡 바닥보다 0.35 아래로 (계단 경계에선 아래 웅덩이 바닥 기준 → 바닥이 물 위로 안 튀어나옴)
        let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
        for (const sm of samples) { mnx = Math.min(mnx, sm.x); mxx = Math.max(mxx, sm.x); mnz = Math.min(mnz, sm.z); mxz = Math.max(mxz, sm.z); }
        const gi0 = Math.max(0, Math.floor((mnx - 4 - ORIGIN) / STEP)), gi1 = Math.min(FG - 1, Math.ceil((mxx + 4 - ORIGIN) / STEP));
        const gj0 = Math.max(0, Math.floor((mnz - 4 - ORIGIN) / STEP)), gj1 = Math.min(FG - 1, Math.ceil((mxz + 4 - ORIGIN) / STEP));
        for (let j = gj0; j <= gj1; j++)
          for (let i = gi0; i <= gi1; i++) {
            const x = ORIGIN + i * STEP, z = ORIGIN + j * STEP;
            if (vd2(x, z) < CR - 0.7) continue; // 호수 안은 그대로
            let bd = 1e9, best = null, lo = 1e9;
            for (const sm of samples) {
              if (sm.tail) continue;
              const dd = (x - sm.x) ** 2 + (z - sm.z) ** 2;
              if (dd < bd) { bd = dd; best = sm; }
              if (dd < 2.6) lo = Math.min(lo, sm.L - sm.depth);
            }
            if (!best || bd > 1.6 * 1.6) continue;
            let to = Math.min(best.L - best.depth, lo) - 0.35;
            if (alongL(x, z) > -3.45) to = Math.max(to, fall.top - 0.05); // 바위턱은 파지 않는다
            const kk = j * FG + i;
            F[kk] = Math.min(F[kk], to);
          }
        stream = { samples, pools, Ltot, WO, shelfL };
      }
    }
    const fi = river.findIndex((r, q) => q >= ci - 2 && q > 0 && river[q - 1].bed - r.bed > 1.5);
    return { f: F, seed: sd, river, vc, VR, PEAK, fallAt: fi > 0 ? river[fi] : null, fall, stream, f0: F0, crater: { x: vc[0], z: vc[1], R: CR, level: lakeLv, rim: rimH } };
  }

  // 블러 전 격자를 월드 좌표로 바로 읽기 (비틀기 없음)
  function sampleRaw(arr, x, z) {
    return sample(arr, (x - ORIGIN) / STEP, (z - ORIGIN) / STEP);
  }

  function sample(arr, fi, fj) {
    fi = Math.max(0, Math.min(FG - 1.001, fi));
    fj = Math.max(0, Math.min(FG - 1.001, fj));
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
    const a = arr[j * FG + i], b = arr[j * FG + i + 1], c = arr[(j + 1) * FG + i], d = arr[(j + 1) * FG + i + 1];
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }

  function heightAt(x, z) { return heightAtF(field.f, x, z); }
  // 화면에 그려진 지형(삼각형)과 정확히 같은 높이 — 캐릭터·카메라용 (heightAt는 쌍선형이라 절벽에서 최대 2m 어긋남)
  function groundAt(x, z) {
    const fi = (x - ORIGIN) / STEP, fj = (z - ORIGIN) / STEP;
    const i = Math.max(0, Math.min(FG - 2, Math.floor(fi))), j = Math.max(0, Math.min(FG - 2, Math.floor(fj)));
    const u = fi - i, v = fj - j, X0 = ORIGIN + i * STEP, Z0 = ORIGIN + j * STEP;
    const b = heightAt(X0 + STEP, Z0), c = heightAt(X0, Z0 + STEP);
    // PlaneGeometry는 칸마다 (i, j+1)–(i+1, j) 대각선으로 삼각형을 나눈다
    if (u + v <= 1) { const a = heightAt(X0, Z0); return a + (b - a) * u + (c - a) * v; }
    const d = heightAt(X0 + STEP, Z0 + STEP);
    return d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }
  // 계곡을 파기 전 지형 (협곡 벽이 원래 땅 위에 덮이도록)
  function heightOrig(x, z) { return heightAtF(field.f0 || field.f, x, z); }
  // 좌표를 살짝 비틀어 격자 해안선을 자연스러운 곡선으로. 화산·폭포 주변은 비틀지 않는다(개울·폭포 위치와 지형이 어긋나지 않게)
  function warpOf(x, z) {
    const wa = 7.0 * ss(field.VR * 0.95, field.VR * 1.4, Math.hypot(x - field.vc[0], z - field.vc[1]));
    return [(vnoise(x * 0.045, z * 0.045, field.seed + 11) - 0.5) * wa, (vnoise(x * 0.045, z * 0.045, field.seed + 12) - 0.5) * wa];
  }
  // 격자 좌표 (gx, gz)가 화면에 그려지는 위치 (warp의 역). 몇 번 되풀이하면 수렴한다
  function unwarp(gx, gz) {
    let x = gx, z = gz;
    for (let k = 0; k < 5; k++) { const [dx, dz] = warpOf(x, z); x = gx - dx; z = gz - dz; }
    return [x, z];
  }
  function heightAtF(arr, x, z) {
    const [dx, dz] = warpOf(x, z);
    const fi = (x + dx - ORIGIN) / STEP, fj = (z + dz - ORIGIN) / STEP;
    const base = sample(arr, fi, fj);
    return base + (vnoise(x * 0.35, z * 0.35, field.seed + 7) - 0.5) * (base > 0 ? 0.22 : 0.08) + (vnoise(x * 1.3, z * 1.3, field.seed + 9) - 0.5) * 0.04;
  }

  // 지역 나누기: 해변 / 초원 / 섞인 숲 / 정글 / 고원
  function biomeNoise(x, z) { return vnoise(x * 0.014 + 3, z * 0.014 - 2, field.seed + 41) * 0.75 + vnoise(x * 0.05, z * 0.05, field.seed + 43) * 0.25; }
  function biome(x, z, h) {
    if (h < 0.85) return 'coast';
    if (h > 8.5) return 'highland';
    const n = biomeNoise(x, z);
    return n < 0.42 ? 'meadow' : n > 0.57 ? 'jungle' : 'wood';
  }

  // 구획 가운데 (q 없는 칸 객체면 칸 가운데)
  function cellCenter(p) {
    const ox = p.q === undefined ? S / 2 : ((p.q % LS) + 0.5) * LOT, oz = p.q === undefined ? S / 2 : (Math.floor(p.q / LS) + 0.5) * LOT;
    return { x: ORIGIN + (p.x + M) * S + ox, z: ORIGIN + (p.y + M) * S + oz };
  }
  let lotIndex = null, lotIndexOf = null;
  function plotAt(x, z) {
    if (lotIndexOf !== plots) { lotIndex = new Map(plots.map((p) => [p.x + ',' + p.y + ',' + (p.q || 0), p])); lotIndexOf = plots; }
    const gx = (x - ORIGIN) / S - M, gz = (z - ORIGIN) / S - M, cx = Math.floor(gx), cy = Math.floor(gz);
    const q = Math.min(LS - 1, Math.floor((gx - cx) * LS)) + LS * Math.min(LS - 1, Math.floor((gz - cy) * LS));
    return lotIndex.get(cx + ',' + cy + ',' + q) || null;
  }
  // 섬 지형 칸 (식생 등 칸 단위로 흩뿌리는 것용). 칸 번호는 분할 전 필지 번호와 같아 식생 배치가 그대로다
  function cellsOf(ps) {
    const m = new Map();
    for (const p of ps) if (!m.has(p.cell || p.id)) m.set(p.cell || p.id, { id: p.cell || p.id, x: p.x, y: p.y, terrain: p.terrain });
    return [...m.values()];
  }

  function buildTerrain() {
    const geo = new T.PlaneGeometry(SIZE, SIZE, FG - 1, FG - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      const edge = Math.max(Math.abs(x), Math.abs(z)) / (SIZE / 2);
      pos.setY(k, heightAt(x, z) - Math.max(0, edge - 0.85) * 30);
    }
    // 부드러운 곡면 + 정점마다 모래·풀·정글 바닥 비율(aBlend)과 젖은 정도(색조)를 정한다
    geo.computeVertexNormals();
    const p = geo.attributes.position, n = geo.attributes.normal;
    const blend = new Float32Array(p.count * 4), col = new Float32Array(p.count * 3), uv = new Float32Array(p.count * 2);
    const rvPts = field.river ? field.river.filter((r) => !r.lake && r.u < 0.6) : null;
    const c = new T.Color(), WET = new T.Color('#d9cfb8'), SEABED = new T.Color('#3f7f97'), WHITE = new T.Color('#ffffff'), MEADOW = new T.Color('#eaffc4');
    for (let k = 0; k < p.count; k++) {
      const h = p.getY(k), ny = n.getY(k), x = p.getX(k), z = p.getZ(k);
      // 바위: 가파른 비탈과 화산 윗부분 / 모래: 바닷가 / 정글 바닥: 산기슭 / 나머지 풀
      const nearFall = field.fall ? ss(14, 7, Math.hypot(x - field.fall.cx, z - field.fall.cz)) : 0;
      // 개울 골짜기: 산 위 물길 둘레는 젖은 바위 (물길이 또렷하게)
      let rd = 99;
      if (h > 2 && rvPts) for (let q = 0; q < rvPts.length; q += 2) { const r = rvPts[q], dd = (x - r.x) ** 2 + (z - r.z) ** 2; if (dd < rd) rd = dd; }
      const gully = h > 2 ? ss(3.4, 1.4, Math.sqrt(rd)) : 0;
      const fpl = field.fall, crl = field.crater;
      const underPool = fpl && Math.hypot(x - fpl.cx, z - fpl.cz) < fpl.BR + 1.6 && h < fpl.poolY + 0.05 ? ss(fpl.poolY + 0.05, fpl.poolY - 0.25, h) : 0;
      const underLake = crl && Math.hypot(x - crl.x, z - crl.z) < crl.R + 0.3 && h < crl.level + 0.05 ? ss(crl.level + 0.05, crl.level - 0.25, h) : 0;
      const underW = Math.max(underPool, underLake);
      const rock = Math.max(h > 1.5 ? Math.max(ss(0.66, 0.42, ny), ss(13, 17.5, h), nearFall * ss(0.92, 0.6, ny), gully * 0.85) : 0, underW * 0.75);
      const sand = (1 - rock) * ss(0.5, 0.32, h);
      const foot = field.vc ? ss(field.VR * 1.15, field.VR * 0.5, Math.hypot(x - field.vc[0], z - field.vc[1])) : 0;
      const bn = biomeNoise(x, z);
      const jungle = (1 - rock - sand) * Math.min(0.85, ss(0.5, 0.62, bn) * 0.85 + foot * 0.2);
      const meadow = ss(0.46, 0.36, bn) * (1 - sand) * (1 - rock);
      blend[k * 4] = sand; blend[k * 4 + 1] = Math.max(0, 1 - sand - jungle - rock); blend[k * 4 + 2] = jungle; blend[k * 4 + 3] = rock;
      c.copy(WHITE);
      if (h >= 0.04) c.lerp(MEADOW, meadow * 0.6);
      c.multiplyScalar(1 - gully * 0.38);
      if (underW > 0) c.lerp(SEABED, underW * 0.55).multiplyScalar(1 - underW * 0.25);
      if (h < 0.04) c.lerp(WET, ss(0.04, -0.12, h)).lerp(SEABED, ss(-0.7, -2.0, h));
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      uv[k * 2] = x * 0.22; uv[k * 2 + 1] = z * 0.22;
    }
    geo.setAttribute('aBlend', new T.BufferAttribute(blend, 4));
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
    const rl = RL();
    const mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, color: rl ? '#ffffff' : '#e8dcc0' });
    if (rl) {
      mat.normalMap = rl.tex.sand.nor;
      mat.normalScale = new T.Vector2(0.7, 0.7);
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.tSand = { value: rl.tex.sand.diff };
        sh.uniforms.tGrass = { value: rl.tex.grass.diff };
        sh.uniforms.tJungle = { value: rl.tex.jungle.diff };
        sh.uniforms.tRock = { value: rl.tex.rock.diff };
        sh.uniforms.tRockN = { value: rl.tex.rock.nor };
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec4 aBlend; varying vec4 vBlend; varying vec2 vTUv;')
          .replace('#include <common>', '#include <common>\nvarying vec3 vWP, vWN;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlend = aBlend; vTUv = uv; vWP = (modelMatrix * vec4(position, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * normal);');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform sampler2D tSand, tGrass, tJungle, tRock; varying vec4 vBlend; varying vec2 vTUv; varying vec3 vWP, vWN;\nfloat tnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453), b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453), c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453), d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453); return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }\nvec3 tri(sampler2D t, float k){ vec3 w = pow(abs(vWN), vec3(4.0)); w /= (w.x + w.y + w.z); return texture2D(t, vWP.zy * k).rgb * w.x + texture2D(t, vWP.xz * k).rgb * w.y + texture2D(t, vWP.xy * k).rgb * w.z; }')
          .replace('#include <map_fragment>', `
            // 가까운 무늬와 먼 무늬를 섞어 타일 반복이 덜 보이게
            vec3 sA = texture2D(tSand, vTUv).rgb, sB = texture2D(tSand, vTUv * 0.23).rgb;
            vec3 gA = texture2D(tGrass, vTUv * 0.8).rgb, gB = texture2D(tGrass, vTUv * 0.17).rgb;
            vec3 jA = texture2D(tJungle, vTUv * 0.7).rgb, jB = texture2D(tJungle, vTUv * 0.15).rgb;
            vec3 sand = mix(sA, sB, 0.45) * vec3(1.08, 1.05, 1.0);
            // 풀·정글 바닥은 텍스처의 질감(밝기)만 쓰고 색은 열대의 짙은 초록으로
            float gl = dot(mix(gA, gB, 0.4), vec3(0.3, 0.59, 0.11)) * 1.9;
            float gv = smoothstep(0.25, 0.75, dot(gB, vec3(0.3, 0.59, 0.11)) * 2.0);
            vec3 grass = mix(vec3(0.16, 0.36, 0.09), vec3(0.36, 0.56, 0.16), gv) * gl;
            // 풀밭 얼룩: 큰 결로 마른 풀(누런)·짙은 풀(그늘진 초록) 패치 + 잔 결 (한 가지 초록이 번진 듯한 밋밋함을 깬다)
            float pa = tnoise(vWP.xz * 0.035), pb = tnoise(vWP.xz * 0.11 + 17.0), pc = tnoise(vWP.xz * 0.6 + 3.0);
            grass = mix(grass, grass * vec3(1.35, 1.18, 0.62), smoothstep(0.58, 0.8, pa) * 0.75);   // 마른 풀
            grass = mix(grass, grass * vec3(0.62, 0.78, 0.6), smoothstep(0.45, 0.2, pb) * 0.6);     // 짙고 축축한 풀
            grass *= 0.9 + 0.2 * pc;
            float jl = dot(mix(jA, jB, 0.4), vec3(0.3, 0.59, 0.11)) * 2.0;
            vec3 jungle = mix(vec3(0.10, 0.22, 0.07), vec3(0.24, 0.24, 0.12), smoothstep(0.3, 0.7, jl * 0.5)) * jl;
            vec3 rock = mix(tri(tRock, 0.13), tri(tRock, 0.03), 0.5) * vec3(0.78, 0.76, 0.74);
            // 화산 바위: 층층이 쌓인 지층 띠 + 빗물에 패인 세로 골 (민둥 원뿔처럼 보이지 않게)
            float strata = sin(vWP.y * 2.6 + tnoise(vWP.xz * 0.15) * 5.0);
            rock *= 0.55 + 0.45 * smoothstep(-0.3, 0.3, strata); // 또렷한 층 경계
            rock *= mix(1.0, 0.72, smoothstep(0.62, 0.85, tnoise(vec2(atan(vWP.z, vWP.x) * 9.0, vWP.y * 0.12))) * smoothstep(3.0, 8.0, vWP.y));
            // 색은 텍스처에 곱해 질감을 살린다 (선형 공간이라 고정색을 넣으면 분홍빛으로 뜬다)
            rock *= mix(vec3(1.0), vec3(0.5, 0.48, 0.47), smoothstep(6.0, 12.0, vWP.y));   // 중턱: 짙은 현무암
            rock *= mix(vec3(1.0), vec3(1.25, 0.72, 0.52), smoothstep(14.0, 20.0, vWP.y)); // 정상: 붉은 화산재
            float slopeRock = max(smoothstep(0.8, 0.6, normalize(vWN).y) * smoothstep(1.0, 2.2, vWP.y), smoothstep(12.0, 15.0, vWP.y + tnoise(vWP.xz * 0.2) * 2.0)); // 높은 곳은 경사와 무관하게 바위
            vec4 bl = mix(vBlend, vec4(0.0, 0.0, 0.0, 1.0), slopeRock);
            // 물가 젖은 모래: 해수면 바로 위 띠가 어둡고 촉촉하게 + 그 위 마른 모래에 잔물결 자국
            float wet = 1.0 - smoothstep(0.05, 0.34, vWP.y);
            sand = mix(sand, sand * vec3(0.62, 0.6, 0.58), wet * 0.85);
            sand *= 0.93 + 0.1 * tnoise(vec2(vWP.x * 0.9 + sin(vWP.z * 0.7) * 2.0, vWP.z * 0.25));
            diffuseColor.rgb *= sand * bl.x + grass * bl.y + jungle * bl.z + rock * bl.w;`);
      };
    }
    const mesh = new T.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    return mesh;
  }

  // 물 셰이더가 수심을 알 수 있도록 높이맵을 텍스처로
  function buildLandTexture() {
    const data = new Uint8Array(FG * FG * 4);
    for (let j = 0; j < FG; j++)
      for (let i = 0; i < FG; i++) {
        const h = heightAt(ORIGIN + i * STEP, ORIGIN + j * STEP);
        const v = Math.max(0, Math.min(255, Math.round(((h + 3) / 4) * 255)));
        const k = (j * FG + i) * 4;
        data[k] = data[k + 1] = data[k + 2] = v;
        data[k + 3] = 255;
      }
    const tex = new T.DataTexture(data, FG, FG, T.RGBAFormat);
    tex.magFilter = T.LinearFilter;
    tex.minFilter = T.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  // ---------- 개울과 폭포 ----------
  let riverMesh = null, riverMat = null, mistGrp = null;
  function buildRiver() {
    // 폭포 협곡 구간은 리본을 끊는다 (걸러낸 점끼리 이어 붙이면 협곡을 가로지르는 판이 생김)
    const rv = field.river;
    if (!rv || rv.length < 3) return null;
    // 하구: 파기 전 원래 땅이 바다 높이로 내려가는 곳이 해안. 강은 해안 너머 3m까지 이어 그리고 바다빛으로 녹인다.
    // (예전엔 파낸 물길 바닥이 바다 높이 아래로 처음 내려간 곳 — 해안보다 20m쯤 안쪽 — 에서 리본을 끊어서
    //  강이 모래밭 한가운데서 끝나고, 바다 쪽엔 파인 물길에 고인 바닷물만 따로 떨어진 띠로 보였다)
    let qc = rv.findIndex((r) => r.down && r.g <= 0.05);
    if (qc < 0) qc = rv.length - 1;
    const alongR = [0];
    for (let q = 1; q < rv.length; q++) alongR.push(alongR[q - 1] + Math.hypot(rv[q].x - rv[q - 1].x, rv[q].z - rv[q - 1].z));
    const dCoast = (q) => alongR[qc] - alongR[q]; // 해안까지 남은 거리 (해안 너머는 음수)
    const keep = rv.map((r, q) => !r.lake && !r.inStream && dCoast(q) > -3.5 && (!field.fall || (r.down ? Math.hypot(r.x - field.fall.cx, r.z - field.fall.cz) > field.fall.BR + 0.6 : Math.hypot(r.x - field.fall.cx, r.z - field.fall.cz) > field.fall.BR + 5.6)));
    riverWater = new Map();
    let prevLv = Infinity;
    // 가로로 4칸 나눠 각 점이 지형에 밀착: 깊은 곳은 평평한 수면, 얕은 곳은 바닥을 덮는 얇은 물 (공중에 뜨지 않게)
    const NS = 8, pos = [], uv = [], fall = [], dep = [], fin = [], mth = [], idx = [];
    let along = 0, prevC = null;
    for (let q = 0; q < rv.length; q++) {
      const a = rv[Math.max(0, q - 1)], b = rv[Math.min(rv.length - 1, q + 1)], r = rv[q];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
      // 산 위 계곡물은 좁게, 아래 강은 넓게
      const w = 2.4 + r.u * 0.6 + Math.sin(q * 0.3) * 0.12; // 물가는 둑이 수면을 덮는 곳(깊이 버퍼)에서 생긴다
      const fp = field.fall, hc = heightAt(r.x, r.z), dPool = fp ? Math.hypot(r.x - fp.cx, r.z - fp.cz) : 99;
      let level = fp && r.down ? Math.min(fp.poolY - 0.02, Math.max(r.bed + 0.18, 0.02)) : Math.max(r.bed + 0.18, 0.02);
      // 폭포 웅덩이에서 나오는 물은 웅덩이 수면에서 몇 m에 걸쳐 내려간다 (웅덩이 가장자리에서 툭 떨어지면 일직선 둑처럼 보인다)
      if (fp && r.down) level = Math.max(level, fp.poolY - 0.02 - 0.35 * ss(fp.BR + 1.3, fp.BR + 7, dPool));
      // 하구: 해안에 가까워질수록 수면이 바다 높이로 내려간다 (해안에서 바다보다 2.5cm 위)
      level = Math.max(0.025, Math.min(level, 0.025 + Math.max(0, dCoast(q)) * 0.03));
      // 수면은 양쪽 둑보다 낮고, 하류로 갈수록 내려가기만 한다 (하구에서 모래 위로 물판이 떠 있지 않게)
      const bank = Math.min(heightAt(r.x + nx * w * 0.9, r.z + nz * w * 0.9), heightAt(r.x - nx * w * 0.9, r.z - nz * w * 0.9));
      // 폭포 웅덩이 안(그리지 않는 점)과 웅덩이 둑 바로 앞(둑이 웅덩이 수면보다 낮게 깎인 곳)은 기준에서 뺀다
      // (둑 앞 점이 기준이 되면 웅덩이 가장자리에서 수면이 16cm 툭 떨어져 일직선 둑처럼 보였다)
      if (r.down && keep[q] && !(fp && dPool < fp.BR + 1.6)) { level = Math.max(0.025, Math.min(level, bank - 0.05, prevLv)); prevLv = level; }
      // 물리 수면: 해안 안쪽만 (해안 너머는 바다로 친다)
      if (keep[q] && r.down && dCoast(q) > 0.5) {
        const key = Math.floor(r.x / 4) + ',' + Math.floor(r.z / 4);
        if (!riverWater.has(key)) riverWater.set(key, []);
        riverWater.get(key).push({ x: r.x, z: r.z, level, w: w * 0.8 });
      }
      const yc = Math.min(level, heightAt(r.x, r.z) + 0.1);
      if (q > 0) along += Math.hypot(r.x - rv[q - 1].x, r.z - rv[q - 1].z) + Math.abs(yc - prevC);
      const steep = q > 0 ? Math.min(1, Math.max(Math.abs(r.bed - rv[q - 1].bed) / 0.6, Math.abs(yc - prevC) / 1.0)) : 0;
      prevC = yc;
      for (let j = 0; j <= NS; j++) {
        const o = ((j / NS) * 2 - 1) * w, x = r.x + nx * o, z = r.z + nz * o;
        const ht = heightAt(x, z);
        pos.push(x, level, z);
        dep.push(level - ht);
        mth.push(ss(-3.0, 6.0, dCoast(q))); // 하구: 해안 너머로 갈수록 바다빛에 녹는다
        uv.push(j / NS, along / 3);
        fall.push(steep);
        fin.push(r.down && field.fall ? ss(field.fall.BR + 0.6, field.fall.BR + 1.3, dPool) : 1); // 웅덩이 수면과 겹치는 첫 구간은 서서히 나타난다
      }
      if (q < rv.length - 1 && keep[q] && keep[q + 1])
        for (let j = 0; j < NS; j++) { const k = q * (NS + 1) + j, k2 = k + NS + 1; idx.push(k, k2, k + 1, k + 1, k2, k2 + 1); }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setAttribute('aFall', new T.Float32BufferAttribute(fall, 1));
    g.setAttribute('aDepth', new T.Float32BufferAttribute(dep, 1));
    g.setAttribute('aIn', new T.Float32BufferAttribute(fin, 1));
    g.setAttribute('aMouth', new T.Float32BufferAttribute(mth, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    riverMat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, side: T.DoubleSide,
      uniforms: { uTime: waterMat.uniforms.uTime, uNormals: waterMat.uniforms.uNormals, uSky: waterMat.uniforms.uMid, uSea: waterMat.uniforms.uShallow, uDark: { value: new T.Color('#0f4a52') }, uStreak: { value: fallTextures().streak }, uLight: fallLight, ...DU },
      vertexShader: 'attribute float aFall, aDepth, aIn, aMouth; varying vec2 vUv; varying float vFall, vDepth, vIn, vMouth; varying vec3 vW; void main(){ vUv = uv; vFall = aFall; vDepth = aDepth; vIn = aIn; vMouth = aMouth; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uTime; uniform sampler2D uNormals, uStreak; uniform vec3 uSky, uSea, uDark, uLight; varying vec2 vUv; varying float vFall, vDepth, vIn, vMouth; varying vec3 vW;
        ${DEPTH_GLSL}
        void main(){
          float speed = mix(0.35, 2.4, vFall), nsp = min(speed, 0.45); // 노멀맵은 느리게 (빠르면 거꾸로 기는 착시)
          vec3 n = texture2D(uNormals, vec2(vUv.x * 0.8, vUv.y - uTime * nsp)).rgb * 2.0 - 1.0;
          vec4 st = texture2D(uStreak, vec2(vUv.x * 1.6, vUv.y * 0.9 - uTime * speed * 0.35));
          vec4 st2 = texture2D(uStreak, vec2(vUv.x * 2.8 + 0.37, vUv.y * 0.6 - uTime * speed * 0.19));
          vec3 n2 = texture2D(uNormals, vec2(vUv.x * 2.2 + 0.3, vUv.y * 2.0 - uTime * nsp * 1.3)).rgb * 2.0 - 1.0;
          // 수심: 깊을수록 진한 청록, 얕은 물가는 바닥이 비치며 사라진다
          float deep = smoothstep(0.05, 0.6, vDepth);
          vec3 V = normalize(cameraPosition - vW);
          float fr = pow(1.0 - abs(V.y), 3.0);
          // 위에서 내려다보면(지도) 하늘이 거의 안 비쳐 어두운 회청색 길처럼 보였다 → 물빛을 밝게, 하늘빛은 늘 조금 비치게
          vec3 col = mix(vec3(0.24, 0.5, 0.45), vec3(0.07, 0.36, 0.4), deep);
          col = mix(col, uSky * 0.85, 0.18 + fr * 0.3 + n.x * 0.06);
          float rapid = smoothstep(0.35, 0.75, st.r * 0.7 + st.g * 0.45);
          float lines = smoothstep(0.78, 0.96, st2.g) * 0.1 * (1.0 - vFall);
          col += uSky * pow(max(0.0, n.x * 0.6 + n2.y * 0.6), 4.0) * 0.35; // 잔물결 반짝임
          // 얕은 물가와 바위에 부딪히는 곳에 생기는 하얀 거품선
          float th = waterThick();
          float shore = max(smoothstep(0.32, 0.12, vDepth), smoothstep(0.3, 0.0, th)) * (0.3 + st2.r * 0.6);
          float foam = clamp(smoothstep(0.35, 0.9, vFall) * (0.15 + rapid * 0.9) + lines + shore * 0.5 + smoothstep(0.8, 1.0, n.x) * 0.12, 0.0, 1.0);
          col = mix(col, vec3(0.96, 0.98, 1.0), foam);
          // 하구: 바다의 얕은 물빛으로 바뀌며 녹아든다
          col = mix(uSea * 0.85, col, smoothstep(0.0, 0.8, vMouth));
          float alpha = smoothstep(-0.05, 0.12, vDepth + (st.b - 0.5) * 0.08) * mix(0.86, 0.97, max(deep, foam));
          alpha *= smoothstep(0.0, 0.05, vUv.x) * smoothstep(1.0, 0.95, vUv.x) * smoothstep(0.0, 0.22, th) * vIn * smoothstep(0.0, 0.6, vMouth);
          gl_FragColor = vec4(col * uLight, alpha);
          #include <encodings_fragment>
        }`,
    });
    const m = new T.Mesh(g, riverMat);
    m.renderOrder = 3;
    return m;
  }

  // 오염 해역 경계: 바다 위에 둘러선 보랏빛 독안개 벽
  function buildMiasma() {
    const geo = new T.CylinderGeometry(POLLUTION_R + 4, POLLUTION_R + 4, 26, 96, 1, true).translate(0, 9, 0);
    const mat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, side: T.DoubleSide,
      uniforms: { uTime: waterMat.uniforms.uTime, uLight: fallLight },
      vertexShader: 'varying vec2 vUv; varying vec3 vWm; void main(){ vUv = uv; vWm = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; uniform vec3 uLight; varying vec2 vUv; varying vec3 vWm;
        void main(){
          float n = sin(vUv.x * 138.23 + uTime * 0.4) * 0.5 + sin(vUv.x * 56.549 - uTime * 0.25 + vUv.y * 3.0) * 0.5; // 2π의 정수배: 원통 이음매에서 무늬가 끊기지 않게
          float a = (1.0 - vUv.y) * (0.22 + n * 0.06) * smoothstep(0.0, 0.08, vUv.y + 0.02);
          a *= 1.0 - smoothstep(50.0, 150.0, length(vWm.xz - cameraPosition.xz)); // 경계 가까이 가야만 보인다 (멀리선 수평선에 칙칙한 띠로만 읽힘)
          gl_FragColor = vec4(mix(vec3(0.4, 0.34, 0.46), vec3(0.32, 0.38, 0.3), 0.5 + n * 0.3) * min(vec3(1.0), uLight * 1.1), a); // 멍든 보라 띠처럼 안 보이게 회색 섞인 안개 · 밤엔 어둡게
          #include <encodings_fragment>
        }`,
    });
    const m = new T.Mesh(geo, mat);
    m.renderOrder = 4;
    return m;
  }

  // ---------- 폭포 ----------
  // ---------- 폭포: 첫 화면의 주인공 ----------
  let fallGrp = null, fallFx = null, fallAudio = null, fallMuted = false, fallWallMat = null, gestured = false, rockMats = [];
  const fallLight = { value: new T.Color(1, 1, 1) }, fallSun = { value: new T.Vector3(0.5, 0.6, -0.6) }; // 물빛·해 방향 (모든 물기둥이 공유)
  // ---- 후처리: 블룸(밝은 곳이 은은히 번짐) + 색보정 ----
  // r147은 렌더 타깃에 그릴 때도 톤매핑은 하고 sRGB 변환만 빼므로, 장면을 선형으로 받아 마지막에 sRGB로 바꾼다
  const LINPOW = { value: 1.0 }; // 화면 색으로 직접 쓴 발광 셰이더 보정용 (후처리 켜지면 2.2)
  let post = null;
  const POST_V = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  function createPost() {
    const scn = new T.Scene(), cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new T.Mesh(new T.PlaneGeometry(2, 2));
    quad.frustumCulled = false;
    scn.add(quad);
    const mk = (frag, uni) => new T.ShaderMaterial({ vertexShader: POST_V, fragmentShader: frag, uniforms: uni, depthTest: false, depthWrite: false, toneMapped: false });
    const bright = mk(`uniform sampler2D tSrc; uniform float uThr; varying vec2 vUv;
      void main(){ vec3 c = texture2D(tSrc, vUv).rgb; if (isnan(c.r) || isnan(c.g) || isnan(c.b) || isinf(c.r) || isinf(c.g) || isinf(c.b)) c = vec3(0.0); c = clamp(c, 0.0, 16.0); float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(uThr, uThr + 0.35, l), 1.0); }`, { tSrc: { value: null }, uThr: { value: 0.8 } });
    const down = mk(`uniform sampler2D tSrc; uniform vec2 uHp; varying vec2 vUv;
      void main(){ vec4 s = texture2D(tSrc, vUv) * 4.0 + texture2D(tSrc, vUv - uHp) + texture2D(tSrc, vUv + uHp) + texture2D(tSrc, vUv + vec2(uHp.x, -uHp.y)) + texture2D(tSrc, vUv - vec2(uHp.x, -uHp.y)); gl_FragColor = s / 8.0; }`, { tSrc: { value: null }, uHp: { value: new T.Vector2() } });
    const up = mk(`uniform sampler2D tSrc, tBase; uniform vec2 uHp; varying vec2 vUv;
      void main(){
        vec4 s = texture2D(tSrc, vUv + vec2(-uHp.x * 2.0, 0.0)) + texture2D(tSrc, vUv + vec2(uHp.x * 2.0, 0.0)) + texture2D(tSrc, vUv + vec2(0.0, uHp.y * 2.0)) + texture2D(tSrc, vUv + vec2(0.0, -uHp.y * 2.0));
        s += (texture2D(tSrc, vUv + vec2(-uHp.x, uHp.y)) + texture2D(tSrc, vUv + vec2(uHp.x, uHp.y)) + texture2D(tSrc, vUv + vec2(uHp.x, -uHp.y)) + texture2D(tSrc, vUv + vec2(-uHp.x, -uHp.y))) * 2.0;
        gl_FragColor = s / 12.0 + texture2D(tBase, vUv);
      }`, { tSrc: { value: null }, tBase: { value: null }, uHp: { value: new T.Vector2() } });
    const fin = mk(`uniform sampler2D tSrc, tBloom; uniform float uBloom; varying vec2 vUv;
      void main(){
        vec3 c0 = texture2D(tSrc, vUv).rgb, b0 = texture2D(tBloom, vUv).rgb;
        if (isnan(c0.r) || isnan(c0.g) || isnan(c0.b) || isinf(c0.r) || isinf(c0.g) || isinf(c0.b)) c0 = vec3(0.0);
        if (isnan(b0.r) || isnan(b0.g) || isnan(b0.b) || isinf(b0.r) || isinf(b0.g) || isinf(b0.b)) b0 = vec3(0.0);
        vec3 c = clamp(c0, 0.0, 16.0) + clamp(b0, 0.0, 16.0) * uBloom;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, 1.06) * vec3(1.015, 1.0, 0.985);          // 채도 조금, 살짝 따뜻하게
        c = max(c, 0.0);
        vec3 s = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); // 선형 → sRGB
        s = mix(s, s * s * (3.0 - 2.0 * s), 0.1);                        // 은은한 대비
        gl_FragColor = vec4(s, 1.0);
      }`, { tSrc: { value: null }, tBloom: { value: null }, uBloom: { value: 0.32 } });
    return { scn, cam, quad, bright, down, up, fin, w: 0, h: 0, main: null, b: [], u: [], fps: [], off: false };
  }
  function sizePost(P) {
    const W = renderer.domElement.width, H = renderer.domElement.height;
    if (P.main && P.w === W && P.h === H) return;
    if (P.main) { P.main.dispose(); P.b.forEach((r) => r.dispose()); P.u.forEach((r) => r.dispose()); }
    P.w = W; P.h = H;
    P.main = new T.WebGLRenderTarget(W, H, { type: T.HalfFloatType, samples: 4 });
    P.b = []; P.u = [];
    for (let i = 0; i < 4; i++) {
      const w = Math.max(1, W >> (i + 1)), h = Math.max(1, H >> (i + 1));
      P.b.push(new T.WebGLRenderTarget(w, h, { type: T.HalfFloatType, depthBuffer: false }));
      P.u.push(new T.WebGLRenderTarget(w, h, { type: T.HalfFloatType, depthBuffer: false }));
    }
  }
  function pass(P, mat, target) { P.quad.material = mat; renderer.setRenderTarget(target); renderer.render(P.scn, P.cam); }
  function renderPost() {
    const P = post;
    sizePost(P);
    renderer.setRenderTarget(P.main);
    renderer.render(scene, camera);
    P.bright.uniforms.tSrc.value = P.main.texture;
    pass(P, P.bright, P.b[0]);
    for (let i = 1; i < 4; i++) { P.down.uniforms.tSrc.value = P.b[i - 1].texture; P.down.uniforms.uHp.value.set(0.5 / P.b[i - 1].width, 0.5 / P.b[i - 1].height); pass(P, P.down, P.b[i]); }
    let src = P.b[3];
    for (let i = 2; i >= 0; i--) { P.up.uniforms.tSrc.value = src.texture; P.up.uniforms.tBase.value = P.b[i].texture; P.up.uniforms.uHp.value.set(0.5 / src.width, 0.5 / src.height); pass(P, P.up, P.u[i]); src = P.u[i]; }
    P.fin.uniforms.tSrc.value = P.main.texture;
    P.fin.uniforms.tBloom.value = P.u[0].texture;
    pass(P, P.fin, null);
  }
  // 프레임이 계속 낮으면 후처리를 끄고 해상도를 낮춘다 (저사양·모바일 보호)
  function watchFps(dt) {
    if (!post || post.off) return;
    post.fps.push(dt);
    if (post.fps.length < 150) return;
    const avg = post.fps.reduce((a, b) => a + b, 0) / post.fps.length;
    post.fps.length = 0;
    if (avg > 1 / 20) { post.off = true; LINPOW.value = 1.0; dprCap = 1.25; resize(); }
  }

  // ---- 깊이 버퍼 (Unity식 물): 지형·바위만 따로 그려, 물 표면에서 바닥까지 거리를 안다 ----
  // → 물가가 부드럽게 녹고, 해안·바위 둘레마다 거품선, 거품 입자는 바위에 닿으면 사라진다(소프트 파티클)
  const DEPTH_LAYER = 2;
  const DU = { uDepth: { value: null }, uDepthOn: { value: 0 }, uCam: { value: new T.Vector2(0.8, 3200) }, uRes: { value: new T.Vector2(1, 1) } };
  const DEPTH_GLSL = `
    uniform sampler2D uDepth; uniform float uDepthOn; uniform vec2 uCam, uRes;
    float linZ(float d){ float z = d * 2.0 - 1.0; return 2.0 * uCam.x * uCam.y / (uCam.y + uCam.x - z * (uCam.y - uCam.x)); }
    float waterThick(){ if (uDepthOn < 0.5) return 99.0; return linZ(texture2D(uDepth, gl_FragCoord.xy / uRes).x) - linZ(gl_FragCoord.z); }`;
  let depthRT = null, depthMat = null;
  const toDepth = (o) => o && o.traverse((c) => { if (c.isMesh) c.layers.enable(DEPTH_LAYER); });
  function depthPass() {
    const W0 = renderer.domElement.width, H0 = renderer.domElement.height, k = W0 > 3000 ? 0.5 : 1;
    const w = Math.max(1, Math.round(W0 * k)), h = Math.max(1, Math.round(H0 * k));
    if (!depthRT || depthRT.width !== w || depthRT.height !== h) {
      if (depthRT) depthRT.dispose();
      depthRT = new T.WebGLRenderTarget(w, h, { depthBuffer: true });
      depthRT.texture.generateMipmaps = false;
      depthRT.depthTexture = new T.DepthTexture(w, h);
      depthRT.depthTexture.type = T.UnsignedIntType;
      depthMat = depthMat || new T.MeshBasicMaterial({ colorWrite: false });
      DU.uDepth.value = depthRT.depthTexture;
    }
    const ov = scene.overrideMaterial, au = renderer.shadowMap.autoUpdate;
    scene.overrideMaterial = depthMat;
    renderer.shadowMap.autoUpdate = false;
    camera.layers.set(DEPTH_LAYER);
    renderer.setRenderTarget(depthRT);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    camera.layers.set(0);
    renderer.shadowMap.autoUpdate = au;
    scene.overrideMaterial = ov;
    DU.uDepthOn.value = 1;
    DU.uCam.value.set(camera.near, camera.far);
    DU.uRes.value.set(W0, H0);
  }
  const NOISE_GLSL = `
    float fh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float fn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(fh(i), fh(i + vec2(1.0, 0.0)), f.x), mix(fh(i + vec2(0.0, 1.0)), fh(i + vec2(1.0, 1.0)), f.x), f.y); }
    float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * fn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }`;

  // ---- 폭포 텍스처 (캔버스로 한 번 생성, 타일링) ----
  // 물줄기: R=굵은 세로 줄기, G=가는 줄기, B=끊어지는 덩어리 / 거품: 몽글몽글한 덩어리 4종(2x2)
  let fallTexCache = null;
  function fallTextures() {
    if (fallTexCache) return fallTexCache;
    const lat = (ix, iy, px, py, sd) => hash(((ix % px) + px) % px, ((iy % py) + py) % py, sd);
    const pn = (x, y, px, py, sd) => {
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
      const a = lat(ix, iy, px, py, sd), b = lat(ix + 1, iy, px, py, sd), c = lat(ix, iy + 1, px, py, sd), d = lat(ix + 1, iy + 1, px, py, sd);
      return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
    };
    const pf = (x, y, px, py, sd, oct) => {
      let v = 0, a = 0.5, n = 0;
      for (let o = 0; o < oct; o++) { v += a * pn(x, y, px, py, sd + o * 7); n += a; x *= 2; y *= 2; px *= 2; py *= 2; a *= 0.5; }
      return v / n;
    };
    const cl = (v) => Math.max(0, Math.min(1, v));
    const TW = 128, TH = 512, cv = document.createElement('canvas');
    cv.width = TW; cv.height = TH;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(TW, TH);
    for (let y = 0; y < TH; y++)
      for (let x = 0; x < TW; x++) {
        const u = x / TW, v = y / TH, k = (y * TW + x) * 4;
        img.data[k] = 255 * Math.pow(cl((pf(u * 12, v * 2, 12, 2, 11, 4) - 0.3) / 0.42), 1.5);
        img.data[k + 1] = 255 * Math.pow(cl((pf(u * 28, v * 4, 28, 4, 23, 3) - 0.3) / 0.42), 1.8);
        img.data[k + 2] = 255 * cl((pf(u * 7, v * 9, 7, 9, 37, 4) - 0.28) / 0.46);
        img.data[k + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    const streak = new T.CanvasTexture(cv);
    streak.wrapS = streak.wrapT = T.RepeatWrapping;
    streak.anisotropy = 4;
    const FC = document.createElement('canvas');
    FC.width = FC.height = 256;
    const fctx = FC.getContext('2d'), fimg = fctx.createImageData(256, 256);
    for (let cell = 0; cell < 4; cell++) {
      const ox = (cell % 2) * 128, oy = Math.floor(cell / 2) * 128;
      for (let y = 0; y < 128; y++)
        for (let x = 0; x < 128; x++) {
          const u = (x + 0.5) / 128, v = (y + 0.5) / 128, dx = u - 0.5, dy = v - 0.5;
          // 바깥으로 갈수록 옅어지는 물보라: 큰 결 + 잔 물방울 결, 가운데만 진하게
          const n1 = pf(u * 4, v * 4, 4, 4, 50 + cell * 9, 4), n2 = pf(u * 11, v * 11, 11, 11, 80 + cell * 7, 3);
          const fall = Math.max(0, 1 - Math.hypot(dx * 1.05, dy * 1.2) * 2.15);
          const dens = cl((n1 * 0.75 + n2 * 0.45 - 0.42) * 2.4) * Math.pow(fall, 0.9);
          const shade = cl(0.88 + (n2 - 0.5) * 0.18 - dy * 0.12);
          const k = ((oy + y) * 256 + ox + x) * 4;
          fimg.data[k] = 255 * shade * 0.96; fimg.data[k + 1] = 255 * shade * 0.985; fimg.data[k + 2] = 255 * shade; fimg.data[k + 3] = 255 * dens;
        }
    }
    fctx.putImageData(fimg, 0, 0);
    const foam = new T.CanvasTexture(FC);
    fallTexCache = { streak, foam };
    return fallTexCache;
  }

  // 물줄기 셰이더 (Season·RiME 방식): 늘어나는 줄무늬 텍스처 두 겹, 아래로 갈수록 알파를 깎아 가닥으로 찢어지게
  function fallSheetMat(o, H) {
    return new T.ShaderMaterial({
      transparent: true, depthWrite: false, side: T.DoubleSide,
      uniforms: { uTime: waterMat.uniforms.uTime, uTex: { value: fallTextures().streak }, uH: { value: H }, uW: { value: o.w }, uSeed: { value: o.seed }, uOp: { value: o.op }, uSpeed: { value: o.speed }, uRag: { value: o.rag || 0 }, uLight: fallLight, uSky: waterMat.uniforms.uMid },
      vertexShader: 'varying vec2 vUv; varying vec3 vWp; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uTime, uH, uW, uSeed, uOp, uSpeed, uRag; uniform sampler2D uTex; uniform vec3 uLight, uSky; varying vec2 vUv; varying vec3 vWp;
        void main(){
          float t = vUv.y, x = vUv.x, e = min(x, 1.0 - x) * uW;
          // 물줄기 판을 옆(모서리)에서 보면 얇은 은색 막대가 된다 → 비스듬할수록 옅게
          vec3 fN = normalize(cross(dFdx(vWp), dFdy(vWp)));
          float edgeOn = smoothstep(0.04, 0.32, abs(dot(fN, normalize(cameraPosition - vWp))));
          vec3 col; float alpha;
          if (t < 0.0) {
            // 바위턱 위: 어둡고 매끈한 물이 가장자리로 빨려 들어가며 끝에서 하얗게 부푼다
            float s = -t;
            vec4 A = texture2D(uTex, vec2(x * uW * 0.18 + uSeed, s * 6.0 + uTime * 0.55 * uSpeed));
            col = mix(vec3(0.04, 0.16, 0.17), uSky * 0.75, 0.18 + A.g * 0.35);
            float crest = smoothstep(0.06, 0.0, s) * (0.5 + A.r * 0.5);
            col = mix(col, vec3(0.96, 0.98, 1.0), crest);
            alpha = smoothstep(0.0, 0.3, e) * mix(0.8, 0.97, crest) * smoothstep(0.25, 0.2, s);
          } else {
            float st = pow(t, 0.62);
            // 시간 주파수 주의: 한 지점을 지나는 무늬가 초당 4주기를 넘으면 25fps에선 거꾸로(위로) 흐르는 듯 보인다(수레바퀴 착시)
            // → 고운 파란 채널(세로 9주기)은 넓게 당겨 쓰고, 세 층은 같은 속도로(층 사이 맥놀이 방지)
            vec4 A = texture2D(uTex, vec2(x * uW * 0.2 + uSeed, st * uH * 0.075 - uTime * 0.8 * uSpeed));
            vec4 B = texture2D(uTex, vec2(x * uW * 0.37 + uSeed * 1.7, st * uH * 0.1 - uTime * 1.0 * uSpeed));
            // 물덩이: 줄무늬는 세로로 길어 흘러도 안 흐르는 듯 보인다 → 큰 덩어리가 또렷이 떨어지게 (초당 3주기)
            vec4 Cc = texture2D(uTex, vec2(x * uW * 0.12 + uSeed * 0.6, st * uH * 0.03 - uTime * 0.33 * uSpeed));
            float clump = Cc.b;
            float streak = (A.r * 0.6 + B.g * 0.5) * (0.7 + clump * 0.6);
            float aer = smoothstep(0.0, 0.4, t);
            // 작은 폭포(uRag)는 얕고 거칠게 부서지는 물이라 처음부터 하얗게 거품이 인다 (파란 판처럼 안 보이게)
            float white = smoothstep(0.5 - aer * 0.3, 0.8 - aer * 0.25, streak) + aer * 0.3 + uRag * (0.28 + 0.4 * smoothstep(0.0, 0.45, t)) * (0.6 + A.r * 0.6);
            vec3 body = mix(vec3(0.04, 0.15, 0.16), uSky * 0.6, 0.25 + A.g * 0.2 + uRag * 0.2);
            col = mix(body, vec3(0.97, 0.99, 1.0), clamp(white, 0.0, 1.0));
            col += uSky * smoothstep(0.05, 0.0, t) * 0.4;         // 입구의 매끈한 반사광
            // 침식: 아래로 갈수록 문턱이 올라가 가닥으로 찢어진다
            float thr = mix(-0.15, 0.5, smoothstep(0.1, 1.0, t));
            // 작은 폭포: 가장자리일수록 더 쉽게 찢어져 가닥만 남는다 (자로 자른 커튼처럼 안 보이게)
            thr += uRag * (1.0 - smoothstep(0.0, 0.6, e)) * (0.32 + 0.25 * smoothstep(0.0, 0.5, t));
            float dens = A.r * 0.35 + B.r * 0.3 + A.g * 0.2 + streak * 0.2 + (clump - 0.5) * 0.3; // 고운 b채널은 빨리 흐르면 착시가 나서 안 쓴다
            alpha = smoothstep(thr, thr + 0.16, dens);
            alpha *= smoothstep(0.0, 0.18 + B.b * 0.25, e);
            alpha *= mix(0.86, 1.0, clamp(white, 0.0, 1.0)) * (1.0 - smoothstep(0.86, 1.0, t) * 0.75);
          }
          gl_FragColor = vec4(col * uLight, alpha * uOp * mix(1.0, edgeOn, uRag));
          #include <encodings_fragment>
        }`,
    });
  }

  // ---------- 물기둥(혀+기둥) 생성기: 큰 폭포와 계곡의 작은 폭포가 같은 모양·재질을 쓴다 ----------
  // o.at(lat, s): 가로 lat(m)·흐름 방향 s(m, 음수=상류) → [x, z]. topY: 턱 수면, H: 낙차, W: 폭, T0: 가운데 두께, v0c: 가운데 앞속도,
  // sup: 턱 위로 이어 그리는 길이, narrow: 상류 폭 비율, aer0: 처음부터 섞인 공기(급류에서 오는 물은 이미 하얗다), sd: 무늬 시드
  // 턱에서 유리 같은 혀로 부풀어 넘어가 → 떨어지며 공기가 섞여 불투명한 흰 기둥이 되고 → 가장자리만 가닥으로 찢어진다.
  // (반투명 판 여러 장을 알파로 깎아 가닥을 내면 전체가 거즈처럼 비쳐 바람처럼 보였다. 질량은 '꽉 찬 가운데'에서 나온다)
  function fallCore(o) {
    const { at, topY, H, W, T0, v0c, sup } = o, narrow = o.narrow === undefined ? 1 : o.narrow, sd = o.sd || 0, aer0 = o.aer0 || 0, supA = o.supA === undefined ? 0.92 : o.supA;
    const G = 9.8, HW = W / 2, TMAX = Math.sqrt((2 * H) / G);
    // 가로 위치 q(-1~1)에 따른 물 두께·앞으로 쏘는 속도: 가운데가 두껍고 빠르다 (볼록한 혀), 두께는 가로로 조금씩 다르다
    const prof = (q) => Math.sqrt(Math.max(0, 1 - q * q));
    const thickAt = (q) => T0 * (0.3 + 0.7 * prof(q)) * (1 + (vnoise(q * 3.1 + 7, 2.2 + sd, seed + 311) - 0.5) * 0.3);
    const v0At = (q) => v0c * 0.62 + v0c * 0.38 * prof(q);
    const NC = o.nc || 40, NA = o.na || 10, NF = o.nf || 64, ROWS = NA + NF + 1, pos = [], uv = [], aT = [], aE = [], idx = [];
    const nk = Math.min(1.4, sup * 0.4), bk = Math.min(1.6, sup * 0.45);
    for (let i = 0; i <= NC; i++) {
      const u = i / NC, q = (u * 2 - 1) * 1.12; // 가장자리 여유(찢어질 몫)
      const qq = Math.min(1, Math.abs(q)), lat0 = q * HW, th0 = thickAt(qq), v0 = v0At(qq);
      for (let j = 0; j < ROWS; j++) {
        let x, y, z, t;
        if (j < NA) {
          // 턱 위: 수면에서 흘러와 마루에서 두께만큼 부풀어 오른다. 상류는 좁게(물길 폭), 마루에서 넓어진다
          const s = -sup * (1 - j / NA), k = ss(-bk, 0, s);
          const [px, pz] = at(lat0 * (narrow + (1 - narrow) * ss(-nk, 0, s)), s);
          x = px; z = pz; y = topY + th0 * 0.7 * k; t = s / sup; // 음수
        } else {
          const tau = (TMAX * 1.03 * (j - NA)) / NF, drop = 0.5 * G * tau * tau, out = v0 * tau;
          const sp = Math.hypot(v0, G * tau), th = th0 * (v0 / sp) + 0.05 * Math.min(1, T0 / 0.5); // 빨라질수록 얇아진다 (유량 보존)
          // 궤적의 바깥 법선(앞·위)으로 두께만큼 밀어 물의 '겉면'을 만든다 → 턱이 둥글게 부푼다
          const nx0 = (G * tau) / sp, ny0 = v0 / sp, tn = tau / (TMAX * 1.03);
          // 옆선이 자로 그은 듯 곧지 않게: 떨어질수록 가로로 조금씩 흔들린다
          const lat = lat0 * (1 + (0.1 * drop) / H) + (vnoise(tn * 5.5 + 3, q * 1.5 + 4 + sd, seed + 313) - 0.5) * 0.5 * (W / 4.4) * ss(0.05, 0.7, tn);
          const [px, pz] = at(lat, out + nx0 * th);
          x = px; z = pz; y = topY - drop + ny0 * th; t = tn;
        }
        pos.push(x, y, z); uv.push(u, t); aT.push(t); aE.push(Math.abs(q));
        if (i < NC && j < ROWS - 1) { const k = i * ROWS + j; idx.push(k, k + 1, k + ROWS, k + 1, k + ROWS + 1, k + ROWS); }
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setAttribute('aT', new T.Float32BufferAttribute(aT, 1));
    g.setAttribute('aE', new T.Float32BufferAttribute(aE, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mat = new T.ShaderMaterial({
      transparent: true, depthWrite: true, side: T.DoubleSide,
      uniforms: { uTime: waterMat.uniforms.uTime, uTex: { value: fallTextures().streak }, uSeed: { value: (seed + sd) % 7 }, uWx: { value: W / 4.4 }, uAer0: { value: aer0 }, uSupA: { value: supA }, uLight: fallLight, uSky: waterMat.uniforms.uMid, uSun: fallSun, ...DU },
      vertexShader: `attribute float aT, aE; varying vec2 vUv; varying float vT, vE; varying vec3 vW, vN;
        void main(){ vUv = uv; vT = aT; vE = aE; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uTime, uSeed, uWx, uAer0, uSupA; uniform sampler2D uTex; uniform vec3 uLight, uSky, uSun; varying vec2 vUv; varying float vT, vE; varying vec3 vW, vN;
        ${DEPTH_GLSL}
        void main(){
          float t = vT, x = vUv.x * uWx;
          vec3 V = normalize(cameraPosition - vW);
          vec3 n = normalize(vN); if (dot(n, V) < 0.0) n = -n;
          float fr = pow(1.0 - max(0.0, dot(n, V)), 3.0);
          float lit = 0.6 + 0.4 * max(0.0, dot(n, uSun));
          // 흐름 무늬는 '시간' 좌표: 빨라질수록 저절로 늘어난다. 한 지점을 초당 4주기 이하로 지나게(저fps에서 거꾸로 흐르는 착시 방지)
          vec4 A = texture2D(uTex, vec2(x * 0.9 + uSeed, t * 3.0 - uTime * 1.9));
          vec4 B = texture2D(uTex, vec2(x * 0.45 + uSeed * 1.7 + 0.3, t * 1.5 - uTime * 0.95));
          vec4 P = texture2D(uTex, vec2(x * 0.3 + 0.1, t * 0.6 - uTime * 0.38));
          // 가는 세로 밧줄 무늬(폭포 특유의 줄기)를 굵은 덩어리에 곱한다 (굵은 것만 쓰면 구름처럼 뭉개진다)
          float ropes = texture2D(uTex, vec2(x * 3.2 + uSeed * 0.5, t * 3.0 - uTime * 1.9)).r;
          float streak = (A.r * 0.55 + B.r * 0.45) * (0.65 + ropes * 0.7), pulse = P.b;
          // 공기 섞임: 마루에선 매끈한 유리물, 떨어지며 하얘진다 (급류에서 온 물은 처음부터 어느 정도 하얗다)
          float aer = max(uAer0, smoothstep(0.0, 0.4, t));
          vec3 glass = mix(vec3(0.03, 0.15, 0.16), uSky * 0.55, 0.14 + fr * 0.4);
          glass += uSky * pow(max(0.0, dot(reflect(-V, n), uSun)), 28.0) * 0.6;
          vec3 foam = vec3(0.93, 0.97, 1.0) * lit * (1.0 - 0.5 * vE * vE); // 기둥 옆면은 어둡게 (둥근 몸통)
          // 흰 줄(공기 많은 물)과 그 사이 탁한 청록 몸체: 대비가 있어야 두께가 보인다
          float white = aer * smoothstep(0.33, 0.8, streak * 0.75 + pulse * 0.35 + 0.05);
          vec3 body = mix(glass, foam, 0.3);
          vec3 col = mix(glass, body, aer);
          col = mix(col, foam, white);
          // 알파: 가운데는 꽉 찬 물, 가장자리로 갈수록·떨어질수록 가는 가닥으로 찢어진다
          float dens = ropes * 0.5 + A.g * 0.35 + streak * 0.15;
          float e = smoothstep(0.6, 1.08, vE) * (0.45 + 0.55 * smoothstep(0.0, 0.7, max(t, 0.0)));
          float thr = mix(-0.35, 0.66, e);
          float alpha = smoothstep(thr, thr + 0.18, dens);
          alpha *= 1.0 - smoothstep(0.88, 1.0, t) * 0.55; // 밑동은 물보라 속으로
          if (t < 0.0) {
            if (cameraPosition.y < vW.y - 0.03) discard; // 턱 위 물판은 밑면이 없다 (아래서 올려다보면 쟁반처럼 보였다)
            // 턱 위: 맑은 물에 상류의 흰 줄이 조금 섞여 흘러온다. 위쪽 끝과 옆은 서서히
            float sw = 0.12 + uAer0 * 0.3 + smoothstep(0.55, 0.9, A.g) * 0.35 * (0.5 + 0.5 * smoothstep(-1.0, 0.0, t));
            col = mix(glass, foam, sw);
            alpha = uSupA * smoothstep(-1.0, -0.72, t) * smoothstep(1.1, 0.92, vE);
          }
          alpha *= smoothstep(0.0, 0.3, waterThick()); // 소·바위와 닿는 곳은 부드럽게
          if (alpha < 0.02) discard;
          gl_FragColor = vec4(col * uLight, alpha);
          #include <encodings_fragment>
        }`,
    });
    const mesh = new T.Mesh(g, mat);
    mesh.renderOrder = 6;
    mesh.frustumCulled = false;
    return { mesh, mat, TMAX, OUT_END: v0c * TMAX, thickAt, v0At, HW, W };
  }

  // ---------- 떨어지는 물덩이: 속도 방향으로 길게 늘어난 물방울 수천 개가 중력으로 가속하며 떨어진다 (무게·속도감은 여기서) ----------
  // NP개는 턱에서 떨어지는 덩이, NS개는 바닥에 부딪혀 튀는 짧은 물방울. spawn/spawnSplash가 pp·pv·pa·psz·floor를 채운다
  function chunkSystem(NP, NS) {
    const N = NP + NS, pp = new Float32Array(N * 3), pv = new Float32Array(N * 3), pa = new Float32Array(N), psz = new Float32Array(N), life = new Float32Array(N), age = new Float32Array(N), floor = new Float32Array(N);
    const base = new T.PlaneGeometry(1, 1), pg = new T.InstancedBufferGeometry();
    pg.index = base.index;
    pg.setAttribute('position', base.attributes.position);
    pg.setAttribute('uv', base.attributes.uv);
    pg.setAttribute('iPos', new T.InstancedBufferAttribute(pp, 3).setUsage(T.DynamicDrawUsage));
    pg.setAttribute('iVel', new T.InstancedBufferAttribute(pv, 3).setUsage(T.DynamicDrawUsage));
    pg.setAttribute('iA', new T.InstancedBufferAttribute(pa, 1).setUsage(T.DynamicDrawUsage));
    pg.setAttribute('iSz', new T.InstancedBufferAttribute(psz, 1).setUsage(T.DynamicDrawUsage));
    pg.instanceCount = N;
    const pmat = new T.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uLight: fallLight, ...DU },
      vertexShader: `attribute vec3 iPos, iVel; attribute float iA, iSz; varying vec2 vUv; varying float vA;
        void main(){
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          // 화면에서 속도 방향으로 눕히고, 빠를수록 길게 (움직임이 흐려 보이는 효과)
          vec3 vv = (viewMatrix * vec4(iVel, 0.0)).xyz;
          float sp = length(iVel), l2 = length(vv.xy);
          vec2 dir = l2 > 1e-4 ? vv.xy / l2 : vec2(0.0, 1.0), perp = vec2(-dir.y, dir.x);
          float k = clamp(sp * 0.07, 0.0, 1.0);
          float len = mix(0.09, 0.62, k) * iSz, wid = 0.04 * iSz * (1.3 - 0.5 * k);
          mv.xyz += vec3(dir * position.y * len + perp * position.x * wid, 0.0);
          vUv = uv; vA = iA * smoothstep(0.4, 1.6, -mv.z);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uLight; varying vec2 vUv; varying float vA;
        ${DEPTH_GLSL}
        void main(){
          float a = smoothstep(0.5, 0.18, abs(vUv.x - 0.5)) * smoothstep(0.5, 0.28, abs(vUv.y - 0.5));
          gl_FragColor = vec4(vec3(0.96, 0.98, 1.0) * uLight, a * vA * smoothstep(0.0, 0.25, waterThick()));
          #include <encodings_fragment>
        }`,
    });
    const mesh = new T.Mesh(pg, pmat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 8;
    const sys = { mesh, pg, pp, pv, pa, psz, life, age, floor, NP, NS };
    // 중력으로 가속, 바닥(floor)에 닿으면 다시 턱에서. 튀는 물방울은 짧게 살고 나이 들수록 옅어진다 (정점에서 밝으면 물이 솟는 듯 보인다)
    sys.step = (dt, spawn, spawnSplash) => {
      for (let k = 0; k < N; k++) {
        pv[k * 3 + 1] -= 9.8 * dt;
        pp[k * 3] += pv[k * 3] * dt; pp[k * 3 + 1] += pv[k * 3 + 1] * dt; pp[k * 3 + 2] += pv[k * 3 + 2] * dt;
        if (k < NP) { if (pp[k * 3 + 1] < floor[k] + 0.02) spawn(k); }
        else {
          age[k] += dt;
          if (age[k] > life[k] || pp[k * 3 + 1] < floor[k]) spawnSplash(k);
          else pa[k] = 0.75 * (1 - age[k] / life[k]);
        }
      }
      pg.attributes.iPos.needsUpdate = true;
      pg.attributes.iVel.needsUpdate = true;
      pg.attributes.iA.needsUpdate = true;
      pg.attributes.iSz.needsUpdate = true;
    };
    return sys;
  }

  // 화면을 향하는 거품·물안개 덩어리 (인스턴스 사각형, 나이에 따라 침식되며 사라짐)
  function foamSystem(n, op, tex) {
    const base = new T.PlaneGeometry(1, 1), g = new T.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    g.setAttribute('uv', base.attributes.uv);
    const sys = { n, P: new Float32Array(n * 3), S: new Float32Array(n), A: new Float32Array(n), R: new Float32Array(n), Vr: new Float32Array(n),
      vel: new Float32Array(n * 3), life: new Float32Array(n), age: new Float32Array(n), s0: new Float32Array(n), rs: new Float32Array(n), g };
    for (let i = 0; i < n; i++) sys.Vr[i] = Math.floor(Math.random() * 4);
    g.setAttribute('iPos', new T.InstancedBufferAttribute(sys.P, 3).setUsage(T.DynamicDrawUsage));
    g.setAttribute('iSize', new T.InstancedBufferAttribute(sys.S, 1).setUsage(T.DynamicDrawUsage));
    g.setAttribute('iAge', new T.InstancedBufferAttribute(sys.A, 1).setUsage(T.DynamicDrawUsage));
    g.setAttribute('iRot', new T.InstancedBufferAttribute(sys.R, 1).setUsage(T.DynamicDrawUsage));
    g.setAttribute('iVar', new T.InstancedBufferAttribute(sys.Vr, 1));
    g.instanceCount = n;
    const m = new T.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uFoam: { value: tex }, uLight: fallLight, uOp: { value: op }, uNear: { value: 1 }, uGrad: { value: 0 }, uStretch: { value: new T.Vector2(1, 1) }, uFadeNear: { value: new T.Vector2(0.9, 2.6) }, ...DU },
      vertexShader: `attribute vec3 iPos; attribute float iSize, iAge, iRot, iVar; uniform vec2 uStretch; varying vec2 vUv; varying float vAge, vVar;
        void main(){
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          float c = cos(iRot), s = sin(iRot);
          vec2 p = vec2(c * position.x - s * position.y, s * position.x + c * position.y) * iSize * uStretch;
          vUv = uv; vAge = iAge; vVar = iVar;
          gl_Position = projectionMatrix * viewMatrix * vec4(iPos + right * p.x + up * p.y, 1.0);
        }`,
      fragmentShader: `uniform sampler2D uFoam; uniform vec3 uLight; uniform float uOp, uNear, uGrad; uniform vec2 uFadeNear; varying vec2 vUv; varying float vAge, vVar;
        ${DEPTH_GLSL}
        void main(){
          vec2 cell = vec2(mod(vVar, 2.0), floor(vVar / 2.0)) * 0.5;
          vec4 f = texture2D(uFoam, cell + clamp(vUv, 0.02, 0.98) * 0.5);
          float thr = 0.12 + smoothstep(0.2, 1.0, vAge) * 0.75;
          float a = smoothstep(thr, thr + 0.25, f.a) * smoothstep(0.0, 0.1, vAge);
          float vd = uDepthOn > 0.5 ? linZ(gl_FragCoord.z) : 10.0;
          gl_FragColor = vec4(f.rgb * uLight * mix(1.0, 0.55 + 0.65 * vUv.y, uGrad), a * uOp * uNear * smoothstep(0.0, 0.5, waterThick()) * smoothstep(uFadeNear.x, uFadeNear.y, vd)); // uGrad: 위가 밝고 아래가 어두운 덩어리
          #include <encodings_fragment>
        }`,
    });
    sys.mesh = new T.Mesh(g, m);
    sys.mesh.frustumCulled = false;
    sys.mat = m;
    return sys;
  }
  function stepFoam(sys, dt, spawn, grav, drag, grow) {
    const P = sys.P, vel = sys.vel;
    for (let i = 0; i < sys.n; i++) {
      sys.age[i] += dt;
      if (sys.age[i] >= sys.life[i]) spawn(sys, i);
      vel[i * 3 + 1] -= grav * dt;
      const k = 1 - drag * dt;
      vel[i * 3] *= k; vel[i * 3 + 1] *= k; vel[i * 3 + 2] *= k;
      P[i * 3] += vel[i * 3] * dt; P[i * 3 + 1] += vel[i * 3 + 1] * dt; P[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const a = sys.age[i] / sys.life[i];
      sys.A[i] = a;
      sys.S[i] = sys.s0[i] * (1 + a * grow);
      sys.R[i] += sys.rs[i] * dt;
    }
    for (const nm of ['iPos', 'iSize', 'iAge', 'iRot']) sys.g.attributes[nm].needsUpdate = true;
  }

  function buildWaterfall() {
    const fl = field.fall, rl = RL();
    if (!fl || fl.top - fl.bottom < 2) { fallFx = null; return null; }
    const grp = new T.Group();
    const R0 = fl.BR, fx = fl.fx, fz = fl.fz, sx = -fz, sz = fx, poolY = fl.poolY;
    const RW = R0 + 0.2, H = fl.top + 0.12 - poolY;
    const arc = (phi, r) => [fl.cx + r * (-fx * Math.cos(phi) + sx * Math.sin(phi)), fl.cz + r * (-fz * Math.cos(phi) + sz * Math.sin(phi))];
    const lipK = (phi) => ss(0.62, 0.44, Math.abs(phi));

    // --- 반원형 절벽: 층층이 갈라진 젖은 바위, 턱마다 이끼 ---
    if (rl) {
      const NC = 140, NR = 30, PH = 2.15, CAP = [[0.9, 0.05], [1.9, 0.5], [2.8, 1]], cliffHide = [];
      const pos = [], uvs = [], wet = [], idx = [], rows = NR + 1 + CAP.length;
      for (let i = 0; i <= NC; i++) {
        const phi = -PH + (2 * PH * i) / NC;
        const [ox, oz] = arc(phi, R0 + 2.8);
        const outer = heightAt(ox, oz), lk = lipK(phi);
        const capH = Math.max(poolY + 0.2, outer * (1 - lk) + fl.top * lk);
        const hide = ss(poolY + 1.4, poolY + 0.6, outer) * (1 - lk); // 절벽이 없는 낮은 땅
        cliffHide.push(hide);
        for (let j = 0; j <= NR; j++) {
          const v = j / NR, y = poolY - 1.0 + (capH - poolY + 1.0) * v;
          const n = vnoise(phi * 7 + 3, y * 0.7, seed + 71), n2 = vnoise(phi * 24, y * 2.4, seed + 73);
          const strata = Math.sin(y * 2.6 + n * 5) * 0.16 + (vnoise(phi * 3, y * 0.35, seed + 75) - 0.5) * 0.5;
          const disp = Math.max(-0.06, ((n - 0.3) * 1.1 + n2 * 0.3 + strata) * 1.5) * (1 - lk * 0.55); // 굴곡을 키워 벽 자체가 덩어리져 보이게
          const [x, z] = arc(phi, RW + disp);
          pos.push(x, y, z); uvs.push(phi * RW * 0.32, y * 0.32);
          wet.push(Math.min(1, ss(0.6, 0.15, Math.abs(phi)) * (0.55 + 0.45 * (1 - v)) + ss(0.25, 0, v) * 0.6));
        }
        for (const [dr, w] of CAP) {
          const [x, z] = arc(phi, RW + dr);
          const y = Math.max(capH * (1 - w) + (heightAt(x, z) + 0.02) * w, w < 1 ? capH - 0.02 : -99);
          pos.push(x, y, z); uvs.push(x * 0.32, z * 0.32); wet.push(lk * 0.5);
        }
      }
      // 절벽이 없는 구간: 벽·덮개를 땅속으로 내린다 (풀밭 위로 아치처럼 솟지 않게)
      for (let i = 0; i <= NC; i++) {
        const hd = cliffHide[i];
        if (!(hd > 0)) continue;
        for (let j = 0; j < rows; j++) {
          const k = (i * rows + j) * 3, gy = heightAt(pos[k], pos[k + 2]) - 0.3;
          pos[k + 1] = pos[k + 1] + (Math.min(pos[k + 1], gy) - pos[k + 1]) * hd;
        }
      }
      for (let i = 0; i < NC; i++)
        for (let j = 0; j < rows - 1; j++) {
          const a0 = i * rows + j, b0 = (i + 1) * rows + j;
          idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
        }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
      g.setAttribute('aWet', new T.Float32BufferAttribute(wet, 1));
      g.setIndex(idx);
      g.computeVertexNormals();
      // 위를 향한 턱엔 이끼, 폭포 뒤는 젖어 어둡게
      const nrm = g.attributes.normal, cols = new Float32Array(pos.length), c = new T.Color(), MOSS = new T.Color('#5d7a35'), STONE = new T.Color('#b0a89e');
      for (let k = 0; k < nrm.count; k++) {
        const up = Math.abs(nrm.getY(k)), wk = wet[k];
        c.copy(STONE).lerp(MOSS, ss(0.45, 0.8, up) * (1 - wk * 0.6) + vnoise(pos[k * 3] * 0.8, pos[k * 3 + 2] * 0.8, seed + 77) * 0.15);
        c.multiplyScalar(1 - wk * 0.5);
        cols[k * 3] = c.r; cols[k * 3 + 1] = c.g; cols[k * 3 + 2] = c.b;
      }
      g.setAttribute('color', new T.BufferAttribute(cols, 3));
      const wm = new T.MeshStandardMaterial({ map: rl.tex.rock.diff, normalMap: rl.tex.rock.nor, normalScale: new T.Vector2(1.5, 1.5), vertexColors: true, roughness: 0.92, side: T.DoubleSide, emissive: new T.Color('#33404f'), emissiveIntensity: 0 });
      fallWallMat = wm;
      wm.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aWet; varying float vWet;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWet = aWet;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWet;').replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.18, vWet);');
      };
      const wall = new T.Mesh(g, wm);
      wall.layers.enable(DEPTH_LAYER);
      wall.castShadow = true;
      wall.receiveShadow = true;
      grp.add(wall);
    }

    // ===== 물줄기 v2: 두께가 있는 하나의 물기둥 =====
    // 턱에서 유리 같은 혀로 부풀어 넘어가 → 떨어지며 공기가 섞여 불투명한 흰 기둥이 되고 → 가장자리만 가닥으로 찢어진다.
    // (예전엔 반투명 판 12장을 알파로 깎아 가닥을 냈는데, 전체가 거즈처럼 비쳐 바람처럼 보였다. 질량은 '꽉 찬 가운데'에서 나온다)
    const G = 9.8, W = 4.4, HW = W / 2, T0 = 0.55, V0C = 2.1;
    const TMAX = Math.sqrt((2 * H) / G), OUT_END = V0C * TMAX;
    const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    // 가로 위치 q(-1~1)에 따른 물 두께·앞으로 쏘는 속도: 가운데가 두껍고 빠르다 (볼록한 혀), 두께는 가로로 조금씩 다르다
    const prof = (q) => Math.sqrt(Math.max(0, 1 - q * q));
    const thickAt = (q) => T0 * (0.3 + 0.7 * prof(q)) * (1 + (vnoise(q * 3.1 + 7, 2.2, seed + 311) - 0.5) * 0.3);
    const v0At = (q) => 1.3 + (V0C - 1.3) * prof(q);
    const toCenter = (x, z) => { const dx = fl.cx - x, dz = fl.cz - z, d = Math.hypot(dx, dz) || 1; return [dx / d, dz / d]; };
    const SUP = 3.6; // 턱 위로 이어 그리는 길이
    const core = fallCore({ at: (lat, s) => arc(lat / RW, RW - 0.15 - s), topY: fl.top + 0.1, H, W, T0, v0c: V0C, sup: SUP, narrow: 0.55, aer0: 0, sd: 0 });
    grp.add(core.mesh);
    const coreMat = core.mat;
    // 폭포 끝(물기둥 겉면 기준)에서 소까지 — 물보라·소 중심
    const [ix, iz] = arc(0, RW - 0.15 - OUT_END);
    const imp = new T.Vector3(ix, poolY, iz);
    // 가로 위치 표본: 가운데가 두꺼우니 가운데에 몰리게
    const pickQ = () => Math.max(-1.05, Math.min(1.05, (Math.random() + Math.random() - 1) * 1.15));

    // --- 소: 깊은 물빛, 떨어지는 자리의 하얀 소용돌이, 밖으로 흘러가는 거품 조각. 수면은 낙수 지점에서 실제로 울렁인다 ---
    const pool = new T.Mesh(new T.PlaneGeometry((R0 + 1.3) * 2, (R0 + 1.3) * 2, 44, 44).rotateX(-Math.PI / 2), new T.ShaderMaterial({
      transparent: true, depthWrite: false, side: T.DoubleSide,
      uniforms: {
        uTime: waterMat.uniforms.uTime, uLight: fallLight, uSky: waterMat.uniforms.uMid, uTex: { value: fallTextures().streak },
        uImp: { value: new T.Vector2(ix, iz) }, uF: { value: new T.Vector2(fx, fz) }, uHalfW: { value: W / 2 + 0.6 }, uC: { value: new T.Vector2(fl.cx, fl.cz) }, uR: { value: R0 + 1.3 },
        ...DU,
      },
      vertexShader: `uniform float uTime, uHalfW; uniform vec2 uImp, uF; varying vec3 vW;
        void main(){
          vec4 w = modelMatrix * vec4(position,1.0);
          vec2 p = w.xz - uImp, sd = vec2(-uF.y, uF.x);
          float a = dot(p, uF), l = dot(p, sd);
          float dl = length(vec2(max(0.0, abs(l) - uHalfW), a));
          // 낙수 지점에서 밀려 나가는 너울 (무게가 때리는 느낌)
          float amp = smoothstep(6.5, 0.8, dl);
          w.y += (sin(dl * 2.6 - uTime * 3.2) * 0.05 + sin(dl * 5.1 - uTime * 4.7 + l * 1.3) * 0.025) * amp;
          vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uTime, uHalfW, uR; uniform vec2 uImp, uF, uC; uniform vec3 uLight, uSky; uniform sampler2D uTex; varying vec3 vW;
        ${NOISE_GLSL}
        ${DEPTH_GLSL}
        void main(){
          vec2 p = vW.xz - uImp, sd = vec2(-uF.y, uF.x);
          float a = dot(p, uF), l = dot(p, sd);
          float dl = length(vec2(max(0.0, abs(l) - uHalfW), a));
          float dc = length(vW.xz - uC);
          float n = fbm(vec2(l * 0.9, dl * 1.5 - uTime * 1.5));
          vec3 deep = mix(vec3(0.02, 0.12, 0.14), vec3(0.09, 0.33, 0.34), smoothstep(uR * 0.3, uR * 1.0, dc));
          vec3 V = normalize(cameraPosition - vW);
          float fr = pow(1.0 - max(V.y, 0.0), 4.0);
          vec4 tx = texture2D(uTex, vec2(l * 0.16 + 0.3, dl * 0.12 - uTime * 0.09));
          vec3 col = mix(deep, uSky * 0.6, 0.04 + fr * 0.35 + (tx.g - 0.4) * 0.08);
          float boil = smoothstep(2.6, 0.0, dl) * (0.5 + n * 0.6);
          float ring = (sin(dl * 2.6 - uTime * 3.2 + n * 1.5) * 0.5 + 0.5) * smoothstep(6.5, 1.0, dl) * 0.14;
          float patches = smoothstep(0.62, 0.9, tx.b) * smoothstep(7.0, 1.5, dl) * 0.4;
          float th = waterThick();
          float edgeFoam = smoothstep(0.55, 0.0, th) * (0.35 + tx.r * 0.65);
          float foam = clamp(boil + ring + patches + edgeFoam * 0.8, 0.0, 1.0);
          col = mix(col, vec3(0.95, 0.97, 0.98), foam);
          col = mix(vec3(0.16, 0.36, 0.33), col, smoothstep(0.0, 1.0, th) * 0.65 + 0.35);
          float alpha = smoothstep(uR, uR - 0.8, dc) * mix(0.93, 1.0, foam) * smoothstep(0.0, 0.14, th);
          gl_FragColor = vec4(col * uLight, alpha);
          #include <encodings_fragment>
        }`,
    }));
    pool.position.set(fl.cx, poolY, fl.cz);
    pool.renderOrder = 4;
    grp.add(pool);

    // --- 밑동 플룸: 떨어진 물이 크고 무겁게 솟았다 가라앉는 흰 덩어리 (위가 밝고 아래가 어두운 덩어리라 부피가 보인다) ---
    const ftex = fallTextures().foam;
    const foam = foamSystem(coarse ? 140 : 240, 0.75, ftex);
    foam.mat.uniforms.uStretch.value.set(1.25, 1.0);
    foam.mat.uniforms.uGrad.value = 0.45;
    const spawnFoam = (sy, i) => {
      const q = pickQ(), v0 = v0At(Math.min(1, Math.abs(q)));
      const [x, z] = arc((q * HW * 1.1) / RW, RW - 0.15 - v0 * TMAX * (0.85 + Math.random() * 0.3));
      const [cx2, cz2] = toCenter(x, z), lx = (Math.random() - 0.5) * 1.4, fw = 0.3 + Math.random() * 1.3;
      sy.P[i * 3] = x; sy.P[i * 3 + 1] = poolY + 0.05 + Math.random() * 0.5; sy.P[i * 3 + 2] = z;
      sy.vel[i * 3] = cx2 * fw + sx * lx; sy.vel[i * 3 + 1] = 0.35 + Math.random() * 0.75; sy.vel[i * 3 + 2] = cz2 * fw + sz * lx;
      sy.life[i] = 0.9 + Math.random() * 0.8; sy.age[i] = 0;
      sy.s0[i] = 0.4 + Math.random() * 0.55;
      sy.R[i] = (Math.random() - 0.5) * 0.5; sy.rs[i] = (Math.random() - 0.5) * 0.4;
    };
    for (let i = 0; i < foam.n; i++) { spawnFoam(foam, i); foam.age[i] = Math.random() * foam.life[i]; }
    foam.mesh.renderOrder = 9;
    grp.add(foam.mesh);
    // 물안개: 크고 옅게, 낮게 깔려 옆으로 번진다 (위로 솟으면 폭포가 거꾸로 흐르는 듯 보였다)
    const mist = foamSystem(36, 0.13, ftex);
    mist.mat.uniforms.uFadeNear.value.set(3.0, 7.0); // 폭포 밑에서 헤엄칠 때 화면을 덮지 않게
    const spawnMist = (sy, i) => {
      const q = pickQ() * 0.9, v0 = v0At(Math.min(1, Math.abs(q)));
      const [x, z] = arc((q * HW) / RW, RW - 0.15 - v0 * TMAX);
      const [cx2, cz2] = toCenter(x, z), fw = 0.3 + Math.random() * 0.8;
      sy.P[i * 3] = x; sy.P[i * 3 + 1] = poolY + 0.4 + Math.random() * 0.8; sy.P[i * 3 + 2] = z;
      sy.vel[i * 3] = cx2 * fw + sx * (Math.random() - 0.5) * 0.6; sy.vel[i * 3 + 1] = 0.04 + Math.random() * 0.1; sy.vel[i * 3 + 2] = cz2 * fw + sz * (Math.random() - 0.5) * 0.6;
      sy.life[i] = 3 + Math.random() * 2; sy.age[i] = 0;
      sy.s0[i] = 1.8 + Math.random() * 1.4; sy.R[i] = Math.random() * 6.28; sy.rs[i] = (Math.random() - 0.5) * 0.2;
    };
    for (let i = 0; i < mist.n; i++) { spawnMist(mist, i); mist.age[i] = Math.random() * mist.life[i]; }
    mist.mesh.renderOrder = 10;
    grp.add(mist.mesh);

    // --- 떨어지는 물덩이 + 소에 부딪혀 튀는 물방울 ---
    const chunks = chunkSystem(coarse ? 900 : 1800, coarse ? 80 : 160);
    const { pp, pv, pa, psz, life, age, floor } = chunks;
    grp.add(chunks.mesh);
    // 물덩이 하나를 턱 근처에서 다시 시작 (가장자리 45%는 옆 가닥, 나머지는 기둥 앞면 위)
    const spawn = (k) => {
      const edge = Math.random() < 0.45;
      const q = edge ? (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 0.3) : pickQ() * 0.85;
      const qq = Math.min(1, Math.abs(q)), v0 = v0At(qq) * (0.9 + Math.random() * 0.25), th0 = thickAt(qq);
      const tau0 = Math.random() * 0.3 * TMAX, drop = 0.5 * G * tau0 * tau0, out = v0 * tau0;
      const [x, z] = arc((q * HW) / RW, RW - 0.15 - out - (0.06 + Math.random() * 0.28 + th0 * 0.5));
      const [cx2, cz2] = toCenter(x, z), lx = (Math.random() - 0.5) * 0.5;
      pp[k * 3] = x; pp[k * 3 + 1] = fl.top + 0.12 - drop + Math.random() * 0.1; pp[k * 3 + 2] = z;
      pv[k * 3] = cx2 * v0 + sx * lx; pv[k * 3 + 1] = -G * tau0; pv[k * 3 + 2] = cz2 * v0 + sz * lx;
      pa[k] = edge ? 0.6 + Math.random() * 0.3 : 0.35 + Math.random() * 0.4;
      psz[k] = 0.7 + Math.random() * 0.8;
      life[k] = 99; age[k] = 0; floor[k] = poolY;
    };
    const spawnSplash = (k) => {
      const q = pickQ(), v0 = v0At(Math.min(1, Math.abs(q)));
      const [x, z] = arc((q * HW * 1.1) / RW, RW - 0.15 - v0 * TMAX * (0.9 + Math.random() * 0.25));
      const [cx2, cz2] = toCenter(x, z), lx = (Math.random() - 0.5) * 1.2, vin = 0.3 + Math.random() * 1.4;
      pp[k * 3] = x; pp[k * 3 + 1] = poolY + 0.08; pp[k * 3 + 2] = z;
      pv[k * 3] = cx2 * vin + sx * lx; pv[k * 3 + 1] = 0.5 + Math.random() * Math.random() * 2.2; pv[k * 3 + 2] = cz2 * vin + sz * lx;
      pa[k] = 0.5 + Math.random() * 0.3;
      psz[k] = 0.5 + Math.random() * 0.6;
      life[k] = 0.35 + Math.random() * 0.4; age[k] = 0; floor[k] = poolY;
    };
    for (let k = 0; k < chunks.NP; k++) { spawn(k); const tau = Math.random() * TMAX; pp[k * 3 + 1] -= 0.5 * G * tau * tau; pv[k * 3 + 1] -= G * tau; }
    for (let k = chunks.NP; k < chunks.NP + chunks.NS; k++) { spawnSplash(k); age[k] = Math.random() * life[k]; }


    // --- 무지개: 햇빛이 있을 때만 물안개 속에 은은하게 ---
    const rb = new T.Mesh(new T.RingGeometry(3.4, 4.0, 96, 1, 0, Math.PI), new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      uniforms: { uOp: { value: 0 }, uLinPow: LINPOW },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uOp, uLinPow; varying vec2 vP;
        void main(){
          float t = (length(vP) - 3.4) / 0.6, h = (1.0 - t) * 0.78;
          vec3 c = clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
          float ang = atan(vP.y, vP.x);
          gl_FragColor = vec4(pow(c, vec3(uLinPow)), sin(3.14159 * t) * smoothstep(0.0, 0.7, sin(ang)) * uOp);
        }`,
    }));
    rb.position.set(ix + fx * 3 + sx * 1.2, poolY - 1.6, iz + fz * 3 + sz * 1.2);
    rb.rotation.y = Math.atan2(fx, fz);
    rb.renderOrder = 10;
    grp.add(rb);

    PALETTE.hero.keyPos = [ix + fx * 90 + sx * 45, 75, iz + fz * 90 + sz * 45];
    PALETTE.hero.sunDir = [fx * 0.6 - sx * 0.5, 0.3, fz * 0.6 - sz * 0.5];
    fallFx = { imp, H, W, poolY, top: fl.top, fx, fz, sx, sz, RW, TMAX, OUT_END, chunks, spawn, spawnSplash, coreMat, foam, spawnFoam, mist, spawnMist, rb, arc };
    return grp;
  }

  // ---------- 분화구 호수(백록담) + 계단식 계곡 ----------
  let streamGrp = null, streamFx = null;
  // 계곡 단면(한쪽): 바닥 → 물가 → 가파른 젖은 바위벽 → 지형 위로 살짝 솟은 테두리 → 땅속으로 숨는 끝
  const ST_F = [0, 0.05, 0.12, 0.21, 0.32, 0.44, 0.57, 0.7, 0.82, 0.92, 1];
  function streamSection(sm, side, WO) {
    // 물 폭을 단면마다 조금씩 다르게: 물가 선이 자로 그은 듯 곧으면 수조처럼 보인다 (호수 출구·끝 꼬리는 그대로)
    // 턱(작은 폭포 시작)과 낙수 지점은 원래 폭 그대로 — 물줄기 폭과 맞아야 벽을 뚫고 나오지 않는다
    const wq = sm.tail || sm.k === 0 ? 1 : 1 + ((vnoise(sm.s * 0.85 + side * 3.3, 5.1, seed + 93) - 0.5) * 0.55 + (vnoise(sm.s * 2.3 + side * 1.9, 2.7, seed + 94) - 0.5) * 0.2) * ss(0.02, 0.22, sm.u) * (1 - ss(0.72, 0.93, sm.u));
    // 턱에 가까워지면 물가가 홈(노치) 양쪽으로 좁혀진다 → 홈 밖은 젖은 바위가 드러난다
    let wwS = sm.ww * wq;
    const pl = field.stream && field.stream.pools[sm.k];
    // 웅덩이는 가운데가 불룩한 둥근 모양 / 급류는 바위 사이로 좁아졌다 넓어졌다 (처음부터 끝까지 같은 폭이면 돌 수로처럼 보인다)
    if (!sm.tail && sm.k > 0) wwS *= pl && pl.cascade ? 0.88 + 0.24 * vnoise(sm.s * 0.5, 7.7, seed + 99) : 0.84 + 0.34 * Math.sin(Math.PI * Math.min(1, sm.u * 1.12));
    if (pl && pl.nh !== undefined && !sm.tail) wwS += ((side < 0 ? pl.nh - pl.nc : pl.nh + pl.nc) - wwS) * ss(0.66, 0.95, sm.u);
    const L = sm.L, ww = wwS, wf = ww - 0.22, Lf = L - sm.depth;
    // 벽이 높은 곳은 협곡을 넓혀 비탈로 눕힌다. 양옆 기울기도 다르게(한쪽은 벼랑, 한쪽은 풀 비탈)
    // → 같은 높이·같은 기울기 벽이 끝까지 이어지는 '돌 수로'처럼 안 보이게 (호수 출구·폭포 위 꼬리는 그대로)
    if (!sm.tail && sm.k > 0) {
      const d0 = (side < 0 ? sm.hL : sm.hR) - L, nW = vnoise(sm.s * 0.3 + side * 4.7, 1.3, seed + 96);
      WO = Math.min(5.0, Math.max(WO, ww + 0.4 + d0 * (0.75 + nW * 0.6)));
    }
    // 굽이 안쪽: 곡률 반경보다 넓으면 이웃 단면과 겹쳐 커다란 삼각형이 생긴다 (지형 파낸 반경 1.6보다는 넓게)
    if (side * (sm.kap || 0) > 0.05) WO = Math.max(1.95, Math.min(WO, 0.85 / Math.abs(sm.kap)));
    const Ytop = Math.max(WO > field.stream.WO + 0.05 ? heightOrig(sm.x + sm.nx * side * (WO - 0.35), sm.z + sm.nz * side * (WO - 0.35)) : side < 0 ? sm.hL : sm.hR, L + 0.5);
    const pw = sm.k > 0 && !sm.tail ? 1.0 + 1.0 * vnoise(sm.s * 0.22 + side * 2.9, 3.3, seed + 98) : 1.75; // 작을수록 고른 비탈, 클수록 아래는 벼랑·위는 평평
    const D = Ytop - L, span = WO - 0.25 - ww;
    const o = [0, wf * 0.45, wf, (wf + ww) / 2], y = [Lf, Lf, Lf + 0.05, L - sm.depth * 0.45];
    // 물가부터 테두리까지: 아래는 가파르고 위로 갈수록 눕는 바위벽 + 층층이 턱과 틈
    ST_F.forEach((f, i) => {
      const n1 = vnoise(sm.s * 1.3 + side * 7.1, i * 0.8, seed + 91), n2 = vnoise(sm.s * 3.1 + side * 2.3, i * 1.7, seed + 92);
      const inner = i > 0 && i < ST_F.length - 1 ? 1 : 0;
      o.push(ww + span * f * (1 + inner * (n1 - 0.5) * 0.28));
      let h = L + 0.06 + (D - 0.06) * (1 - Math.pow(1 - f, pw));
      h += inner * ((n2 - 0.5) * 0.22 + (n1 - 0.5) * 0.12 * Math.sqrt(Math.max(0, D)));
      if (i > 0) h = Math.max(h, L + 0.14 + f * 0.9); // 물가 위 벽이 수면 아래로 꺼지면 물판이 벽 밖으로 튀어나와 보인다
      if (i === ST_F.length - 1) h = Ytop + 0.15;
      // 원래 땅보다 낮으면 땅 위에 덮는다 (바깥으로 큰 내리막 면이 생기지 않게)
      const oo = o[o.length - 1];
      // (carveCanyon이 비탈 밑 땅을 파 두므로 웅덩이 구간은 바깥 가장자리 쪽만. 호수 출구·꼬리는 파지 않으니 전부)
      if (i > 0 && (sm.k === 0 || sm.tail || f >= 0.82)) h = Math.max(h, heightOrig(sm.x + sm.nx * side * oo, sm.z + sm.nz * side * oo) + 0.07);
      y.push(h);
    });
    o.push(WO);
    y.push(heightOrig(sm.x + sm.nx * side * WO, sm.z + sm.nz * side * WO) - 0.06);
    for (let j = 0; j < 3; j++) y[j] += (vnoise(sm.s * 3.1 + side * 1.7, j * 2.1, seed + 95) - 0.5) * 0.08;
    if (sm.tail) for (let j = 0; j < y.length; j++) y[j] = Math.min(y[j], field.fall.top - 0.12 - sm.tail * 0.3);
    return { o, y, shore: ww };
  }
  function secHeight(sec, ao) {
    for (let j = 1; j < sec.o.length; j++) if (ao <= sec.o[j]) { const t = (ao - sec.o[j - 1]) / Math.max(1e-4, sec.o[j] - sec.o[j - 1]); return sec.y[j - 1] + (sec.y[j] - sec.y[j - 1]) * t; }
    return sec.y[sec.y.length - 1];
  }
  // 넓어진 협곡 비탈 밑 지형을 비탈보다 조금 낮게 판다.
  // 안 파면 원래 땅이 비탈을 뚫고 나오므로 벽을 땅 높이까지 올려야 했고 → 물가에서 바로 솟는 수직 벽(돌 수로) 모양이 됐다
  function carveCanyon() {
    const st = field.stream, cr = field.crater, fall = field.fall;
    if (!st || !cr || !fall) return;
    const prof = st.samples.filter((sm) => !sm.tail && sm.k > 0).map((sm) => ({ sm, L: streamSection(sm, -1, st.WO), R: streamSection(sm, 1, st.WO) }));
    if (!prof.length) return;
    let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
    for (const { sm } of prof) { mnx = Math.min(mnx, sm.x); mxx = Math.max(mxx, sm.x); mnz = Math.min(mnz, sm.z); mxz = Math.max(mxz, sm.z); }
    const F = field.f, pad = 5.6;
    const i0 = Math.max(0, Math.floor((mnx - pad - ORIGIN) / STEP)), i1 = Math.min(FG - 1, Math.ceil((mxx + pad - ORIGIN) / STEP));
    const j0 = Math.max(0, Math.floor((mnz - pad - ORIGIN) / STEP)), j1 = Math.min(FG - 1, Math.ceil((mxz + pad - ORIGIN) / STEP));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = ORIGIN + i * STEP, z = ORIGIN + j * STEP;
        if (Math.hypot(x - cr.x, z - cr.z) < cr.R + 0.6) continue; // 호수·테두리는 그대로
        if ((x - fall.x) * fall.fx + (z - fall.z) * fall.fz > -3.45) continue; // 폭포 위 바위턱은 그대로
        let bd = 1e9, b = null;
        for (const q of prof) { const dd = (x - q.sm.x) ** 2 + (z - q.sm.z) ** 2; if (dd < bd) { bd = dd; b = q; } }
        const sm = b.sm, o = (x - sm.x) * sm.nx + (z - sm.z) * sm.nz;
        if (Math.abs((x - sm.x) * sm.tx + (z - sm.z) * sm.tz) > 0.4) continue; // 처음·끝 단면 너머
        const sec = o < 0 ? b.L : b.R, ao = Math.abs(o);
        if (ao > sec.o[sec.o.length - 1] - 0.45) continue; // 바깥 가장자리는 원래 땅이 협곡 메시 끝을 덮게 남긴다
        const k = j * FG + i, to = secHeight(sec, ao) - 0.15;
        if (to < F[k]) F[k] = to;
      }
  }
  // 계곡 안에서의 바닥 높이·수면 높이 (걷기용)
  function streamQuery(x, z) {
    const st = field && field.stream;
    if (!st || !st.secs) return null;
    const secs = st.secs;
    let bd = 1e9, bi = -1;
    for (let i = 0; i < secs.length; i++) { const sm = secs[i], dd = (x - sm.x) ** 2 + (z - sm.z) ** 2; if (dd < bd) { bd = dd; bi = i; } }
    if (bi < 0 || bd > ((st.WOmax || st.WO) + 0.4) ** 2) return null;
    const best = secs[bi], along = (x - best.x) * best.tx + (z - best.z) * best.tz;
    // 처음·마지막 단면 너머로는 늘이지 않는다 (마지막 꼬리 단면을 늘이면 폭포 턱 앞 허공에 바닥이 생긴다)
    if ((bi === secs.length - 1 && along > 0.3) || (bi === 0 && along < -0.3)) return null;
    const floorAt = (sm) => {
      const o = (x - sm.x) * sm.nx + (z - sm.z) * sm.nz, side = o < 0 ? sm.secL : sm.secR, ao = Math.abs(o);
      if (ao > side.o[side.o.length - 1]) return null;
      let y = side.y[side.y.length - 1];
      for (let j = 1; j < side.o.length; j++) if (ao <= side.o[j]) { const t = (ao - side.o[j - 1]) / Math.max(1e-4, side.o[j] - side.o[j - 1]); y = side.y[j - 1] + (side.y[j] - side.y[j - 1]) * t; break; }
      return y;
    };
    let y = floorAt(best);
    if (y === null) return null;
    // 같은 웅덩이 안의 이웃 단면과 보간: 가장 가까운 단면 하나만 쓰면 바닥이 몇 cm씩 계단처럼 끊겨 걸린다 (턱 너머와는 섞지 않음)
    const nb = secs[bi + (along >= 0 ? 1 : -1)];
    if (nb && nb.k === best.k && !nb.tail === !best.tail) {
      const yb = floorAt(nb), seg = Math.hypot(nb.x - best.x, nb.z - best.z) || 1;
      if (yb !== null) y += (yb - y) * Math.min(1, Math.abs(along) / seg);
    }
    return { floor: y, water: !best.tail && y < best.L - 0.01 ? best.L : null };
  }

  function buildStream() {
    const rl = RL(), cr = field.crater, st = field.stream;
    if (!cr) { streamFx = null; return null; }
    const grp = new T.Group();
    // 호수: 깊은 청록 + 하늘 반사 + 바람 물결 + 출구 쪽으로 끌려가는 잔물결
    const out = st ? st.samples.find((sm) => Math.hypot(sm.x - cr.x, sm.z - cr.z) > cr.R) : null;
    const lakeGeo = new T.CircleGeometry(cr.R + 0.25, 96).rotateX(-Math.PI / 2);
    lakeGeo.setAttribute('aKeep', new T.Float32BufferAttribute(new Float32Array(lakeGeo.attributes.position.count), 1));
    const lakeMat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, side: T.DoubleSide,
      uniforms: { uTime: waterMat.uniforms.uTime, uNormals: waterMat.uniforms.uNormals, uSky: waterMat.uniforms.uMid, uLight: fallLight,
        uC: { value: new T.Vector2(cr.x, cr.z) }, uR: { value: cr.R }, uOut: { value: new T.Vector2(out ? out.x : cr.x, out ? out.z : cr.z) },
        uCutA: { value: new T.Vector2(1e5, 1e5) }, uCutT: { value: new T.Vector2(1, 0) }, uCutW: { value: 0 }, ...DU },
      vertexShader: 'attribute float aKeep; varying float vKeep; varying vec3 vW; void main(){ vKeep = aKeep; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uTime, uR, uCutW; uniform sampler2D uNormals; uniform vec3 uSky, uLight; uniform vec2 uC, uOut, uCutA, uCutT; varying vec3 vW; varying float vKeep;
        ${DEPTH_GLSL}
        void main(){
          // 원판은 출구 물길(같은 재질로 따로 그림)이 시작하는 선 너머로는 그리지 않는다: 두 물판이 겹쳐 진해지거나 원판 가장자리가 선으로 보이지 않게
          vec2 cq = vW.xz - uCutA;
          if (vKeep < 0.5 && dot(cq, uCutT) > 0.0 && abs(dot(cq, vec2(-uCutT.y, uCutT.x))) < uCutW) discard;
          vec3 n1 = texture2D(uNormals, vW.xz * 0.09 + vec2(uTime * 0.012, uTime * 0.009)).rgb * 2.0 - 1.0;
          vec3 n2 = texture2D(uNormals, vW.xz * 0.21 - vec2(uTime * 0.017, -uTime * 0.011)).rgb * 2.0 - 1.0;
          vec3 V = normalize(cameraPosition - vW);
          float fr = pow(1.0 - abs(V.y), 3.0);
          float th = waterThick();
          vec3 col = mix(vec3(0.24, 0.46, 0.4), vec3(0.03, 0.17, 0.2), smoothstep(0.1, 2.5, th));
          col = mix(col, uSky * 0.9, 0.08 + fr * 0.5 + (n1.x + n2.y) * 0.05);
          float od = length(vW.xz - uOut);
          col = mix(col, vec3(0.92, 0.96, 0.97), smoothstep(1.8, 0.0, od) * smoothstep(0.1, 0.5, n2.x + 0.3) * 0.35);
          col = mix(col, vec3(0.9, 0.95, 0.95), smoothstep(0.3, 0.0, th) * (0.4 + n1.x * 0.4) * 0.6);
          gl_FragColor = vec4(col * uLight, 0.93 * smoothstep(0.0, 0.3, th) * max(vKeep, smoothstep(uR + 0.25, uR - 0.1, length(vW.xz - uC))));
          #include <encodings_fragment>
        }`,
    });
    const lake = new T.Mesh(lakeGeo, lakeMat);
    lake.position.set(cr.x, cr.level, cr.z);
    lake.renderOrder = 3;
    grp.add(lake);
    if (!st || !rl) { streamFx = null; return grp; }

    const WO = st.WO, inLake = (sm) => Math.hypot(sm.x - cr.x, sm.z - cr.z) < cr.R - 0.5;
    const secs = st.samples.filter((sm) => !inLake(sm));
    secs.forEach((sm) => { sm.secL = streamSection(sm, -1, WO); sm.secR = streamSection(sm, 1, WO); });
    st.secs = secs;
    st.WOmax = secs.reduce((m, sm) => Math.max(m, sm.secL.o[sm.secL.o.length - 1], sm.secR.o[sm.secR.o.length - 1]), WO);
    const s0 = secs.length ? secs[0].s : 0;

    // --- 바위 협곡 메시 ---
    {
      const pos = [], wet = [], idx = [], NP = secs.length ? secs[0].secL.o.length : 16, ROW = NP * 2 - 1;
      secs.forEach((sm) => {
        const taper = ss(s0, s0 + 1.0, sm.s); // 호수 쪽 시작은 벽이 물에서 서서히 솟는다
        const push = (side, j) => {
          const sec = side < 0 ? sm.secL : sm.secR;
          let y = sec.y[j];
          if (y > sm.L) y = Math.max(sm.L + Math.min(0.14, y - sm.L), sm.L + (y - sm.L) * (0.25 + 0.75 * taper));
          pos.push(sm.x + sm.nx * side * sec.o[j], y, sm.z + sm.nz * side * sec.o[j]);
          const nearFall = sm.u > 0.86 || (sm.k > 0 && sm.u < 0.14) ? ss(sm.L + 1.8, sm.L + 0.3, y) : 0;
          wet.push(Math.min(1, Math.max(ss(sm.L + 0.95, sm.L + 0.2, y), nearFall)));
        };
        for (let j = NP - 1; j >= 1; j--) push(-1, j);
        for (let j = 0; j < NP; j++) push(1, j);
      });
      // 면 방향: 위·안쪽을 향하게 (반대로 감으면 위에서 바닥이 안 보인다)
      for (let r = 0; r < secs.length - 1; r++)
        for (let j = 0; j < ROW - 1; j++) { const a0 = r * ROW + j, b0 = a0 + ROW; idx.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0); }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setAttribute('aWet', new T.Float32BufferAttribute(wet, 1));
      g.setIndex(idx);
      g.computeVertexNormals();
      const nrm = g.attributes.normal, cols = new Float32Array(pos.length), c = new T.Color(), MOSS = new T.Color('#55722f'), STONE = new T.Color('#a39a8f');
      for (let k = 0; k < nrm.count; k++) {
        const up = nrm.getY(k), wk = wet[k];
        c.copy(STONE).lerp(MOSS, ss(0.45, 0.8, up) * (1 - wk) * 0.85 + vnoise(pos[k * 3] * 0.9, pos[k * 3 + 2] * 0.9, seed + 97) * 0.12);
        c.multiplyScalar(1 - wk * 0.52);
        cols[k * 3] = c.r; cols[k * 3 + 1] = c.g; cols[k * 3 + 2] = c.b;
      }
      g.setAttribute('color', new T.BufferAttribute(cols, 3));
      const m = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.tRock = { value: rl.tex.rock.diff };
        sh.uniforms.tRockN = { value: rl.tex.rock.nor };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aWet; varying float vWet; varying vec3 vWP, vWN;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWet = aWet; vWP = (modelMatrix * vec4(position, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * normal);');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tRock, tRockN; varying float vWet; varying vec3 vWP, vWN;\nvec3 triR(float k){ vec3 w = pow(abs(vWN), vec3(4.0)); w /= (w.x + w.y + w.z); return texture2D(tRock, vWP.zy * k).rgb * w.x + texture2D(tRock, vWP.xz * k).rgb * w.y + texture2D(tRock, vWP.xy * k).rgb * w.z; }')
          .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= mix(triR(0.45), triR(0.13), 0.45) * 1.18;')
          // 삼면 노멀맵(화이트아웃 혼합): 매끈한 회반죽처럼 보이던 벽에 바위 결과 요철을 준다
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            { vec3 wn = normalize(vWN), bw = pow(abs(wn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
              vec3 tx = texture2D(tRockN, vWP.zy * 0.45).xyz * 2.0 - 1.0, ty = texture2D(tRockN, vWP.xz * 0.45).xyz * 2.0 - 1.0, tz = texture2D(tRockN, vWP.xy * 0.45).xyz * 2.0 - 1.0;
              vec3 tx2 = texture2D(tRockN, vWP.zy * 0.13).xyz * 2.0 - 1.0, ty2 = texture2D(tRockN, vWP.xz * 0.13).xyz * 2.0 - 1.0, tz2 = texture2D(tRockN, vWP.xy * 0.13).xyz * 2.0 - 1.0;
              tx = mix(tx, tx2, 0.45) * vec3(1.6, 1.6, 1.0); ty = mix(ty, ty2, 0.45) * vec3(1.6, 1.6, 1.0); tz = mix(tz, tz2, 0.45) * vec3(1.6, 1.6, 1.0);
              tx = vec3(tx.xy + wn.zy, abs(tx.z) * wn.x); ty = vec3(ty.xy + wn.xz, abs(ty.z) * wn.y); tz = vec3(tz.xy + wn.xy, abs(tz.z) * wn.z);
              vec3 nw = normalize(tx.zyx * bw.x + ty.xzy * bw.y + tz.xyz * bw.z);
              normal = normalize(mat3(viewMatrix) * nw); }`)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.52, vWet);');
      };
      const mesh = new T.Mesh(g, m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.layers.enable(DEPTH_LAYER);
      grp.add(mesh);
    }

    // --- 웅덩이 수면: 낙수 지점은 하얗게 끓고, 턱 앞에선 매끈하게 빨려 나간다 ---
    const poolMat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, side: T.DoubleSide,
      uniforms: { uTime: waterMat.uniforms.uTime, uNormals: waterMat.uniforms.uNormals, uStreak: { value: fallTextures().streak }, uSky: waterMat.uniforms.uMid, uLight: fallLight, ...DU },
      vertexShader: 'attribute float aU, aBoil, aFade, aCur, aSlope; varying vec2 vUv; varying float vU, vBoil, vFade, vCur, vSlope; varying vec3 vW; void main(){ vUv = uv; vU = aU; vBoil = aBoil; vFade = aFade; vCur = aCur; vSlope = aSlope; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uTime; uniform sampler2D uNormals, uStreak; uniform vec3 uSky, uLight; varying vec2 vUv; varying float vU, vBoil, vFade, vCur, vSlope; varying vec3 vW;
        ${DEPTH_GLSL}
        void main(){
          // 여울(기울어 흐르는 곳)은 빠르고 하얗게 부서진다
          float rapid = smoothstep(0.3, 0.55, vSlope); // 30°를 넘어야 하얀 급류 (완만한 여울은 바닥이 비치는 맑은 물)
          float speed = min(3.0, mix(0.25, 1.7, vU * vU) + rapid * 1.8);
          // 잔물결(노멀맵)은 결이 고와서 빨리 밀면 25fps에서 거꾸로 기는 듯 보인다 → 느리게. 속도감은 굵은 거품 줄이 맡는다
          float nsp = min(speed, 0.5);
          vec3 n1 = texture2D(uNormals, vec2(vUv.x * 0.9, vUv.y * 0.55 - uTime * nsp * 0.6)).rgb * 2.0 - 1.0;
          vec3 n2 = texture2D(uNormals, vec2(vUv.x * 2.1 + 0.4, vUv.y * 1.2 - uTime * nsp)).rgb * 2.0 - 1.0;
          vec4 st = texture2D(uStreak, vec2(vUv.x * 1.3, vUv.y * 0.3 - uTime * speed * 0.37));
          vec4 st2 = texture2D(uStreak, vec2(vUv.x * 2.4 + 0.3, vUv.y * 0.3 - uTime * speed * 0.27));
          float th = waterThick();
          vec3 V = normalize(cameraPosition - vW);
          float fr = pow(1.0 - abs(V.y), 3.0);
          vec3 col = mix(vec3(0.27, 0.45, 0.37), vec3(0.04, 0.16, 0.15), smoothstep(0.05, 0.8, th));
          // 좁은 협곡: 비스듬히 보면 하늘이 아니라 맞은편 바위벽이 비친다 (하늘빛만 비치면 수영장처럼 보인다)
          vec3 Rf = reflect(-V, normalize(vec3((n1.x + n2.x) * 0.22, 1.0, (n1.y + n2.y) * 0.22)));
          vec3 refl = mix(vec3(0.15, 0.15, 0.1), uSky * 0.8, smoothstep(0.3, 0.8, Rf.y));
          col = mix(col, refl, 0.07 + fr * 0.5 + (n1.x + n2.y) * 0.05);
          float boil = smoothstep(0.34, 0.0, vU) * (0.45 + st.r * 0.75) * vBoil;
          float trails = smoothstep(0.55, 0.85, st2.g) * (1.0 - smoothstep(0.15, 0.8, vU)) * 0.55 * vBoil;
          // 물살: 위 폭포가 떨어진 자리에서 다음 턱의 홈까지 흰 거품 줄이 흘러간다 (웅덩이가 고인 물판처럼 따로 놀지 않고 이어져 보이게)
          float cur = smoothstep(0.55, 0.06, abs(vCur)) * vBoil;
          trails += cur * (smoothstep(0.5, 0.82, st2.g) * 0.75 + smoothstep(0.55, 0.92, st.r) * 0.4) * (0.55 + 0.45 * smoothstep(0.5, 0.95, vU));
          float shore = smoothstep(0.22, 0.0, th) * (0.35 + st.r * 0.6) * (1.0 - rapid * 0.9); // 여울은 얕아도 물가 거품 얼룩을 찍지 않는다
          // 여울 물살: 흐름 방향으로 길게 늘인 줄무늬 두 겹 (짧게 쓰면 점박이 무늬가 찍혀 보였다) + 사이사이 비치는 물빛
          vec4 wa = texture2D(uStreak, vec2(vUv.x * 1.1 + 0.13, vUv.y * 0.15 - uTime * speed * 0.2));
          vec4 wb = texture2D(uStreak, vec2(vUv.x * 2.3 + 0.61, vUv.y * 0.2 - uTime * speed * 0.25));
          float white = rapid * (0.1 + smoothstep(0.35, 0.82, wa.r * 0.62 + wb.g * 0.58) * 0.72) * (0.8 + 0.2 * n1.x);
          boil *= 1.0 - rapid * 0.6;
          trails *= 1.0 - rapid * 0.7;
          float foam = clamp(boil + trails + shore * 0.6 + white, 0.0, 1.0);
          col = mix(col, vec3(0.96, 0.98, 1.0), foam);
          col += refl * smoothstep(0.78, 1.0, vU) * (0.15 + 0.3 * st.b) * 0.5 * (1.0 - rapid);      // 턱 앞 매끈한 반사
          col = mix(col, vec3(0.97, 0.99, 1.0), smoothstep(0.955, 1.0, vU) * (0.5 + st.r * 0.5));  // 넘어가는 물마루
          col += uSky * pow(max(0.0, n1.x * 0.5 + n2.y * 0.5), 6.0) * 0.6;         // 잔물결 반짝임
          // 여울: 공기 섞인 밝은 옥빛 물 (얕아서 바닥이 훤히 비치면 회색 자갈밭처럼 보였다)
          col = mix(col, mix(vec3(0.42, 0.64, 0.62), vec3(0.96, 0.98, 1.0), white), rapid * 0.38);
          float alpha = max(max(mix(0.5, 0.93, smoothstep(0.0, 0.7, th)), foam * 0.95), rapid * 0.72) * smoothstep(0.0, mix(0.16, 0.05, rapid), th);
          alpha *= vFade; // 0번(호수 출구)은 호수 가장자리와 서로 스며든다
          gl_FragColor = vec4(col * uLight, alpha);
          #include <encodings_fragment>
        }`,
    });
    st.pools.forEach((p, k) => {
      const rows = secs.filter((sm) => sm.k === k && !sm.tail && (k > 0 || Math.hypot(sm.x - cr.x, sm.z - cr.z) >= cr.R - 0.45));
      if (rows.length < 2) return;
      const NJ = 8, pos = [], uv = [], au = [], ab = [], af = [], ac = [], asl = [], idx = [];
      const ncIn = k > 1 ? st.pools[k - 1].nc || 0 : 0, ncOut = p.nc || 0;
      rows.forEach((sm, r) => {
        // 물가는 단면마다·양옆마다 다르다(둥근 웅덩이) → 그 물가보다 넉넉히 넓혀 벽이 물판을 자르게 (물판 끝이 허공에 보이지 않게)
        const eL = sm.secL.shore + 0.4, eR = sm.secR.shore + 0.4;
        const curC = ncIn + (ncOut - ncIn) * ss(0.1, 0.95, sm.u);
        const pr = rows[Math.max(0, r - 1)], nx2 = rows[Math.min(rows.length - 1, r + 1)];
        const slope = nx2 === pr ? 0 : Math.max(0, (pr.L - nx2.L) / Math.max(0.05, Math.hypot(nx2.x - pr.x, nx2.z - pr.z)));
        for (let j = 0; j <= NJ; j++) {
          const t = j / NJ, o = t < 0.5 ? -eL * (1 - t * 2) : eR * (t * 2 - 1);
          pos.push(sm.x + sm.nx * o, sm.L, sm.z + sm.nz * o);
          uv.push(t, sm.s);
          au.push(sm.u);
          ab.push(k > 0 ? 1 : 0); // 여울·소의 시작 = 위 폭포가 떨어지는 자리: 하얗게 끓는다
          af.push(1);
          ac.push(o - curC);
          asl.push(slope);
          if (r < rows.length - 1 && j < NJ) { const a0 = r * (NJ + 1) + j, b0 = a0 + NJ + 1; idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
        }
      });
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      g.setAttribute('aU', new T.Float32BufferAttribute(au, 1));
      g.setAttribute('aBoil', new T.Float32BufferAttribute(ab, 1));
      g.setAttribute('aFade', new T.Float32BufferAttribute(af, 1));
      g.setAttribute('aCur', new T.Float32BufferAttribute(ac, 1));
      g.setAttribute('aSlope', new T.Float32BufferAttribute(asl, 1));
      g.setAttribute('aKeep', new T.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(1), 1));
      g.setIndex(idx);
      let mesh;
      if (k === 0) {
        // 호수 출구 물길: 호수와 같은 재질·같은 높이 → 호수에서 그대로 이어진다. 원판은 이 물길이 시작하는 선 너머를 비운다
        const f0 = rows[0];
        lakeMat.uniforms.uCutA.value.set(f0.x, f0.z);
        lakeMat.uniforms.uCutT.value.set(f0.tx, f0.tz);
        lakeMat.uniforms.uCutW.value = Math.max(f0.secL.shore, f0.secR.shore) + 0.4;
        mesh = new T.Mesh(g, lakeMat);
        mesh.renderOrder = 3;
      } else {
        mesh = new T.Mesh(g, poolMat);
        mesh.renderOrder = 4;
      }
      grp.add(mesh);
    });

    // --- 작은 폭포: 턱마다 물마루가 부풀었다가 가닥으로 찢어지며 떨어진다 (큰 폭포와 같은 셰이더) ---
    const G = 9.8, falls = [];
    const coarseS = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    st.pools.forEach((p, k) => {
      const lip = secs.filter((sm) => sm.k === k && !sm.tail).pop();
      if (!lip) return;
      const nxt = secs.find((sm) => sm.k === k + 1 && !sm.tail);
      const nextL = nxt ? nxt.L : st.shelfL, d = lip.L - nextL;
      if (d < 0.35) return;
      const hh = (q) => hash(k, q, seed), nc = p.nc || 0, nh = p.nh || lip.ww;
      // 큰 폭포와 같은 물기둥: 급류에서 오는 물이라 처음부터 조금 하얗고, 폭에 비례해 두껍다
      const W = nh * 2 * 1.02, v0c = 0.9 + hh(1) * 0.35, T0 = 0.2 + 0.14 * Math.min(1, d / 2.5);
      const core = fallCore({
        at: (lat, s) => [lip.x + lip.nx * (nc + lat) + lip.tx * s, lip.z + lip.nz * (nc + lat) + lip.tz * s],
        topY: lip.L + 0.01, H: d, W, T0, v0c, sup: 0.55, narrow: 1, aer0: 0.4, supA: 0.5, sd: k * 3 + 1, nc: 18, na: 4, nf: 30,
      });
      grp.add(core.mesh);
      const out = core.OUT_END;
      falls.push({ x: lip.x + lip.tx * out, z: lip.z + lip.tz * out, y: nextL, tx: lip.tx, tz: lip.tz, nx: lip.nx, nz: lip.nz, w: W, d, lip, lat: nc, nh, core });
    });
    // 급류가 가파르다가 덜 가팔라지는 자리 = 물이 바위에 부딪혀 하얗게 튀는 곳 → 물보라·거품, 양옆과 물속에 바위
    {
      const cas = secs.filter((sm) => !sm.tail && st.pools[sm.k] && st.pools[sm.k].cascade);
      const slopeAt = (i) => { const a = cas[Math.max(0, i - 2)], b = cas[Math.min(cas.length - 1, i + 2)]; return (a.L - b.L) / Math.max(0.1, Math.hypot(b.x - a.x, b.z - a.z)); };
      let lastS = -9;
      for (let i = 4; i < cas.length - 4; i++) {
        const drop = slopeAt(i - 2) - slopeAt(i + 2);
        if (drop > 0.22 && cas[i].s - lastS > 1.5) {
          const sm = cas[i];
          falls.push({ x: sm.x, z: sm.z, y: sm.L, tx: sm.tx, tz: sm.tz, nx: sm.nx, nz: sm.nz, w: sm.ww * 1.5, d: Math.min(1.2, 0.45 + drop), lip: sm, lat: 0, nh: sm.ww * 0.72, splash: true });
          lastS = sm.s;
        }
      }
    }

    // --- 바위: 작은 폭포 양옆, 웅덩이 속, 물가, 협곡 비탈·테두리 ---
    // 높이는 모두 그 자리 실제 벽·바닥 높이(secHeight)로: 예전엔 다른 점의 높이를 써서 벽에 매달린 바위가 있었다
    const rocks = [];
    const outer = (sm, sd) => { const sec = sd < 0 ? sm.secL : sm.secR; return sec.o[sec.o.length - 1]; };
    const wallY = (sm, o) => secHeight(o < 0 ? sm.secL : sm.secR, Math.abs(o));
    falls.forEach((f, i) => {
      const L = f.lip;
      for (const sd of [-1, 1]) {
        // 홈(노치) 양옆을 지키는 큰 바위 + 그 바깥 작은 바위: 바위 사이로 물이 모여 떨어진다
        const o = f.lat + sd * (f.nh + 0.14 + hash(i, sd + 40, seed) * 0.18), sz = 0.3 + hash(i, sd + 42, seed) * 0.24;
        rocks.push({ x: L.x + L.nx * o - L.tx * 0.12, z: L.z + L.nz * o - L.tz * 0.12, y: wallY(L, o) - sz * 0.3, s: sz, v: i % 3 });
        const o2 = o + sd * (sz * 0.9 + 0.12), sz2 = 0.16 + hash(i, sd + 43, seed) * 0.16;
        if (Math.abs(o2) < outer(L, sd) - 0.4) rocks.push({ x: L.x + L.nx * o2 + L.tx * 0.08, z: L.z + L.nz * o2 + L.tz * 0.08, y: wallY(L, o2) - sz2 * 0.3, s: sz2, v: (i + 1) % 3 });
      }
    });
    // 몇몇 턱엔 물살을 가르는 바위: 물이 갈라져 떨어져야 사람이 만든 보(洑)처럼 안 보인다
    falls.forEach((f, i) => {
      if (hash(i, 61, seed) > 0.55 || f.nh < 0.5) return;
      const L = f.lip, o = f.lat + (hash(i, 62, seed) - 0.5) * f.nh * 0.9, sz = 0.2 + hash(i, 63, seed) * 0.12;
      rocks.push({ x: L.x + L.nx * o + L.tx * 0.04, z: L.z + L.nz * o + L.tz * 0.04, y: L.L - sz * 0.35, s: sz, v: (i + 1) % 3 });
    });
    // 여울 속 바위: 바닥에 앉아 물 위로 머리만 내민다 (물이 부딪혀 갈라지며 하얗게 부서진다)
    st.pools.forEach((p, k) => {
      if (k === 0) return;
      const n = 3 + Math.floor(hash(k, 44, seed) * 3); // 3~5개: 물가와 물길 가운데
      for (let q = 0; q < n; q++) {
        const sm = secs.find((x) => x.k === k && !x.tail && x.u >= 0.22 + q * (0.6 / n));
        if (!sm || sm.u > 0.86) continue;
        const sd = hash(k, 45 + q, seed) < 0.5 ? -1 : 1, mid = hash(k, 48 + q, seed) < 0.5;
        const o = sd * (sd < 0 ? sm.secL : sm.secR).shore * (mid ? 0.1 + hash(k, 47 + q, seed) * 0.4 : 0.55 + hash(k, 47 + q, seed) * 0.35);
        const sz = (mid ? 0.22 : 0.17) + hash(k, 46 + q, seed) * 0.24;
        rocks.push({ x: sm.x + sm.nx * o, z: sm.z + sm.nz * o, y: sm.L - sz * 0.35, s: sz, v: (k + q + 1) % 3 });
        // 물길 가운데 돌 뒤엔 물이 갈라지며 하얗게 부서진다
        if (mid && sz > 0.3) falls.push({ x: sm.x + sm.nx * o + sm.tx * sz * 0.9, z: sm.z + sm.nz * o + sm.tz * sz * 0.9, y: sm.L, tx: sm.tx, tz: sm.tz, nx: sm.nx, nz: sm.nz, w: sz * 1.6, d: 0.5, lip: sm, lat: 0, nh: sz * 0.8, splash: true });
      }
    });
    // 협곡 테두리: 굴러 내려와 걸린 돌 (가파른 벽 중간엔 두지 않는다: 벽에 붙어 떠 보인다)
    secs.forEach((sm, i) => {
      if (sm.tail || i % 3 || inLake(sm) || sm.s < s0 + 1.2) return;
      for (const sd of [-1, 1]) {
        const sec = sd < 0 ? sm.secL : sm.secR;
        if (i % 6 === 0 && hash(i, sd + 47, seed) < 0.6) {
          const o = sd * (outer(sm, sd) - 0.45 - hash(i, sd + 48, seed) * 0.35), sz = 0.3 + hash(i, sd + 49, seed) * 0.45;
          rocks.push({ x: sm.x + sm.nx * o, z: sm.z + sm.nz * o, y: wallY(sm, o) - sz * 0.38, s: sz, v: (i + 2) % 3 });
        }
      }
    });
    // 물가 바위: 반쯤 잠긴 돌이 물가를 따라 드문드문 (곧은 물가 선을 깨고 자연 계곡처럼)
    secs.forEach((sm, i) => {
      if (sm.tail || sm.k === 0 || i % 2 || sm.u > 0.86 || sm.u < 0.06) return;
      for (const sd of [-1, 1]) {
        if (hash(i, sd + 70, seed) > 0.5) continue;
        const sec = sd < 0 ? sm.secL : sm.secR, sz = 0.14 + hash(i, sd + 72, seed) * hash(i, sd + 73, seed) * 0.34;
        const o = sd * (sec.shore + (hash(i, sd + 74, seed) - 0.35) * 0.3);
        rocks.push({ x: sm.x + sm.nx * o, z: sm.z + sm.nz * o, y: sm.L - sz * 0.25, s: sz, v: (i + (sd > 0 ? 1 : 0)) % 3 });
      }
    });
    const geos = [rl.rockGeo, rl.rockGeo2 || rl.rockGeo, rl.rockGeo3 || rl.rockGeo];
    for (let v = 0; v < 3; v++) {
      const list = rocks.filter((r) => r.v === v);
      if (!list.length) continue;
      const im = new T.InstancedMesh(geos[v], rl.mats.rock, list.length), m4 = new T.Matrix4(), q4 = new T.Quaternion(), e = new T.Euler(), vv = new T.Vector3(), sc = new T.Vector3();
      list.forEach((rk, i) => {
        e.set((hash(i, 51 + v, seed) - 0.5) * 0.6, hash(i, 54 + v, seed) * 6.28, (hash(i, 57 + v, seed) - 0.5) * 0.6);
        im.setMatrixAt(i, m4.compose(vv.set(rk.x, rk.y, rk.z), q4.setFromEuler(e), sc.set(rk.s * 1.3, rk.s * (0.75 + hash(i, 60, seed) * 0.4), rk.s * 1.1)));
      });
      im.castShadow = true;
      im.receiveShadow = true;
      im.layers.enable(DEPTH_LAYER);
      grp.add(im);
    }

    // --- 낙수 지점 거품·물방울 ---
    let foam = null, spawnFoam = null, chunks = null, spawnChunk = null, spawnSplash = null;
    if (falls.length) {
      const pick = () => { let tw = 0; for (const f of falls) tw += f.w * f.d; let r = Math.random() * tw; for (const f of falls) { r -= f.w * f.d; if (r <= 0) return f; } return falls[0]; };
      foam = foamSystem(Math.min(300, falls.length * 30), 0.7, fallTextures().foam);
      foam.mat.uniforms.uGrad.value = 0.4;
      spawnFoam = (sy, i) => {
        const f = pick(), j = f.lat + (Math.random() - 0.5) * f.w * 1.05, fw = 0.15 + Math.random() * 0.8, k = Math.min(1.5, 0.55 + f.d * 0.35);
        sy.P[i * 3] = f.x + f.nx * j; sy.P[i * 3 + 1] = f.y + 0.05 + Math.random() * 0.1; sy.P[i * 3 + 2] = f.z + f.nz * j;
        sy.vel[i * 3] = f.tx * fw + f.nx * (Math.random() - 0.5) * 0.4; sy.vel[i * 3 + 1] = (0.25 + Math.random() * 0.8) * k; sy.vel[i * 3 + 2] = f.tz * fw + f.nz * (Math.random() - 0.5) * 0.4;
        sy.life[i] = 0.6 + Math.random() * 0.8; sy.age[i] = 0;
        sy.s0[i] = (0.22 + Math.random() * 0.36) * k; sy.R[i] = (Math.random() - 0.5) * 0.6; sy.rs[i] = (Math.random() - 0.5) * 0.5;
      };
      for (let i = 0; i < foam.n; i++) { spawnFoam(foam, i); foam.age[i] = Math.random() * foam.life[i]; }
      foam.mesh.renderOrder = 8;
      grp.add(foam.mesh);
      // 물덩이: 턱마다 떨어지는 물덩이 + 바닥에 튀는 물방울 (큰 폭포와 같은 입자)
      const reals = falls.filter((f) => f.core);
      const pickF = () => { let tw = 0; for (const f of reals) tw += f.w * Math.sqrt(f.d); let r = Math.random() * tw; for (const f of reals) { r -= f.w * Math.sqrt(f.d); if (r <= 0) return f; } return reals[0]; };
      if (reals.length) {
        chunks = chunkSystem(coarseS ? 320 : 640, coarseS ? 50 : 100);
        const { pp, pv, pa, psz, life, age, floor } = chunks;
        spawnChunk = (k) => {
          const f = pickF(), c = f.core, L = f.lip, edge = Math.random() < 0.4;
          const q = edge ? (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 0.3) : (Math.random() + Math.random() - 1) * 0.95;
          const qq = Math.min(1, Math.abs(q)), v0 = c.v0At(qq) * (0.9 + Math.random() * 0.25), th0 = c.thickAt(qq);
          const tau0 = Math.random() * 0.3 * c.TMAX, drop = 0.5 * G * tau0 * tau0, out = v0 * tau0 + 0.04 + Math.random() * 0.12 + th0 * 0.5;
          const lat = f.lat + q * c.HW, lx = (Math.random() - 0.5) * 0.3;
          pp[k * 3] = L.x + L.nx * lat + L.tx * out; pp[k * 3 + 1] = L.L + 0.03 - drop; pp[k * 3 + 2] = L.z + L.nz * lat + L.tz * out;
          pv[k * 3] = L.tx * v0 + L.nx * lx; pv[k * 3 + 1] = -G * tau0; pv[k * 3 + 2] = L.tz * v0 + L.nz * lx;
          pa[k] = edge ? 0.6 + Math.random() * 0.3 : 0.35 + Math.random() * 0.4;
          psz[k] = (0.45 + Math.random() * 0.5) * Math.min(1, 0.6 + f.w * 0.25);
          life[k] = 99; age[k] = 0; floor[k] = f.y;
        };
        spawnSplash = (k) => {
          const f = pickF(), j = f.lat + (Math.random() - 0.5) * f.w, vin = 0.2 + Math.random() * 1.0, lx = (Math.random() - 0.5) * 0.8, kk = Math.min(1.3, 0.5 + f.d * 0.35);
          pp[k * 3] = f.x + f.nx * j; pp[k * 3 + 1] = f.y + 0.06; pp[k * 3 + 2] = f.z + f.nz * j;
          pv[k * 3] = f.tx * vin + f.nx * lx; pv[k * 3 + 1] = (0.4 + Math.random() * Math.random() * 1.4) * kk; pv[k * 3 + 2] = f.tz * vin + f.nz * lx;
          pa[k] = 0.5 + Math.random() * 0.3;
          psz[k] = 0.35 + Math.random() * 0.4;
          life[k] = 0.3 + Math.random() * 0.35; age[k] = 0; floor[k] = f.y;
        };
        for (let k = 0; k < chunks.NP; k++) { spawnChunk(k); const f = reals[0]; const tau = Math.random() * f.core.TMAX; pp[k * 3 + 1] -= 0.5 * G * tau * tau; pv[k * 3 + 1] -= G * tau; }
        for (let k = chunks.NP; k < chunks.NP + chunks.NS; k++) { spawnSplash(k); age[k] = Math.random() * life[k]; }
        grp.add(chunks.mesh);
      }
    }
    streamFx = { foam, spawnFoam, chunks, spawnChunk, spawnSplash, falls };
    return grp;
  }
  function updateStream(dt) {
    if (!streamFx) return;
    const near = field.crater ? ss(120, 40, camera.position.distanceTo(new T.Vector3(field.crater.x, field.crater.level, field.crater.z)) * 0.6) : 1;
    if (streamFx.foam) { stepFoam(streamFx.foam, dt, streamFx.spawnFoam, 1.2, 1.4, 1.1); streamFx.foam.mat.uniforms.uNear.value = near; }
    if (streamFx.chunks) streamFx.chunks.step(dt, streamFx.spawnChunk, streamFx.spawnSplash);
  }

  const _fc = new T.Color();
  function updateWaterfall(t, dt) {
    updateStream(dt);
    const f = fallFx;
    if (!f) return;
    // 물빛은 시간대 조명을 따른다 (밤엔 달빛에 은은하게)
    fallLight.value.copy(hemi.color).multiplyScalar(hemi.intensity * 0.85).add(_fc.copy(key.color).multiplyScalar(key.intensity * 0.3));
    if (curPal) fallLight.value.multiplyScalar(1 - curPal.stars * 0.5); // 밤엔 물빛을 낮춘다 (혼자 빛나 보이지 않게)
    if (fallWallMat && curPal) fallWallMat.emissiveIntensity = curPal.stars * 0.55; // 밤 절벽이 새까만 덩어리가 되지 않게
    { const v = fallLight.value, l = v.r * 0.3 + v.g * 0.59 + v.b * 0.11; v.setRGB(l + (v.r - l) * 0.45, l + (v.g - l) * 0.45, l + (v.b - l) * 0.45); } // 노을빛에 물이 흙탕물처럼 물들지 않게
    const mx = Math.max(fallLight.value.r, fallLight.value.g, fallLight.value.b);
    if (mx > 1) fallLight.value.multiplyScalar(1 / mx);
    // 해 방향(물기둥 조명·반사), 밤의 바위 발광
    fallSun.value.copy(key.position).normalize();
    for (const m of rockMats) m.emissiveIntensity = curPal ? curPal.stars * 0.5 : 0;
    f.chunks.step(dt, f.spawn, f.spawnSplash);
    // 밑동 플룸·물안개 (멀리서는 물안개를 옅게)
    stepFoam(f.foam, dt, f.spawnFoam, 1.7, 1.1, 1.15);
    stepFoam(f.mist, dt, f.spawnMist, 0.0, 0.5, 1.25);
    f.mist.mat.uniforms.uNear.value = ss(150, 45, camera.position.distanceTo(f.imp));
    // 무지개: 해가 떠 있을 때만, 아주 은은하게
    const sunny = curPal ? (1 - curPal.stars) * ss(1.3, 2.0, key.intensity) : 0;
    f.rb.material.uniforms.uOp.value = sunny * 0.05 * ss(7, 14, camera.position.distanceTo(f.imp)) * ss(f.poolY + 0.5, f.poolY + 2.5, camera.position.y);
    updateFallAudio();
  }

  // 폭포 소리: 녹음 파일 없이 핑크 노이즈를 걸러 물 쏟아지는 소리를 만든다 (가까울수록 크게)
  function startFallAudio() {
    if (fallAudio) { if (fallAudio.ctx && fallAudio.ctx.state === 'suspended') fallAudio.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC(), len = ctx.sampleRate * 4, buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < len; i++) {
          const w = Math.random() * 2 - 1;
          b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526;
          d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
        }
        // 이음새 딸깍 소리 방지
        for (let i = 0; i < 2000; i++) { const k = i / 2000; d[i] = d[i] * k + d[len - 2000 + i] * (1 - k); }
      }
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true; src.loopEnd = (len - 2000) / ctx.sampleRate;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
      const gain = ctx.createGain(); gain.gain.value = 0;
      src.connect(lp).connect(gain).connect(ctx.destination);
      src.start();
      // 파도: 낮게 웅웅대는 바다 + 밀려왔다 부서지는 너울 (볼륨을 천천히 오르내린다)
      const sea = ctx.createBufferSource(); sea.buffer = buf; sea.loop = true; sea.playbackRate.value = 0.62;
      const seaLp = ctx.createBiquadFilter(); seaLp.type = 'lowpass'; seaLp.frequency.value = 520;
      const seaGain = ctx.createGain(); seaGain.gain.value = 0;
      sea.connect(seaLp).connect(seaGain).connect(ctx.destination);
      sea.start(0, 1.3);
      // 바람: 높은 곳·탁 트인 곳에서 쉬익
      const wind = ctx.createBufferSource(); wind.buffer = buf; wind.loop = true; wind.playbackRate.value = 0.8;
      const windBp = ctx.createBiquadFilter(); windBp.type = 'bandpass'; windBp.frequency.value = 650; windBp.Q.value = 0.7;
      const windGain = ctx.createGain(); windGain.gain.value = 0;
      wind.connect(windBp).connect(windGain).connect(ctx.destination);
      wind.start(0, 2.7);
      fallAudio = { ctx, gain, lp, seaGain, seaLp, windGain, windBp };
    } catch (e) { fallAudio = { failed: true }; }
  }
  function updateFallAudio() {
    if (!fallAudio || !fallAudio.gain || !fallFx) return;
    const d = camera.position.distanceTo(fallFx.imp);
    const near = mode === 'walk' && hero ? hero.obj.position.distanceTo(fallFx.imp) : d;
    const vol = fallMuted || document.hidden ? 0 : 0.42 * ss(80, 6, Math.min(d, near));
    const now = fallAudio.ctx.currentTime;
    fallAudio.gain.gain.setTargetAtTime(vol, now, 0.4);
    fallAudio.lp.frequency.setTargetAtTime(500 + 1500 * ss(60, 5, Math.min(d, near)), now, 0.4);
    // 듣는 위치(걷기: 캐릭터, 그 외: 카메라)
    const L = mode === 'walk' && hero ? hero.obj.position : camera.position;
    // 파도: 주변이 얼마나 바다인지 + 낮을수록 크게. 너울처럼 7초 남짓 주기로 커졌다 작아진다
    let sea = 0;
    for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.283; if (groundAt(L.x + Math.cos(a) * 14, L.z + Math.sin(a) * 14) < 0) sea++; }
    const t = now, swell = 0.55 + 0.45 * Math.max(0, Math.sin(t * 0.85 + Math.sin(t * 0.31) * 1.7));
    const seaVol = fallMuted || document.hidden ? 0 : (sea / 8) * ss(40, 4, L.y) * 0.32 * swell + (mode === 'hero' ? 0 : 0.02);
    fallAudio.seaGain.gain.setTargetAtTime(seaVol, now, 0.6);
    fallAudio.seaLp.frequency.setTargetAtTime(380 + 420 * swell, now, 0.5);
    // 바람: 높이 올라갈수록, 조감도에서 크게
    const windVol = fallMuted || document.hidden ? 0 : 0.015 + 0.09 * ss(6, 30, L.y) * (0.6 + 0.4 * Math.sin(t * 0.37));
    fallAudio.windGain.gain.setTargetAtTime(windVol, now, 0.8);
    fallAudio.windBp.frequency.setTargetAtTime(520 + 260 * Math.sin(t * 0.23), now, 0.8);
  }

  // 첫 화면: 폭포 정면에서 천천히 흔들리는 카메라
  function heroPose() {
    const f = fallFx;
    if (!f) return overviewPose(cam, theta + userTheta);
    const t = performance.now() / 1000;
    const D = 23.5 + Math.sin(t * 0.05) * 1.5, sw = Math.sin(t * 0.04) * 4 + 1.5;
    const pos = new T.Vector3(f.imp.x + f.fx * D + f.sx * sw, 0, f.imp.z + f.fz * D + f.sz * sw);
    // 폭포 꼭대기보다 조금 높이서: 위쪽 계곡의 작은 폭포들 → 바위턱 → 큰 폭포 → 소까지 물길이 한 줄로 이어져 보이게
    // (예전엔 소 근처 낮은 곳이라 바위턱 위 물이 턱에 가려, 큰 폭포가 갈색 비탈에서 갑자기 솟는 것처럼 보였다)
    pos.y = Math.max(f.poolY + f.H * 1.05 + Math.sin(t * 0.06) * 0.5, heightAt(pos.x, pos.z) + 2.2);
    const wide = camera.aspect > 1.15, off = wide ? 5.2 : 0;
    const tgt = new T.Vector3(f.imp.x - f.fx * 2 + f.sx * off, f.poolY + f.H * (wide ? 0.72 : 0.36), f.imp.z - f.fz * 2 + f.sz * off);
    const m = new T.Matrix4().lookAt(pos, tgt, new T.Vector3(0, 1, 0));
    return { pos, quat: new T.Quaternion().setFromRotationMatrix(m) };
  }

  // 폭포 아래 물보라 (부드러운 흰 안개 스프라이트)
  function buildMist() {
    const rl = RL(), rv = field.river;
    if (!rl || !rv) return null;
    const grp = new T.Group();
    let fallAt = null;
    for (let q = 1; q < rv.length; q++) if (rv[q - 1].bed - rv[q].bed > 0.5) fallAt = rv[q];
    // 산꼭대기 구름 안개도 같이
    const spots = [];
    if (false && fallAt) for (let k = 0; k < 6; k++) spots.push([fallAt.x + (Math.random() - 0.5) * 3, fallAt.bed + 0.8 + Math.random() * 1.5, fallAt.z + (Math.random() - 0.5) * 3, 4 + Math.random() * 3, 0.55]);
    const cr = field.crater;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * 6.28 + Math.random() * 0.6, r = cr.R + 3 + Math.random() * 6;
      spots.push([field.vc[0] + Math.cos(a) * r, cr.rim + 2 + Math.random() * 3, field.vc[1] + Math.sin(a) * r, 10 + Math.random() * 6, 0.18]);
    }
    for (const [x, y, z, sz, op] of spots) {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: rl.cloudTex, transparent: true, depthWrite: false, opacity: op }));
      sp.position.set(x, y, z);
      sp.scale.set(sz, sz * 0.6, 1);
      sp.userData = { y, ph: Math.random() * 6 };
      grp.add(sp);
    }
    return grp;
  }

  // ---------- 실사 바위 절벽면 (Poly Haven 스캔, CC0) ----------
  // 폭포 둘레 절벽 테두리·폭포 턱 양옆·급류 골짜기 벽·호수 출구에 실제 바위 스캔을 박는다.
  // (반원으로 깔끔하게 도려낸 듯한 절벽 테두리와 매끈한 턱이 사람이 만든 것처럼 보였다)
  let rockFaceGrp = null;
  function buildRockFaces() {
    const rl = RL(), fl = field.fall, st = field.stream;
    if (!rl || !rl.rockFaces || !fl) return null;
    // 스캔은 +z를 보고 뒤로 누운 바위면 → 평균 법선이 수평이 되게 앞으로 세운다(tilt). 세운 뒤의 폭·높이·깊이를 잰다
    const V = [0, 1].map((i) => {
      const rf = rl.rockFaces[i];
      if (!rf) return null;
      const geo = rf.parts[0].geo, pos = geo.attributes.position, nor = geo.attributes.normal, n = new T.Vector3(), v = new T.Vector3();
      for (let k = 0; k < nor.count; k += 5) n.add(v.fromBufferAttribute(nor, k));
      n.normalize();
      const tilt = Math.atan2(n.y, n.z), q = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), tilt), box = new T.Box3();
      for (let k = 0; k < pos.count; k += 3) box.expandByPoint(v.fromBufferAttribute(pos, k).applyQuaternion(q));
      return { part: rf.parts[0], tilt, w: box.max.x - box.min.x, h: box.max.y - box.min.y, d: box.max.z - box.min.z, cx: (box.min.x + box.max.x) / 2, y0: box.min.y, z0: box.min.z };
    });
    if (!V[0] && !V[1]) return null;
    const pick = (vi) => (V[vi] ? vi : 1 - vi);
    const items = [];
    // 놓을 자리: (바닥 가운데 뒤쪽) 기준점 x,y,z · 바라보는 방향 yaw · 높이 hgt. 걸어서 뚫고 지나가지 않게 col이면 충돌 원
    const add = (vi, x, y, z, yaw, hgt, col, lean) => {
      vi = pick(vi);
      const v = V[vi], s = hgt / v.h;
      items.push({ vi, x, y, z, yaw, s, lean: lean || 0 });
      if (col) trunks.push({ x: x + Math.sin(yaw) * v.d * s * 0.5, z: z + Math.cos(yaw) * v.d * s * 0.5, r: Math.max(0.3, v.w * s * 0.3) });
    };
    const R0 = fl.BR, fx = fl.fx, fz = fl.fz, sx = -fz, sz = fx, RW = R0 + 0.2, poolY = fl.poolY;
    const arc = (phi, r) => [fl.cx + r * (-fx * Math.cos(phi) + sx * Math.sin(phi)), fl.cz + r * (-fz * Math.cos(phi) + sz * Math.sin(phi))];
    const lipK = (phi) => ss(0.62, 0.44, Math.abs(phi));
    // 1) 폭포 둘레 절벽 테두리: 바위 덩어리가 테두리 위로 솟고 절벽면으로 흘러내린다
    let n = 0;
    for (const sd of [-1, 1])
      for (const ph of [0.9, 1.5]) {
        const phi = ph * sd, [ox, oz] = arc(phi, R0 + 2.8), outer = heightAt(ox, oz), lk = lipK(phi);
        const capH = Math.max(poolY + 0.2, outer * (1 - lk) + fl.top * lk), hide = ss(poolY + 1.4, poolY + 0.6, outer) * (1 - lk);
        n++;
        if (hide > 0.4 || capH - poolY < 2.2) continue;
        const hgt = Math.max(1.6, Math.min(3.6, 0.33 * (capH - poolY) + 1.3)) * (0.85 + hash(n, 31, seed) * 0.3);
        // 벽 속에 묻고 위를 뒤로 기울인다 (벽 밖에 세워 두면 스티커처럼 떠 보이고 밑면이 직선으로 드러났다)
        const [x, z] = arc(phi + (hash(n, 32, seed) - 0.5) * 0.12, RW + 0.05);
        add(n % 2, x, capH - hgt * 0.95, z, Math.atan2(fl.cx - x, fl.cz - z) + (hash(n, 33, seed) - 0.5) * 0.5, hgt, true, -(0.2 + hash(n, 34, seed) * 0.25));
      }
    // 2) 폭포 턱 양옆: 물이 떨어지는 입구를 바위가 감싼다 (첫 화면 쪽을 보며)
    for (const sd of [-1, 1]) {
      const [x, z] = arc((sd * 3.6) / RW, RW + 0.35);
      add(sd > 0 ? 0 : 1, x, fl.top - 1.7, z, Math.atan2(fx, fz) - sd * 0.45, 2.8, true, -0.22);
    }
    // 3) 급류 골짜기: 높은 쪽 벽에 물을 바라보는 바위면 / 4) 호수 출구 양옆
    if (st && st.secs) {
      const cas = st.secs.filter((sm) => !sm.tail && st.pools[sm.k] && st.pools[sm.k].cascade);
      if (cas.length > 8)
        [0.24, 0.52, 0.8].forEach((u) => {
          const sm = cas[Math.round(u * (cas.length - 1))];
          const yl = secHeight(sm.secL, sm.secL.shore + 1.4), yr = secHeight(sm.secR, sm.secR.shore + 1.4), sd = yl > yr ? -1 : 1;
          const sec = sd < 0 ? sm.secL : sm.secR, v = V[pick(1)], hgt = Math.max(0.9, Math.min(2.2, (Math.max(yl, yr) - sm.L) * 0.9)), o = sd * (sec.shore + 0.4 + v.d * (hgt / v.h));
          add(1, sm.x + sm.nx * o, sm.L - 0.25, sm.z + sm.nz * o, Math.atan2(-sm.nx * sd, -sm.nz * sd), hgt, false);
        });
      const o0 = field.crater && st.secs.find((sm) => Math.hypot(sm.x - field.crater.x, sm.z - field.crater.z) > field.crater.R + 0.3);
      if (o0) for (const sd of [-1, 1]) { const o = sd * (Math.max(o0.secL.shore, o0.secR.shore) + 0.9); add(1, o0.x + o0.nx * o, o0.L - 0.35, o0.z + o0.nz * o, Math.atan2(o0.tx, o0.tz) - sd * 0.5, 1.4, true); }
    }
    const grp = new T.Group(), m4 = new T.Matrix4(), mY = new T.Matrix4(), mS = new T.Matrix4(), mO = new T.Matrix4(), mX = new T.Matrix4(), mL = new T.Matrix4();
    rockMats = [];
    V.forEach((v, vi) => {
      const list = v ? items.filter((it) => it.vi === vi) : [];
      if (!list.length) return;
      // 스캔 바위는 햇빛 아래 밝은 크림색으로 떠 보였다 → 섬 절벽 바위 톤(어둡고 따뜻하게)에 맞춘다
      v.part.mat.color.setRGB(0.66, 0.6, 0.53);
      v.part.mat.envMapIntensity = 0.7;
      v.part.mat.emissive = new T.Color('#33404f'); // 밤엔 절벽 벽과 같이 은은히 (검은 종이처럼 보이지 않게)
      rockMats.push(v.part.mat);
      const im = new T.InstancedMesh(v.part.geo, v.part.mat, list.length), c = new T.Vector3();
      let r = 0;
      list.forEach((it, i) => {
        m4.makeTranslation(it.x, it.y, it.z).multiply(mY.makeRotationY(it.yaw)).multiply(mL.makeRotationX(it.lean)).multiply(mS.makeScale(it.s, it.s, it.s)).multiply(mO.makeTranslation(-v.cx, -v.y0, -v.z0)).multiply(mX.makeRotationX(v.tilt));
        im.setMatrixAt(i, m4);
        c.x += it.x / list.length; c.y += it.y / list.length; c.z += it.z / list.length;
      });
      for (const it of list) r = Math.max(r, Math.hypot(it.x - c.x, it.y - c.y, it.z - c.z) + Math.max(v.w, v.h, v.d) * it.s);
      // r147 인스턴스 메시는 원본 하나의 경계로 화면 밖 판정을 해서, 흩어 놓은 인스턴스가 통째로 사라질 수 있다 → 전체를 덮는 경계
      v.part.geo.boundingSphere = new T.Sphere(c.clone(), r);
      im.castShadow = true;
      im.receiveShadow = true;
      im.layers.enable(DEPTH_LAYER);
      grp.add(im);
    });
    return grp;
  }

  // ---------- 식생: 야자수·고사리·풀 덤불 ----------
  function buildDecor() {
    const L = { palm: [], broad: [], banana: [], monstera: [], fern: [], rock: [], grass: [], drift: [], shell: [] };
    trunks = [];
    const rv = field.river || [];
    const nearRiver = (x, z) => rv.some((r) => (x - r.x) ** 2 + (z - r.z) ** 2 < 4.4);
    const fz0 = field.fall, cr0 = field.crater;
    const inCrater = (x, z, h) => cr0 && Math.hypot(x - cr0.x, z - cr0.z) < cr0.R + 0.8 && h < cr0.level + 0.5;
    const stS = field.stream ? field.stream.samples : null;
    // 협곡 단면(벽 모양)은 웅덩이·지형으로 정해지는 순수 함수라 여기서 미리 구해 둔다 (협곡 메시는 이 뒤 buildStream에서 짓는다)
    const stSec = stS ? stS.map((sm) => (sm.tail ? null : { L: streamSection(sm, -1, field.stream.WO), R: streamSection(sm, 1, field.stream.WO) })) : null;
    const stExt = stSec ? stSec.map((q) => (q ? Math.max(q.L.o[q.L.o.length - 1], q.R.o[q.R.o.length - 1]) : field.stream.WO)) : null;
    const inGorge = (x, z, pad) => {
      if (!stS || Math.hypot(x - field.vc[0], z - field.vc[1]) > 40) return false;
      for (let i = 0; i < stS.length; i += 2) if ((x - stS[i].x) ** 2 + (z - stS[i].z) ** 2 < (stExt[i] + pad) ** 2) return true;
      return false;
    };
    const inBasin = (x, z) => fz0 && Math.hypot(x - fz0.cx, z - fz0.cz) < fz0.BR + 2.6;
    const onShelf = (x, z) => {
      if (!fz0) return false;
      const al = (x - fz0.x) * fz0.fx + (z - fz0.z) * fz0.fz, lt = Math.abs((x - fz0.x) * -fz0.fz + (z - fz0.z) * fz0.fx);
      return al > -11 && al < 1 && lt < 4.4;
    };
    const fallView = (x, z) => {
      if (!fz0) return false;
      const ax = (x - fz0.cx) * fz0.fx + (z - fz0.cz) * fz0.fz, lt = Math.abs((x - fz0.cx) * -fz0.fz + (z - fz0.cz) * fz0.fx);
      return ax > -1 && ax < 36 && lt < 5 + ax * 0.45;
    };
    const ok = (x, z, minH, maxH) => { const h = heightAt(x, z); return h > minH && h < maxH && !nearRiver(x, z) && !inBasin(x, z); };
    const tree = (list, x, z, h, r, v, rad) => {
      // 줄기끼리 최소한 사람 하나 지나갈 틈(0.34)은 남긴다
      if (heightAt(x, z) > 13 || fallView(x, z) || trunks.some((t) => (x - t.x) ** 2 + (z - t.z) ** 2 < Math.max(0.8, (t.r + rad + 0.34) ** 2))) return;
      const bs = rad * 1.6, base = Math.min(heightAt(x, z), heightAt(x + bs, z), heightAt(x - bs, z), heightAt(x, z + bs), heightAt(x, z - bs)) - 0.03;
      list.push({ x, z, y: base, h, r, v });
      trunks.push({ x, z, r: rad, h, y: base });
    };
    // 지역별 출현 확률: [야자수, 활엽수, 바나나, 몬스테라, 고사리, 꽃, 풀]
    // [야자수, 활엽수, 바나나, 몬스테라, 고사리, 바위, 풀]
    const TABLE = {
      coast: [0.16, 0, 0.02, 0, 0, 0.012, 0.05],
      meadow: [0, 0, 0, 0, 0.03, 0.012, 0.42],
      grove: [0.06, 0.34, 0.06, 0, 0.14, 0.01, 0.08],
      wood: [0.025, 0.24, 0.06, 0, 0.14, 0.008, 0.12],
      jungle: [0.09, 0.32, 0.14, 0, 0.22, 0.004, 0.02],
      highland: [0, 0.05, 0, 0, 0.1, 0.05, 0.2],
    };
    for (const p of cellsOf(plots)) {
      const cc = cellCenter(p);
      const hp = (k) => hash(p.id, k, seed);
      const outward = Math.atan2(cc.x, cc.z);
      for (let k = 0; k < 85; k++) {
        const x = cc.x + (hp(k * 13 + 3) - 0.5) * S * 0.98, z = cc.z + (hp(k * 13 + 4) - 0.5) * S * 0.98;
        const h = heightAt(x, z);
        if (h < 0.15 || nearRiver(x, z) || inBasin(x, z) || onShelf(x, z) || inCrater(x, z, h) || inGorge(x, z, 0.4)) continue;
        const slope = Math.hypot(heightAt(x + 0.4, z) - heightAt(x - 0.4, z), heightAt(x, z + 0.4) - heightAt(x, z - 0.4)) / 0.8;
        if (slope > 1.0) continue; // 45도 넘는 비탈
        let bm = biome(x, z, h);
        // 초원 속 나무 군락
        if (bm === 'meadow' && vnoise(x * 0.07, z * 0.07, seed + 61) > 0.64) bm = 'grove';
        const P = TABLE[bm], thin = bm === 'highland' ? ss(8.5, 15, h) : 0;
        let roll = hp(k * 13 + 5), acc = 0;
        // 나무는 군락과 빈터로: 큰 결 노이즈로 숲이 뭉치고 사이사이 트인 풀밭 (고른 간격이면 심어 놓은 과수원처럼 보였다)
        const clus = 0.3 + 1.6 * ss(0.36, 0.7, vnoise(x * 0.045, z * 0.045, seed + 303));
        const pick = (i) => { acc += P[i] * (1 - thin * 0.7) * (i < 2 ? clus : 1); return roll < acc; };
        const r = hp(k * 13 + 6) * 6.28, sz = hp(k * 13 + 7);
        // 초원의 고사리·키 큰 풀은 군락으로 모인다
        const patch = bm === 'meadow' ? 0.4 + ss(0.45, 0.72, vnoise(x * 0.09, z * 0.09, seed + 51)) * 1.6 : 1;
        if (pick(0)) tree(L.palm, x, z, 2.7 + sz * 1.5, bm === 'coast' ? outward + (sz - 0.5) * 1.3 : r, k % 4, 0.024 * (2.7 + sz * 1.5));
        else if (pick(1)) tree(L.broad, x, z, (bm === 'grove' ? 4.4 : 3.4) + sz * 1.8, r, k % 3, 0.024 * ((bm === 'grove' ? 4.4 : 3.4) + sz * 1.8));
        else if (pick(2)) L.banana.push({ x, z, y: h, h: 1.4 + sz * 0.6, r, v: k % 2 });
        else if (pick(3)) L.monstera.push({ x, z, y: h, h: 0.6 + sz * 0.45, r });
        else if (roll < acc + P[4] * patch) { acc += P[4] * patch; L.fern.push({ x, z, y: h, h: 0.3 + sz * 0.3, r }); }
        else if (pick(5)) L.rock.push({ x, z, y: h, s: 0.4 + sz * sz * 1.6, r });
        else if (roll < acc + P[6] * patch) L.grass.push({ x, z, y: h, w: 0.36 + sz * 0.3, h: Math.min(0.22, (bm === 'meadow' ? 0.1 : 0.08) + sz * 0.09 * patch), r }); // 사람(0.44) 발목~무릎 높이
      }
    }
    // 협곡 비탈: 완만한 턱마다 고사리·풀 (맨 바위벽만 이어지면 돌 수로처럼 보인다). 물에 젖는 아래쪽·호수 출구는 빼고
    if (stS)
      stS.forEach((sm, i) => {
        const q = stSec[i];
        if (!q || sm.k === 0 || i % 2 || inCrater(sm.x, sm.z, -99)) return;
        for (const sd of [-1, 1]) {
          const sec = sd < 0 ? q.L : q.R;
          for (let j = 5; j < sec.o.length - 1; j++) {
            const run = sec.o[j + 1] - sec.o[j], slope = (sec.y[j + 1] - sec.y[j]) / Math.max(0.05, run);
            if (slope > 1.1 || sec.y[j] < sm.L + 0.55) continue;
            const hh = hash(i * 11 + j, sd + 120, seed);
            if (hh > 0.42) continue;
            const ao = sec.o[j] + run * (0.3 + hash(i * 11 + j, sd + 121, seed) * 0.4), x = sm.x + sm.nx * sd * ao, z = sm.z + sm.nz * sd * ao;
            const y = secHeight(sec, ao);
            if (fz0 && Math.hypot(x - fz0.cx, z - fz0.cz) < fz0.BR + 2) continue;
            if (hh < 0.2) L.fern.push({ x, z, y, h: 0.24 + hash(i * 11 + j, sd + 122, seed) * 0.22, r: hash(i * 11 + j, sd + 123, seed) * 6.28 });
            else L.grass.push({ x, z, y, w: 0.34 + hash(i * 11 + j, sd + 124, seed) * 0.2, h: 0.14 + hash(i * 11 + j, sd + 125, seed) * 0.1, r: hash(i * 11 + j, sd + 126, seed) * 6.28 });
          }
        }
      });
    // 폭포 둘레: 물보라로 늘 젖은 곳이라 가장 우거진다 — 소 둘레 고리(강 출구 쪽은 비움)에 고사리·바나나·활엽수, 절벽 턱 위에 고사리
    if (fz0) {
      const hpF = (k) => hash(k, 777, seed);
      for (let k = 0; k < 260; k++) {
        const a = hpF(k * 5) * 6.283, rr = fz0.BR + 2.8 + hpF(k * 5 + 1) * 6.5;
        const x = fz0.cx + Math.sin(a) * rr, z = fz0.cz + Math.cos(a) * rr, h = heightAt(x, z);
        const ax = (x - fz0.cx) * fz0.fx + (z - fz0.cz) * fz0.fz; // 앞(강 출구·첫 화면 쪽)은 비운다
        if (ax > fz0.BR * 0.35 || h < fz0.poolY + 0.3 || nearRiver(x, z) || onShelf(x, z) || inGorge(x, z, 0.4)) continue;
        if (Math.hypot(heightAt(x + 0.4, z) - heightAt(x - 0.4, z), heightAt(x, z + 0.4) - heightAt(x, z - 0.4)) / 0.8 > 1.3) continue;
        const r = hpF(k * 5 + 2) * 6.28, sz = hpF(k * 5 + 3), roll = hpF(k * 5 + 4);
        if (roll < 0.5) L.fern.push({ x, z, y: h, h: 0.3 + sz * 0.35, r });
        else if (roll < 0.68) L.banana.push({ x, z, y: h, h: 1.3 + sz * 0.7, r, v: k % 2 });
        else if (roll < 0.8) tree(L.broad, x, z, 3.2 + sz * 1.6, r, k % 3, 0.024 * (3.2 + sz * 1.6));
        else if (roll < 0.86) tree(L.palm, x, z, 2.6 + sz * 1.4, r, k % 4, 0.024 * (2.6 + sz * 1.4));
        else L.grass.push({ x, z, y: h, w: 0.4 + sz * 0.3, h: 0.14 + sz * 0.08, r });
      }
      // 절벽 턱(폭포 양옆 바위 테두리 위): 물보라를 맞는 고사리
      const RWc = fz0.BR + 0.2, sx0 = -fz0.fz, sz0 = fz0.fx;
      for (let k = 0; k < 70; k++) {
        const sd = k % 2 ? -1 : 1, phi = sd * (0.5 + hpF(k * 3 + 900) * 1.6), rr = RWc + 0.9 + hpF(k * 3 + 901) * 1.7;
        const x = fz0.cx + rr * (-fz0.fx * Math.cos(phi) + sx0 * Math.sin(phi)), z = fz0.cz + rr * (-fz0.fz * Math.cos(phi) + sz0 * Math.sin(phi));
        const cq = fallCapQuery(x, z);
        if (!cq || cq.water !== null || cq.floor < fz0.poolY + 1.5) continue;
        if (hpF(k * 3 + 902) < 0.75) L.fern.push({ x, z, y: cq.floor, h: 0.26 + hpF(k * 3 + 903) * 0.3, r: hpF(k * 3 + 904) * 6.28 });
        else L.grass.push({ x, z, y: cq.floor, w: 0.38, h: 0.16, r: hpF(k * 3 + 904) * 6.28 });
      }
    }
    // 협곡 테두리 바깥: 고사리·풀이 줄지어 자란다 (턱 근처는 더 촘촘히)
    if (stS)
      stS.forEach((sm, i) => {
        if (sm.tail || i % 2 || inCrater(sm.x, sm.z, -99)) return;
        for (const sd of [-1, 1]) {
          const q = stSec[i], ext = q ? (sd < 0 ? q.L : q.R).o[(sd < 0 ? q.L : q.R).o.length - 1] : field.stream.WO;
          const o = ext + 0.25 + hash(i, sd + 60, seed) * 0.8, x = sm.x + sm.nx * sd * o, z = sm.z + sm.nz * sd * o, h = heightAt(x, z);
          if (inGorge(x, z, 0.1) || (fz0 && Math.hypot(x - fz0.cx, z - fz0.cz) < fz0.BR + 3)) continue;
          const rr2 = hash(i, sd + 62, seed);
          if (rr2 < 0.7) L.fern.push({ x, z, y: h, h: 0.3 + hash(i, sd + 63, seed) * 0.3, r: hash(i, sd + 64, seed) * 6.28 });
          else if (rr2 < 0.82) L.banana.push({ x, z, y: h, h: 1.2 + hash(i, sd + 63, seed) * 0.6, r: hash(i, sd + 64, seed) * 6.28, v: i % 2 });
          const gx = x + sm.nx * sd * 0.5, gz = z + sm.nz * sd * 0.5;
          L.grass.push({ x: gx, z: gz, y: heightAt(gx, gz), w: 0.45, h: 0.2 + hash(i, sd + 65, seed) * 0.12, r: hash(i, sd + 66, seed) * 6.28 });
        }
      });
    // 풀밭: 초원·고원·숲 가장자리에 작은 풀 포기를 촘촘히 (군락 무늬로 모였다 흩어졌다). 키는 사람(0.44) 발목~정강이
    for (const p of cellsOf(plots)) {
      const cc = cellCenter(p), hp = (k) => hash(p.id, k + 500, seed);
      for (let k = 0; k < 64; k++) {
        const x = cc.x + (hp(k * 7) - 0.5) * S, z = cc.z + (hp(k * 7 + 1) - 0.5) * S, h = heightAt(x, z);
        if (h < 0.45 || nearRiver(x, z) || inBasin(x, z) || onShelf(x, z) || inCrater(x, z, h) || inGorge(x, z, 0.3)) continue;
        const bm = biome(x, z, h), dens = bm === 'meadow' ? 0.9 : bm === 'highland' ? 0.55 * (1 - ss(11, 16, h)) : bm === 'wood' ? 0.42 : bm === 'jungle' ? 0.14 : 0.2;
        const patch = ss(0.32, 0.72, vnoise(x * 0.12, z * 0.12, seed + 151));
        if (hp(k * 7 + 2) > dens * (0.22 + patch * 0.95)) continue;
        if (Math.hypot(heightAt(x + 0.3, z) - heightAt(x - 0.3, z), heightAt(x, z + 0.3) - heightAt(x, z - 0.3)) / 0.6 > 0.85) continue;
        L.grass.push({ x, z, y: h, w: 0.2 + hp(k * 7 + 3) * 0.18, h: 0.08 + hp(k * 7 + 4) * 0.07 + patch * 0.05, r: hp(k * 7 + 5) * 6.28 });
      }
    }
    // 해변: 파도에 밀려온 표류목·조개, 물가 바위 (맨 모래뿐이면 사람이 안 사는 세트장처럼 보였다)
    for (const p of cellsOf(plots)) {
      const cc = cellCenter(p), hp = (k) => hash(p.id, k + 900, seed);
      for (let k = 0; k < 40; k++) {
        const x = cc.x + (hp(k * 5) - 0.5) * S, z = cc.z + (hp(k * 5 + 1) - 0.5) * S, h = heightAt(x, z);
        if (h < 0.1 || h > 0.5 || nearRiver(x, z) || inBasin(x, z)) continue;
        const roll = hp(k * 5 + 2), r = hp(k * 5 + 3) * 6.28, sz = hp(k * 5 + 4);
        if (roll < 0.035) L.drift.push({ x, z, y: h, r, s: 0.5 + sz * 0.9 });
        else if (roll < 0.075) L.rock.push({ x, z, y: h - 0.05, s: 0.25 + sz * sz * 0.9, r });
        else if (roll < 0.3 && h < 0.3) L.shell.push({ x, z, y: h, r, s: 0.03 + sz * 0.03 });
      }
    }
    // 화산 비탈: 드러난 바위 덩어리 (높을수록·가파를수록 많이)
    for (const p of cellsOf(plots)) {
      const cc = cellCenter(p), hp = (k) => hash(p.id, k + 1300, seed);
      for (let k = 0; k < 30; k++) {
        const x = cc.x + (hp(k * 4) - 0.5) * S, z = cc.z + (hp(k * 4 + 1) - 0.5) * S, h = heightAt(x, z);
        if (h < 5 || inCrater(x, z, h) || inGorge(x, z, 0.6) || onShelf(x, z) || inBasin(x, z)) continue;
        const sl = Math.hypot(heightAt(x + 0.4, z) - heightAt(x - 0.4, z), heightAt(x, z + 0.4) - heightAt(x, z - 0.4)) / 0.8;
        if (hp(k * 4 + 2) > 0.05 + ss(0.4, 1.1, sl) * 0.12 + ss(8, 16, h) * 0.08) continue;
        const sz = hp(k * 4 + 3);
        L.rock.push({ x, z, y: h - 0.1, s: 0.5 + sz * sz * 2.2, r: hp(k * 4 + 2) * 40 });
      }
    }
    const rl = RL();
    return rl ? decorReal(L, rl) : decorFallback(L);
  }

  // 고사리·풀 거리별 표시: 카메라 가까운 것만 인스턴스로 올린다 (카메라가 4m 넘게 움직일 때마다 다시 고른다)
  // 지도처럼 멀리서 보면 어차피 점만 해서, 섬 전체를 다 그리면 삼각형만 늘고 깜빡인다
  let lodSets = [];
  function updateFernLod() {
    if (!lodSets.length) return;
    const cx = camera.position.x, cz = camera.position.z, coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    for (const f of lodSets) {
      if (camera.position.distanceTo(f.at) < 4) continue;
      f.at.copy(camera.position);
      const R2 = f.R * f.R, cap = coarse ? f.capM : f.cap, near = [];
      for (const it of f.items) { const d2 = (it.x - cx) ** 2 + (it.z - cz) ** 2; if (d2 < R2) near.push([d2, it]); }
      if (near.length > cap) { near.sort((a, b) => a[0] - b[0]); near.length = cap; }
      const cnt = new Array(f.ims.length).fill(0);
      for (const [, it] of near) { const im = f.ims[it.v]; im.setMatrixAt(cnt[it.v], it.m); if (it.c && im.instanceColor) im.setColorAt(cnt[it.v], it.c); cnt[it.v]++; }
      f.ims.forEach((im, v) => { im.count = cnt[v]; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; });
    }
  }
  // ---------- 발밑 풀밭 (걷기) ----------
  // 섬 전체에 풀을 촘촘히 깔면 수십만 포기라 → 걷는 사람 둘레 CARPET_R 안에만, 땅에 고정된 1m 격자 칸마다 몇 포기씩 깐다.
  // 사람이 1.5m 넘게 움직이면 다시 고른다(칸마다 결과는 저장). 가장자리는 서서히 작아져 풀밭이 끝나는 선이 안 보인다
  let carpet = null;
  const CARPET_R = 17, CARPET_K = window.matchMedia && matchMedia('(pointer: coarse)').matches ? 5 : 9;
  // 그 자리 풀 밀도 0~1: 땅 셰이더가 풀빛으로 칠하는 곳만 (모래·바위·물·정글 바닥·계곡·폭포 둘레 제외)
  function grassDensity(x, z) {
    if (!field) return 0;
    const h = groundAt(x, z);
    if (h < 0.45) return 0;
    const f = field.fall, c = field.crater;
    if (f && Math.hypot(x - f.cx, z - f.cz) < f.BR + 3.2) return 0;
    if (c && Math.hypot(x - c.x, z - c.z) < c.R + 1.2) return 0;
    if (fallCapQuery(x, z) || streamQuery(x, z) || walkableTop(x, z) !== null || riverQuery(x, z) !== null) return 0;
    const sl = Math.hypot(heightAt(x + 0.3, z) - heightAt(x - 0.3, z), heightAt(x, z + 0.3) - heightAt(x, z - 0.3)) / 0.6;
    if (sl > 0.95 || h > 15) return 0;
    const bn = biomeNoise(x, z), jungle = ss(0.5, 0.62, bn), meadow = ss(0.46, 0.36, bn);
    const patch = 0.3 + 0.7 * ss(0.22, 0.68, vnoise(x * 0.16, z * 0.16, seed + 181));
    return ss(0.45, 0.8, h) * ss(0.95, 0.6, sl) * (1 - ss(11, 15, h) * 0.8) * (0.62 + 0.38 * meadow - 0.45 * jungle) * patch;
  }
  function grassColor(x, z, j, out) {
    const bn = biomeNoise(x, z), jungle = ss(0.5, 0.62, bn), n = vnoise(x * 0.09, z * 0.09, seed + 171) * 0.7 + j * 0.3, k = 1 - jungle * 0.35;
    return out.setRGB((0.065 + n * 0.08) * k, (0.19 + n * 0.12) * k, (0.03 + n * 0.03) * k);
  }
  function buildCarpet() {
    const rl = RL();
    if (carpet) { carpet.ims.forEach((im) => scene.remove(im)); carpet = null; }
    if (!rl || !rl.grassVariants) return;
    const per = Math.ceil((Math.PI * (CARPET_R + 1) ** 2 * CARPET_K) / rl.grassVariants.length);
    const ims = rl.grassVariants.map((geo) => {
      const im = new T.InstancedMesh(geo, rl.mats.grass, per);
      im.setColorAt(0, new T.Color(1, 1, 1));
      im.count = 0; im.frustumCulled = false; im.receiveShadow = true; im.visible = false;
      scene.add(im);
      return im;
    });
    carpet = { ims, cx: 1e9, cz: 1e9, cells: new Map(), per };
  }
  function carpetCell(gx, gz) {
    const out = [];
    for (let k = 0; k < CARPET_K; k++) {
      const hx = hash(gx * 7 + k, gz * 13 - k, seed + 191), hz = hash(gx * 11 - k, gz * 5 + k, seed + 192), hk = hash(gx + k * 31, gz - k * 17, seed + 193);
      const x = gx + hx, z = gz + hz, d = grassDensity(x, z);
      if (hk > d) continue;
      const j = hash(gx - k, gz + k * 3, seed + 194);
      out.push({ x, z, y: groundAt(x, z) - 0.02, r: j * 6.28, w: 0.17 + hash(gx + k, gz, seed + 195) * 0.16, h: (0.055 + hash(gx, gz + k, seed + 196) * 0.075) * (0.7 + 0.6 * d), v: Math.floor(j * 3) % 3, c: grassColor(x, z, j, new T.Color()) });
    }
    return out;
  }
  function updateCarpet() {
    if (!carpet) return;
    const on = mode === 'walk';
    for (const im of carpet.ims) im.visible = on;
    if (!on) { carpet.cx = 1e9; return; }
    const px = player.x, pz = player.z;
    if (Math.hypot(px - carpet.cx, pz - carpet.cz) < 1.5) return;
    carpet.cx = px; carpet.cz = pz;
    if (carpet.cells.size > 12000) carpet.cells.clear();
    const R = CARPET_R, cnt = [0, 0, 0], m4 = new T.Matrix4(), q4 = new T.Quaternion(), v3 = new T.Vector3(), sc = new T.Vector3(), up = new T.Vector3(0, 1, 0);
    for (let gz = Math.floor(pz - R); gz <= Math.floor(pz + R); gz++)
      for (let gx = Math.floor(px - R); gx <= Math.floor(px + R); gx++) {
        if ((gx + 0.5 - px) ** 2 + (gz + 0.5 - pz) ** 2 > (R + 0.8) ** 2) continue;
        const key = gx * 100003 + gz;
        let cell = carpet.cells.get(key);
        if (!cell) { cell = carpetCell(gx, gz); carpet.cells.set(key, cell); }
        for (const t of cell) {
          const fd = ss(R, R - 5, Math.hypot(t.x - px, t.z - pz));
          if (fd < 0.03 || cnt[t.v] >= carpet.per) continue;
          m4.compose(v3.set(t.x, t.y, t.z), q4.setFromAxisAngle(up, t.r), sc.set(t.w * (0.5 + 0.5 * fd), t.h * fd, t.w * (0.5 + 0.5 * fd)));
          const im = carpet.ims[t.v];
          im.setMatrixAt(cnt[t.v], m4);
          im.setColorAt(cnt[t.v], t.c);
          cnt[t.v]++;
        }
      }
    carpet.ims.forEach((im, v) => { im.count = cnt[v]; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; });
  }
  function decorReal(L, rl) {
    const out = [], m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), sc = new T.Vector3(), col = new T.Color();
    const inst = (geo, mat, items, fn, shadow, tint) => {
      if (!items.length) return;
      const im = new T.InstancedMesh(geo, mat, items.length);
      items.forEach((it, i) => { fn(it); m4.compose(v, q, sc); im.setMatrixAt(i, m4); if (tint) im.setColorAt(i, tint(it, i)); });
      im.castShadow = shadow;
      im.receiveShadow = true;
      out.push(im);
    };
    const greenTint = (it, i) => col.setHSL(0.22 + hash(i, 3, seed) * 0.08, 0.2 + hash(i, 4, seed) * 0.2, 0.42 + hash(i, 5, seed) * 0.28);
    // 야자수: 줄기는 +x로 기울어 있으므로 r 방향으로 돌린다
    rl.palmVariants.forEach((pv, vi) => {
      const items = L.palm.filter((it) => it.v === vi);
      const place = (it) => { e.set(0, Math.atan2(-Math.cos(it.r), Math.sin(it.r)), 0); q.setFromEuler(e); v.set(it.x, it.y - 0.05, it.z); sc.setScalar(it.h); };
      inst(pv.trunk, rl.mats.palmBark || rl.mats.bark, items, place, true);
      inst(pv.leaves, rl.mats.frond, items, place, true, greenTint);
      if (pv.dead) inst(pv.dead, rl.mats.deadFrond, items, place, false);
      if (pv.nuts) inst(pv.nuts, rl.mats.nut, items, place, false);
    });
    // 넓은 잎 열대 나무
    rl.broadVariants.forEach((bv, vi) => {
      const items = L.broad.filter((it) => it.v % 3 === vi);
      const place = (it) => { e.set(0, it.r, 0); q.setFromEuler(e); v.set(it.x, it.y - 0.05, it.z); sc.setScalar(it.h); };
      inst(bv.trunk, rl.mats.bark, items, place, true);
      inst(bv.leaves, rl.mats.canopy, items, place, true, greenTint);
    });
    // 바나나
    rl.bananaVariants.forEach((bv, vi) => {
      const items = L.banana.filter((it) => it.v === vi);
      const place = (it) => { e.set(0, it.r, 0); q.setFromEuler(e); v.set(it.x, it.y - 0.03, it.z); sc.setScalar(it.h); };
      inst(bv.trunk, rl.mats.stem, items, place, true);
      inst(bv.leaves, rl.mats.banana, items, place, true, greenTint);
    });
    inst(rl.monsteraGeo, rl.mats.monstera, L.monstera, (it) => { e.set(0, it.r, 0); q.setFromEuler(e); v.set(it.x, it.y - 0.05, it.z); sc.setScalar(it.h); }, true, greenTint);
    // 바위 (실사 바위 텍스처, 납작하게)
    // 표류목: 바랜 회색 통나무 (한쪽이 갈라진 굵은 가지) / 조개: 작은 연분홍·흰 조각
    if (L.drift.length) {
      if (!rl.driftGeo) {
        const a = new T.CylinderGeometry(0.035, 0.055, 1, 7, 4); a.rotateZ(Math.PI / 2);
        const pa = a.attributes.position; for (let i = 0; i < pa.count; i++) pa.setY(i, pa.getY(i) + Math.sin(pa.getX(i) * 2.5) * 0.03);
        const b = new T.CylinderGeometry(0.015, 0.03, 0.4, 5); b.rotateZ(Math.PI / 2 - 0.7); b.translate(0.32, 0.1, 0.05);
        rl.driftGeo = I.real.merge([a.toNonIndexed(), b.toNonIndexed()]); rl.driftGeo.computeVertexNormals();
        rl.driftMat = new T.MeshStandardMaterial({ map: rl.tex.bark.diff, normalMap: rl.tex.bark.nor, color: '#b8b0a2', roughness: 0.95 });
      }
      inst(rl.driftGeo, rl.driftMat, L.drift, (it) => { e.set(0, it.r, (it.r % 0.3) - 0.15); q.setFromEuler(e); v.set(it.x, it.y + 0.02, it.z); sc.setScalar(it.s); }, true);
    }
    if (L.shell.length) {
      if (!rl.shellGeo) { rl.shellGeo = new T.SphereGeometry(1, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2); rl.shellGeo.scale(1, 0.45, 0.8); rl.shellMat = new T.MeshStandardMaterial({ color: '#f1ddd2', roughness: 0.5 }); }
      inst(rl.shellGeo, rl.shellMat, L.shell, (it) => { e.set(0, it.r, 0); q.setFromEuler(e); v.set(it.x, it.y - 0.005, it.z); sc.setScalar(it.s); }, false, (it, i) => col.setHSL(0.03 + hash(i, 7, seed) * 0.08, 0.3 + hash(i, 8, seed) * 0.3, 0.75 + hash(i, 9, seed) * 0.15));
    }
    inst(rl.rockGeo, rl.mats.rock, L.rock, (it) => { e.set(it.r * 0.3, it.r, it.r * 0.2); q.setFromEuler(e); v.set(it.x, it.y - it.s * 0.18, it.z); sc.set(it.s, it.s * 0.55, it.s * 0.85); }, true);
    // 고사리·풀: 변형 몇 가지를 섞고, 가까운 것만 그린다 (updateFernLod)
    lodSets = [];
    const lodSet = (variants, mat, items, place, tint, R, cap, capM) => {
      if (!items.length) return;
      const list = items.map((it, i) => { place(it); const vi = Math.floor(hash(i, 91, seed) * variants.length) % variants.length; return { x: it.x, z: it.z, v: vi, m: new T.Matrix4().compose(v, q, sc), c: tint ? tint(it, i).clone() : null }; });
      const ims = variants.map((geo, vi) => {
        const im = new T.InstancedMesh(geo, mat, Math.max(1, list.filter((it) => it.v === vi).length));
        if (tint) im.setColorAt(0, col.setRGB(1, 1, 1));
        im.count = 0; im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false;
        out.push(im);
        return im;
      });
      lodSets.push({ items: list, ims, at: new T.Vector3(1e9, 0, 0), R, cap, capM });
    };
    lodSet(rl.fernVariants, rl.mats.fern, L.fern, (it) => { e.set(0, it.r, 0); q.setFromEuler(e); v.set(it.x, it.y - 0.03, it.z); sc.setScalar(it.h * 0.95); },
      (it, i) => col.setRGB(0.86 + hash(i, 6, seed) * 0.22, 0.9 + hash(i, 7, seed) * 0.16, 0.78 + hash(i, 8, seed) * 0.14), 85, 1300, 520);
    // 풀빛은 그 자리 땅빛에 맞춘다 (초원은 밝은 연두, 숲·정글 바닥은 짙게) — 땅과 따로 노는 짙은 얼룩처럼 보이지 않게
    const grassTint = (it, i) => {
      const n = vnoise(it.x * 0.09, it.z * 0.09, seed + 171) * 0.7 + hash(i, 3, seed) * 0.3, bm = biome(it.x, it.z, it.y);
      const k = bm === 'jungle' ? 0.62 : bm === 'wood' ? 0.8 : bm === 'highland' ? 0.9 : 1;
      return col.setRGB((0.065 + n * 0.08) * k, (0.19 + n * 0.12) * k, (0.03 + n * 0.03) * k);
    };
    lodSet(rl.grassVariants, rl.mats.grass, L.grass, (it) => { e.set(0, it.r, 0); q.setFromEuler(e); v.set(it.x, it.y - 0.025, it.z); sc.set(it.w, it.h, it.w); }, grassTint, 125, 9000, 4000);
    return out;
  }

  // 실사 에셋을 못 불러왔을 때: 단순한 도형
  function decorFallback(L) {
    const out = [], m4 = new T.Matrix4(), q = new T.Quaternion(), v = new T.Vector3(), sc = new T.Vector3();
    if (!L.palm.length) return out;
    const im = new T.InstancedMesh(new T.ConeGeometry(0.25, 1, 6).translate(0, 0.6, 0), new T.MeshStandardMaterial({ color: '#3f8f50' }), L.palm.length);
    L.palm.forEach((it, i) => { m4.compose(v.set(it.x, it.y, it.z), q.identity(), sc.setScalar(it.h)); im.setMatrixAt(i, m4); });
    im.castShadow = true;
    out.push(im);
    return out;
  }

  // ---------- 랜드마크: 등대·수상 방갈로·배 ----------
  const lmat = (hex, extra) => new T.MeshStandardMaterial({ color: hex, flatShading: true, roughness: 0.8, ...(extra || {}) });
  // 생존자 무리의 A자 천막: 바랜 캔버스 천 + 무리 색은 용마루 띠와 작은 깃발에만
  const tentCache = new Map();
  function canvasTent(color, rl) {
    let mats = tentCache.get(color);
    if (!mats) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const g = cv.getContext('2d');
      g.fillStyle = '#b9a988'; g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '60,45,25' : '255,250,235'},${Math.random() * 0.07})`; g.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 3, 1); }
      g.fillStyle = 'rgba(70,55,35,0.25)'; for (let y = 0; y < 128; y += 16) g.fillRect(0, y, 128, 1); // 박음질 선
      const grad = g.createLinearGradient(0, 0, 0, 128); grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(1, 'rgba(60,40,20,0.35)'); g.fillStyle = grad; g.fillRect(0, 0, 128, 128); // 아래쪽 흙때
      const tex = new T.CanvasTexture(cv); tex.encoding = T.sRGBEncoding;
      mats = {
        cloth: new T.MeshStandardMaterial({ map: tex, side: T.DoubleSide, roughness: 0.95 }),
        band: new T.MeshStandardMaterial({ color: new T.Color(color).lerp(new T.Color('#3a3025'), 0.25), side: T.DoubleSide, roughness: 0.9 }),
        dark: new T.MeshStandardMaterial({ color: '#1d1a15', side: T.DoubleSide, roughness: 1 }),
        wood: rl ? rl.mats.deck : new T.MeshStandardMaterial({ color: '#7a5a3a', roughness: 0.9 }),
      };
      tentCache.set(color, mats);
    }
    const grp = new T.Group(), L = 0.95, W = 0.78, H = 0.52, SEG = 8; // 2인용 천막 (그룹 1.4배 → 사람 키의 약 1.6배)
    // 지붕 두 면: 가운데가 살짝 처진 천
    const roof = new T.BufferGeometry(), pos = [], uv = [], idx = [];
    for (const sd of [-1, 1]) {
      const base = pos.length / 3;
      for (let j = 0; j <= SEG; j++)
        for (let i = 0; i <= 1; i++) {
          const x = (j / SEG - 0.5) * L, t = i, sag = Math.sin((j / SEG) * Math.PI) * 0.05 * (1 - Math.abs(t - 0.5) * 2) ;
          pos.push(x, H * (1 - t) - sag, sd * (W / 2) * t);
          uv.push(j / SEG, t);
          if (j < SEG && i === 0) { const a = base + j * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        }
    }
    roof.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    roof.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    roof.setIndex(idx);
    roof.computeVertexNormals();
    const r = new T.Mesh(roof, mats.cloth); r.castShadow = true; r.receiveShadow = true; grp.add(r);
    // 뒤 삼각 벽 + 앞은 한쪽 자락을 걷어 올린 문 (안쪽은 어둡게)
    const tri = (pts, mat) => { const gg = new T.BufferGeometry(); gg.setAttribute('position', new T.Float32BufferAttribute(pts, 3)); gg.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1].slice(0, (pts.length / 3) * 2), 2)); gg.computeVertexNormals(); const m = new T.Mesh(gg, mat); m.castShadow = true; grp.add(m); return m; };
    tri([-L / 2, 0, -W / 2, -L / 2, 0, W / 2, -L / 2, H, 0], mats.cloth);
    tri([L / 2 - 0.01, 0, -W / 2 + 0.02, L / 2 - 0.01, 0, W / 2 - 0.02, L / 2 - 0.01, H - 0.02, 0], mats.dark);
    tri([L / 2, 0, -W / 2, L / 2, 0, 0.05, L / 2, H, 0], mats.cloth);
    tri([L / 2, 0, 0.05, L / 2 + 0.28, 0.12, W / 2 * 0.9, L / 2, H, 0], mats.cloth); // 걷어 올린 자락
    // 무리 색 용마루 띠 + 지지대 + 작은 깃발
    const band = part(grp, new T.BoxGeometry(L + 0.06, 0.04, 0.09), mats.band, 0, H + 0.005, 0);
    band.castShadow = false;
    part(grp, new T.CylinderGeometry(0.018, 0.022, H + 0.25, 6), mats.wood, L / 2 + 0.04, (H + 0.25) / 2, 0);
    part(grp, new T.CylinderGeometry(0.018, 0.022, H + 0.08, 6), mats.wood, -L / 2 - 0.04, (H + 0.08) / 2, 0);
    const pen = part(grp, new T.PlaneGeometry(0.22, 0.14), mats.band, L / 2 + 0.15, H + 0.18, 0);
    pen.rotation.y = Math.PI / 2;
    // 앞에 나무 상자 하나
    const crate = part(grp, new T.BoxGeometry(0.18, 0.14, 0.18), mats.wood, L / 2 + 0.3, 0.07, -0.24);
    crate.rotation.y = 0.4;
    return mergeByMaterial(grp);
  }

  // 같은 재질 부품을 메시 하나로 합친다 (오두막 하나가 부품 31개 → 지도에서 그리기 호출이 프레임마다 천 번 넘게 나왔다)
  // 그림자 받기·드리우기는 부품 중 하나라도 켜져 있으면 켠다. 스프라이트(등불 빛)는 그대로 둔다
  function mergeByMaterial(grp) {
    grp.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(grp.matrixWorld).invert(), buckets = new Map(), olds = [];
    grp.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.userData.noMerge) return;
      const b = buckets.get(o.material) || { geos: [], cast: false, recv: false };
      const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(new T.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      b.geos.push(g); b.cast = b.cast || o.castShadow; b.recv = b.recv || o.receiveShadow;
      buckets.set(o.material, b);
      olds.push(o);
    });
    for (const o of olds) o.parent.remove(o);
    for (const [mat, b] of buckets) {
      const m = new T.Mesh(I.real.merge(b.geos), mat);
      m.castShadow = b.cast; m.receiveShadow = b.recv;
      grp.add(m);
    }
    return grp;
  }
  function part(grp, geo, mat, x, y, z) {
    const m = new T.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    grp.add(m);
    return m;
  }

  // 소품 윗면이 top 높이에 오도록 세운다
  function setTop(obj, key, top) {
    const p = I.assets.lib.props[key];
    obj.position.y = top - p.h * obj.children[0].scale.y;
  }

  // 걸어갈 수 있는 데크 (1인칭)
  function addWalkable(x, z, yaw, hw, hd, top) { walkables.push({ x, z, c: Math.cos(yaw), s: Math.sin(yaw), hw, hd, top }); }
  function walkableTop(x, z) {
    let best = null;
    for (const w of walkables) {
      const dx = x - w.x, dz = z - w.z;
      const lx = dx * w.c - dz * w.s, lz = dx * w.s + dz * w.c;
      if (Math.abs(lx) <= w.hw && Math.abs(lz) <= w.hd) best = best === null ? w.top : Math.max(best, w.top);
    }
    return best;
  }

  // 짚지붕 오두막 (데크 위·땅 위 공용). 폭 약 2.2
  // 생존자의 오두막: 짧은 기둥 위 마루 + 툇마루·계단 + 처마 깊은 A자 초가지붕 + 밤에 켜지는 등불
  const hutLamps = [];
  function hut() {
    const rl = RL(), g = new T.Group();
    if (!rl) return g;
    const M = rl.mats, box = (w, h, d, mat, x, y, z) => part(g, new T.BoxGeometry(w, h, d), mat, x, y, z);
    const FL = 0.34; // 마루 높이
    box(2.0, 0.08, 2.3, M.deck, 0, FL, 0.2);
    for (const [x, z] of [[-0.92, -0.9], [0.92, -0.9], [-0.92, 0.3], [0.92, 0.3], [-0.92, 1.28], [0.92, 1.28]]) part(g, new T.CylinderGeometry(0.05, 0.06, FL + 0.25, 7), M.deck, x, (FL - 0.25) / 2, z);
    // 계단
    box(0.62, 0.06, 0.24, M.deck, 0, FL * 0.62, 1.48);
    box(0.62, 0.06, 0.24, M.deck, 0, FL * 0.28, 1.7);
    // 벽 (대나무 엮은 벽), 문, 창과 덧문
    box(1.6, 0.86, 1.25, M.wall, 0, FL + 0.47, -0.3);
    box(0.36, 0.62, 0.04, M.dark, 0.25, FL + 0.35, 0.33);
    box(0.3, 0.24, 0.04, M.dark, -0.42, FL + 0.56, 0.33);
    const sh = box(0.16, 0.26, 0.03, M.deck, -0.66, FL + 0.56, 0.36); sh.rotation.y = 0.5;
    // 툇마루 난간
    for (const x of [-0.96, 0.96]) box(0.05, 0.05, 1.0, M.deck, x, FL + 0.36, 0.85);
    for (const [x, z] of [[-0.96, 1.33], [0.96, 1.33], [-0.96, 0.4], [0.96, 0.4]]) box(0.05, 0.4, 0.05, M.deck, x, FL + 0.2, z);
    // A자 초가지붕: 두 장의 두툼한 지붕면 + 앞뒤 박공 + 용마루 통나무
    const RY = FL + 0.9, RISE = 0.62, HALF = 1.05, SLOPE = Math.atan2(RISE, HALF), LEN = Math.hypot(RISE, HALF) + 0.18;
    for (const sd of [-1, 1]) {
      const r = part(g, new T.BoxGeometry(2.3, 0.1, LEN), M.thatch, sd * (HALF / 2), RY + RISE / 2, -0.12);
      r.rotation.order = 'YXZ'; // 용마루는 앞뒤(z), 지붕면은 양옆(x)으로 내려간다
      r.rotation.set(sd * SLOPE, Math.PI / 2, 0);
    }
    for (const z of [-0.95, 0.72]) {
      const gg = new T.BufferGeometry();
      gg.setAttribute('position', new T.Float32BufferAttribute([-HALF + 0.12, RY, z, HALF - 0.12, RY, z, 0, RY + RISE - 0.06, z], 3));
      gg.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
      gg.computeVertexNormals();
      const tri = new T.Mesh(gg, M.wall); tri.material = M.wall; tri.castShadow = true; tri.receiveShadow = true;
      g.add(tri);
    }
    const ridge = part(g, new T.CylinderGeometry(0.06, 0.06, 2.4, 7), M.deck, 0, RY + RISE + 0.02, -0.12);
    ridge.rotation.x = Math.PI / 2;
    // 등불: 처마 끝에 매달린 작은 등 (밤에 빛난다)
    const lampMat = new T.MeshStandardMaterial({ color: '#ffcc77', emissive: '#ffb347', emissiveIntensity: 0.2, roughness: 0.6 });
    const lamp = part(g, new T.BoxGeometry(0.1, 0.13, 0.1), lampMat, 0.78, FL + 0.95, 1.12);
    const glow = new T.Sprite(new T.SpriteMaterial({ map: GLOW_TEX || (GLOW_TEX = glowTexture()), blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    glow.position.copy(lamp.position);
    glow.scale.set(1.4, 1.4, 1);
    g.add(glow);
    hutLamps.push({ mat: lampMat, glow });
    return mergeByMaterial(g);
  }

  function buildLandmarks() {
    const grp = new T.Group();
    walkables = [];
    bobbers = [];
    const beaches = plots.filter((p) => p.terrain === 'beach');
    const far = (p) => { const c = cellCenter(p); return Math.hypot(c.x, c.z); };
    const ang = (p) => { const c = cellCenter(p); return Math.atan2(c.x, c.z); };
    const rl = RL();

    const lp = null;
    if (!rl) return grp;

    const la = lp ? ang(lp) : 0;

    // 먼바다의 구조선 (Poly Haven 범선 스캔)
    if (rl.ship) {
      const ship = rl.ship.clone(true);
      const box = new T.Box3().setFromObject(ship), k = 9 / (box.max.y - box.min.y);
      ship.scale.setScalar(k);
      ship.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.layers.enable(DEPTH_LAYER); } });
      const w = new T.Group();
      ship.position.y = -box.min.y * k - 1.0;
      w.add(ship);
      const a = la + 2.2, r = 170;
      w.position.set(Math.sin(a) * r, 0, Math.cos(a) * r);
      w.rotation.y = a + Math.PI / 2;
      grp.add(w);
      // 헤엄쳐 선체를 통과하거나 카메라가 배 속에 들어가지 않게: 선체 길이 방향으로 충돌 원
      {
        const lx = (box.max.x - box.min.x) * k, lz = (box.max.z - box.min.z) * k, cxl = ((box.max.x + box.min.x) / 2) * k, czl = ((box.max.z + box.min.z) / 2) * k;
        const th = w.rotation.y, c = Math.cos(th), sn = Math.sin(th);
        const toW = (u, v) => [w.position.x + u * c + v * sn, w.position.z - u * sn + v * c];
        const long = lx >= lz, L = Math.max(lx, lz), Rr = Math.min(lx, lz) * 0.42, n = Math.max(2, Math.ceil(L / (Rr * 1.4)));
        for (let i = 0; i < n; i++) {
          const t = -L / 2 + Rr + ((L - 2 * Rr) * i) / (n - 1);
          const [x, z] = long ? toW(cxl + t, czl) : toW(cxl, czl + t);
          trunks.push({ x, z, r: Rr, ship: true });
        }
      }
      bobbers.push({ o: w, y: 0, ph: 0, roll: 0.025 });
    }
    return grp;
  }

  // ---------- 깃발 + 주인의 집 ----------
  let GLOW_TEX = null;
  function glowTexture() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0, 'rgba(255,230,140,1)');
    rg.addColorStop(0.35, 'rgba(255,200,80,0.45)');
    rg.addColorStop(1, 'rgba(255,190,60,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
    return new T.CanvasTexture(cv);
  }

  // 카메라 코앞의 가는 물체(깃대 등)는 성기게 지운다: 화면을 세로로 가르는 굵은 기둥처럼 보이지 않게
  function nearFade(mat, r0 = 0.5, r1 = 1.7) {
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
        { float cdist = length(vViewPosition), dth = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
          if (cdist < ${r1.toFixed(2)} && dth > (cdist - ${r0.toFixed(2)}) / ${(r1 - r0).toFixed(2)}) discard; }`);
    };
    return mat;
  }
  function makeFlag(p) {
    const color = ownerColor(p.owner);
    const grp = new T.Group();
    const cc = cellCenter(p), SC = 1.4, base = heightAt(cc.x, cc.z);
    grp.position.set(cc.x, base - 0.05, cc.z);
    // 그룹 좌표(1.4배) 기준 지점의 실제 바닥·물 (폭포 위 바위턱은 메시 높이, 웅덩이는 물로 친다)
    const gAt = (lx, lz) => waterState(cc.x + lx * SC, cc.z + lz * SC);
    const slopeAt = (lx, lz) => Math.abs(gAt(lx + 0.3, lz).ground - gAt(lx - 0.3, lz).ground) + Math.abs(gAt(lx, lz + 0.3).ground - gAt(lx, lz - 0.3).ground);
    // 깃발: 가운데에서 가까운 마른 평지 (웅덩이·개울 한가운데에 꽂히지 않게)
    let fx = 0, fz = 0;
    const FR = (LOT / 2 - 0.45) / SC; // 구획 안쪽 범위 (그룹 좌표)
    {
      // 벌점: 물속이면 null. 절벽 끝·물가 바로 옆·폭포 턱 근처는 벌점 (0이면 안심 자리)
      const lipAt = field.fall ? [field.fall.x, field.fall.z] : null;
      const judge = (lx, lz) => {
        const w = gAt(lx, lz);
        if (w.depth > 0.03 || w.ground < 0.12) return null;
        let edge = 0, wet = 0;
        for (const [u, v] of [[0.65, 0], [-0.65, 0], [0, 0.65], [0, -0.65]]) { const n = gAt(lx + u, lz + v); edge = Math.max(edge, w.ground - n.ground); if (n.depth > 0.03) wet = 1; }
        const lip = lipAt ? Math.max(0, 4.5 - Math.hypot(cc.x + lx * SC - lipAt[0], cc.z + lz * SC - lipAt[1])) : 0;
        return Math.min(3, Math.max(0, edge - 0.7) * 2) + wet * 1.5 + lip * 1.5;
      };
      const cand = [];
      for (let k = 0; k < 33; k++) {
        const r = k === 0 ? 0 : (0.55 + Math.floor((k - 1) / 8) * 0.65) / LS, a = (((k - 1) % 8) / 8) * 6.283 + 0.3 + r;
        const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
        if (judge(lx, lz) === 0) cand.push([lx, lz, r * 0.35]);
      }
      // 가운데가 통째로 물·절벽(폭포 웅덩이 칸 등)이면 땅 전체를 훑어 벌점이 가장 적은 자리
      if (!cand.length)
        for (let lz = -FR; lz <= FR + 0.01; lz += 0.25)
          for (let lx = -FR; lx <= FR + 0.01; lx += 0.25) { const pen = judge(lx, lz); if (pen !== null) cand.push([lx, lz, Math.hypot(lx, lz) * 0.1 + pen]); }
      cand.sort((a, b) => a[2] - b[2]);
      let best = Infinity;
      for (const [lx, lz, key] of cand.slice(0, 10)) {
        const score = key + Math.min(2.5, slopeAt(lx, lz) * 2);
        if (score < best) { best = score; fx = lx; fz = lz; }
      }
    }
    const fy = (gAt(fx, fz).ground - base) / SC;
    const pole = new T.Mesh(new T.CylinderGeometry(0.035, 0.04, 1.5, 6).translate(0, 0.75, 0), nearFade(new T.MeshStandardMaterial({ color: '#efe8d8', roughness: 0.6 })));
    pole.castShadow = true;
    const cap = new T.Mesh(new T.SphereGeometry(0.07, 8, 6), nearFade(new T.MeshStandardMaterial({ color: '#ffd34d', metalness: 0.6, roughness: 0.3 })));
    cap.position.set(fx, fy + 1.52, fz);
    pole.position.set(fx, fy, fz);
    const geo = new T.PlaneGeometry(0.72, 0.44, 10, 2).translate(0.36, 0, 0);
    const open = I.guard && I.guard.status(p, Date.now()) === 'open';
    const flagCol = open ? new T.Color(color).multiplyScalar(0.45) : new T.Color(color);
    const flag = new T.Mesh(geo, nearFade(new T.MeshStandardMaterial({ color: flagCol, emissive: flagCol, emissiveIntensity: open ? 0 : 0.25, side: T.DoubleSide, roughness: 0.9 })));
    flag.position.set(fx, fy + (open ? 0.7 : 1.24), fz); // 무방비: 반쯤 내린 깃발
    flag.castShadow = true;
    flag.userData.base = Float32Array.from(geo.attributes.position.array);
    grp.add(pole, cap, flag);
    grp.userData = { flag, phase: p.id * 0.7, born: clock.elapsedTime };
    // 내 땅엔 짚지붕 오두막, 다른 무리 땅엔 그들 색의 천막
    // 자리: 깃발 곁 고리 + 땅 전체 격자에서 가장 평평하고 마른, 나무 줄기·이웃 집과 겹치지 않는 곳
    // (예전엔 깃발 곁만 봐서 비탈에 반쯤 묻히거나 나무가 천막을 뚫고 나왔다)
    const mine = p.owner === 'me';
    const FOOT_BIG = [[0, 0], [0.8, 0], [-0.8, 0], [0, 0.9], [0, -0.9], [0.75, 0.85], [-0.75, 0.85], [0.75, -0.85], [-0.75, -0.85]];
    const FOOT_SMALL = [[0, 0], [0.55, 0], [-0.55, 0], [0, 0.6], [0, -0.6]];
    // wet: 물가 얕은 물 위에 기둥을 박아 세우는 수상 오두막 (땅이 거의 다 물인 폭포 웅덩이 칸). 물 위 발자리는 수면 0.3 위를 바닥으로 친다
    const fallImp = field.fall ? [field.fall.cx - field.fall.fx * 2.5, field.fall.cz - field.fall.fz * 2.5] : null;
    const findSpot = (foot, rh, wet) => {
      const best = { score: Infinity, range: Infinity, x: fx - 1.4, z: fz + 1.0 };
      const clearOf = (ax, az) => { const wx = cc.x + ax * SC, wz = cc.z + az * SC; return trunks.every((t) => (wx - t.x) ** 2 + (wz - t.z) ** 2 > (t.r + rh) ** 2); };
      const tryAt = (ax, az) => {
        if (Math.abs(ax) > FR || Math.abs(az) > FR) return;
        const df = Math.hypot(ax - fx, az - fz);
        if (df < 0.95) return; // 깃대와 겹치지 않게
        const ws = foot.map(([u, v]) => gAt(ax + u, az + v));
        if (wet) {
          if (ws.some((w) => w.depth > 1.1 || (w.depth <= 0.03 && w.ground < 0.12))) return;
          if (fallImp && Math.hypot(cc.x + ax * SC - fallImp[0], cc.z + az * SC - fallImp[1]) < 4.6) return; // 폭포 떨어지는 자리·물보라 속은 피한다
        } else if (ws.some((w) => w.depth > 0.03 || w.ground < 0.12)) return;
        const hs = ws.map((w) => (w.depth > 0.03 ? w.level + 0.3 : w.ground)), range = Math.max(...hs) - Math.min(...hs), clear = clearOf(ax, az);
        const inWater = ws.filter((w) => w.depth > 0.03).length;
        // 물 위: 얕은 물가일수록, 폭포 정면(첫 화면 카메라와 폭포 사이)에서 옆으로 비켜날수록 좋다
        const side = wet && field.fall ? Math.abs((cc.x + ax * SC - field.fall.cx) * -field.fall.fz + (cc.z + az * SC - field.fall.cz) * field.fall.fx) : 9;
        const score = range + (clear ? 0 : 6) + Math.abs(df - 1.25) * 0.06 + (wet ? ws.reduce((a, w) => a + Math.max(0, w.depth), 0) * 0.15 + Math.max(0, 5 - side) * 0.35 : 0);
        if (score < best.score) Object.assign(best, { score, range: range + (clear ? 0 : 9), x: ax, z: az, wet: wet && inWater > 0 });
      };
      for (let k = 0; k < 24; k++) { const a = (k / 12) * 6.283 + 0.4, r = k < 12 ? 1.05 : 1.4; tryAt(fx + Math.cos(a) * r, fz + Math.sin(a) * r); }
      for (let az = -FR; az <= FR + 0.01; az += 0.3) for (let ax = -FR; ax <= FR + 0.01; ax += 0.3) tryAt(ax, az);
      return best;
    };
    // 오두막은 기둥(고상식)이라 산비탈에서도 2.3m까지 세운다. 그래도 자리가 없으면(폭포 웅덩이 칸 등) 작은 오두막.
    // 천막은 땅에 바로 앉으니 0.5m까지. 나무와 겹치면 둘 다 안 세운다
    let FOOT = mine ? FOOT_BIG : FOOT_SMALL, spot = findSpot(FOOT, mine ? 1.3 : 0.9), hutK = 0.8;
    if (mine && !(spot.range < 2.3)) {
      const s2 = findSpot(FOOT_SMALL, 0.9);
      if (s2.range < 1.4) { spot = s2; FOOT = FOOT_SMALL; hutK = 0.55; }
      else { const s3 = findSpot(FOOT_BIG, 1.3, true); if (s3.range < 1.2) { spot = s3; hutK = 0.7; } } // 그래도 없으면 물가에 수상 오두막
    }
    const hx = spot.x, hz = spot.z, bestR = spot.range;
    const tentOK = bestR < (mine ? 2.3 : 0.5);
    const hw = (ax, az) => { const w = gAt(hx + ax, hz + az); return w.depth > 0.03 ? w.level + 0.3 : w.ground; };
    const footY = FOOT.map(([u, v]) => hw(u, v));
    // 오두막: 발자리에서 가장 높은 땅에 마루를 얹는다(땅이 바닥을 뚫지 않게) / 천막: 가운데와 가장 낮은 곳 사이
    const hy = ((mine ? Math.max(...footY) : (footY[0] * 2 + Math.min(...footY)) / 3) - base) / SC; // 그룹 좌표(1.4배 축소) 기준
    const rl = RL();
    if (mine) {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: GLOW_TEX, blending: T.AdditiveBlending, depthWrite: false, transparent: true }));
      sp.scale.set(2.6, 2.6, 1);
      sp.position.set(fx, fy + 1.0, fz);
      grp.add(sp);
      grp.userData.glow = sp;
      const h = rl && tentOK ? hut() : null;
      if (h) {
        h.position.set(hx, hy - 0.02, hz); h.rotation.y = p.id; h.scale.setScalar(hutK); grp.add(h);
        // 비탈: 기둥마다 땅까지 이어지는 받침 기둥 (마루 기둥이 허공에 뜨지 않게)
        const cr = Math.cos(p.id), sr = Math.sin(p.id), stilts = [];
        for (const [px, pz] of [[-0.92, -0.9], [0.92, -0.9], [-0.92, 0.3], [0.92, 0.3], [-0.92, 1.28], [0.92, 1.28], [0, 1.7]]) {
          const gx = hx + (px * cr + pz * sr) * hutK, gz = hz + (-px * sr + pz * cr) * hutK;
          const gy = (gAt(gx, gz).ground - base) / SC, top = hy - 0.02 - 0.2 * hutK;
          if (top - gy < 0.04) continue;
          const len = top - gy + 0.08, th = (len > 0.8 ? 0.05 : 0.038) * hutK / 0.8, c = new T.CylinderGeometry(th, th * 1.25, len, 6);
          c.translate(gx, gy - 0.06 + len / 2, gz);
          stilts.push(c);
        }
        if (stilts.length) { const m = new T.Mesh(I.real.merge(stilts), rl.mats.deck); m.castShadow = true; m.receiveShadow = true; grp.add(m); }
      }
    } else if (tentOK) {
      const tent = canvasTent(color, rl);
      tent.position.set(hx, hy, hz);
      tent.rotation.y = p.id * 1.7;
      grp.add(tent);
    }
    if (tentOK) trunks.push({ x: cc.x + hx * SC, z: cc.z + hz * SC, r: mine ? (hutK < 0.8 ? 0.85 : 1.15) : 0.8, flag: p.id, top: Math.max(...footY) + (mine ? 2.3 * hutK / 0.8 : 0.95) });
    // 방어 건물 (그룹은 1.4배로 커지므로 그만큼 나눠서 배치)
    const bs = p.buildings || [];
    if (rl && bs.includes('fence')) grp.add(fence(cc, rl));
    if (rl && bs.includes('tower')) {
      const tw = tower(rl);
      // 네 모서리 중 마른 곳
      const [tx, tz] = [[1.25, -1.25], [-1.25, -1.25], [1.25, 1.25], [-1.25, 1.25]].find(([u, v]) => gAt(u, v).depth < 0.03 && Math.hypot(u - hx, v - hz) > 1.4) || [1.25, -1.25];
      tw.position.set(tx, (gAt(tx, tz).ground - base) / SC, tz);
      grp.add(tw);
      trunks.push({ x: cc.x + tx * 1.4, z: cc.z + tz * 1.4, r: 0.7, flag: p.id });
    }
    // 세입자 천막: 주인 집 둘레 빈 평지에 (많아도 4동까지만 그린다 — 인원이 많으면 문명 단계 건물이 맡는다)
    const nt = rl ? Math.min(4, p.tenants || 0) : 0;
    for (let k = 0; k < nt; k++) {
      const ts = findSpot(FOOT_SMALL, 0.75);
      if (!(ts.range < 0.45)) break;
      const tt = canvasTent('#d9cfb8', rl), tw0 = FOOT_SMALL.map(([u, v]) => gAt(ts.x + u, ts.z + v).ground);
      tt.position.set(ts.x, ((tw0[0] * 2 + Math.min(...tw0)) / 3 - base) / SC, ts.z);
      tt.rotation.y = p.id * 2.3 + k * 1.9;
      tt.scale.setScalar(0.85);
      grp.add(tt);
      trunks.push({ x: cc.x + ts.x * SC, z: cc.z + ts.z * SC, r: 0.7, flag: p.id, top: Math.max(...tw0) + 0.85 });
    }
    trunks.push({ x: cc.x + fx * SC + 0.06, z: cc.z + fz * SC, r: 0.08, flag: p.id });
    grp.userData.scale = 1.4;
    grp.userData.spot = { x: cc.x + fx * SC, z: cc.z + fz * SC, hx: cc.x + hx * SC, hz: cc.z + hz * SC, house: tentOK };
    grp.scale.setScalar(0.01);
    return grp;
  }

  // 목책 울타리: 땅 둘레를 따라 말뚝과 가로대 (깃발 그룹 좌표, 1.4배 스케일 보정)
  function fence(cc, rl) {
    const g = new T.Group(), half = (LOT / 2 - 0.2) / 1.4, k = 1 / 1.4, geos = [];
    const base = heightAt(cc.x, cc.z);
    const post = (x, z) => {
      const y = (heightAt(cc.x + x * 1.4, cc.z + z * 1.4) - base) * k;
      const b = new T.CylinderGeometry(0.045, 0.055, 0.62, 6);
      b.translate(x, y + 0.26, z);
      geos.push(b);
      return y;
    };
    for (const [ax, az, bx, bz] of [[-half, -half, half, -half], [half, -half, half, half], [half, half, -half, half], [-half, half, -half, -half]]) {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
        const y0 = post(x0, z0), y1 = post(x1, z1);
        for (const hgt of [0.22, 0.42]) {
          const len = Math.hypot(x1 - x0, z1 - z0);
          const r = new T.BoxGeometry(0.035, 0.05, len);
          r.rotateY(Math.atan2(x1 - x0, z1 - z0));
          r.translate((x0 + x1) / 2, (y0 + y1) / 2 + hgt, (z0 + z1) / 2);
          geos.push(r);
        }
      }
    }
    const m = new T.Mesh(I.real.merge(geos), rl.mats.bark);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return g;
  }

  // 망루: 네 다리 위 판자 바닥과 짚지붕
  function tower(rl) {
    const g = new T.Group(), H = 1.5;
    for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) part(g, new T.CylinderGeometry(0.04, 0.05, H, 6), rl.mats.bark, x, H / 2, z);
    for (const y of [0.45, 0.95]) {
      part(g, new T.BoxGeometry(0.7, 0.03, 0.03), rl.mats.bark, 0, y, -0.3).rotation.z = 0.5;
      part(g, new T.BoxGeometry(0.7, 0.03, 0.03), rl.mats.bark, 0, y, 0.3).rotation.z = -0.5;
    }
    part(g, new T.BoxGeometry(0.85, 0.06, 0.85), rl.mats.deck, 0, H, 0);
    for (const [x, z, w, d] of [[0, -0.41, 0.85, 0.03], [0, 0.41, 0.85, 0.03], [-0.41, 0, 0.03, 0.85], [0.41, 0, 0.03, 0.85]]) part(g, new T.BoxGeometry(w, 0.22, d), rl.mats.deck, x, H + 0.14, z);
    for (const [x, z] of [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]]) part(g, new T.CylinderGeometry(0.025, 0.025, 0.55, 5), rl.mats.bark, x, H + 0.3, z);
    const roof = part(g, new T.ConeGeometry(0.72, 0.5, 4, 1, true), rl.mats.thatch, 0, H + 0.8, 0);
    roof.rotation.y = Math.PI / 4;
    const torch = new T.Sprite(new T.SpriteMaterial({ map: GLOW_TEX, blending: T.AdditiveBlending, depthWrite: false, transparent: true, color: '#ffb85a' }));
    torch.scale.set(0.9, 0.9, 1);
    torch.position.set(0, H + 0.35, 0);
    g.add(torch);
    return mergeByMaterial(g);
  }

  // ---------- 토큰 반짝임 ----------
  function buildSparks() {
    const pts = [], phase = [];
    for (const p of plots) {
      if (p.owner || p.signal < 3) continue;
      const cc = cellCenter(p);
      for (let k = 0; k < p.signal - 2; k++) {
        const x = cc.x + (hash(p.id, k + 50, seed) - 0.5) * LOT * 0.7, z = cc.z + (hash(p.id, k + 60, seed) - 0.5) * LOT * 0.7;
        pts.push(x, heightAt(x, z) + 0.5 + hash(p.id, k + 70, seed) * 0.9, z);
        phase.push(hash(p.id, k + 80, seed) * 6.28);
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
    geo.setAttribute('aPhase', new T.Float32BufferAttribute(phase, 1));
    const pt = new T.Points(geo, sparkMat);
    pt.frustumCulled = false;
    return pt;
  }

  // ---------- 셰이더 재료 ----------
  function makeMaterials() {
    skyMat = new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false,
      uniforms: { uTop: { value: new T.Color() }, uMid: { value: new T.Color() }, uHor: { value: new T.Color() }, uSun: { value: new T.Color() }, uSunDir: { value: new T.Vector3() } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uTop,uMid,uHor,uSun; uniform vec3 uSunDir; varying vec3 vDir;
        void main(){ float y = vDir.y;
          vec3 c = mix(uHor, uMid, smoothstep(0.0, 0.22, y));
          c = mix(c, uTop, smoothstep(0.22, 0.85, y));
          if (y < 0.0) c = uHor; // 바다 끝(안개색)과 같아야 수평선 아래 띠가 안 보인다
          float s = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
          c += uSun * (pow(s, 6.0) * 0.35 + pow(s, 90.0) * 0.7 + pow(s, 900.0) * 2.0);
          gl_FragColor = vec4(c, 1.0);
          #include <encodings_fragment>
        }`,
    });

    waterMat = new T.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        uTime: { value: 0 }, uDeep: { value: new T.Color() }, uSea2: { value: new T.Color() }, uShallow: { value: new T.Color() }, uSun: { value: new T.Color() },
        uSunDir: { value: new T.Vector3() }, uHor: { value: new T.Color() },
        uLand: { value: null }, uLandOrigin: { value: new T.Vector2(ORIGIN, ORIGIN) }, uLandSize: { value: SIZE },
        uNormals: { value: null }, uTop: { value: new T.Color() }, uMid: { value: new T.Color() }, uPollR: { value: POLLUTION_R },
        ...DU,
      },
      vertexShader: `uniform float uTime; varying vec3 vW;
        void main(){ vec4 wp = modelMatrix * vec4(position, 1.0);
          wp.y += sin(wp.x * 0.3 + uTime * 1.0) * 0.03 + cos(wp.z * 0.37 + uTime * 0.8) * 0.03;
          // 너울: 해변을 천천히 오르내리며 밀려왔다 빠진다
          wp.y += sin(dot(wp.xz, vec2(0.6, 0.8)) * 0.18 - uTime * 0.9) * 0.08 + sin(dot(wp.xz, vec2(-0.7, 0.7)) * 0.27 - uTime * 1.15) * 0.045;
          vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform float uTime, uPollR; uniform vec3 uDeep,uSea2,uShallow,uSun,uHor,uTop,uMid; uniform vec3 uSunDir;
        uniform sampler2D uLand, uNormals; uniform vec2 uLandOrigin; uniform float uLandSize; varying vec3 vW;
        ${DEPTH_GLSL}
        vec3 skyCol(vec3 d) {
          float y = max(d.y, 0.0);
          vec3 c = mix(uHor, uMid, smoothstep(0.0, 0.22, y));
          return mix(c, uTop, smoothstep(0.22, 0.85, y));
        }
        float caustic(vec2 p, float t) {
          float a = sin(p.x * 2.7 + t * 1.3 + sin(p.y * 2.1 - t)) * sin(p.y * 3.1 - t * 1.1 + sin(p.x * 1.7 + t * 0.7));
          float b = sin(p.x * 4.3 - t * 0.9 + sin(p.y * 3.7 + t)) * sin(p.y * 3.9 + t * 1.2);
          return pow(abs(a), 3.0) * 0.7 + pow(abs(b), 4.0) * 0.5;
        }
        void main(){
          vec2 luv = (vW.xz - uLandOrigin) / uLandSize;
          float h = -2.8;
          if (luv.x > 0.0 && luv.x < 1.0 && luv.y > 0.0 && luv.y < 1.0) {
            h = texture2D(uLand, luv).r * 4.0 - 3.0;
            // 지형 텍스처 가장자리로 갈수록 바깥 깊은 바다 값으로 이어 준다 (지도에서 사각 바다판 경계선이 보이지 않게)
            float ek = max(abs(luv.x - 0.5), abs(luv.y - 0.5)) * 2.0;
            h = mix(h, -2.8, smoothstep(0.86, 0.99, ek));
          }
          float depth = clamp(-h, 0.0, 3.0);
          // 몰디브: 거의 흰 얕은 물 → 에메랄드 라군 → 산호초 너머 코발트 바다
          vec3 col = mix(uShallow, uSea2, smoothstep(0.05, 0.62, depth));
          col = mix(col, uDeep, smoothstep(0.9, 2.2, depth));
          col += vec3(0.9, 1.0, 1.0) * caustic(vW.xz * 0.7, uTime) * smoothstep(1.0, 0.05, depth) * 0.18;
          float wave = sin(uTime * 1.2 - depth * 7.0 + sin(vW.x * 0.3) + cos(vW.z * 0.25));
          float foam = smoothstep(0.18, 0.0, depth) * smoothstep(0.55, 1.0, wave) * 0.8 + smoothstep(0.05, 0.0, depth) * 0.6;
          // 실제 물결 노멀맵 두 겹을 서로 다른 방향으로 흘려 잔물결을 만든다
          vec3 n1 = texture2D(uNormals, vW.xz * 0.045 + vec2(uTime * 0.012, uTime * 0.008)).rgb * 2.0 - 1.0;
          vec3 n2 = texture2D(uNormals, vW.xz * 0.11 - vec2(uTime * 0.016, -uTime * 0.011)).rgb * 2.0 - 1.0;
          // 멀리 갈수록 결을 잔잔하게: 큰 너울 결이 비스듬한 하늘을 비추면 수평선에 흰 줄무늬가 생긴다
          float cdist = length(vW.xz - cameraPosition.xz);
          float calm = mix(0.35, 1.0, smoothstep(0.2, 1.4, depth)) * (1.0 - 0.75 * smoothstep(90.0, 420.0, cdist));
          float swellK = 1.0 - 0.85 * smoothstep(25.0, 150.0, cdist);
          // 너울 결: 큰 물결 세 겹 (Gerstner식 방향 파)
          vec2 gp = vW.xz;
          vec2 g = vec2(0.6, 0.8) * cos(dot(gp, vec2(0.6, 0.8)) * 0.18 - uTime * 0.9) * 0.3
                 + vec2(-0.7, 0.7) * cos(dot(gp, vec2(-0.7, 0.7)) * 0.27 - uTime * 1.15) * 0.22
                 + vec2(0.92, -0.38) * cos(dot(gp, vec2(0.92, -0.38)) * 0.43 - uTime * 1.5) * 0.14;
          vec3 N = normalize(vec3((n1.x + n2.x + g.x * 1.6 * swellK) * calm, 3.2, (n1.y + n2.y + g.y * 1.6 * swellK) * calm));
          vec3 V = normalize(cameraPosition - vW);
          float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
          vec3 Rf = reflect(-V, N);
          col = mix(col, skyCol(Rf), clamp(fres * 1.1, 0.0, 0.85) * mix(0.45, 1.0, smoothstep(0.3, 1.5, depth)));
          col += uSun * pow(max(dot(Rf, normalize(uSunDir)), 0.0), 600.0) * 4.0;
          // 실제 물가(깊이 버퍼): 모래·바위에 닿는 곳마다 하얀 거품띠가 밀려왔다 빠진다
          float th = waterThick();
          float brk = 0.55 + 0.45 * (n1.x * 0.5 + n2.y * 0.5 + 0.5);
          float lap = smoothstep(1.5, 0.1, th) * smoothstep(0.35, 0.95, 0.5 + 0.5 * sin(th * 5.5 - uTime * 2.0 + (n1.x + n2.y) * 3.0)) * brk;
          float rim = smoothstep(0.3, 0.02, th) * (0.6 + 0.4 * n2.x);
          foam = max(foam, max(lap * 0.85, rim));
          col = mix(col, vec3(1.0), clamp(foam, 0.0, 1.0) * 0.75);
          float d = length(vW.xz);
          // 바이러스에 오염된 바깥 바다: 탁한 보랏빛
          float poll = smoothstep(uPollR - 25.0, uPollR + 15.0, d) * (1.0 - smoothstep(330.0, 650.0, d));
          poll *= 1.0 - smoothstep(60.0, 160.0, cdist); // 가까이서만: 멀리선 수평선이 맑게 이어지게
          col = mix(col, vec3(0.18, 0.18, 0.23) + vec3(0.04, 0.06, 0.02) * sin(vW.x * 0.05 + uTime * 0.3), poll * 0.7);
          float far = smoothstep(260.0, 1000.0, d);
          col = mix(col, uHor, far);
          float alpha = mix(0.35, 0.96, smoothstep(0.0, 1.6, depth));
          alpha = max(alpha, clamp(foam, 0.0, 1.0) * 0.9);
          gl_FragColor = vec4(col, mix(alpha, 1.0, far) * smoothstep(0.0, 0.16, th));
          #include <encodings_fragment>
        }`,
    });

    sparkMat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, uLinPow: LINPOW },
      vertexShader: `uniform float uTime; uniform float uScale; attribute float aPhase; varying float vA;
        void main(){ vec3 p = position; p.y += sin(uTime * 1.3 + aPhase) * 0.12;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vA = 0.35 + 0.65 * pow(max(sin(uTime * 1.8 + aPhase * 3.0), 0.0), 2.0);
          // 멀리서(지도)도 '빛나는 땅'이 보이도록 최소 크기를 둔다
          gl_PointSize = min(64.0, max((7.0 + 12.0 * vA) * uScale, (10.0 + 22.0 * vA) * uScale * (26.0 / -mv.z)));
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; uniform float uLinPow;
        void main(){ vec2 c = gl_PointCoord - 0.5;
          float star = max(0.0, 1.0 - abs(c.x) * 14.0) * max(0.0, 1.0 - abs(c.y) * 2.2) + max(0.0, 1.0 - abs(c.y) * 14.0) * max(0.0, 1.0 - abs(c.x) * 2.2);
          float glow = exp(-dot(c, c) * 28.0);
          gl_FragColor = vec4(pow(vec3(1.0, 0.86, 0.45), vec3(uLinPow)), (star + glow * 0.8) * vA); }`,
    });

    starMat = new T.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 1, depthWrite: false, fog: false });
    outlineMat = new T.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 });
  }

  function beam(color, alpha) {
    const r = (LOT / 2) * Math.SQRT2;
    const geo = new T.CylinderGeometry(r, r, 7, 4, 1, true).rotateY(Math.PI / 4).translate(0, 3.5, 0);
    const mat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
      uniforms: { uColor: { value: new T.Color(color) }, uAlpha: { value: alpha }, uTime: { value: 0 } },
      vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uAlpha; uniform float uTime; varying float vY; void main(){ float a = pow(1.0 - vY, 2.2) * uAlpha * (0.75 + 0.25 * sin(uTime * 3.0)); gl_FragColor = vec4(uColor, a); }',
    });
    const m = new T.Mesh(geo, mat);
    m.visible = false;
    m.renderOrder = 5;
    return m;
  }

  const _cloudCol = new T.Color(), _white = new T.Color('#ffffff');
  function buildClouds() {
    const rl = RL(), out = [];
    if (!rl) return out;
    for (let k = 0; k < 14; k++) {
      const grp = new T.Group();
      for (let i = 0; i < 5; i++) {
        const sp = new T.Sprite(new T.SpriteMaterial({ map: rl.cloudTex, transparent: true, depthWrite: false, opacity: 0.9, fog: false }));
        const sz = 22 + Math.random() * 20;
        sp.scale.set(sz, sz * 0.55, 1);
        sp.position.set((i - 2) * 9 + Math.random() * 6, Math.random() * 3, Math.random() * 8);
        grp.add(sp);
      }
      const ca = Math.random() * Math.PI * 2, cr = 200 + Math.random() * 200;
      grp.position.set(Math.cos(ca) * cr, 58 + Math.random() * 22, Math.sin(ca) * cr);
      grp.userData.v = 0.6 + Math.random() * 0.8;
      out.push(grp);
    }
    return out;
  }

  function buildGulls() {
    const mat = new T.MeshStandardMaterial({ color: '#ffffff', side: T.DoubleSide, roughness: 0.8 });
    const out = [];
    for (let k = 0; k < 8; k++) {
      const geo = new T.BufferGeometry();
      const v = new Float32Array([0, 0, 0.18, 0, 0, -0.12, -0.55, 0, 0, 0, 0, 0.18, 0, 0, -0.12, 0.55, 0, 0]);
      geo.setAttribute('position', new T.BufferAttribute(v, 3));
      geo.computeVertexNormals();
      const g = new T.Mesh(geo, mat);
      g.castShadow = true;
      g.userData = { r: 30 + Math.random() * 70, a: Math.random() * 6.28, y: 16 + Math.random() * 12, v: (0.12 + Math.random() * 0.12) * (Math.random() < 0.5 ? -1 : 1), ph: Math.random() * 6 };
      out.push(g);
    }
    return out;
  }

  // ---------- 동물 (Kenney Cube Pets, 애니메이션) ----------
  const FAUNA = {
    bunny: { n: 6, size: 0.24, lo: 0.36, hi: 2, speed: 0.55 },
    deer: { n: 3, size: 0.46, lo: 0.4, hi: 2, speed: 0.4 },
    chick: { n: 4, size: 0.17, lo: 0.36, hi: 2, speed: 0.35 },
    fox: { n: 2, size: 0.32, lo: 0.4, hi: 2, speed: 0.5 },
    monkey: { n: 2, size: 0.32, lo: 0.4, hi: 2, speed: 0.45 },
    parrot: { n: 3, size: 0.22, lo: 0.3, hi: 2, speed: 0.4 },
    crab: { n: 6, size: 0.17, lo: -0.05, hi: 0.36, speed: 0.25 },
    fish: { n: 10, size: 0.2, lo: -0.62, hi: -0.24, speed: 0.5, swim: true },
  };

  function validFor(kind, x, z) {
    const f = FAUNA[kind], h = heightAt(x, z);
    if (h <= f.lo || h >= f.hi) return false;
    if (walkableTop(x, z) !== null) return false;
    return f.swim || !trunks.some((t) => (x - t.x) ** 2 + (z - t.z) ** 2 < (t.r + 0.12) ** 2);
  }
  function pickTarget(a) {
    for (let k = 0; k < 12; k++) {
      const ang = Math.random() * 6.28, r = 0.8 + Math.random() * 3.5;
      const x = a.x + Math.cos(ang) * r, z = a.z + Math.sin(ang) * r;
      if (validFor(a.kind, x, z)) { a.tx = x; a.tz = z; return; }
    }
    a.tx = a.x; a.tz = a.z;
  }
  function play(a, name) {
    if (a.anim === name || !a.actions[name]) return;
    const next = a.actions[name];
    next.reset().fadeIn(0.25).play();
    if (a.anim && a.actions[a.anim]) a.actions[a.anim].fadeOut(0.25);
    a.anim = name;
  }

  function buildFauna() {
    // 땅 동물 모델은 아직 없다. 대신 물고기 떼·나비·반딧불이로 섬에 생기를 준다
    const grp = new T.Group();
    lifeFx = buildLife(grp);
    try { wildFx = buildWild(grp); } catch (e) { console.warn('[island] 야생동물', e); wildFx = null; }
    return { grp, list: [] };
  }

  // ---------- 야생동물: 돌고래·바다거북·게·앵무새 떼 (코드로 만든 실사풍 형태, 1m ≈ 0.26) ----------
  let wildFx = null;
  function wildMesh(geos, mat) { const m = new T.Mesh(I.real.merge(geos.map((g) => (g.index ? g.toNonIndexed() : g))), mat); m.castShadow = true; return m; }
  function shadeY(g, lo, hi, cLo, cHi) { // 배는 밝고 등은 어둡게 (정점색)
    const p = g.attributes.position, c = new Float32Array(p.count * 3), a = new T.Color(cLo), b = new T.Color(cHi), t = new T.Color();
    for (let i = 0; i < p.count; i++) { t.copy(a).lerp(b, ss(lo, hi, p.getY(i))); c[i * 3] = t.r; c[i * 3 + 1] = t.g; c[i * 3 + 2] = t.b; }
    g.setAttribute('color', new T.BufferAttribute(c, 3));
    return g;
  }
  function findSpots(n, test, rnd, tries) {
    const out = [];
    for (let i = 0; i < (tries || 4000) && out.length < n; i++) { const x = (rnd() - 0.5) * 360, z = (rnd() - 0.5) * 360; if (Math.hypot(x, z) < POLLUTION_R - 20 && test(x, z, heightAt(x, z))) out.push({ x, z }); }
    return out;
  }
  // 가까이서 보면 장난감 같아서(v159 확인), 멀리서 읽히는 실루엣만 둔다: 먼바다 돌고래 · 하늘의 새 떼
  function buildWild(grp) {
    const rnd = I.rng.make(seed + 4242), fx = { dolphins: [], flocks: [] };
    const vc = (o) => new T.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.5 }, o));
    // 돌고래 (2.5m): 앞 1/3이 가장 굵고 꼬리자루로 가늘어지는 방추형 + 등지느러미 + 꼬리
    const dBody = (() => {
      const g = new T.SphereGeometry(1, 18, 10).scale(0.085, 0.09, 0.32), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const z = p.getZ(i), k = z >= 0.05 ? 1 : 0.18 + 0.82 * ss(-0.32, 0.05, z); p.setX(i, p.getX(i) * k); p.setY(i, p.getY(i) * k); }
      g.computeVertexNormals();
      return shadeY(g, -0.06, 0.05, '#8e98a2', '#3a4652');
    })();
    const dSnout = shadeY(new T.SphereGeometry(1, 8, 6).scale(0.022, 0.02, 0.06).translate(0, -0.012, 0.33), -0.03, 0.01, '#8e98a2', '#3a4652');
    const fin = (h, l) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute([0, 0, l * 0.5, 0, h, -l * 0.35, 0, 0, -l * 0.5], 3)); g.computeVertexNormals(); return shadeY(g, 0, 1, '#3a4652', '#3a4652'); };
    const dDorsal = fin(0.1, 0.12).translate(0, 0.075, -0.02);
    const dFluke = (() => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute([0, 0, -0.27, -0.12, 0, -0.39, 0, 0, -0.34, 0, 0, -0.27, 0, 0, -0.34, 0.12, 0, -0.39], 3)); g.computeVertexNormals(); return shadeY(g, 0, 1, '#3a4652', '#3a4652'); })();
    const dMat = vc({ side: T.DoubleSide, roughness: 0.3, metalness: 0.05 });
    const deep = findSpots(3, (x, z, h) => h < -1.6 && Math.hypot(x, z) > 95, rnd);
    deep.forEach((s) => {
      const m = wildMesh([dBody.clone(), dSnout.clone(), dDorsal.clone(), dFluke.clone()], dMat);
      grp.add(m);
      fx.dolphins.push({ m, cx: s.x, cz: s.z, R: 7 + rnd() * 6, a: rnd() * 6.28, dir: rnd() < 0.5 ? 1 : -1, sp: 0.22 + rnd() * 0.06, jumpT: -1, next: 3 + rnd() * 8, ph: rnd() * 6 });
    });
    // 새 떼: 역광 실루엣 (어두운 몸 + 퍼덕이는 날개). 높이 날아 작게만 보인다
    const silMat = new T.MeshBasicMaterial({ color: '#2b2f36', side: T.DoubleSide, fog: true });
    const bodyGeo = new T.SphereGeometry(1, 6, 4).scale(0.012, 0.012, 0.045);
    const wingGeo = (sd) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0.02, sd * 0.1, 0, -0.01, 0, 0, -0.025], 3)); return g; };
    const bird = () => {
      const b = new T.Group();
      b.add(new T.Mesh(bodyGeo, silMat));
      const w = [1, -1].map((sd) => { const m = new T.Mesh(wingGeo(sd), silMat); b.add(m); return m; });
      b.userData.w = w;
      return b;
    };
    for (let f = 0; f < 2; f++) {
      const birds = [];
      for (let k = 0; k < 7; k++) { const b = bird(); grp.add(b); birds.push({ b, ox: (rnd() - 0.5) * 3, oy: (rnd() - 0.5) * 1.2, oz: (rnd() - 0.5) * 3, ph: rnd() * 6 }); }
      fx.flocks.push({ birds, R: 35 + f * 25, a: rnd() * 6.28, sp: 0.06 + f * 0.02, cx: field && field.vc ? field.vc[0] : 0, cz: field && field.vc ? field.vc[1] : 0 });
    }
    return fx;
  }
  function updateWild(dt, t) {
    const f = wildFx;
    if (!f) return;
    const night = curPal ? curPal.stars : 0;
    // 돌고래: 큰 원을 돌며 헤엄치다 가끔 수면 위로 뛰어오른다 (들어갈 때 첨벙). 카메라가 25 안으로 오면 숨는다
    for (const d of f.dolphins) {
      d.a += d.dir * d.sp * dt;
      const x = d.cx + Math.cos(d.a) * d.R, z = d.cz + Math.sin(d.a) * d.R, hx = -Math.sin(d.a) * d.dir, hz = Math.cos(d.a) * d.dir;
      let y = -0.18 + Math.sin(t * 1.3 + d.ph) * 0.05, pitch = Math.cos(t * 1.3 + d.ph) * 0.15;
      const far = Math.hypot(camera.position.x - x, camera.position.z - z) > 25;
      d.next -= dt;
      if (d.jumpT < 0 && d.next <= 0) { d.jumpT = 0; if (far) splashAt(x, 0, z, 0.6); }
      if (d.jumpT >= 0) {
        d.jumpT += dt / 1.3;
        const k = d.jumpT; y = -0.15 + Math.sin(Math.PI * k) * 0.75; pitch = Math.cos(Math.PI * k) * 0.9;
        if (k >= 1) { d.jumpT = -1; d.next = 5 + Math.random() * 10; if (far) splashAt(x + hx * 0.3, 0, z + hz * 0.3, 0.9); }
      }
      d.m.visible = far;
      d.m.position.set(x, y, z);
      d.m.rotation.set(-pitch, Math.atan2(hx, hz), 0, 'YXZ');
    }
    // 새 떼: 밤엔 숨는다
    for (const fl of f.flocks) {
      fl.a += fl.sp * dt;
      const cx = fl.cx + Math.cos(fl.a) * fl.R, cz = fl.cz + Math.sin(fl.a) * fl.R * 0.8, hx = -Math.sin(fl.a), hz = Math.cos(fl.a) * 0.8;
      const gy = Math.max(heightAt(cx, cz), 0) + 9 + Math.sin(fl.a * 3) * 2;
      for (const b of fl.birds) {
        b.b.visible = night < 0.5;
        b.b.position.set(cx + b.ox + Math.sin(t * 0.8 + b.ph) * 0.6, gy + b.oy + Math.sin(t * 1.1 + b.ph) * 0.3, cz + b.oz + Math.cos(t * 0.7 + b.ph) * 0.6);
        b.b.rotation.set(0, Math.atan2(hx, hz), Math.sin(t + b.ph) * 0.2);
        const fl2 = Math.sin(t * 9 + b.ph) * 0.7;
        b.b.userData.w[0].rotation.z = fl2; b.b.userData.w[1].rotation.z = -fl2;
      }
    }
  }

  // ---------- 생기: 라군 물고기 떼 · 낮의 나비 · 밤의 반딧불이 ----------
  let lifeFx = null;
  function buildLife(grp) {
    const rl = RL(), fx = { schools: [], flies: [], butter: [] };
    const rnd = I.rng.make(seed + 777);
    // 물고기: 납작한 방추형 몸통 + 꼬리
    const body = new T.SphereGeometry(0.05, 8, 5).scale(0.55, 0.6, 2.4), tail = new T.ConeGeometry(0.045, 0.07, 4).rotateX(-Math.PI / 2).translate(0, 0, -0.14);
    const fishGeo = rl ? I.real.merge([body.toNonIndexed(), tail.toNonIndexed()]) : body;
    fishGeo.computeVertexNormals && fishGeo.computeVertexNormals();
    const fishMat = new T.MeshStandardMaterial({ color: '#3f5b5c', roughness: 0.5, metalness: 0.15 }); // 물빛에 섞인 흐린 그림자처럼 (진하면 화살표처럼 떠 보인다)
    const spots = [];
    for (let k = 0; k < 400 && spots.length < 8; k++) {
      const a = rnd() * 6.283, r = 70 + rnd() * 70, x = Math.cos(a) * r, z = Math.sin(a) * r, h = groundAt(x, z);
      if (h < -1.7 || h > -0.55 || spots.some((q) => Math.hypot(q.x - x, q.z - z) < 25)) continue;
      spots.push({ x, z });
    }
    const per = 11, fishIM = new T.InstancedMesh(fishGeo, fishMat, Math.max(1, spots.length * per));
    fishIM.count = spots.length * per;
    fishIM.frustumCulled = false;
    spots.forEach((sp) => fx.schools.push({ x: sp.x, z: sp.z, r: 2.5 + rnd() * 3, w: (0.25 + rnd() * 0.2) * (rnd() < 0.5 ? -1 : 1), ph: rnd() * 6.28, fish: [...Array(per)].map(() => ({ a: rnd() * 0.9, dr: (rnd() - 0.5) * 1.2, dy: rnd() * 0.25, s: 0.62 + rnd() * 0.4 })) }));
    grp.add(fishIM);
    fx.fishIM = fishIM;
    // 나비: 날개 두 장(왼·오른쪽)을 따로 퍼덕인다
    const wcv = document.createElement('canvas');
    wcv.width = 128; wcv.height = 64;
    const wg = wcv.getContext('2d');
    [['#ff9a2e', '#2a1a10'], ['#ffe14d', '#3a2a10'], ['#59b8ff', '#122238'], ['#ffffff', '#555555']].forEach(([c1, c2], i) => {
      const ox = (i % 2) * 64, oy = Math.floor(i / 2) * 32;
      wg.fillStyle = c2; wg.beginPath(); wg.ellipse(ox + 30, oy + 12, 26, 11, -0.35, 0, 6.283); wg.fill(); wg.beginPath(); wg.ellipse(ox + 24, oy + 23, 18, 8, 0.4, 0, 6.283); wg.fill();
      wg.fillStyle = c1; wg.beginPath(); wg.ellipse(ox + 30, oy + 12, 21, 8, -0.35, 0, 6.283); wg.fill(); wg.beginPath(); wg.ellipse(ox + 24, oy + 23, 14, 5.5, 0.4, 0, 6.283); wg.fill();
      wg.fillStyle = '#ffffff'; wg.beginPath(); wg.arc(ox + 44, oy + 9, 2.2, 0, 6.283); wg.fill();
    });
    const wtex = new T.CanvasTexture(wcv);
    wtex.encoding = T.sRGBEncoding;
    const wingGeo = new T.PlaneGeometry(0.11, 0.06).translate(0.055, 0, 0);
    const wingMat = new T.MeshStandardMaterial({ map: wtex, transparent: true, alphaTest: 0.4, side: T.DoubleSide, roughness: 0.8 });
    wingMat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n#if defined(USE_INSTANCING) && __VERSION__ >= 300\nvUv = vUv * vec2(0.5, 0.5) + vec2(mod(float(gl_InstanceID), 2.0) * 0.5, step(1.0, mod(floor(float(gl_InstanceID) / 2.0), 2.0)) * 0.5);\n#endif'); };
    const NB = 34, wL = new T.InstancedMesh(wingGeo, wingMat, NB), wR = new T.InstancedMesh(wingGeo, wingMat, NB);
    wL.frustumCulled = wR.frustumCulled = false;
    for (let i = 0; i < NB; i++) {
      for (let k = 0; k < 40; k++) {
        const a = rnd() * 6.283, r = 10 + rnd() * 85, x = Math.cos(a) * r, z = Math.sin(a) * r, h = groundAt(x, z);
        if (h < 0.4 || h > 9) continue;
        fx.butter.push({ hx: x, hz: z, x, z, y: h + 0.4, vx: 0, vz: 0, ph: rnd() * 6.28, t: rnd() * 10, flee: 0 });
        break;
      }
    }
    grp.add(wL, wR);
    fx.wL = wL; fx.wR = wR;
    // 반딧불이: 숲·계곡 근처, 밤에만
    const NF = 160, fp = new Float32Array(NF * 3), fa = new Float32Array(NF), fs = new Float32Array(NF);
    for (let i = 0; i < NF; i++) {
      let x = 0, z = 0;
      for (let k = 0; k < 30; k++) {
        const t = trunks[Math.floor(rnd() * trunks.length)];
        if (!t || !t.h) continue;
        x = t.x + (rnd() - 0.5) * 6; z = t.z + (rnd() - 0.5) * 6;
        break;
      }
      const gmax = Math.max(...[[0, 0], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]].map(([u, v]) => ((w) => Math.max(w.ground, w.level === null ? -99 : w.level))(waterState(x + u, z + v))));
      fx.flies.push({ hx: x, hz: z, ph: rnd() * 6.28, sp: 0.3 + rnd() * 0.5, by: gmax + 0.3 + rnd() * 0.9 }); // 떠다니는 범위에서 가장 높은 땅 위 (비탈 속에 묻히지 않게)
      fs[i] = 0.05 + rnd() * 0.05;
    }
    const fg = new T.BufferGeometry();
    fg.setAttribute('position', new T.BufferAttribute(fp, 3).setUsage(T.DynamicDrawUsage));
    fg.setAttribute('aAlpha', new T.BufferAttribute(fa, 1).setUsage(T.DynamicDrawUsage));
    fg.setAttribute('aSize', new T.BufferAttribute(fs, 1));
    const fm = new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, uniforms: { uVH: { value: 600 }, uLinPow: LINPOW },
      vertexShader: 'attribute float aAlpha, aSize; uniform float uVH; varying float vA; void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = clamp(aSize * uVH / max(0.5, -mv.z), uVH * (0.004 + aSize * 0.012), uVH * 0.04); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uLinPow; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(pow(vec3(1.0, 0.92, 0.45), vec3(uLinPow)) * vA, smoothstep(0.5, 0.0, d) * vA); }',
    });
    const fpts = new T.Points(fg, fm);
    fpts.frustumCulled = false;
    grp.add(fpts);
    Object.assign(fx, { fp, fa, fg, fm });
    return fx;
  }
  const _lm = new T.Matrix4(), _lq = new T.Quaternion(), _le = new T.Euler(), _lv = new T.Vector3(), _ls = new T.Vector3();
  function updateLife(dt, t) {
    const f = lifeFx;
    if (!f) return;
    const night = curPal ? curPal.stars : 0, day = 1 - night;
    // 물고기 떼: 원을 그리며 몰려다닌다 (수면 아래)
    let n = 0;
    for (const sc of f.schools) {
      const A = sc.ph + t * sc.w;
      for (const fi of sc.fish) {
        const a = A - fi.a * Math.sign(sc.w), r = sc.r + fi.dr + Math.sin(t * 0.7 + fi.a * 9) * 0.3;
        const x = sc.x + Math.cos(a) * r, z = sc.z + Math.sin(a) * r;
        const head = Math.atan2(-Math.sin(a) * Math.sign(sc.w), Math.cos(a) * Math.sign(sc.w));
        _le.set(0, head + Math.sin(t * 9 + fi.a * 20) * 0.18, 0);
        const fy = Math.min(-0.3 - fi.dy, (sc.floor !== undefined ? sc.floor : (sc.floor = groundAt(sc.x, sc.z))) + 0.12 + fi.dy * 0.5);
        f.fishIM.setMatrixAt(n++, _lm.compose(_lv.set(x, Math.max(fy, -2), z), _lq.setFromEuler(_le), _ls.setScalar(fi.s)));
      }
    }
    f.fishIM.instanceMatrix.needsUpdate = true;
    // 나비: 집 주변을 맴돌며 퍼덕인다. 낮에만, 사람이 오면 날아오른다
    const P = mode === 'walk' && hero ? hero.obj.position : null;
    f.butter.forEach((b, i) => {
      b.t += dt;
      const tx = b.hx + Math.sin(b.t * 0.31 + b.ph) * 2.2, tz = b.hz + Math.cos(b.t * 0.27 + b.ph * 1.3) * 2.2;
      if (P && Math.hypot(P.x - b.x, P.z - b.z) < 1.4) b.flee = 1.5;
      b.flee = Math.max(0, b.flee - dt);
      b.vx += ((tx - b.x) * 0.6 - b.vx) * Math.min(1, dt * 2); b.vz += ((tz - b.z) * 0.6 - b.vz) * Math.min(1, dt * 2);
      b.x += b.vx * dt; b.z += b.vz * dt;
      const bw = waterState(b.x, b.z), gy = Math.max(bw.ground, bw.level === null ? -99 : bw.level), ty = gy + 0.42 + Math.sin(b.t * 1.7 + b.ph) * 0.15 + b.flee * 0.9;
      b.y += (ty - b.y) * Math.min(1, dt * 3);
      b.y = Math.max(b.y, gy + 0.18); // 비탈을 따라 날다 날개가 땅에 묻히지 않게
      const flap = Math.sin(b.t * 22 + b.ph) * 1.1, yaw = Math.atan2(b.vx, b.vz), vis = day > 0.3 ? 1 : 0.0001;
      _le.set(0, yaw - Math.PI / 2, -flap * 0.5 - 0.35); _lq.setFromEuler(_le);
      f.wR.setMatrixAt(i, _lm.compose(_lv.set(b.x, b.y, b.z), _lq, _ls.setScalar(vis)));
      _le.set(0, yaw + Math.PI / 2, flap * 0.5 + 0.35); _lq.setFromEuler(_le);
      f.wL.setMatrixAt(i, _lm.compose(_lv.set(b.x, b.y, b.z), _lq, _ls.setScalar(vis)));
    });
    f.wL.instanceMatrix.needsUpdate = true; f.wR.instanceMatrix.needsUpdate = true;
    // 반딧불이: 밤에만 깜빡이며 떠다닌다
    f.fm.uniforms.uVH.value = renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    f.flies.forEach((q, i) => {
      const k = t * q.sp + q.ph;
      f.fp[i * 3] = q.hx + Math.sin(k * 0.7) * 1.4; f.fp[i * 3 + 1] = q.by + Math.sin(k * 1.3) * 0.25; f.fp[i * 3 + 2] = q.hz + Math.cos(k * 0.6) * 1.4;
      f.fa[i] = night * Math.max(0, Math.sin(k * 2.3)) ** 3 * 0.9;
    });
    f.fg.attributes.position.needsUpdate = true;
    f.fg.attributes.aAlpha.needsUpdate = true;
  }

  function updateFauna(dt, t) {
    for (const a of animals) {
      const f = FAUNA[a.kind];
      // 땅 동물은 사람이 다가가면 도망
      if (!f.swim && mode === 'walk' && a.flee <= 0) {
        const dx = a.x - player.x, dz = a.z - player.z, d = Math.hypot(dx, dz);
        if (d < 1.4 && d > 0.01) {
          const x = a.x + (dx / d) * 2.4, z = a.z + (dz / d) * 2.4;
          if (validFor(a.kind, x, z)) { a.tx = x; a.tz = z; } else pickTarget(a);
          a.flee = 1.6;
          a.idle = 0;
        }
      }
      if (a.flee > 0) a.flee -= dt;
      if (a.idle > 0) {
        a.idle -= dt;
        a.moving = false;
        if (!f.swim) play(a, a.idleAnim || 'idle');
      } else {
        const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
        if (d < 0.05) {
          a.idle = f.swim ? 0.5 : 1.5 + Math.random() * 4;
          a.idleAnim = Math.random() < 0.35 ? 'eat' : 'idle';
          pickTarget(a);
        } else {
          const sp = f.speed * (a.flee > 0 ? 3 : 1), step = Math.min(d, sp * dt);
          const nx = a.x + (dx / d) * step, nz = a.z + (dz / d) * step;
          if (validFor(a.kind, nx, nz)) { a.x = nx; a.z = nz; } else pickTarget(a);
          a.heading = Math.atan2(dx, dz);
          a.moving = true;
          play(a, a.flee > 0 ? 'run' : 'walk');
        }
      }
      const y = f.swim ? -0.28 + Math.sin(t * 2 + a.ph) * 0.03 : heightAt(a.x, a.z);
      a.obj.position.set(a.x, y, a.z);
      let dr = a.heading - a.obj.rotation.y;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      a.obj.rotation.y += dr * Math.min(1, dt * 6);
      a.mixer.update(dt);
    }
  }

  // 현재 구역 경계선 (지형을 따라 그린다)
  function setOutline(p, color) {
    if (!p) { outline.visible = false; return; }
    const cc = cellCenter(p), h = LOT / 2, pts = [];
    const corners = [[-h, -h], [h, -h], [h, h], [-h, h], [-h, -h]];
    // 바닥을 따라 짧은 선분으로 그리고, 절벽처럼 높이가 크게 튀는 곳은 끊는다 (공중에 걸린 철사처럼 보이지 않게)
    const ring = [];
    for (let e = 0; e < 4; e++)
      for (let k = 0; k < 20; k++) {
        const t = k / 20;
        const x = cc.x + corners[e][0] + (corners[e + 1][0] - corners[e][0]) * t;
        const z = cc.z + corners[e][1] + (corners[e + 1][1] - corners[e][1]) * t;
        const ws = waterState(x, z);
        ring.push([x, Math.max(ws.ground, ws.level !== null ? ws.level : -99, 0) + 0.05, z, ws.depth > 0.05 || ws.ground < 0.02]);
      }
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if (Math.abs(a[1] - b[1]) > 0.45 || (a[3] && b[3])) continue; // 물 위 구간은 그리지 않는다 (수면에 철사처럼 떠 보임)
      pts.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
    outline.geometry.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
    outline.geometry.computeBoundingSphere();
    outlineMat.color.set(color);
    outlineMat.opacity = mode === 'walk' ? 0.3 : 0.55; // 걷기 중엔 철사처럼 튀지 않게 옅게
    outline.visible = true;
  }

  // ---------- 팔레트·카메라 ----------
  function applyPalette(p) {
    curPal = p;
    skyMat.uniforms.uTop.value.set(p.top);
    skyMat.uniforms.uMid.value.set(p.mid);
    skyMat.uniforms.uHor.value.set(p.hor);
    skyMat.uniforms.uSun.value.set(p.sun);
    skyMat.uniforms.uSunDir.value.fromArray(p.sunDir).normalize();
    waterMat.uniforms.uDeep.value.set(p.deep);
    waterMat.uniforms.uSea2.value.set(p.sea2);
    waterMat.uniforms.uShallow.value.set(p.shallow);
    waterMat.uniforms.uSun.value.set(p.sun);
    waterMat.uniforms.uHor.value.set(p.hor);
    waterMat.uniforms.uSunDir.value.fromArray(p.sunDir).normalize();
    waterMat.uniforms.uTop.value.set(p.top);
    waterMat.uniforms.uMid.value.set(p.mid);
    hemi.color.set(p.hemiSky);
    hemi.groundColor.set(p.hemiGround);
    hemi.intensity = p.hemi;
    key.intensity = p.key;
    key.color.set(p.keyCol);
    key.position.fromArray(p.keyPos);
    scene.fog.color.set(p.hor);
    renderer.toneMappingExposure = p.exposure;
    const rl = RL();
    if (rl && rl.env) scene.environment = p.env > 0.5 ? rl.env : null;
    starMat.opacity = p.stars;
    stars.visible = p.stars > 0.01;
  }

  function lerpPalette(a, b, k) {
    const out = {};
    const ca = new T.Color(), cb = new T.Color();
    for (const key in a) {
      if (typeof a[key] === 'string') out[key] = '#' + ca.set(a[key]).lerp(cb.set(b[key]), k).getHexString();
      else if (Array.isArray(a[key])) out[key] = a[key].map((v, i) => v + (b[key][i] - v) * k);
      else out[key] = a[key] + (b[key] - a[key]) * k;
    }
    return out;
  }

  const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

  function overviewPose(c, th) {
    const tilt = Math.max(0.4, Math.min(1.3, c.tilt + userTilt));
    const dist = Math.max(60, Math.min(380, c.dist + userZoom));
    const pos = new T.Vector3(camFocus.x + Math.sin(th) * Math.sin(tilt) * dist, Math.cos(tilt) * dist + c.ty * 0.3 + camFocus.y, camFocus.z + Math.cos(th) * Math.sin(tilt) * dist);
    // 카메라는 -Z가 앞이므로 Matrix4.lookAt(카메라 규칙)으로 방향을 만든다
    const m = new T.Matrix4().lookAt(pos, new T.Vector3(camFocus.x, c.ty + camFocus.y, camFocus.z), new T.Vector3(0, 1, 0));
    return { pos, quat: new T.Quaternion().setFromRotationMatrix(m) };
  }

  function groundY(x, z) {
    const w = walkableTop(x, z);
    return w !== null ? w + EYE : Math.max(heightAt(x, z) + EYE, 0.14);
  }

  let camBack = 1.55, camHeadY = null, shakeT = 0;
  function walkPose(dt) {
    if (!hero) {
      const q = new T.Quaternion().setFromEuler(new T.Euler(player.pitch, player.yaw, 0, 'YXZ'));
      return { pos: new T.Vector3(player.x, groundY(player.x, player.z), player.z), quat: q };
    }
    // 어깨 너머 카메라: 캐릭터 머리 뒤쪽 위에서 바라본다
    const headT = (player.by !== undefined ? player.by : feetY(player.x, player.z)) + BODY_H * 0.85 + player.jy;
    camHeadY = camHeadY === null || player.drop || !(Math.abs(camHeadY - headT) < 6) ? headT : camHeadY + (headT - camHeadY) * Math.min(1, (dt || 0.016) * 9);
    const head = new T.Vector3(player.x, camHeadY, player.z);
    // 낙하 중엔 뒤로 물러나 내려다본다 (떨어질 자리가 보이게). 질주할 땐 조금 더 뒤로
    const dk = player.drop ? ss(0.6, 4.5, player.jy) : 0;
    const pitch = player.pitch - 0.85 * dk, BACK = 1.55 + 1.1 * dk + (player.sprint && player.moving ? 0.15 : 0);
    const cp = Math.cos(pitch), f = new T.Vector3(-Math.sin(player.yaw) * cp, Math.sin(pitch), -Math.cos(player.yaw) * cp);
    // 카메라와 캐릭터 사이에 줄기가 있으면 카메라를 앞으로 당긴다 (줄기 속으로 파고들지 않게)
    let back = BACK;
    const nearT = trunks.filter((t) => Math.abs(t.x - head.x) < 6 && Math.abs(t.z - head.z) < 6);
    const hitCam = (px, py, pz) => nearT.some((t) => {
      const d2 = (px - t.x) ** 2 + (pz - t.z) ** 2;
      if (d2 < (t.r + (t.flag !== undefined ? 0.28 : 0.1)) ** 2 && !(t.top !== undefined && py > t.top)) return true; // 천막·오두막은 모서리까지 (안쪽이 보이지 않게), 지붕 위로는 통과
      if (!t.h) return false;
      const rc = t.h * 0.3, cy = t.y + t.h * 0.78; // 수관
      return d2 < rc * rc && Math.abs(py - cy) < rc * 0.7;
    });
    for (let d = 0.12; d <= BACK; d += 0.08) {
      const px = head.x - f.x * d, pz = head.z - f.z * d, py = head.y - f.y * d + 0.18 * (d / BACK);
      if (py < waterState(px, pz).ground + 0.1 || hitCam(px, py, pz)) { back = Math.max(0.22, d - 0.12); break; }
    }
    // 벽에 막히면 즉시 당기고(벽 속을 보지 않게), 풀릴 땐 천천히 물러난다
    camBack = back < camBack ? back : camBack + (back - camBack) * 0.12;
    const pos = head.clone().addScaledVector(f, -camBack).add(new T.Vector3(0, 0.18, 0));
    let blocked = false;
    for (let it = 0; it < 5; it++) {
      const cws = waterState(pos.x, pos.z);
      const need = Math.max(cws.ground + 0.12, cws.level !== null ? cws.level + 0.22 : -99, 0.08);
      if (pos.y >= need) break;
      if (need - head.y < 0.45) { pos.y = need; break; }      // 살짝 높은 땅·수면: 조금 올린다
      // 머리보다 훨씬 높은 턱·벽: 끌어올리면 꼭대기로 튀므로 캐릭터 쪽으로 당긴다. 머리에 닿을 만큼이면 1인칭으로
      if (Math.hypot(pos.x - head.x, pos.z - head.z) < 0.5) { blocked = true; break; }
      pos.lerp(new T.Vector3(head.x, pos.y, head.z), 0.45);
      camBack *= 0.55;
    }
    // 벽을 따라 옆걸음하면 막힘·풀림이 프레임마다 바뀌어 1인칭↔3인칭이 깜빡였다 → 한 번 막히면 0.4초는 1인칭 유지
    if (blocked) camBlockT = 0.4;
    else if (camBlockT > 0) { camBlockT -= dt || 0.016; blocked = true; }
    if (hero) hero.obj.visible = !blocked; // 벽에 등을 대면 캐릭터 속에 카메라가 들어가므로 몸을 숨기고 눈높이로 본다
    if (blocked) {
      pos.set(head.x + f.x * 0.12, head.y + 0.05, head.z + f.z * 0.12);
      const m1 = new T.Matrix4().lookAt(pos, head.clone().addScaledVector(f, 2), new T.Vector3(0, 1, 0));
      return { pos, quat: new T.Quaternion().setFromRotationMatrix(m1) };
    }
    const m = new T.Matrix4().lookAt(pos, head.clone().addScaledVector(f, 0.6), new T.Vector3(0, 1, 0));
    return { pos, quat: new T.Quaternion().setFromRotationMatrix(m) };
  }

  let viewOff = 0, camBlockT = 0, seaFloor = null;
  function updateCamera(dt) {
    {
      const el = renderer.domElement, off = mode === 'game' && el.clientWidth / Math.max(1, el.clientHeight) < 0.8 ? 0.1 : 0;
      if (off !== viewOff) {
        viewOff = off;
        if (off) camera.setViewOffset(el.clientWidth, el.clientHeight, 0, el.clientHeight * off, el.clientWidth, el.clientHeight);
        else camera.clearViewOffset();
        camera.updateProjectionMatrix();
      }
    }
    // 지도 초점·확대를 부드럽게 따라간다
    camFocus.lerp(focusGoal, 1 - Math.exp(-dt * 2.5));
    if (zoomGoal !== null) { userZoom += (zoomGoal - userZoom) * (1 - Math.exp(-dt * 2.5)); if (Math.abs(zoomGoal - userZoom) < 0.5) zoomGoal = null; }
    if (territory) {
      const want = mode === 'game' && !trans ? 1 : 0, op = territory.material.opacity + (want - territory.material.opacity) * Math.min(1, dt * 4);
      territory.material.opacity = op;
      territory.visible = op > 0.01;
      // 밤엔 영토판을 어둡게: 하얀 판이 조명과 무관하게 그려져 밤 섬 전체가 회백색으로 떠 보였다 (지형 자체는 검푸른데 그 위 덮개만 밝았음)
      const nightK = 1 - (curPal ? curPal.stars : 0) * 0.82;
      territory.material.color.setRGB(nightK, nightK, nightK + 0.03 * (1 - nightK));
    }
    if (trans) {
      trans.k = Math.min(1, (performance.now() - trans.t0) / (trans.dur * 1000));
      const e = ease(trans.k);
      for (const k in cam) cam[k] = trans.from[k] + (CAM[trans.to][k] - trans.from[k]) * e;
      applyPalette(lerpPalette(trans.palFrom, palFor(trans.to), e));
      if (trans.k >= 1) trans = null;
    } else if (mode !== 'hero') applyPalette(palFor(mode));
    theta += cam.auto * dt;
    if (mode === 'walk') updateWalk(dt);
    let target = mode === 'walk' ? walkPose(dt) : mode === 'hero' ? heroPose() : overviewPose(cam, theta + userTheta);
    if (dbgCam) target = dbgCam;
    if (mode === 'walk' && hero) {
      // 질주·낙하 때 화각을 넓혀 속도감을 낸다
      const want = 58 + (player.sprint && player.moving ? 7 : 0) + (player.drop ? 10 : 0);
      if (Math.abs(camera.fov - want) > 0.02) { camera.fov += (want - camera.fov) * Math.min(1, dt * 5); camera.updateProjectionMatrix(); }
      // 착지 충격: 잠깐 흔들린다
      if (shakeT > 0) {
        shakeT -= dt;
        const a = Math.max(0, shakeT) * 0.12;
        target = { pos: target.pos.clone().add(new T.Vector3((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a)), quat: target.quat };
      }
    }
    if (tween) {
      const k = Math.min(1, (performance.now() - tween.t0) / (tween.dur * 1000)), e = ease(k);
      camera.position.lerpVectors(tween.pos, target.pos, e);
      camera.quaternion.slerpQuaternions(tween.quat, target.quat, e);
      if (k >= 1) tween = null;
    } else {
      camera.position.copy(target.pos);
      camera.quaternion.copy(target.quat);
    }
  }

  // ---------- 3인칭 캐릭터 ----------
  const HERO_FACE = 0;
  let heroAnim = null, heroGender = 'male';
  // 남녀 캐릭터 교체
  function setCharacter(g) {
    heroGender = g || heroGender;
    if (!RL()) return;
    if (hero) scene.remove(hero.obj);
    hero = I.real.character(BODY_H, heroGender);
    heroAnim = null;
    if (hero) { hero.obj.visible = mode === 'walk'; scene.add(hero.obj); playHero('idle'); }
  }
  // 물에 떠 있는 동작(Swim_Idle)은 팔을 어깨 높이로 벌려 T자세처럼 보인다 → 팔을 물속으로 내리고 조금 앞으로 모은다.
  // 동작 전환 가중치만큼만 돌려서 헤엄·걷기로 바뀔 때도 자연스럽게
  const _fq = new T.Quaternion(), _fq2 = new T.Quaternion(), _fdq = new T.Quaternion(), _fax = new T.Vector3();
  function floatArms(h) {
    const a = h.actions.float, w = a && a.isRunning() ? a.getEffectiveWeight() : 0;
    if (w < 0.001) return;
    const arms = h.arms || (h.arms = [h.obj.getObjectByName('upperarm_l'), h.obj.getObjectByName('upperarm_r')]);
    h.obj.updateMatrixWorld(true);
    h.obj.getWorldQuaternion(_fq);
    arms.forEach((b, i) => {
      if (!b || !b.parent) return;
      const s = i === 0 ? 1 : -1; // 왼팔은 +x, 오른팔은 -x 쪽으로 뻗어 있다
      b.parent.getWorldQuaternion(_fq2).invert();
      _fax.set(0, 0, 1).applyQuaternion(_fq).applyQuaternion(_fq2); // 몸 앞뒤 축 (부모 뼈 기준)
      b.quaternion.premultiply(_fdq.setFromAxisAngle(_fax, -s * 0.9 * w));
      _fax.set(0, 1, 0).applyQuaternion(_fq).applyQuaternion(_fq2); // 위아래 축
      b.quaternion.premultiply(_fdq.setFromAxisAngle(_fax, -s * 0.35 * w));
    });
  }

  function playHero(name) {
    if (!hero || heroAnim === name || !hero.actions[name]) return;
    hero.actions[name].reset().fadeIn(0.22).play();
    if (heroAnim && hero.actions[heroAnim]) hero.actions[heroAnim].fadeOut(0.22);
    heroAnim = name;
  }
  function feetY(x, z) {
    const w = walkableTop(x, z);
    if (w !== null) return w;
    const fc = fallCapQuery(x, z);
    if (fc) return fc.floor;
    const sq = streamQuery(x, z);
    return sq ? sq.floor : Math.max(groundAt(x, z), -0.62);
  }
  // 그 자리의 바닥·수면 (바다·폭포 소·분화구 호수·계곡 웅덩이 모두 물로 친다)
  const SWIM = 0.3;
  // 큰 폭포 절벽 윗면(바위턱): 별도 메시라 그 밑 지형은 소 바닥까지 파여 있다 → 윗면 높이를 직접 계산
  function fallCapQuery(x, z) {
    const f = field && field.fall;
    if (!f) return null;
    const RW = f.BR + 0.2, vx = x - f.cx, vz = z - f.cz, r = Math.hypot(vx, vz);
    if (r < RW - 0.2 || r > RW + 2.8) return null;
    const phi = Math.atan2(vx * -f.fz + vz * f.fx, -(vx * f.fx + vz * f.fz));
    if (Math.abs(phi) > 2.15) return null;
    const ox = f.cx + (f.BR + 2.8) * (-f.fx * Math.cos(phi) - f.fz * Math.sin(phi)), oz = f.cz + (f.BR + 2.8) * (-f.fz * Math.cos(phi) + f.fx * Math.sin(phi));
    const outer = heightAt(ox, oz), lk = ss(0.62, 0.44, Math.abs(phi));
    const capH = Math.max(f.poolY + 0.2, outer * (1 - lk) + f.top * lk);
    const t = ss(RW + 0.9, RW + 2.8, r);
    const ground = capH + (Math.max(capH, outer) - capH) * t;
    // 바위턱 위 물 (폭포 입구까지 흘러가는 얕은 물)
    const along = -(r - RW), lat = Math.abs(phi) * RW;
    const water = lk > 0.5 && lat < 2.6 ? f.top + 0.1 : null;
    return { floor: ground, water };
  }
  // 하류 강 수면 (리본과 같은 높이). 4칸 격자로 가까운 점만 본다
  let riverWater = null;
  function riverQuery(x, z) {
    if (!riverWater) return null;
    const gx = Math.floor(x / 4), gz = Math.floor(z / 4);
    let best = null, bd = 1e9;
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        const cell = riverWater.get(gx + a + ',' + (gz + b));
        if (cell) for (const q of cell) { const dd = (x - q.x) ** 2 + (z - q.z) ** 2; if (dd < bd) { bd = dd; best = q; } }
      }
    return best && bd < best.w * best.w ? best.level : null;
  }
  function waterState(x, z) {
    const w = walkableTop(x, z);
    if (w !== null) return { ground: w, level: null, depth: 0 };
    const fc = fallCapQuery(x, z), sq = fc ? null : streamQuery(x, z);
    const ground = fc ? fc.floor : sq ? sq.floor : Math.max(groundAt(x, z), -0.62);
    let level = fc && fc.water !== null ? fc.water : null;
    const f = field && field.fall, c = field && field.crater;
    if (!fc && f && Math.hypot(x - f.cx, z - f.cz) < f.BR + 1.3) level = f.poolY;
    if (c && Math.hypot(x - c.x, z - c.z) < c.R + 0.2) level = Math.max(level === null ? -99 : level, c.level);
    if (sq && sq.water !== null) level = Math.max(level === null ? -99 : level, sq.water);
    const rq = !fc && !sq ? riverQuery(x, z) : null;
    if (rq !== null && rq > ground) level = Math.max(level === null ? -99 : level, rq);
    if (level === null && heightAt(x, z) < 0.2) level = 0;
    return { ground, level, depth: level === null ? 0 : level - ground };
  }
  // 수영 동작은 기준점이 가슴 높이다 (서 있는 동작은 발). 떠 있을 땐 어깨까지 잠기게
  function footprintY(x, z, ws) {
    const fx = Math.sin(player.face), fz = Math.cos(player.face);
    let g = ws.ground;
    for (const [a, b] of [[0.075, 0], [-0.075, 0], [0, 0.045], [0, -0.045]]) {
      const q = waterState(x + fx * a - fz * b, z + fz * a + fx * b).ground;
      if (q > g) g = q;
    }
    return Math.min(g, ws.ground + 0.08);
  }
  const bodyY = (ws, x, z) => (ws.depth > SWIM ? ws.level - 0.02 : x === undefined ? ws.ground : footprintY(x, z, ws));

  // ---- 잔물결·첨벙 ----
  const ripples = [];
  let splash = null;
  function buildRipples() {
    const g = new T.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    for (let i = 0; i < 16; i++) {
      const m = new T.Mesh(g, new T.ShaderMaterial({
        transparent: true, depthWrite: false, uniforms: { opacity: { value: 0 }, uT: { value: 0 }, uLight: fallLight },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform float opacity, uT; uniform vec3 uLight; varying vec2 vUv;
          void main(){
            vec2 c = vUv * 2.0 - 1.0; float r = length(c), a = atan(c.y, c.x);
            float wob = sin(a * 9.0 + uT * 6.0) * 0.006 + sin(a * 17.0 - uT * 4.0) * 0.004;
            float ring = smoothstep(0.1, 0.0, abs(r - 0.82 - wob)) * 0.9 + smoothstep(0.07, 0.0, abs(r - 0.6 - wob)) * 0.35;
            gl_FragColor = vec4(vec3(1.0) * uLight, ring * opacity * smoothstep(1.0, 0.9, r));
            #include <encodings_fragment>
          }`,
      }));
      m.visible = false;
      m.renderOrder = 11;
      scene.add(m);
      ripples.push({ m, t: 1, big: 0 });
    }
    const N = 60, pp = new Float32Array(N * 3), pv = new Float32Array(N * 3), pa = new Float32Array(N), age = new Float32Array(N).fill(9);
    const pg = new T.BufferGeometry();
    pg.setAttribute('position', new T.BufferAttribute(pp, 3).setUsage(T.DynamicDrawUsage));
    pg.setAttribute('aAlpha', new T.BufferAttribute(pa, 1).setUsage(T.DynamicDrawUsage));
    pg.setAttribute('aSize', new T.BufferAttribute(new Float32Array(N).map(() => 0.03 + Math.random() * 0.05), 1));
    const pm = new T.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { uLight: fallLight, uVH: { value: 600 } },
      vertexShader: 'attribute float aAlpha, aSize; uniform float uVH; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vA = aAlpha * smoothstep(0.7, 2.6, -mv.z); gl_PointSize = min(uVH * 0.014, aSize * uVH / max(0.5, -mv.z)); gl_Position = projectionMatrix * mv; }', // 코앞 물방울이 눈송이·공처럼 커지지 않게
      fragmentShader: 'uniform vec3 uLight; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0) * uLight, smoothstep(0.5, 0.05, d) * vA); \n#include <encodings_fragment>\n}',
    });
    const pts = new T.Points(pg, pm);
    pts.frustumCulled = false;
    pts.renderOrder = 11;
    scene.add(pts);
    splash = { N, pp, pv, pa, age, pg, pm };
  }
  function rippleAt(x, y, z, big) {
    const r = ripples.find((q) => q.t >= 1) || ripples.reduce((a, b) => (a.t > b.t ? a : b));
    r.t = 0; r.big = big ? 1 : 0;
    r.m.position.set(x, y + 0.015, z);
    r.m.visible = true;
  }
  function splashAt(x, y, z, power) {
    if (!splash) return;
    for (let i = 0; i < splash.N; i++) {
      const a = Math.random() * 6.283, sp = (0.4 + Math.random() * 1.2) * power;
      splash.pp[i * 3] = x; splash.pp[i * 3 + 1] = y + 0.05; splash.pp[i * 3 + 2] = z;
      splash.pv[i * 3] = Math.cos(a) * sp; splash.pv[i * 3 + 1] = (1.2 + Math.random() * 2.2) * power; splash.pv[i * 3 + 2] = Math.sin(a) * sp;
      splash.age[i] = Math.random() * 0.1;
    }
    rippleAt(x, y, z, true);
    setTimeout(() => rippleAt(x, y, z, true), 180);
  }
  function updateRipples(dt) {
    for (const r of ripples) {
      if (r.t >= 1) continue;
      r.t = Math.min(1, r.t + dt / (r.big ? 1.5 : 1.0));
      const s = (r.big ? 0.5 : 0.22) + r.t * (r.big ? 2.6 : 1.1);
      r.m.scale.setScalar(s);
      r.m.material.uniforms.opacity.value = (1 - r.t) * (r.big ? 0.55 : 0.35);
      r.m.material.uniforms.uT.value = r.t;
      if (r.t >= 1) r.m.visible = false;
    }
    if (splash) {
      splash.pm.uniforms.uVH.value = renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
      for (let i = 0; i < splash.N; i++) {
        splash.age[i] += dt;
        splash.pv[i * 3 + 1] -= 9.8 * dt;
        splash.pp[i * 3] += splash.pv[i * 3] * dt; splash.pp[i * 3 + 1] += splash.pv[i * 3 + 1] * dt; splash.pp[i * 3 + 2] += splash.pv[i * 3 + 2] * dt;
        splash.pa[i] = splash.age[i] < 0.9 ? (1 - splash.age[i] / 0.9) * 0.85 : 0;
      }
      splash.pg.attributes.position.needsUpdate = true;
      splash.pg.attributes.aAlpha.needsUpdate = true;
    }
  }

  function jump() {
    if (mode !== 'walk' || !inputOn || player.air) return;
    if (waterState(player.x, player.z).depth > SWIM) return; // 수영 중엔 못 뜀
    player.air = true;
    player.vy = JUMP_V;
  }

  // ---------- 걷기 ----------
  function blocked(x, z) {
    if (Math.hypot(x, z) > POLLUTION_R - 6) return true; // 오염 해역 앞에서 막힌다
    if (walkableTop(x, z) !== null) return false;
    if (heightAt(x, z) < WATER_STOP) return true;
    return !!hitTrunk(x, z);
  }
  const PR = 0.1; // 사람 몸 반경
  function hitTrunk(x, z) {
    for (const t of trunks) if ((x - t.x) * (x - t.x) + (z - t.z) * (z - t.z) < (t.r + PR) * (t.r + PR)) return t;
    return null;
  }

  function updateWalk(dt) {
    let mx = 0, mz = 0;
    if (inputOn && !tween) {
      mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.x;
      mz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - joy.y;
    }
    // 낙하 착지 구르기: 구르는 동안은 보던 쪽으로 저절로 나아간다
    if (player.roll > 0) { mx = 0; mz = 1; }
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const ws0 = waterState(player.x, player.z);
    const wading = ws0.depth > 0.06, swimming = ws0.depth > SWIM;
    // 기본은 가볍게 뛰기, Shift(모바일은 멀리 끌기)는 전력 질주. 물이 깊거나 모바일에서 살짝 끌면 걷기
    const dash = !!(keys.ShiftLeft || keys.ShiftRight) || joy.far;
    player.walk = ws0.depth > 0.2 || (len > 0.05 && len < 0.5 && !dash && player.roll <= 0);
    player.sprint = dash && !player.walk && !swimming && !player.drop && player.roll <= 0;
    if (player.by === undefined || !isFinite(player.by)) player.by = bodyY(ws0, player.x, player.z);
    if (len > 0.05) {
      const speed = player.roll > 0 ? RUN * Math.min(1, (player.roll / ROLL_T) * 1.6)
        : player.drop ? RUN * 0.7
        : swimming ? RUN * (dash ? 0.8 : 0.55) * Math.min(1, len)
        : player.walk ? WALK * (wading ? 1.2 : 1) * Math.min(1, len / 0.3)
        : (player.sprint ? SPRINT : RUN) * Math.min(1, len);
      const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
      const dx = (-sy * mz + cy * mx) * speed * dt, dz = (-cy * mz - sy * mx) * speed * dt;
      // 절벽은 못 오른다 (기울기 약 67도 이상). 점프 중엔 점프 높이까지만
      const climbOK = (nx, nz) => {
        const nw = waterState(nx, nz);
        // 지금 발 높이: 헤엄칠 땐 수면 아래(물에서 기슭으로 올라설 수 있게), 아니면 바닥
        const feet = ws0.depth > SWIM ? ws0.level - 0.3 : ws0.ground;
        const rise = nw.ground - feet;
        if (rise < 0.06) return true;                       // 평지·내리막·물로 들어가기
        if (ws0.depth > SWIM && rise < 0.7) return true;    // 헤엄치다 기슭·바위턱으로 기어오르기 (수면 위 0.4m까지)
        const dl = Math.hypot(nx - player.x, nz - player.z) || 1e-4;
        if (player.air) {
          if (rise >= player.jy + 0.04) return false;
          if (rise < 0.15) return true;
          // 공중에서 높은 곳에 올라탈 땐 내려설 자리가 서 있을 만한지 본다 (점프 연타로 절벽을 기어오르지 못하게)
          const beyond = waterState(nx + ((nx - player.x) / dl) * 0.25, nz + ((nz - player.z) / dl) * 0.25).ground - nw.ground;
          return beyond / 0.25 < 2.4;
        }
        // 기울기는 이동 방향 0.25 앞을 보고 잰다: 프레임당 이동만으로 재면 몇 cm 턱도 절벽처럼 막힌다
        const ahead = waterState(player.x + ((nx - player.x) / dl) * 0.25, player.z + ((nz - player.z) / dl) * 0.25).ground - feet;
        return rise < 0.15 && ahead / 0.25 < 2.4;
      };
      // 1) 줄기·천막과 겹치면 바깥으로 밀어낸다. 정면으로 박으면 옆으로 비켜 지나간다
      let nx = player.x + dx, nz = player.z + dz;
      const mvl = Math.hypot(dx, dz) || 1;
      for (let it = 0; it < 3; it++) {
        let hit = false;
        for (const t of trunks) {
          const ox = nx - t.x, oz = nz - t.z;
          if (ox > 3 || ox < -3 || oz > 3 || oz < -3) continue;
          const rr = t.r + PR, d2 = ox * ox + oz * oz;
          if (d2 >= rr * rr) continue;
          hit = true;
          const d = Math.sqrt(d2) || 1e-4;
          let ux = ox / d, uz = oz / d;
          if (-(ux * dx + uz * dz) / mvl > 0.95) {
            const sd = Math.sign((t.x - player.x) * dz - (t.z - player.z) * dx) || 1;
            ux += (-dz / mvl) * sd * 0.9; uz += (dx / mvl) * sd * 0.9;
            const l = Math.hypot(ux, uz); ux /= l; uz /= l;
          }
          nx = t.x + ux * (rr + 0.002); nz = t.z + uz * (rr + 0.002);
        }
        if (!hit) break;
      }
      // 2) 오염 해역 앞에서 멈춘다
      const prr = Math.hypot(nx, nz), lim = POLLUTION_R - 6;
      if (prr > lim) { nx *= lim / prr; nz *= lim / prr; }
      // 3) 절벽: 못 오르면 축별로 미끄러진다
      if (climbOK(nx, nz)) { player.x = nx; player.z = nz; }
      else if (climbOK(player.x + dx, player.z)) player.x += dx;
      else if (climbOK(player.x, player.z + dz)) player.z += dz;
      const want = Math.atan2(dx, dz);
      let dr = Math.atan2(Math.sin(want - player.face), Math.cos(want - player.face));
      player.face += dr * Math.min(1, dt * 10);
    }
    player.moving = len > 0.05;
    // 몸 높이: 땅을 따라 부드럽게. 턱에서 0.3 넘게 떨어지면 중력으로 떨어진다
    const ws = waterState(player.x, player.z), deep = ws.depth > SWIM, target = bodyY(ws, player.x, player.z);
    // 물에 들고 날 땐 몸 기준점이 발 ↔ 가슴으로 바뀐다 → 동작이 바뀌는 0.22초와 같은 속도로 옮겨야 몸이 솟거나 꺼지지 않는다
    if (deep !== !!player.deep) { player.deep = deep; player.byFrom = player.by; player.byT = 0; }
    if (player.air) player.byT = 1; // 공중에선 몸 높이가 바닥을 따라가고 높이는 jy가 맡는다
    if (player.byT < 1) { player.byT = Math.min(1, player.byT + dt / 0.22); player.by = player.byFrom + (target - player.byFrom) * player.byT; }
    else if (target < player.by - 0.3 && !player.air) { player.air = true; player.jy = player.by - target; player.vy = 0; player.by = target; }
    else player.by += (target - player.by) * Math.min(1, dt * (deep ? 6 : 14));
    // 점프: 위로 튀었다가 중력으로 떨어진다
    if (player.air) {
      player.vy -= GRAVITY * dt;
      if (player.drop) player.vy = Math.max(player.vy, -DROP_VT); // 낙하는 공기 저항으로 최고 속도까지만
      player.jy += player.vy * dt;
      if (player.jy <= 0) {
        // 물로 떨어지면 첨벙
        if (ws.depth > 0.06) splashAt(player.x, ws.level, player.z, Math.min(1.6, 0.6 + -player.vy * 0.18));
        player.land = deep ? 0 : 0.28;
        if (player.drop) {
          // 낙하 착지: 땅이면 앞으로 구르고, 화면이 쿵 흔들린다
          shakeT = deep ? 0.2 : 0.4;
          if (!deep && ws.depth < 0.06) { player.roll = ROLL_T; player.land = 0; } // 구르기 동작은 제자리라 몸은 코드가 앞으로 민다
          player.drop = false;
        }
        player.jy = 0; player.vy = 0; player.air = false;
      }
    } else if (player.land > 0) player.land -= dt;
    if (player.roll > 0) player.roll -= dt;
    // 물속에서 움직이면 잔물결
    player.rip = (player.rip || 0) - dt;
    if (ws.depth > 0.04 && (player.moving || deep) && player.rip <= 0 && !player.air) { rippleAt(player.x, ws.level, player.z, false); player.rip = player.moving ? 0.22 : 0.7; }
    // 얕은 물을 뛰어 건너면 발밑에서 물이 튄다 (투명한 물에선 다리가 잠긴 건지 잘린 건지 안 보였다)
    player.spl = (player.spl || 0) - dt;
    if (ws.depth > 0.06 && ws.depth <= SWIM && player.moving && !player.walk && player.spl <= 0 && !player.air) { splashAt(player.x, ws.level, player.z, player.sprint ? 0.5 : 0.32); player.spl = 0.28; }
    if (hero) {
      // 낙하 중 높이 있을 땐 팔다리를 벌리고 엎드린 자세(스카이다이빙), 땅이 가까워지면 일어서서 착지 준비
      const sky = player.drop && player.jy > 2.4;
      player.tilt += ((sky ? 1.2 : 0) - player.tilt) * Math.min(1, dt * 7);
      const HIP = BODY_H * 0.5, fx = Math.sin(player.face + HERO_FACE), fz = Math.cos(player.face + HERO_FACE);
      // 비탈에선 오르막 쪽으로 살짝 기울인다 (허리 위만 조금, 최대 11도)
      const gF = waterState(player.x + fx * 0.12, player.z + fz * 0.12).ground, gB = waterState(player.x - fx * 0.12, player.z - fz * 0.12).ground;
      const leanW = deep || player.air ? 0 : Math.max(-0.2, Math.min(0.2, Math.atan((gF - gB) / 0.24) * 0.3));
      player.lean = (player.lean || 0) + (leanW - (player.lean || 0)) * Math.min(1, dt * 6);
      const tl = player.tilt + player.lean;
      // 발이 아니라 엉덩이를 축으로 기울인다
      hero.obj.position.set(player.x - fx * HIP * Math.sin(tl), player.by + player.jy + HIP * (1 - Math.cos(tl)), player.z - fz * HIP * Math.sin(tl)); // 수영: 물에 몸이 잠긴다
      hero.obj.rotation.order = 'YXZ';
      hero.obj.rotation.set(tl, player.face + HERO_FACE, 0);
      if (hero.setWater) hero.setWater(ws.level !== null ? ws.level : -99); // 수면 아래 몸은 물빛으로
      playHero(!inputOn && !player.moving ? 'kneel'
        : sky ? 'float'
        : player.roll > 0 ? 'roll'
        : player.air ? (player.vy > 1 ? 'jumpStart' : 'jumpLoop')
        : player.land > 0 ? 'jumpLand'
        : deep ? (player.moving ? 'swim' : 'float') : !player.moving ? 'idle' : player.walk ? 'walk' : player.sprint ? 'sprint' : 'run');
      if (hero.actions.swim) hero.actions.swim.timeScale = dash ? 1.4 : 1; // 빠르게 헤엄치기
      hero.mixer.update(dt);
      if (player.tilt < 0.05) floatArms(hero); // 하늘에선 팔을 벌린 채로 둔다
    }
    const p = plotAt(player.x, player.z);
    const id = p ? p.id : null;
    if (id !== player.plotId) {
      player.plotId = id;
      setOutline(p, p ? (p.owner ? ownerColor(p.owner) : '#ffffff') : '#ffffff');
      if (onWalkPlot) onWalkPlot(p);
    }
  }

  function spawnFor(plot) {
    let p = plot || plots.find((q) => q.owner === 'me') || null;
    const own = !!p;
    if (!p) {
      const beaches = plots.filter((q) => q.terrain === 'beach').sort((a, b) => b.y - a.y || Math.abs(a.x - G / 2) - Math.abs(b.x - G / 2));
      p = beaches[0] || plots[0];
    }
    const cc0 = cellCenter(p), fg = flags.get(p.id), spot = fg && fg.userData.spot;
    // 깃발이 선 자리(마른 땅)를 기준으로: 웅덩이 칸이면 땅 가운데는 물속이다
    const cc = spot ? { x: spot.x, z: spot.z } : cc0;
    const dry = (px, pz) => { const w = waterState(px, pz); return w.depth < 0.05 && w.ground >= 0.1; };
    const far = (px, pz, m) => trunks.every((t) => (px - t.x) ** 2 + (pz - t.z) ** 2 > (t.r + m) ** 2);
    // 섬 바깥쪽에서 깃발(또는 섬 가운데)을 바라보는 자리부터 둘러가며 찾는다. 카메라 자리·시선까지 막히지 않아야 한다
    const out0 = Math.atan2(cc.x, cc.z), gFlag = waterState(cc.x, cc.z).ground;
    // 낮은 나무 수관(바나나 잎 등)이 카메라 앞을 가리는지
    const leafy = (qx, qz, qy) => trunks.some((t) => t.h && (qx - t.x) ** 2 + (qz - t.z) ** 2 < (t.h * 0.3 + 0.45) ** 2 && t.y + t.h * 0.78 - t.h * 0.21 < qy + 0.6);
    // 후보마다 점수를 매겨 가장 시원하게 보이는 자리를 고른다 (처음 통과한 자리를 쓰면 가파른 땅에선 깃대·지붕·비탈이 코앞을 막았다)
    // 내 땅: 그 땅 안, 깃발에서 4~6m, 깃발이 화면 오른쪽에 비켜 보이게 / 처음 상륙: 해변에서 섬 안쪽을 보며
    const score = (x, z, lookX, lookZ, wantD) => {
      if (!dry(x, z) || !far(x, z, 0.9)) return Infinity;
      if (own && plotAt(x, z) !== p) return Infinity;
      const g0 = waterState(x, z).ground, camY = g0 + 0.55;
      let sc = 0;
      // 카메라 자리·사이: 줄기·수관·비탈
      for (const d of [0.6, 1.2, 1.8]) {
        const qx = x - lookX * d, qz = z - lookZ * d, gq = waterState(qx, qz).ground;
        if (!far(qx, qz, 0.35)) sc += 6;
        if (leafy(qx, qz, camY)) sc += 3;
        sc += Math.max(0, gq - (g0 + 0.35)) * 6;
      }
      for (const sd of [-1, 1]) { const qx = x - lookX * 1.4 - lookZ * sd * 0.8, qz = z - lookZ * 1.4 + lookX * sd * 0.8; sc += Math.max(0, waterState(qx, qz).ground - (camY - 0.25)) * 4 + (leafy(qx, qz, camY) ? 2 : 0); }
      // 앞이 트였는지: 3·6m 앞 땅이 눈높이보다 높으면 비탈만 보인다
      for (const d of [3, 6]) sc += Math.max(0, waterState(x + lookX * d, z + lookZ * d).ground - (camY + 0.6)) * 1.5;
      // 발밑이 평평한지, 깃발과 높이가 비슷한지, 깃발까지 거리
      const sl = Math.abs(waterState(x + 0.4, z).ground - waterState(x - 0.4, z).ground) + Math.abs(waterState(x, z + 0.4).ground - waterState(x, z - 0.4).ground);
      sc += sl * 1.2;
      if (own) sc += Math.abs(g0 - gFlag) * 0.4 + Math.abs(Math.hypot(tgt.x - x, tgt.z - z) - wantD) * 0.5;
      // 내 오두막이 첫 화면에 보이는지: 화면 안쪽(시선에서 40° 안)이고, 카메라와 오두막 사이를 비탈이 가리지 않아야 한다
      // (산비탈 땅에선 비탈 너머 오두막이 안 보인 채로 시작했다)
      if (house) {
        const cx = x - lookX * 1.6, cz = z - lookZ * 1.6, cy = g0 + 0.8, hy = house.g + 0.55;
        const vx = house.x - x, vz = house.z - z, vl = Math.hypot(vx, vz) || 1, ang = Math.acos(Math.max(-1, Math.min(1, (vx * lookX + vz * lookZ) / vl)));
        sc += Math.max(0, ang - 0.7) * 6;
        let blocked = 0;
        for (let k = 1; k < 8; k++) { const t = k / 8, gx = cx + (house.x - cx) * t, gz = cz + (house.z - cz) * t; blocked = Math.max(blocked, waterState(gx, gz).ground - (cy + (hy - cy) * t) + 0.1); }
        sc += Math.max(0, blocked) * 8;
      }
      return sc;
    };
    // 내 땅: 깃발과 오두막 사이를 바라본다 (둘이 화면 양쪽에 함께 보이게). 오두막이 없으면 깃발을 오른쪽에 비켜 두고
    const house = own && spot && spot.house ? { x: spot.hx, z: spot.hz, g: waterState(spot.hx, spot.hz).ground } : null;
    const tgt = house ? { x: (cc.x + house.x) / 2, z: (cc.z + house.z) / 2 } : cc;
    let best = null, bestS = Infinity;
    const consider = (x, z) => {
      let lookX, lookZ;
      if (own) {
        const dx = tgt.x - x, dz = tgt.z - z, l = Math.hypot(dx, dz) || 1;
        if (l < 1.6 || Math.hypot(cc.x - x, cc.z - z) < 1.2) { // 깃발 바로 옆이면 깃발 말고 땅 가운데를 본다 (깃대가 코앞을 막지 않게)
          const vx = cc0.x - x, vz = cc0.z - z, vl = Math.hypot(vx, vz) || 1;
          lookX = vx / vl; lookZ = vz / vl;
        } else { const yw = Math.atan2(-dx / l, -dz / l) + (house ? 0 : 0.38); lookX = -Math.sin(yw); lookZ = -Math.cos(yw); }
      } else { lookX = -Math.sin(Math.atan2(x, z)); lookZ = -Math.cos(Math.atan2(x, z)); }
      const sc = score(x, z, lookX, lookZ, own ? 2.2 : 5); // 내 땅(구획 한 변 약 5)에선 깃발에서 2m쯤
      if (sc < bestS) { bestS = sc; best = { x, z, yaw: Math.atan2(-lookX, -lookZ) }; }
    };
    if (own) {
      const c0 = cellCenter(p);
      for (let z = c0.z - LOT / 2 + 0.3; z <= c0.z + LOT / 2 - 0.3; z += 0.45) for (let x = c0.x - LOT / 2 + 0.3; x <= c0.x + LOT / 2 - 0.3; x += 0.45) consider(x, z);
    } else {
      for (let k = 0; k < 32; k++) { const a = out0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.4; for (const r of [3.4, 4.6, 6]) consider(cc.x + Math.sin(a) * r, cc.z + Math.cos(a) * r); }
    }
    if (best) return best;
    // 땅이 거의 물·절벽이라(폭포 웅덩이 칸) 마른 곳이 깃발 곁뿐이면: 깃발 바로 옆에서 땅 가운데(웅덩이·폭포)를 보며.
    // 깃대가 카메라 앞을 가리지 않게 깃발이 옆(60° 이상)에 있고 카메라 자리가 깃대에서 떨어진 곳
    if (own) {
      let alt = null;
      for (const r of [0.7, 1.0, 1.3])
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * 6.283, x = cc.x + Math.sin(a) * r, z = cc.z + Math.cos(a) * r;
          if (!dry(x, z) || !far(x, z, 0.45) || plotAt(x, z) !== p) continue;
          const lx = cc0.x - x, lz = cc0.z - z, ll = Math.hypot(lx, lz) || 1, yaw = Math.atan2(-lx, -lz);
          const fxp = cc.x - x, fzp = cc.z - z, fl = Math.hypot(fxp, fzp) || 1, cosA = (fxp * lx + fzp * lz) / (fl * ll);
          const camX = x - (lx / ll) * 1.55, camZ = z - (lz / ll) * 1.55;
          if (cosA < 0.5 && Math.hypot(camX - cc.x, camZ - cc.z) > 0.7) return { x, z, yaw };
          if (!alt) alt = { x, z, yaw };
        }
      if (alt) return alt;
    }
    // 그 땅 안에 마른 자리가 하나도 없으면 깃발 곁 어디든
    for (let k = 0; k < 32; k++) {
      const a = out0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.4, r = k > 15 ? 6.2 : 4.0, x = cc.x + Math.sin(a) * r, z = cc.z + Math.cos(a) * r;
      if (dry(x, z) && far(x, z, 0.9)) return { x, z, yaw: Math.atan2(-(cc.x - x), -(cc.z - z)) };
    }
    return { x: cc.x + 1.2, z: cc.z + 1.2, yaw: Math.atan2(cc.x, cc.z) };
  }

  // ---------- 지도: 땅 경계·영토 (지도 모드에서만 보인다) ----------
  // 땅마다 지형을 따라 덮는 얇은 판: 주인 색으로 칠하고 가장자리는 진하게 → 누구 땅인지, 어디가 비었는지 한눈에
  let territory = null, terrWet = [];
  const TERR_N = 8;
  function buildTerritory() {
    if (territory) { scene.remove(territory); territory.geometry.dispose(); }
    const n1 = TERR_N + 1, pos = [], idx = [], half = LOT / 2 - 0.15;
    terrWet = [];
    plots.forEach((p) => {
      const cc = cellCenter(p), base = pos.length / 3;
      for (let j = 0; j <= TERR_N; j++)
        for (let i = 0; i <= TERR_N; i++) {
          const x = cc.x + ((i / TERR_N) * 2 - 1) * half, z = cc.z + ((j / TERR_N) * 2 - 1) * half, ws = waterState(x, z);
          pos.push(x, Math.max(ws.ground, ws.level !== null ? ws.level : -99, 0) + 0.14, z);
          terrWet.push(ws.depth > 0.05 ? 1 : 0);
          if (i < TERR_N && j < TERR_N) { const a = base + j * n1 + i; idx.push(a, a + n1, a + 1, a + 1, a + n1, a + n1 + 1); }
        }
    });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(new Float32Array((pos.length / 3) * 4), 4));
    g.setIndex(idx);
    territory = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    territory.renderOrder = 9; // 물(웅덩이·호수) 위에도 보이게 수면보다 나중에
    territory.frustumCulled = false;
    territory.visible = false;
    scene.add(territory);
    paintTerritory();
  }
  function paintTerritory() {
    if (!territory) return;
    const c = territory.geometry.attributes.color, n1 = TERR_N + 1, cl = new T.Color();
    plots.forEach((p, pi) => {
      const me = p.owner === 'me';
      cl.set(p.owner ? ownerColor(p.owner) : '#ffffff');
      const fill = me ? 0.32 : p.owner ? 0.22 : 0.03, frame = me ? 1.0 : p.owner ? 0.8 : 0.3;
      for (let j = 0; j <= TERR_N; j++)
        for (let i = 0; i <= TERR_N; i++) {
          const e = Math.max(Math.abs((i / TERR_N) * 2 - 1), Math.abs((j / TERR_N) * 2 - 1)), k = pi * n1 * n1 + j * n1 + i;
          // 물 위(강·웅덩이)는 옅게: 경계선이 강을 토막 내 끊어진 물처럼 보이지 않게
          c.setXYZW(k, cl.r, cl.g, cl.b, (fill + (frame - fill) * ss(0.74, 1.0, e)) * (terrWet[k] ? 0.35 : 1));
        }
    });
    c.needsUpdate = true;
  }

  // ---------- 명당: 땅마다 보이는 풍경·특징 (소유욕을 자극하는 이름표) ----------
  function plotTags(id) {
    const p = plots.find((q) => q.id === id);
    if (!p || !field) return [];
    const cc = cellCenter(p), tags = [];
    const f = field.fall, c = field.crater, h = groundAt(cc.x, cc.z);
    if (f) {
      const d = Math.hypot(cc.x - f.cx, cc.z - f.cz), front = (cc.x - f.cx) * f.fx + (cc.z - f.cz) * f.fz;
      if (d < 14) tags.push({ k: 'fall', t: '💧 폭포 바로 앞' });
      else if (d < 34 && front > -4) tags.push({ k: 'fallview', t: '🌊 폭포가 보이는 땅' });
    }
    if (c && Math.hypot(cc.x - c.x, cc.z - c.z) < c.R + 9) tags.push({ k: 'lake', t: '🏔️ 분화구 호숫가' });
    if (field.stream && field.stream.samples.some((q) => Math.hypot(q.x - cc.x, q.z - cc.z) < 6)) tags.push({ k: 'stream', t: '🏞️ 계곡 물소리' });
    else if (field.river && field.river.some((q) => q.down && Math.hypot(q.x - cc.x, q.z - cc.z) < 5)) tags.push({ k: 'river', t: '🛶 강가' });
    if (p.terrain === 'beach' && h < 1.0) tags.push({ k: 'beach', t: '🏖️ 백사장' });
    if (h > 12) tags.push({ k: 'peak', t: '🌄 섬 전망대' });
    // 서쪽(노을 쪽) 바다를 막힘없이 보는 땅
    if (!tags.some((q) => q.k === 'beach') && Math.hypot(cc.x, cc.z) > 55 && cc.x < -30) tags.push({ k: 'sunset', t: '🌅 노을 명소' });
    return tags.slice(0, 3);
  }

  // ---------- 보급 상자: 섬 곳곳에 떠밀려 온 상자. 걸어가서 열면 토큰이나 깃발 ----------
  // 깃발을 다 쓴 뒤에도 섬을 걸어 다닐 이유가 되고(멀리서도 보이는 빛기둥), 시간이 지나면 새 상자가 와서 다시 올 이유가 된다
  let crateGrp = null, crateList = [], onCrate = null, crateBeamMat = null;
  function crateSpot() {
    for (let k = 0; k < 400; k++) {
      const a = Math.random() * 6.283, r = 25 + Math.random() * 75, x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (!plotAt(x, z)) continue; // 섬 땅 안에만
      const w = waterState(x, z);
      if (w.depth > 0.02 || w.ground < 0.25 || w.ground > 9) continue;
      const sl = Math.abs(groundAt(x + 0.5, z) - groundAt(x - 0.5, z)) + Math.abs(groundAt(x, z + 0.5) - groundAt(x, z - 0.5));
      if (sl > 0.45) continue;
      if (trunks.some((t) => (x - t.x) ** 2 + (z - t.z) ** 2 < (t.r + 1.0) ** 2)) continue;
      if (field.fall && Math.hypot(x - field.fall.cx, z - field.fall.cz) < field.fall.BR + 4) continue;
      if (streamQuery(x, z) || crateList.some((c) => Math.hypot(c.x - x, c.z - z) < 12)) continue;
      return { x: +x.toFixed(2), z: +z.toFixed(2) };
    }
    return null;
  }
  function crateBeam() {
    if (!crateBeamMat)
      crateBeamMat = new T.ShaderMaterial({
        transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, uniforms: { uTime: { value: 0 }, uLinPow: LINPOW },
        vertexShader: 'varying vec2 vUv; varying vec3 vW; varying vec3 vN; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `uniform float uTime, uLinPow; varying vec2 vUv; varying vec3 vW; varying vec3 vN;
          void main(){
            vec3 V = normalize(cameraPosition - vW);
            float edge = pow(abs(dot(normalize(vec3(vN.x, 0.0, vN.z)), normalize(vec3(V.x, 0.0, V.z)))), 1.5); // 기둥 가운데가 진하고 가장자리는 옅게
            float up = (1.0 - vUv.y) * (1.0 - vUv.y);
            float near = smoothstep(2.0, 6.0, distance(cameraPosition.xz, vW.xz)); // 코앞에선 시야를 가리지 않게
            float pulse = 0.8 + 0.2 * sin(uTime * 2.2 + vW.x);
            gl_FragColor = vec4(pow(vec3(1.0, 0.86, 0.5), vec3(uLinPow)) * edge * up * near * pulse * 0.55, 1.0);
          }`,
      });
    const m = new T.Mesh(new T.CylinderGeometry(0.22, 0.4, 14, 16, 1, true).translate(0, 7, 0), crateBeamMat);
    m.renderOrder = 7;
    m.frustumCulled = false;
    return m;
  }
  function setCrates(list) {
    if (crateGrp) scene.remove(crateGrp);
    crateGrp = new T.Group();
    crateList = (list || []).map((c) => ({ ...c }));
    const rl = RL();
    for (const c of crateList) {
      const g = new T.Group(), y = groundAt(c.x, c.z);
      const wood = rl ? rl.mats.deck : new T.MeshStandardMaterial({ color: '#8a6a45' });
      const body = new T.Mesh(new T.BoxGeometry(0.56, 0.4, 0.42), wood);
      body.position.y = 0.2;
      const band = new T.Mesh(new T.BoxGeometry(0.6, 0.06, 0.46), new T.MeshStandardMaterial({ color: '#3b2f25', roughness: 0.6, metalness: 0.3 }));
      band.position.y = 0.33;
      const tag = new T.Mesh(new T.BoxGeometry(0.16, 0.12, 0.02), new T.MeshStandardMaterial({ color: '#ffd34d', emissive: '#ffb347', emissiveIntensity: 0.6 }));
      tag.position.set(0, 0.2, 0.22);
      for (const m of [body, band]) { m.castShadow = true; m.receiveShadow = true; }
      g.add(body, band, tag, crateBeam());
      g.position.set(c.x, y - 0.02, c.z);
      g.rotation.set((hash(c.id, 5, seed) - 0.5) * 0.12, hash(c.id, 6, seed) * 6.28, (hash(c.id, 7, seed) - 0.5) * 0.12);
      c.obj = g;
      crateGrp.add(g);
    }
    crateGrp.visible = mode !== 'hero';
    scene.add(crateGrp);
  }
  function updateCrates(t) {
    if (!crateGrp) return;
    crateGrp.visible = mode !== 'hero';
    if (crateBeamMat) crateBeamMat.uniforms.uTime.value = t;
    if (mode !== 'walk') return;
    for (const c of crateList) {
      if (c.opened || Math.hypot(player.x - c.x, player.z - c.z) > 1.25) continue;
      c.opened = true;
      crateGrp.remove(c.obj);
      if (onCrate) onCrate(c.id);
    }
  }
  // 가장 가까운 상자까지 거리와, 지금 보는 방향 기준 화살표 (0 = 앞)
  function nearestCrate() {
    let best = null;
    for (const c of crateList) { if (c.opened) continue; const d = Math.hypot(player.x - c.x, player.z - c.z); if (!best || d < best.d) best = { d, c }; }
    if (!best) return null;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), vx = best.c.x - player.x, vz = best.c.z - player.z;
    const ang = Math.atan2(vx * -fz + vz * fx, vx * fx + vz * fz);
    return { d: best.d, id: best.c.id, arrow: ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'][((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8] };
  }

  // 땅을 얻은 순간: 카메라가 내 땅을 한 바퀴 돌며 비추고 빛가루가 솟는다
  let celebrate = null;
  function celebratePlot(id) {
    const p = plots.find((q) => q.id === id);
    if (!p) return;
    const cc = cellCenter(p), y = groundAt(cc.x, cc.z);
    if (mode === 'game') { focusPlot(id); zoomGoal = -140; }
    // 빛가루: 지도에선 카메라가 60~100m 밖이라 작게 그리면 1~4px로 안 보인다 → 화면 크기 하한을 둔다
    const N = 220, pp = new Float32Array(N * 3), pv = new Float32Array(N * 3), pa = new Float32Array(N), ps = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * 6.283, r = Math.random() * 4.2;
      pp[i * 3] = cc.x + Math.cos(a) * r; pp[i * 3 + 1] = y + 0.2; pp[i * 3 + 2] = cc.z + Math.sin(a) * r;
      pv[i * 3] = Math.cos(a) * 0.6; pv[i * 3 + 1] = 2.5 + Math.random() * 6; pv[i * 3 + 2] = Math.sin(a) * 0.6;
      ps[i] = 0.25 + Math.random() * 0.4;
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pp, 3).setUsage(T.DynamicDrawUsage));
    g.setAttribute('aAlpha', new T.BufferAttribute(pa, 1).setUsage(T.DynamicDrawUsage));
    g.setAttribute('aSize', new T.BufferAttribute(ps, 1));
    const m = new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, uniforms: { uVH: { value: 600 }, uLinPow: LINPOW },
      vertexShader: 'attribute float aAlpha, aSize; uniform float uVH; varying float vA; void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = clamp(aSize * uVH / max(0.5, -mv.z), uVH * (0.004 + aSize * 0.012), uVH * 0.04); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uLinPow; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(pow(vec3(1.0, 0.85, 0.4), vec3(uLinPow)) * vA, smoothstep(0.5, 0.0, d) * vA); }',
    });
    if (celebrate) scene.remove(celebrate.pts);
    const pts = new T.Points(g, m);
    pts.frustumCulled = false;
    scene.add(pts);
    celebrate = { pts, pp, pv, pa, g, m, t: 0 };
  }
  function updateCelebrate(dt) {
    const c = celebrate;
    if (!c) return;
    c.t += dt;
    c.m.uniforms.uVH.value = renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    for (let i = 0; i < c.pa.length; i++) {
      c.pv[i * 3 + 1] -= 2.2 * dt;
      c.pp[i * 3] += c.pv[i * 3] * dt; c.pp[i * 3 + 1] += c.pv[i * 3 + 1] * dt; c.pp[i * 3 + 2] += c.pv[i * 3 + 2] * dt;
      c.pa[i] = Math.max(0, 1 - c.t / 3.2) * (0.6 + 0.4 * Math.sin(c.t * 12 + i));
    }
    c.g.attributes.position.needsUpdate = true;
    c.g.attributes.aAlpha.needsUpdate = true;
    if (mode === 'game' && c.t < 3) userTheta += dt * 0.35; // 천천히 한 바퀴
    if (c.t > 3.4) { scene.remove(c.pts); c.g.dispose(); celebrate = null; }
  }

  // ---------- 지도 카메라 초점: 땅을 고르면 그 땅으로 날아가 가까이 ----------
  const camFocus = new T.Vector3(), focusGoal = new T.Vector3();
  let zoomGoal = null;
  function focusPlot(id) {
    const p = id !== null && id !== undefined ? plots.find((q) => q.id === id) : null;
    if (!p) { focusGoal.set(0, 0, 0); zoomGoal = 0; return; }
    const cc = cellCenter(p);
    // 아래쪽 정보 카드에 가리지 않게 카메라 쪽으로 조금 당겨서 땅이 화면 위쪽 가운데에 오게
    const th = theta + userTheta;
    // 높은 땅(분화구 호숫가 등)은 초점도 그 높이로 (해수면 기준이면 땅이 화면 맨 위 상단바 밑으로 밀려난다)
    focusGoal.set(cc.x + Math.sin(th) * 3, Math.max(0, groundAt(cc.x, cc.z)) * 0.9, cc.z + Math.cos(th) * 3);
    zoomGoal = -105;
  }
  function clampFocus() { const r = Math.hypot(focusGoal.x, focusGoal.z); if (r > 110) focusGoal.multiplyScalar(110 / r); }

  // ---------- 입력 ----------
  const ray = new T.Raycaster(), ndc = new T.Vector2(), seaPlane = new T.Plane(new T.Vector3(0, 1, 0), 0);
  let pickPt = null; // 마지막으로 누른 자리 (낙하 지점 후보)
  function plotAtEvent(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(terrain, false)[0];
    // 물 위를 누르면 수면 자리 (지형 밖 먼 바다는 해수면과 만나는 곳)
    let pt = hit ? hit.point : ray.ray.intersectPlane(seaPlane, new T.Vector3());
    if (pt) { const ws = waterState(pt.x, pt.z); pt = { x: pt.x, z: pt.z, y: Math.max(ws.ground, ws.level !== null ? ws.level : -99, 0) }; }
    pickPt = pt && canDrop(pt.x, pt.z) ? pt : null;
    return hit ? plotAt(hit.point.x, hit.point.z) : null;
  }

  function bindInput(el) {
    const wake = () => { gestured = true; if (!fallMuted) startFallAudio(); };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    let down = null, pinch = null;
    const touches = new Map(), gt = new Map();
    el.addEventListener('pointerdown', (e) => {
      if (mode === 'walk') {
        if (!inputOn) return;
        if (e.pointerType === 'mouse') {
          if (document.pointerLockElement !== el && el.requestPointerLock) el.requestPointerLock();
          return;
        }
        const r = el.getBoundingClientRect();
        touches.set(e.pointerId, { kind: e.clientX - r.left < r.width / 2 ? 'move' : 'look', x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY });
        el.setPointerCapture(e.pointerId);
        return;
      }
      if (mode !== 'game') return;
      if (e.pointerType === 'touch') {
        gt.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (gt.size === 2) {
          const [a, b] = [...gt.values()];
          pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), z0: userZoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, f0: focusGoal.clone() };
          down = null;
          zoomGoal = null;
          el.setPointerCapture(e.pointerId);
          return;
        }
      }
      down = { x: e.clientX, y: e.clientY, th: userTheta, ti: userTilt, moved: false };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (mode === 'walk') {
        const t = touches.get(e.pointerId);
        if (t && inputOn) {
          if (t.kind === 'move') {
            joy.x = Math.max(-1, Math.min(1, (e.clientX - t.x0) / 60));
            joy.y = Math.max(-1, Math.min(1, (e.clientY - t.y0) / 60));
            joy.far = Math.hypot(e.clientX - t.x0, e.clientY - t.y0) > 110; // 멀리 끌면 전력 질주
          } else {
            player.yaw -= (e.clientX - t.x) * 0.005;
            player.pitch = Math.max(hero ? -0.75 : -1.2, Math.min(hero ? 0.55 : 1.2, player.pitch - (e.clientY - t.y) * 0.005));
          }
          t.x = e.clientX;
          t.y = e.clientY;
        }
        return;
      }
      if (mode !== 'game') return;
      if (e.pointerType === 'touch' && gt.has(e.pointerId)) {
        gt.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch && gt.size >= 2) {
          const [a, b] = [...gt.values()];
          userZoom = Math.max(-170, Math.min(50, pinch.z0 + (pinch.d0 - Math.hypot(a.x - b.x, a.y - b.y)) * 0.6));
          const k = (cam.dist + userZoom) / 700, th = theta + userTheta, mdx = (a.x + b.x) / 2 - pinch.mx, mdy = (a.y + b.y) / 2 - pinch.my;
          focusGoal.set(pinch.f0.x - mdx * k * Math.cos(th) - mdy * k * Math.sin(th), pinch.f0.y, pinch.f0.z + mdx * k * Math.sin(th) - mdy * k * Math.cos(th));
          clampFocus();
          return;
        }
      }
      if (down) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (Math.abs(dx) + Math.abs(dy) > 5) down.moved = true;
        if (down.moved) {
          userTheta = down.th - dx * 0.006;
          userTilt = Math.max(-0.35, Math.min(0.45, down.ti - dy * 0.004));
          el.style.cursor = 'grabbing';
        }
        return;
      }
      const p = plotAtEvent(e);
      const id = p ? p.id : null;
      if (id !== hoverId) { hoverId = id; if (onHover) onHover(p); }
      el.style.cursor = p ? 'pointer' : 'grab';
    });
    const end = (e) => {
      gt.delete(e.pointerId);
      if (gt.size < 2) pinch = null;
      if (mode === 'walk') {
        const t = touches.get(e.pointerId);
        if (t && t.kind === 'move') { joy.x = 0; joy.y = 0; joy.far = false; }
        touches.delete(e.pointerId);
        return;
      }
      if (mode !== 'game' || !down) return;
      const moved = down.moved;
      down = null;
      el.style.cursor = 'grab';
      if (!moved && onPick) { const p = plotAtEvent(e); onPick(p, pickPt); }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', () => { if (mode === 'game') hoverId = null; });
    el.addEventListener('wheel', (e) => {
      if (mode !== 'game') return;
      e.preventDefault();
      zoomGoal = null;
      userZoom = Math.max(-170, Math.min(50, userZoom + e.deltaY * 0.12));
    }, { passive: false });

    document.addEventListener('mousemove', (e) => {
      if (mode !== 'walk' || document.pointerLockElement !== el || !inputOn) return;
      player.yaw -= e.movementX * 0.0022;
      player.pitch = Math.max(hero ? -0.75 : -1.2, Math.min(hero ? 0.55 : 1.2, player.pitch - e.movementY * 0.0022));
    });
    window.addEventListener('keydown', (e) => {
      if (mode !== 'walk') return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      keys[e.code] = true;
      if (e.code === 'KeyE' && inputOn && onInteract) onInteract(plotAt(player.x, player.z));
      if (e.code === 'Space' && !e.repeat) jump();
    });
    window.addEventListener('keyup', (e) => { keys[e.code] = false; });
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  }

  // ---------- 루프 ----------
  function placeBeam(b, id) {
    const p = id ? plots.find((q) => q.id === id) : null;
    b.visible = !!p && mode === 'game';
    if (p) { const cc = cellCenter(p); b.position.set(cc.x, heightAt(cc.x, cc.z) - 0.3, cc.z); }
  }

  function loop() {
    const dt = Math.min(0.1, clock.getDelta()), t = clock.elapsedTime;
    waterMat.uniforms.uTime.value = t;
    if (I.real) {
      I.real.R.wind.value = t;
      // 풀잎 최소 폭: 화면 1픽셀이 거리 1에서 몇 m인지 (멀리 풀잎이 1픽셀 아래로 가늘어져 반짝이지 않게)
      if (I.real.R.grassUni) I.real.R.grassUni.uPx.value = (0.85 * 2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, renderer.domElement.height);
    }
    sparkMat.uniforms.uTime.value = t;
    beamSel.material.uniforms.uTime.value = t;
    updateCamera(dt);
    placeBeam(beamSel, selId);
    placeBeam(beamHover, hoverId !== selId ? hoverId : null);

    for (const grp of flags.values()) {
      const u = grp.userData;
      const k = Math.min(1, (t - u.born) / 0.5);
      const c1 = 1.70158, c3 = c1 + 1;
      grp.scale.setScalar((u.scale || 1) * (k < 1 ? Math.max(0.01, 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2)) : 1));
      const pa = u.flag.geometry.attributes.position, base = u.flag.userData.base;
      for (let i = 0; i < pa.count; i++) {
        const x = base[i * 3];
        pa.setZ(i, Math.sin(x * 7 - t * 5 + u.phase) * 0.07 * (x / 0.72));
      }
      pa.needsUpdate = true;
      if (u.glow) u.glow.material.opacity = 0.65 + Math.sin(t * 2.5) * 0.25;
    }
    updateFauna(dt, t);
    updateLife(dt, t);
    updateWild(dt, t);
    { const nt = curPal ? curPal.stars : 0; for (let i = hutLamps.length - 1; i >= 0; i--) { const l = hutLamps[i]; let o = l.glow; while (o.parent) o = o.parent; if (o !== scene) { hutLamps.splice(i, 1); continue; } l.mat.emissiveIntensity = 0.2 + nt * 2.2; l.glow.material.opacity = nt * (0.75 + Math.sin(t * 2.1) * 0.08); } }
    updateCelebrate(dt);
    updateCrates(t);
    updateRipples(dt);
    updateFernLod();
    updateCarpet();
    updateWaterfall(t, dt);
    if (mistGrp) for (const sp of mistGrp.children) sp.position.y = sp.userData.y + Math.sin(t * 0.3 + sp.userData.ph) * 0.6;
    if (lampGlow) { const night = curPal ? curPal.stars : 0; lampGlow.material.opacity = 0.55 + Math.sin(t * 1.8) * 0.35; lampGlow.scale.setScalar(1.6 + night * 3.5); }
    for (const b of bobbers) { b.o.position.y = b.y + Math.sin(t * 1.2 + b.ph) * 0.04; b.o.rotation.z = Math.sin(t * 0.9 + b.ph) * (b.roll || 0.05); }
    const night = curPal ? curPal.stars : 0;
    _cloudCol.set(curPal ? curPal.hor : '#ffffff').lerp(_white, 0.65).multiplyScalar(1 - night * 0.72);
    for (const c of clouds) {
      c.position.x += c.userData.v * dt;
      if (c.position.x > 320) c.position.x = -320;
      const fade = mode === 'game' ? ss(110, 175, Math.hypot(c.position.x, c.position.z)) : 1;
      for (const sp of c.children) { sp.material.color.copy(_cloudCol); sp.material.opacity = 0.85 * (1 - night * 0.45) * fade; }
    }
    if (mistGrp) for (const sp of mistGrp.children) sp.material.color.copy(_cloudCol);
    for (const g of gulls) {
      const u = g.userData;
      u.a += u.v * dt;
      g.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(t * 0.7 + u.ph) * 0.6, Math.sin(u.a) * u.r);
      g.rotation.y = -u.a + (u.v > 0 ? 0 : Math.PI);
      g.rotation.z = Math.sin(t * 0.5 + u.ph) * 0.2;
      const pa = g.geometry.attributes.position, flap = Math.sin(t * 7 + u.ph) * 0.22;
      pa.setY(2, flap);
      pa.setY(5, flap);
      pa.needsUpdate = true;
    }
    if (mode === 'game') {
      const ok = 'g' + selId + ownerSig;
      if (ok !== outlineKey) { outlineKey = ok; setOutline(selId ? plots.find((q) => q.id === selId) : null, '#ffffff'); }
    } else if (mode === 'hero') outline.visible = false;
    depthPass();
    if (post && !post.off) renderPost(); else renderer.render(scene, camera);
    watchFps(dt);
    requestAnimationFrame(loop);
  }

  // ---------- 공개 API ----------
  function rebuild(ps, sd) {
    plots = ps;
    seed = sd >>> 0;
    field = buildField(ps, seed);
    // 강 점은 격자 좌표로 팠다 → 화면 좌표로 옮겨야 리본·물 판정·식생이 실제 파인 물길과 맞는다 (해안 쪽은 지형이 최대 3.5 비틀려 그려진다)
    if (field.river) for (const r of field.river) { const [wx, wz] = unwarp(r.x, r.z); r.x = wx; r.z = wz; }
    carveCanyon();
    if (terrain) { scene.remove(terrain); terrain.geometry.dispose(); }
    decor.forEach((d) => scene.remove(d));
    flags.forEach((f) => scene.remove(f));
    flags.clear();
    flagKeys.clear();
    sync.owners = '';
    if (sparks) { scene.remove(sparks); sparks.geometry.dispose(); }
    if (landTex) landTex.dispose();
    terrain = buildTerrain();
    terrain.layers.enable(DEPTH_LAYER);
    // 지형판(280m) 바깥 바다 밑: 깊은 바닥판을 넓게 깔아 지형판 가장자리가 지도에서 사각 경계선으로 보이지 않게
    // (물 너머로 지형판 안은 바닥이, 바깥은 하늘이 비쳐 색이 달라 보였다)
    if (!seaFloor) {
      seaFloor = new T.Mesh(new T.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: '#0c2a3a', roughness: 1 }));
      seaFloor.position.y = -7.6;
      seaFloor.receiveShadow = false;
      scene.add(seaFloor);
    }
    decor = buildDecor();
    buildCarpet();
    for (const m of decor) if (RL() && m.material === RL().mats.rock) m.layers.enable(DEPTH_LAYER);
    if (riverMesh) scene.remove(riverMesh);
    if (mistGrp) scene.remove(mistGrp);
    riverMesh = buildRiver();
    mistGrp = buildMist();
    if (fallGrp) scene.remove(fallGrp);
    fallGrp = buildWaterfall();
    if (fallGrp) scene.add(fallGrp);
    if (streamGrp) scene.remove(streamGrp);
    streamGrp = buildStream();
    if (streamGrp) scene.add(streamGrp);
    if (rockFaceGrp) scene.remove(rockFaceGrp);
    rockFaceGrp = buildRockFaces();
    if (rockFaceGrp) scene.add(rockFaceGrp);
    buildTerritory();
    if (mode === 'hero' && !trans) applyPalette(PALETTE.hero);
    if (riverMesh) scene.add(riverMesh);
    if (mistGrp) scene.add(mistGrp);
    landTex = buildLandTexture();
    waterMat.uniforms.uLand.value = landTex;
    scene.add(terrain, ...decor);
    if (landmarks) scene.remove(landmarks);
    landmarks = buildLandmarks();
    scene.add(landmarks);
    if (faunaGrp) scene.remove(faunaGrp);
    const fa = buildFauna();
    faunaGrp = fa.grp;
    animals = fa.list;
    scene.add(faunaGrp);
    ownerSig = '';
    sync(ps);
  }

  function sync(ps) {
    plots = ps;
    const now = Date.now();
    const keyOf = (p) => (p.owner ? p.owner + '|' + (p.buildings || []).join(',') + '|' + (I.guard && I.guard.status(p, now) === 'open' ? 'open' : 'ok') + '|' + Math.min(4, p.tenants || 0) : '');
    const sig = ps.map(keyOf).join(',');
    if (sig === ownerSig) return;
    const ownersChanged = ps.map((p) => p.owner || '-').join(',') !== (sync.owners || '');
    sync.owners = ps.map((p) => p.owner || '-').join(',');
    ownerSig = sig;
    for (const p of ps) {
      const k = keyOf(p);
      if (flagKeys.get(p.id) === k) continue;
      if (flags.has(p.id)) {
        scene.remove(flags.get(p.id));
        flags.delete(p.id);
        trunks = trunks.filter((t) => t.flag !== p.id);
      }
      flagKeys.set(p.id, k);
      if (p.owner) {
        const f = makeFlag(p);
        flags.set(p.id, f);
        scene.add(f);
      }
    }
    if (!ownersChanged) return;
    paintTerritory();
    if (sparks) { scene.remove(sparks); sparks.geometry.dispose(); }
    sparks = buildSparks();
    scene.add(sparks);
    if (mode === 'walk') player.plotId = -1;
  }

  let dprCap = 2; // 프레임이 계속 낮으면 watchFps가 낮춘다
  function resize() {
    const el = renderer.domElement.parentElement;
    const w = el.clientWidth, h = el.clientHeight;
    // 렌더 화소 상한(약 230만): 레티나 큰 화면에서 프레임이 반토막 나지 않게 (MSAA·블룸이라 화질 차이는 작다)
    renderer.setPixelRatio(Math.max(1, Math.min(window.devicePixelRatio || 1, dprCap, Math.sqrt(2.3e6 / Math.max(1, w * h)))));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = mode === 'walk' ? (hero ? 58 : 72) : w < 700 ? 52 : 40;
    camera.updateProjectionMatrix();
    viewOff = -1; // 크기가 바뀌면 화면 올림(세로 지도)도 다시 계산
    sparkMat.uniforms.uScale.value = h / 800;
  }

  function init(container, ps, sd) {
    T.ColorManagement.legacyMode = false;
    renderer = new T.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    if (renderer.capabilities.isWebGL2) { post = createPost(); LINPOW.value = 2.2; }
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block', touchAction: 'none' });
    container.appendChild(renderer.domElement);

    scene = new T.Scene();
    scene.fog = new T.Fog('#e4f1fb', 380, 1500);
    camera = new T.PerspectiveCamera(40, 1, 0.8, 3200);
    makeMaterials();
    GLOW_TEX = glowTexture();

    sky = new T.Mesh(new T.SphereGeometry(1500, 32, 16), skyMat);
    scene.add(sky);
    const sp = [];
    for (let i = 0; i < 700; i++) {
      const a = Math.random() * Math.PI * 2, y = 0.08 + Math.random() * 0.92;
      const r = Math.sqrt(1 - y * y);
      sp.push(Math.cos(a) * r * 1450, y * 1450, Math.sin(a) * r * 1450);
    }
    const sg = new T.BufferGeometry();
    sg.setAttribute('position', new T.Float32BufferAttribute(sp, 3));
    stars = new T.Points(sg, starMat);
    scene.add(stars);

    hemi = new T.HemisphereLight('#ffffff', '#444444', 0.6);
    key = new T.DirectionalLight('#ffffff', 1.2);
    key.castShadow = true;
    key.shadow.mapSize.set(4096, 4096);
    const sc = key.shadow.camera;
    sc.left = -125; sc.right = 125; sc.top = 125; sc.bottom = -125; sc.near = 1; sc.far = 420;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.04;
    scene.add(hemi, key);

    water = new T.Mesh(new T.PlaneGeometry(3000, 3000, 300, 300).rotateX(-Math.PI / 2), waterMat);
    water.renderOrder = 2;
    scene.add(water);
    scene.add(buildMiasma());

    outline = new T.LineSegments(new T.BufferGeometry(), outlineMat);
    outline.visible = false;
    outline.renderOrder = 6;
    scene.add(outline);

    beamSel = beam('#ffffff', 0.85); // 선택은 흰색 (내 땅의 금색·푸른 무리 색과 헷갈리지 않게)
    beamHover = beam('#ffffff', 0.25);
    scene.add(beamSel, beamHover);
    buildRipples();
    gulls = buildGulls();
    scene.add(...gulls);

    applyPalette(PALETTE.hero);
    rebuild(ps, sd);
    bindInput(renderer.domElement);
    if (I.real)
      I.real.loadAll(renderer, scene)
        .then((rl) => {
          waterMat.uniforms.uNormals.value = rl.tex.water;
          hemi.intensity = curPal.hemi;
          rebuild(plots, seed);
          scene.add(...(clouds = buildClouds()));
          setCharacter(heroGender);
        })
        .catch((err) => console.warn('[island] 실사 에셋을 못 불러와 기본 도형으로 그립니다:', err && err.message));
    new ResizeObserver(resize).observe(container);
    resize();
    requestAnimationFrame(loop);
  }

  function setMode(m) {
    if (m === mode) return;
    const prev = mode;
    mode = m;
    if (prev === 'hero' || m === 'hero') tween = { pos: camera.position.clone(), quat: camera.quaternion.clone(), t0: performance.now(), dur: 2.4 };
    if (prev === 'walk' || m === 'walk') {
      tween = { pos: camera.position.clone(), quat: camera.quaternion.clone(), t0: performance.now(), dur: 1.6 };
      if (document.pointerLockElement) document.exitPointerLock();
      for (const k in keys) keys[k] = false;
      joy.x = joy.y = 0; joy.far = false;
      outline.visible = false;
      outlineKey = '';
      player.plotId = -1;
    }
    trans = { from: { ...cam }, to: m === 'walk' ? 'game' : m, k: 0, t0: performance.now(), dur: m === 'walk' ? 1.6 : 1.8, palFrom: curPal };
    if (hero) hero.obj.visible = m === 'walk';
    if (m === 'hero') { userTheta = 0; userTilt = 0; userZoom = 0; hoverId = null; focusGoal.set(0, 0, 0); zoomGoal = null; }
    renderer.domElement.style.cursor = m === 'game' ? 'grab' : m === 'walk' ? 'crosshair' : 'default';
    // 깊이 정밀도: 걷기는 가까이(0.08~1700), 조감은 멀리(0.8~3200) — 먼 지형·물의 지글거림 방지
    camera.near = m === 'walk' ? 0.08 : 0.8;
    camera.far = m === 'walk' ? 1700 : 3200;
    camera.updateProjectionMatrix();
    resize();
  }

  // ---------- 낙하: 지도에서 고른 자리로 하늘에서 내려간다 ----------
  const DROP_LIM = POLLUTION_R - 10;
  function canDrop(x, z) { return isFinite(x) && isFinite(z) && Math.hypot(x, z) < DROP_LIM; }
  function dropAt(x, z) {
    if (!canDrop(x, z)) return false;
    // 나무 수관·지붕 바로 위면 가까운 빈 자리로 비킨다 (잎을 뚫고 떨어지지 않게)
    const covered = (px, pz) => trunks.some((t) => {
      const d2 = (px - t.x) ** 2 + (pz - t.z) ** 2;
      return t.h ? d2 < (t.h * 0.3 + 0.25) ** 2 : t.top !== undefined && d2 < (t.r + 0.3) ** 2;
    });
    if (covered(x, z)) {
      let best = null;
      for (let r = 0.4; r <= 6 && !best; r += 0.4)
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * 6.283, qx = x + Math.sin(a) * r, qz = z + Math.cos(a) * r;
          if (canDrop(qx, qz) && !covered(qx, qz) && !hitTrunk(qx, qz)) { best = { x: qx, z: qz }; break; }
        }
      if (best) { x = best.x; z = best.z; }
    }
    // 줄기·바위 안으로 떨어지지 않게 밖으로 민다
    for (let it = 0; it < 4; it++) {
      const t = hitTrunk(x, z);
      if (!t) break;
      const ox = x - t.x, oz = z - t.z, d = Math.hypot(ox, oz) || 1e-3;
      x = t.x + (ox / d) * (t.r + PR + 0.05); z = t.z + (oz / d) * (t.r + PR + 0.05);
    }
    // 지도에서 보던 방향 그대로 내려간다 (화면이 휙 돌지 않게)
    const fw = new T.Vector3();
    camera.getWorldDirection(fw);
    player.x = x; player.z = z;
    player.yaw = Math.atan2(-fw.x, -fw.z);
    player.face = player.yaw + Math.PI;
    player.pitch = -0.12;
    player.by = undefined; player.jy = DROP_H; player.vy = 0; player.air = true; player.drop = true; player.tilt = 1.2; player.roll = 0; player.land = 0;
    hoverId = null;
    setMode('walk');
    return true;
  }
  // 3D 자리 → 화면 좌표 (지도 위 낙하 표시용)
  const _sp = new T.Vector3();
  function toScreen(x, y, z) {
    _sp.set(x, y, z).project(camera);
    const el = renderer.domElement;
    return { x: ((_sp.x + 1) / 2) * el.clientWidth, y: ((1 - _sp.y) / 2) * el.clientHeight, on: _sp.z < 1 && Math.abs(_sp.x) < 1.05 && Math.abs(_sp.y) < 1.05 };
  }

  function enterWalk(plot) {
    player.drop = false; player.tilt = 0; player.roll = 0; player.land = 0;
    const s = spawnFor(plot);
    player.x = s.x;
    player.z = s.z;
    player.yaw = s.yaw;
    player.face = player.yaw + Math.PI;
    player.pitch = hero ? -0.04 : -0.06;
    player.by = undefined; player.jy = 0; player.vy = 0; player.air = false;
    hoverId = null;
    setMode('walk');
  }

  I.world = {
    init, rebuild, sync, setMode, enterWalk, dropAt, canDrop, toScreen,
    resync(ps) { ownerSig = ''; sync.owners = ''; flagKeys.clear(); sync(ps); }, // 매장량·신호까지 바뀌었을 때 (서버 시즌에 맞춤)
    mode: () => mode,
    ready: () => !!field,
    jump,
    // 확인용: 카메라를 (위치 → 바라볼 곳)에 고정. viewAt(null)로 해제
    viewAt(p, q) {
      if (!p) { dbgCam = null; return; }
      const pos = new T.Vector3(...p), m = new T.Matrix4().lookAt(pos, new T.Vector3(...q), new T.Vector3(0, 1, 0));
      dbgCam = { pos, quat: new T.Quaternion().setFromRotationMatrix(m) };
    },
    fallPos: () => (field && field.fall ? [field.fall.cx, field.fall.bottom, field.fall.cz, field.fall.fx, field.fall.fz] : null),
    streamPts: () => (field && field.stream ? field.stream.samples.filter((q) => !q.tail).map((q) => [+q.x.toFixed(2), +q.z.toFixed(2), +q.L.toFixed(2), q.k, +q.u.toFixed(2), +q.nx.toFixed(3), +q.nz.toFixed(3), +q.tx.toFixed(3), +q.tz.toFixed(3)]) : null),
    waterAt: (x, z) => waterState(x, z),
    focusPlot,
    setPost: (on) => { if (post) post.off = !on; LINPOW.value = post && !post.off ? 2.2 : 1.0; },
    plotTags,
    celebratePlot,
    lifeSpots: () => (lifeFx ? { fish: lifeFx.schools.map((q) => [q.x, q.z]), butterflies: lifeFx.butter.length } : null),
    craterPos: () => (field && field.crater ? [field.crater.x, field.crater.level, field.crater.z, field.crater.R] : null),
    setSound: (on) => { fallMuted = !on; if (on && gestured) startFallAudio(); }, // 사용자 동작 뒤에만 오디오를 만든다
    soundOn: () => !fallMuted,
    audioLive: () => !!(fallAudio && fallAudio.ctx && fallAudio.ctx.state === 'running' && !fallMuted),
    _fall: () => fallGrp && fallGrp.children[0] && fallGrp.children[0].geometry.boundingSphere,
    pollution: () => (mode === 'walk' ? POLLUTION_R - 6 - Math.hypot(player.x, player.z) : 999),
    setCharacter,
    timeLabel: () => timeLabel(dayPhase()),
    setPhase(v) { phaseOverride = v; },
    getPhase: () => phaseOverride, // 고정된 시간대 (null = 실제 시간)
    _dbg: () => ({ camera, scene, renderer, cam, player, trunks, heightAt, hero, field, grassDensity, carpet, wildFx }),
    select(id) { selId = id; },
    setInput(on) {
      inputOn = on;
      if (!on) { for (const k in keys) keys[k] = false; joy.x = joy.y = 0; joy.far = false; if (document.pointerLockElement) document.exitPointerLock(); }
    },
    walkPlot: () => (mode === 'walk' ? plotAt(player.x, player.z) : null),
    wet: () => (mode === 'walk' ? waterState(player.x, player.z) : null),
    onPick(fn) { onPick = fn; },
    onHover(fn) { onHover = fn; },
    onWalkPlot(fn) { onWalkPlot = fn; },
    onInteract(fn) { onInteract = fn; },
    // 보급 상자
    crateSpot, setCrates, nearestCrate,
    onCrate(fn) { onCrate = fn; },
  };
})(window.Island);
