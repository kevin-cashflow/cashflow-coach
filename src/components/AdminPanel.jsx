"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  generateFreeFeedback,
  generatePaidFeedback,
  buildPromptText,
  runFullAnalysis,
  AnalysisReport,
  diagnoseFinancialLevel,
} from "./CashflowCoachingSim";

/**
 * ⚙️ Admin 관리 패널 (Phase B Day 2)
 *
 * Props:
 * - authUser: 현재 로그인 사용자
 * - userIsAdmin: Admin 여부
 */
export default function AdminPanel({ authUser, userIsAdmin }) {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(null);
  const [stats, setStats] = useState(null);
  const [recentDebriefs, setRecentDebriefs] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  
  // 비밀번호 변경 상태
  const [editingPw, setEditingPw] = useState(null); // "contest" | "debrief" | null
  const [newPw, setNewPw] = useState("");
  const [showPw, setShowPw] = useState({ contest: false, debrief: false });

  // 코칭딜러 코드 발급 상태
  const [codes, setCodes] = useState([]);
  const [issueEmail, setIssueEmail] = useState("");
  const [issueCredential, setIssueCredential] = useState("dealer");
  const [issueLoading, setIssueLoading] = useState(false);

  // 회원 명부 (Phase B Day 3)
  const [members, setMembers] = useState([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberTypeFilter, setMemberTypeFilter] = useState("all"); // all/general/teacher/institution/company/other/admin/dealer

  // 플레이 횟수 조정 모달
  const [adjustingMember, setAdjustingMember] = useState(null); // { user_id, name, total_plays } | null
  const [adjustMode, setAdjustMode] = useState("set"); // "set" | "delta"
  const [adjustValue, setAdjustValue] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustLoading, setAdjustLoading] = useState(false);

  // 🆕 회원 게임 이력 조회 모달 (Step 1)
  const [viewingMemberGames, setViewingMemberGames] = useState(null); // { user_id, name, email } | null

  useEffect(() => {
    if (!userIsAdmin) {
      setLoading(false);
      setError("관리자 권한이 필요합니다.");
      return;
    }
    loadData();
  }, [userIsAdmin]);

  const loadData = async () => {
    setLoading(true);
    console.log("[AdminPanel] 데이터 로드 시작");
    
    // 10초 타임아웃 (멈춤 방지)
    const timeoutId = setTimeout(() => {
      console.warn("[AdminPanel] 10초 타임아웃 - 강제 로딩 종료");
      setLoading(false);
      setError("일부 데이터 로드가 지연되고 있습니다. 새로고침 후 다시 시도해주세요.");
    }, 10000);

    // 각 쿼리를 개별 try-catch로 분리해서 하나 실패해도 다른 것 계속
    
    // 1. gate_config 조회
    try {
      const { data: cfg, error } = await supabase.from("gate_config").select("*").eq("id", 1).single();
      if (error) throw error;
      setConfig(cfg);
      console.log("[AdminPanel] gate_config 로드:", cfg);
    } catch (e) {
      console.error("[AdminPanel] gate_config 실패:", e);
    }

    // 2. 사용자 통계 조회
    let users = [];
    try {
      const { data, error } = await supabase.from("user_stats").select("*");
      if (error) throw error;
      users = data || [];
      console.log("[AdminPanel] user_stats 로드:", users.length, "명");
    } catch (e) {
      console.error("[AdminPanel] user_stats 실패:", e);
    }

    // 3. 디브리핑 통계
    let debriefs = [];
    try {
      const { data, error } = await supabase
        .from("debrief_reports")
        .select("tier, token_usage, model_used, created_at, user_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      debriefs = data || [];
      console.log("[AdminPanel] debrief_reports 로드:", debriefs.length, "건");
    } catch (e) {
      console.error("[AdminPanel] debrief_reports 실패:", e);
    }

    // 통계 계산
    const totalUsers = users.length;
    const activeUsers = users.filter(u => u.total_plays > 0).length;
    const totalGames = users.reduce((s, u) => s + (u.total_plays || 0), 0);
    const contestGames = users.reduce((s, u) => s + (u.contest_count || 0), 0);

    const totalDebriefs = debriefs.length;
    const byTier = { free: 0, detailed: 0, premium: 0, analysis: 0 };
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    debriefs.forEach(d => {
      const tier = d.tier || "analysis";
      byTier[tier] = (byTier[tier] || 0) + 1;
      if (d.token_usage) {
        totalInputTokens += d.token_usage.input_tokens || 0;
        totalOutputTokens += d.token_usage.output_tokens || 0;
      }
    });

    const estimatedCostUsd = (totalInputTokens * 3 / 1_000_000) + (totalOutputTokens * 15 / 1_000_000);
    const estimatedCostKrw = Math.round(estimatedCostUsd * 1400);
    const detailedRevenue = (byTier.detailed || 0) * 9;
    const premiumRevenue = (byTier.premium || 0) * 20;
    const totalRevenueUsd = detailedRevenue + premiumRevenue;
    const totalRevenueKrw = Math.round(totalRevenueUsd * 1400);

    setStats({
      totalUsers, activeUsers, totalGames, contestGames,
      totalDebriefs, byTier,
      totalInputTokens, totalOutputTokens,
      estimatedCostUsd, estimatedCostKrw,
      detailedRevenue, premiumRevenue, totalRevenueUsd, totalRevenueKrw,
    });

    // 최근 디브리핑 로그 (20개)
    const userMap = {};
    users.forEach(u => { userMap[u.user_id] = u.display_name; });
    const recent = debriefs.slice(0, 20).map(d => ({
      ...d,
      display_name: userMap[d.user_id] || "알 수 없음",
    }));
    setRecentDebriefs(recent);

    // 4. 코칭딜러 코드 목록 조회
    try {
      const { data: codeList, error } = await supabase
        .from("coach_codes")
        .select("*")
        .order("issued_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setCodes(codeList || []);
      console.log("[AdminPanel] coach_codes 로드:", (codeList || []).length, "건");
    } catch (e) {
      console.error("[AdminPanel] coach_codes 실패:", e);
      setCodes([]);
    }

    // 5. 회원 명부 조회 (Phase B Day 3)
    try {
      const { data: memberList, error } = await supabase
        .from("admin_members")
        .select("*")
        .limit(500);
      if (error) throw error;
      setMembers(memberList || []);
      console.log("[AdminPanel] admin_members 로드:", (memberList || []).length, "명");
    } catch (e) {
      console.error("[AdminPanel] admin_members 실패:", e);
      setMembers([]);
    }

    clearTimeout(timeoutId);
    setLoading(false);
    console.log("[AdminPanel] 모든 데이터 로드 완료");
  };

  // 코드 발급
  const issueCode = async () => {
    const email = issueEmail.trim().toLowerCase();
    if (!email) {
      alert("이메일을 입력해주세요.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      alert("올바른 이메일 형식이 아닙니다.");
      return;
    }

    setIssueLoading(true);
    try {
      // 현재 사용자 세션 토큰 가져오기
      const { data: { session } } = await supabase.auth.getSession();
      const userToken = session?.access_token;
      
      if (!userToken) {
        alert("로그인 세션이 만료되었습니다. 다시 로그인해주세요.");
        setIssueLoading(false);
        return;
      }
      
      const res = await fetch("/api/coach/issue-code", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          targetEmail: email,
          credential: issueCredential,
          userId: authUser?.id,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        alert(`코드 발급 실패: ${data.error}`);
        setIssueLoading(false);
        return;
      }

      if (data.already_issued) {
        setMessage(`ℹ️ 이미 발급된 코드: ${data.code} (${email})`);
      } else {
        setMessage(`✅ 코드 발급 완료: ${data.code} (${email})`);
      }
      setIssueEmail("");
      setTimeout(() => setMessage(""), 7000);
      await loadData();
    } catch (e) {
      alert(`코드 발급 실패: ${e.message}`);
    } finally {
      setIssueLoading(false);
    }
  };

  // 코드 취소
  const cancelCode = async (codeId, codeValue) => {
    if (!window.confirm(`코드 ${codeValue} 를 취소하시겠습니까?`)) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userToken = session?.access_token;
      
      if (!userToken) {
        alert("로그인 세션이 만료되었습니다. 다시 로그인해주세요.");
        return;
      }
      
      const res = await fetch("/api/coach/cancel-code", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          codeId,
          userId: authUser?.id,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        alert(`취소 실패: ${data.error}`);
        return;
      }

      setMessage("✅ 코드가 취소되었습니다.");
      setTimeout(() => setMessage(""), 3000);
      await loadData();
    } catch (e) {
      alert(`취소 실패: ${e.message}`);
    }
  };

  // 코드 복사
  const copyCode = (code) => {
    navigator.clipboard.writeText(code).then(() => {
      setMessage(`📋 코드 ${code} 복사됨`);
      setTimeout(() => setMessage(""), 2000);
    }).catch(() => {
      alert(`코드: ${code}\n(수동으로 복사해주세요)`);
    });
  };

  const savePassword = async (gateType) => {
    if (!newPw.trim() || newPw.length < 4) {
      alert("비밀번호는 최소 4자 이상이어야 합니다.");
      return;
    }
    try {
      const res = await fetch("/api/admin/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gateType, newPassword: newPw, userId: authUser?.id }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "실패");
      
      setMessage(`✅ ${gateType === "contest" ? "대회" : "디브리핑"} 비밀번호가 변경되었습니다.`);
      setEditingPw(null);
      setNewPw("");
      setTimeout(() => setMessage(""), 3000);
      await loadData();
    } catch (e) {
      alert(`비밀번호 변경 실패: ${e.message}`);
    }
  };

  const toggleGate = async (field) => {
    try {
      const newValue = !config[field];
      const { error } = await supabase
        .from("gate_config")
        .update({ [field]: newValue, updated_at: new Date().toISOString() })
        .eq("id", 1);
      if (error) throw error;
      setConfig({ ...config, [field]: newValue });
      setMessage(`✅ ${field === "contest_enabled" ? "대회 모드" : "디브리핑 게이트"}가 ${newValue ? "활성화" : "비활성화"}되었습니다.`);
      setTimeout(() => setMessage(""), 3000);
    } catch (e) {
      alert(`설정 변경 실패: ${e.message}`);
    }
  };

  const resetRanking = async (type) => {
    const confirmMsg = type === "play"
      ? "플레이 모드 랭킹을 리셋하시겠습니까?\n(기록은 보존되고 랭킹 집계만 초기화됩니다)"
      : "대회 모드 랭킹을 리셋하시겠습니까?\n(기록은 보존되고 랭킹 집계만 초기화됩니다)";
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch("/api/admin/reset-ranking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, userId: authUser?.id }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "실패");
      
      setMessage(`✅ ${type === "play" ? "플레이" : "대회"} 랭킹이 리셋되었습니다. (${data.affected}개 게임 처리)`);
      setTimeout(() => setMessage(""), 5000);
      await loadData();
    } catch (e) {
      alert(`랭킹 리셋 실패: ${e.message}`);
    }
  };

  const formatDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const tierLabel = (tier) => {
    const labels = {
      free: { icon: "💬", color: "#86efac" },
      detailed: { icon: "📝", color: "#93c5fd" },
      premium: { icon: "💎", color: "#c4b5fd" },
      analysis: { icon: "📊", color: "#fbbf24" },
    };
    return labels[tier] || labels.analysis;
  };

  if (!userIsAdmin) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "40px 16px", textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 14, color: "#a1a1aa" }}>관리자 권한이 필요합니다.</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "40px 16px", textAlign: "center", color: "#71717a", fontSize: 13 }}>
        관리자 데이터 불러오는 중...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px" }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "#f59e0b", letterSpacing: 2, marginBottom: 4 }}>
          🔑 ADMIN PANEL
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 900, color: "#fafafa", margin: 0 }}>
          ⚙️ 관리자 대시보드
        </h2>
      </div>

      {/* 메시지 표시 */}
      {message && (
        <div style={{
          padding: 10,
          borderRadius: 8,
          background: "#14532d30",
          border: "1px solid #16a34a50",
          color: "#86efac",
          fontSize: 12,
          marginBottom: 14,
        }}>
          {message}
        </div>
      )}
      {error && (
        <div style={{
          padding: 10,
          borderRadius: 8,
          background: "#7f1d1d30",
          border: "1px solid #dc262650",
          color: "#fca5a5",
          fontSize: 12,
          marginBottom: 14,
        }}>
          {error}
        </div>
      )}

      {/* 📊 현황 요약 */}
      {stats && (
        <div style={{
          marginBottom: 16,
          padding: 14,
          borderRadius: 12,
          background: "#111118",
          border: "1px solid #27272a",
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#fafafa", marginBottom: 10 }}>
            📊 현황 요약
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ padding: 10, background: "#18181b", borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: "#71717a" }}>총 회원</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#93c5fd" }}>{stats.totalUsers}명</div>
              <div style={{ fontSize: 9, color: "#52525b" }}>활성 {stats.activeUsers}명</div>
            </div>
            <div style={{ padding: 10, background: "#18181b", borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: "#71717a" }}>총 게임</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#86efac" }}>{stats.totalGames}건</div>
              <div style={{ fontSize: 9, color: "#52525b" }}>대회 {stats.contestGames}건</div>
            </div>
            <div style={{ padding: 10, background: "#18181b", borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: "#71717a" }}>디브리핑 총계</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#fde68a" }}>{stats.totalDebriefs}건</div>
            </div>
            <div style={{ padding: 10, background: "#18181b", borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: "#71717a" }}>추정 토큰 비용</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#fca5a5" }}>
                ${stats.estimatedCostUsd.toFixed(2)}
              </div>
              <div style={{ fontSize: 9, color: "#52525b" }}>≈ {stats.estimatedCostKrw.toLocaleString()}원</div>
            </div>
          </div>
        </div>
      )}

      {/* 💰 수익 추정 */}
      {stats && stats.totalDebriefs > 0 && (
        <div style={{
          marginBottom: 16,
          padding: 14,
          borderRadius: 12,
          background: "linear-gradient(135deg, #0f172a, #1e293b)",
          border: "1px solid #334155",
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#fafafa", marginBottom: 8 }}>
            💰 수익 추정
          </div>
          <div style={{ fontSize: 11, color: "#a1a1aa", lineHeight: 1.8 }}>
            💬 무료: {stats.byTier.free || 0}건
            <span style={{ marginLeft: 8 }}>📝 상세($9): {stats.byTier.detailed || 0}건</span>
            <span style={{ marginLeft: 8 }}>💎 프리미엄($20): {stats.byTier.premium || 0}건</span>
          </div>
          <div style={{
            marginTop: 8,
            padding: 8,
            background: "#0f172a",
            borderRadius: 6,
            fontSize: 13,
            color: "#fde68a",
            textAlign: "center",
          }}>
            예상 수익: <strong>${stats.totalRevenueUsd}</strong>
            <span style={{ fontSize: 11, color: "#a1a1aa", marginLeft: 8 }}>
              ≈ {stats.totalRevenueKrw.toLocaleString()}원
            </span>
          </div>
          <div style={{ fontSize: 9, color: "#71717a", marginTop: 6, textAlign: "center" }}>
            ※ 실제 결제 시스템 미도입 상태의 예상치 (Toss Payments 연동 예정)
          </div>
        </div>
      )}

      {/* 🏆 대회 설정 */}
      {config && (
        <div style={{
          marginBottom: 14,
          padding: 14,
          borderRadius: 12,
          background: "#111118",
          border: "1px solid #27272a",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#fafafa" }}>
              🏆 대회 설정
            </div>
            <button
              onClick={() => toggleGate("contest_enabled")}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "none",
                background: config.contest_enabled ? "#16a34a" : "#52525b",
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {config.contest_enabled ? "● ON" : "○ OFF"}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "#a1a1aa", minWidth: 70 }}>비밀번호:</span>
            <code style={{ 
              flex: 1,
              padding: "4px 8px", 
              background: "#0a0a0f", 
              borderRadius: 4,
              fontSize: 11, 
              color: "#fde68a",
              fontFamily: "monospace",
            }}>
              {showPw.contest ? config.contest_password : "••••••••••"}
            </code>
            <button
              onClick={() => setShowPw({ ...showPw, contest: !showPw.contest })}
              style={{
                padding: "4px 8px",
                borderRadius: 4,
                border: "1px solid #27272a",
                background: "transparent",
                color: "#a1a1aa",
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              {showPw.contest ? "숨김" : "보기"}
            </button>
            <button
              onClick={() => { setEditingPw("contest"); setNewPw(""); }}
              style={{
                padding: "4px 10px",
                borderRadius: 4,
                border: "none",
                background: "#3b82f6",
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              변경
            </button>
          </div>
          
          {editingPw === "contest" && (
            <div style={{ marginTop: 8, padding: 10, background: "#18181b", borderRadius: 6 }}>
              <input
                type="text"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="새 비밀번호 (최소 4자)"
                autoFocus
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid #27272a",
                  background: "#0a0a0f",
                  color: "#fafafa",
                  fontSize: 12,
                  marginBottom: 6,
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => { setEditingPw(null); setNewPw(""); }} style={{ flex: 1, padding: 8, borderRadius: 4, border: "1px solid #27272a", background: "transparent", color: "#a1a1aa", fontSize: 11, cursor: "pointer" }}>취소</button>
                <button onClick={() => savePassword("contest")} style={{ flex: 2, padding: 8, borderRadius: 4, border: "none", background: "#16a34a", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>저장</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 📊 디브리핑 설정 */}
      {config && (
        <div style={{
          marginBottom: 14,
          padding: 14,
          borderRadius: 12,
          background: "#111118",
          border: "1px solid #27272a",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#fafafa" }}>
              📊 디브리핑 게이트
            </div>
            <button
              onClick={() => toggleGate("debrief_gate_enabled")}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "none",
                background: config.debrief_gate_enabled ? "#16a34a" : "#52525b",
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {config.debrief_gate_enabled ? "● ON" : "○ OFF"}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "#a1a1aa", minWidth: 70 }}>비밀번호:</span>
            <code style={{
              flex: 1,
              padding: "4px 8px", 
              background: "#0a0a0f", 
              borderRadius: 4,
              fontSize: 11, 
              color: "#fde68a",
              fontFamily: "monospace",
            }}>
              {showPw.debrief ? config.debrief_password : "••••••••••"}
            </code>
            <button
              onClick={() => setShowPw({ ...showPw, debrief: !showPw.debrief })}
              style={{
                padding: "4px 8px",
                borderRadius: 4,
                border: "1px solid #27272a",
                background: "transparent",
                color: "#a1a1aa",
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              {showPw.debrief ? "숨김" : "보기"}
            </button>
            <button
              onClick={() => { setEditingPw("debrief"); setNewPw(""); }}
              style={{
                padding: "4px 10px",
                borderRadius: 4,
                border: "none",
                background: "#f59e0b",
                color: "#000",
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              변경
            </button>
          </div>
          
          {editingPw === "debrief" && (
            <div style={{ marginTop: 8, padding: 10, background: "#18181b", borderRadius: 6 }}>
              <input
                type="text"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="새 비밀번호 (최소 4자)"
                autoFocus
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid #27272a",
                  background: "#0a0a0f",
                  color: "#fafafa",
                  fontSize: 12,
                  marginBottom: 6,
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => { setEditingPw(null); setNewPw(""); }} style={{ flex: 1, padding: 8, borderRadius: 4, border: "1px solid #27272a", background: "transparent", color: "#a1a1aa", fontSize: 11, cursor: "pointer" }}>취소</button>
                <button onClick={() => savePassword("debrief")} style={{ flex: 2, padding: 8, borderRadius: 4, border: "none", background: "#16a34a", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>저장</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 🏅 랭킹 관리 */}
      <div style={{
        marginBottom: 14,
        padding: 14,
        borderRadius: 12,
        background: "#111118",
        border: "1px solid #27272a",
      }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#fafafa", marginBottom: 10 }}>
          🏅 랭킹 관리
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => resetRanking("play")}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: 6,
              border: "1px solid #27272a",
              background: "#18181b",
              color: "#86efac",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            🔄 플레이 랭킹 리셋
          </button>
          <button
            onClick={() => resetRanking("contest")}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: 6,
              border: "1px solid #27272a",
              background: "#18181b",
              color: "#fca5a5",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            🔄 대회 랭킹 리셋
          </button>
        </div>
        <div style={{ fontSize: 10, color: "#71717a", marginTop: 8, textAlign: "center" }}>
          ⚠️ 리셋 시 게임 기록은 보존되고 랭킹 집계에서만 제외됩니다
        </div>
      </div>

      {/* 🎓 코칭딜러 코드 발급 */}
      <div style={{
        marginBottom: 14,
        padding: 14,
        borderRadius: 12,
        background: "linear-gradient(135deg, #111118, #18181b)",
        border: "1px solid #FFD70040",
      }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#fde68a", marginBottom: 10 }}>
          🎓 코칭딜러 코드 발급
        </div>

        {/* 발급 폼 */}
        <div style={{ marginBottom: 14, padding: 12, background: "#0a0a0f", borderRadius: 8 }}>
          <input
            type="email"
            value={issueEmail}
            onChange={(e) => setIssueEmail(e.target.value)}
            placeholder="대상 이메일 입력"
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid #27272a",
              background: "#111118",
              color: "#fafafa",
              fontSize: 12,
              marginBottom: 8,
              boxSizing: "border-box",
            }}
          />
          
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <button
              onClick={() => setIssueCredential("master")}
              style={{
                flex: 1,
                padding: "8px",
                borderRadius: 6,
                border: `1px solid ${issueCredential === "master" ? "#FFD700" : "#27272a"}`,
                background: issueCredential === "master" ? "#B8860B30" : "transparent",
                color: issueCredential === "master" ? "#FFD700" : "#71717a",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              🎓 마스터
            </button>
            <button
              onClick={() => setIssueCredential("dealer")}
              style={{
                flex: 1,
                padding: "8px",
                borderRadius: 6,
                border: `1px solid ${issueCredential === "dealer" ? "#3b82f6" : "#27272a"}`,
                background: issueCredential === "dealer" ? "#1e3a8a30" : "transparent",
                color: issueCredential === "dealer" ? "#60a5fa" : "#71717a",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              🎯 코칭딜러
            </button>
          </div>

          <button
            onClick={issueCode}
            disabled={issueLoading || !issueEmail.trim()}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 6,
              border: "none",
              background: issueLoading ? "#52525b" : "linear-gradient(135deg, #eab308, #f59e0b)",
              color: "#000",
              fontSize: 12,
              fontWeight: 800,
              cursor: issueLoading || !issueEmail.trim() ? "not-allowed" : "pointer",
              opacity: !issueEmail.trim() ? 0.5 : 1,
            }}
          >
            {issueLoading ? "발급 중..." : "🔑 6자리 코드 발급"}
          </button>
        </div>

        {/* 발급된 코드 목록 */}
        {codes.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: "#a1a1aa", marginBottom: 8 }}>
              📋 발급된 코드 ({codes.length}건)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
              {codes.map((c) => {
                const isUsed = !!c.used_at;
                const isCancelled = !!c.cancelled_at;
                const isExpired = c.expires_at && new Date(c.expires_at) < new Date();
                const status = isCancelled ? "cancelled" : isUsed ? "used" : isExpired ? "expired" : "active";
                const statusColor = {
                  cancelled: "#71717a",
                  used: "#86efac",
                  expired: "#fb923c",
                  active: "#fde68a",
                };
                const statusIcon = {
                  cancelled: "🚫",
                  used: "✅",
                  expired: "⏰",
                  active: "🟢",
                };

                const daysLeft = !isUsed && !isCancelled && c.expires_at
                  ? Math.max(0, Math.ceil((new Date(c.expires_at) - new Date()) / (1000 * 60 * 60 * 24)))
                  : null;

                return (
                  <div key={c.id} style={{
                    padding: "8px 10px",
                    background: "#18181b",
                    borderRadius: 6,
                    border: `1px solid ${statusColor[status]}30`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 10 }}>{statusIcon[status]}</span>
                      <span style={{ 
                        fontSize: 14, 
                        fontFamily: "monospace", 
                        fontWeight: 800, 
                        color: statusColor[status],
                        letterSpacing: 2,
                      }}>
                        {c.code}
                      </span>
                      <span style={{
                        fontSize: 9,
                        padding: "1px 6px",
                        borderRadius: 4,
                        background: c.credential === "master" ? "#B8860B30" : "#1e3a8a30",
                        color: c.credential === "master" ? "#FFD700" : "#60a5fa",
                        fontWeight: 700,
                      }}>
                        {c.credential === "master" ? "🎓 마스터 강사" : "🎯 코칭딜러"}
                      </span>
                      {status === "active" && (
                        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                          <button
                            onClick={() => copyCode(c.code)}
                            style={{
                              padding: "2px 8px",
                              borderRadius: 4,
                              border: "1px solid #27272a",
                              background: "transparent",
                              color: "#a1a1aa",
                              fontSize: 9,
                              cursor: "pointer",
                            }}
                          >
                            📋 복사
                          </button>
                          <button
                            onClick={() => cancelCode(c.id, c.code)}
                            style={{
                              padding: "2px 8px",
                              borderRadius: 4,
                              border: "1px solid #dc262650",
                              background: "transparent",
                              color: "#fca5a5",
                              fontSize: 9,
                              cursor: "pointer",
                            }}
                          >
                            🚫 취소
                          </button>
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: "#71717a" }}>
                      {c.target_email}
                      {daysLeft !== null && (
                        <span style={{ marginLeft: 8, color: daysLeft < 7 ? "#fb923c" : "#71717a" }}>
                          · ⏰ {daysLeft}일 남음
                        </span>
                      )}
                      {isUsed && <span style={{ marginLeft: 8, color: "#86efac" }}>· 사용됨 ({formatDate(c.used_at)})</span>}
                      {isCancelled && <span style={{ marginLeft: 8 }}>· 취소됨</span>}
                      {isExpired && !isUsed && !isCancelled && <span style={{ marginLeft: 8, color: "#fb923c" }}>· 만료</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 📋 최근 디브리핑 로그 */}
      {recentDebriefs.length > 0 && (
        <div style={{
          padding: 14,
          borderRadius: 12,
          background: "#111118",
          border: "1px solid #27272a",
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#fafafa", marginBottom: 10 }}>
            📋 최근 디브리핑 로그 (20건)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 300, overflowY: "auto" }}>
            {recentDebriefs.map((d) => {
              const t = tierLabel(d.tier);
              return (
                <div key={d.id} style={{
                  padding: "6px 10px",
                  background: "#18181b",
                  borderRadius: 4,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                }}>
                  <span style={{ color: "#71717a", minWidth: 60 }}>{formatDate(d.created_at)}</span>
                  <span style={{ flex: 1, color: "#d4d4d8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {d.display_name}
                  </span>
                  <span style={{ color: t.color, fontWeight: 700 }}>
                    {t.icon}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ 📋 회원 관리 (Phase B Day 3) ═══ */}
      {!loading && (
        <div style={{
          marginTop: 14,
          padding: 16,
          borderRadius: 12,
          background: "#111118",
          border: "1px solid #27272a",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#fafafa" }}>
              📋 회원 관리 ({filterMembers(members, memberSearch, memberTypeFilter).length}명 / 총 {members.length}명)
            </div>
            <button
              onClick={() => downloadMembersCSV(members)}
              style={{
                padding: "4px 10px",
                borderRadius: 4,
                border: "1px solid #10b98140",
                background: "#10b98120",
                color: "#86efac",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              📥 CSV 다운로드
            </button>
          </div>

          {/* 검색 + 필터 */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            <input
              type="text"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="🔍 이름 / 이메일 / 학교 / 소속 검색"
              style={{
                flex: "1 1 200px",
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid #27272a",
                background: "#0a0a0f",
                color: "#fafafa",
                fontSize: 12,
                outline: "none",
              }}
            />
            <select
              value={memberTypeFilter}
              onChange={(e) => setMemberTypeFilter(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid #27272a",
                background: "#0a0a0f",
                color: "#fafafa",
                fontSize: 12,
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="all">전체</option>
              <option value="general">일반</option>
              <option value="teacher">교사</option>
              <option value="institution">기관</option>
              <option value="company">기업</option>
              <option value="other">기타</option>
              <option value="no_info">정보 미입력</option>
              <option value="admin">Admin</option>
              <option value="master">🎓 마스터</option>
              <option value="dealer">🎯 코칭딜러</option>
            </select>
          </div>

          {/* 회원 목록 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 400, overflowY: "auto" }}>
            {filterMembers(members, memberSearch, memberTypeFilter).map((m) => (
              <div key={m.user_id} style={{
                padding: 10,
                borderRadius: 6,
                background: "#0a0a0f",
                border: "1px solid #27272a",
              }}>
                {/* 1행: 닉네임 + 배지들 */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fafafa" }}>
                    {m.nickname || "이름 없음"}
                  </div>
                  {m.is_admin && (
                    <span style={{
                      padding: "1px 6px",
                      borderRadius: 4,
                      background: "#fbbf24",
                      color: "#000",
                      fontSize: 9,
                      fontWeight: 900,
                    }}>
                      ADMIN
                    </span>
                  )}
                  {m.coach_credential === "master" && (
                    <span style={{ fontSize: 10, color: "#fbbf24" }}>🎓 마스터</span>
                  )}
                  {m.coach_credential === "dealer" && (
                    <span style={{ fontSize: 10, color: "#60a5fa" }}>🎯 코칭딜러</span>
                  )}
                </div>

                {/* 2행: 실명 · 이메일 · 연락처 */}
                <div style={{ fontSize: 11, color: "#d4d4d8", marginBottom: 3 }}>
                  {m.real_name && <span>{m.real_name} · </span>}
                  {m.email}
                  {m.phone && <span> · {m.phone}</span>}
                </div>

                {/* 3행: 유형 · 학교/소속 */}
                {m.user_type && (
                  <div style={{ fontSize: 10, color: "#a1a1aa", marginBottom: 3 }}>
                    {getUserTypeLabel(m.user_type, m.user_type_other)}
                    {m.school_name && <span> · {m.school_name}</span>}
                    {m.organization && <span> · {m.organization}</span>}
                  </div>
                )}

                {/* 4행: 통계 + 플레이 횟수 수정 버튼 + 게임 보기 버튼 */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 10, color: "#71717a", flex: 1, minWidth: 0 }}>
                    가입: {formatDate(m.joined_at)} · 게임 {m.total_plays || 0}회
                    {m.contest_count > 0 && <span> · 대회 {m.contest_count}회</span>}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      onClick={() => {
                        setViewingMemberGames({
                          user_id: m.user_id,
                          name: m.nickname || m.real_name || m.email,
                          email: m.email || "",
                          realName: m.real_name || "",
                          phone: m.phone || "",
                          userType: m.user_type || "",
                          userTypeOther: m.user_type_other || "",
                          schoolName: m.school_name || "",
                          organization: m.organization || "",
                          coachCredential: m.coach_credential || "",
                          totalPlays: m.total_plays || 0,
                          joinedAt: m.joined_at,
                        });
                      }}
                      title="게임 이력 보기"
                      style={{
                        padding: "3px 8px", borderRadius: 4, border: "none",
                        background: "#7c3aed40", color: "#c4b5fd",
                        cursor: "pointer", fontSize: 9, fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
                    >🎮 게임 보기</button>
                    <button
                      onClick={() => {
                        setAdjustingMember({
                          user_id: m.user_id,
                          name: m.nickname || m.real_name || m.email,
                          total_plays: m.total_plays || 0,
                        });
                        setAdjustMode("set");
                        setAdjustValue(String(m.total_plays || 0));
                        setAdjustReason("");
                      }}
                      title="플레이 횟수 수정"
                      style={{
                        padding: "3px 8px", borderRadius: 4, border: "none",
                        background: "#1e3a8a40", color: "#93c5fd",
                        cursor: "pointer", fontSize: 9, fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
                    >✏️ 횟수 수정</button>
                  </div>
                </div>
              </div>
            ))}
            
            {filterMembers(members, memberSearch, memberTypeFilter).length === 0 && (
              <div style={{ textAlign: "center", padding: 20, color: "#71717a", fontSize: 12 }}>
                조건에 맞는 회원이 없습니다.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ 플레이 횟수 조정 모달 ═══ */}
      {adjustingMember && (
        <div
          onClick={() => !adjustLoading && setAdjustingMember(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000, padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 420, background: "#111118",
              borderRadius: 16, border: "1px solid #27272a", padding: 24,
              maxHeight: "90vh", overflowY: "auto",
            }}
          >
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 900, color: "#fafafa", margin: 0 }}>
                ✏️ 플레이 횟수 수정
              </h2>
              <p style={{ fontSize: 11, color: "#a1a1aa", margin: "6px 0 0" }}>
                <strong style={{ color: "#93c5fd" }}>{adjustingMember.name}</strong> · 현재 {adjustingMember.total_plays}회
              </p>
              <p style={{ fontSize: 10, color: "#71717a", margin: "8px 0 0", padding: "6px 10px", borderRadius: 6, background: "#3b82f610", border: "1px solid #3b82f620" }}>
                ℹ️ 실제 게임 세션은 보존됩니다. 조정값만 누적 저장되어 표시 횟수가 변경됩니다.
              </p>
            </div>

            {/* 모드 선택 */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, color: "#a1a1aa", display: "block", marginBottom: 4, fontWeight: 600 }}>조정 방식</label>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => {
                    setAdjustMode("set");
                    setAdjustValue(String(adjustingMember.total_plays));
                  }}
                  style={{
                    flex: 1, padding: "8px", borderRadius: 6,
                    border: `1px solid ${adjustMode === "set" ? "#3b82f6" : "#27272a"}`,
                    background: adjustMode === "set" ? "#3b82f620" : "transparent",
                    color: adjustMode === "set" ? "#93c5fd" : "#71717a",
                    fontSize: 11, fontWeight: 700, cursor: "pointer",
                  }}
                >🎯 최종 값 지정</button>
                <button
                  onClick={() => {
                    setAdjustMode("delta");
                    setAdjustValue("");
                  }}
                  style={{
                    flex: 1, padding: "8px", borderRadius: 6,
                    border: `1px solid ${adjustMode === "delta" ? "#3b82f6" : "#27272a"}`,
                    background: adjustMode === "delta" ? "#3b82f620" : "transparent",
                    color: adjustMode === "delta" ? "#93c5fd" : "#71717a",
                    fontSize: 11, fontWeight: 700, cursor: "pointer",
                  }}
                >➕ 증감 (±)</button>
              </div>
            </div>

            {/* 값 입력 */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, color: "#a1a1aa", display: "block", marginBottom: 4, fontWeight: 600 }}>
                {adjustMode === "set" ? "새 총 횟수" : "증감값 (음수 가능)"}
              </label>
              <input
                type="number"
                value={adjustValue}
                onChange={(e) => setAdjustValue(e.target.value)}
                placeholder={adjustMode === "set" ? "예: 10" : "예: +5 또는 -3"}
                disabled={adjustLoading}
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: 6,
                  border: "1px solid #27272a", background: "#0a0a0f",
                  color: "#fafafa", fontSize: 14, fontWeight: 700,
                  outline: "none", boxSizing: "border-box",
                }}
              />
              {/* 미리보기 */}
              {adjustValue !== "" && Number.isFinite(parseFloat(adjustValue)) && (
                <p style={{ fontSize: 10, color: "#a1a1aa", margin: "6px 0 0" }}>
                  {adjustMode === "set"
                    ? `→ 표시 횟수: ${adjustingMember.total_plays}회 → ${Math.round(parseFloat(adjustValue))}회`
                    : `→ 표시 횟수: ${adjustingMember.total_plays}회 → ${adjustingMember.total_plays + Math.round(parseFloat(adjustValue))}회`}
                </p>
              )}
            </div>

            {/* 사유 (선택) */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 10, color: "#a1a1aa", display: "block", marginBottom: 4, fontWeight: 600 }}>조정 사유 (선택)</label>
              <input
                type="text"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="예: 오프라인 세션 반영, 데이터 오류 정정"
                disabled={adjustLoading}
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 6,
                  border: "1px solid #27272a", background: "#0a0a0f",
                  color: "#e4e4e7", fontSize: 11, outline: "none", boxSizing: "border-box",
                }}
              />
            </div>

            {/* 버튼 */}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setAdjustingMember(null)}
                disabled={adjustLoading}
                style={{
                  flex: 1, padding: "10px", borderRadius: 8,
                  border: "1px solid #27272a", background: "transparent",
                  color: "#a1a1aa", fontSize: 12, fontWeight: 700,
                  cursor: adjustLoading ? "not-allowed" : "pointer",
                  opacity: adjustLoading ? 0.5 : 1,
                }}
              >❌ 취소</button>
              <button
                onClick={async () => {
                  const parsed = parseFloat(adjustValue);
                  if (!Number.isFinite(parsed)) {
                    alert("유효한 숫자를 입력하세요");
                    return;
                  }
                  const value = Math.round(parsed);
                  if (adjustMode === "set" && value < 0) {
                    alert("총 횟수는 음수가 될 수 없습니다");
                    return;
                  }
                  setAdjustLoading(true);
                  try {
                    // 현재 세션 토큰 가져오기 (Bearer 인증용)
                    const { data: { session } } = await supabase.auth.getSession();
                    const token = session?.access_token;
                    if (!token) {
                      throw new Error("세션 만료. 다시 로그인해주세요.");
                    }
                    const res = await fetch("/api/admin/adjust-plays", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`,
                      },
                      body: JSON.stringify({
                        targetUserId: adjustingMember.user_id,
                        mode: adjustMode,
                        value,
                        reason: adjustReason.trim() || null,
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      throw new Error(data.error || data.hint || `HTTP ${res.status}`);
                    }
                    alert(`✅ 조정 완료\n표시 횟수: ${data.newTotalPlays}회\n(실제: ${data.actualCount} + 조정: ${data.newAdjustment >= 0 ? "+" : ""}${data.newAdjustment})`);
                    setAdjustingMember(null);
                    // 회원 명부 다시 로드
                    await loadData();
                  } catch (e) {
                    alert("❌ 조정 실패: " + (e.message || "알 수 없는 오류"));
                  } finally {
                    setAdjustLoading(false);
                  }
                }}
                disabled={adjustLoading || adjustValue === ""}
                style={{
                  flex: 2, padding: "10px", borderRadius: 8, border: "none",
                  background: adjustLoading ? "#1e3a8a" : "#3b82f6",
                  color: "#fff", fontSize: 13, fontWeight: 800,
                  cursor: (adjustLoading || adjustValue === "") ? "not-allowed" : "pointer",
                  opacity: adjustValue === "" ? 0.5 : 1,
                }}
              >{adjustLoading ? "저장 중..." : "💾 저장"}</button>
            </div>
          </div>
        </div>
      )}

      {/* 🆕 회원 게임 이력 모달 */}
      {viewingMemberGames && (
        <AdminMemberGamesModal
          member={viewingMemberGames}
          adminUser={authUser}
          onClose={() => setViewingMemberGames(null)}
        />
      )}
    </div>
  );
}

// ─── 헬퍼 함수 ───
function getUserTypeLabel(type, other) {
  const labels = {
    general: "일반",
    teacher: "교사",
    institution: "기관",
    company: "기업",
    other: `기타${other ? ` (${other})` : ""}`,
  };
  return labels[type] || type;
}

function filterMembers(members, searchTerm, typeFilter) {
  if (!members || members.length === 0) return [];
  
  let filtered = [...members];
  
  // 검색어 필터
  if (searchTerm && searchTerm.trim()) {
    const term = searchTerm.trim().toLowerCase();
    filtered = filtered.filter(m => {
      return (
        (m.nickname || "").toLowerCase().includes(term) ||
        (m.real_name || "").toLowerCase().includes(term) ||
        (m.email || "").toLowerCase().includes(term) ||
        (m.phone || "").toLowerCase().includes(term) ||
        (m.school_name || "").toLowerCase().includes(term) ||
        (m.organization || "").toLowerCase().includes(term)
      );
    });
  }
  
  // 유형 필터
  if (typeFilter && typeFilter !== "all") {
    if (typeFilter === "no_info") {
      filtered = filtered.filter(m => !m.user_type);
    } else if (typeFilter === "admin") {
      filtered = filtered.filter(m => m.is_admin);
    } else if (typeFilter === "master") {
      filtered = filtered.filter(m => m.coach_credential === "master");
    } else if (typeFilter === "dealer") {
      filtered = filtered.filter(m => m.coach_credential === "dealer");
    } else {
      filtered = filtered.filter(m => m.user_type === typeFilter);
    }
  }
  
  return filtered;
}

function downloadMembersCSV(members) {
  if (!members || members.length === 0) {
    alert("다운로드할 데이터가 없습니다.");
    return;
  }
  
  const headers = [
    "닉네임", "실명", "이메일", "연락처", 
    "유형", "학교명", "소속/메모",
    "가입일", "총 플레이", "대회 참가", "자격",
  ];
  
  const rows = members.map(m => [
    m.nickname || "",
    m.real_name || "",
    m.email || "",
    m.phone || "",
    getUserTypeLabel(m.user_type, m.user_type_other) || "",
    m.school_name || "",
    m.organization || "",
    m.joined_at ? new Date(m.joined_at).toLocaleDateString("ko-KR") : "",
    m.total_plays || 0,
    m.contest_count || 0,
    m.coach_credential === "master" ? "마스터 강사" : m.coach_credential === "dealer" ? "코칭딜러" : "",
  ]);
  
  // CSV 변환 (큰따옴표 이스케이프)
  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => {
      const escaped = String(cell).replace(/"/g, '""');
      return /[,\n"]/.test(escaped) ? `"${escaped}"` : escaped;
    }).join(",")),
  ].join("\n");
  
  // BOM 추가 (Excel 한글 깨짐 방지)
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `회원명부_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════
// 🎮 회원 게임 이력 모달 (Admin 전용, Step 1: 조회만)
// ═══════════════════════════════════════════════════
// - Supabase `games` 테이블에서 user_id로 게임 목록 조회
// - 각 게임의 턴 로그 · 자산 · 자금 · 디브리핑 상세 표시
// - Step 2에서 디브리핑 진행 기능 추가 예정
function AdminMemberGamesModal({ member, adminUser, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [games, setGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState(null); // 상세 보기 게임

  useEffect(() => {
    loadMemberGames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.user_id]);

  const [diagnostics, setDiagnostics] = useState(null); // 🆕 진단 정보

  const loadMemberGames = async () => {
    setLoading(true);
    setError("");
    setDiagnostics(null);
    const diag = {
      memberUserId: member.user_id,
      rawCount: 0,
      columnStructure: null,
      userIdField: "user_id",
      gameCount: 0,
      errorMsg: null,
      totalTableRowsSeen: 0,
      uniqueUserIds: [],
      targetUserFound: false,
    };

    try {
      // ──────────────────────────────────────────
      // PRE-STEP: 전체 테이블 샘플 조회 (RLS 확인용)
      // ──────────────────────────────────────────
      try {
        const { data: sample, error: sampleErr } = await supabase
          .from("games")
          .select("id, user_id")
          .limit(1000);

        if (!sampleErr && sample) {
          diag.totalTableRowsSeen = sample.length;
          const uidSet = new Set();
          sample.forEach(r => {
            if (r.user_id) uidSet.add(String(r.user_id));
          });
          diag.uniqueUserIds = Array.from(uidSet);
          diag.targetUserFound = diag.uniqueUserIds.includes(String(member.user_id));
        }
        console.log(`[AdminMemberGames] 전체 샘플: ${diag.totalTableRowsSeen}행, 유니크 user ${diag.uniqueUserIds.length}명`);
      } catch (e) {
        console.warn("[AdminMemberGames] 전체 샘플 조회 실패 (무시):", e.message);
      }

      // ──────────────────────────────────────────
      // MAIN: 대상 user_id의 games 조회
      // games 테이블은 이미 정규화된 컬럼 구조:
      //   id, user_id, player_id, version, job, turn_count, date_time,
      //   turn_log (JSON), assets (JSON), cash, total_cf, bank_loan,
      //   loan_interest, babies, game_ended, sim_text, debrief (JSON),
      //   is_contest, escaped, escape_time_sec,
      //   passive_income_at_escape, job_at_escape
      // ──────────────────────────────────────────
      const { data, error: qErr } = await supabase
        .from("games")
        .select("*")
        .eq("user_id", member.user_id)
        .order("date_time", { ascending: false })
        .limit(300);

      if (qErr) throw qErr;

      diag.rawCount = (data || []).length;
      if (data && data[0]) {
        diag.columnStructure = Object.keys(data[0]);
      }
      console.log(`[AdminMemberGames] 대상 user rows: ${diag.rawCount} (user_id=${member.user_id})`);

      if (diag.rawCount === 0) {
        setDiagnostics(diag);
        setGames([]);
        return;
      }

      // 각 row를 game 객체로 변환 (기존 UI와 호환되는 형식)
      const gameRows = (data || []).map(row => {
        // JSON 컬럼 파싱 (이미 객체이거나 문자열일 수 있음)
        const parseJsonCol = (col) => {
          if (col == null) return null;
          if (typeof col === "string") {
            try { return JSON.parse(col); } catch { return null; }
          }
          return col;
        };

        const turnLog = parseJsonCol(row.turn_log) || [];
        const assets = parseJsonCol(row.assets) || [];
        const debriefRaw = parseJsonCol(row.debrief);

        // debrief 컬럼이 { analysis, feedback, ... } 구조라고 가정
        // 다른 구조면 빈 구조로 보정
        let debriefData;
        if (debriefRaw && typeof debriefRaw === "object") {
          debriefData = {
            analysis: debriefRaw.analysis || null,
            analysisAt: debriefRaw.analysisAt || null,
            feedback: debriefRaw.feedback || {
              free: debriefRaw.free || null,
              detail: debriefRaw.detail || null,
              premium: debriefRaw.premium || null,
            },
            editHistory: debriefRaw.editHistory || [],
          };
        } else {
          debriefData = {
            analysis: null, analysisAt: null,
            feedback: { free: null, detail: null, premium: null },
            editHistory: [],
          };
        }

        return {
          // DB PK (저장 시 필요)
          id: row.id,
          // 기존 UI와 호환되는 key (display only)
          key: `game:${row.user_id}:${row.id}`,
          // 저장된 사용자
          user_id: row.user_id,
          playerId: row.player_id,
          // 메타
          version: row.version,
          job: row.job,
          turnCount: row.turn_count,
          dateTime: row.date_time,
          // 턴 로그 & 자산
          turnLog,
          assets,
          gameResults: turnLog, // 호환용 alias
          // 재무 상태
          cash: row.cash,
          totalCF: row.total_cf,
          bankLoan: row.bank_loan,
          loanInterest: row.loan_interest,
          babies: row.babies,
          // 종료 정보
          escaped: row.escaped,
          escapeTimeSec: row.escape_time_sec,
          passiveIncomeAtEscape: row.passive_income_at_escape,
          jobAtEscape: row.job_at_escape,
          gameEnded: row.game_ended,
          isContest: row.is_contest,
          // 시뮬 텍스트 (디브리핑에 필요)
          simText: row.sim_text,
          // 디브리핑 데이터
          debriefData,
          // 저장 로그 (혹시 debrief 안에 있으면)
          saveLog: debriefRaw?.saveLog || null,
        };
      });

      diag.gameCount = gameRows.length;

      console.log(`[AdminMemberGames] ${gameRows.length}개 게임 로드 완료`);

      setDiagnostics(diag);
      setGames(gameRows);
    } catch (e) {
      console.error("[AdminMemberGames] 게임 조회 실패:", e);
      diag.errorMsg = e.message;
      setDiagnostics(diag);
      setError(e.message || "게임 이력을 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (iso) => {
    if (!iso) return "";
    try { return new Date(iso).toLocaleString("ko-KR"); }
    catch { return iso; }
  };

  const userTypeLabels = {
    general: "일반", teacher: "교사", institution: "기관 담당자",
    company: "기업 관계자", other: "기타",
  };
  const userTypeLabel = member.userType
    ? (userTypeLabels[member.userType] || member.userType) + (member.userTypeOther ? ` (${member.userTypeOther})` : "")
    : "-";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 2000, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0a0a0f", borderRadius: 16,
          padding: 0, maxWidth: 720, width: "100%",
          maxHeight: "92vh", overflow: "hidden",
          display: "flex", flexDirection: "column",
          border: "1px solid #27272a",
        }}
      >
        {/* 헤더: 회원 정보 */}
        <div style={{ padding: "18px 20px", borderBottom: "1px solid #27272a", background: "linear-gradient(135deg, #7c3aed15, #3b82f615)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#fafafa", marginBottom: 4 }}>
                🎮 {member.name}
                {member.coachCredential === "master" && <span style={{ marginLeft: 6, fontSize: 10, color: "#fbbf24" }}>🎓 마스터</span>}
                {member.coachCredential === "dealer" && <span style={{ marginLeft: 6, fontSize: 10, color: "#60a5fa" }}>🎯 코칭딜러</span>}
              </div>
              <div style={{ fontSize: 11, color: "#a1a1aa", marginBottom: 2 }}>
                {member.realName && <span>{member.realName} · </span>}
                {member.email}
                {member.phone && <span> · {member.phone}</span>}
              </div>
              <div style={{ fontSize: 10, color: "#71717a" }}>
                {userTypeLabel}
                {member.schoolName && <span> · {member.schoolName}</span>}
                {member.organization && <span> · {member.organization}</span>}
                <span> · 가입: {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString("ko-KR") : "-"}</span>
                <span> · 총 플레이: {member.totalPlays}회</span>
              </div>
            </div>
            <button onClick={onClose} style={{
              padding: "6px 12px", borderRadius: 8, border: "none",
              background: "#27272a", color: "#e4e4e7",
              cursor: "pointer", fontSize: 12, fontWeight: 700, flexShrink: 0,
            }}>✕ 닫기</button>
          </div>
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {loading && (
            <div style={{ textAlign: "center", padding: 40, color: "#a1a1aa" }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
              <div style={{ fontSize: 12 }}>게임 이력 불러오는 중...</div>
            </div>
          )}

          {error && (
            <div style={{ padding: 16, borderRadius: 8, background: "#7f1d1d30", border: "1px solid #ef444450", color: "#fca5a5", fontSize: 12 }}>
              ⚠️ {error}
              <button onClick={loadMemberGames} style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 4, background: "#dc262680", color: "#fff", border: "none", fontSize: 11, cursor: "pointer" }}>재시도</button>
            </div>
          )}

          {!loading && !error && games.length === 0 && (
            <div>
              <div style={{ textAlign: "center", padding: 30, color: "#71717a", fontSize: 12 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                이 회원의 저장된 게임이 없습니다.
              </div>

              {/* 🆕 진단 정보 표시 (원인 파악) */}
              {diagnostics && (
                <div style={{ padding: 14, borderRadius: 8, background: "#111118", border: "1px solid #27272a", fontSize: 10, color: "#a1a1aa" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", marginBottom: 8 }}>🔍 진단 정보</div>

                  <div style={{ marginBottom: 4 }}>
                    <span style={{ color: "#71717a" }}>user_id:</span> <code style={{ color: "#86efac", fontSize: 9 }}>{diagnostics.memberUserId}</code>
                  </div>

                  {/* 🆕 전체 테이블 정보 (RLS 진단) */}
                  <div style={{ padding: 8, background: "#18181b", borderRadius: 4, marginBottom: 8, marginTop: 6 }}>
                    <div style={{ color: "#fbbf24", fontWeight: 700, marginBottom: 4, fontSize: 10 }}>🌐 games 테이블 전체 진단</div>
                    <div style={{ marginBottom: 2 }}>
                      <span style={{ color: "#71717a" }}>Admin이 볼 수 있는 전체 row:</span> <strong style={{ color: diagnostics.totalTableRowsSeen > 0 ? "#86efac" : "#fca5a5" }}>{diagnostics.totalTableRowsSeen}개</strong>
                    </div>
                    <div style={{ marginBottom: 2 }}>
                      <span style={{ color: "#71717a" }}>발견된 유니크 user_id:</span> <strong style={{ color: "#c4b5fd" }}>{diagnostics.uniqueUserIds.length}명</strong>
                    </div>
                    <div style={{ marginBottom: 2 }}>
                      <span style={{ color: "#71717a" }}>target user 존재 여부:</span> <strong style={{ color: diagnostics.targetUserFound ? "#86efac" : "#fca5a5" }}>
                        {diagnostics.targetUserFound ? "✅ 발견됨" : "❌ 없음"}
                      </strong>
                    </div>
                    {diagnostics.uniqueUserIds.length > 0 && diagnostics.uniqueUserIds.length <= 10 && (
                      <div style={{ marginTop: 4, fontSize: 9, color: "#71717a" }}>
                        보이는 user_id: {diagnostics.uniqueUserIds.slice(0, 10).map(u => u.substring(0, 8)).join(", ")}
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: 4 }}>
                    <span style={{ color: "#71717a" }}>target 쿼리 결과 row:</span> <strong style={{ color: diagnostics.rawCount > 0 ? "#86efac" : "#fca5a5" }}>{diagnostics.rawCount}개</strong>
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ color: "#71717a" }}>user_id 컬럼:</span> <code style={{ color: "#c4b5fd" }}>{diagnostics.userIdField || "미감지"}</code>
                  </div>
                  {diagnostics.columnStructure && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: "#71717a" }}>실제 컬럼:</span> <code style={{ color: "#93c5fd", fontSize: 9 }}>{diagnostics.columnStructure.join(", ")}</code>
                    </div>
                  )}
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ color: "#71717a" }}>게임 수:</span> <strong style={{ color: "#86efac" }}>{diagnostics.gameCount}</strong>
                  </div>

                  {/* 원인 추정 */}
                  <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #27272a" }}>
                    <div style={{ color: "#fbbf24", fontWeight: 700, marginBottom: 4 }}>💡 원인 추정:</div>
                    {diagnostics.totalTableRowsSeen === 0 ? (
                      <div style={{ color: "#fca5a5", lineHeight: 1.5 }}>
                        ⛔ <strong>RLS 차단 확정</strong>: Admin이 games 테이블 자체를 아예 못 읽음<br/>
                        · Supabase Dashboard → games 테이블 → Policies<br/>
                        · Admin에게 SELECT 권한 부여 필요
                      </div>
                    ) : !diagnostics.targetUserFound ? (
                      <div style={{ color: "#fca5a5", lineHeight: 1.5 }}>
                        ⚠️ <strong>target user_id가 전체 {diagnostics.totalTableRowsSeen}행 중에 없음</strong><br/>
                        · 해당 user의 games 데이터가 실제로 없거나<br/>
                        · RLS가 부분적으로 차단 (Admin 본인 것만 보임)<br/>
                        · 유니크 user {diagnostics.uniqueUserIds.length}명 중에 target 불포함
                      </div>
                    ) : diagnostics.rawCount === 0 ? (
                      <div style={{ color: "#fca5a5", lineHeight: 1.5 }}>
                        ⚠️ <strong>이상 상황</strong>: 전체 스캔엔 target이 있는데 eq 쿼리 결과가 0<br/>
                        · user_id 컬럼 타입 불일치 가능성 (text vs uuid)
                      </div>
                    ) : diagnostics.gameCount === 0 ? (
                      <div style={{ color: "#fca5a5", lineHeight: 1.5 }}>
                        · rows는 있으나 `game:` 로 시작하는 키가 없음<br/>
                        · 키 패턴이 다를 수 있음 (위 키 샘플 확인)
                      </div>
                    ) : (
                      <div style={{ color: "#86efac", lineHeight: 1.5 }}>정상 동작 중 (게임 {diagnostics.gameCount}개 발견)</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {!loading && !error && games.length > 0 && !selectedGame && (
            <div>
              <div style={{ fontSize: 11, color: "#a1a1aa", marginBottom: 10 }}>
                총 <strong style={{ color: "#c4b5fd" }}>{games.length}</strong>개 게임 (최근 순)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {games.map((g) => {
                  const turnCount = (g.turnLog || []).length;
                  const hasDebrief = g.debriefData?.feedback && (
                    g.debriefData.feedback.free?.text ||
                    g.debriefData.feedback.detail?.text ||
                    g.debriefData.feedback.premium?.text
                  );
                  return (
                    <div key={g.key}
                      onClick={() => setSelectedGame(g)}
                      style={{
                        padding: 12, borderRadius: 8,
                        background: "#111118", border: "1px solid #27272a",
                        cursor: "pointer", transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#1a1a22"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "#111118"}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                        <div style={{ fontSize: 11, color: "#71717a" }}>
                          📅 {formatDateTime(g.dateTime || g.storageUpdatedAt)}
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          {hasDebrief && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "#22c55e20", color: "#86efac", fontWeight: 700 }}>📝 디브리핑</span>}
                          {g.escaped && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "#fbbf2420", color: "#fde68a", fontWeight: 700 }}>✅ 탈출</span>}
                        </div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#fafafa", marginBottom: 4 }}>
                        <span style={{ color: "#93c5fd" }}>{g.version || "캐쉬플로우"}</span>
                        {" · "}{g.job || "직업 미지정"}
                        {" · "}{turnCount || g.turnCount || 0}턴
                      </div>
                      <div style={{ fontSize: 10, color: "#a1a1aa" }}>
                        💰 현금 ${fmtNumLocal(g.cash || 0)} · 📈 월 CF ${fmtNumLocal(g.totalCF || 0)} · 🏦 대출 ${fmtNumLocal(g.bankLoan || 0)}
                        {g.babies > 0 && <span> · 👶 {g.babies}명</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!loading && !error && selectedGame && (
            <AdminGameDetail
              game={selectedGame}
              member={member}
              adminUser={adminUser}
              onBack={() => setSelectedGame(null)}
              onGameUpdated={() => {
                // 저장 후 목록 재로드 + 선택된 게임 데이터도 갱신
                loadMemberGames();
              }}
            />
          )}
        </div>

        {/* 푸터 */}
        {!selectedGame && (
          <div style={{ padding: "10px 16px", borderTop: "1px solid #27272a", background: "#111118", fontSize: 9, color: "#52525b", textAlign: "center" }}>
            💡 게임을 클릭하면 턴 로그 · 자산 · 디브리핑을 확인하고 Admin이 대신 진행할 수 있습니다.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 숫자 포맷 헬퍼 ───
function fmtNumLocal(n) {
  return new Intl.NumberFormat("en-US").format(n || 0);
}

// ═══════════════════════════════════════════════════
// 💾 Admin이 생성한 디브리핑을 해당 user의 game row에 저장
// ═══════════════════════════════════════════════════
// games 테이블의 정규화된 구조:
//   id (PK), user_id, debrief (JSON)
// → debrief 컬럼에 { analysis, feedback: { free, detail, premium }, editHistory } JSON 저장
async function saveDebriefToMemberGame(gameId, userId, tier, text, analysis, generatedAt, adminUser = null) {
  // 1. 기존 row 읽기 (id로 정확히 1건)
  const { data: existing, error: readErr } = await supabase
    .from("games")
    .select("id, user_id, debrief")
    .eq("id", gameId)
    .eq("user_id", userId)
    .maybeSingle();

  if (readErr) throw new Error(`읽기 실패: ${readErr.message}`);
  if (!existing) throw new Error(`게임 데이터(id=${gameId})를 찾을 수 없습니다.`);

  // 기존 debrief JSON 파싱
  let currentDebrief;
  if (existing.debrief) {
    if (typeof existing.debrief === "string") {
      try { currentDebrief = JSON.parse(existing.debrief); }
      catch { currentDebrief = {}; }
    } else {
      currentDebrief = existing.debrief;
    }
  } else {
    currentDebrief = {};
  }

  // 기존 구조 보정
  currentDebrief = {
    analysis: currentDebrief.analysis || null,
    analysisAt: currentDebrief.analysisAt || null,
    feedback: currentDebrief.feedback || {},
    editHistory: currentDebrief.editHistory || [],
    ...currentDebrief,
  };

  // Admin 저장자 로그
  const adminSaveLog = {
    savedByUserId: adminUser?.id || null,
    savedByEmail: adminUser?.email || null,
    savedByNickname: adminUser?.user_metadata?.nickname || "Admin",
    savedAt: generatedAt,
    tier,
    isAdmin: true,
    targetUserId: userId,
  };
  console.log("[saveDebriefToMemberGame] 👑 Admin 저장 로그:", adminSaveLog);

  // feedback 업데이트
  const updatedFeedback = { ...(currentDebrief.feedback || {}) };
  updatedFeedback[tier] = {
    text,
    generatedAt,
    adminGenerated: true,
    saveLog: adminSaveLog,
  };

  // 전체 debrief JSON 조립
  const newDebrief = {
    ...currentDebrief,
    analysis: analysis || currentDebrief.analysis,
    analysisAt: analysis ? generatedAt : currentDebrief.analysisAt,
    feedback: updatedFeedback,
    editHistory: [
      ...(currentDebrief.editHistory || []),
      { ...adminSaveLog, action: `admin_debrief_${tier}` },
    ].slice(-50),
  };

  // UPDATE
  const { error: updErr } = await supabase
    .from("games")
    .update({ debrief: newDebrief })
    .eq("id", gameId)
    .eq("user_id", userId);

  if (updErr) throw new Error(`저장 실패: ${updErr.message}`);

  console.log(`[saveDebriefToMemberGame] ✅ game id=${gameId} 의 ${tier} 디브리핑 저장 완료`);
}

// ═══════════════════════════════════════════════════
// 🔍 게임 상세 (턴 로그 + 자산 + 자금 + 디브리핑)
// ═══════════════════════════════════════════════════
function AdminGameDetail({ game, member, adminUser, onBack, onGameUpdated }) {
  const turnLog = game.turnLog || [];
  const assets = game.assets || [];
  const debriefData = game.debriefData || {};
  const fb = debriefData.feedback || {};

  // 🆕 디브리핑 진행 state
  const [debriefRunning, setDebriefRunning] = useState(null); // "free" | "detail" | "premium" | null
  const [debriefError, setDebriefError] = useState("");
  const [debriefResult, setDebriefResult] = useState(null); // { tier, text, analysis, generatedAt }
  const [confirmTier, setConfirmTier] = useState(null); // 유료 티어 확인 모달

  const CELL_LABELS = {
    SMALL_DEAL: "🏪 SMALL DEAL", BIG_DEAL: "🏢 BIG DEAL",
    MARKET: "🛒 MARKET", DOODAD: "💸 DOODAD",
    PAYDAY: "💰 PAYDAY", CHARITY: "🎁 CHARITY",
    BABY: "👶 BABY", DOWNSIZED: "📉 DOWNSIZED",
    OPPORTUNITY: "🎯 OPPORTUNITY",
  };

  const getActionLabel = (a) => {
    if (!a) return "";
    const map = { buy: "구매", pass: "패스", sell: "판매", hold: "홀딩", na: "해당없음", damage: "지불", charity_yes: "기부 YES", charity_no: "기부 NO" };
    return map[a] || a;
  };

  // 🆕 Admin이 대신 디브리핑 진행
  const handleAdminDebrief = async (tier) => {
    if (!turnLog || turnLog.length === 0) {
      setDebriefError("턴 기록이 없어 디브리핑을 진행할 수 없습니다.");
      return;
    }

    // 이미 저장된 디브리핑이 있으면 표시만
    const existing = fb[tier];
    if (existing?.text) {
      setDebriefResult({
        tier,
        text: existing.text,
        analysis: debriefData.analysis || null,
        generatedAt: existing.generatedAt,
        savedReplay: true,
      });
      return;
    }

    setDebriefRunning(tier);
    setDebriefError("");
    setDebriefResult(null);

    try {
      // turnLog → results 구조 변환
      const results = (game.gameResults || turnLog.map(t => ({
        turn: t.turn,
        cell: { type: t.cellType, label: t.cellType },
        dealType: t.dealType,
        card: t.card ? { ...t.card, _action: t.action, _shares: t.shares } : null,
        decisionSec: t.decisionSec,
        splitApplied: t.splitApplied,
        dice: [0], total: 0, pos: 0,
      })));

      const turns = game.turnCount || turnLog.length;
      const simText = game.simText || buildPromptText(results, game.version, turns);

      let text;
      let analysis = null;

      if (tier === "free") {
        // 무료: 텍스트 즉시 + 풀 분석 API
        text = generateFreeFeedback(results, turns);

        // 캐시된 analysis 있으면 재사용
        if (debriefData.analysis?.phases) {
          analysis = debriefData.analysis;
        } else {
          try {
            analysis = await runFullAnalysis({
              simText, version: game.version, turns, results,
            });
          } catch (e) {
            console.warn("[AdminDebrief] runFullAnalysis 실패 (텍스트만):", e.message);
          }
        }
      } else {
        // 상세/프리미엄: API 호출
        text = await generatePaidFeedback({
          tier: tier === "detail" ? 1 : 2,
          version: game.version, turns, simText,
        });

        // 유료는 6 Levels 진단 추가
        try {
          const passiveIncome = (assets || []).filter(a => a.type !== "주식").reduce((s, a) => s + (a.cf || 0), 0);
          const totalExpense = game.totalCF !== undefined && game.totalCF < 0
            ? Math.abs(game.totalCF) + passiveIncome : 1000;
          const financialLevel = diagnoseFinancialLevel({
            passiveIncome, totalExpense,
            cash: game.cash || 0,
            assets, bankLoan: game.bankLoan || 0,
            jobName: game.job || "",
          });
          analysis = debriefData.analysis ? { ...debriefData.analysis, financialLevel } : { financialLevel };
        } catch (e) {
          console.warn("[AdminDebrief] 6단계 진단 실패:", e.message);
        }
      }

      // 결과 표시
      const generatedAt = new Date().toISOString();
      setDebriefResult({ tier, text, analysis, generatedAt, savedReplay: false });

      // 해당 user의 game row에 저장
      try {
        await saveDebriefToMemberGame(game.id, member.user_id, tier, text, analysis, generatedAt, adminUser);
        // 부모에게 업데이트 알림 (목록 갱신)
        if (onGameUpdated) onGameUpdated();
      } catch (saveErr) {
        console.error("[AdminDebrief] 저장 실패:", saveErr);
        setDebriefError(`디브리핑은 생성되었지만 저장에 실패했습니다: ${saveErr.message}`);
      }
    } catch (e) {
      console.error(`[AdminDebrief] ${tier} 실패:`, e);
      setDebriefError(e.message || "디브리핑 진행 중 오류가 발생했습니다.");
    } finally {
      setDebriefRunning(null);
      setConfirmTier(null);
    }
  };

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          padding: "6px 12px", borderRadius: 6, border: "1px solid #27272a",
          background: "transparent", color: "#a1a1aa",
          cursor: "pointer", fontSize: 11, fontWeight: 600, marginBottom: 12,
        }}
      >← 게임 목록으로</button>

      {/* 기본 정보 */}
      <div style={{ padding: 14, borderRadius: 10, background: "#111118", border: "1px solid #27272a", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#fafafa", marginBottom: 6 }}>
          {game.version || "캐쉬플로우"} · {game.job || "-"} · {game.turnCount || turnLog.length}턴
        </div>
        <div style={{ fontSize: 10, color: "#71717a" }}>
          {game.dateTime ? new Date(game.dateTime).toLocaleString("ko-KR") : ""}
          {game.escaped && <span style={{ color: "#86efac", marginLeft: 8 }}>✅ 탈출 성공</span>}
        </div>
      </div>

      {/* 🆕 저장 로그 (누가 저장했는지) */}
      {(game.saveLog || (game.saveHistory && game.saveHistory.length > 0) || (game.debriefData && game.debriefData.editHistory)) && (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 8, background: "#111118", border: "1px solid #27272a" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", marginBottom: 6 }}>📝 저장 로그</div>

          {/* 최초 저장 */}
          {game.saveLog && (
            <div style={{ fontSize: 10, color: "#d4d4d8", marginBottom: 4, lineHeight: 1.5 }}>
              <strong style={{ color: "#86efac" }}>[최초 저장]</strong>
              {" "}{game.saveLog.savedByNickname || game.saveLog.savedByEmail || game.saveLog.savedByUserId || "알 수 없음"}
              {" · "}{game.saveLog.savedAt ? new Date(game.saveLog.savedAt).toLocaleString("ko-KR") : "-"}
              {game.saveLog.savedByUserId && (
                <div style={{ fontSize: 9, color: "#52525b", paddingLeft: 12, fontFamily: "monospace" }}>
                  user_id: {String(game.saveLog.savedByUserId).substring(0, 16)}...
                </div>
              )}
            </div>
          )}

          {/* 편집 이력 (디브리핑 등) */}
          {game.debriefData?.editHistory && game.debriefData.editHistory.length > 0 && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px dashed #27272a" }}>
              <div style={{ fontSize: 10, color: "#71717a", marginBottom: 3 }}>편집 이력 ({game.debriefData.editHistory.length}건):</div>
              {game.debriefData.editHistory.slice(-5).reverse().map((e, i) => (
                <div key={i} style={{ fontSize: 9, color: "#d4d4d8", paddingLeft: 8, lineHeight: 1.5 }}>
                  {e.isAdmin && <span style={{ color: "#fbbf24" }}>👑 </span>}
                  <code style={{ color: e.isAdmin ? "#fde68a" : "#86efac" }}>{e.action || "edit"}</code>
                  {" · "}{e.savedByNickname || e.savedByEmail || "-"}
                  {" · "}<span style={{ color: "#71717a" }}>{e.savedAt ? new Date(e.savedAt).toLocaleString("ko-KR") : "-"}</span>
                </div>
              ))}
            </div>
          )}

          {/* saveLog 없는 레거시 데이터 안내 */}
          {!game.saveLog && (
            <div style={{ fontSize: 9, color: "#52525b", fontStyle: "italic" }}>
              ℹ️ 이 게임은 저장 로그 기능 도입 이전에 저장되어 기록이 없습니다.
            </div>
          )}
        </div>
      )}

      {/* 재무 상태 */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#c4b5fd", marginBottom: 6 }}>💰 최종 재무 상태</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: 12, borderRadius: 8, background: "#111118", border: "1px solid #27272a" }}>
          <div><span style={{ fontSize: 10, color: "#71717a" }}>보유 현금:</span> <span style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24" }}>${fmtNumLocal(game.cash || 0)}</span></div>
          <div><span style={{ fontSize: 10, color: "#71717a" }}>월 현금흐름:</span> <span style={{ fontSize: 12, fontWeight: 700, color: (game.totalCF || 0) >= 0 ? "#22c55e" : "#ef4444" }}>{(game.totalCF || 0) >= 0 ? "+" : ""}${fmtNumLocal(game.totalCF || 0)}</span></div>
          <div><span style={{ fontSize: 10, color: "#71717a" }}>신용대출:</span> <span style={{ fontSize: 12, fontWeight: 700, color: "#f87171" }}>${fmtNumLocal(game.bankLoan || 0)}</span></div>
          <div><span style={{ fontSize: 10, color: "#71717a" }}>월 이자:</span> <span style={{ fontSize: 12, fontWeight: 700, color: "#fca5a5" }}>${fmtNumLocal(game.loanInterest || 0)}</span></div>
          <div><span style={{ fontSize: 10, color: "#71717a" }}>수동소득:</span> <span style={{ fontSize: 12, fontWeight: 700, color: "#22c55e" }}>${fmtNumLocal(assets.filter(a => a.type !== "주식").reduce((s, a) => s + (a.cf || 0), 0))}</span></div>
          <div><span style={{ fontSize: 10, color: "#71717a" }}>자녀:</span> <span style={{ fontSize: 12, fontWeight: 700, color: "#fafafa" }}>{game.babies || 0}명</span></div>
        </div>
      </div>

      {/* 자산 목록 */}
      {assets.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#c4b5fd", marginBottom: 6 }}>📦 보유 자산 ({assets.length}개)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 12, borderRadius: 8, background: "#111118", border: "1px solid #27272a" }}>
            {assets.map((a, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                <span style={{ color: "#e4e4e7" }}>[{a.type}] {a.name}{a.shares ? ` (${a.shares}주)` : ""}</span>
                <span style={{ color: (a.cf || 0) > 0 ? "#22c55e" : "#71717a" }}>
                  {a.cf ? `CF ${a.cf > 0 ? "+" : ""}$${fmtNumLocal(a.cf)}` : ""}
                  {a.cost ? ` · $${fmtNumLocal(a.cost)}` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 턴별 기록 */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#c4b5fd", marginBottom: 6 }}>🎲 턴별 기록 ({turnLog.length}턴)</div>
        {turnLog.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: "#52525b", fontSize: 11, borderRadius: 8, background: "#111118", border: "1px dashed #27272a" }}>턴 기록이 없습니다</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 300, overflowY: "auto", padding: 12, borderRadius: 8, background: "#111118", border: "1px solid #27272a" }}>
            {turnLog.map((t, i) => (
              <div key={i} style={{
                padding: "6px 10px", borderRadius: 6,
                background: "#0a0a0f", borderLeft: `3px solid ${
                  t.action === "buy" ? "#22c55e" :
                  t.action === "pass" ? "#ef4444" :
                  t.action === "sell" ? "#f59e0b" :
                  t.action === "charity_yes" ? "#8b5cf6" :
                  "#52525b"
                }`,
                fontSize: 10,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#fafafa", fontWeight: 600 }}>
                    T{t.turn} · {CELL_LABELS[t.cellType] || t.cellType}
                    {t.action && <span style={{ color: "#a1a1aa", marginLeft: 6 }}>[{getActionLabel(t.action)}]</span>}
                  </span>
                  {t.decisionSec != null && (
                    <span style={{ fontSize: 9, color: "#52525b" }}>⏱️ {t.decisionSec}초</span>
                  )}
                </div>
                {t.card && (t.card.sub || t.card.desc) && (
                  <div style={{ color: "#a1a1aa", marginTop: 2 }}>
                    {t.card.sub || t.card.desc}
                    {t.card.cashflow != null && <span style={{ color: "#86efac", marginLeft: 4 }}>(CF {t.card.cashflow > 0 ? "+" : ""}${t.card.cashflow})</span>}
                  </div>
                )}
                {t.transaction && (
                  <div style={{ color: "#fbbf24", fontSize: 9, marginTop: 2 }}>{t.transaction}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 🆕 Admin 디브리핑 진행 영역 */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#c4b5fd", marginBottom: 6 }}>
          📝 디브리핑 (Admin이 대신 진행 가능)
        </div>

        {/* 3개 티어 버튼 */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {[
            { key: "free", icon: "💬", label: "요약", price: "무료", color: "#22c55e" },
            { key: "detail", icon: "📝", label: "상세", price: "$9", color: "#3b82f6" },
            { key: "premium", icon: "💎", label: "프리미엄", price: "$20", color: "#f59e0b" },
          ].map(t => {
            const done = !!fb[t.key]?.text;
            const loading = debriefRunning === t.key;
            return (
              <button
                key={t.key}
                disabled={!!debriefRunning || turnLog.length === 0}
                onClick={() => {
                  if (t.key === "free") {
                    handleAdminDebrief(t.key);
                  } else {
                    // 유료는 확인 팝업
                    setConfirmTier(t.key);
                  }
                }}
                style={{
                  flex: 1, padding: "10px 4px", borderRadius: 8,
                  border: done ? `1px solid ${t.color}` : `1px solid ${t.color}40`,
                  background: done ? `${t.color}20` : `${t.color}08`,
                  color: done ? t.color : "#a1a1aa",
                  cursor: debriefRunning || turnLog.length === 0 ? "not-allowed" : "pointer",
                  fontSize: 11, fontWeight: 700,
                  opacity: debriefRunning && !loading ? 0.4 : 1,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                }}
                title={turnLog.length === 0 ? "턴 기록이 없어 디브리핑 불가" : ""}
              >
                <span style={{ fontSize: 14 }}>{loading ? "⏳" : t.icon}</span>
                <span>{t.label}</span>
                <span style={{ fontSize: 9, color: done ? t.color : "#52525b" }}>
                  {loading ? "생성 중..." : (done ? "📄 다시 보기" : `▶ ${t.price}`)}
                </span>
              </button>
            );
          })}
        </div>

        {/* 유료 티어 확인 팝업 */}
        {confirmTier && (
          <div style={{ padding: 14, borderRadius: 8, background: "#fbbf2410", border: "1px solid #fbbf2440", marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#fde68a", marginBottom: 6 }}>
              ⚠️ {confirmTier === "detail" ? "상세 ($9)" : "프리미엄 ($20)"} 디브리핑 진행 확인
            </div>
            <div style={{ fontSize: 10, color: "#a1a1aa", marginBottom: 10, lineHeight: 1.6 }}>
              Admin이 <strong style={{ color: "#fafafa" }}>{member.name}</strong>님의 게임에 대해 디브리핑을 진행합니다.<br/>
              생성된 결과는 해당 회원의 데이터에 저장되어 회원 본인도 조회할 수 있습니다.<br/>
              <span style={{ color: "#fbbf24" }}>유료 티어이므로 API 비용이 발생합니다.</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setConfirmTier(null)} style={{
                flex: 1, padding: "6px 12px", borderRadius: 6, border: "1px solid #27272a",
                background: "transparent", color: "#a1a1aa", cursor: "pointer", fontSize: 11,
              }}>취소</button>
              <button onClick={() => handleAdminDebrief(confirmTier)} style={{
                flex: 1, padding: "6px 12px", borderRadius: 6, border: "none",
                background: confirmTier === "detail" ? "#3b82f6" : "#f59e0b",
                color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 700,
              }}>진행 (API 호출)</button>
            </div>
          </div>
        )}

        {/* 에러 표시 */}
        {debriefError && (
          <div style={{ padding: 10, borderRadius: 6, background: "#7f1d1d30", border: "1px solid #ef444450", color: "#fca5a5", fontSize: 11, marginBottom: 10 }}>
            ⚠️ {debriefError}
          </div>
        )}

        {/* 디브리핑 결과 (방금 생성 또는 다시 보기) */}
        {debriefResult && (
          <div style={{ padding: 12, borderRadius: 8, background: "#111118", border: `2px solid ${
            debriefResult.tier === "free" ? "#22c55e" :
            debriefResult.tier === "detail" ? "#3b82f6" : "#f59e0b"
          }`, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fafafa" }}>
                {debriefResult.tier === "free" && "💬 요약 피드백"}
                {debriefResult.tier === "detail" && "📝 상세 피드백 ($9)"}
                {debriefResult.tier === "premium" && "💎 프리미엄 피드백 ($20)"}
                {debriefResult.savedReplay && <span style={{ fontSize: 9, marginLeft: 6, color: "#71717a" }}>(저장본)</span>}
                {!debriefResult.savedReplay && <span style={{ fontSize: 9, marginLeft: 6, color: "#86efac" }}>✅ 방금 생성</span>}
              </div>
              <button onClick={() => setDebriefResult(null)} style={{
                padding: "3px 8px", borderRadius: 4, border: "none",
                background: "#27272a", color: "#a1a1aa", cursor: "pointer", fontSize: 10,
              }}>✕</button>
            </div>

            {/* 풀 분석 렌더링 */}
            {debriefResult.analysis && (debriefResult.analysis.phases || debriefResult.analysis.lessons || debriefResult.analysis.financialLevel) && (
              <div style={{ marginBottom: 16 }}>
                <AnalysisReport
                  analysis={debriefResult.analysis}
                  turns={game.turnCount || turnLog.length}
                />
              </div>
            )}

            {/* 텍스트 피드백 */}
            <div style={{
              fontSize: 12, color: "#e4e4e7", lineHeight: 1.7,
              whiteSpace: "pre-wrap", wordBreak: "break-word",
              paddingTop: debriefResult.analysis ? 12 : 0,
              borderTop: debriefResult.analysis ? "1px solid #27272a" : "none",
              maxHeight: 400, overflowY: "auto",
            }}>
              {debriefResult.analysis && (
                <div style={{ fontSize: 10, fontWeight: 700, color: "#71717a", marginBottom: 8 }}>
                  💬 코칭 메시지
                </div>
              )}
              {debriefResult.text}
            </div>
          </div>
        )}

        {/* 저장된 디브리핑 기록 (간단 요약) */}
        {(fb.free?.text || fb.detail?.text || fb.premium?.text) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {fb.free?.text && (
              <details style={{ padding: 10, borderRadius: 6, background: "#111118", border: "1px solid #27272a" }}>
                <summary style={{ fontSize: 10, fontWeight: 600, color: "#22c55e", cursor: "pointer" }}>
                  💬 요약 피드백 · {fb.free.generatedAt ? new Date(fb.free.generatedAt).toLocaleDateString("ko-KR") : ""}
                  {fb.free.adminGenerated && <span style={{ color: "#fbbf24", marginLeft: 4 }}>👑 Admin 생성</span>}
                </summary>
                <div style={{ marginTop: 8, fontSize: 11, color: "#e4e4e7", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{fb.free.text}</div>
              </details>
            )}
            {fb.detail?.text && (
              <details style={{ padding: 10, borderRadius: 6, background: "#111118", border: "1px solid #27272a" }}>
                <summary style={{ fontSize: 10, fontWeight: 600, color: "#3b82f6", cursor: "pointer" }}>
                  📝 상세 피드백 ($9) · {fb.detail.generatedAt ? new Date(fb.detail.generatedAt).toLocaleDateString("ko-KR") : ""}
                  {fb.detail.adminGenerated && <span style={{ color: "#fbbf24", marginLeft: 4 }}>👑 Admin 생성</span>}
                </summary>
                <div style={{ marginTop: 8, fontSize: 11, color: "#e4e4e7", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{fb.detail.text}</div>
              </details>
            )}
            {fb.premium?.text && (
              <details style={{ padding: 10, borderRadius: 6, background: "#111118", border: "1px solid #27272a" }}>
                <summary style={{ fontSize: 10, fontWeight: 600, color: "#f59e0b", cursor: "pointer" }}>
                  💎 프리미엄 피드백 ($20) · {fb.premium.generatedAt ? new Date(fb.premium.generatedAt).toLocaleDateString("ko-KR") : ""}
                  {fb.premium.adminGenerated && <span style={{ color: "#fbbf24", marginLeft: 4 }}>👑 Admin 생성</span>}
                </summary>
                <div style={{ marginTop: 8, fontSize: 11, color: "#e4e4e7", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{fb.premium.text}</div>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
