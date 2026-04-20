"use client";

import { useEffect } from "react";

/**
 * 티어 승급 축하 모달 (Phase B Day 2)
 *
 * Props:
 * - tierUp: { from: TierConfig, to: TierConfig } | null
 * - onClose: 닫기 콜백
 */
export default function TierUpModal({ tierUp, onClose }) {
  useEffect(() => {
    if (!tierUp) return;
    const onEsc = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [tierUp, onClose]);

  if (!tierUp) return null;

  const { from, to } = tierUp;
  const isCrown = to.key === "crown";

  return (
    <>
      {/* 애니메이션 CSS */}
      <style>{`
        @keyframes tierReveal {
          0%   { transform: scale(0) rotate(-180deg); opacity: 0; }
          60%  { transform: scale(1.3) rotate(10deg); opacity: 1; }
          80%  { transform: scale(0.95) rotate(-5deg); }
          100% { transform: scale(1) rotate(0); opacity: 1; }
        }
        @keyframes sparkle {
          0%, 100% { opacity: 0; transform: scale(0.8); }
          50%      { opacity: 1; transform: scale(1.2); }
        }
        @keyframes slideFromLeft {
          from { transform: translateX(-30px); opacity: 0.3; }
          to   { transform: translateX(0); opacity: 1; }
        }
        @keyframes arrowPulse {
          0%, 100% { opacity: 0.6; transform: translateX(0); }
          50%      { opacity: 1; transform: translateX(4px); }
        }
        @keyframes fadeInUp {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      <div
        onClick={onClose}
        style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.85)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 99999,
          padding: 20,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: isCrown
              ? "linear-gradient(135deg, #7c2d12, #d97706, #fbbf24)"
              : "linear-gradient(135deg, #1e1b4b, #312e81)",
            borderRadius: 20,
            padding: "40px 32px",
            maxWidth: 440,
            width: "100%",
            border: `2px solid ${to.color}`,
            textAlign: "center",
            boxShadow: `0 0 60px ${to.color}40`,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* 반짝이 효과 */}
          <div style={{ position: "absolute", top: 12, left: 20, fontSize: 24, animation: "sparkle 1.5s infinite" }}>✨</div>
          <div style={{ position: "absolute", top: 30, right: 30, fontSize: 20, animation: "sparkle 1.8s infinite 0.3s" }}>⭐</div>
          <div style={{ position: "absolute", bottom: 40, left: 40, fontSize: 18, animation: "sparkle 2s infinite 0.6s" }}>✨</div>
          <div style={{ position: "absolute", bottom: 20, right: 20, fontSize: 22, animation: "sparkle 1.7s infinite 0.9s" }}>⭐</div>

          {/* 헤더 */}
          <div style={{ fontSize: 11, fontWeight: 800, color: to.color, letterSpacing: 3, marginBottom: 8, animation: "fadeInUp 0.6s" }}>
            TIER UP!
          </div>
          <h2 style={{
            fontSize: isCrown ? 24 : 22,
            fontWeight: 900,
            color: "#fafafa",
            margin: "0 0 24px 0",
            animation: "fadeInUp 0.8s",
          }}>
            {isCrown ? "🎊 전설이 되셨습니다! 🎊" : "🎉 축하합니다!"}
          </h2>

          {/* 티어 변화 시각화 */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            margin: "24px 0 28px 0",
          }}>
            {/* Before */}
            <div style={{
              animation: "slideFromLeft 0.6s",
              opacity: 0.5,
              filter: "grayscale(50%)",
            }}>
              <div style={{ fontSize: 52 }}>{from.icon}</div>
              <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 4 }}>{from.name}</div>
            </div>

            {/* Arrow */}
            <div style={{
              fontSize: 24,
              color: to.color,
              animation: "arrowPulse 1s infinite",
            }}>
              →
            </div>

            {/* After */}
            <div style={{
              animation: "tierReveal 1s",
              animationDelay: "0.3s",
              animationFillMode: "both",
            }}>
              <div style={{ fontSize: 72, filter: `drop-shadow(0 0 20px ${to.color})` }}>
                {to.icon}
              </div>
              <div style={{
                fontSize: 14,
                fontWeight: 900,
                color: to.color,
                marginTop: 4,
                textShadow: `0 0 10px ${to.color}80`,
              }}>
                {to.name}
              </div>
            </div>
          </div>

          {/* 설명 */}
          <div style={{
            fontSize: 14,
            color: "#e4e4e7",
            marginBottom: 8,
            animation: "fadeInUp 1.2s",
          }}>
            🏆 {isCrown ? "최고 티어에 도달하셨습니다!" : "새로운 티어에 도달했습니다!"}
          </div>
          <div style={{
            fontSize: 16,
            fontWeight: 800,
            color: to.color,
            marginBottom: 28,
            animation: "fadeInUp 1.4s",
          }}>
            "{to.description}"
          </div>

          {isCrown && (
            <div style={{
              fontSize: 12,
              color: "#fde68a",
              marginBottom: 20,
              lineHeight: 1.6,
              animation: "fadeInUp 1.6s",
            }}>
              250회의 여정을 완주하신<br/>
              당신의 헌신을 축하합니다! 🙌
            </div>
          )}

          {/* 닫기 버튼 */}
          <button
            onClick={onClose}
            style={{
              padding: "12px 32px",
              borderRadius: 10,
              border: "none",
              background: to.color,
              color: "#000",
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
              animation: "fadeInUp 1.8s",
            }}
          >
            {isCrown ? "👑 영광의 순간 확인" : "🎊 확인하기"}
          </button>
        </div>
      </div>
    </>
  );
}