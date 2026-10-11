// 땅 지키기: 소유한 땅은 보호 시간(기본 48시간) 안에 순찰해야 한다.
// 보호가 끝나면 무방비 → 다른 무리(나중엔 다른 유저)가 퀘스트를 깨서 빼앗을 수 있다.
// 방어 건물은 보호 시간을 늘리고 빼앗는 퀘스트를 더 어렵게 만든다.
(function (I) {
  const C = I.config;

  function windowMs(p) {
    let sec = C.PROTECT_SEC;
    for (const b of p.buildings || []) sec += (C.BUILDINGS[b] || {}).protect || 0;
    return sec * 1000;
  }

  // 보호 남은 시간(ms). 주인 없는 땅은 0
  function left(p, now) {
    if (!p.owner) return 0;
    return (p.tendedAt || 0) + windowMs(p) - now;
  }

  // safe | warn | open(무방비)
  function status(p, now) {
    const l = left(p, now);
    return l <= 0 ? 'open' : l < C.WARN_SEC * 1000 ? 'warn' : 'safe';
  }

  // 빼앗을 때 추가로 성공해야 하는 횟수
  function extraHits(p) {
    let n = C.RAID_EXTRA_HITS;
    for (const b of p.buildings || []) n += (C.BUILDINGS[b] || {}).guard || 0;
    return n;
  }

  function mine(S) {
    return S.plots.filter((p) => p.owner === 'me');
  }

  // 순찰: 내 땅 전부(또는 하나)의 보호 시간을 다시 채운다. 채운 개수 반환
  function patrol(S, now, plot) {
    const list = plot ? [plot] : mine(S);
    let n = 0;
    for (const p of list) {
      if (p.owner !== 'me') continue;
      if (left(p, now) < windowMs(p) - 60 * 1000) n++;
      p.tendedAt = now;
    }
    return n;
  }

  function canBuild(S, p, key) {
    const b = C.BUILDINGS[key];
    if (!b || p.owner !== 'me') return 'no';
    if ((p.buildings || []).includes(key)) return 'built';
    if (S.me.tokens < b.cost) return 'poor';
    return 'ok';
  }

  function build(S, p, key, now) {
    if (canBuild(S, p, key) !== 'ok') return false;
    S.me.tokens -= C.BUILDINGS[key].cost;
    p.buildings = (p.buildings || []).concat(key);
    p.tendedAt = now; // 짓는 것도 순찰로 친다
    return true;
  }

  // 가장 먼저 무방비가 될 내 땅까지 남은 시간
  function soonest(S, now) {
    const ls = mine(S).map((p) => left(p, now));
    return ls.length ? Math.min(...ls) : null;
  }

  I.guard = { windowMs, left, status, extraHits, patrol, canBuild, build, soonest, mine };
})(window.Island);
