"use client";

import { supabase } from "./supabase";

/**
 * 🎮 진행 중 게임 자동 저장/복구 (Phase B Day 3 — v2 근본 해결)
 *
 * v2 변경사항 (2026-04):
 *  - 🛡️ 모든 Supabase 호출에 타임아웃 (4~6초) — 무한 대기 차단
 *  - ⏱️ 디바운스 2초 → 5초로 완화 — Pooler 락 발생 빈도 감소
 *  - 🚫 자동 저장이 storage.js의 set과 별개로 동작 (락 분리)
 *
 * 이중 백업 구조:
 * 1. localStorage: 즉시 저장, 오프라인에서도 작동
 * 2. Supabase game_sessions: 영구 백업, 기기 간 동기화
 *
 * 매 턴 종료 시 saveGameSession 호출
 * 게임 시작 시 loadGameSession 호출
 * 게임 완료 시 deleteGameSession 호출
 */

const LOCAL_KEY = "cashflow_game_session";
const DEBOUNCE_MS = 5000;          // 🆕 2초 → 5초 (Pooler 락 빈도 감소)
//
// 🔧 v4.2 콜드 스타트 대응 (2026-04):
//   기존: 쓰기 6초, 읽기 3초 → 무료 티어 콜드 스타트 시 모두 타임아웃
//   수정: 쓰기 12초, 읽기 8초로 늘림 (워밍업 후엔 어차피 빠름)
const SB_WRITE_TIMEOUT = 12000;    // Supabase 쓰기 타임아웃 (6초 → 12초)
const SB_READ_TIMEOUT = 8000;      // Supabase 읽기 타임아웃 (3초 → 8초)

let supabaseDebounceTimer = null;
let lastSupabaseState = null;

// ─── 타임아웃 헬퍼 ───
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} 타임아웃 (${ms}ms)`)), ms)),
  ]);
}

// ─── 로컬 저장 (즉시) ───
function saveToLocal(gameState) {
  try {
    const data = {
      ...gameState,
      savedAt: Date.now(),
    };
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn("[gameSession] localStorage 저장 실패:", e);
    return false;
  }
}

// ─── 로컬에서 불러오기 ───
export function loadFromLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("[gameSession] localStorage 로드 실패:", e);
    return null;
  }
}

// ─── 로컬 정리 ───
export function clearLocal() {
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {}
}

// ─── Supabase 저장 (디바운스 + 타임아웃) ───
async function saveToSupabaseDebounced(userId, sessionId, gameState, metadata) {
  if (supabaseDebounceTimer) clearTimeout(supabaseDebounceTimer);

  supabaseDebounceTimer = setTimeout(async () => {
    try {
      const { error } = await withTimeout(
        supabase
          .from("game_sessions")
          .upsert({
            user_id: userId,
            session_id: sessionId,
            game_state: gameState,
            is_contest: metadata.isContest || false,
            job: metadata.job || null,
            turn_count: metadata.turnCount || 0,
            last_updated: new Date().toISOString(),
          }),
        SB_WRITE_TIMEOUT,
        "game_sessions.upsert"
      );

      if (error) {
        console.warn("[gameSession] Supabase 저장 실패:", error.message);
      } else {
        lastSupabaseState = gameState;
      }
    } catch (e) {
      console.warn("[gameSession] Supabase 저장 타임아웃/예외:", e?.message);
    }
  }, DEBOUNCE_MS);
}

// ─── Supabase 즉시 저장 (디바운스 우회 + 타임아웃) ───
async function saveToSupabaseImmediate(userId, sessionId, gameState, metadata) {
  if (supabaseDebounceTimer) {
    clearTimeout(supabaseDebounceTimer);
    supabaseDebounceTimer = null;
  }

  try {
    const { error } = await withTimeout(
      supabase
        .from("game_sessions")
        .upsert({
          user_id: userId,
          session_id: sessionId,
          game_state: gameState,
          is_contest: metadata.isContest || false,
          job: metadata.job || null,
          turn_count: metadata.turnCount || 0,
          last_updated: new Date().toISOString(),
        }),
      SB_WRITE_TIMEOUT,
      "game_sessions.upsert.immediate"
    );

    if (error) {
      console.warn("[gameSession] Supabase 즉시 저장 실패:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[gameSession] Supabase 즉시 저장 타임아웃/예외:", e?.message);
    return false;
  }
}

// ─── 공개 API: 자동 저장 ───
export async function saveGameSession(userId, sessionId, gameState, metadata = {}) {
  // 1. 로컬 즉시 저장 (항상 성공)
  const localOk = saveToLocal({
    session_id: sessionId,
    user_id: userId,
    game_state: gameState,
    ...metadata,
  });

  // 2. Supabase 디바운스 저장 (로그인되어 있을 때만)
  if (userId) {
    saveToSupabaseDebounced(userId, sessionId, gameState, metadata);
  }

  return localOk;
}

// ─── 공개 API: Supabase 강제 저장 (페이지 나갈 때 등) ───
export async function saveGameSessionImmediate(userId, sessionId, gameState, metadata = {}) {
  saveToLocal({
    session_id: sessionId,
    user_id: userId,
    game_state: gameState,
    ...metadata,
  });

  if (userId) {
    return await saveToSupabaseImmediate(userId, sessionId, gameState, metadata);
  }
  return true;
}

// ─── 공개 API: 게임 세션 불러오기 ───
export async function loadGameSession(userId) {
  // 1. 로컬 먼저 시도 (빠름, 동기)
  const local = loadFromLocal();

  // 2. 로컬이 있으면 즉시 반환 (Supabase는 백그라운드로만)
  //    로컬 저장이 실시간이니 대부분 최신 상태
  if (local) {
    // 백그라운드로 Supabase 확인 (결과 안 기다림, 혹시 다른 기기 업데이트 있으면 다음에 반영)
    if (userId) {
      withTimeout(
        supabase
          .from("game_sessions")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle(),
        SB_READ_TIMEOUT,
        "game_sessions.select.bg"
      )
        .then((res) => {
          const data = res?.data;
          if (data && data.last_updated) {
            const remoteTime = new Date(data.last_updated).getTime();
            const localTime = local.savedAt || 0;
            if (remoteTime > localTime) {
              console.log("[gameSession] Supabase가 더 최신 - 다음 로드 시 반영");
            }
          }
        })
        .catch(() => {});
    }
    return local;
  }

  // 3. 로컬이 없을 때만 Supabase 시도 (3초 타임아웃)
  if (userId) {
    try {
      const { data } = await withTimeout(
        supabase
          .from("game_sessions")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle(),
        SB_READ_TIMEOUT,
        "game_sessions.select"
      );
      if (data) return data;
    } catch (e) {
      console.warn("[gameSession] Supabase 로드 실패:", e?.message);
    }
  }

  return null;
}

// ─── 공개 API: 세션 삭제 ───
//
// localStorage는 동기 즉시 삭제 (절대 실패 안 함).
// Supabase 삭제는 백그라운드로 fire-and-forget — 실패해도 다음 게임 시작 시
// upsert로 덮어쓰니 무방. await로 호출자 차단하지 않음.
export async function deleteGameSession(userId) {
  clearLocal();

  if (userId) {
    // 백그라운드로 던지기 — 실패/타임아웃이 나도 호출자 영향 없음
    (async () => {
      try {
        await withTimeout(
          supabase
            .from("game_sessions")
            .delete()
            .eq("user_id", userId),
          SB_WRITE_TIMEOUT,
          "game_sessions.delete"
        );
      } catch (e) {
        console.warn("[gameSession] Supabase 삭제 실패 (무시):", e?.message);
      }
    })();
  }
}

// ─── 공개 API: 세션 존재 여부 체크 (빠름) ───
export async function hasGameSession(userId) {
  // 로컬에 있으면 true
  if (loadFromLocal()) return true;

  // Supabase 확인 (타임아웃 보호)
  if (userId) {
    try {
      const { data } = await withTimeout(
        supabase
          .from("game_sessions")
          .select("user_id")
          .eq("user_id", userId)
          .maybeSingle(),
        SB_READ_TIMEOUT,
        "game_sessions.has"
      );
      return !!data;
    } catch {
      return false;
    }
  }

  return false;
}
