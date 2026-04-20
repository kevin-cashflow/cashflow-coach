"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import CoachBadge, { getCredentialConfig } from "./CoachBadge";
import CoachCodeModal from "./CoachCodeModal";
import { TierProgressCard } from "./TierBadge";

/**
 * 👤 프로필 탭 (Phase B Day 2)
 *
 * 기능:
 * - 닉네임 표시 / 변경
 * - 이메일, 가입일 정보
 * - 현재 티어 + 진행도
 * - 코칭딜러 자격 (있으면 표시, 없으면 등록 버튼)
 * - 내 통계 요약
 *
 * Props:
 * - authUser: 로그인 사용자
 */
export default function ProfileTab({ authUser }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [credential, setCredential] = useState(null);
  const [error, setError] = useState("");

  // 닉네임 수정
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);

  // 코칭딜러 등록 모달
  const [codeModal, setCodeModal] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!authUser) {
      setLoading(false);
      return;
    }
    loadProfile();
  }, [authUser]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      // user_stats 뷰에서 모든 정보 조회
      const { data, error: qErr } = await supabase
        .from("user_stats")
        .select("*")
        .eq("user_id", authUser.id)
        .maybeSingle();

      if (qErr) throw qErr;

      setStats(data || {
        user_id: authUser.id,
        display_name: authUser.user_metadata?.display_name || authUser.email?.split("@")[0] || "사용자",
        total_plays: 0,
      });
      setCredential(data?.credential || null);
      setNewName(data?.display_name || authUser.email?.split("@")[0] || "");
    } catch (e) {
      console.error("[ProfileTab] 프로필 로드 실패:", e);
      setError(e.message || "프로필을 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  };

  const saveName = async () => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed.length < 2) {
      alert("닉네임은 최소 2자 이상이어야 합니다.");
      return;
    }
    if (trimmed.length > 20) {
      alert("닉네임은 최대 20자까지입니다.");
      return;
    }

    setSaveLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { display_name: trimmed },
      });
      if (error) throw error;

      setEditingName(false);
      setMessage("✅ 닉네임이 변경되었습니다.");
      setTimeout(() => setMessage(""), 3000);
      await loadProfile();
    } catch (e) {
      alert(`닉네임 변경 실패: ${e.message}`);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleCoachCodeSuccess = async (newCredential) => {
    setCodeModal(false);
    setCredential(newCredential);
    setMessage(`🎉 ${newCredential === "master" ? "🎓 마스터 코칭딜러" : "🎯 코칭딜러"} 자격이 활성화되었습니다!`);
    setTimeout(() => setMessage(""), 5000);
    await loadProfile();
  };

  const formatDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "40px 16px", textAlign: "center", color: "#71717a", fontSize: 13 }}>
        프로필 불러오는 중...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px" }}>
        <div style={{
          padding: 16,
          borderRadius: 10,
          background: "#7f1d1d30",
          border: "1px solid #dc262650",
          color: "#fca5a5",
          fontSize: 12,
        }}>
          ❌ {error}
        </div>
      </div>
    );
  }

  const displayName = stats?.display_name || "사용자";

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px" }}>
      {/* 성공 메시지 */}
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

      {/* 헤더 */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900, color: "#fafafa", margin: "0 0 4px 0" }}>
          👤 내 프로필
        </h2>
        <p style={{ fontSize: 12, color: "#71717a", margin: 0 }}>
          계정 정보와 자격을 관리하세요
        </p>
      </div>

      {/* 기본 정보 카드 */}
      <div style={{
        padding: 20,
        borderRadius: 12,
        background: "#111118",
        border: "1px solid #27272a",
        marginBottom: 14,
      }}>
        {/* 닉네임 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: "#71717a", marginBottom: 6 }}>닉네임</div>
          {editingName ? (
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                autoFocus
                maxLength={20}
                placeholder="닉네임 (2~20자)"
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid #3b82f6",
                  background: "#0a0a0f",
                  color: "#fafafa",
                  fontSize: 14,
                  outline: "none",
                }}
              />
              <button
                onClick={() => setEditingName(false)}
                disabled={saveLoading}
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid #27272a",
                  background: "transparent",
                  color: "#a1a1aa",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                취소
              </button>
              <button
                onClick={saveName}
                disabled={saveLoading}
                style={{
                  padding: "8px 14px",
                  borderRadius: 6,
                  border: "none",
                  background: saveLoading ? "#52525b" : "#3b82f6",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: saveLoading ? "not-allowed" : "pointer",
                }}
              >
                {saveLoading ? "저장 중..." : "저장"}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#fafafa" }}>
                {displayName}
              </div>
              {credential && <CoachBadge credential={credential} size="sm" />}
              <button
                onClick={() => { setEditingName(true); setNewName(displayName); }}
                style={{
                  marginLeft: "auto",
                  padding: "4px 10px",
                  borderRadius: 4,
                  border: "1px solid #27272a",
                  background: "transparent",
                  color: "#a1a1aa",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                ✏️ 수정
              </button>
            </div>
          )}
        </div>

        {/* 이메일 */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: "#71717a", marginBottom: 4 }}>이메일</div>
          <div style={{ fontSize: 13, color: "#d4d4d8" }}>{authUser?.email}</div>
        </div>

        {/* 가입일 */}
        <div>
          <div style={{ fontSize: 10, color: "#71717a", marginBottom: 4 }}>가입일</div>
          <div style={{ fontSize: 13, color: "#d4d4d8" }}>{formatDate(authUser?.created_at)}</div>
        </div>
      </div>

      {/* 티어 진행도 카드 */}
      <div style={{ marginBottom: 14 }}>
        <TierProgressCard playCount={stats?.total_plays || 0} />
      </div>

      {/* 코칭딜러 자격 섹션 */}
      <div style={{
        padding: 20,
        borderRadius: 12,
        background: credential 
          ? (credential === "master" ? "linear-gradient(135deg, #7c2d12, #d97706, #fbbf24)" : "linear-gradient(135deg, #1e3a8a, #3b82f6)")
          : "#111118",
        border: credential 
          ? `1px solid ${credential === "master" ? "#FFD700" : "#60a5fa"}`
          : "1px solid #27272a",
        marginBottom: 14,
      }}>
        <div style={{
          fontSize: 13,
          fontWeight: 800,
          color: credential ? "#fff" : "#fafafa",
          marginBottom: 10,
        }}>
          🎓 코칭딜러 자격
        </div>

        {credential ? (
          <div>
            <div style={{
              fontSize: 20,
              fontWeight: 900,
              color: "#fff",
              marginBottom: 4,
            }}>
              {getCredentialConfig(credential)?.icon} {getCredentialConfig(credential)?.name}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 6 }}>
              ✓ 인증 완료 · 국제캐쉬플로우강사협회
            </div>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 12, color: "#a1a1aa", lineHeight: 1.7, marginBottom: 14 }}>
              받으신 6자리 코드로 자격을 등록할 수 있습니다.<br/>
              코드는 <strong style={{ color: "#fde68a" }}>Admin(국제캐쉬플로우강사협회)</strong>에게 받으실 수 있습니다.
            </p>
            <button
              onClick={() => setCodeModal(true)}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "none",
                background: "linear-gradient(135deg, #eab308, #f59e0b)",
                color: "#000",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              🔑 코칭딜러 등록
            </button>
          </div>
        )}
      </div>

      {/* 내 통계 요약 */}
      {stats && stats.total_plays > 0 && (
        <div style={{
          padding: 16,
          borderRadius: 12,
          background: "#111118",
          border: "1px solid #27272a",
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#fafafa", marginBottom: 12 }}>
            📊 내 통계
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ padding: 10, background: "#18181b", borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: "#71717a" }}>🎮 총 플레이</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#86efac" }}>{stats.total_plays || 0}회</div>
            </div>
            <div style={{ padding: 10, background: "#18181b", borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: "#71717a" }}>🏆 대회 참가</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#fca5a5" }}>{stats.contest_count || 0}회</div>
            </div>
            {stats.contest_best_time && (
              <div style={{ padding: 10, background: "#18181b", borderRadius: 6 }}>
                <div style={{ fontSize: 10, color: "#71717a" }}>⚡ 최단 탈출</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#93c5fd" }}>
                  {Math.floor(stats.contest_best_time / 60)}:{String(stats.contest_best_time % 60).padStart(2, "0")}
                </div>
              </div>
            )}
            {stats.contest_best_income && (
              <div style={{ padding: 10, background: "#18181b", borderRadius: 6 }}>
                <div style={{ fontSize: 10, color: "#71717a" }}>💎 최고 패시브</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#c4b5fd" }}>
                  ${stats.contest_best_income.toLocaleString()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 코드 입력 모달 */}
      {codeModal && (
        <CoachCodeModal
          authUser={authUser}
          onSuccess={handleCoachCodeSuccess}
          onClose={() => setCodeModal(false)}
        />
      )}
    </div>
  );
}
