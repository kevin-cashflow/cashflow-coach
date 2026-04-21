"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

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
                        {c.credential === "master" ? "🎓 마스터" : "🎯 코칭딜러"}
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

                {/* 4행: 통계 */}
                <div style={{ fontSize: 10, color: "#71717a" }}>
                  가입: {formatDate(m.joined_at)} · 게임 {m.total_plays || 0}회
                  {m.contest_count > 0 && <span> · 대회 {m.contest_count}회</span>}
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
    m.coach_credential === "master" ? "마스터" : m.coach_credential === "dealer" ? "코칭딜러" : "",
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
