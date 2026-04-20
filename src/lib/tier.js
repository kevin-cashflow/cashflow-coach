"use client";

/**
 * 티어 시스템 유틸 (Phase B Day 2)
 *
 * 8단계 티어: 🥉 브론즈 → 🥈 실버 → 🥇 골드 → 💎 플래티넘
 *            → 🔷 사파이어 → 💚 에메랄드 → 💠 다이아몬드 → 👑 크라운
 */

export const TIER_CONFIGS = {
  bronze: {
    key: "bronze",
    icon: "🥉",
    name: "브론즈",
    nameEn: "Bronze",
    color: "#CD7F32",
    bgColor: "#8B450020",
    borderColor: "#CD7F3240",
    threshold: 0,
    description: "입문자",
  },
  silver: {
    key: "silver",
    icon: "🥈",
    name: "실버",
    nameEn: "Silver",
    color: "#C0C0C0",
    bgColor: "#80808020",
    borderColor: "#C0C0C040",
    threshold: 5,
    description: "경험자",
  },
  gold: {
    key: "gold",
    icon: "🥇",
    name: "골드",
    nameEn: "Gold",
    color: "#FFD700",
    bgColor: "#B8860B20",
    borderColor: "#FFD70040",
    threshold: 15,
    description: "숙련자",
  },
  platinum: {
    key: "platinum",
    icon: "💎",
    name: "플래티넘",
    nameEn: "Platinum",
    color: "#00CED1",
    bgColor: "#008B8B20",
    borderColor: "#00CED140",
    threshold: 30,
    description: "전문가",
  },
  sapphire: {
    key: "sapphire",
    icon: "🔷",
    name: "사파이어",
    nameEn: "Sapphire",
    color: "#3b82f6",
    bgColor: "#1e40af20",
    borderColor: "#3b82f640",
    threshold: 60,
    description: "마스터 후보",
  },
  emerald: {
    key: "emerald",
    icon: "💚",
    name: "에메랄드",
    nameEn: "Emerald",
    color: "#10b981",
    bgColor: "#047857 20",
    borderColor: "#10b98140",
    threshold: 100,
    description: "코치 후보",
  },
  diamond: {
    key: "diamond",
    icon: "💠",
    name: "다이아몬드",
    nameEn: "Diamond",
    color: "#B9F2FF",
    bgColor: "#87CEEB20",
    borderColor: "#B9F2FF40",
    threshold: 150,
    description: "마스터",
  },
  crown: {
    key: "crown",
    icon: "👑",
    name: "크라운",
    nameEn: "Crown",
    color: "#FFD700",
    bgColor: "#FFA50020",
    borderColor: "#FFD70060",
    threshold: 250,
    description: "레전드",
  },
};

// 티어 순서 (오름차순)
export const TIER_ORDER = ["bronze", "silver", "gold", "platinum", "sapphire", "emerald", "diamond", "crown"];

/**
 * 플레이 횟수로 현재 티어 계산
 * @param {number} playCount - 총 플레이 횟수 (일반 + 대회)
 * @returns {string} 티어 key (bronze, silver, ...)
 */
export function calculateTier(playCount) {
  const count = Math.max(0, parseInt(playCount) || 0);
  if (count >= 250) return "crown";
  if (count >= 150) return "diamond";
  if (count >= 100) return "emerald";
  if (count >= 60)  return "sapphire";
  if (count >= 30)  return "platinum";
  if (count >= 15)  return "gold";
  if (count >= 5)   return "silver";
  return "bronze";
}

/**
 * 티어 정보 가져오기
 * @param {string} tierKey - 티어 key
 * @returns {object} 티어 설정
 */
export function getTierInfo(tierKey) {
  return TIER_CONFIGS[tierKey] || TIER_CONFIGS.bronze;
}

/**
 * 플레이 횟수로 티어 정보 직접 가져오기
 * @param {number} playCount
 * @returns {object} 티어 설정
 */
export function getTierByCount(playCount) {
  return getTierInfo(calculateTier(playCount));
}

/**
 * 다음 티어 정보 + 진행도
 * @param {number} playCount
 * @returns {object} { current, next, remaining, progress }
 */
export function getTierProgress(playCount) {
  const count = Math.max(0, parseInt(playCount) || 0);
  const currentKey = calculateTier(count);
  const currentIdx = TIER_ORDER.indexOf(currentKey);
  const nextKey = currentIdx < TIER_ORDER.length - 1 ? TIER_ORDER[currentIdx + 1] : null;
  
  const current = getTierInfo(currentKey);
  const next = nextKey ? getTierInfo(nextKey) : null;
  
  const remaining = next ? Math.max(0, next.threshold - count) : 0;
  
  // 진행도 계산 (현재 티어 시작 ~ 다음 티어 시작)
  let progress = 0;
  if (next) {
    const span = next.threshold - current.threshold;
    const done = count - current.threshold;
    progress = span > 0 ? Math.min(100, Math.max(0, (done / span) * 100)) : 100;
  } else {
    progress = 100; // 크라운 달성 시
  }
  
  return {
    current,
    next,
    remaining,
    progress: Math.round(progress),
    count,
  };
}

/**
 * 티어 승급 체크
 * @param {number} oldCount - 이전 플레이 횟수
 * @param {number} newCount - 현재 플레이 횟수
 * @returns {object|null} 승급 시 { from, to } | 아니면 null
 */
export function checkTierUp(oldCount, newCount) {
  const oldTier = calculateTier(oldCount);
  const newTier = calculateTier(newCount);
  if (oldTier !== newTier) {
    return {
      from: getTierInfo(oldTier),
      to: getTierInfo(newTier),
    };
  }
  return null;
}

/**
 * 티어 비교 (정렬용)
 * @returns {number} a가 더 높으면 -1, b가 더 높으면 1, 같으면 0
 */
export function compareTiers(tierKeyA, tierKeyB) {
  const idxA = TIER_ORDER.indexOf(tierKeyA);
  const idxB = TIER_ORDER.indexOf(tierKeyB);
  return idxB - idxA; // 내림차순 (높은 티어 먼저)
}