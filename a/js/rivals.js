// NPC 라이벌: 시간이 지나면 빈 구역을 가져간다. 땅이 줄수록 더 공격적.
(function (I) {
  const C = I.config;

  // 다른 플레이어('p:코드')는 코드로 정한 색·이름 (내 금색·무리 색과 겹치지 않는 차분한 색 고리)
  const PLAYER_HUES = ['#5fd0a8', '#e58fd0', '#9fcf4a', '#f0a868', '#7fb8ff', '#d9c46a', '#c58cff', '#6fd7e8', '#ff8f8f', '#b7e07a'];
  const pcache = new Map();
  function byId(id) {
    const r = C.RIVALS.find((q) => q.id === id);
    if (r) return r;
    if (typeof id === 'string' && id.startsWith('p:')) {
      if (!pcache.has(id)) {
        let h = 0;
        for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
        pcache.set(id, { id, name: '생존자 ' + id.slice(2), color: PLAYER_HUES[Math.abs(h) % PLAYER_HUES.length], player: true });
      }
      return pcache.get(id);
    }
    return { id, name: '누군가', color: '#aaaaaa' };
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
