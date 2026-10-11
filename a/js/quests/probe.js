// 광맥 탐사: 땅 밑에 숨은 광맥 한 칸을 탐침 3개 안에 찾는다.
// 탐침을 꽂은 칸에는 광맥 쪽을 가리키는 화살표(8방위)가 뜬다 → 운이 아니라 추리.
// 화살표 두 개가 겹치는 곳을 노리면 늘 찾을 수 있고, 아무 데나 찌르면 절반쯤 놓친다.
// 난이도↑ = 땅이 넓어진다(5→6→7칸). 빼앗기는 방어 건물 하나마다 한 칸 더 넓게.
(function (I) {
  // 화면 기준 8방위 (y는 아래로). atan2(dy, dx)를 45°씩 나눈 순서
  const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
  const PROBES = 3;
  const touchUI = () => !!(window.matchMedia && matchMedia('(hover: none) and (pointer: coarse)').matches);

  I.quests.register({
    id: 'probe',
    name: '광맥 탐사',
    desc: () => `땅을 ${touchUI() ? '탭하면' : '누르면'} 탐침이 꽂히고, 화살표가 광맥 쪽을 가리켜요. 탐침 ${PROBES}개 안에 광맥을 찾으세요!`,
    play(root, d, opts) {
      return new Promise((resolve) => {
        const raid = !!(opts && opts.raid);
        const n = Math.min(7, (d < 2.3 ? 5 : d < 3.4 ? 6 : 7) + ((opts && opts.extra) || 0));
        const vx = Math.floor(Math.random() * n), vy = Math.floor(Math.random() * n);
        let used = 0, done = false;

        root.innerHTML = `
          <div class="q-sub">${raid ? '방어를 뚫어야 해요 · ' : ''}남은 탐침 <b class="p-left"></b></div>
          <div class="p-grid" style="grid-template-columns:repeat(${n},1fr)">
            ${Array.from({ length: n * n }, (_, i) => `<button class="p-cell" data-i="${i}" aria-label="${Math.floor(i / n) + 1}행 ${(i % n) + 1}열"></button>`).join('')}
          </div>`;
        const cells = [...root.querySelectorAll('.p-cell')];
        const leftEl = root.querySelector('.p-left');
        const paintLeft = () => { leftEl.innerHTML = '📍'.repeat(PROBES - used) + `<span class="p-used">${'📍'.repeat(used)}</span>`; };
        paintLeft();

        function probe(i) {
          if (done) return;
          const c = cells[i];
          if (c.classList.contains('dug')) return;
          const x = i % n, y = Math.floor(i / n);
          used++;
          paintLeft();
          c.classList.add('dug');
          if (x === vx && y === vy) {
            c.classList.add('vein');
            c.textContent = '💎';
            end(true);
            return;
          }
          const dir = ((Math.round(Math.atan2(vy - y, vx - x) / (Math.PI / 4)) % 8) + 8) % 8;
          c.textContent = ARROWS[dir];
          c.setAttribute('aria-label', `${c.getAttribute('aria-label')}: 광맥은 ${ARROWS[dir]} 쪽`);
          if (used >= PROBES) {
            // 다 썼으면 광맥 위치를 보여 주고 끝
            const v = cells[vy * n + vx];
            v.classList.add('vein', 'missed');
            v.textContent = '💎';
            root.querySelector('.q-sub').innerHTML = '탐침이 떨어졌어요! 광맥은 여기 있었어요';
            end(false);
          }
        }
        cells.forEach((c, i) => {
          c.addEventListener('pointerdown', (e) => { if (e.button === 0 || e.pointerType !== 'mouse') { e.preventDefault(); probe(i); } });
          c.onclick = (e) => { if (e.detail === 0) probe(i); };
        });

        function end(ok) {
          done = true;
          I.quests.flash(root, ok ? 'ok' : 'bad');
          setTimeout(() => resolve({ success: ok, ico: '⛏️', why: '탐침이 광맥을 비껴갔어요.' }), ok ? 650 : 1500);
        }
        root.__cancel = () => { if (done) return; done = true; resolve({ success: false, cancelled: true }); };
      });
    },
  });
})(window.Island);
