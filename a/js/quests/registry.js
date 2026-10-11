// 퀘스트 플러그인 등록소.
// 퀘스트 = { id, name, desc, play(root, d) → Promise<{ success }> }
// 새 퀘스트는 파일 하나 만들고 Island.quests.register(...)만 하면 출제 풀에 들어간다.
(function (I) {
  I.quests = {
    list: [],
    last: null,
    register(q) {
      this.list.push(q);
    },
    // prefer: 그 퀘스트를 우선 (처음 온 유저의 첫 도전은 가장 익숙한 타이밍으로). 그 외엔 직전과 다른 것을 무작위로
    pick(prefer) {
      const pool = this.list.length > 1 ? this.list.filter((q) => q.id !== this.last) : this.list;
      const q = this.list.find((x) => x.id === prefer) || pool[Math.floor(Math.random() * pool.length)];
      this.last = q.id;
      return q;
    },
    flash(root, kind) {
      root.classList.remove('flash-ok', 'flash-bad');
      void root.offsetWidth;
      root.classList.add(kind === 'ok' ? 'flash-ok' : 'flash-bad');
    },
  };
})(window.Island);
