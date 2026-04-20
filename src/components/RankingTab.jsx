"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import TierBadge, { TierProgressCard } from "./TierBadge";
import CoachBadge from "./CoachBadge";
import { calculateTier } from "@/lib/tier";

/**
 * 🏅 랭킹 탭 (Phase B Day 2)
 *
 * 2차원 탭:
 * - 1차: 플레이/대회 모드
 * - 2차: 열정상/스피드상/부자상
 *
 * Props:
 * - authUser: 현재 로그인 사용자
 */
export default function RankingTab({ authUser }) {
  const [modeTab, setModeTab] = useState("play"); // play | contest
  const [rankTab, setRankTab] = useState("passion"); // passion | speed | wealth
  const [loading, setLoading] = useState(true);
  const [rankings, setRankings] = useState([]);
  const [myStats, setMyStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authUser) return;
    loadRankings();
  }, [authUser, modeTab, rankTab]);

  const loadRankings = async () => {
    setLoading(true);
    setError("");
    try {
      // 모든 사용자 통계 조회
      const { data, error } = await supabase
        .from("user_stats")
        .select("*");

      if (error) throw error;

      const allStats = (data || []).filter(s => s.total_plays > 0);

      // 현재 사용자 통계
      const mine = allStats.find(s => s.user_id === authUser.id) || {
        user_id: authUser.id,
        display_name: authUser.user_metadata?.display_name || authUser.email?.split("@")[0] || "나",
        total_plays: 0,
        play_count: 0,
        contest_count: 0,
      };
      setMyStats(mine);

      // 선택된 탭 기준으로 정렬
      let sorted = [];

      if (rankTab === "passion") {
        // 열정상: 플레이 횟수 순 (내림차순)
        const field = modeTab === "play" ? "play_count" : "contest_count";
        sorted = allStats
          .filter(s => (s[field] || 0) > 0)
          .sort((a, b) => (b[field] || 0) - (a[field] || 0));
      } else if (rankTab === "speed") {
        // 스피드상: 최단 탈출 시간 (오름차순, 빠른 순)
        const field = modeTab === "play" ? "play_best_time" : "contest_best_time";
        sorted = allStats
          .filter(s => s[field] != null && s[field] > 0)
          .sort((a, b) => (a[field] || Infinity) - (b[field] || Infinity));
      } else if (rankTab === "wealth") {
        // 부자상: 최고 패시브인컴 (내림차순)
        const field = modeTab === "play" ? "play_best_income" : "contest_best_income";
        sorted = allStats
          .filter(s => s[field] != null && s[field] > 0)
          .sort((a, b) => (b[field] || 0) - (a[field] || 0));
      }

      setRankings(sorted);
    } catch (e) {
      console.error("랭킹 조회 실패:", e);
      setError(e.message || "랭킹을 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  };

  const getValue = (stat) => {
    if (rankTab === "passion") {
      return `${stat[modeTab === "play" ? "play_count" : "contest_count"] || 0}회`;
    } else if (rankTab === "speed") {
      const sec = stat[modeTab === "play" ? "play_best_time" : "contest_best_time"] || 0;
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m}:${String(s).padStart(2, "0")}`;
    } else if (rankTab === "wealth") {
      const v = stat[modeTab === "play" ? "play_best_income" : "contest_best_income"] || 0;
      return `$${v.toLocaleString()}`;
    }
    return "";
  };

  const getMedal = (idx) => {
    if (idx === 0) return "🥇";
    if (idx === 1) return "🥈";
    if (idx === 2) return "🥉";
    return `${idx + 1}.`;
  };

  const myRank = rankings.findIndex(s => s.user_id === authUser?.id);
  const top10 = rankings.slice(0, 10);
  const myInTop10 = myRank >= 0 && myRank < 10;

  const rankInfo = {
    passion: { icon: "🔥", name: "열정상", color: "#ef4444", desc: "가장 많이 플레이한 분" },
    speed:   { icon: "⚡", name: "스피드상", color: "#3b82f6", desc: "가장 빠르게 탈출한 분" },
    wealth:  { icon: "💎", name: "부자상", color: "#a855f7", desc: "가장 높은 패시브인컴 달성" },
  };
  const currentRank = rankInfo[rankTab];
  const modeInfo = {
    play: { icon: "🎮", name: "플레이 모드", color: "#22c55e" },
    contest: { icon: "🏆", name: "대회 모드", color: "#dc2626" },
  };
  const currentMode = modeInfo[modeTab];

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px" }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900, color: "#fafafa", margin: "0 0 4px 0" }}>
          🏅 랭킹
        </h2>
        <p style={{ fontSize: 12, color: "#71717a", margin: 0 }}>
          TOP 10 순위와 내 위치를 확인하세요
        </p>
      </div>

      {/* 내 티어 진행 바 */}
      {myStats && (
        <div style={{ marginBottom: 16 }}>
          <TierProgressCard playCount={myStats.total_plays || 0} />
        </div>
      )}

      {/* 1차 탭: 모드 선택 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <button
          onClick={() => setModeTab("play")}
          style={{
            flex: 1,
            padding: "10px",
            borderRadius: 8,
            border: "1px solid",
            borderColor: modeTab === "play" ? modeInfo.play.color : "#27272a",
            background: modeTab === "play" ? `${modeInfo.play.color}20` : "#111118",
            color: modeTab === "play" ? modeInfo.play.color : "#71717a",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          🎮 플레이 모드
        </button>
        <button
          onClick={() => setModeTab("contest")}
          style={{
            flex: 1,
            padding: "10px",
            borderRadius: 8,
            border: "1px solid",
            borderColor: modeTab === "contest" ? modeInfo.contest.color : "#27272a",
            background: modeTab === "contest" ? `${modeInfo.contest.color}20` : "#111118",
            color: modeTab === "contest" ? modeInfo.contest.color : "#71717a",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          🏆 대회 모드
        </button>
      </div>

      {/* 2차 탭: 랭킹 종류 */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {Object.entries(rankInfo).map(([key, info]) => (
          <button
            key={key}
            onClick={() => setRankTab(key)}
            style={{
              flex: 1,
              padding: "8px 4px",
              borderRadius: 6,
              border: "none",
              background: rankTab === key ? `${info.color}20` : "transparent",
              borderBottom: rankTab === key ? `2px solid ${info.color}` : "2px solid #27272a",
              color: rankTab === key ? info.color : "#52525b",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {info.icon} {info.name}
          </button>
        ))}
      </div>

      {/* 현재 선택 정보 */}
      <div style={{
        padding: 10,
        borderRadius: 8,
        background: "#111118",
        border: "1px solid #27272a",
        marginBottom: 14,
        textAlign: "center",
        fontSize: 11,
        color: "#a1a1aa",
      }}>
        {currentMode.icon} {currentMode.name} · {currentRank.icon} {currentRank.name}
        <div style={{ fontSize: 10, color: "#71717a", marginTop: 2 }}>
          {currentRank.desc}
        </div>
      </div>

      {/* 랭킹 리스트 */}
      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "#71717a", fontSize: 13 }}>
          불러오는 중...
        </div>
      )}

      {error && (
        <div style={{
          padding: 14,
          borderRadius: 10,
          background: "#7f1d1d30",
          border: "1px solid #dc262650",
          color: "#fca5a5",
          fontSize: 12,
        }}>
          {error}
        </div>
      )}

      {!loading && !error && top10.length === 0 && (
        <div style={{
          padding: 40,
          borderRadius: 12,
          background: "#111118",
          border: "1px solid #27272a",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🏅</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#a1a1aa", marginBottom: 6 }}>
            아직 랭킹 데이터가 없습니다
          </div>
          <div style={{ fontSize: 11, color: "#71717a" }}>
            {modeTab === "play"
              ? "플레이 모드에서 게임을 저장하면 랭킹에 등재됩니다"
              : "🏆 대회 모드에서 게임을 완료하면 랭킹에 등재됩니다"}
            {rankTab !== "passion" && <><br/>탈출에 성공해야 스피드상/부자상에 반영됩니다</>}
          </div>
        </div>
      )}

      {!loading && !error && top10.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {top10.map((s, idx) => {
            const isMe = s.user_id === authUser?.id;
            const tier = calculateTier(s.total_plays || 0);
            return (
              <div
                key={s.user_id}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: isMe ? "#1e3a8a30" : "#111118",
                  border: `1px solid ${isMe ? "#3b82f680" : "#27272a"}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div style={{
                  fontSize: idx < 3 ? 20 : 14,
                  fontWeight: 800,
                  color: idx < 3 ? "#fde68a" : "#71717a",
                  minWidth: 30,
                  textAlign: "center",
                }}>
                  {getMedal(idx)}
                </div>
                <TierBadge tierKey={tier} size="sm" />
                {s.credential && <CoachBadge credential={s.credential} size="xs" showName={false} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: isMe ? "#93c5fd" : "#fafafa",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {s.display_name}
                    {isMe && <span style={{ fontSize: 10, color: "#93c5fd", marginLeft: 4 }}>(나)</span>}
                  </div>
                  {s.latest_job && (
                    <div style={{ fontSize: 10, color: "#71717a" }}>
                      {s.latest_job}
                    </div>
                  )}
                </div>
                <div style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: currentRank.color,
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {getValue(s)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 10위 밖 내 순위 */}
      {!loading && !error && myStats && myRank >= 10 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #27272a" }}>
          <div style={{
            padding: "10px 12px",
            borderRadius: 8,
            background: "#1e3a8a30",
            border: "1px solid #3b82f680",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}>
            <div style={{
              fontSize: 14,
              fontWeight: 800,
              color: "#93c5fd",
              minWidth: 30,
              textAlign: "center",
            }}>
              {myRank + 1}.
            </div>
            <TierBadge tierKey={calculateTier(myStats.total_plays || 0)} size="sm" />
            {myStats.credential && <CoachBadge credential={myStats.credential} size="xs" showName={false} />}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#93c5fd" }}>
                {myStats.display_name} <span style={{ fontSize: 10 }}>(나)</span>
              </div>
            </div>
            <div style={{
              fontSize: 13,
              fontWeight: 800,
              color: currentRank.color,
              fontVariantNumeric: "tabular-nums",
            }}>
              {getValue(myStats)}
            </div>
          </div>
        </div>
      )}

      {/* 랭킹 미등재 */}
      {!loading && !error && myStats && myRank === -1 && top10.length > 0 && (
        <div style={{
          marginTop: 10,
          padding: 12,
          borderRadius: 8,
          background: "#18181b",
          border: "1px dashed #52525b",
          textAlign: "center",
          fontSize: 11,
          color: "#71717a",
        }}>
          💡 아직 이 랭킹에 등재되지 않았습니다.
          <br/>
          {modeTab === "contest" ? "대회 모드로 게임을 진행해보세요!" : "게임을 진행하면 등재됩니다"}
        </div>
      )}
    </div>
  );
}
