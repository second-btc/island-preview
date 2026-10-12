// 모든 밸런스 수치는 여기서만 조정한다.
window.Island = window.Island || {};

Island.config = {
  SAVE_KEY: 'island.v6', // v6: 600구획 (v5까지는 150필지라 호환 안 됨)
  ISLAND_SEED: 1111,       // 모든 유저가 보는 단 하나의 섬 모양 (바꾸면 섬이 바뀜)

  // 섬
  GRID: 16,               // 격자 한 변
  LAND_PLOTS: 150,        // 육지 칸 수 (섬 지형 단위)
  LOT_SPLIT: 2,           // 칸 하나를 2×2 구획으로 → 소유 단위 600구획
  TOTAL_TOKENS: 1000000,  // 섬 전체 '처음' 매장량 (구역별 랜덤 배분). 회복분까지 친 시즌 총공급 상한은 아래 REGEN_MAX 참고
  PARETO_ALPHA: 1.5,      // 낮을수록 대박 구역이 더 극단적
  MAX_SHARE: 0.12,        // 한 구역 최대 매장 비율 (한 땅이 판을 독식하지 않게)
  SIGNAL_NOISE: 0.3,      // 탐사 신호가 ±1 틀릴 확률
  JACKPOT_TOP: 0.05,      // 상위 5% 매장량 = 대박 광맥

  // 난이도: d = DIFF_BASE + MAX_ADD × (점령률)^EXP + 지형 보정
  DIFF_BASE: 1.6,
  DIFF_MAX_ADD: 2.6,
  DIFF_EXP: 1.5,
  TERRAIN_ADJ: { beach: 0, forest: 0.1, mountain: 0.25 },
  PITY_STEP: 0,
  FAIL_LOCK_SEC: 20,       // 실패하면 그 땅은 잠깐 쉬었다가 다시 도전

  // 깃발: 땅을 가지려면 깃발 1개가 필요. 최대 보유량과 충전 시간 (다시 들어오게 만드는 장치)
  FLAGS_MAX: 3,

  // 땅 지키기: 보호 시간 안에 순찰하지 않으면 무방비 → 빼앗길 수 있음
  PROTECT_SEC: 48 * 3600,
  WARN_SEC: 12 * 3600,
  RAID_EXTRA_HITS: 1,       // 남의 땅을 빼앗을 땐 기본 +1회 더 성공해야 함
  RIVAL_RAID_CHANCE: 0.6,   // 라이벌 차례에 내 무방비 땅이 있으면 빼앗으러 올 확률
  RIVAL_TEND_CHANCE: 0.5,   // 라이벌이 자기 무방비 땅을 다시 순찰할 확률(차례마다)
  BUILDINGS: {
    fence: { name: '목책 울타리', icon: '🪵', cost: 500, protect: 24 * 3600, guard: 1, desc: '보호 +24시간 · 뺏으려면 1번 더 성공' },
    tower: { name: '망루', icon: '🗼', cost: 2000, protect: 48 * 3600, guard: 1, desc: '보호 +48시간 · 뺏으려면 1번 더 성공' },
  },
  FLAG_REGEN_SEC: 4 * 3600,
  // 보급 상자: 섬 곳곳에 최대 3개. 열면 토큰(대부분) 또는 깃발. 하나 열 때마다 45분 뒤 새 상자
  CRATE_MAX: 3,
  CRATE_SEC: 45 * 60,
  CRATE_FLAG_CHANCE: 0.2,
  CRATE_TOKENS: [60, 250],
  OFFLINE_CAP_SEC: 3 * 24 * 3600, // 자리 비운 시간은 최대 3일까지만 반영

  // 채굴: 남은 매장량의 일정 비율씩 (약 10시간마다 절반)
  MINE_RATE: 0.00002,
  // 매장량 회복: 하루에 '처음 매장량'의 3%씩 다시 차오른다 (남은 매장량은 처음 매장량을 넘지 않음).
  // 그래서 다 캔 땅도 하루 약 3%씩은 계속 나온다 (평형: 남은 양 ≈ 처음의 1.7%, 캐는 양 = 차오르는 양).
  // 공급 상한: 한 땅이 평생 다시 채우는 양은 처음 매장량 × REGEN_MAX까지 → 섬 전체로 한 시즌 최대 TOTAL_TOKENS × (1 + REGEN_MAX).
  // 시즌이 끝나면(감염 폭풍) 섬이 새로 만들어지며 회복 한도도 처음부터.
  REGEN_PER_DAY: 0.03,
  REGEN_MAX: 1,

  // 라이벌 (남은 땅이 줄수록 더 빨리 가져감)
  // 실제 시간 기준: 처음엔 약 1.8시간에 1필지, 막판엔 40분에 1필지 → 한 시즌 약 1주
  RIVAL_FIRST_DELAY: 20 * 60,
  RIVAL_SEC_START: 1625,  // 600구획이라 150필지 때(6500·2400)의 1/4 간격 → 시즌 길이는 그대로 약 1주
  RIVAL_SEC_END: 600,
  RIVAL_SMART: 0.35,      // 신호 강한 구역을 노릴 확률
  RIVALS: [
    { id: 'prince', name: '붉은 늑대단', color: '#e8575a' },
    { id: 'e2land', name: '보랏빛 방주회', color: '#8b7cf6' },
    { id: 'whale', name: '푸른 등대지기', color: '#4d74ff' }, // 청록이면 라군·해변 색과 섞인다
    { id: 'flip', name: '주황 개척단', color: '#ff6a12' },  // 내 땅 노랑과 헷갈리지 않게 더 짙은 주황
  ],
  ME_COLOR: '#ffd34d',

  TERRAIN: {
    beach: { name: '해변', color: '#f2dca2' },
    forest: { name: '숲', color: '#5fbf6b' },
    mountain: { name: '언덕', color: '#a6b3a0' },
  },
};
