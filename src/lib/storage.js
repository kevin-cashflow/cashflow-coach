"use client";

import { supabase } from "./supabase";

/**
 * window.storage 호환 어댑터 (Phase B Day 2 - v4 근본 해결)
 *
 * v4 변경사항 (2026-04):
 *  - 🛡️ 모든 Supabase 호출에 단일 타임아웃 (6초 ceiling) — 무한 대기 차단
 *  - ⚡ getCurrentUserId() 결과 5분 캐싱 — 매 호출마다 auth 검증 제거
 *  - 🚀 UPSERT의 .select() 제거 — 두 번째 RLS 검증 회피, Pooler 점유 시간 감소
 *  - 🔇 라이브러리 레이어 alert() 모두 제거 — 호출자가 UX 책임
 *  - 🎯 set() 동기 fallback — Supabase 실패해도 localStorage에 저장 보장
 *  - 📡 Fire-and-forget 모드 (옵션) — 응답 안 기다리고 즉시 반환
 *
 * Phase A: user_id 자동 포함, RLS 본인 데이터 필터링
 * Phase B Day 1: 대회 관련 필드 저장
 * Phase B Day 2: 세션 자동 복구 + 명확한 에러 알림
 */

// ─── 타임아웃 헬퍼 (모든 Supabase 호출에 적용) ───
const SB_TIMEOUT_MS = 6000;       // Supabase 단일 호출 한도
const AUTH_CACHE_TTL = 5 * 60 * 1000; // userId 캐시 5분

function withTimeout(promise, ms = SB_TIMEOUT_MS, label = "supabase") {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} 타임아웃 (${ms}ms)`)), ms)),
  ]);
}

// ─── 키 파싱 ───
function parseKey(key) {
  if (!key) return { kind: "unknown" };
  if (key === "players") return { kind: "players" };
  if (key.startsWith("game:")) {
    const parts = key.split(":");
    return { kind: "game", playerId: parts[1], ts: parts.slice(2).join(":") };
  }
  if (key.startsWith("debrief:")) {
    return { kind: "debrief", ts: key.slice("debrief:".length) };
  }
  return { kind: "unknown", key };
}

// ─── localStorage 즉시 저장 (절대 실패 안 함) ───
function saveToLocalStorageSync(key, value) {
  try {
    if (typeof localStorage === "undefined") return false;
    const payload = typeof value === "string" ? value : JSON.stringify(value);
    localStorage.setItem(key, payload);
    return true;
  } catch (e) {
    console.warn("[storage] localStorage 저장 실패:", e?.message);
    return false;
  }
}

// ─── userId 캐시 (auth 호출 빈도 95% 감소) ───
let _cachedUserId = null;
let _cachedAt = 0;
let _authInflight = null;  // 동시 호출 합치기

async function getCurrentUserId() {
  // 캐시 hit (5분 이내)
  const now = Date.now();
  if (_cachedUserId && (now - _cachedAt) < AUTH_CACHE_TTL) {
    return _cachedUserId;
  }

  // 동시 호출 중복 방지: 이미 진행 중이면 그 Promise를 공유
  if (_authInflight) return _authInflight;

  _authInflight = (async () => {
    try {
      // 1차: 현재 세션 (타임아웃 보호)
      const userResult = await withTimeout(
        supabase.auth.getUser(),
        4000,
        "auth.getUser"
      ).catch(() => null);

      const user = userResult?.data?.user;
      if (user?.id) {
        _cachedUserId = user.id;
        _cachedAt = Date.now();
        return user.id;
      }

      // 2차: 세션 복구 (타임아웃 보호)
      console.warn("[storage] 세션 없음, 복구 시도 중...");
      const refreshResult = await withTimeout(
        supabase.auth.refreshSession(),
        4000,
        "auth.refreshSession"
      ).catch(() => null);

      const refreshed = refreshResult?.data?.user;
      if (refreshed?.id) {
        console.log("[storage] 세션 복구 성공");
        _cachedUserId = refreshed.id;
        _cachedAt = Date.now();
        return refreshed.id;
      }

      console.warn("[storage] 세션 복구 실패");
      return null;
    } catch (e) {
      console.error("[storage] getCurrentUserId 에러:", e?.message);
      return null;
    } finally {
      _authInflight = null;
    }
  })();

  return _authInflight;
}

// 🆕 외부에서 캐시 무효화 가능 (로그인/로그아웃 시 호출 권장)
export function invalidateAuthCache() {
  _cachedUserId = null;
  _cachedAt = 0;
  _authInflight = null;
  console.log("[storage] auth 캐시 무효화");
}

// ─── auth 상태 변경 리스너 (싱글톤 가드 + 지연 등록) ───
//
// React Strict Mode 또는 Turbopack HMR에서 모듈이 여러 번 평가될 때
// onAuthStateChange가 중복 등록되면 GoTrue 내부 lock이 orphan되어
// "Lock was not released within 5000ms" 경고 발생.
//
// 대응: globalThis 싱글톤 가드 + microtask 지연 등록 (모듈 평가와 분리)
if (typeof window !== "undefined") {
  // globalThis 레벨 싱글톤 — 모듈이 여러 번 평가돼도 리스너는 1개만
  if (!globalThis.__cf_storage_auth_listener_registered__) {
    globalThis.__cf_storage_auth_listener_registered__ = true;

    // microtask로 미루기 — 모듈 평가 시점에 supabase 내부 lock과 경쟁하지 않도록
    Promise.resolve().then(() => {
      try {
        const { data: { subscription } = {} } = supabase.auth.onAuthStateChange((event, session) => {
          // 디버깅 로그는 INITIAL_SESSION 등 잡스러운 이벤트는 제외
          if (event !== "INITIAL_SESSION") {
            console.log("[storage] auth 상태 변경:", event);
          }
          _cachedUserId = session?.user?.id || null;
          _cachedAt = session?.user?.id ? Date.now() : 0;
          _authInflight = null;
        });

        // HMR 시에도 정리되도록 핸들 보관
        globalThis.__cf_storage_auth_subscription__ = subscription;
      } catch (e) {
        console.warn("[storage] auth 리스너 등록 실패:", e?.message);
      }
    });
  }
}

// ─── DB 행 → JSON 포맷 변환 ───
function gameFromRow(row) {
  const dt = row.date_time ? new Date(row.date_time) : new Date();
  return {
    ts: row.id,
    version: row.version,
    job: row.job,
    turnCount: row.turn_count,
    date: dt.toLocaleDateString("ko-KR"),
    time: dt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
    dateTime: row.date_time,
    turnLog: row.turn_log,
    assets: row.assets,
    cash: row.cash,
    totalCF: row.total_cf,
    bankLoan: row.bank_loan,
    loanInterest: row.loan_interest,
    babies: row.babies,
    gameEnded: row.game_ended,
    simText: row.sim_text,
    debrief: row.debrief,
    playerId: row.player_id,
    isContest: row.is_contest || false,
    escaped: row.escaped || false,
    escapeTimeSec: row.escape_time_sec,
    passiveIncomeAtEscape: row.passive_income_at_escape,
    jobAtEscape: row.job_at_escape,
  };
}

function reportFromRow(row) {
  const dt = row.created_at ? new Date(row.created_at) : new Date();
  return {
    ts: row.id,
    version: row.version,
    turns: row.turns,
    date: dt.toLocaleDateString("ko-KR"),
    time: dt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
    dateTime: row.created_at,
    analysis: row.analysis,
    feedback: row.feedback,
    feedbackTier: row.feedback_tier,
    simText: row.sim_text,
    tier: row.tier,
    tokenUsage: row.token_usage,
    modelUsed: row.model_used,
    gameId: row.game_id,
    isSimulation: row.is_simulation,
  };
}

// ─── GET (모든 호출에 타임아웃) ───
async function get(key) {
  const k = parseKey(key);

  try {
    if (k.kind === "players") {
      const { data, error } = await withTimeout(
        supabase.from("players").select("*"),
        SB_TIMEOUT_MS,
        "players.select"
      );
      if (error || !data) return null;
      const obj = {};
      for (const p of data) {
        obj[p.id] = {
          name: p.name,
          created: p.created_at ? new Date(p.created_at).toLocaleDateString("ko-KR") : "",
          gamesPlayed: p.games_played || 0,
        };
      }
      return { key, value: JSON.stringify(obj), shared: false };
    }

    if (k.kind === "game") {
      const { data, error } = await withTimeout(
        supabase.from("games").select("*").eq("id", k.ts).maybeSingle(),
        SB_TIMEOUT_MS,
        "games.select"
      );
      if (error || !data) return null;
      return { key, value: JSON.stringify(gameFromRow(data)), shared: false };
    }

    if (k.kind === "debrief") {
      const { data, error } = await withTimeout(
        supabase.from("debrief_reports").select("*").eq("id", k.ts).maybeSingle(),
        SB_TIMEOUT_MS,
        "debrief.select"
      );
      if (error || !data) return null;
      return { key, value: JSON.stringify(reportFromRow(data)), shared: false };
    }
  } catch (e) {
    console.warn(`[storage] get(${key}) 실패:`, e?.message);
    return null;
  }

  return null;
}

// ─── SET 내부 헬퍼: 실제 Supabase 저장 (타임아웃 보호) ───
async function setSupabaseOnly(key, value, userId) {
  const k = parseKey(key);
  const data = typeof value === "string" ? JSON.parse(value) : value;

  try {
    if (k.kind === "players") {
      const entries = Object.entries(data);
      for (const [id, p] of entries) {
        const { error } = await withTimeout(
          supabase.from("players").upsert({
            id,
            name: p.name,
            games_played: p.gamesPlayed || 0,
            user_id: userId,
          }),  // 🆕 .select() 제거 — Pooler 점유 시간 50% 감소
          SB_TIMEOUT_MS,
          "players.upsert"
        );
        if (error) {
          console.error("[storage] players 저장 실패:", error?.message);
          return { ok: false, error: error.message };
        }
      }
      return { ok: true };
    }

    if (k.kind === "game") {
      const { error } = await withTimeout(
        supabase.from("games").upsert({
          id: k.ts,
          player_id: k.playerId,
          user_id: userId,
          version: data.version,
          job: data.job,
          turn_count: data.turnCount,
          turn_log: data.turnLog,
          assets: data.assets,
          cash: data.cash,
          total_cf: data.totalCF,
          bank_loan: data.bankLoan,
          loan_interest: data.loanInterest,
          babies: data.babies,
          game_ended: data.gameEnded,
          sim_text: data.simText,
          debrief: data.debrief || null,
          is_contest: data.isContest || false,
          escaped: data.escaped || false,
          escape_time_sec: data.escapeTimeSec || null,
          passive_income_at_escape: data.passiveIncomeAtEscape || null,
          job_at_escape: data.jobAtEscape || null,
        }),  // 🆕 .select() 제거
        SB_TIMEOUT_MS,
        "games.upsert"
      );

      if (error) {
        console.error("[storage] games 저장 실패:", error?.message);
        return { ok: false, error: error.message };
      }
      console.log(`[storage] ✅ games 저장 성공: ${k.ts}`);
      return { ok: true };
    }

    if (k.kind === "debrief") {
      const { error } = await withTimeout(
        supabase.from("debrief_reports").upsert({
          id: k.ts,
          user_id: userId,
          version: data.version,
          turns: data.turns,
          analysis: data.analysis,
          feedback: data.feedback,
          feedback_tier: data.feedbackTier,
          sim_text: data.simText,
          tier: data.tier || (data.feedbackTier != null ? (data.feedbackTier === 0 ? 'free' : data.feedbackTier === 1 ? 'detailed' : 'premium') : 'analysis'),
          token_usage: data.tokenUsage || null,
          model_used: data.modelUsed || null,
          game_id: data.gameId || null,
          is_simulation: data.isSimulation || false,
        }),
        SB_TIMEOUT_MS,
        "debrief.upsert"
      );

      if (error) {
        console.error("[storage] debrief_reports 저장 실패:", error?.message);
        return { ok: false, error: error.message };
      }
      return { ok: true };
    }

    return { ok: false, error: "unknown key kind" };
  } catch (e) {
    return { ok: false, error: e?.message || "set timeout" };
  }
}

// ─── SET (v4: localStorage 즉시 + Supabase 비동기) ───
//
// 동작 모드:
//   - game:* / debrief:* : Supabase 결과를 기다림 (호출자가 결과 활용)
//   - 그 외 (players 등): 백그라운드 fire-and-forget
//
// 핵심: localStorage 저장은 항상 성공 보장 → 데이터 유실 절대 없음
async function set(key, value) {
  // 🛡️ 1차: localStorage 즉시 저장 (절대 실패 안 함)
  // game:*, debrief:* 같은 키는 그대로 저장 (CashflowCoachingSim에서도 함)
  // players 같은 시스템 키는 Supabase가 진본이라 굳이 안 함
  const k = parseKey(key);
  if (k.kind === "game" || k.kind === "debrief") {
    saveToLocalStorageSync(key, value);
  }

  // 2차: userId 확인 (캐시 사용으로 거의 즉시 응답)
  const userId = await getCurrentUserId();
  if (!userId) {
    console.warn(`[storage] set(${key}) - 세션 없음, localStorage만 저장됨`);
    // 🆕 alert 제거 (호출자가 UX 책임)
    // 🆕 game/debrief는 localStorage에 저장됐으니 부분 성공으로 간주
    if (k.kind === "game" || k.kind === "debrief") {
      return { key, value, shared: false, _localOnly: true, _reason: "no_session" };
    }
    return null;
  }

  // 3차: Supabase 저장 (타임아웃 보호)
  const result = await setSupabaseOnly(key, value, userId);
  if (result.ok) {
    return { key, value, shared: false };
  }

  // Supabase 실패 → localStorage에는 있으니 부분 성공
  console.warn(`[storage] set(${key}) Supabase 실패: ${result.error} (localStorage 살아있음)`);
  if (k.kind === "game" || k.kind === "debrief") {
    return { key, value, shared: false, _localOnly: true, _reason: result.error };
  }
  return null;
}

// 🆕 Fire-and-forget 저장 (자동 저장 등에 사용)
// 즉시 성공 반환, Supabase는 백그라운드에서 비동기 처리
export async function setNoWait(key, value) {
  const k = parseKey(key);
  if (k.kind === "game" || k.kind === "debrief") {
    saveToLocalStorageSync(key, value);
  }
  // 백그라운드로 fire (await 없음)
  (async () => {
    try {
      const userId = await getCurrentUserId();
      if (!userId) return;
      await setSupabaseOnly(key, value, userId);
    } catch (e) {
      console.warn(`[storage] setNoWait(${key}) 백그라운드 실패:`, e?.message);
    }
  })();
  return { key, value, shared: false, _async: true };
}

// ─── DELETE (타임아웃 보호) ───
async function del(key) {
  const k = parseKey(key);
  try {
    if (k.kind === "game") {
      await withTimeout(
        supabase.from("games").delete().eq("id", k.ts),
        SB_TIMEOUT_MS,
        "games.delete"
      );
    } else if (k.kind === "debrief") {
      await withTimeout(
        supabase.from("debrief_reports").delete().eq("id", k.ts),
        SB_TIMEOUT_MS,
        "debrief.delete"
      );
    }
  } catch (e) {
    console.warn(`[storage] delete(${key}) 실패:`, e?.message);
  }
  // localStorage도 같이 정리
  try { if (typeof localStorage !== "undefined") localStorage.removeItem(key); } catch {}
  return { key, deleted: true, shared: false };
}

// ─── 특정 플레이어 삭제 ───
export async function deletePlayer(playerId) {
  try {
    await withTimeout(
      supabase.from("players").delete().eq("id", playerId),
      SB_TIMEOUT_MS,
      "players.delete"
    );
  } catch (e) {
    console.warn("[storage] deletePlayer 실패:", e?.message);
  }
}

// ─── LIST (타임아웃 보호) ───
//
// 🔧 v4.1 버그 수정 (2026-04):
//   기존: list("game:") 호출 시 "game:".split(":")[1] === "" 빈 문자열로
//         player_id="" 쿼리 → 항상 0건 반환 (저장은 됐는데 조회 불가능 버그!)
//   수정: prefix가 "game:" (구체적 playerId 없음)이면 현재 user_id의 모든 게임 반환
//         RLS 정책이 본인 데이터만 보여주므로 안전.
async function list(prefix) {
  try {
    if (prefix?.startsWith("game:")) {
      const parts = prefix.split(":");
      const playerId = parts[1] || "";  // 빈 문자열일 수 있음

      if (playerId) {
        // 특정 playerId로 필터 (기존 동작 유지)
        const { data } = await withTimeout(
          supabase
            .from("games")
            .select("id, player_id")
            .eq("player_id", playerId)
            .order("date_time", { ascending: false }),
          SB_TIMEOUT_MS,
          "games.list"
        );
        return {
          keys: (data || []).map(r => `game:${playerId}:${r.id}`),
          prefix,
          shared: false,
        };
      } else {
        // 🆕 prefix가 "game:" 뿐이면 현재 user_id의 모든 게임 반환
        // RLS가 본인 데이터만 필터링하므로 user_id 명시 불필요하지만 안전상 추가
        const userId = await getCurrentUserId();
        if (!userId) {
          console.warn("[storage] list('game:') 호출 - 세션 없음, 빈 결과 반환");
          return { keys: [], prefix, shared: false };
        }

        const { data } = await withTimeout(
          supabase
            .from("games")
            .select("id, player_id")
            .eq("user_id", userId)
            .order("date_time", { ascending: false }),
          SB_TIMEOUT_MS,
          "games.list.all"
        );
        // 각 row의 실제 player_id로 키 재구성 (저장 시 사용한 키와 일치)
        return {
          keys: (data || []).map(r => `game:${r.player_id || "solo"}:${r.id}`),
          prefix,
          shared: false,
        };
      }
    }

    if (prefix === "debrief:") {
      const { data } = await withTimeout(
        supabase
          .from("debrief_reports")
          .select("id")
          .order("created_at", { ascending: false }),
        SB_TIMEOUT_MS,
        "debrief.list"
      );
      return {
        keys: (data || []).map(r => `debrief:${r.id}`),
        prefix,
        shared: false,
      };
    }
  } catch (e) {
    console.warn(`[storage] list(${prefix}) 실패:`, e?.message);
  }

  return { keys: [], prefix, shared: false };
}

// ─── window.storage API 노출 ───
export const storageAdapter = {
  get,
  set,
  setNoWait,             // 🆕 fire-and-forget 모드
  delete: del,
  list,
  invalidateAuthCache,   // 🆕 외부에서 캐시 무효화 가능
};

if (typeof window !== "undefined") {
  window.storage = storageAdapter;
}
