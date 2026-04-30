// app/api/share/create/route.js
//
// 공유 링크 생성 API
// POST /api/share/create
//
// Request body:
// {
//   gameKey: string,
//   version: string,
//   job: string,
//   turnCount: number,
//   escaped: boolean,
//   datePlayed: string (YYYY-MM-DD),
//   analysis: object,
//   feedbackText: string,
//   feedbackTier: 0 | 1 | 2,
//   personaKey: string | null,
//   personaName: string | null,
// }
//
// Response:
// {
//   token: string (UUID),
//   url: string ("https://cashflow-coach.vercel.app/share/{token}"),
// }

import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function POST(request) {
  try {
    const body = await request.json();
    
    // 1. Supabase 클라이언트 (서버사이드, 사용자 인증)
    const cookieStore = await cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      return Response.json(
        { error: "Supabase 환경변수 미설정" },
        { status: 500 }
      );
    }
    
    // 사용자의 access_token을 쿠키에서 추출 (Supabase auth-helpers 패턴)
    // 클라이언트가 Authorization 헤더로 보내면 그것도 사용 가능
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader || "" } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    
    // 2. 사용자 정보 확인
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return Response.json(
        { error: "로그인이 필요합니다" },
        { status: 401 }
      );
    }
    
    // 3. 닉네임 결정 (우선순위: 클라이언트 → players 테이블 → 익명)
    let nickname = "익명";

    // 우선순위 1: 클라이언트에서 보낸 닉네임 (가장 신뢰할 수 있음)
    if (body.nickname && typeof body.nickname === "string" && body.nickname.trim()) {
      nickname = body.nickname.trim();
    } else {
      // 우선순위 2: players 테이블 조회 (폴백)
      try {
        const { data: player } = await supabase
          .from("players")
          .select("nickname")
          .eq("user_id", user.id)
          .single();
        if (player?.nickname) nickname = player.nickname;
      } catch (e) {
        console.warn("[share/create] 닉네임 조회 실패, '익명'으로 처리:", e.message);
      }
    }
    
    console.log("[share/create] 사용 닉네임:", nickname);
    
    // 4. 공유 레코드 생성
    const insertData = {
      user_id: user.id,
      nickname,
      game_key: body.gameKey || null,
      version: body.version || null,
      job: body.job || null,
      turn_count: body.turnCount || 0,
      escaped: body.escaped || false,
      date_played: (() => {
        // 날짜 안전 변환: ISO 8601 (YYYY-MM-DD) 형식만 허용
        if (!body.datePlayed) return null;
        const str = String(body.datePlayed).trim();
        // 이미 ISO 형식이면 그대로
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
        // 한국식 "2026. 4. 30." 같은 포맷 변환
        try {
          const parsed = new Date(str);
          if (!isNaN(parsed.getTime())) {
            return parsed.toISOString().slice(0, 10);
          }
        } catch {}
        return null; // 변환 실패 시 NULL
      })(),
      analysis: body.analysis || null,
      feedback_text: body.feedbackText || null,
      feedback_tier: body.feedbackTier ?? null,
      persona_key: body.personaKey || null,
      persona_name: body.personaName || null,
    };
    
    const { data: created, error: insertError } = await supabase
      .from("shared_debriefs")
      .insert(insertData)
      .select("token")
      .single();
    
    if (insertError) {
      console.error("[share/create] 생성 실패:", insertError);
      return Response.json(
        { error: "공유 링크 생성 실패: " + insertError.message },
        { status: 500 }
      );
    }
    
    const PROD_DOMAIN = process.env.NEXT_PUBLIC_PROD_DOMAIN || "https://cashflow-coach.vercel.app";
    const shareUrl = `${PROD_DOMAIN}/share/${created.token}`;
    
    console.log("[share/create] ✅ 공유 링크 생성:", created.token);
    
    return Response.json({
      token: created.token,
      url: shareUrl,
    });
    
  } catch (e) {
    console.error("[share/create] 예외:", e);
    return Response.json(
      { error: e.message || "알 수 없는 오류" },
      { status: 500 }
    );
  }
}
