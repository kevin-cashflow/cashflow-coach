"use client";

import { useState, useEffect } from "react";

/**
 * 비밀번호 입력 팝업 (Phase B)
 *
 * Props:
 * - gateType: "contest" | "debrief"
 * - onSuccess: 비밀번호 검증 성공 시 호출
 * - onCancel: 취소 시 호출
 */
export default function GatePasswordDialog({ gateType, onSuccess, onCancel }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const titles = {
    contest: "🏆 대회 모드 참가",
    debrief: "📊 AI 분석 기능 잠금 해제",
  };

  const descriptions = {
    contest: "대회 모드에 참가하려면 비밀번호를 입력해주세요.\n담당 코칭딜러에게 받으실 수 있습니다.",
    debrief: "AI 디브리핑 기능을 이용하려면 비밀번호를 입력해주세요.\n담당 코칭딜러에게 받으실 수 있습니다.",
  };

  const handleSubmit = async () => {
    setError("");
    if (!password.trim()) {
      setError("비밀번호를 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/verify-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gateType, password }),
      });
      const data = await res.json();

      if (data.success) {
        onSuccess?.();
      } else {
        setError(data.error || "비밀번호가 일치하지 않습니다.");
      }
    } catch (e) {
      console.error("게이트 검증 실패:", e);
      setError("서버 연결 실패. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !loading) handleSubmit();
    if (e.key === "Escape") onCancel?.();
  };

  useEffect(() => {
    const onEsc = (e) => {
      if (e.key === "Escape") onCancel?.();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onCancel]);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel?.();
      }}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
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
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: gateType === "contest" ? "#dc2626" : "#f59e0b",
            letterSpacing: 2,
            marginBottom: 6,
          }}
        >
          🔒 LOCKED
        </div>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 900,
            color: "#fafafa",
            margin: "0 0 12px 0",
          }}
        >
          {titles[gateType]}
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "#a1a1aa",
            lineHeight: 1.6,
            marginBottom: 20,
            whiteSpace: "pre-line",
          }}
        >
          {descriptions[gateType]}
        </p>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, color: "#a1a1aa", display: "block", marginBottom: 6 }}>
            비밀번호
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            placeholder="비밀번호 입력"
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 8,
              border: "1px solid #27272a",
              background: "#0a0a0f",
              color: "#fafafa",
              fontSize: 14,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {error && (
          <div
            style={{
              padding: 10,
              borderRadius: 8,
              background: "#7f1d1d30",
              border: "1px solid #dc262650",
              color: "#fca5a5",
              fontSize: 12,
              marginBottom: 14,
            }}
          >
            ❌ {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onCancel}
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
            disabled={loading}
            style={{
              flex: 2,
              padding: "12px",
              borderRadius: 8,
              border: "none",
              background: loading
                ? "#52525b"
                : gateType === "contest"
                ? "#dc2626"
                : "#f59e0b",
              color: "#fff",
              fontSize: 13,
              fontWeight: 800,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "확인 중..." : "잠금 해제"}
          </button>
        </div>

        <div
          style={{
            marginTop: 16,
            padding: 10,
            borderRadius: 6,
            background: "#18181b",
            fontSize: 10,
            color: "#71717a",
            lineHeight: 1.5,
          }}
        >
          💡 한 번 입력하면 로그아웃 전까지 다시 입력하지 않아도 됩니다.
        </div>
      </div>
    </div>
  );
}
