// 봉화 신호: 봉화가 켜지는 순서를 기억했다가 같은 순서로 누른다.
// 난이도↑ = 순서가 길어지고 보여 주는 간격이 짧아진다. 후반엔 봉화가 9개 → 16개.
// 틀리면 그 자리에서 끝나고, 원래 눌러야 했던 봉화를 알려 준다.
(function (I) {
  const touchUI = () => !!(window.matchMedia && matchMedia('(hover: none) and (pointer: coarse)').matches);

  I.quests.register({
    id: 'memory',
    name: '봉화 신호',
    desc: () => `봉화가 켜지는 순서를 기억했다가 같은 순서로 ${touchUI() ? '탭하세요' : '누르세요'}.`,
    play(root, d, opts) {
      return new Promise((resolve) => {
        const raid = !!(opts && opts.raid);
        const size = d < 2.8 ? 3 : 4;
        const need = Math.min(8, 3 + Math.round(d * 0.75) + ((opts && opts.extra) || 0));
        const show = Math.max(340, 660 - d * 65); // ms: 봉화 하나가 켜지는 간격
        const seq = [];
        while (seq.length < need) {
          const n = Math.floor(Math.random() * size * size);
          if (n !== seq[seq.length - 1]) seq.push(n);
        }

        root.innerHTML = `
          <div class="q-sub m-msg">${raid ? '방어 신호를 뚫어야 해요 · ' : ''}봉화 ${need}개가 켜져요. 잘 보세요…</div>
          <div class="m-grid watch" style="grid-template-columns:repeat(${size},1fr)">
            ${Array.from({ length: size * size }, (_, i) => `<button class="m-tile" data-i="${i}" aria-label="봉화 ${i + 1}"></button>`).join('')}
          </div>`;
        const grid = root.querySelector('.m-grid');
        const tiles = [...root.querySelectorAll('.m-tile')];
        const msg = root.querySelector('.m-msg');
        const timers = [];
        let input = false, k = 0, done = false;
        const later = (fn, ms) => timers.push(setTimeout(fn, ms));
        const light = (t, ms) => { t.classList.add('lit'); later(() => t.classList.remove('lit'), ms); };

        seq.forEach((n, i) => later(() => light(tiles[n], show * 0.68), 900 + i * show));
        later(() => {
          input = true;
          grid.classList.remove('watch');
          msg.innerHTML = `같은 순서로! <b class="m-k">0</b>/${need}`;
        }, 900 + need * show);

        function press(t) {
          if (!input || done) return;
          if (+t.dataset.i === seq[k]) {
            k++;
            light(t, 200);
            root.querySelector('.m-k').textContent = k;
            if (k >= need) end(true);
          } else {
            t.classList.add('wrong');
            tiles[seq[k]].classList.add('hint'); // 원래 눌러야 했던 봉화
            msg.innerHTML = k ? `아깝다! <b>${k}/${need}</b>까지 맞혔어요` : `아깝다! 첫 번째 봉화가 아니에요 <b>0/${need}</b>`;
            end(false);
          }
        }
        // 누르는 순간 판정 (터치에서 늦지 않게). 키보드·화면 낭독기 클릭은 onclick으로
        tiles.forEach((t) => {
          t.addEventListener('pointerdown', (e) => { if (e.button === 0 || e.pointerType !== 'mouse') { e.preventDefault(); press(t); } });
          t.onclick = (e) => { if (e.detail === 0) press(t); };
        });

        function stop() { done = true; input = false; timers.forEach(clearTimeout); }
        function end(ok) {
          stop();
          I.quests.flash(root, ok ? 'ok' : 'bad');
          setTimeout(() => resolve({
            success: ok, hits: k, need, ico: '🔥', why: '봉화 신호가 엇갈렸어요.',
            prog: k ? `<b>${k}/${need}</b>까지 맞혔어요` : `첫 번째 봉화부터 엇갈렸어요 · <b>0/${need}</b>`,
          }), ok ? 450 : 1000);
        }
        // 그만두기 (✕·Esc)
        root.__cancel = () => { if (done) return; stop(); resolve({ success: false, cancelled: true, hits: k, need }); };
      });
    },
  });
})(window.Island);
