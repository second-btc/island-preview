// 채굴: 소유 구역은 남은 매장량의 일정 비율씩 캔다. 많이 남을수록 빨리 나온다.
// 매장량은 하루에 처음 매장량의 REGEN_PER_DAY씩 다시 차오른다 (처음 매장량은 넘지 않음).
// 필드: reserve = 처음 매장량(불변) · mined = 줄어든 양(reserve - mined = 남은 매장량, 기존 코드와 같은 뜻)
//       dug = 지금까지 캐낸 누적 토큰 · regen = 지금까지 다시 차오른 누적량(공급 상한 계산용)
(function (I) {
  const C = I.config;
  const DAY = 86400;

  // 남은 매장량
  function left(p) {
    return Math.max(0, p.reserve - p.mined);
  }

  // 초당 차오르는 양. 평생 회복 한도(처음 매장량 × REGEN_MAX)를 다 쓰면 0
  function regenRate(p) {
    return (p.regen || 0) < p.reserve * C.REGEN_MAX ? (p.reserve * C.REGEN_PER_DAY) / DAY : 0;
  }

  // 초당 채굴량 (표시용)
  function rate(p) {
    return left(p) * C.MINE_RATE;
  }

  // dt초 동안 진행. 오래 비워도 정확하도록 닫힌 식으로 계산:
  // 남은 양 L: dL/dt = -r·L + g → L(t) = L* + (L0 - L*)·e^(-rt), L* = g/r (처음 매장량의 약 1.7%라 넘칠 일 없음)
  // 캔 양 = 차오른 양(g·dt) + 줄어든 양(L0 - L1)
  function tick(state, dt) {
    if (!(dt > 0)) return;
    for (const p of state.plots) {
      if (p.dug === undefined) p.dug = p.mined || 0; // 옛 저장본: 지금까지 줄어든 양 = 캔 양
      const L0 = left(p), room = Math.max(0, p.reserve * C.REGEN_MAX - (p.regen || 0));
      const g = Math.min(regenRate(p), room / dt);
      if (!p.owner) {
        // 빈 땅: 캐는 사람이 없으니 차오르기만
        const add = Math.min(g * dt, p.reserve - L0);
        if (add > 0) { p.mined -= add; p.regen = (p.regen || 0) + add; }
        continue;
      }
      const r = C.MINE_RATE, Ls = g / r;
      const L1 = Math.min(p.reserve, Ls + (L0 - Ls) * Math.exp(-r * dt));
      const amt = Math.max(0, g * dt + L0 - L1);
      p.mined = p.reserve - L1;
      p.regen = (p.regen || 0) + g * dt;
      if (amt <= 0) continue;
      p.dug += amt;
      if (p.owner === 'me') state.me.tokens += amt;
      else if (state.rivals && state.rivals[p.owner]) state.rivals[p.owner].tokens += amt; // 다른 플레이어('p:…') 몫은 서버가 센다
    }
  }

  I.mining = { rate, tick, left, regenRate };
})(window.Island);
