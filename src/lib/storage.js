"use client";

import { supabase } from "./supabase";

/**
 * window.storage 호환 어댑터 (Phase A 수정판)
 *
 * 변경사항:
 * - 모든 저장 작업에 user_id 자동 포함
 * - RLS가 본인 데이터만 접근하도록 필터링
 * - Admin은 RLS 정책상 전체 접근 가능 (DB에서 자동 처리)
 */

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

// ─── 현재 로그인된 user_id 조회 ───
async function getCurrentUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
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
  };
}

// ─── GET ───
async function get(key) {
  const k = parseKey(key);

  if (k.kind === "players") {
    // RLS가 자동으로 본인 데이터만 반환
    const { data, error } = await supabase.from("players").select("*");
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
    const { data, error } = await supabase
      .from("games")
      .select("*")
      .eq("id", k.ts)
      .maybeSingle();
    if (error || !data) return null;
    return { key, value: JSON.stringify(gameFromRow(data)), shared: false };
  }

  if (k.kind === "debrief") {
    const { data, error } = await supabase
      .from("debrief_reports")
      .select("*")
      .eq("id", k.ts)
      .maybeSingle();
    if (error || !data) return null;
    return { key, value: JSON.stringify(reportFromRow(data)), shared: false };
  }

  return null;
}

// ─── SET ───
async function set(key, value) {
  const k = parseKey(key);
  const data = typeof value === "string" ? JSON.parse(value) : value;
  const userId = await getCurrentUserId();

  // 로그인 안 된 상태에서는 저장 불가 (게스트는 시뮬레이션만)
  if (!userId) {
    console.warn("[storage] 로그인이 필요합니다. 저장 스킵:", key);
    return null;
  }

  if (k.kind === "players") {
    const entries = Object.entries(data);
    for (const [id, p] of entries) {
      await supabase.from("players").upsert({
        id,
        name: p.name,
        games_played: p.gamesPlayed || 0,
        user_id: userId,
      });
    }
    return { key, value, shared: false };
  }

  if (k.kind === "game") {
    await supabase.from("games").upsert({
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
    });
    return { key, value, shared: false };
  }

  if (k.kind === "debrief") {
    await supabase.from("debrief_reports").upsert({
      id: k.ts,
      user_id: userId,
      version: data.version,
      turns: data.turns,
      analysis: data.analysis,
      feedback: data.feedback,
      feedback_tier: data.feedbackTier,
      sim_text: data.simText,
    });
    return { key, value, shared: false };
  }

  return null;
}

// ─── DELETE ───
async function del(key) {
  const k = parseKey(key);

  if (k.kind === "game") {
    await supabase.from("games").delete().eq("id", k.ts);
  } else if (k.kind === "debrief") {
    await supabase.from("debrief_reports").delete().eq("id", k.ts);
  } else if (k.kind === "players") {
    // 플레이어 삭제 케이스는 없지만 일관성을 위해 처리
    // 특정 플레이어 삭제는 다른 로직 사용
  }
  return { key, deleted: true, shared: false };
}

// ─── 특정 플레이어 삭제 (기존 코드 호환) ───
// CashflowCoachingSim.jsx에서 플레이어 삭제 시 직접 호출
export async function deletePlayer(playerId) {
  await supabase.from("players").delete().eq("id", playerId);
}

// ─── LIST ───
async function list(prefix) {
  if (prefix?.startsWith("game:")) {
    const parts = prefix.split(":");
    const playerId = parts[1];
    const { data } = await supabase
      .from("games")
      .select("id")
      .eq("player_id", playerId)
      .order("date_time", { ascending: false });
    return {
      keys: (data || []).map(r => `game:${playerId}:${r.id}`),
      prefix,
      shared: false,
    };
  }

  if (prefix === "debrief:") {
    const { data } = await supabase
      .from("debrief_reports")
      .select("id")
      .order("created_at", { ascending: false });
    return {
      keys: (data || []).map(r => `debrief:${r.id}`),
      prefix,
      shared: false,
    };
  }

  return { keys: [], prefix, shared: false };
}

// ─── window.storage와 동일한 API 노출 ───
export const storageAdapter = {
  get,
  set,
  delete: del,
  list,
};

// ─── 전역에 주입 ───
if (typeof window !== "undefined") {
  window.storage = storageAdapter;
}