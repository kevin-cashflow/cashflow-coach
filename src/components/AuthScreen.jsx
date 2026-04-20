"use client";

import { useState } from "react";
import { signIn, signUp } from "@/lib/auth";

/**
 * 로그인 / 회원가입 / 게스트 선택 화면
 *
 * Props:
 * - onGuestMode: 게스트로 진행 시 호출
 * - onAuthSuccess: 로그인/가입 성공 시 호출
 */
export default function AuthScreen({ onGuestMode, onAuthSuccess }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const handleSubmit = async () => {
    setError("");
    setInfo("");

    // 기본 유효성 검사
    if (!email || !password) {
      setError("이메일과 비밀번호를 입력해주세요.");
      return;
    }
    if (password.length < 6) {
      setError("비밀번호는 최소 6자 이상이어야 합니다.");
      return;
    }
    if (mode === "signup" && !displayName.trim()) {
      setError("닉네임을 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        await signUp({ email, password, displayName });
        setInfo("가입이 완료되었습니다! 자동으로 로그인됩니다.");
        // 회원가입 직후 자동 로그인 (Confirm email OFF 상태 기준)
        await signIn({ email, password });
      } else {
        await signIn({ email, password });
      }
      onAuthSuccess?.();
    } catch (e) {
      console.error("Auth error:", e);
      const msg = e.message || "";
      if (msg.includes("Invalid login credentials")) {
        setError("이메일 또는 비밀번호가 일치하지 않습니다.");
      } else if (msg.includes("already registered") || msg.includes("User already")) {
        setError("이미 가입된 이메일입니다. 로그인을 시도해주세요.");
      } else if (msg.includes("Email not confirmed")) {
        setError("이메일 인증이 필요합니다. 메일함을 확인해주세요.");
      } else if (msg.includes("weak password") || msg.includes("Password should")) {
        setError("비밀번호가 너무 약합니다. 6자 이상 입력해주세요.");
      } else {
        setError(msg || "오류가 발생했습니다. 다시 시도해주세요.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !loading) handleSubmit();
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0f",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
    }}>
      <div style={{
        width: "100%",
        maxWidth: 420,
        background: "#111118",
        borderRadius: 16,
        padding: 32,
        border: "1px solid #27272a",
      }}>
        {/* 로고/타이틀 */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#f59e0b",
            letterSpacing: 2,
            marginBottom: 4,
            padding: "4px 10px",
            background: "#f59e0b20",
            borderRadius: 6,
            display: "inline-block",
          }}>
            COACHING SIMULATOR
          </div>
          <div style={{
            fontSize: 22,
            fontWeight: 900,
            color: "#fafafa",
            marginTop: 8,
          }}>
            캐쉬플로우 코칭
          </div>
          <div style={{ fontSize: 11, color: "#71717a", marginTop: 4 }}>
            로버트 기요사키 공식 한국 파트너
          </div>
        </div>

        {/* 탭 전환 */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          <button
            onClick={() => { setMode("login"); setError(""); setInfo(""); }}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              background: mode === "login" ? "#f59e0b" : "#18181b",
              color: mode === "login" ? "#000" : "#a1a1aa",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            로그인
          </button>
          <button
            onClick={() => { setMode("signup"); setError(""); setInfo(""); }}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              background: mode === "signup" ? "#f59e0b" : "#18181b",
              color: mode === "signup" ? "#000" : "#a1a1aa",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            회원가입
          </button>
        </div>

        {/* 닉네임 (회원가입만) */}
        {mode === "signup" && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: "#a1a1aa", marginBottom: 4, display: "block" }}>
              닉네임
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="랭킹에 표시될 이름"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #27272a",
                background: "#0a0a0f",
                color: "#fafafa",
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        )}

        {/* 이메일 */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: "#a1a1aa", marginBottom: 4, display: "block" }}>
            이메일
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="you@example.com"
            autoComplete="email"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #27272a",
              background: "#0a0a0f",
              color: "#fafafa",
              fontSize: 13,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* 비밀번호 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: "#a1a1aa", marginBottom: 4, display: "block" }}>
            비밀번호 (6자 이상)
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="••••••••"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #27272a",
              background: "#0a0a0f",
              color: "#fafafa",
              fontSize: 13,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* 에러/안내 메시지 */}
        {error && (
          <div style={{
            padding: 10,
            borderRadius: 8,
            background: "#7f1d1d30",
            border: "1px solid #dc262650",
            color: "#fca5a5",
            fontSize: 12,
            marginBottom: 12,
          }}>
            {error}
          </div>
        )}
        {info && (
          <div style={{
            padding: 10,
            borderRadius: 8,
            background: "#14532d30",
            border: "1px solid #16a34a50",
            color: "#86efac",
            fontSize: 12,
            marginBottom: 12,
          }}>
            {info}
          </div>
        )}

        {/* 메인 버튼 */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: 8,
            border: "none",
            background: loading ? "#52525b" : "#f59e0b",
            color: "#000",
            fontSize: 14,
            fontWeight: 800,
            cursor: loading ? "not-allowed" : "pointer",
            marginBottom: 12,
          }}
        >
          {loading ? "처리 중..." : mode === "signup" ? "가입하고 시작" : "로그인"}
        </button>

        {/* 구분선 */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          margin: "16px 0",
        }}>
          <div style={{ flex: 1, height: 1, background: "#27272a" }}></div>
          <span style={{ fontSize: 10, color: "#52525b" }}>또는</span>
          <div style={{ flex: 1, height: 1, background: "#27272a" }}></div>
        </div>

        {/* 게스트 모드 */}
        <button
          onClick={() => onGuestMode?.()}
          style={{
            width: "100%",
            padding: "10px",
            borderRadius: 8,
            border: "1px solid #27272a",
            background: "transparent",
            color: "#a1a1aa",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          🎲 게스트로 체험하기 (시뮬레이션만)
        </button>

        {/* 안내 문구 */}
        <div style={{
          marginTop: 16,
          padding: 10,
          borderRadius: 6,
          background: "#18181b",
          fontSize: 10,
          color: "#71717a",
          lineHeight: 1.5,
        }}>
          💡 게스트 모드는 시뮬레이션만 체험 가능하며 기록이 저장되지 않습니다.
          플레이/대회 모드와 랭킹 참여를 위해서는 회원가입해주세요.
        </div>
      </div>
    </div>
  );
}