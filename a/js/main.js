// 게임 흐름: 표지 → 지도/1인칭 → 땅 고르기 → 깃발 꽂기(퀘스트) → 토큰 자동 채굴. 그림은 world.js(3D)가 담당.
(function (I) {
  const C = I.config;
  const $ = (s) => document.querySelector(s);
  const fmt = (n) => Math.floor(n).toLocaleString('ko-KR');
  const GLINT = ['', '희미함', '약함', '보통', '강함', '눈부심'];
  const track = (name, props) => window.Arena && Arena.event(name, props || {});
  const mq = (q) => !!(window.matchMedia && matchMedia(q).matches);
  const touchUI = () => mq('(hover: none) and (pointer: coarse)');
  const narrowBar = () => mq('(max-width: 900px)'); // 상단바가 좁을 때 (숫자를 짧게)

  let S, sel = null, questing = null, jackpot = 0, inGame = false, dockOpen = false, escFn = null, revealing = null;

  const ownerColor = (o) => (o === 'me' ? C.ME_COLOR : I.rivals.byId(o).color);
  const ownerName = (o) => (o === 'me' ? '나' : I.rivals.byId(o).name);
  const plotById = (id) => S.plots.find((p) => p.id === id);
  const freeCount = () => S.plots.filter((p) => !p.owner).length;
  const lockLeft = (p) => Math.max(0, Math.ceil(((p.lockUntil || 0) - Date.now()) / 1000));
  const walking = () => I.world.mode() === 'walk';

  // 조사 고르기: jo('#86', '을/를') → '을'. 숫자는 읽는 소리로 (영·일·삼·육·칠·팔은 받침)
  // '으로/로'는 받침이 없거나 ㄹ받침이면 '로'
  const DIGIT_JONG = [21, 8, 0, 16, 0, 0, 1, 8, 8, 0];
  function jo(word, pair) {
    const s = String(word), c = s.charCodeAt(s.length - 1);
    const jong = c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 : c >= 48 && c <= 57 ? DIGIT_JONG[c - 48] : 0;
    const [a, b] = pair.split('/');
    return a === '으로' ? (jong && jong !== 8 ? a : b) : jong ? a : b;
  }

  function hms(ms) {
    const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return h ? `${h}시간 ${m}분` : m ? `${m}분 ${x}초` : `${x}초`;
  }

  // 상단바용 짧은 표기: 47h · 5h 12m · 42m · 30s
  function shortT(ms) {
    const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? (h < 10 && m ? `${h}h ${m}m` : `${h}h`) : m ? `${m}m` : `${s}s`;
  }

  // 좁은 상단바용 짧은 숫자: 12,345 → 1.2만
  let compactFmt = null;
  try { compactFmt = new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 }); } catch (e) { /* 옛 브라우저 */ }
  const compact = (n) => (n >= 1e4 && compactFmt ? compactFmt.format(Math.floor(n)) : fmt(n));

  // 같은 내용이면 건드리지 않는다
  function setHtml(el, html) {
    if (el.dataset.html === html) return false;
    el.dataset.html = html;
    el.innerHTML = html;
    return true;
  }

  function glint(n) {
    let h = '<span class="glint">';
    for (let i = 1; i <= 5; i++) h += `<i class="${i <= n ? 'on' : ''}">✦</i>`;
    return h + `</span><small>${GLINT[n]}</small>`;
  }

  function select(id) {
    sel = id;
    I.world.select(id);
    // 지도에서 고른 땅이 카드에 가리지 않게 카메라를 맞춘다 (world.focusPlot이 있을 때만)
    if (id && !walking() && I.world.focusPlot) I.world.focusPlot(id);
    panel();
  }

  // 지형별 실패·대기 문구 (바닷가가 아닌데 '파도'라고 하지 않게)
  const TERRAIN_TXT = {
    beach: { ico: '🌊', fail: '파도에 깃대가 휘청였어요', wait: '파도가 잦아드는 중' },
    forest: { ico: '🌿', fail: '덩굴에 깃대가 걸렸어요', wait: '덩굴을 걷어내는 중' },
    mountain: { ico: '🪨', fail: '돌무더기에 미끄러졌어요', wait: '발 디딜 곳을 고르는 중' },
  };
  // 폭포·호숫가·계곡·강가 땅은 그 자리에 맞는 말로 (폭포 웅덩이 앞에서 '돌무더기에 미끄러졌어요'라고 하지 않게)
  const PLACE_TXT = {
    fall: { ico: '💧', fail: '물보라에 깃대가 미끄러졌어요', wait: '물보라가 걷히는 중' },
    lake: { ico: '🏔️', fail: '호숫가 진흙에 깃대가 기울었어요', wait: '단단한 땅을 고르는 중' },
    stream: { ico: '🏞️', fail: '계곡 물살에 깃대가 쓸려 갔어요', wait: '물살이 잦아드는 중' },
    river: { ico: '🛶', fail: '강가 모래가 무너졌어요', wait: '단단한 땅을 고르는 중' },
  };
  const terrainTxt = (p) => { plotName(p); return PLACE_TXT[placeKind.get(p.id)] || TERRAIN_TXT[p.terrain] || TERRAIN_TXT.beach; };

  // 깃발 꽂기 버튼(지도·1인칭 공용): 주인 없는 땅인지, 깃발이 있는지, 실패 후 대기 중인지에 따라
  function claimButton(p, id, raid) {
    if (lockLeft(p)) { const f = terrainTxt(p); return `<button class="btn big" disabled>${f.ico} ${f.wait}… <span data-live="wait"></span></button>`; }
    if (S.me.flags < 1) return '<button class="btn big" disabled>🚩 깃발 충전 중 · <span data-live="flag"></span></button>';
    return `<button class="btn primary big" id="${id}" ${questing ? 'disabled' : ''}>${raid ? '⚔️ 빼앗기' : '🚩 깃발 꽂기'} <small>(남은 깃발 ${S.me.flags})</small></button>`;
  }

  // ---------- 땅 지키기 ----------
  const canRaid = (p) => p.owner && p.owner !== 'me' && I.guard.status(p, Date.now()) === 'open';
  const STATUS_TXT = { safe: '🛡 보호 중', warn: '⚠️ 곧 무방비', open: '🏴 무방비' };
  const STATUS_ICO = { safe: '🛡', warn: '⚠️', open: '🏴' };

  // 보호 시간 표시. 남은 시간·막대는 매초 바뀌므로 fillLive가 채운다 (뼈대는 상태가 바뀔 때만 다시 그림)
  function guardHtml(p) {
    const st = I.guard.status(p, Date.now());
    return `<div class="guard ${st}">
        <div class="row"><span>${STATUS_TXT[st]}</span>${st === 'open' ? '<b>누구나 빼앗을 수 있어요</b>' : '<b data-live="guard"></b>'}</div>
        <div class="bar"><div data-w="guard"></div></div>
      </div>`;
  }

  function buildHtml(p) {
    return '<div class="builds">' + Object.entries(C.BUILDINGS).map(([key, b]) => {
      const st = I.guard.canBuild(S, p, key);
      const label = st === 'built' ? '✓ 지음' : st === 'poor' ? `💎 ${fmt(b.cost)} 필요` : `💎 ${fmt(b.cost)}`;
      return `<button class="btn build ${st}" data-build="${key}" ${st !== 'ok' ? 'disabled' : ''}><span>${b.icon} ${b.name}</span><small>${b.desc}</small><b>${label}</b></button>`;
    }).join('') + '</div>';
  }

  const canBuildAny = (p) => Object.keys(C.BUILDINGS).some((k) => I.guard.canBuild(S, p, k) === 'ok');

  // 카드 아래 '자세히' 접기 버튼 (지도 카드·걷기 카드 공용)
  const moreHtml = (ready, label) => `<button class="more${ready ? ' ready' : ''}" data-more aria-expanded="false"><span>${ready ? '🛠 방어 시설을 지을 수 있어요' : label}</span><i class="chev" aria-hidden="true"></i></button>`;

  function bindBuilds(el, plotFn) {
    el.querySelectorAll('[data-build]').forEach((btn) => {
      btn.onclick = () => {
        const p = plotFn(), key = btn.dataset.build, b = C.BUILDINGS[key];
        if (!p || !I.guard.build(S, p, key, Date.now())) return;
        track('build', { plot: p.id, building: key });
        toast(`${b.icon} <b>${b.name}</b>${jo(b.name, '을/를')} 지었어요. 이 땅이 더 단단해졌어요`, 'good');
        I.world.sync(S.plots);
        I.state.save(S);
        hud(); panel(); if (walking()) walkHud();
      };
    });
  }

  // 카드 안 버튼들: 자세히 접기/펴기, 내 땅 목록, 순찰
  function bindCard(el) {
    el.querySelectorAll('[data-more]').forEach((b) => {
      b.onclick = () => {
        dockOpen = !dockOpen;
        try { localStorage.setItem('island.dock', dockOpen ? 'open' : 'closed'); } catch (e) { /* 무시 */ }
        paintMore();
      };
    });
    el.querySelectorAll('[data-plot]').forEach((b) => { b.onclick = () => select(+b.dataset.plot); });
    el.querySelectorAll('[data-patrol]').forEach((b) => { b.onclick = () => patrolAll(); });
    el.querySelectorAll('[data-reset]').forEach((b) => { b.onclick = () => confirmReset(); });
  }

  function paintMore() {
    for (const el of [$('#panel'), $('#walkHud')]) {
      el.classList.toggle('is-open', dockOpen);
      el.querySelectorAll('[data-more]').forEach((b) => b.setAttribute('aria-expanded', String(dockOpen)));
    }
  }

  // ---------- 매초 바뀌는 숫자 ----------
  // 카드 뼈대(HTML)에서 빼고 여기서 글자·막대만 바꾼다. 뼈대를 매초 갈아 끼우면 버튼 클릭이 씹힌다
  const LIVE = {
    left: (p) => '💎 ' + fmt(I.mining.left(p)),
    rate: (p) => `시간당 +${fmt(I.mining.rate(p) * 3600)}`,
    dug: (p) => fmt(p.dug || 0),
    guard: (p) => hms(I.guard.left(p, Date.now())) + ' 남음',
    wait: (p) => lockLeft(p) + '초',
    flag: () => hms(I.state.nextFlagIn(S, Date.now())),
    tokens: () => fmt(S.me.tokens),
  };
  const LIVE_W = {
    left: (p) => (I.mining.left(p) / p.reserve) * 100,
    guard: (p) => (I.guard.left(p, Date.now()) / I.guard.windowMs(p)) * 100,
  };

  function fillLive(el, p) {
    el.querySelectorAll('[data-live]').forEach((n) => {
      const q = n.dataset.of ? plotById(+n.dataset.of) : p;
      if (!q && n.dataset.live !== 'flag' && n.dataset.live !== 'tokens') return;
      const v = LIVE[n.dataset.live](q);
      if (n.textContent !== v) n.textContent = v;
    });
    el.querySelectorAll('[data-w]').forEach((n) => {
      const q = n.dataset.of ? plotById(+n.dataset.of) : p;
      if (!q) return;
      const w = Math.max(0, Math.min(100, LIVE_W[n.dataset.w](q))).toFixed(1) + '%';
      if (n.style.width !== w) n.style.width = w;
    });
  }

  // ---------- 보급 상자 ----------
  // 처음엔 3개. 하나 열면 45분 뒤 새 상자가 떠밀려 온다(자리 비운 동안에도 최대 3개까지 쌓임)
  function refillCrates(first) {
    if (!I.world.crateSpot) return false;
    const now = Date.now(), R = C.CRATE_SEC * 1000;
    if (!S.crates) { S.crates = []; S.nextCrateAt = 0; S.crateSeq = 0; first = true; }
    let want = 0;
    if (first && !S.crates.length && !S.nextCrateAt) want = C.CRATE_MAX;
    else if (S.crates.length < C.CRATE_MAX && now >= S.nextCrateAt) want = Math.min(C.CRATE_MAX - S.crates.length, 1 + Math.floor((now - S.nextCrateAt) / R));
    let added = 0;
    for (let i = 0; i < want; i++) {
      const sp = I.world.crateSpot();
      if (!sp) break;
      S.crates.push({ id: ++S.crateSeq, x: sp.x, z: sp.z });
      added++;
    }
    if (added) S.nextCrateAt = S.crates.length < C.CRATE_MAX ? now + R : Infinity;
    return added > 0;
  }
  function openCrate(id) {
    const i = (S.crates || []).findIndex((c) => c.id === id);
    if (i < 0) return;
    S.crates.splice(i, 1);
    if (!isFinite(S.nextCrateAt) || S.nextCrateAt < Date.now()) S.nextCrateAt = Date.now() + C.CRATE_SEC * 1000;
    const [lo, hi] = C.CRATE_TOKENS;
    if (Math.random() < C.CRATE_FLAG_CHANCE && S.me.flags < C.FLAGS_MAX) {
      S.me.flags++;
      if (S.me.flags >= C.FLAGS_MAX) S.me.flagAt = Date.now();
      toast('📦 보급 상자에서 <b>⚑ 깃발 1개</b>가 나왔어요!', 'good');
      track('crate_open', { reward: 'flag' });
    } else {
      const n = Math.round(lo + Math.random() * (hi - lo));
      S.me.tokens += n;
      toast(`📦 보급 상자 · <b>💎 +${fmt(n)}</b>`, 'good');
      track('crate_open', { reward: 'tokens', amount: n });
    }
    I.state.save(S);
    hud(); panel(); if (walking()) walkHud();
  }
  function crateHint() {
    const el = $('#crateHint');
    const nc = walking() && I.world.nearestCrate ? I.world.nearestCrate() : null;
    el.hidden = !nc;
    if (nc) setHtml(el, `📦 보급 상자 <b>${Math.round(nc.d)}m</b> <span class="ch-arrow">${nc.arrow}</span>`);
  }

  // 순찰: 내 땅 전부의 보호 시간을 다시 채운다
  function patrolAll(silent) {
    const n = I.guard.patrol(S, Date.now());
    if (n) track('patrol', { plots: n });
    I.world.sync(S.plots);
    I.state.save(S);
    hud(); panel();
    if (!silent) toast(n ? `🔥 순찰 완료 · 내 땅 ${I.guard.mine(S).length}필지의 보호 시간을 다시 가득 채웠어요` : '모든 땅이 이미 든든하게 지켜지고 있어요', 'good');
  }

  // ---------- HUD / 하단 카드 ----------
  function hud() {
    const free = freeCount(), total = S.plots.length;
    setHtml($('#hudFree'), `${free}<span class="of"> / ${total}</span>`);
    $('#hudFreeBar').style.width = (free / total) * 100 + '%';
    $('#hudTokens').textContent = narrowBar() ? compact(S.me.tokens) : fmt(S.me.tokens);
    $('#hudPlots').textContent = I.guard.mine(S).length;
    $('#heroFree').textContent = `${free} / ${total}`;
    // 다시 온 사람: 표지에서도 내 섬 요약이 보이고 버튼은 '돌아가기'
    const myN = I.guard.mine(S).length;
    $('#btnEnter').textContent = myN ? '내 섬으로 돌아가기' : '섬에 상륙하기';
    setHtml($('#heroMine'), myN ? `🏡 내 땅 <b>${myN}필지</b> · 💎 <b>${narrowBar() ? compact(S.me.tokens) : fmt(S.me.tokens)}</b>${S.me.flags ? ` · ⚑ 깃발 ${S.me.flags}개` : ''}` : '');
    $('#heroMine').hidden = !myN;
    // 아직 아무도 안 가져갔으면 '줄어드는 중'이라고 하지 않는다
    $('#heroLive').textContent = free < total ? '지금도 줄어드는 중' : '첫 정착자를 기다리는 중';
    $('#heroLiveBox').classList.toggle('calm', free >= total);
    $('#hudTime').textContent = I.world.timeLabel ? I.world.timeLabel() : '';
    let f = '';
    for (let i = 0; i < C.FLAGS_MAX; i++) f += `<i class="${i < S.me.flags ? 'on' : ''}">⚑</i>`;
    setHtml($('#hudFlags'), f);
    const next = I.state.nextFlagIn(S, Date.now());
    // 좁은 상단바(모바일)에선 깃발 밑에 남은 시간만 작게
    $('#hudFlagNext').textContent = next ? (narrowBar() ? shortT(next) : `+1 · ${shortT(next)}`) : narrowBar() ? '' : '가득';
    const soon = I.guard.soonest(S, Date.now()), pb = $('#btnPatrol');
    pb.hidden = soon === null;
    if (soon !== null) {
      const st = soon <= 0 ? 'open' : soon < C.WARN_SEC * 1000 ? 'warn' : 'safe';
      pb.className = 'patrol ' + st;
      setHtml(pb, st === 'open' ? '🔥<span class="pt-txt">순찰 시급!</span>' : `🔥<span class="pt-txt">순찰</span><small>· ${shortT(soon)}</small>`);
      pb.setAttribute('aria-label', st === 'open' ? '순찰 시급 · 무방비 땅이 있어요' : `순찰 · 보호 ${hms(soon)} 남음`);
    }
  }

  // 땅의 볼거리 칩 (폭포 앞·호숫가 등, world.plotTags가 있을 때만). 섬 모양은 고정이라 한 번 구하면 기억
  const tagCache = new Map();
  function tagsHtml(p) {
    if (!I.world.plotTags) return '';
    let t = tagCache.get(p.id);
    if (!t) { t = I.world.plotTags(p.id) || []; if (t.length) tagCache.set(p.id, t); }
    return t.length ? `<div class="chips">${t.map((x) => `<span class="chip">${x.t}</span>`).join('')}</div>` : '';
  }

  // 땅 이름: 폭포·호수·계곡·강 같은 명소 옆이면 그 이름으로 부른다 (지형 분류는 난이도·실패 문구에만 쓴다)
  // 예전엔 폭포 웅덩이 앞 땅도 '언덕 땅'이라 어색했다. 섬 모양은 고정이라 3D 섬이 만들어진 뒤 한 번 구하면 기억
  const PLACE = { fall: '폭포', lake: '호숫가', stream: '계곡', river: '강가' };
  const nameCache = new Map(), placeKind = new Map();
  function plotName(p) {
    if (!p) return '';
    let n = nameCache.get(p.id);
    if (!n) {
      if (!I.world.ready || !I.world.ready()) return C.TERRAIN[p.terrain].name;
      const t = (I.world.plotTags && I.world.plotTags(p.id)) || [];
      const k = ['fall', 'lake', 'stream', 'river'].find((x) => t.some((q) => q.k === x));
      n = k ? PLACE[k] : C.TERRAIN[p.terrain].name;
      nameCache.set(p.id, n);
      if (k) placeKind.set(p.id, k);
    }
    return n;
  }

  const headHtml = (p, extra) => `<h3>${plotName(p)} 땅 <span class="tag">#${p.id}</span>${extra || ''}</h3>${tagsHtml(p)}`;

  // 아무 땅도 안 골랐을 때: 내 땅이 있으면 목록 (누르면 그 땅으로)
  function myListHtml(mine) {
    const now = Date.now(), order = { open: 0, warn: 1, safe: 2 };
    const rows = mine.map((q) => ({ q, st: I.guard.status(q, now) })).sort((a, b) => order[a.st] - order[b.st] || a.q.id - b.q.id);
    const need = rows.filter((r) => r.st !== 'safe').length, openN = rows.filter((r) => r.st === 'open').length;
    return `<h3>내 땅 <span class="tag">${mine.length}필지</span><small class="mp-cap">남은 매장량</small></h3>
      <div class="mylist">${rows.map(({ q, st }) => `<button class="myplot ${st}" data-plot="${q.id}"><span class="mp-name">${STATUS_ICO[st]} ${plotName(q)} #${q.id}${q.reserve >= jackpot ? '<i class="mp-gold">대박</i>' : ''}</span><span class="mp-num" data-live="left" data-of="${q.id}"></span></button>`).join('')}</div>
      ${need
        ? `<button class="btn primary big" data-patrol>🔥 지금 순찰하기 <small>(${openN ? `${openN}필지가 무방비예요` : `${need}필지 보호가 곧 끝나요`})</small></button>`
        : S.me.flags < 1 ? nextGoalHtml() : '<p class="muted small mp-tip">땅을 누르면 자세히 볼 수 있어요 · 빈 땅에 깃발을 꽂아 더 넓혀 보세요</p>'}`;
  }
  // 깃발을 다 쓴 뒤: 다음 깃발까지 남은 시간 + 그동안 할 일 (작은 회색 타이머만 남으면 다시 올 이유가 안 보인다)
  function nextGoalHtml() {
    const fence = C.BUILDINGS.fence, crates = (S.crates || []).length;
    return `<div class="next-goal">
        <div class="ng-top"><span>⚑ 다음 깃발</span><b data-live="flag"></b></div>
        <ul class="how small">
          ${crates ? `<li><b>📦</b><span>섬 곳곳에 <strong>보급 상자 ${crates}개</strong> · 걸어가서 열면 토큰이나 깃발이 나와요</span></li>` : ''}
          <li><b>🚶</b><span><strong>섬 걷기</strong>로 내 땅에 들어서면 순찰도 함께 돼요</span></li>
          <li><b>${fence.icon}</b><span>💎 ${fmt(fence.cost)}이면 <strong>${fence.name}</strong> · 지금 💎 <span data-live="tokens"></span></span></li>
        </ul>
      </div>`;
  }

  function panel() {
    const el = $('#panel');
    const p = sel ? plotById(sel) : null;
    // 뼈대가 같으면 다시 그리지 않는다 (버튼이 매초 교체되면 클릭이 씹힘). 바뀌는 숫자는 fillLive가 제자리에서
    const set = (html) => {
      if (setHtml(el, html)) {
        const b = el.querySelector('#btnGo');
        if (b) b.onclick = () => challenge(plotById(sel));
        bindBuilds(el, () => plotById(sel));
        bindCard(el);
        paintMore();
      }
      fillLive(el, p);
    };

    if (!p) {
      const mine = I.guard.mine(S);
      const resetLink = mine.length || S.me.tokens > 0 ? '<button class="linkbtn mobile-only" data-reset>처음부터 다시 하기</button>' : '';
      if (mine.length) return set(myListHtml(mine) + resetLink);
      set(`
        <h3>어디에 정착할까요?</h3>
        <ul class="how">
          <li><b>✦</b><span>토큰이 빛나는 땅일수록 매장량이 많아요</span></li>
          <li><b>🚩</b><span>정착 깃발은 구조선이 ${C.FLAG_REGEN_SEC / 3600}시간마다 1개씩 실어 와요</span></li>
          <li><b>🚶</b><span><strong>섬 걷기</strong>로 마지막 섬을 직접 둘러보세요</span></li>
        </ul>${resetLink}`);
      return;
    }

    if (!p.owner) {
      set(`${headHtml(p)}
        <div class="row"><span>토큰 반짝임</span><span>${glint(p.signal)}</span></div>
        <p class="muted small">반짝임은 힌트일 뿐, 진짜 매장량은 깃발을 꽂아야 보여요.</p>
        ${claimButton(p, 'btnGo')}`);
      return;
    }

    if (p.owner === 'me' && revealing === p.id) {
      set(`${headHtml(p)}<p class="muted">🚩 깃발을 꽂았어요! 땅속을 살펴보는 중…</p>`);
      return;
    }
    if (p.owner === 'me') {
      const regen = I.mining.regenRate(p) ? `하루 +${fmt(p.reserve * C.REGEN_PER_DAY)} · 처음 매장량까지` : '이 땅은 더 차오르지 않아요';
      set(`${headHtml(p, p.reserve >= jackpot ? '<span class="tag gold">💎 대박 광맥</span>' : '')}
        <div class="mine">
          <div class="mine-top"><span>남은 매장량</span><b class="mine-num" data-live="left"></b></div>
          <div class="bar"><div data-w="left"></div></div>
          <div class="mine-sub"><span data-live="rate"></span><span>캐낸 토큰 <b data-live="dug"></b></span></div>
        </div>
        ${guardHtml(p)}
        ${moreHtml(canBuildAny(p), '처음 매장량 · 방어 시설')}
        <div class="more-body">
          <div class="row"><span>처음 매장량</span><b>💎 ${fmt(p.reserve)}</b></div>
          <div class="row"><span>다시 차오름</span><span class="small">${regen}</span></div>
          ${buildHtml(p)}
        </div>`);
      return;
    }

    set(`${headHtml(p)}
      <div class="row"><span>주인</span><b style="color:${ownerColor(p.owner)}">🚩 ${ownerName(p.owner)}</b></div>
      <div class="row"><span>토큰 반짝임</span><span>${glint(p.signal)}</span></div>
      ${guardHtml(p)}
      ${canRaid(p)
        ? `<p class="muted small">순찰이 끊긴 땅이에요. 평소보다 ${I.guard.extraHits(p)}번 더 성공하면 빼앗을 수 있어요.</p>${claimButton(p, 'btnGo', true)}`
        : '<p class="muted small">주인이 지키고 있는 땅이에요. 순찰이 끊기면 빼앗을 수 있어요.</p>'}`);
  }

  // 1인칭: 발밑 땅 안내 + 깃발 꽂기
  function walkHud() {
    const el = $('#walkHud');
    const p = I.world.walkPlot();
    let html;
    if (!p) {
      const left = Math.max(0, Math.round(I.world.pollution ? I.world.pollution() : 999));
      html = left < 40
        ? `<div class="wh-title" style="color:#d6a7ff">☣️ ${left <= 1 ? '오염 해역 경계' : `오염 해역 ${left}m 앞`}</div><div class="muted small">${left <= 1 ? '이 너머는 바이러스에 오염된 바다예요. 더는 나갈 수 없어요.' : '이 너머는 바이러스에 오염된 바다예요. 경계에서 더 나갈 수 없어요.'}</div>`
        : '<div class="wh-title">🌊 바다</div><div class="muted small">헤엄쳐 다닐 수 있어요. 수평선 쪽 잿빛 안개 너머는 오염된 바다예요.</div>';
    }
    else if (!p.owner)
      html = `<div class="wh-title">${plotName(p)} 땅 #${p.id} · 주인 없음</div>
        <div class="row"><span>토큰 반짝임</span><span>${glint(p.signal)}</span></div>
        ${claimButton(p, 'btnWalkGo')}<div class="muted small wh-key">PC는 <b>E</b> 키로도 꽂을 수 있어요</div>`;
    else if (p.owner === 'me')
      html = `<div class="wh-title">🏡 내 땅 · ${plotName(p)} #${p.id}</div>
        <div class="row"><span>남은 매장량</span><b data-live="left"></b></div>
        ${guardHtml(p)}${moreHtml(canBuildAny(p), '방어 시설')}<div class="more-body">${buildHtml(p)}</div>`;
    else
      html = `<div class="wh-title" style="color:${ownerColor(p.owner)}">🚩 ${ownerName(p.owner)}의 땅 · #${p.id}</div>
        ${guardHtml(p)}
        ${canRaid(p) ? claimButton(p, 'btnWalkGo', true) + '<div class="muted small wh-key">PC는 <b>E</b> 키로도 빼앗을 수 있어요</div>' : '<div class="muted small">다른 생존자 무리의 땅이에요. 지나가는 건 괜찮아요.</div>'}`;
    if (setHtml(el, html)) {
      const b = el.querySelector('#btnWalkGo');
      if (b) b.onclick = () => challenge(I.world.walkPlot());
      bindBuilds(el, () => I.world.walkPlot());
      bindCard(el);
      paintMore();
    }
    fillLive(el, p);
  }

  // 섬 소식: 첫 소식이 생길 때 상자를 보이고, 최근 5개만
  function feed(html, cls) {
    const li = document.createElement('li');
    if (cls) li.className = cls;
    li.innerHTML = html;
    const list = $('#feed');
    list.prepend(li);
    while (list.children.length > 5) list.lastChild.remove();
    $('#feedBox').hidden = false;
  }

  // kind: 'good'(좋은 소식) · 'warn'(경고) · 없으면 보통 알림. 예전엔 모두 빨간 경고 모양이었다
  function toast(html, kind) {
    const t = document.createElement('div');
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.innerHTML = html;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 3600);
  }

  // ---------- 모달 ----------
  // 내용을 채우고 첫 버튼에 포커스 (키보드·화면 낭독기). onEsc가 있으면 Esc로 닫힘.
  // focusDelay: 퀘스트 직후엔 연타(Space)가 결과 창 버튼을 바로 누르지 않게 잠깐 늦게 포커스
  function showModal(html, onEsc, focusDelay) {
    const m = $('#modal');
    m.innerHTML = html;
    m.hidden = false;
    escFn = onEsc || null;
    const h = m.querySelector('h3, .q-head b');
    if (h) { h.id = 'modalTitle'; m.setAttribute('aria-labelledby', 'modalTitle'); } else m.removeAttribute('aria-labelledby');
    const focus = () => {
      const b = m.querySelector('button:not([disabled])');
      if (b && !m.hidden && m.contains(b)) b.focus({ preventScroll: true });
    };
    if (focusDelay === -1) return; // 고르는 창: 첫 버튼을 미리 포커스하면 이미 고른 것처럼 보인다
    if (focusDelay) setTimeout(focus, focusDelay); else focus();
  }

  function closeModal() {
    escFn = null;
    $('#modal').hidden = true;
    $('#modal').innerHTML = '';
    I.world.setInput(true);
    checkOver();
  }

  // ---------- 깃발 꽂기 ----------
  function challenge(p) {
    const raid = !!(p && canRaid(p));
    if (!p || questing || (p.owner && !raid) || lockLeft(p)) return;
    if (S.me.flags < 1) {
      toast(`깃발이 없어요. ${hms(I.state.nextFlagIn(S, Date.now()))} 뒤에 하나 생겨요`, 'warn');
      return;
    }
    questing = p.id;
    I.world.setInput(false);
    const d = I.difficulty.of(S, p);
    const veteran = I.guard.mine(S).length > 0 || S.log.some((e) => e.type === 'claim' && e.by === 'me');
    const q = I.quests.pick(veteran ? null : 'timing');
    track('core_action', { plot: p.id, signal: p.signal, free: freeCount(), walk: walking(), raid, quest: q.id });
    const opts = raid ? { extra: I.guard.extraHits(p), raid: true } : null;
    const desc = typeof q.desc === 'function' ? q.desc(opts) : q.desc;
    const quit = () => { const b = $('#modal').querySelector('.q-body'); if (b && b.__cancel) b.__cancel(); };
    quit.noBackdrop = true; // 빠르게 누르다 카드 밖을 잘못 눌러 그만두지 않게 (✕·Esc로만)
    showModal(`
      <div class="card">
        <div class="q-head"><b>${raid ? '⚔️ 땅 빼앗기' : '🚩 ' + q.name}</b><span class="q-right"><span class="tag">${plotName(p)} #${p.id}</span><button class="q-quit" id="btnQuit" aria-label="그만두기" title="그만두기 (Esc)">✕</button></span></div>
        <p class="muted small">${desc}</p>
        <div class="q-body"></div>
      </div>`, quit, -1); // ✕에 포커스가 가 있으면 Space·Enter 한 번에 그만두게 된다 → 포커스는 각 퀘스트가 정한다
    $('#btnQuit').onclick = quit;
    panel();

    const victim = p.owner;
    q.play($('#modal').querySelector('.q-body'), d, opts).then((res) => {
      questing = null;
      // 그만두기: 잠금·실패 기록 없이 닫는다 (깃발도 그대로)
      if (res.cancelled) { track('core_quit', { plot: p.id, quest: q.id }); closeModal(); hud(); panel(); toast('그만뒀어요 · 깃발은 그대로예요'); return; }
      const stillOk = raid ? p.owner === victim && canRaid(p) : !p.owner;
      if (res.success && stillOk) {
        p.owner = 'me';
        p.tendedAt = Date.now();
        p.buildings = [];
        revealing = p.id; // 결과 창(매장량 공개)을 닫을 때까지 카드는 숫자를 숨긴다
        if (S.me.flags >= C.FLAGS_MAX) S.me.flagAt = Date.now();
        S.me.flags--;
        I.state.log(S, { type: 'claim', plotId: p.id, by: 'me' });
        track('core_success', { plot: p.id, reserve: p.reserve, raid });
        if (raid) track('raid_win', { plot: p.id, from: victim });
        I.world.sync(S.plots);
        // 지도에서 차지했으면 그 땅을 고른 채로. 카메라가 그 땅을 돌며 비추고 빛가루 (없으면 초점만)
        if (!walking()) { sel = p.id; I.world.select(p.id); }
        closeModal(); // 퀘스트 창이 축하 연출(카메라가 내 땅을 도는 장면)을 가리지 않게
        I.world.setInput(false); // 결과 창이 뜰 때까지 연출을 지켜보게
        if (I.world.celebratePlot) I.world.celebratePlot(p.id);
        else if (!walking() && I.world.focusPlot) I.world.focusPlot(p.id);
        // 카메라가 내 땅을 도는 연출(약 3초)을 가리지 않게 결과 창은 조금 뒤에
        setTimeout(() => reveal(p), I.world.celebratePlot ? 2300 : 0);
        feed(raid ? `<b>⚔️ 나</b> · ${ownerName(victim)}에게서 #${p.id}${jo(p.id, '을/를')} 빼앗음!` : `<b>🚩 나</b> · ${plotName(p)} #${p.id}에 정착!`, 'me');
      } else {
        const late0 = !!res.success;
        if (!late0) p.lockUntil = Date.now() + C.FAIL_LOCK_SEC * 1000;
        I.state.log(S, { type: 'fail', plotId: p.id, by: 'me' });
        track('core_fail', { plot: p.id });
        const f = terrainTxt(p);
        // 성공했는데 그새 상황이 바뀐 경우(먼저 정착·다시 순찰)와 진짜 실패를 구분해서 알려 준다
        const late = !!res.success;
        // 퀘스트가 자기 말로 알려 주면(prog·why·ico) 그걸 쓰고, 아니면 지형 문구
        const prog = res.prog || (res.need ? (res.hits ? `<b>${res.hits}/${res.need}</b>까지 성공` : `첫 번째에서 놓쳤어요 · <b>0/${res.need}</b>`) : '');
        const why = late ? (raid ? '그새 주인이 순찰을 돌아 다시 지키고 있어요.' : '그새 다른 무리가 먼저 깃발을 꽂았어요.') : raid ? '방어를 뚫지 못했어요.' : res.why || f.fail + '.';
        showModal(`
          <div class="card center">
            <div class="big-emoji">${late ? '⏱️' : raid ? '🛡' : res.ico || f.ico}</div>
            <h3>${late ? '한발 늦었어요' : '아깝다!'}</h3>
            ${!late && prog ? `<p class="fail-prog">${prog}</p>` : ''}
            <p class="muted">${why}<br>${late ? '깃발은 그대로예요. 다른 땅을 노려 보세요.' : `깃발은 그대로예요 — ${C.FAIL_LOCK_SEC}초 뒤 다시 도전!`}</p>
            <button class="btn primary big" id="btnClose">확인</button>
          </div>`, closeModal, 600);
        $('#btnClose').onclick = closeModal;
      }
      I.state.save(S);
      hud();
      panel();
    });
  }

  function reveal(p) {
    const big = p.reserve >= jackpot, part = I.mining.left(p) < p.reserve - 5, left = part ? I.mining.left(p) : p.reserve; // 방금 차지한 땅은 연출 중 몇 개 캔 것까지 빼지 않는다
    showModal(`
      <div class="card center ${big ? 'gold' : ''}">
        <div class="big-emoji">${big ? '💎' : '🚩'}</div>
        <h3>이 땅은 이제 당신의 것</h3>
        <p class="muted">땅속에 ${part ? '남아 있는' : '잠든'} 토큰은…</p>
        <div class="reveal" id="rv">0</div>
        <p class="rv-note" id="rvNote"></p>
        ${S.me.flags < 1 ? `<p class="rv-next">⚑ 깃발을 다 썼어요 · 다음 깃발은 <b>${hms(I.state.nextFlagIn(S, Date.now()))}</b> 뒤<br><span class="muted small">그동안 섬을 걸으며 내 땅을 둘러보고 보급 상자를 찾아보세요</span></p>` : ''}
        <button class="btn primary big" id="btnClose">좋아요!</button>
      </div>`, doneReveal, 900);
    const el = $('#rv');
    const start = performance.now(), dur = big ? 2200 : 1200;
    (function step(t) {
      if (!el.isConnected) return;
      const k = Math.min(1, (t - start) / dur);
      el.textContent = '💎 ' + fmt(left * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
      else {
        const share = ((p.reserve / C.TOTAL_TOKENS) * 100).toFixed(1);
        $('#rvNote').innerHTML = part
          ? `처음 매장량 💎 ${fmt(p.reserve)} 중 남은 양이에요`
          : big ? `<b>대박!</b> 섬 전체 토큰의 ${share}%가 여기에!` : `섬 전체 토큰의 ${share}%`;
      }
    })(start);
    $('#btnClose').onclick = doneReveal;
  }
  function doneReveal() { revealing = null; closeModal(); panel(); }

  // ---------- 종료 ----------
  function checkOver() {
    if (S.over || freeCount() > 0 || questing) return;
    S.over = true;
    I.state.save(S);
    I.world.setInput(false);
    const rows = [{ id: 'me', name: '나', color: C.ME_COLOR }]
      .concat(C.RIVALS)
      .map((r) => {
        const own = S.plots.filter((p) => p.owner === r.id);
        return { ...r, plots: own.length, value: own.reduce((s, p) => s + p.reserve, 0) };
      })
      .sort((a, b) => b.value - a.value);
    const myRank = rows.findIndex((r) => r.id === 'me') + 1;
    track('round_end', { rank: myRank, plots: rows.find((r) => r.id === 'me').plots });
    showModal(`
      <div class="card">
        <div class="center big-emoji">${myRank === 1 ? '👑' : '🌫️'}</div>
        <h3 class="center">감염 폭풍이 섬을 휩쓸었습니다</h3>
        <p class="muted center">모든 땅에 주인이 생기자 폭풍이 몰려왔어요. 깃발은 모두 쓰러졌고, 토큰은 땅속 새로운 곳으로 흩어졌습니다.</p>
        <p class="muted center">이번 시즌 토큰 순위 · 나는 <b>${myRank}위</b></p>
        <table class="rank">
          ${rows.map((r, i) => `<tr class="${r.id === 'me' ? 'me' : ''}"><td>${i + 1}</td><td style="color:${r.color}">${r.name}</td><td>🚩 ${r.plots}</td><td class="num">💎 ${fmt(r.value)}</td></tr>`).join('')}
        </table>
        <button class="btn primary big" id="btnNew">다시 깃발 꽂으러 가기</button>
      </div>`);
    // 새 시즌이어도 고른 생존자는 그대로
    $('#btnNew').onclick = () => {
      const g = S.me.gender;
      newGame();
      if (g) { S.me.gender = g; I.state.save(S); }
    };
  }

  function newGame() {
    S = I.state.create(I.rng.newSeed());
    jackpot = I.island.jackpotLine(S.plots);
    questing = null;
    escFn = null;
    $('#feed').innerHTML = '';
    $('#feedBox').hidden = true;
    $('#panel').dataset.html = '';
    $('#modal').hidden = true;
    if (walking()) setView('game');
    I.world.rebuild(S.plots, C.ISLAND_SEED);
    refillCrates(true);
    I.world.setCrates(S.crates);
    I.world.setInput(true);
    if (I.world.focusPlot) I.world.focusPlot(null); // 새 섬은 전체가 보이게
    select(null);
    I.state.save(S);
    hud();
  }

  // '처음부터': 잃는 것을 보여 주고 한 번 더 묻는다. 기본(포커스·Esc·바깥)은 '그대로 두기'
  function confirmReset() {
    if (questing) return;
    const n = I.guard.mine(S).length;
    I.world.setInput(false);
    showModal(`
      <div class="card center">
        <div class="big-emoji">⚠️</div>
        <h3>처음부터 다시 시작할까요?</h3>
        <p class="muted">땅 <b>${n}필지</b> · 토큰 <b>${fmt(S.me.tokens)}개</b> · 생존자 선택이<br>모두 사라져요. 되돌릴 수 없어요.</p>
        <button class="btn primary big" id="btnKeep">그대로 두기</button>
        <button class="btn big danger" id="btnWipe">모두 지우고 처음부터</button>
      </div>`, closeModal);
    $('#btnKeep').onclick = closeModal;
    $('#btnWipe').onclick = () => {
      I.state.clear();
      newGame();
      if (inGame) chooseSurvivor(() => {});
    };
  }

  // ---------- 시간 흐름 ----------
  function rivalEvent(ev, live) {
    I.state.log(S, { type: ev.raid ? 'raid' : 'claim', plotId: ev.plot.id, by: ev.rival.id });
    if (ev.raid) {
      feed(`<b style="color:${ev.rival.color}">⚔️ ${ev.rival.name}</b> · 내 땅 #${ev.plot.id}${jo(ev.plot.id, '을/를')} 빼앗음`, 'lost');
      track('plot_lost', { plot: ev.plot.id, by: ev.rival.id, live });
    } else feed(`<b style="color:${ev.rival.color}">🚩 ${ev.rival.name}</b> · ${plotName(ev.plot)} #${ev.plot.id}에 정착`);
    if (!live) return;
    I.world.sync(S.plots);
    const who = `<b>${ev.rival.name}</b>${jo(ev.rival.name, '이/가')}`;
    if (ev.raid) { toast(`⚔️ 순찰이 끊긴 내 땅 #${ev.plot.id}${jo(ev.plot.id, '을/를')} ${who} 빼앗아 갔어요`, 'warn'); return; }
    if (inGame && ev.plot.id === sel) toast(`앗! ${who} 보고 있던 땅에 먼저 정착했어요`, 'warn');
    else if (inGame && ev.plot.signal >= 5) toast(`${who} 토큰이 눈부시게 빛나던 땅을 차지했어요`);
  }

  // 자리를 비운 동안 흐른 시간만큼 채굴·라이벌·깃발을 진행시킨다
  function catchUp() {
    const now = Date.now();
    const away = Math.min(now - (S.savedAt || now), C.OFFLINE_CAP_SEC * 1000);
    if (away < 60 * 1000) return null;
    const before = S.me.tokens, flagsBefore = S.me.flags;
    I.mining.tick(S, away / 1000);
    let taken = 0, lost = 0;
    const lostIds = [];
    if (!S.over) {
      const start = now - away;
      if (S.nextRivalAt < start) S.nextRivalAt = start;
      for (let guard = 0; guard < 200 && S.nextRivalAt <= now; guard++) {
        const ev = I.rivals.tick(S, S.nextRivalAt, null);
        if (!ev) break;
        rivalEvent(ev, false);
        if (ev.raid) { lost++; lostIds.push(ev.plot.id); } else taken++;
      }
    }
    I.state.regenFlags(S, now);
    return { away, mined: S.me.tokens - before, taken, lost, lostIds, flags: S.me.flags - flagsBefore };
  }

  function welcomeBack(r) {
    const needPatrol = I.guard.mine(S).filter((p) => I.guard.status(p, Date.now()) !== 'safe').length;
    if (!r || (r.mined < 1 && !r.taken && !r.flags && !r.lost && !needPatrol)) return;
    const lines = [];
    if (r.lost) lines.push(`<div class="row lost"><span>⚔️ 순찰이 끊겨 빼앗긴 내 땅${r.lostIds && r.lostIds.length ? ' · ' + r.lostIds.slice(0, 4).map((id) => '#' + id).join(', ') + (r.lostIds.length > 4 ? ' …' : '') : ''}</span><b>${r.lost}필지</b></div>`);
    if (needPatrol) lines.push(`<div class="row warnrow"><span>🔥 순찰이 필요한 내 땅</span><b>${needPatrol}필지</b></div>`);
    if (r.mined >= 1) lines.push(`<div class="row"><span>✨ 그동안 캔 토큰</span><b>💎 ${fmt(r.mined)}</b></div>`);
    if (r.taken) lines.push(`<div class="row"><span>🚩 다른 무리가 차지한 땅</span><b>${r.taken}필지</b></div>`);
    if (r.flags > 0) lines.push(`<div class="row"><span>⚑ 구조선이 실어 온 깃발</span><b>+${r.flags}</b></div>`);
    showModal(`
      <div class="card">
        <div class="center big-emoji">${r.lost ? '🏴' : '🌅'}</div>
        <h3 class="center">${r.lost ? '자리를 비운 사이 땅을 빼앗겼어요' : '무사히 돌아오셨군요'}</h3>
        <p class="muted center">자리를 비운 ${hms(r.away)} 동안 섬에서 이런 일이 있었어요</p>
        ${lines.join('')}
        <p class="muted small center">남은 땅 ${freeCount()} / ${S.plots.length}</p>
        <button class="btn primary big" id="btnClose">${needPatrol ? '🔥 순찰하고 섬으로' : '섬으로'}</button>
      </div>`, closeModal);
    $('#btnClose').onclick = () => { if (needPatrol) patrolAll(); closeModal(); };
    track('welcome_back', { away_min: Math.round(r.away / 60000), taken: r.taken, lost: r.lost || 0, need_patrol: needPatrol });
  }

  function tick() {
    const now = Date.now();
    I.mining.tick(S, 1);
    I.state.regenFlags(S, now);
    if (refillCrates()) { I.world.setCrates(S.crates); I.state.save(S); panel(); }
    crateHint();
    if (!S.over) {
      const ev = I.rivals.tick(S, now, questing);
      if (ev) rivalEvent(ev, true);
      checkOver();
    }
    I.world.sync(S.plots);
    I.state.save(S);
    hud();
    panel(); // 내 땅 목록·숫자도 매초 (뼈대는 바뀔 때만 다시 그림)
    if (walking()) walkHud();
  }

  // ---------- 화면 전환 ----------
  function setView(v) {
    $('#hero').hidden = v !== 'hero';
    $('#game').hidden = v === 'hero';
    $('#game').classList.toggle('walking', v === 'walk');
    for (const b of [$('#btnWalk'), $('#btnWalkFab')]) {
      b.textContent = v === 'walk' ? '🗺️ 지도' : '🚶 섬 걷기';
      b.setAttribute('aria-label', v === 'walk' ? '지도로 돌아가기' : '섬 걷기');
    }
    if (v === 'walk') {
      I.world.enterWalk(sel ? plotById(sel) : null);
      $('#walkHud').dataset.html = '';
      setTimeout(walkHud, 50);
      track('walk_start', {});
    } else {
      I.world.setMode(v);
    }
  }

  const toggleWalk = () => { if (!questing) setView(walking() ? 'game' : 'walk'); };

  // 처음 상륙할 때 생존자(남/여)를 고른다. 모습만 다르고 능력 차이는 없다
  function chooseSurvivor(then) {
    showModal(`
      <div class="card pick">
        <h3 class="center">당신은 누구인가요?</h3>
        <p class="muted center small">마지막 섬에 상륙할 생존자를 고르세요. 모습만 다를 뿐, 능력 차이는 없어요.</p>
        <div class="pick-row">
          <button class="pick-card" data-g="male"><span class="pick-ico">🧔🏻</span><b>남성 생존자</b><small>표류 41일째 · 낚시로 버텨 왔어요</small></button>
          <button class="pick-card" data-g="female"><span class="pick-ico">👩🏻</span><b>여성 생존자</b><small>표류 38일째 · 별을 보며 길을 찾아왔어요</small></button>
        </div>
      </div>`, null, -1);
    $('#modal').querySelectorAll('.pick-card').forEach((b) => {
      b.onclick = () => {
        S.me.gender = b.dataset.g;
        I.world.setCharacter(S.me.gender);
        track('pick_character', { gender: S.me.gender });
        I.state.save(S);
        escFn = null;
        $('#modal').hidden = true;
        $('#modal').innerHTML = '';
        then();
      };
    });
  }

  function enterGame() {
    if (!S.me.gender) return chooseSurvivor(enterGame);
    inGame = true;
    track('play_start', {});
    setView('game');
    setTimeout(() => ($('#hint').style.opacity = 0), 6000);
  }

  function showHero() {
    if (questing) return;
    inGame = false;
    select(null);
    setView('hero');
  }

  // ---------- 디버그 (콘솔용) ----------
  I.debug = {
    stats() {
      const r = S.plots.map((p) => p.reserve).sort((a, b) => b - a);
      const sum = r.reduce((a, b) => a + b, 0);
      return { sum, plots: r.length, max: r[0], median: r[r.length >> 1], min: r[r.length - 1], jackpotLine: jackpot };
    },
    setRemaining(ratio) {
      const free = S.plots.filter((p) => !p.owner);
      while (free.length / S.plots.length > ratio) {
        const p = free.splice(Math.floor(Math.random() * free.length), 1)[0];
        p.owner = C.RIVALS[Math.floor(Math.random() * C.RIVALS.length)].id;
      }
      I.world.sync(S.plots);
      hud(); panel();
      return I.difficulty.base(S);
    },
    state: () => S,
    // 내 땅 보호 시간을 n시간 앞당기기 (무방비 테스트)
    age(hours) { I.guard.mine(S).forEach((p) => (p.tendedAt -= hours * 3600 * 1000)); I.world.sync(S.plots); hud(); panel(); },
    enter: enterGame,
    walk: () => setView('walk'),
    map: () => setView('game'),
    select: (id) => select(id),
    challenge: () => challenge(plotById(sel)),
    // 자리 비움 시뮬레이션: n시간 전에 저장된 것처럼 만들고 따라잡기
    away(hours) {
      // 실제로 n시간 뒤에 돌아온 것과 같게: 저장·라이벌·깃발 시각을 모두 n시간 과거로
      const ms = hours * 3600 * 1000;
      S.savedAt -= ms; S.nextRivalAt -= ms; S.me.flagAt -= ms;
      I.guard.mine(S).forEach((p) => (p.tendedAt -= ms));
      const r = catchUp(); I.world.sync(S.plots); hud(); welcomeBack(r); return r;
    },
  };

  // ---------- 시작 ----------
  function init() {
    if (!window.THREE) {
      document.body.innerHTML = '<p style="padding:40px;text-align:center">3D 엔진을 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.</p>';
      return;
    }
    S = I.state.load() || I.state.create(I.rng.newSeed());
    jackpot = I.island.jackpotLine(S.plots);
    try { dockOpen = localStorage.getItem('island.dock') === 'open'; } catch (e) { /* 무시 */ }

    // 3D 섬을 먼저 만든다 → 섬 소식에 '폭포 땅'처럼 명소 이름이 나온다
    I.world.init($('#stage'), S.plots, C.ISLAND_SEED);
    S.log.filter((e) => e.type === 'claim').slice(-5).forEach((e) => {
      const q = plotById(e.plotId), tn = q ? plotName(q) + ' ' : '';
      feed(`<b style="color:${ownerColor(e.by)}">🚩 ${ownerName(e.by)}</b> · ${tn}#${e.plotId}에 정착${e.by === 'me' ? '!' : ''}`, e.by === 'me' ? 'me' : '');
    });
    const back = catchUp(); // 자리 비운 동안 바뀐 주인은 섬에 다시 칠한다
    if (back) I.world.sync(S.plots);
    refillCrates();
    I.world.setCrates(S.crates);
    I.world.onCrate(openCrate);
    I.world.onPick((p) => select(p ? p.id : null));
    if (S.me.gender) I.world.setCharacter(S.me.gender);
    I.world.onWalkPlot((p) => {
      if (p && p.owner === 'me' && I.guard.status(p, Date.now()) !== 'safe') {
        I.guard.patrol(S, Date.now(), p);
        track('patrol', { plots: 1, walk: true });
        toast(`🔥 #${p.id} 순찰 완료 · 보호가 다시 채워졌어요`, 'good');
        I.world.sync(S.plots);
      }
      walkHud();
    });
    I.world.onInteract((p) => challenge(p));

    $('#btnEnter').onclick = enterGame;
    // 폭포 소리: 기본 켜짐(첫 클릭부터 들림), 끄면 기억한다
    let soundOn = true;
    try { soundOn = localStorage.getItem('island.sound') !== 'off'; } catch (e) {}
    const paintSound = () => { $('#btnSound').textContent = soundOn ? '🔊' : '🔇'; $('#btnSound').classList.toggle('off', !soundOn); };
    I.world.setSound(soundOn);
    paintSound();
    let liveAtDown = true;
    window.addEventListener('pointerdown', () => { liveAtDown = I.world.audioLive ? I.world.audioLive() : true; }, true);
    $('#btnSound').onclick = (e) => {
      e.stopPropagation();
      // 아직 소리가 안 나던 상태(첫 클릭 전)에서 누른 건 '켜 줘'라는 뜻
      if (soundOn && !liveAtDown) { I.world.setSound(true); paintSound(); liveAtDown = true; return; }
      soundOn = !soundOn;
      try { localStorage.setItem('island.sound', soundOn ? 'on' : 'off'); } catch (err) {}
      I.world.setSound(soundOn);
      paintSound();
    };
    $('#btnPatrol').onclick = () => patrolAll();
    $('#brand').onclick = showHero;
    $('#btnWalk').onclick = toggleWalk;
    $('#btnWalkFab').onclick = toggleWalk;
    $('#btnJump').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); I.world.jump(); });
    $('#btnReset').onclick = confirmReset;
    // 모달: Esc 또는 바깥(어두운 곳)을 누르면 '닫기'가 허락된 창만 닫힌다
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && escFn && !$('#modal').hidden) { e.preventDefault(); escFn(); } });
    $('#modal').addEventListener('click', (e) => { if (e.target === e.currentTarget && escFn && !escFn.noBackdrop) escFn(); });
    // 터치 기기엔 휠이 없다
    $('#hint').textContent = touchUI() ? '드래그로 돌리기 · 두 손가락으로 확대' : '드래그해서 섬을 돌려보세요 · 휠로 확대';
    // 떠 있는 걷기 버튼은 모바일·터치에서만. CSS가 늦게(옛 캐시) 받아져도 데스크톱에 튀어나오지 않게 hidden으로도 막는다
    const fabMq = window.matchMedia ? matchMedia('(max-width: 760px), (hover: none) and (pointer: coarse)') : null;
    const paintFab = () => { $('#btnWalkFab').hidden = !(fabMq && fabMq.matches); };
    if (fabMq) { if (fabMq.addEventListener) fabMq.addEventListener('change', paintFab); else fabMq.addListener(paintFab); }
    paintFab();
    // 모바일: 떠 있는 '섬 걷기' 버튼을 하단 카드 바로 위에 두려고 카드 높이를 CSS에 알려 준다
    if (window.ResizeObserver) new ResizeObserver(() => document.documentElement.style.setProperty('--dock-h', $('#panel').offsetHeight + 'px')).observe($('#panel'));

    hud();
    panel();
    I.state.save(S);
    setInterval(tick, 1000);
    // 끝난 판을 다시 열면 결과 화면부터, 아니면 복귀 인사
    if (S.over) { S.over = false; checkOver(); }
    else welcomeBack(back);
  }

  document.addEventListener('DOMContentLoaded', init);
})(window.Island);
