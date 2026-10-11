// 남은 땅이 줄수록 비선형으로 어려워진다.
(function (I) {
  const C = I.config;

  function takenRatio(state) {
    const free = state.plots.filter((p) => !p.owner).length;
    return 1 - free / state.plots.length;
  }

  function base(state) {
    return C.DIFF_BASE + C.DIFF_MAX_ADD * Math.pow(takenRatio(state), C.DIFF_EXP);
  }

  function of(state, plot) {
    const d = base(state) + C.TERRAIN_ADJ[plot.terrain] - plot.pity * C.PITY_STEP;
    return Math.max(1, Math.round(d * 100) / 100);
  }

  function stars(d) {
    const n = Math.max(1, Math.min(5, Math.round(d)));
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  I.difficulty = { takenRatio, base, of, stars };
})(window.Island);
