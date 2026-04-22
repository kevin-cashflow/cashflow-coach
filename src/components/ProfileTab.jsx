"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import CoachBadge, { getCredentialConfig } from "./CoachBadge";
import CoachCodeModal from "./CoachCodeModal";
import { TierProgressCard } from "./TierBadge";
import TierGuide from "./TierGuide";

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

  // 추가 정보 (Phase B Day 3)
  const [profileInfo, setProfileInfo] = useState(null); // user_profiles 데이터
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    real_name: "",
    phone: "",
    user_type: "",
    user_type_other: "",
    school_name: "",
    organization: "",
  });
  const [profileSaving, setProfileSaving] = useState(false);
  // 추가 정보 섹션 펼침 여부 (기본 접힘)
  const [profileExpanded, setProfileExpanded] = useState(false);

  useEffect(() => {
    let mounted = true;
    
    if (!authUser) {
      setLoading(false);
      return;
    }
    
    // 5초 안전 타이머 - 어떤 경우든 로딩 무한 대기 방지
    const safetyTimer = setTimeout(() => {
      if (mounted) {
        console.warn("[ProfileTab] 5초 타임아웃 - 강제 로딩 종료");
        setLoading(false);
      }
    }, 5000);
    
    loadProfile().finally(() => {
      clearTimeout(safetyTimer);
      if (mounted) setLoading(false);
    });
    
    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
    };
  }, [authUser]);

  const loadProfile = async () => {
    setLoading(true);
    setError("");
    try {
      // 3초 타임아웃으로 Supabase 호출 (병렬)
      const queryPromise = Promise.all([
        supabase.from("user_stats").select("*").eq("user_id", authUser.id).maybeSingle(),
        supabase.from("user_profiles").select("*").eq("user_id", authUser.id).maybeSingle(),
      ]);
      
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Supabase 타임아웃")), 3000)
      );
      
      const [statsResult, profileResult] = await Promise.race([queryPromise, timeoutPromise]);

      if (statsResult.error) throw statsResult.error;

      setStats(statsResult.data || {
        user_id: authUser.id,
        display_name: authUser.user_metadata?.display_name || authUser.email?.split("@")[0] || "사용자",
        total_plays: 0,
      });
      setCredential(statsResult.data?.credential || null);
      setNewName(statsResult.data?.display_name || authUser.email?.split("@")[0] || "");

      // 추가 정보 (user_profiles)
      if (profileResult.data) {
        setProfileInfo(profileResult.data);
        setProfileForm({
          real_name: profileResult.data.real_name || "",
          phone: profileResult.data.phone || "",
          user_type: profileResult.data.user_type || "",
          user_type_other: profileResult.data.user_type_other || "",
          school_name: profileResult.data.school_name || "",
          organization: profileResult.data.organization || "",
        });
      }
    } catch (e) {
      console.warn("[ProfileTab] 프로필 로드 실패:", e.message);
      // 에러 시에도 기본값으로 세팅하여 UI가 동작하게 함
      setStats({
        user_id: authUser.id,
        display_name: authUser.user_metadata?.display_name || authUser.email?.split("@")[0] || "사용자",
        total_plays: 0,
      });
      setNewName(authUser.user_metadata?.display_name || authUser.email?.split("@")[0] || "");
    } finally {
      setLoading(false);
    }
  };

  // 추가 정보 저장
  const saveProfileInfo = async () => {
    const { real_name, phone, user_type, user_type_other, school_name, organization } = profileForm;
    
    // 검증
    if (real_name && real_name.trim().length < 2) {
      alert("실명은 2자 이상이어야 합니다.");
      return;
    }
    if (user_type === "teacher" && !school_name.trim()) {
      alert("교사 선택 시 학교명을 입력해주세요.");
      return;
    }
    if (user_type === "other" && !user_type_other.trim()) {
      alert("기타 선택 시 유형을 입력해주세요.");
      return;
    }

    setProfileSaving(true);
    try {
      const { error } = await supabase
        .from("user_profiles")
        .upsert({
          user_id: authUser.id,
          real_name: real_name.trim() || null,
          phone: phone.trim() || null,
          user_type: user_type || null,
          user_type_other: user_type === "other" ? user_type_other.trim() : null,
          school_name: user_type === "teacher" ? school_name.trim() : null,
          organization: organization.trim() || null,
        });
      
      if (error) throw error;

      setProfileInfo({
        ...profileForm,
        user_type_other: user_type === "other" ? user_type_other.trim() : null,
        school_name: user_type === "teacher" ? school_name.trim() : null,
      });
      setEditingProfile(false);
      setMessage("✅ 추가 정보가 저장되었습니다.");
      setTimeout(() => setMessage(""), 3000);
    } catch (e) {
      console.error("추가 정보 저장 실패:", e);
      alert("저장 실패: " + e.message);
    } finally {
      setProfileSaving(false);
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
    setMessage(`🎉 ${newCredential === "master" ? "🎓 마스터 강사" : "🎯 코칭딜러"} 자격이 활성화되었습니다!`);
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

        {/* ── 추가 정보 토글 (접힘/펼침) ── */}
        <div style={{
          marginTop: 14,
          paddingTop: 14,
          borderTop: "1px solid #27272a",
        }}>
          <button
            onClick={() => setProfileExpanded(!profileExpanded)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 0",
              border: "none",
              background: "transparent",
              color: "#a1a1aa",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            <span>📝 추가 정보 {profileInfo && <span style={{ fontSize: 10, color: "#71717a", fontWeight: 500 }}>(입력됨)</span>}</span>
            <span style={{
              fontSize: 10,
              color: "#71717a",
              transition: "transform 0.2s",
              transform: profileExpanded ? "rotate(180deg)" : "rotate(0deg)",
              display: "inline-block",
            }}>▼</span>
          </button>

          {profileExpanded && (
            <div style={{ marginTop: 10 }}>
              {/* 펼쳐졌을 때 안내 + 수정 버튼 */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}>
                <div style={{ fontSize: 10, color: "#71717a" }}>
                  {profileInfo ? "저장된 추가 정보" : "실명과 연락처 (선택)"}
                </div>
                {!editingProfile && (
                  <button
                    onClick={() => setEditingProfile(true)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 4,
                      border: "1px solid #27272a",
                      background: "transparent",
                      color: "#a1a1aa",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    ✏️ {profileInfo ? "수정" : "입력"}
                  </button>
                )}
              </div>

              {!editingProfile && !profileInfo && (
                <p style={{ fontSize: 11, color: "#71717a", margin: 0, lineHeight: 1.6 }}>
                  실명과 연락처를 입력하시면 맞춤 안내와 자격 관리에 도움이 됩니다.
                </p>
              )}

              {!editingProfile && profileInfo && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {profileInfo.real_name && (
                    <InfoRow label="실명" value={profileInfo.real_name} />
                  )}
                  {profileInfo.phone && (
                    <InfoRow label="연락처" value={profileInfo.phone} />
                  )}
                  {profileInfo.user_type && (
                    <InfoRow
                      label="유형"
                      value={getUserTypeLabel(profileInfo.user_type, profileInfo.user_type_other)}
                    />
                  )}
                  {profileInfo.school_name && (
                    <InfoRow label="학교" value={profileInfo.school_name} />
                  )}
                  {profileInfo.organization && (
                    <InfoRow label="소속/메모" value={profileInfo.organization} />
                  )}
                </div>
              )}

              {editingProfile && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* 실명 */}
                  <div>
                    <label style={miniLabelStyle}>실명</label>
                    <input
                      type="text"
                      value={profileForm.real_name}
                      onChange={(e) => setProfileForm({ ...profileForm, real_name: e.target.value })}
                      placeholder="홍길동"
                      style={inputStyle}
                    />
                  </div>

                  {/* 연락처 */}
                  <div>
                    <label style={miniLabelStyle}>연락처</label>
                    <input
                      type="tel"
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                      placeholder="010-1234-5678"
                      style={inputStyle}
                    />
                  </div>

                  {/* 유형 */}
                  <div>
                    <label style={miniLabelStyle}>유형</label>
                    <select
                      value={profileForm.user_type}
                      onChange={(e) => setProfileForm({ ...profileForm, user_type: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="">선택하지 않음</option>
                      <option value="general">일반 (개인 학습자)</option>
                      <option value="teacher">교사 (초·중·고)</option>
                      <option value="institution">기관 (도서관, 청소년센터 등)</option>
                      <option value="company">기업 (B2B, HR, 교육팀)</option>
                      <option value="other">기타</option>
                    </select>
                    {profileForm.user_type && (
                      <p style={{ fontSize: 10, color: "#71717a", margin: "4px 0 0" }}>
                        {getUserTypeDesc(profileForm.user_type)}
                      </p>
                    )}
                  </div>

                  {/* 기타 입력 */}
                  {profileForm.user_type === "other" && (
                    <div>
                      <label style={miniLabelStyle}>기타 유형 (직접 입력)</label>
                      <input
                        type="text"
                        value={profileForm.user_type_other}
                        onChange={(e) => setProfileForm({ ...profileForm, user_type_other: e.target.value })}
                        placeholder="예: 프리랜서, 자영업자 등"
                        style={inputStyle}
                      />
                    </div>
                  )}

                  {/* 학교명 (교사일 때만) */}
                  {profileForm.user_type === "teacher" && (
                    <div>
                      <label style={miniLabelStyle}>학교명</label>
                      <input
                        type="text"
                        value={profileForm.school_name}
                        onChange={(e) => setProfileForm({ ...profileForm, school_name: e.target.value })}
                        placeholder="○○고등학교"
                        style={inputStyle}
                      />
                    </div>
                  )}

                  {/* 소속 / 메모 */}
                  <div>
                    <label style={miniLabelStyle}>소속 / 메모 (선택)</label>
                    <input
                      type="text"
                      value={profileForm.organization}
                      onChange={(e) => setProfileForm({ ...profileForm, organization: e.target.value })}
                      placeholder="회사명, 동아리명, 개인 메모 등"
                      style={inputStyle}
                    />
                  </div>

                  {/* 저장/취소 버튼 */}
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => {
                        setEditingProfile(false);
                        // 폼 초기화
                        if (profileInfo) {
                          setProfileForm({
                            real_name: profileInfo.real_name || "",
                            phone: profileInfo.phone || "",
                            user_type: profileInfo.user_type || "",
                            user_type_other: profileInfo.user_type_other || "",
                            school_name: profileInfo.school_name || "",
                            organization: profileInfo.organization || "",
                          });
                        }
                      }}
                      disabled={profileSaving}
                      style={{
                        flex: 1,
                        padding: "10px",
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
                      onClick={saveProfileInfo}
                      disabled={profileSaving}
                      style={{
                        flex: 2,
                        padding: "10px",
                        borderRadius: 6,
                        border: "none",
                        background: profileSaving ? "#52525b" : "#3b82f6",
                        color: "#fff",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: profileSaving ? "not-allowed" : "pointer",
                      }}
                    >
                      {profileSaving ? "저장 중..." : "💾 저장"}
                    </button>
                  </div>
                </div>
              )}

              {message && (
                <div style={{
                  marginTop: 10,
                  padding: 8,
                  borderRadius: 6,
                  background: "#10b98120",
                  border: "1px solid #10b98140",
                  fontSize: 11,
                  color: "#86efac",
                  textAlign: "center",
                }}>
                  {message}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 티어 진행도 + 티어 안내는 코칭딜러 자격 아래로 이동됨 */}

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


      {/* 티어 진행도 카드 (코칭딜러 자격 아래) */}
      <div style={{ marginBottom: 14 }}>
        <TierProgressCard playCount={stats?.total_plays || 0} />
      </div>

      {/* 🏆 티어 안내 (10단계 전체 표) - 내 현황 포함 */}
      <div style={{ marginBottom: 14 }}>
        <TierGuide userStats={stats} />
      </div>

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

// ─── 헬퍼 컴포넌트 ───
function InfoRow({ label, value }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
      <div style={{ fontSize: 10, color: "#71717a", minWidth: 60 }}>{label}</div>
      <div style={{ fontSize: 12, color: "#d4d4d8" }}>{value}</div>
    </div>
  );
}

// ─── 헬퍼 함수 ───
function getUserTypeLabel(type, other) {
  const labels = {
    general: "일반",
    teacher: "교사 (초·중·고)",
    institution: "기관",
    company: "기업",
    other: `기타${other ? ` (${other})` : ""}`,
  };
  return labels[type] || type;
}

function getUserTypeDesc(type) {
  const descs = {
    general: "개인 학습자 / 일반 성인",
    teacher: "학교 선생님",
    institution: "도서관, 청소년센터, 평생학습관, 여성회관 등",
    company: "B2B 강의, HR, 교육팀",
    other: "자유롭게 입력해주세요",
  };
  return descs[type] || "";
}

// ─── 공통 스타일 ───
const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid #27272a",
  background: "#0a0a0f",
  color: "#fafafa",
  fontSize: 12,
  outline: "none",
  fontFamily: "inherit",
};

const miniLabelStyle = {
  fontSize: 10,
  color: "#a1a1aa",
  marginBottom: 4,
  display: "block",
  fontWeight: 600,
};
