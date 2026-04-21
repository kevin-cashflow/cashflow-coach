"use client";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Supabase 클라이언트 (Phase B Day 3 - v3)
 *
 * 핵심 개선:
 * - 토큰 refresh 실패 시 자동 정리 + 로그인 화면으로
 * - "로딩 중..." 무한 대기 문제 해결
 * - 사용자 친화적 알림
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

// ─── 세션 만료 자동 처리 ───
if (typeof window !== "undefined") {
  let sessionExpiredHandled = false;
  
  const cleanupAndRedirect = () => {
    if (sessionExpiredHandled) return;
    sessionExpiredHandled = true;
    
    console.warn("[supabase] 세션 만료 - 자동 정리 후 로그인 화면으로");
    
    // localStorage에서 supabase 관련 모두 정리
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.includes('supabase') || key.includes('cashflow-auth') || key.includes('sb-')) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.warn("[supabase] localStorage 정리 실패:", e);
    }
    
    // 로그인이 필요한 페이지에 있으면 새로고침으로 자동 이동
    // (auth state가 변하면 React가 자동으로 로그인 화면 렌더링)
    setTimeout(() => {
      try {
        window.location.reload();
      } catch {}
    }, 500);
  };
  
  const checkAndRefreshSession = async () => {
    try {
      // getSession에 5초 타임아웃
      const sessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("getSession 타임아웃")), 5000)
      );
      
      const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);
      
      if (!session) {
        // 세션 없음 → refresh 시도 (5초 타임아웃)
        console.log("[supabase] 세션 없음, refresh 시도");
        try {
          const refreshPromise = supabase.auth.refreshSession();
          const refreshTimeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("refresh 타임아웃")), 5000)
          );
          
          const { data: refreshed, error } = await Promise.race([refreshPromise, refreshTimeout]);
          
          if (error || !refreshed?.session) {
            // refresh도 실패 → 진짜 세션 만료
            console.warn("[supabase] refresh 실패:", error?.message);
            
            // 로그인이 필요한 페이지에 있는 경우만 정리
            // (로그인 화면에서는 의미 없으므로)
            const hasAppContent = document.body.innerText.includes("로그아웃") ||
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
          // refresh가 멈추면 강제 정리
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
          console.log(`[supabase] 세션 만료 임박 (${Math.round(remainingMs/1000)}초), refresh`);
          try {
            const { error } = await supabase.auth.refreshSession();
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
  
  // 초기 페이지 로드 시 빠른 체크 (10초 후)
  // 너무 빠르면 React 마운트 전이라 효과 없음
  setTimeout(checkAndRefreshSession, 10 * 1000);
}
