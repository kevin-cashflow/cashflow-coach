import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/feedback
 *
 * Anthropic API 프록시. 로그인한 Supabase 사용자만 호출할 수 있습니다.
 *
 * 보안 (2026-11):
 * - Authorization: Bearer <supabase access_token> 필수 검증 → 무인증 크레딧 소진 차단
 * - 모델 화이트리스트 / max_tokens 상한 / messages 구조·길이 검증
 * - CORS: 와이드 오픈 제거. 동일 출처 또는 허용된 도메인만 preflight 통과
 */

// ─── 허용 모델 (프런트엔드 MODEL_SONNET / MODEL_OPUS와 일치) ───
const ALLOWED_MODELS = new Set([
  "claude-sonnet-4-5",
  "claude-sonnet-4-5-20250929",
  "claude-opus-4-5",
  "claude-opus-4-5-20251101",
]);

const MAX_TOKENS_LIMIT = 8192;      // 코드상 최대 사용치 (프런트엔드 8192)
const DEFAULT_MAX_TOKENS = 2500;
const MAX_MESSAGES = 8;
const ALLOWED_MESSAGE_ROLES = new Set(["user", "assistant"]);
const MAX_SYSTEM_CHARS = 60000;          // 시스템 프롬프트 상한
const MAX_TOTAL_CONTENT_CHARS = 300000;  // system + messages 전체 텍스트 상한

// ─── CORS 허용 출처 ───
function allowedOrigins() {
  const list = new Set(["https://cashflow-coach.vercel.app"]);
  const prodDomain = process.env.NEXT_PUBLIC_PROD_DOMAIN;
  if (prodDomain) {
    prodDomain
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((domain) => {
        if (domain.startsWith("http://") || domain.startsWith("https://")) {
          list.add(domain.replace(/\/$/, ""));
        } else {
          list.add(`https://${domain.replace(/\/$/, "")}`);
        }
      });
  }
  return list;
}

function resolveOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const normalized = origin.replace(/\/$/, "");
  const list = allowedOrigins();
  // 로컬 개발(localhost / 127.0.0.1)은 허용
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)) {
    return normalized;
  }
  return list.has(normalized) ? normalized : "DENIED";
}

// ─── messages 구조 검증 ───
function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "messages는 1개 이상의 배열이어야 합니다.";
  }
  if (messages.length > MAX_MESSAGES) {
    return `messages는 최대 ${MAX_MESSAGES}개까지 허용됩니다.`;
  }

  let totalChars = 0;
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") {
      return "messages 항목이 올바르지 않습니다.";
    }
    if (!ALLOWED_MESSAGE_ROLES.has(msg.role)) {
      return "messages의 role은 user 또는 assistant만 허용됩니다.";
    }

    const content = msg.content;
    if (typeof content === "string") {
      totalChars += content.length;
      continue;
    }
    if (Array.isArray(content)) {
      if (content.length === 0 || content.length > 20) {
        return "messages content 블록 개수가 올바르지 않습니다.";
      }
      for (const block of content) {
        if (!block || typeof block !== "object" || block.type !== "text") {
          return "messages content는 text 블록만 허용됩니다.";
        }
        if (typeof block.text !== "string") {
          return "messages content의 text가 올바르지 않습니다.";
        }
        totalChars += block.text.length;
      }
      continue;
    }
    return "messages의 content 형식이 올바르지 않습니다.";
  }

  if (totalChars > MAX_TOTAL_CONTENT_CHARS) {
    return "요청 본문이 허용 크기를 초과했습니다.";
  }
  return null;
}

// ─── 로그인 사용자 검증 ───
async function authenticate(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return { error: "인증 토큰 없음. 로그인 후 이용해주세요.", status: 401 };
  }
  if (!supabaseUrl || !anonKey) {
    console.error("[feedback] Supabase 환경변수 누락");
    return { error: "서버 설정 오류", status: 500 };
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { error: "유효하지 않은 인증입니다. 다시 로그인해주세요.", status: 401 };
  }
  return { user };
}

function corsHeaders(request) {
  const origin = resolveOrigin(request);
  if (!origin || origin === "DENIED") return {};
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  };
}

export async function POST(request) {
  try {
    // 1) 인증 (본문 파싱 전에 수행 → 무인증 요청은 항상 401)
    const auth = await authenticate(request);
    if (auth.error) {
      return NextResponse.json(
        { error: { message: auth.error } },
        { status: auth.status, headers: corsHeaders(request) }
      );
    }

    // 2) 본문 파싱
    let body;
    try {
      body = await request.json();
    } catch (_) {
      return NextResponse.json(
        { error: { message: "요청 본문이 올바른 JSON이 아닙니다." } },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    const { model, max_tokens, system, messages } = body || {};

    // 3) 모델 화이트리스트
    if (!model || typeof model !== "string" || !ALLOWED_MODELS.has(model)) {
      return NextResponse.json(
        { error: { message: "허용되지 않은 model입니다." } },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    // 4) max_tokens 상한
    let tokens = DEFAULT_MAX_TOKENS;
    if (max_tokens !== undefined && max_tokens !== null) {
      if (!Number.isInteger(max_tokens) || max_tokens < 1 || max_tokens > MAX_TOKENS_LIMIT) {
        return NextResponse.json(
          { error: { message: `max_tokens는 1~${MAX_TOKENS_LIMIT} 사이의 정수여야 합니다.` } },
          { status: 400, headers: corsHeaders(request) }
        );
      }
      tokens = max_tokens;
    }

    // 5) system 검증
    if (system !== undefined && system !== null) {
      if (typeof system !== "string") {
        return NextResponse.json(
          { error: { message: "system은 문자열이어야 합니다." } },
          { status: 400, headers: corsHeaders(request) }
        );
      }
      if (system.length > MAX_SYSTEM_CHARS) {
        return NextResponse.json(
          { error: { message: "system 프롬프트가 허용 크기를 초과했습니다." } },
          { status: 400, headers: corsHeaders(request) }
        );
      }
    }

    // 6) messages 검증
    const msgError = validateMessages(messages);
    if (msgError) {
      return NextResponse.json(
        { error: { message: msgError } },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    // 7) API 키 확인
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.");
      return NextResponse.json(
        { error: { message: "서버 설정 오류: API 키 없음" } },
        { status: 500, headers: corsHeaders(request) }
      );
    }

    // 8) Anthropic API 호출
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: tokens,
        system: system || undefined,
        messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Anthropic API error:", response.status, data);
      return NextResponse.json(
        { error: data.error || { message: `API 오류 (${response.status})` } },
        { status: response.status, headers: corsHeaders(request) }
      );
    }

    // 성공 응답 반환
    return NextResponse.json(data, { headers: corsHeaders(request) });
  } catch (e) {
    console.error("Proxy error:", e);
    return NextResponse.json(
      { error: { message: e.message || "서버 오류" } },
      { status: 500 }
    );
  }
}

// CORS preflight — 허용된 출처만 통과
export async function OPTIONS(request) {
  const origin = resolveOrigin(request);
  if (origin === "DENIED") {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "600",
    },
  });
}
