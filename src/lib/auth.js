"use client";

import { supabase } from "./supabase";

/**
 * 인증 관련 헬퍼 함수들
 * Supabase Auth 기반
 */

// ─── 회원가입 ───
export async function signUp({ email, password, displayName }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName || email.split("@")[0] },
    },
  });
  if (error) throw error;
  return data;
}

// ─── 로그인 ───
export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

// ─── 로그아웃 ───
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ─── 현재 사용자 조회 (자동 복구 포함) ───
export async function getCurrentUser() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
      // 토큰 만료/손상 시 자동 복구
      if (error.message?.includes("Refresh Token") ||
          error.message?.includes("Invalid") ||
          error.status === 400) {
        console.warn("토큰 만료 감지, 세션 초기화:", error.message);
        try { await supabase.auth.signOut(); } catch {}
        if (typeof window !== "undefined") {
          try { localStorage.clear(); sessionStorage.clear(); } catch {}
        }
        return null;
      }
      throw error;
    }
    return user;
  } catch (e) {
    console.error("getCurrentUser 실패:", e);
    // 예외 발생 시에도 안전하게 null 반환
    if (typeof window !== "undefined") {
      try { localStorage.clear(); sessionStorage.clear(); } catch {}
    }
    return null;
  }
}

// ─── 현재 사용자가 Admin인지 확인 ───
export async function isAdmin(userId) {
  if (!userId) return false;
  const { data, error } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("Admin check error:", error);
    return false;
  }
  return !!data;
}

// ─── 인증 상태 변화 감지 (구독) ───
export function onAuthStateChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      callback(event, session);
    }
  );
  return subscription;
}

// ─── 비밀번호 재설정 메일 발송 ───
export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
  });
  if (error) throw error;
}

// ─── 사용자 표시 이름 가져오기 ───
export function getDisplayName(user) {
  if (!user) return "게스트";
  return user.user_metadata?.display_name || user.email?.split("@")[0] || "사용자";
}