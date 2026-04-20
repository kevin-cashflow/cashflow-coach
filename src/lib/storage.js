"use client";

import { supabase } from "./supabase";

/**
 * window.storage 호환 어댑터
 *
 * 기존 코드의 window.storage.get/set/delete/list 호출을
 * 그대로 유지하면서 뒷단을 Supabase로 연결함.
 *
 * 키 패턴 → 테이블 매핑:
 *   "players"                     → players 테이블 전체
 *   "game:{playerId}:{ts}"        → games 테이블 (한 건)
 *   "debrief:{ts}"                → debrief_reports 테이블 (한 건)
 */

// ── 키 파싱 ──
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

// ── DB 행 → 기존 JSON 포맷 변환 ──
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

// ── GET ──
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

// ── SET ──
async function set(key, value) {
  const k = parseKey(key);
  const data = typeof value === "string" ? JSON.parse(value) : value;

  if (k.kind === "players") {
    const entries = Object.entries(data);
    for (const [id, p] of entries) {
      await supabase.from("players").upsert({
        id,
        name: p.name,
        games_played: p.gamesPlayed || 0,
      });
    }
    return { key, value, shared: false };
  }

  if (k.kind === "game") {
    await supabase.from("games").upsert({
      id: k.ts,
      player_id: k.playerId,
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

// ── DELETE ──
async function del(key) {
  const k = parseKey(key);
  if (k.kind === "game") {
    await supabase.from("games").delete().eq("id", k.ts);
  } else if (k.kind === "debrief") {
    await supabase.from("debrief_reports").delete().eq("id", k.ts);
  }
  return { key, deleted: true, shared: false };
}

// ── LIST ──
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

// ── window.storage와 동일한 API 노출 ──
export const storageAdapter = {
  get,
  set,
  delete: del,
  list,
};

// ── 전역에 주입 (기존 window.storage 호출이 그대로 동작) ──
if (typeof window !== "undefined") {
  window.storage = storageAdapter;
}