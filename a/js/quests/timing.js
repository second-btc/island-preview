// 광맥 타이밍: 움직이는 탐침을 목표 구간에서 멈춘다.
// 바늘·구간 위치는 프레임이 아니라 시각(performance.now)으로 계산하고, 누른 그 순간의 위치로 판정한다
// → 30fps든 120fps든 판정이 같다. 어떤 난이도에서도 '맞힐 수 있는 시간'은 최소 MIN_WIN초 보장.
// 난이도는 폭을 좁히는 대신 필요한 성공 횟수와 구간 이동(후반)으로 올린다.
(function (I) {
  const MIN_WIN = 0.09;  // 초: 바늘과 구간이 마주 달려도 이만큼은 구간 안에 머문다
  const HOLD_MS = 180;   // 성공 직후 잠깐 입력 무시 (연타가 다음 판 실패로 이어지지 않게)
  const touchUI = () => !!(window.matchMedia && matchMedia('(hover: none) and (pointer: coarse)').matches);

  // lo~hi 사이를 왕복하는 위치 (삼각파)
  function bounce(x, lo, hi) {
    const span = hi - lo;
    if (span <= 0) return lo;
    const k = (((x - lo) % (2 * span)) + 2 * span) % (2 * span);
    return lo + (k <= span ? k : 2 * span - k);
  }

  I.quests.register({
    id: 'timing',
    name: '깃발 꽂기',
    desc: () => (touchUI() ? '바늘이 금색 구간에 들어왔을 때 탭하세요!' : '바늘이 금색 구간에 들어왔을 때 누르세요! (클릭 또는 Space)'),
    play(root, d, opts) {
      return new Promise((resolve) => {
        const raid = !!(opts && opts.raid);
        const need = Math.min(5, (d < 3 ? 3 : 4) + ((opts && opts.extra) || 0)); // 방어 건물이 겹쳐도 최대 5번 (사람이 할 만한 선)
        const speed0 = 60 + d * 14;               // %/초
        const drift = d >= 2.4 ? 10 + d * 5 : 0;  // 후반엔 금색 구간도 움직인다 (%/초)
        let hits = 0, raf = 0, done = false, holdUntil = 0;
        let t0 = 0, c0 = 0, cdir = 1, v = speed0, zoneW = 10, z0 = 0, zdir = 1;

        root.innerHTML = `
          <div class="q-sub">${raid ? '방어를 뚫어야 해요 · ' : need > 3 ? '땅이 귀해졌어요 · ' : ''}${need}번 연속 성공하면 내 땅 <b class="t-hits">0</b>/${need}</div>
          <div class="t-track"><div class="t-zone"></div><div class="t-cursor"></div></div>
          <button class="btn primary big t-stop">${raid ? '⚔️ 빼앗기!' : '🚩 꽂기!'}</button>`;
        const zone = root.querySelector('.t-zone');
        const cur = root.querySelector('.t-cursor');
        const btn = root.querySelector('.t-stop');

        const curAt = (t) => bounce(c0 + cdir * v * ((t - t0) / 1000), 0, 100);
        const zoneAt = (t) => (drift ? bounce(z0 + zdir * drift * ((t - t0) / 1000), 2, 98 - zoneW) : z0);

        function newZone(now) {
          v = speed0 * (1 + hits * 0.1);
          // 폭은 난이도에 따라 좁아지되, (바늘 속도 + 구간 속도) × MIN_WIN 아래로는 안 내려간다
          zoneW = Math.min(40, Math.max(14 - d * 2, (v + drift) * MIN_WIN));
          z0 = 3 + Math.random() * (94 - zoneW);
          zdir = Math.random() < 0.5 ? 1 : -1;
          // 바늘은 구간에서 먼 쪽 끝에서 출발 (보고 맞출 시간을 준다)
          c0 = z0 + zoneW / 2 < 50 ? 100 : 0;
          cdir = c0 ? -1 : 1;
          t0 = now;
          zone.style.width = zoneW + '%';
          draw(now);
        }

        function draw(t) {
          zone.style.left = zoneAt(t) + '%';
          cur.style.left = curAt(t) + '%';
        }

        function frame(t) {
          if (done) return;
          draw(performance.now());
          raf = requestAnimationFrame(frame);
        }

        // 누른 순간(이벤트 시각)의 위치로 판정. 커서 두께만큼 살짝 여유
        function stop(e) {
          const now = performance.now();
          if (done || now < holdUntil) return;
          const ts = e && e.timeStamp > 0 && Math.abs(now - e.timeStamp) < 1000 ? e.timeStamp : now;
          const pos = curAt(ts), zs = zoneAt(ts);
          if (pos >= zs - 0.6 && pos <= zs + zoneW + 0.6) {
            hits++;
            root.querySelector('.t-hits').textContent = hits;
            I.quests.flash(root, 'ok');
            if (hits >= need) end(true);
            else { holdUntil = now + HOLD_MS; newZone(now); }
          } else {
            I.quests.flash(root, 'bad');
            cur.style.left = pos + '%';
            root.querySelector('.q-sub').innerHTML = hits ? `아깝다! <b>${hits}/${need}</b>까지 성공` : `아깝다! 첫 번째에서 놓쳤어요 <b>0/${need}</b>`;
            end(false);
          }
        }

        function onKey(e) {
          if (e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
          e.preventDefault(); // 포커스된 버튼의 기본 클릭까지 겹쳐 두 번 판정되지 않게
          if (!e.repeat) stop(e);
        }

        function end(ok) {
          done = true;
          cancelAnimationFrame(raf);
          document.removeEventListener('keydown', onKey);
          btn.disabled = true;
          setTimeout(() => resolve({ success: ok, hits, need }), ok ? 450 : 700);
        }

        // 그만두기 (✕·Esc): 판정 없이 끝낸다
        root.__cancel = () => {
          if (done) return;
          done = true;
          cancelAnimationFrame(raf);
          document.removeEventListener('keydown', onKey);
          resolve({ success: false, cancelled: true, hits, need });
        };
        newZone(performance.now());
        // 클릭(손을 뗄 때)이 아니라 누르는 순간에 판정해야 터치에서도 늦지 않는다
        btn.addEventListener('pointerdown', (e) => { if (e.button === 0 || e.pointerType !== 'mouse') stop(e); });
        btn.onclick = (e) => { if (e.detail === 0) stop(e); }; // 화면 낭독기 등 포인터 없는 클릭
        document.addEventListener('keydown', onKey);
        btn.focus({ preventScroll: true });
        raf = requestAnimationFrame(frame);
      });
    },
  });
})(window.Island);
