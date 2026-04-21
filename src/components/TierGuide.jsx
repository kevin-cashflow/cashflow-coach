"use client";

import { useState, useEffect } from "react";
import { TIERS, getTierByCount, getNextTierProgress } from "@/lib/tier";
import { supabase } from "@/lib/supabase";

/**
 * 🏆 티어 안내 (Phase B Day 3)
 *
 * 기능:
 * - 10단계 티어 표시
 * - 현재 티어 하이라이트
 * - 각 티어의 학습 포인트/권장사항
 * - 부가 정보:
 *   • 다음 티어까지 남은 횟수
 *   • 전체 상위 %
 *   • 총 플레이/대회/탈출 횟수
 *
 * Props:
 * - userStats: { total_plays, contest_count, ... }
 */
export default function TierGuide({ userStats }) {
  const playCount = userStats?.total_plays || 0;
  const contestCount = userStats?.contest_count || 0;
  const { current, next, remaining, percentInTier } = getNextTierProgress(playCount);
  
  const [topPercent, setTopPercent] = useState(null);
  const [expanded, setExpanded] = useState(null); // 어떤 티어가 펼쳐져 있는지

  // 전체 상위 % 계산
  useEffect(() => {
    if (playCount < 1) return;
    let mounted = true;
    
    const calcRank = async () => {
      try {
        const queryPromise = supabase
          .from("user_stats")
          .select("total_plays");
        
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("타임아웃")), 3000)
        );
        
        const { data } = await Promise.race([queryPromise, timeoutPromise]);
        
        if (!mounted) return;
        if (!data || data.length === 0) return;
        
        const myCount = playCount;
        const higherCount = data.filter(u => (u.total_plays || 0) > myCount).length;
        const totalCount = data.filter(u => (u.total_plays || 0) > 0).length;
        
        if (totalCount === 0) return;
        
        const percent = Math.round(((higherCount + 1) / totalCount) * 100);
        if (mounted) setTopPercent(percent);
      } catch (e) {
        console.warn("[TierGuide] 상위 % 계산 실패:", e.message);
      }
    };
    
    calcRank();
    return () => { mounted = false; };
  }, [playCount]);

  // 플레이 기록 없으면 안 보여줌
  if (playCount < 1) {
    return (
      <div style={{
        padding: 20,
        borderRadius: 12,
        background: "#111118",
        border: "1px solid #27272a",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🎮</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fafafa", marginBottom: 4 }}>
          아직 플레이 기록이 없습니다
        </div>
        <div style={{ fontSize: 12, color: "#71717a" }}>
          첫 게임을 시작하고 🥉 브론즈 티어를 달성하세요!
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ─── 내 현황 통계 ─── */}
      <div style={{
        padding: 16,
        borderRadius: 12,
        background: "#111118",
        border: "1px solid #27272a",
        marginBottom: 14,
      }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#fafafa", marginBottom: 12 }}>
          📊 내 현황
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <div style={{
            padding: 10,
            background: "#18181b",
            borderRadius: 8,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 10, color: "#71717a", marginBottom: 4 }}>총 플레이</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#86efac" }}>
              {playCount}회
            </div>
          </div>
          <div style={{
            padding: 10,
            background: "#18181b",
            borderRadius: 8,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 10, color: "#71717a", marginBottom: 4 }}>대회 참가</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#fca5a5" }}>
              {contestCount}회
            </div>
          </div>
          <div style={{
            padding: 10,
            background: "#18181b",
            borderRadius: 8,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 10, color: "#71717a", marginBottom: 4 }}>상위</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#c4b5fd" }}>
              {topPercent !== null ? `${topPercent}%` : "-"}
            </div>
          </div>
        </div>

        {next && (
          <div style={{
            marginTop: 12,
            padding: 10,
            background: "#18181b",
            borderRadius: 8,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 11, color: "#a1a1aa" }}>
              {next.icon} <strong style={{ color: next.color }}>{next.name}</strong>
              까지 <strong style={{ color: "#fafafa" }}>{remaining}회</strong> 남음
            </div>
          </div>
        )}
      </div>

      {/* ─── 티어 안내 ─── */}
      <div style={{
        padding: 16,
        borderRadius: 12,
        background: "#111118",
        border: "1px solid #27272a",
      }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#fafafa", marginBottom: 4 }}>
          🏆 티어 안내
        </div>
        <div style={{ fontSize: 11, color: "#71717a", marginBottom: 14 }}>
          플레이할수록 티어가 올라갑니다. 각 티어를 클릭하면 상세 정보를 볼 수 있어요.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {TIERS.map((tier) => {
            const isCurrent = tier.key === current.key;
            const isAchieved = playCount >= tier.minCount;
            const isExpanded = expanded === tier.key;

            return (
              <div key={tier.key}>
                {/* 티어 행 */}
                <div
                  onClick={() => setExpanded(isExpanded ? null : tier.key)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: isCurrent ? tier.bgColor : "#18181b",
                    border: isCurrent ? `2px solid ${tier.color}` : "1px solid #27272a",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    opacity: isAchieved ? 1 : 0.5,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontSize: 20 }}>{tier.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: 13,
                        fontWeight: 800,
                        color: isCurrent ? tier.color : "#fafafa",
                      }}>
                        {tier.name}
                        {isCurrent && (
                          <span style={{
                            marginLeft: 8,
                            fontSize: 10,
                            padding: "1px 6px",
                            borderRadius: 4,
                            background: tier.color,
                            color: "#000",
                            fontWeight: 900,
                          }}>
                            현재
                          </span>
                        )}
                        {!isAchieved && (
                          <span style={{
                            marginLeft: 8,
                            fontSize: 10,
                            color: "#71717a",
                          }}>
                            🔒
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: "#71717a" }}>
                        {tier.maxCount === Infinity 
                          ? `${tier.minCount}회+` 
                          : `${tier.minCount}~${tier.maxCount}회`}
                      </div>
                    </div>
                    <div style={{
                      fontSize: 10,
                      color: "#71717a",
                      transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.2s",
                    }}>
                      ▼
                    </div>
                  </div>
                </div>

                {/* 상세 설명 (펼쳐졌을 때) */}
                {isExpanded && (
                  <div style={{
                    marginTop: 4,
                    padding: 12,
                    background: "#0a0a0f",
                    borderRadius: 8,
                    border: `1px solid ${tier.color}30`,
                  }}>
                    <div style={{
                      fontSize: 12,
                      color: tier.color,
                      fontWeight: 700,
                      marginBottom: 8,
                    }}>
                      {tier.description}
                    </div>
                    
                    <div style={{ marginBottom: 8 }}>
                      <div style={{
                        fontSize: 10,
                        color: "#71717a",
                        marginBottom: 4,
                        fontWeight: 700,
                      }}>
                        📌 핵심 학습
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 16 }}>
                        {tier.learningPoints.map((point, i) => (
                          <li key={i} style={{
                            fontSize: 11,
                            color: "#d4d4d8",
                            lineHeight: 1.6,
                          }}>
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                    
                    <div>
                      <div style={{
                        fontSize: 10,
                        color: "#71717a",
                        marginBottom: 4,
                        fontWeight: 700,
                      }}>
                        💡 권장사항
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 16 }}>
                        {tier.recommendations.map((rec, i) => (
                          <li key={i} style={{
                            fontSize: 11,
                            color: "#d4d4d8",
                            lineHeight: 1.6,
                          }}>
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
