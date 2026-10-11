// 장부 맞추기: 차변 합계 = 대변 합계. 빈칸 금액을 고른다.
(function (I) {
  const DR = ['현금', '외상매출금', '비품', '재고자산', '급여', '임차료', '감가상각비', '광고선전비'];
  const CR = ['매출', '외상매입금', '미지급금', '차입금', '자본금', '예수금'];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const fmt = (n) => n.toLocaleString('ko-KR');
  const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

  I.quests.register({
    id: 'ledger',
    name: '장부 맞추기',
    desc: '차변 합계와 대변 합계가 같아지도록 빈칸(?) 금액을 고르세요.',
    play(root, d) {
      return new Promise((resolve) => {
        const rounds = d < 3 ? 1 : 2;
        const mag = Math.pow(10, 2 + Math.min(3, Math.floor(d)));
        const step = mag >= 10000 ? 100 : 10;
        const limit = Math.max(5, 14 - d * 1.8); // 초
        const rnd = () => Math.round((mag * 0.1 + Math.random() * mag * 0.9) / step) * step;
        let round = 0, timer = 0, done = false;

        function question() {
          const nD = d < 2 ? 2 : 3;
          const nC = d < 2 ? 1 : 2;
          const ans = rnd();
          const credits = [{ a: pick(CR), v: ans, q: true }];
          for (let i = 1; i < nC; i++) credits.push({ a: pick(CR), v: rnd() });
          const total = credits.reduce((s, c) => s + c.v, 0);

          const debits = [];
          let rem = total;
          for (let i = 0; i < nD - 1; i++) {
            const v = Math.max(step, Math.round((rem * (0.2 + Math.random() * 0.4)) / step) * step);
            debits.push({ a: pick(DR), v });
            rem -= v;
          }
          debits.push({ a: pick(DR), v: rem });

          // 어려울수록 헷갈리는 보기(±몇 단위)를 먼저 쓴다
          const near = [ans + step * (1 + Math.floor(Math.random() * 9)), ans - step * (1 + Math.floor(Math.random() * 9))];
          const far = [Math.round((ans * 1.1) / step) * step, Math.round((ans * 0.9) / step) * step, ans + mag / 10];
          const cand = d >= 3 ? near.concat(far) : far.concat(near);
          const opts = new Set([ans]);
          for (const v of cand) if (opts.size < 4 && v > 0) opts.add(v);
          let extra = 2;
          while (opts.size < 4) opts.add(ans + step * 10 * extra++);

          const rows = Math.max(debits.length, credits.length);
          let body = '';
          for (let i = 0; i < rows; i++) {
            const dr = debits[i], cr = credits[i];
            body += `<tr>
              <td>${dr ? dr.a : ''}</td><td class="num">${dr ? fmt(dr.v) : ''}</td>
              <td>${cr ? cr.a : ''}</td><td class="num">${cr ? (cr.q ? '<b class="l-q">?</b>' : fmt(cr.v)) : ''}</td>
            </tr>`;
          }

          root.innerHTML = `
            <div class="q-sub">문제 ${round + 1} / ${rounds}</div>
            <div class="l-timer"><div class="l-bar"></div></div>
            <table class="l-table">
              <thead><tr><th colspan="2">차변</th><th colspan="2">대변</th></tr></thead>
              <tbody>${body}</tbody>
            </table>
            <div class="l-opts">${shuffle([...opts]).map((v) => `<button class="btn" data-v="${v}">${fmt(v)}</button>`).join('')}</div>`;

          const bar = root.querySelector('.l-bar');
          bar.style.transition = `width ${limit}s linear`;
          requestAnimationFrame(() => requestAnimationFrame(() => (bar.style.width = '0%')));
          timer = setTimeout(() => end(false), limit * 1000);

          root.querySelectorAll('.l-opts .btn').forEach((b) => {
            b.onclick = () => {
              if (done) return;
              clearTimeout(timer);
              if (+b.dataset.v === ans) {
                b.classList.add('ok');
                round++;
                if (round >= rounds) end(true);
                else { I.quests.flash(root, 'ok'); setTimeout(question, 350); }
              } else {
                b.classList.add('bad');
                end(false);
              }
            };
          });
        }

        function end(ok) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          I.quests.flash(root, ok ? 'ok' : 'bad');
          setTimeout(() => resolve({ success: ok }), 500);
        }

        question();
      });
    },
  });
})(window.Island);
