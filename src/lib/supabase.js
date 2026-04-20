"use client";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Supabase 클라이언트 (Phase B Day 2 - v2)
 *
 * 개선사항:
 * - 자동 토큰 갱신 (기본값이지만 명시)
 * - 세션 유지 설정
 * - 5분마다 주기적 세션 상태 체크
 * - 세션 없으면 자동 refresh 시도
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

// ─── 주기적 세션 유지 (토큰 만료 방지) ───
if (typeof window !== "undefined") {
  let sessionCheckInterval = null;
  
  const checkAndRefreshSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        // 세션 없음 → refresh 시도
        console.log("[supabase] 세션 없음 감지, refresh 시도");
        const { data: refreshed, error } = await supabase.auth.refreshSession();
        if (error) {
          console.warn("[supabase] 세션 refresh 실패:", error.message);
        } else if (refreshed?.session) {
          console.log("[supabase] 세션 refresh 성공");
        }
        return;
      }
      
      // 세션이 곧 만료될 예정이면 (1시간 이내) refresh
      const expiresAt = session.expires_at ? session.expires_at * 1000 : null;
      if (expiresAt) {
        const remainingMs = expiresAt - Date.now();
        if (remainingMs < 10 * 60 * 1000) { // 10분 이내 만료 예정
          console.log(`[supabase] 세션 만료 임박 (${Math.round(remainingMs/1000)}초), refresh`);
          await supabase.auth.refreshSession();
        }
      }
    } catch (e) {
      console.warn("[supabase] 세션 체크 에러:", e);
    }
  };
  
  // 5분마다 체크
  sessionCheckInterval = setInterval(checkAndRefreshSession, 5 * 60 * 1000);
  
  // 페이지 포커스 시에도 체크 (사용자가 탭으로 돌아올 때)
  window.addEventListener("focus", checkAndRefreshSession);
  
  // 페이지 로드 30초 후 최초 체크
  setTimeout(checkAndRefreshSession, 30 * 1000);
}
