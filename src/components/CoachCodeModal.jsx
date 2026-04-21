"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";

/**
 * 🔑 코칭딜러 코드 입력 모달 (Phase B Day 3 - v2)
 *
 * 2단계 프로세스:
 *   Step 1: 6자리 코드 입력
 *   Step 2: 추가 정보 입력 (실명, 연락처, 유형)
 *
 * Props:
 * - authUser: 로그인 사용자
 * - onSuccess: 등록 성공 시 콜백 (credential 전달)
 * - onClose: 닫기 콜백
 */
export default function CoachCodeModal({ authUser, onSuccess, onClose }) {
  const [step, setStep] = useState(1); // 1: 코드, 2: 정보
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRefs = useRef([]);

  // Step 2: 추가 정보
  const [realName, setRealName] = useState("");
  const [phone, setPhone] = useState("");
  const [userType, setUserType] = useState("");
  const [userTypeOther, setUserTypeOther] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [organization, setOrganization] = useState("");

  useEffect(() => {
    if (step === 1) {
      inputRefs.current[0]?.focus();
    }
    const onEsc = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose, step]);

  // 기존 프로필 정보가 있으면 미리 로드 (입력 편의)
  useEffect(() => {
    if (step !== 2 || !authUser?.id) return;
    (async () => {
      try {
        const { data } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("user_id", authUser.id)
          .maybeSingle();
        if (data) {
          setRealName(data.real_name || "");
          setPhone(data.phone || "");
          setUserType(data.user_type || "");
          setUserTypeOther(data.user_type_other || "");
          setSchoolName(data.school_name || "");
          setOrganization(data.organization || "");
        }
      } catch (e) {
        console.warn("[CoachCodeModal] 기존 프로필 로드 실패:", e);
      }
    })();
  }, [step, authUser]);

  const handleChange = (idx, value) => {
    const cleanValue = value.replace(/\D/g, "").slice(0, 1);
    const newDigits = [...digits];
    newDigits[idx] = cleanValue;
    setDigits(newDigits);
    setError("");
    if (cleanValue && idx < 5) {
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handleKeyDown = (idx, e) => {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
    if (e.key === "Enter") {
      handleNextStep();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const newDigits = pasted.split("").concat(Array(6).fill("")).slice(0, 6);
    setDigits(newDigits);
    const nextIdx = Math.min(pasted.length, 5);
    inputRefs.current[nextIdx]?.focus();
  };

  // Step 1 → Step 2 이동
  const handleNextStep = () => {
    const code = digits.join("");
    if (code.length !== 6) {
      setError("6자리 숫자를 모두 입력해주세요.");
      return;
    }
    setError("");
    setStep(2);
  };

  // 최종 제출 (코드 + 프로필 정보 함께)
  const handleSubmit = async () => {
    // Step 2 검증
    if (!realName.trim() || realName.trim().length < 2) {
      setError("실명을 2자 이상 입력해주세요.");
      return;
    }
    if (!phone.trim() || phone.trim().length < 9) {
      setError("연락처를 정확히 입력해주세요.");
      return;
    }
    if (!userType) {
      setError("사용자 유형을 선택해주세요.");
      return;
    }
    if (userType === "teacher" && !schoolName.trim()) {
      setError("학교명을 입력해주세요.");
      return;
    }
    if (userType === "other" && !userTypeOther.trim()) {
      setError("기타 유형을 입력해주세요.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // 1. 세션 토큰 가져오기
      const { data: { session } } = await supabase.auth.getSession();
      const userToken = session?.access_token;
      if (!userToken) {
        setError("로그인 세션이 만료되었습니다. 다시 로그인해주세요.");
        setLoading(false);
        return;
      }

      // 2. 프로필 먼저 저장/업데이트
      const { error: profileErr } = await supabase
        .from("user_profiles")
        .upsert({
          user_id: authUser.id,
          real_name: realName.trim(),
          phone: phone.trim(),
          user_type: userType,
          user_type_other: userType === "other" ? userTypeOther.trim() : null,
          school_name: userType === "teacher" ? schoolName.trim() : null,
          organization: organization.trim() || null,
        });

      if (profileErr) {
        console.error("프로필 저장 실패:", profileErr);
        setError("프로필 저장에 실패했습니다: " + profileErr.message);
        setLoading(false);
        return;
      }

      // 3. 코드 등록 (기존 redeem-code API)
      const code = digits.join("");
      const res = await fetch("/api/coach/redeem-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${userToken}`,
        },
        body: JSON.stringify({ code, userId: authUser?.id }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || "등록에 실패했습니다.");
        setLoading(false);
        return;
      }

      onSuccess?.(data.credential);
    } catch (e) {
      console.error("[CoachCodeModal] 등록 실패:", e);
      setError("서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setLoading(false);
    }
  };

  // ─── UI 렌더링 ───
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 20,
    }} onClick={onClose}>
      <div style={{
        width: "100%", maxWidth: 480, background: "#111118",
        borderRadius: 16, border: "1px solid #27272a", padding: 28,
        maxHeight: "90vh", overflowY: "auto",
      }} onClick={(e) => e.stopPropagation()}>
        
        {/* 헤더 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{
              padding: "2px 8px", borderRadius: 6,
              background: "#fbbf24", color: "#000",
              fontSize: 10, fontWeight: 900,
            }}>🔑 ACTIVATION CODE</span>
            {step === 2 && (
              <span style={{ fontSize: 10, color: "#71717a" }}>
                Step 2 / 2
              </span>
            )}
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: "#fafafa", margin: "4px 0" }}>
            🎓 코칭딜러 등록
          </h2>
          <p style={{ fontSize: 12, color: "#a1a1aa", margin: 0 }}>
            {step === 1 
              ? "Admin으로부터 받으신 6자리 코드를 입력해주세요."
              : "코칭딜러 자격 등록을 위한 정보를 입력해주세요."}
          </p>
        </div>

        {/* Step 1: 코드 입력 */}
        {step === 1 && (
          <>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16 }}>
              {digits.map((d, idx) => (
                <input
                  key={idx}
                  ref={(el) => (inputRefs.current[idx] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={(e) => handleChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  onPaste={idx === 0 ? handlePaste : undefined}
                  style={{
                    width: 44, height: 56,
                    fontSize: 24, fontWeight: 900,
                    textAlign: "center",
                    border: "2px solid #fbbf24",
                    borderRadius: 8,
                    background: "#0a0a0f",
                    color: "#fafafa",
                    outline: "none",
                  }}
                />
              ))}
            </div>

            {error && (
              <div style={{
                padding: 10, marginBottom: 14,
                borderRadius: 6, background: "#7f1d1d40",
                border: "1px solid #dc262660",
                fontSize: 12, color: "#fca5a5",
              }}>
                ❌ {error}
              </div>
            )}
          </>
        )}

        {/* Step 2: 추가 정보 */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* 실명 */}
            <div>
              <label style={{ fontSize: 11, color: "#a1a1aa", marginBottom: 4, display: "block" }}>
                실명 <span style={{ color: "#f87171" }}>*</span>
              </label>
              <input
                type="text"
                value={realName}
                onChange={(e) => setRealName(e.target.value)}
                placeholder="홍길동"
                style={inputStyle}
              />
            </div>

            {/* 연락처 */}
            <div>
              <label style={{ fontSize: 11, color: "#a1a1aa", marginBottom: 4, display: "block" }}>
                연락처 <span style={{ color: "#f87171" }}>*</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="010-1234-5678"
                style={inputStyle}
              />
            </div>

            {/* 사용자 유형 - 드롭다운 */}
            <div>
              <label style={{ fontSize: 11, color: "#a1a1aa", marginBottom: 6, display: "block" }}>
                소속을 선택해주세요. <span style={{ color: "#f87171" }}>*</span>
              </label>
              <select
                value={userType}
                onChange={(e) => setUserType(e.target.value)}
                style={{
                  ...inputStyle,
                  cursor: "pointer",
                  appearance: "none",
                  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 10px center",
                  paddingRight: 30,
                }}
              >
                <option value="">선택하세요</option>
                <option value="general">일반</option>
                <option value="teacher">교사 (초·중·고)</option>
                <option value="institution">기관</option>
                <option value="company">기업</option>
                <option value="other">기타</option>
              </select>

              {/* 선택한 유형 설명 */}
              {userType && (
                <div style={{ 
                  fontSize: 11, 
                  color: "#a1a1aa", 
                  marginTop: 6,
                  padding: "4px 0",
                }}>
                  💡 {getUserTypeDesc(userType)}
                </div>
              )}

              {/* 교사 선택 시 학교명 */}
              {userType === "teacher" && (
                <input
                  type="text"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="학교명 입력 (예: 서울○○고등학교)"
                  style={{ ...inputStyle, marginTop: 8 }}
                />
              )}

              {/* 기타 선택 시 입력란 */}
              {userType === "other" && (
                <input
                  type="text"
                  value={userTypeOther}
                  onChange={(e) => setUserTypeOther(e.target.value)}
                  placeholder="유형을 입력해주세요"
                  style={{ ...inputStyle, marginTop: 8 }}
                />
              )}
            </div>

            {/* 소속/메모 */}
            <div>
              <label style={{ fontSize: 11, color: "#a1a1aa", marginBottom: 4, display: "block" }}>
                소속/메모 <span style={{ color: "#71717a" }}>(선택)</span>
              </label>
              <textarea
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="예) ○○고등학교 경제 담당 / △△그룹 HR팀 / 교육 도입 검토 중"
                rows={2}
                style={{
                  ...inputStyle,
                  resize: "vertical",
                  minHeight: 50,
                }}
              />
            </div>

            {error && (
              <div style={{
                padding: 10, borderRadius: 6,
                background: "#7f1d1d40",
                border: "1px solid #dc262660",
                fontSize: 12, color: "#fca5a5",
              }}>
                ❌ {error}
              </div>
            )}
          </div>
        )}

        {/* 버튼 영역 */}
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          {step === 2 && (
            <button
              onClick={() => { setStep(1); setError(""); }}
              disabled={loading}
              style={{
                padding: "12px 18px",
                borderRadius: 10,
                border: "1px solid #27272a",
                background: "transparent",
                color: "#a1a1aa",
                fontSize: 13, fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              ← 뒤로
            </button>
          )}

          <button
            onClick={onClose}
            disabled={loading}
            style={{
              flex: step === 1 ? 1 : 0,
              padding: "12px 18px",
              borderRadius: 10,
              border: "1px solid #27272a",
              background: "transparent",
              color: "#a1a1aa",
              fontSize: 13, fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            취소
          </button>
          
          <button
            onClick={step === 1 ? handleNextStep : handleSubmit}
            disabled={loading}
            style={{
              flex: 2,
              padding: "12px 18px",
              borderRadius: 10,
              border: "none",
              background: loading 
                ? "#52525b" 
                : "linear-gradient(135deg, #fbbf24, #f59e0b)",
              color: loading ? "#a1a1aa" : "#000",
              fontSize: 14, fontWeight: 900,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "등록 중..." : (step === 1 ? "다음 →" : "🎓 등록하기")}
          </button>
        </div>

        {/* 안내 */}
        <div style={{
          marginTop: 18,
          padding: 12,
          borderRadius: 8,
          background: "#0a0a0f",
          border: "1px solid #27272a",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 10, color: "#71717a" }}>
              💡 코드는 Admin이 회원님의 이메일로 발급합니다.
            </div>
            <div style={{ fontSize: 10, color: "#71717a" }}>
              📧 이메일이 일치하지 않으면 등록되지 않습니다.
            </div>
            <div style={{ fontSize: 10, color: "#71717a" }}>
              ⏱️ 코드는 발급 후 30일간 유효합니다.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 공통 input 스타일 ───
const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #27272a",
  background: "#0a0a0f",
  color: "#fafafa",
  fontSize: 13,
  outline: "none",
  fontFamily: "inherit",
};

// ─── 유형별 설명 ───
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
