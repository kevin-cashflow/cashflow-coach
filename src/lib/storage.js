"use client";

import { supabase } from "./supabase";

/**
 * window.storage 호환 어댑터 (Phase B Day 2 - v3)
 *
 * Phase A: user_id 자동 포함, RLS 본인 데이터 필터링
 * Phase B Day 1: 대회 관련 필드 저장
 * Phase B Day 2: 세션 자동 복구 + 명확한 에러 알림
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

// ─── 현재 로그인된 user_id 조회 (세션 자동 복구 포함) ───
async function getCurrentUserId() {
  try {
    // 1차 시도: 현재 세션
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) return user.id;
    
    // 세션 없음 → 복구 시도
    console.warn("[storage] 세션 없음, 복구 시도 중...");
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed?.user?.id) {
      console.log("[storage] 세션 복구 성공");
      return refreshed.user.id;
    }
    
    console.warn("[storage] 세션 복구 실패");
    return null;
  } catch (e) {
    console.error("[storage] getCurrentUserId 에러:", e);
    return null;
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

// ─── GET ───
async function get(key) {
  const k = parseKey(key);

  if (k.kind === "players") {
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

// ─── SET (세션 복구 + 사용자 알림 추가) ───
async function set(key, value) {
  const k = parseKey(key);
  const data = typeof value === "string" ? JSON.parse(value) : value;
  const userId = await getCurrentUserId();

  if (!userId) {
    const msg = "⚠️ 저장 실패: 로그인 세션이 만료되었습니다.\n페이지를 새로고침하거나 다시 로그인해주세요.";
    console.error("[storage] 저장 실패 - 세션 없음:", key);
    // 사용자에게 명확한 알림
    if (typeof window !== "undefined") {
      alert(msg);
    }
    return null;
  }

  if (k.kind === "players") {
    const entries = Object.entries(data);
    const results = [];
    for (const [id, p] of entries) {
      const { data: r, error } = await supabase.from("players").upsert({
        id,
        name: p.name,
        games_played: p.gamesPlayed || 0,
        user_id: userId,
      }).select();
      if (error) {
        console.error("[storage] players 저장 실패:", error);
        if (typeof window !== "undefined") {
          alert(`⚠️ 플레이어 저장 실패: ${error.message}`);
        }
        return null;
      }
      results.push(r);
    }
    return { key, value, shared: false };
  }

  if (k.kind === "game") {
    const { data: r, error } = await supabase.from("games").upsert({
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
    }).select();
    
    if (error) {
      console.error("[storage] games 저장 실패:", error);
      if (typeof window !== "undefined") {
        alert(`⚠️ 게임 저장 실패: ${error.message}\n\n코드: ${error.code || "unknown"}`);
      }
      return null;
    }
    console.log("[storage] games 저장 성공:", r?.[0]?.id);
    return { key, value, shared: false };
  }

  if (k.kind === "debrief") {
    const { data: r, error } = await supabase.from("debrief_reports").upsert({
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
    }).select();
    
    if (error) {
      console.error("[storage] debrief_reports 저장 실패:", error);
      // 디브리핑은 alert 안 띄움 (조용히 실패 유지)
      return null;
    }
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
  }
  return { key, deleted: true, shared: false };
}

// ─── 특정 플레이어 삭제 ───
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

// ─── window.storage API 노출 ───
export const storageAdapter = {
  get,
  set,
  delete: del,
  list,
};

if (typeof window !== "undefined") {
  window.storage = storageAdapter;
}
