"use client";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Supabase 클라이언트 (Phase B Day 3 - v4)
 *
 * v4 핵심 개선 (근본 대책):
 * - 앱 시작 시 토큰 검증 (옛 세션 자동 감지)
 * - 토큰 꼬임 → 자동 localStorage 정리 → 새로고침
 * - 사용자가 F12 명령어 입력 안 해도 자동 복구
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: "cashflow-auth",
    flowType: "pkce",
  },
});

// ─── 공용 유틸 ───
function cleanupAuthStorage() {
  if (typeof window === "undefined") return;
  try {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (
        key.includes("supabase") ||
        key.includes("cashflow-auth") ||
        key.startsWith("sb-")
      ) {
        localStorage.removeItem(key);
      }
    });
    console.log("[supabase] localStorage 정리 완료");
  } catch (e) {
    console.warn("[supabase] localStorage 정리 실패:", e);
  }
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 타임아웃 (${ms}ms)`)), ms)
    ),
  ]);
}

// ─── 브라우저 환경에서만 실행 ───
if (typeof window !== "undefined") {
  let sessionExpiredHandled = false;
  let appInitialized = false;

  // ═══════════════════════════════════════════
  // 🛡️ 앱 시작 즉시 토큰 검증 (근본 대책!)
  // ═══════════════════════════════════════════
  const validateTokenOnStartup = async () => {
    if (appInitialized) return;
    appInitialized = true;

    try {
      // localStorage에 토큰이 있는지 먼저 체크 (빠름)
      const hasAuthData = Object.keys(localStorage).some(
        (key) =>
          key.includes("supabase") ||
          key.includes("cashflow-auth") ||
          key.startsWith("sb-")
      );

      if (!hasAuthData) {
        // 토큰 자체가 없으면 (로그아웃 상태) 검증 불필요
        return;
      }

      console.log("[supabase] 앱 시작 - 저장된 토큰 검증 중...");

      // 3초 안에 getUser 응답 없으면 토큰 꼬임으로 판단
      const { data, error } = await withTimeout(
        supabase.auth.getUser(),
        3000,
        "getUser 초기검증"
      );

      if (error) {
        console.warn("[supabase] 토큰 검증 실패:", error.message);
        // 에러가 "invalid" 또는 "expired" 관련이면 정리
        const msg = (error.message || "").toLowerCase();
        if (
          msg.includes("invalid") ||
          msg.includes("expired") ||
          msg.includes("jwt") ||
          msg.includes("refresh")
        ) {
          console.warn("[supabase] 토큰 오염 감지 - 자동 정리");
          cleanupAuthStorage();
          setTimeout(() => window.location.reload(), 500);
          return;
        }
      } else if (data?.user) {
        console.log("[supabase] 토큰 검증 성공:", data.user.email);
      }
    } catch (e) {
      console.warn("[supabase] 토큰 검증 타임아웃 - 자동 정리:", e.message);
      // 타임아웃 = 토큰 꼬임 가능성 높음
      cleanupAuthStorage();
      setTimeout(() => window.location.reload(), 500);
    }
  };

  // 앱 시작 즉시 실행
  validateTokenOnStartup();

  // ═══════════════════════════════════════════
  // 세션 만료 감지 & 자동 처리 (기존 v3 기능)
  // ═══════════════════════════════════════════
  const cleanupAndRedirect = () => {
    if (sessionExpiredHandled) return;
    sessionExpiredHandled = true;

    console.warn("[supabase] 세션 만료 - 자동 정리 후 로그인 화면으로");
    cleanupAuthStorage();

    setTimeout(() => {
      try {
        window.location.reload();
      } catch {}
    }, 500);
  };

  const checkAndRefreshSession = async () => {
    try {
      const { data: { session } } = await withTimeout(
        supabase.auth.getSession(),
        5000,
        "getSession"
      );

      if (!session) {
        console.log("[supabase] 세션 없음, refresh 시도");
        try {
          const { data: refreshed, error } = await withTimeout(
            supabase.auth.refreshSession(),
            5000,
            "refresh"
          );

          if (error || !refreshed?.session) {
            console.warn("[supabase] refresh 실패:", error?.message);
            const hasAppContent =
              document.body.innerText.includes("로그아웃") ||
              document.body.innerText.includes("로딩 중");
            if (hasAppContent) {
              cleanupAndRedirect();
            }
            return;
          }

          console.log("[supabase] 세션 refresh 성공");
          sessionExpiredHandled = false;
        } catch (e) {
          console.warn("[supabase] refresh 예외:", e.message);
          const hasAppContent = document.body.innerText.includes("로딩 중");
          if (hasAppContent) {
            cleanupAndRedirect();
          }
        }
        return;
      }

      // 세션이 곧 만료될 예정이면 (10분 이내) refresh
      const expiresAt = session.expires_at ? session.expires_at * 1000 : null;
      if (expiresAt) {
        const remainingMs = expiresAt - Date.now();
        if (remainingMs < 10 * 60 * 1000) {
          console.log(
            `[supabase] 세션 만료 임박 (${Math.round(remainingMs / 1000)}초), refresh`
          );
          try {
            const { error } = await withTimeout(
              supabase.auth.refreshSession(),
              5000,
              "refresh-expiring"
            );
            if (!error) sessionExpiredHandled = false;
          } catch {}
        }
      }
    } catch (e) {
      console.warn("[supabase] 세션 체크 에러:", e.message);
    }
  };

  // 5분마다 주기적 체크
  setInterval(checkAndRefreshSession, 5 * 60 * 1000);

  // 페이지 포커스 시에도 체크
  window.addEventListener("focus", checkAndRefreshSession);
}
