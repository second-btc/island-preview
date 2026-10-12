// 상태 생성·저장·불러오기. 모든 점령/실패는 이벤트 로그로 남긴다(나중에 서버·체인 동기화용).
(function (I) {
  const C = I.config;

  // 나중에 생긴 필드는 기본값으로 채운다 (옛 저장본도 그대로 열리게)
  // dug: 지금까지 캐낸 누적 토큰 (예전엔 mined가 그 뜻이었음) · regen: 다시 차오른 누적량
  function fillPlots(plots) {
    for (const p of plots) {
      if (p.dug === undefined) p.dug = p.mined || 0;
      if (p.regen === undefined) p.regen = 0;
    }
    return plots;
  }

  function create(seed) {
    const now = Date.now();
    return {
      v: 6,
      seed,
      plots: fillPlots(I.island.generate(C.ISLAND_SEED, seed)), // 모양은 고정, 보물 배치만 시즌마다 새로
      me: { tokens: 0, flags: C.FLAGS_MAX, flagAt: now },
      savedAt: now,
      rivals: Object.fromEntries(C.RIVALS.map((r) => [r.id, { tokens: 0 }])),
      log: [], // { type: 'claim' | 'fail' | 'raid'(예약), plotId, by, ts }
      nextRivalAt: now + C.RIVAL_FIRST_DELAY * 1000,
      over: false,
    };
  }

  function save(s) {
    s.savedAt = Date.now();
    try { localStorage.setItem(C.SAVE_KEY, JSON.stringify(s)); } catch (e) { /* 저장 불가 환경: 무시 */ }
  }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(C.SAVE_KEY));
      if (!s || s.v !== 6 || !Array.isArray(s.plots)) return null;
      fillPlots(s.plots);
      return s;
    } catch (e) {
      return null;
    }
  }

  function clear() {
    try { localStorage.removeItem(C.SAVE_KEY); } catch (e) { /* 무시 */ }
  }

  function log(s, e) {
    s.log.push({ ...e, ts: Date.now() });
    if (s.log.length > 500) s.log.shift();
  }

  // 깃발 충전: FLAG_REGEN_SEC마다 1개, 최대 FLAGS_MAX
  function regenFlags(s, now) {
    const me = s.me, R = C.FLAG_REGEN_SEC * 1000;
    if (me.flags >= C.FLAGS_MAX) { me.flagAt = now; return; }
    const n = Math.floor((now - me.flagAt) / R);
    if (n > 0) {
      me.flags = Math.min(C.FLAGS_MAX, me.flags + n);
      me.flagAt = me.flags >= C.FLAGS_MAX ? now : me.flagAt + n * R;
    }
  }

  function nextFlagIn(s, now) {
    if (s.me.flags >= C.FLAGS_MAX) return 0;
    return Math.max(0, s.me.flagAt + C.FLAG_REGEN_SEC * 1000 - now);
  }

  I.state = { create, save, load, clear, log, regenFlags, nextFlagIn };
})(window.Island);
