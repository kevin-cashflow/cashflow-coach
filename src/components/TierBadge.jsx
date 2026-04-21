"use client";

import { TIERS, getTierByCount, getNextTierProgress } from "@/lib/tier";

/**
 * 🏆 티어 배지 (Phase B Day 3 - 10단계 확장)
 *
 * Props:
 * - playCount: 플레이 횟수 (count로 자동 티어 결정)
 * - tierKey: 직접 tier 키 지정 (brown, silver, ...)
 * - size: "xs" | "sm" | "md" | "lg"
 * - showName: 이름도 표시할지
 */
export default function TierBadge({ playCount, tierKey, size = "sm", showName = true }) {
  let tier;
  if (tierKey) {
    tier = TIERS.find(t => t.key === tierKey) || TIERS[0];
  } else if (typeof playCount === "number") {
    if (playCount < 1) return null; // 플레이 기록 없으면 표시 안 함
    tier = getTierByCount(playCount);
  } else {
    return null;
  }

  const sizes = {
    xs: { fontSize: 10, padding: "1px 4px", gap: 2 },
    sm: { fontSize: 11, padding: "2px 7px", gap: 3 },
    md: { fontSize: 14, padding: "4px 10px", gap: 4 },
    lg: { fontSize: 18, padding: "6px 14px", gap: 5 },
  };
  const style = sizes[size] || sizes.sm;

  return (
    <span style={{
      ...style,
      display: "inline-flex",
      alignItems: "center",
      borderRadius: 6,
      background: tier.bgColor,
      border: `1px solid ${tier.color}60`,
      color: tier.color,
      fontWeight: 800,
      whiteSpace: "nowrap",
      lineHeight: 1,
    }}>
      <span style={{ lineHeight: 1 }}>{tier.icon}</span>
      {showName && <span style={{ fontSize: style.fontSize - 1 }}>{tier.name}</span>}
    </span>
  );
}

// ─── 티어 진행도 카드 (프로필/랭킹에서 사용) ───
export function TierProgressCard({ playCount }) {
  const { current, next, remaining, percentInTier } = getNextTierProgress(playCount || 0);
  
  return (
    <div style={{
      padding: 16,
      borderRadius: 12,
      background: `linear-gradient(135deg, ${current.bgColor}, #111118)`,
      border: `1px solid ${current.color}40`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 32 }}>{current.icon}</div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: current.color }}>
            {current.name}
          </div>
          <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 2 }}>
            {playCount || 0}회 플레이
          </div>
        </div>
      </div>
      
      {/* 진행 바 */}
      {next && (
        <>
          <div style={{
            height: 6,
            borderRadius: 3,
            background: "#27272a",
            overflow: "hidden",
            marginBottom: 8,
          }}>
            <div style={{
              height: "100%",
              width: `${percentInTier}%`,
              background: `linear-gradient(90deg, ${current.color}, ${next.color})`,
              transition: "width 0.3s",
            }} />
          </div>
          <div style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            color: "#a1a1aa",
          }}>
            <span>{next.icon}</span>
            <span>{next.name}까지 <strong style={{ color: "#fafafa" }}>{remaining}회</strong> 남음</span>
          </div>
        </>
      )}
      
      {!next && (
        <div style={{ fontSize: 11, color: "#FFD700", textAlign: "center" }}>
          🎊 최고 티어 달성!
        </div>
      )}
    </div>
  );
}
