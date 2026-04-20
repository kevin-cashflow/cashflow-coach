"use client";

import { getTierByCount, getTierInfo, getTierProgress } from "@/lib/tier";

/**
 * 티어 배지 컴포넌트 (Phase B Day 2)
 *
 * Props:
 * - playCount: 플레이 횟수 (티어 계산용)
 * - tierKey: 티어 key 직접 지정 (playCount 대신)
 * - size: "xs" | "sm" | "md" | "lg"
 * - showName: 티어 이름도 표시 여부
 */
export default function TierBadge({ playCount, tierKey, size = "sm", showName = false }) {
  const tier = tierKey 
    ? getTierInfo(tierKey)
    : getTierByCount(playCount || 0);

  const sizes = {
    xs: { fontSize: 12, padding: "1px 4px", gap: 2 },
    sm: { fontSize: 13, padding: "2px 6px", gap: 3 },
    md: { fontSize: 16, padding: "4px 10px", gap: 4 },
    lg: { fontSize: 28, padding: "8px 16px", gap: 6 },
  };

  const style = sizes[size] || sizes.sm;

  return (
    <span style={{
      ...style,
      display: "inline-flex",
      alignItems: "center",
      borderRadius: 6,
      background: tier.bgColor,
      border: `1px solid ${tier.borderColor}`,
      color: tier.color,
      fontWeight: 700,
      whiteSpace: "nowrap",
      lineHeight: 1,
    }}>
      <span style={{ lineHeight: 1 }}>{tier.icon}</span>
      {showName && <span style={{ fontSize: style.fontSize - 1 }}>{tier.name}</span>}
    </span>
  );
}

/**
 * 티어 진행 바 (프로필 카드용)
 */
export function TierProgressCard({ playCount }) {
  const { current, next, remaining, progress, count } = getTierProgress(playCount || 0);

  return (
    <div style={{
      padding: 16,
      borderRadius: 12,
      background: current.bgColor,
      border: `1px solid ${current.borderColor}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 28 }}>{current.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: current.color }}>
            {current.name}
          </div>
          <div style={{ fontSize: 10, color: "#a1a1aa" }}>
            {current.description} · {count}회 플레이
          </div>
        </div>
      </div>

      {next ? (
        <>
          {/* 진행 바 */}
          <div style={{
            width: "100%",
            height: 6,
            background: "#27272a",
            borderRadius: 3,
            overflow: "hidden",
            marginBottom: 6,
          }}>
            <div style={{
              width: `${progress}%`,
              height: "100%",
              background: `linear-gradient(90deg, ${current.color}, ${next.color})`,
              transition: "width 0.5s",
            }} />
          </div>
          <div style={{ fontSize: 10, color: "#71717a", textAlign: "center" }}>
            {next.icon} {next.name}까지 <strong style={{ color: next.color }}>{remaining}회</strong> 남음
          </div>
        </>
      ) : (
        <div style={{ fontSize: 11, color: current.color, textAlign: "center", fontWeight: 700 }}>
          🎉 최고 티어 달성!
        </div>
      )}
    </div>
  );
}