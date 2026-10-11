// A/B 공통 측정 SDK. 두 게임 모두 이 파일을 그대로 써야 비교가 공정하다. (수정 금지)
//
// 사용법:
//   <script src="../shared/config.js"></script>
//   <script src="../shared/track.js"></script>
//   <script>Arena.init({ variant: 'b' })</script>   // 페이지 로드 직후 1회
//   Arena.event('play_start')                       // 실제 게임 플레이를 시작한 순간
//   Arena.event('core_action', { ... })             // 게임의 핵심 행동을 시도할 때마다
//   Arena.event('core_success', { ... })            // 핵심 행동이 성공했을 때마다
//
// 자동 기록: first_visit(처음 온 사람), session_start(30분 이상 비운 뒤 다시 온 방문), heartbeat(보고 있는 동안 1분마다)
// 개인정보는 수집하지 않는다. 브라우저마다 랜덤 익명 ID 하나만 쓴다.
(function () {
  const CFG = window.ARENA_CONFIG || {};
  const K = { uid: 'arena.uid', variant: 'arena.variant', last: 'arena.last', sid: 'arena.sid', utm: 'arena.utm' };
  const SESSION_GAP = 30 * 60 * 1000;

  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 저장 불가 환경 */ } };
  const uuid = () =>
    window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 3) | 8).toString(16);
        });

  let uid = null, sid = null, variant = null, started = false, hb = 0;

  function send(name, props) {
    const row = {
      uid, sid, variant, name,
      props: props || {},
      client_ts: new Date().toISOString(),
      path: location.pathname.slice(0, 120),
      mobile: /Mobi|Android/i.test(navigator.userAgent),
    };
    // 설정이 없거나 로컬 개발 주소면 서버로 보내지 않는다 (테스트 기록이 실험 데이터에 섞이지 않게)
    if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === 'file:') {
      console.debug('[arena]', name, row);
      return;
    }
    const headers = { apikey: CFG.SUPABASE_ANON_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
    // 예전 anon 키(JWT)만 Authorization 헤더에 넣는다. 새 publishable 키는 apikey 헤더만으로 충분
    if (CFG.SUPABASE_ANON_KEY.startsWith('eyJ')) headers.Authorization = 'Bearer ' + CFG.SUPABASE_ANON_KEY;
    fetch(CFG.SUPABASE_URL + '/rest/v1/events', {
      method: 'POST',
      keepalive: true,
      headers,
      body: JSON.stringify(row),
    }).catch(() => {});
  }

  // 마지막 활동 후 30분이 지났으면 새 세션
  function touch() {
    const now = Date.now();
    const last = +get(K.last) || 0;
    set(K.last, String(now));
    if (sid && now - last <= SESSION_GAP) return;
    sid = uuid();
    set(K.sid, sid);
    send('session_start', { ref: document.referrer ? new URL(document.referrer).hostname : '' });
  }

  function init(opts) {
    if (started) return;
    variant = opts && opts.variant;
    if (variant !== 'a' && variant !== 'b') throw new Error('Arena.init: variant는 "a" 또는 "b"');

    // 한 사람은 처음 배정된 쪽에만 계속 머문다 (리텐션을 정확히 재기 위해)
    const assigned = get(K.variant);
    if (assigned && assigned !== variant && (assigned === 'a' || assigned === 'b')) {
      location.replace(location.pathname.replace('/' + variant + '/', '/' + assigned + '/') + location.search);
      return;
    }
    set(K.variant, variant);
    started = true;

    uid = get(K.uid);
    if (!uid) {
      uid = uuid();
      set(K.uid, uid);
      const q = new URLSearchParams(location.search);
      const utm = {};
      ['utm_source', 'utm_medium', 'utm_campaign'].forEach((k) => { if (q.get(k)) utm[k] = q.get(k).slice(0, 60); });
      set(K.utm, JSON.stringify(utm));
      sid = uuid();
      set(K.sid, sid);
      set(K.last, String(Date.now()));
      send('first_visit', { ...utm, ref: document.referrer ? new URL(document.referrer).hostname : '' });
      send('session_start', {});
    } else {
      sid = get(K.sid);
      touch();
    }

    const beat = () => {
      if (document.visibilityState !== 'visible') return;
      touch();
      send('heartbeat', {});
    };
    hb = setInterval(beat, (CFG.HEARTBEAT_SEC || 60) * 1000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') touch(); });
  }

  function event(name, props) {
    if (!started) return;
    if (!/^[a-z_]{1,40}$/.test(name)) return;
    touch();
    send(name, props);
  }

  window.Arena = { init, event, uid: () => uid, variant: () => variant };
})();
