// 포자 막기: 땅에서 오염 포자가 솟아오르면 터지기 전에 눌러 없앤다.
// 솟고 터지는 시각은 performance.now 기준 → 프레임 속도와 무관. 포자 하나가 버티는 시간은 최소 MIN_LIFE 보장.
// 난이도↑ = 더 빨리 터지고, 더 자주·여러 개가 동시에 솟고, 없애야 할 수가 늘어난다. 놓쳐도 되는 수는 LIVES로 고정.
(function (I) {
  const MIN_LIFE = 800; // ms
  const LIVES = 3;
  const HOLES = 9;
  const touchUI = () => !!(window.matchMedia && matchMedia('(hover: none) and (pointer: coarse)').matches);

  I.quests.register({
    id: 'spores',
    name: '포자 막기',
    desc: () => `땅에서 솟는 보라색 포자를 터지기 전에 ${touchUI() ? '탭하세요' : '누르세요'}! ${LIVES}개까지는 놓쳐도 돼요.`,
    play(root, d, opts) {
      return new Promise((resolve) => {
        const raid = !!(opts && opts.raid);
        const need = Math.min(18, 8 + Math.round(d * 1.3) + ((opts && opts.extra) || 0) * 2);
        const life = Math.max(MIN_LIFE, 1500 - d * 160);
        const gap = Math.max(380, 900 - d * 110); // 다음 포자까지 (ms)
        const maxOn = d < 2.2 ? 1 : d < 3.4 ? 2 : 3;
        let hits = 0, lives = LIVES, done = false, raf = 0, nextAt = 0, last = -1;
        const on = new Map(); // 구멍 번호 → { born, die }

        root.innerHTML = `
          <div class="q-sub">${raid ? '방어를 뚫어야 해요 · ' : ''}포자 <b class="s-hits">0</b>/${need} <span class="s-lives" aria-label="남은 기회">${'♥'.repeat(LIVES)}</span></div>
          <div class="s-field">${Array.from({ length: HOLES }, (_, i) => `<button class="s-hole" data-i="${i}" aria-label="구멍 ${i + 1}"><span class="s-spore"></span></button>`).join('')}</div>`;
        const holes = [...root.querySelectorAll('.s-hole')];
        const livesEl = root.querySelector('.s-lives');
        const paintLives = () => { livesEl.innerHTML = '♥'.repeat(lives) + `<span class="s-lost">${'♥'.repeat(LIVES - lives)}</span>`; };

        function spawn(now) {
          const free = [];
          for (let i = 0; i < HOLES; i++) if (!on.has(i) && i !== last) free.push(i);
          if (!free.length) return;
          const i = free[Math.floor(Math.random() * free.length)];
          last = i;
          on.set(i, { born: now, die: now + life * (0.92 + Math.random() * 0.16) });
          holes[i].classList.remove('pop', 'burst', 'late');
          holes[i].classList.add('up');
        }

        function burst(i) {
          on.delete(i);
          const h = holes[i];
          h.classList.remove('up', 'late');
          h.classList.add('burst');
          setTimeout(() => h.classList.remove('burst'), 450);
          lives--;
          paintLives();
          I.quests.flash(root, 'bad');
          if (lives <= 0) end(false);
        }

        function frame() {
          if (done) return;
          const now = performance.now();
          for (const [i, s] of on) if (now >= s.die) { burst(i); if (done) return; }
          // 남은 목표만큼만 솟게 (놓치면 그만큼 더 솟는다)
          if (now >= nextAt && on.size < maxOn && hits + on.size < need) {
            spawn(now);
            nextAt = now + gap * (0.8 + Math.random() * 0.4);
          }
          for (const [i, s] of on) {
            const k = (now - s.born) / (s.die - s.born);
            holes[i].style.setProperty('--k', Math.min(1, k).toFixed(3));
            if (k > 0.7) holes[i].classList.add('late');
          }
          raf = requestAnimationFrame(frame);
        }

        function tap(i) {
          if (done || !on.has(i)) return; // 빈 구멍은 벌점 없음 (빨리 누르다 빗나가도 괜찮게)
          on.delete(i);
          const h = holes[i];
          h.classList.remove('up', 'late');
          h.classList.add('pop');
          setTimeout(() => h.classList.remove('pop'), 300);
          hits++;
          root.querySelector('.s-hits').textContent = hits;
          if (hits >= need) end(true);
        }
        holes.forEach((h, i) => {
          h.addEventListener('pointerdown', (e) => { if (e.button === 0 || e.pointerType !== 'mouse') { e.preventDefault(); tap(i); } });
          h.onclick = (e) => { if (e.detail === 0) tap(i); };
        });

        function stop() { done = true; cancelAnimationFrame(raf); }
        function end(ok) {
          stop();
          if (!ok) root.querySelector('.q-sub').innerHTML = hits ? `포자가 퍼졌어요! <b>${hits}/${need}</b>까지 막았어요` : `포자가 퍼졌어요! <b>0/${need}</b>`;
          I.quests.flash(root, ok ? 'ok' : 'bad');
          setTimeout(() => resolve({
            success: ok, hits, need, ico: '🦠', why: '포자가 땅에 퍼졌어요.',
            prog: hits ? `<b>${hits}/${need}</b>까지 막았어요` : `하나도 못 막았어요 · <b>0/${need}</b>`,
          }), ok ? 450 : 900);
        }
        root.__cancel = () => { if (done) return; stop(); resolve({ success: false, cancelled: true, hits, need }); };

        nextAt = performance.now() + 700; // 첫 포자는 잠깐 뒤에
        raf = requestAnimationFrame(frame);
      });
    },
  });
})(window.Island);
