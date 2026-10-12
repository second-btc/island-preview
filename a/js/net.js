// 공유 섬: 서버(Supabase)와 주고받기. 섬은 하나 — 모든 사람이 같은 600구획을 본다.
// 신원은 익명 로그인(기기당 하나, refresh token을 localStorage에 보관). 판정은 전부 서버 함수가 한다.
// 읽기: 10초마다 '내가 가진 버전 이후 바뀐 구획'만 받아 온다(전송량 최소). 내 상태(토큰·깃발)는 1분마다 + 행동 뒤.
(function (I) {
  const CFG = window.ARENA_CONFIG || {};
  const URL = CFG.SUPABASE_URL, KEY = CFG.SUPABASE_ANON_KEY;
  const AUTH_KEY = 'island.auth';
  const offline = !URL || !KEY || /[?&]offline=1/.test(location.search);
  let auth = null, ver = 0, me = null, season = null, hooks = {}, S = null, pollT = 0, meT = 0, started = false;

  const loadAuth = () => { try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch (e) { return null; } };
  const saveAuth = (a) => { try { localStorage.setItem(AUTH_KEY, JSON.stringify(a)); } catch (e) { /* 무시 */ } };
  const fromSession = (d) => ({ access: d.access_token, refresh: d.refresh_token, exp: Date.now() + (d.expires_in || 3600) * 1000 - 60000, uid: d.user && d.user.id });

  async function authFetch(path, body) {
    const r = await fetch(URL + path, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    if (!r.ok) throw new Error('auth_' + r.status);
    return r.json();
  }
  // 로그인 보장: 저장된 세션 → 만료면 갱신 → 없거나 실패하면 새 익명 계정
  async function ensureAuth() {
    auth = auth || loadAuth();
    if (auth && auth.exp > Date.now()) return auth;
    if (auth && auth.refresh) {
      try { auth = fromSession(await authFetch('/auth/v1/token?grant_type=refresh_token', { refresh_token: auth.refresh })); saveAuth(auth); return auth; } catch (e) { /* 새로 만든다 */ }
    }
    auth = fromSession(await authFetch('/auth/v1/signup', {}));
    saveAuth(auth);
    return auth;
  }

  // 서버 함수 호출. 실패하면 서버가 준 사유 코드(protected, no_flag, lot_cap …)로 throw
  async function rpc(fn, args, anon) {
    const tok = anon ? KEY : (await ensureAuth()).access;
    const r = await fetch(URL + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) });
    if (r.status === 401 && !anon) { auth.exp = 0; return rpc(fn, args, anon); }
    const t = await r.text();
    let d = null;
    try { d = t ? JSON.parse(t) : null; } catch (e) { d = t; }
    if (!r.ok) { const err = new Error((d && d.message) || 'http_' + r.status); err.code = (d && d.message) || 'http_' + r.status; throw err; }
    return d;
  }

  // 서버 구획 행 → 로컬 구획 (주인: 'me' | 무리 id | 'p:코드')
  // 행: [id, 주인code, 무리, 건물[], 순찰ms, 임대료, 받을인원, 세입자수, 주인단계]
  function applyLots(rows) {
    const changed = [];
    for (const r of rows) {
      const p = S.plots[r[0] - 1];
      if (!p || p.id !== r[0]) continue;
      const owner = r[1] ? (me && r[1] === me.code ? 'me' : 'p:' + r[1]) : r[2] || null;
      if (p.owner !== owner) changed.push({ p, from: p.owner, to: owner });
      p.owner = owner;
      p.buildings = r[3] || [];
      p.tendedAt = r[4] || 0;
      p.rent = r[5];
      p.tenantCap = r[6];
      p.tenants = r[7] || 0;
      p.ownerStage = r[8] || 0;
    }
    return changed;
  }

  function applyMe(m) {
    if (!m) return;
    me = m;
    S.me.code = m.code;
    S.me.tokens = m.tokens;
    S.me.dugTotal = m.dug_total;
    S.me.flags = m.flags;
    S.me.flagAt = m.flag_next - I.config.FLAG_REGEN_SEC * 1000;
    S.me.stage = m.stage;
    S.me.tenantOf = m.tenant_of;
    S.me.lotCap = m.lot_cap;
    if (m.gender && !S.me.gender) S.me.gender = m.gender;
    // 내 구획 목록이 스냅샷보다 최신이면 바로 반영
    const mine = new Set(m.lots || []);
    for (const p of S.plots) {
      if (mine.has(p.id)) p.owner = 'me';
      else if (p.owner === 'me') p.owner = null; // 다음 스냅샷이 진짜 주인을 채운다
    }
    if (hooks.me) hooks.me(m);
  }

  async function poll() {
    try {
      const d = await rpc('isl_snapshot', { p_since: ver }, true);
      if (d.season && season && d.season.id !== season.id) { ver = 0; season = d.season; if (hooks.season) hooks.season(d.season); return; }
      season = d.season;
      if (d.ver > ver || ver === 0) {
        const changed = applyLots(d.lots || []);
        ver = d.ver;
        if (hooks.lots) hooks.lots(changed, d.news || []);
      }
      if (hooks.news) hooks.news(d.news || []);
    } catch (e) { console.warn('[net] snapshot', e.message); }
  }
  async function refreshMe() {
    try { applyMe(await rpc('isl_me')); } catch (e) { console.warn('[net] me', e.message); }
  }

  async function start(state, h) {
    if (offline || started) return false;
    started = true;
    S = state; hooks = h || {};
    try {
      await ensureAuth();
      applyMe(await rpc('isl_join', { p_gender: S.me.gender || null }));
      await poll();
    } catch (e) {
      console.warn('[net] 서버에 연결하지 못해 혼자 하는 섬으로 엽니다:', e.message);
      started = false;
      return false;
    }
    // 화면을 보고 있을 때만 자주 받아 온다
    const loop = () => {
      const vis = !document.hidden;
      clearTimeout(pollT);
      pollT = setTimeout(async () => { if (!document.hidden) await poll(); loop(); }, vis ? 10000 : 30000);
    };
    loop();
    clearInterval(meT);
    meT = setInterval(() => { if (!document.hidden) refreshMe(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { poll(); refreshMe(); } });
    return true;
  }

  // 행동: 성공하면 내 상태를 받아 반영하고, 섬 상태도 곧바로 다시 받는다
  async function act(fn, args) {
    const m = await rpc(fn, args);
    applyMe(m && m.me ? m.me : m);
    poll();
    return m;
  }

  I.net = {
    get online() { return started; },
    get me() { return me; },
    get season() { return season; },
    offline,
    start,
    poll,
    refreshMe,
    claim: (lot) => act('isl_claim', { p_lot: lot }),
    patrol: (lot) => act('isl_patrol', { p_lot: lot || null }),
    build: (lot, kind) => act('isl_build', { p_lot: lot, p_kind: kind }),
    crate: () => act('isl_crate'),
    rentJoin: (lot) => act('isl_rent_join', { p_lot: lot }),
    rentLeave: () => act('isl_rent_leave'),
    setRent: (lot, rent, cap) => act('isl_set_rent', { p_lot: lot, p_rent: rent, p_cap: cap }),
    setGender: (g) => rpc('isl_join', { p_gender: g }).then(applyMe),
  };
})(window.Island);
