// NPC 라이벌: 시간이 지나면 빈 구역을 가져간다. 땅이 줄수록 더 공격적.
(function (I) {
  const C = I.config;

  function byId(id) {
    return C.RIVALS.find((r) => r.id === id);
  }

  // 점령이 일어나면 { rival, plot, raid } 반환 (raid: 내 무방비 땅을 빼앗음)
  function tick(state, now, lockedId) {
    if (now < state.nextRivalAt) return null;
    const rival = C.RIVALS[Math.floor(Math.random() * C.RIVALS.length)];
    const schedule = () => {
      const taken = I.difficulty.takenRatio(state);
      const sec = C.RIVAL_SEC_START + (C.RIVAL_SEC_END - C.RIVAL_SEC_START) * taken;
      state.nextRivalAt = now + sec * (0.6 + Math.random() * 0.8) * 1000;
    };

    // 자기 무방비 땅을 다시 순찰하기도 한다 (그래서 내가 빼앗을 기회는 잠깐씩만 열린다)
    const ownOpen = state.plots.filter((p) => p.owner === rival.id && p.id !== lockedId && I.guard.status(p, now) === 'open');
    if (ownOpen.length && Math.random() < C.RIVAL_TEND_CHANCE) ownOpen[Math.floor(Math.random() * ownOpen.length)].tendedAt = now;

    // 내 땅이 무방비면 빼앗으러 온다
    const myOpen = state.plots.filter((p) => p.owner === 'me' && p.id !== lockedId && I.guard.status(p, now) === 'open');
    if (myOpen.length && Math.random() < C.RIVAL_RAID_CHANCE) {
      const plot = myOpen.sort((a, b) => b.reserve - b.mined - (a.reserve - a.mined))[0];
      plot.owner = rival.id;
      plot.buildings = [];
      plot.tendedAt = now;
      schedule();
      return { rival, plot, raid: true };
    }

    const free = state.plots.filter((p) => !p.owner && p.id !== lockedId);
    if (!free.length) { schedule(); return null; }
    let plot;
    if (Math.random() < C.RIVAL_SMART) {
      const best = Math.max(...free.map((p) => p.signal));
      const top = free.filter((p) => p.signal === best);
      plot = top[Math.floor(Math.random() * top.length)];
    } else {
      plot = free[Math.floor(Math.random() * free.length)];
    }
    plot.owner = rival.id;
    plot.tendedAt = now;
    plot.buildings = [];
    schedule();
    return { rival, plot };
  }

  I.rivals = { tick, byId };
})(window.Island);
