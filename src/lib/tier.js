/**
 * 티어 시스템 (Phase B Day 2/3 - 10단계 확장)
 *
 * 게임 플레이 횟수에 따라 10단계 티어 부여
 */

// ─── 티어 정의 ───
export const TIERS = [
  {
    key: "bronze",
    name: "브론즈",
    icon: "🥉",
    color: "#CD7F32",
    bgColor: "#CD7F3220",
    minCount: 1,
    maxCount: 4,
    description: "캐쉬플로우의 기본 규칙을 익혀가는 단계",
    learningPoints: [
      "캐쉬플로우와 자본금의 개념",
      "급여일/시장/두다드 카드 구분",
    ],
    recommendations: [
      "매 턴 선택을 자유롭게 시도",
      "디브리핑 꼭 읽기",
    ],
  },
  {
    key: "silver",
    name: "실버",
    icon: "🥈",
    color: "#C0C0C0",
    bgColor: "#C0C0C020",
    minCount: 5,
    maxCount: 9,
    description: "반복된 플레이로 패턴을 감지하기 시작",
    learningPoints: [
      "실소득과 수동소득의 차이",
      "부채와 자산의 관계",
    ],
    recommendations: [
      "선택의 결과를 복기",
      "다양한 직업으로 시도",
    ],
  },
  {
    key: "gold",
    name: "골드",
    icon: "🥇",
    color: "#FFD700",
    bgColor: "#FFD70020",
    minCount: 10,
    maxCount: 19,
    description: "다양한 전략을 시도해보는 단계",
    learningPoints: [
      "투자 타이밍 감각",
      "현금흐름 관리",
    ],
    recommendations: [
      "큰 거래에 도전",
      "장기 전략 수립",
    ],
  },
  {
    key: "platinum",
    name: "플래티넘",
    icon: "🛡️",
    color: "#E5E4E2",
    bgColor: "#E5E4E220",
    minCount: 20,
    maxCount: 34,
    description: "자신만의 투자 원칙이 형성됨",
    learningPoints: [
      "레버리지 활용",
      "리스크 관리",
    ],
    recommendations: [
      "대회 모드 도전",
      "탈출 시간 단축 시도",
    ],
  },
  {
    key: "emerald",
    name: "에메랄드",
    icon: "💚",
    color: "#50C878",
    bgColor: "#50C87820",
    minCount: 35,
    maxCount: 54,
    description: "게임의 흐름을 주도하는 단계",
    learningPoints: [
      "다각화 포트폴리오",
      "시장 변동성 대응",
    ],
    recommendations: [
      "다양한 직업 마스터",
      "최적화 전략 구축",
    ],
  },
  {
    key: "sapphire",
    name: "사파이어",
    icon: "💙",
    color: "#0F52BA",
    bgColor: "#0F52BA20",
    minCount: 55,
    maxCount: 79,
    description: "게임 속 선택이 실생활에 반영되기 시작",
    learningPoints: [
      "실생활 연결 시작",
      "기회와 위기 판별",
    ],
    recommendations: [
      "본인의 투자 원칙 정립",
      "코칭딜러 과정 검토",
    ],
  },
  {
    key: "diamond",
    name: "다이아몬드",
    icon: "💎",
    color: "#B9F2FF",
    bgColor: "#B9F2FF20",
    minCount: 80,
    maxCount: 119,
    description: "다른 사람을 가르칠 수 있는 수준",
    learningPoints: [
      "고급 투자 전략",
      "복리의 마법 체득",
    ],
    recommendations: [
      "다른 사람 코칭 시도",
      "협회 프로그램 참여",
    ],
  },
  {
    key: "master",
    name: "마스터",
    icon: "👑",
    color: "#9370DB",
    bgColor: "#9370DB20",
    minCount: 120,
    maxCount: 199,
    description: "국제캐쉬플로우강사협회의 핵심 멤버 수준",
    learningPoints: [
      "전문가 수준 판단력",
      "교육자적 시각",
    ],
    recommendations: [
      "🎯 코칭딜러 자격 도전",
      "강의/워크숍 참여",
    ],
  },
  {
    key: "grandmaster",
    name: "그랜드마스터",
    icon: "⭐",
    color: "#FF6B35",
    bgColor: "#FF6B3520",
    minCount: 200,
    maxCount: 499,
    description: "캐쉬플로우 세계의 최고 경지",
    learningPoints: [
      "철학적 이해",
      "재무 IQ 최고점",
    ],
    recommendations: [
      "🎓 마스터 코칭딜러 도전",
      "커뮤니티 리더십 발휘",
    ],
  },
  {
    key: "challenger",
    name: "챌린저",
    icon: "🏆",
    color: "#FFD700",
    bgColor: "#FFD70030",
    minCount: 500,
    maxCount: Infinity,
    description: "캐쉬플로우를 완전히 체화한 경지",
    learningPoints: [
      "캐쉬플로우의 최고 경지",
      "부의 마인드 완전 체화",
    ],
    recommendations: [
      "후진 양성",
      "Kiyosaki 철학 전파",
    ],
  },
];

// ─── 플레이 횟수로 티어 계산 ───
export function calculateTier(playCount) {
  if (!playCount || playCount < 1) return TIERS[0].key;
  for (const tier of TIERS) {
    if (playCount >= tier.minCount && playCount <= tier.maxCount) {
      return tier.key;
    }
  }
  return TIERS[TIERS.length - 1].key;
}

// ─── 티어 키로 티어 정보 조회 ───
export function getTierByKey(key) {
  return TIERS.find(t => t.key === key) || TIERS[0];
}

// ─── 플레이 횟수로 티어 정보 조회 ───
export function getTierByCount(count) {
  const key = calculateTier(count);
  return getTierByKey(key);
}

// ─── 승급 체크 ───
export function checkTierUp(oldCount, newCount) {
  const oldTier = calculateTier(oldCount);
  const newTier = calculateTier(newCount);
  if (oldTier !== newTier) {
    return {
      from: getTierByKey(oldTier),
      to: getTierByKey(newTier),
    };
  }
  return null;
}

// ─── 다음 티어까지 남은 횟수 ───
export function getNextTierProgress(playCount) {
  const currentTier = getTierByCount(playCount);
  const currentIndex = TIERS.findIndex(t => t.key === currentTier.key);
  
  if (currentIndex === TIERS.length - 1) {
    // 최고 티어 - 다음 없음
    return {
      current: currentTier,
      next: null,
      remaining: 0,
      percentInTier: 100,
    };
  }
  
  const nextTier = TIERS[currentIndex + 1];
  const remaining = Math.max(0, nextTier.minCount - playCount);
  const inTierCount = playCount - currentTier.minCount;
  const tierRange = currentTier.maxCount - currentTier.minCount + 1;
  const percentInTier = Math.min(100, Math.round((inTierCount / tierRange) * 100));
  
  return {
    current: currentTier,
    next: nextTier,
    remaining,
    percentInTier,
  };
}

// ─── 전체 티어 목록 ───
export function getAllTiers() {
  return TIERS;
}
