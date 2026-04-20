import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const body = await request.json();
    const { model, max_tokens, system, messages } = body;

    // 기본 유효성 검증
    if (!model || !messages) {
      return NextResponse.json(
        { error: { message: "model과 messages는 필수입니다." } },
        { status: 400 }
      );
    }

    // API 키 확인
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.");
      return NextResponse.json(
        { error: { message: "서버 설정 오류: API 키 없음" } },
        { status: 500 }
      );
    }

    // Anthropic API 호출
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: max_tokens || 2500,
        system: system || undefined,
        messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Anthropic API error:", response.status, data);
      return NextResponse.json(
        { error: data.error || { message: `API 오류 (${response.status})` } },
        { status: response.status }
      );
    }

    // 성공 응답 반환
    return NextResponse.json(data);
  } catch (e) {
    console.error("Proxy error:", e);
    return NextResponse.json(
      { error: { message: e.message || "서버 오류" } },
      { status: 500 }
    );
  }
}

// CORS preflight (필요시)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}