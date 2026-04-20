"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

/**
 * 📊 내 디브리핑 이력 탭 (Phase B Day 2)
 *
 * Props:
 * - authUser: 현재 로그인 사용자
 */
export default function MyHistoryTab({ authUser }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    if (!authUser) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("debrief_reports")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        setReports(data || []);
      } catch (e) {
        console.error("이력 조회 실패:", e);
        setError(e.message || "이력을 불러올 수 없습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, [authUser]);

  const formatDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const tierLabel = (tier) => {
    const labels = {
      free: { icon: "💬", name: "무료 요약", color: "#86efac" },
      detailed: { icon: "📝", name: "상세 분석", color: "#93c5fd" },
      premium: { icon: "💎", name: "프리미엄 분석", color: "#c4b5fd" },
      analysis: { icon: "📊", name: "AI 분석", color: "#fbbf24" },
    };
    return labels[tier] || labels.analysis;
  };

  // 상세 보기 화면
  if (viewing) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px" }}>
        <button
          onClick={() => setViewing(null)}
          style={{
            marginBottom: 16,
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #27272a",
            background: "transparent",
            color: "#a1a1aa",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          ← 목록으로
        </button>

        <div style={{
          padding: 20,
          borderRadius: 12,
          background: "#111118",
          border: "1px solid #27272a",
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 11, color: "#71717a", marginBottom: 6 }}>
            {formatDate(viewing.created_at)}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fafafa", marginBottom: 4 }}>
            {tierLabel(viewing.tier).icon} {tierLabel(viewing.tier).name}
          </div>
          <div style={{ fontSize: 12, color: "#a1a1aa" }}>
            {viewing.version} · {viewing.turns}턴
          </div>
        </div>

        {/* 분석 내용 표시 */}
        {viewing.analysis?.phases && (
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: "#fafafa", marginBottom: 12 }}>
              📊 생애 단계별 분석
            </h3>
            {viewing.analysis.phases.map((p, i) => (
              <div key={i} style={{
                padding: 14,
                borderRadius: 10,
                background: "#111118",
                border: "1px solid #27272a",
                marginBottom: 8,
              }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#fde68a", marginBottom: 4 }}>
                  {p.title} ({p.age})
                </div>
                <div style={{ fontSize: 11, color: "#a1a1aa", marginBottom: 6 }}>
                  {p.turns}
                </div>
                <div style={{ fontSize: 12, color: "#d4d4d8", lineHeight: 1.6, marginBottom: 6 }}>
                  <strong>경험:</strong> {p.cards}
                </div>
                <div style={{ fontSize: 12, color: "#93c5fd", lineHeight: 1.6 }}>
                  <strong>통찰:</strong> {p.verdict}
                </div>
              </div>
            ))}
          </div>
        )}

        {viewing.analysis?.lessons && (
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: "#fafafa", marginBottom: 12 }}>
              💡 주요 교훈
            </h3>
            {viewing.analysis.lessons.map((l, i) => (
              <div key={i} style={{
                padding: 12,
                borderRadius: 8,
                background: "#18181b",
                border: "1px solid #27272a",
                marginBottom: 6,
                fontSize: 12,
                color: "#d4d4d8",
                lineHeight: 1.6,
              }}>
                • {typeof l === "string" ? l : (l.text || l.lesson || JSON.stringify(l))}
              </div>
            ))}
          </div>
        )}

        {viewing.feedback && (
          <div style={{
            padding: 16,
            borderRadius: 12,
            background: "#111118",
            border: `1px solid ${tierLabel(viewing.tier).color}40`,
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: tierLabel(viewing.tier).color, marginBottom: 10 }}>
              {tierLabel(viewing.tier).icon} {tierLabel(viewing.tier).name}
            </h3>
            <div style={{
              fontSize: 12,
              color: "#d4d4d8",
              lineHeight: 1.7,
              whiteSpace: "pre-wrap",
            }}>
              {viewing.feedback}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px" }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900, color: "#fafafa", margin: "0 0 4px 0" }}>
          📊 내 디브리핑 이력
        </h2>
        <p style={{ fontSize: 12, color: "#71717a", margin: 0 }}>
          지금까지 받은 AI 분석 기록입니다
        </p>
      </div>

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

      {!loading && !error && reports.length === 0 && (
        <div style={{
          padding: 40,
          borderRadius: 12,
          background: "#111118",
          border: "1px solid #27272a",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#a1a1aa", marginBottom: 6 }}>
            아직 디브리핑 기록이 없습니다
          </div>
          <div style={{ fontSize: 11, color: "#71717a" }}>
            시뮬레이션이나 플레이 후<br/>
            디브리핑 분석을 받아보세요!
          </div>
        </div>
      )}

      {!loading && !error && reports.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {reports.map((r) => {
            const t = tierLabel(r.tier);
            return (
              <div
                key={r.id}
                onClick={() => setViewing(r)}
                style={{
                  padding: 14,
                  borderRadius: 12,
                  background: "#111118",
                  border: `1px solid ${t.color}30`,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = `${t.color}60`;
                  e.currentTarget.style.background = "#18181b";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = `${t.color}30`;
                  e.currentTarget.style.background = "#111118";
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: "#71717a" }}>
                    📅 {formatDate(r.created_at)}
                  </span>
                  <span style={{
                    fontSize: 10,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: `${t.color}20`,
                    color: t.color,
                    fontWeight: 700,
                  }}>
                    {t.icon} {t.name}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#d4d4d8", marginBottom: 4 }}>
                  <strong style={{ color: "#fafafa" }}>{r.version}</strong> · {r.turns}턴
                  {r.is_simulation ? " · 🎲 시뮬레이션" : " · 🎮 플레이"}
                </div>
                <div style={{ fontSize: 11, color: t.color, fontWeight: 700 }}>
                  📖 다시 보기 →
                </div>
              </div>
            );
          })}
        </div>
      )}

      {reports.length > 0 && (
        <div style={{
          marginTop: 16,
          textAlign: "center",
          fontSize: 10,
          color: "#52525b",
        }}>
          최근 50개만 표시됩니다
        </div>
      )}
    </div>
  );
}
