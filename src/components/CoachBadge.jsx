"use client";

/**
 * 🎓 코칭딜러 자격 뱃지 (Phase B Day 2)
 *
 * credential 종류:
 * - 'master': 🎓 마스터 코칭딜러 (금색)
 * - 'dealer': 🎯 코칭딜러 (블루)
 *
 * Props:
 * - credential: 'master' | 'dealer' | null
 * - size: "xs" | "sm" | "md" | "lg"
 * - showName: 이름도 표시할지 (기본 true)
 */
export default function CoachBadge({ credential, size = "sm", showName = true }) {
  if (!credential) return null;

  const configs = {
    master: {
      icon: "🎓",
      name: "마스터",
      color: "#FFD700",
      bgColor: "#B8860B20",
      borderColor: "#FFD70060",
      glow: "0 0 10px #FFD70040",
    },
    dealer: {
      icon: "🎯",
      name: "코칭딜러",
      color: "#60a5fa",
      bgColor: "#1e3a8a30",
      borderColor: "#3b82f660",
      glow: "0 0 8px #3b82f640",
    },
  };

  const cfg = configs[credential];
  if (!cfg) return null;

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
      background: cfg.bgColor,
      border: `1px solid ${cfg.borderColor}`,
      color: cfg.color,
      fontWeight: 800,
      whiteSpace: "nowrap",
      lineHeight: 1,
      boxShadow: cfg.glow,
    }}>
      <span style={{ lineHeight: 1 }}>{cfg.icon}</span>
      {showName && <span style={{ fontSize: style.fontSize - 1 }}>{cfg.name}</span>}
    </span>
  );
}

// 자격 이름 (외부에서 사용)
export const CREDENTIAL_NAMES = {
  master: "🎓 마스터 코칭딜러",
  dealer: "🎯 코칭딜러",
};

export function getCredentialConfig(credential) {
  const configs = {
    master: { icon: "🎓", name: "마스터 코칭딜러", color: "#FFD700" },
    dealer: { icon: "🎯", name: "코칭딜러", color: "#60a5fa" },
  };
  return configs[credential] || null;
}
