"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";

/**
 * 🔑 코칭딜러 코드 입력 모달 (Phase B Day 2)
 *
 * 6자리 숫자를 입력받아 API로 검증 후 자격 등록
 *
 * Props:
 * - authUser: 로그인 사용자
 * - onSuccess: 등록 성공 시 콜백 (credential 전달)
 * - onClose: 닫기 콜백
 */
export default function CoachCodeModal({ authUser, onSuccess, onClose }) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRefs = useRef([]);

  useEffect(() => {
    // 첫 번째 입력창에 자동 포커스
    inputRefs.current[0]?.focus();
    
    // ESC 키로 닫기
    const onEsc = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  const handleChange = (idx, value) => {
    // 숫자만 허용
    const cleanValue = value.replace(/\D/g, "").slice(0, 1);
    const newDigits = [...digits];
    newDigits[idx] = cleanValue;
    setDigits(newDigits);
    setError("");

    // 다음 입력창으로 자동 이동
    if (cleanValue && idx < 5) {
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handleKeyDown = (idx, e) => {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      // 빈 상태에서 백스페이스 → 이전 칸으로
      inputRefs.current[idx - 1]?.focus();
    }
    if (e.key === "Enter") {
      handleSubmit();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const newDigits = pasted.split("").concat(Array(6).fill("")).slice(0, 6);
    setDigits(newDigits);
    // 마지막으로 입력된 칸 다음으로 포커스
    const nextIdx = Math.min(pasted.length, 5);
    inputRefs.current[nextIdx]?.focus();
  };

  const handleSubmit = async () => {
    const code = digits.join("");
    if (code.length !== 6) {
      setError("6자리 숫자를 모두 입력해주세요.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // 사용자 세션 토큰 가져오기
      const { data: { session } } = await supabase.auth.getSession();
      const userToken = session?.access_token;
      
      if (!userToken) {
        setError("로그인 세션이 만료되었습니다. 다시 로그인해주세요.");
        setLoading(false);
        return;
      }
      
      const res = await fetch("/api/coach/redeem-code", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          code,
          userId: authUser?.id,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || "등록에 실패했습니다.");
        setLoading(false);
        return;
      }

      // 성공!
      onSuccess?.(data.credential);
    } catch (e) {
      console.error("[CoachCodeModal] 등록 실패:", e);
      setError("서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setLoading(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0, 0, 0, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 20,
      }}
    >
      <div
        style={{
          background: "#111118",
          borderRadius: 16,
          padding: 28,
          maxWidth: 420,
          width: "100%",
          border: "1px solid #27272a",
        }}
      >
        <div style={{
          fontSize: 11,
          fontWeight: 800,
          color: "#FFD700",
          letterSpacing: 2,
          marginBottom: 6,
        }}>
          🔑 ACTIVATION CODE
        </div>
        <h2 style={{
          fontSize: 20,
          fontWeight: 900,
          color: "#fafafa",
          margin: "0 0 10px 0",
        }}>
          🎓 코칭딜러 등록
        </h2>
        <p style={{
          fontSize: 12,
          color: "#a1a1aa",
          lineHeight: 1.6,
          marginBottom: 24,
        }}>
          Admin으로부터 받으신 6자리 코드를 입력해주세요.
        </p>

        {/* 6자리 입력창 */}
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
              disabled={loading}
              style={{
                width: 42,
                height: 52,
                textAlign: "center",
                fontSize: 24,
                fontWeight: 800,
                borderRadius: 8,
                border: `2px solid ${d ? "#FFD700" : "#27272a"}`,
                background: "#0a0a0f",
                color: "#fafafa",
                outline: "none",
                transition: "border 0.2s",
              }}
            />
          ))}
        </div>

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
            ❌ {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: 8,
              border: "1px solid #27272a",
              background: "transparent",
              color: "#a1a1aa",
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || digits.join("").length !== 6}
            style={{
              flex: 2,
              padding: "12px",
              borderRadius: 8,
              border: "none",
              background: loading ? "#52525b" : "linear-gradient(135deg, #eab308, #f59e0b)",
              color: "#000",
              fontSize: 13,
              fontWeight: 800,
              cursor: loading || digits.join("").length !== 6 ? "not-allowed" : "pointer",
              opacity: digits.join("").length !== 6 ? 0.5 : 1,
            }}
          >
            {loading ? "확인 중..." : "등록하기"}
          </button>
        </div>

        <div style={{
          marginTop: 16,
          padding: 10,
          borderRadius: 6,
          background: "#18181b",
          fontSize: 10,
          color: "#71717a",
          lineHeight: 1.6,
        }}>
          💡 코드는 Admin이 회원님의 이메일로 발급합니다.<br/>
          📧 이메일이 일치하지 않으면 등록되지 않습니다.<br/>
          ⏰ 코드는 발급 후 30일간 유효합니다.
        </div>
      </div>
    </div>
  );
}
