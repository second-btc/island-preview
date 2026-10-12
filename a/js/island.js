// 섬 생성: 모양, 지형, 매장량(합계 정확히 TOTAL_TOKENS), 탐사 신호
(function (I) {
  const C = I.config;

  // shapeSeed: 섬 모양(모두가 같은 '마지막 섬'), treasureSeed: 보물 배치(시즌마다 새로)
  function generate(shapeSeed, treasureSeed) {
    const r = I.rng.make(shapeSeed);
    const t = I.rng.make(treasureSeed === undefined ? shapeSeed : treasureSeed);
    const G = C.GRID;
    const c = (G - 1) / 2;
    const maxD = Math.hypot(c, c);

    // 중심에서 멀수록 낮고, 노이즈를 섞은 높이값
    const phase1 = r() * 6.28, phase2 = r() * 6.28;
    const h = [];
    for (let y = 0; y < G; y++)
      for (let x = 0; x < G; x++)
        {
          // 곶과 만이 생기도록 방향에 따라 굴곡을 준다
          const d = Math.hypot(x - c, y - c) / maxD, a = Math.atan2(y - c, x - c);
          const lobe = 0.22 * Math.sin(a * 3 + phase1) + 0.12 * Math.sin(a * 5 + phase2);
          h.push(1 - d * 1.15 + lobe * d * 1.6 + (r() - 0.5) * 0.5);
        }

    // 한 번 평활화해서 덩어리진 섬 모양으로
    const sm = h.map((_, i) => {
      const x = i % G, y = (i / G) | 0;
      let t = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= G || yy >= G) continue;
          const w = dx || dy ? 1 : 2;
          t += h[yy * G + xx] * w;
          n += w;
        }
      return t / n;
    });

    // 높은 순으로 LAND_PLOTS개 = 육지. 높을수록 산, 낮을수록 해변
    const land = sm.map((_, i) => i).sort((a, b) => sm[b] - sm[a]).slice(0, C.LAND_PLOTS);
    const plots = land.map((i, rank) => ({
      x: i % G,
      y: (i / G) | 0,
      terrain: rank < C.LAND_PLOTS * 0.12 ? 'mountain' : rank < C.LAND_PLOTS * 0.6 ? 'forest' : 'beach',
    }));
    plots.sort((a, b) => a.y - b.y || a.x - b.x);

    // 매장량: 파레토 표본을 비율로 정규화 → 상한 초과분은 나머지에 비례 재배분 → 합계 보정
    const share = plots.map(() => Math.pow(1 - t(), -1 / C.PARETO_ALPHA));
    const capped = new Set();
    for (;;) {
      const free = share.reduce((s, v, k) => (capped.has(k) ? s : s + v), 0);
      const room = 1 - capped.size * C.MAX_SHARE;
      share.forEach((v, k) => { if (!capped.has(k)) share[k] = (v / free) * room; });
      const over = share.map((v, k) => k).filter((k) => !capped.has(k) && share[k] > C.MAX_SHARE);
      if (!over.length) break;
      over.forEach((k) => { capped.add(k); share[k] = C.MAX_SHARE; });
    }
    let total = 0;
    plots.forEach((p, k) => {
      p.reserve = Math.floor(share[k] * C.TOTAL_TOKENS);
      total += p.reserve;
    });
    plots.reduce((a, b) => (b.reserve > a.reserve ? b : a)).reserve += C.TOTAL_TOKENS - total;

    // 칸을 LOT_SPLIT×LOT_SPLIT 구획으로 쪼갠다 (섬 모양·지형은 칸 단위 그대로, 소유는 구획 단위)
    // 구획 매장량 = 칸 매장량을 무작위 비율로 나눔 (칸 합계는 그대로 → 섬 전체 합계도 그대로)
    const L = C.LOT_SPLIT || 1;
    if (L > 1) {
      const lots = [];
      plots.forEach((c, ci) => {
        const w = [];
        for (let q = 0; q < L * L; q++) w.push(0.5 + t());
        const sw = w.reduce((a, b) => a + b, 0);
        let used = 0;
        for (let q = 0; q < L * L; q++) {
          const reserve = q === L * L - 1 ? c.reserve - used : Math.floor((c.reserve * w[q]) / sw);
          used += reserve;
          lots.push({ x: c.x, y: c.y, q, cell: ci + 1, fx: c.x * L + (q % L), fy: c.y * L + Math.floor(q / L), terrain: c.terrain, reserve });
        }
      });
      lots.sort((a, b) => a.fy - b.fy || a.fx - b.fx);
      plots.length = 0;
      plots.push(...lots);
    }

    // 탐사 신호 1~5: 매장량 순위 기반 + 오차
    const order = plots.map((p, k) => k).sort((a, b) => plots[a].reserve - plots[b].reserve);
    order.forEach((k, rank) => {
      let lv = 1 + Math.floor((rank / (plots.length - 1)) * 4.999);
      if (t() < C.SIGNAL_NOISE) lv += t() < 0.5 ? -1 : 1;
      plots[k].signal = Math.max(1, Math.min(5, lv));
    });

    plots.forEach((p, k) => {
      p.id = k + 1;
      p.owner = null;
      p.mined = 0;
      p.pity = 0;
      p.buildings = []; // 확장: 공장·시설
      p.defense = 0;    // 확장: 군사·약탈
    });
    return plots;
  }

  function jackpotLine(plots) {
    const s = plots.map((p) => p.reserve).sort((a, b) => b - a);
    return s[Math.max(0, Math.ceil(s.length * C.JACKPOT_TOP) - 1)];
  }

  I.island = { generate, jackpotLine };
})(window.Island);
