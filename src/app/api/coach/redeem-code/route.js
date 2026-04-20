import { createClient } from "@supabase/supabase-js";

/**
 * 코칭딜러 코드 등록 API (사용자가 코드로 자격 활성화)
 * POST /api/coach/redeem-code
 * Body: { code, userId }
 * Headers: Authorization: Bearer <user_token>
 */
export async function POST(request) {
  try {
    const { code, userId } = await request.json();

    if (!code || !userId) {
      return Response.json(
        { success: false, error: "필수 파라미터 누락" },
        { status: 400 }
      );
    }

    if (!/^[0-9]{6}$/.test(code)) {
      return Response.json(
        { success: false, error: "코드는 6자리 숫자여야 합니다." },
        { status: 400 }
      );
    }

    // 사용자 토큰을 Authorization 헤더에서 추출
    const authHeader = request.headers.get("authorization");
    const userToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!userToken) {
      return Response.json(
        { success: false, error: "인증 토큰 없음. 다시 로그인해주세요." },
        { status: 401 }
      );
    }

    // 사용자 토큰으로 Supabase 클라이언트 생성 (RLS 작동)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        global: {
          headers: { Authorization: `Bearer ${userToken}` },
        },
      }
    );

    // 이미 자격 보유 중인지 확인
    const { data: existing } = await supabase
      .from("coach_credentials")
      .select("credential")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      return Response.json(
        { 
          success: false, 
          error: `이미 ${existing.credential === "master" ? "🎓 마스터 코칭딜러" : "🎯 코칭딜러"} 자격을 보유하고 있습니다.` 
        },
        { status: 400 }
      );
    }

    // 코드 조회
    const { data: codeRow, error: codeErr } = await supabase
      .from("coach_codes")
      .select("*")
      .eq("code", code)
      .maybeSingle();

    if (codeErr || !codeRow) {
      return Response.json(
        { success: false, error: "존재하지 않는 코드입니다." },
        { status: 404 }
      );
    }

    // 이미 사용됨
    if (codeRow.used_at) {
      return Response.json(
        { success: false, error: "이미 사용된 코드입니다." },
        { status: 400 }
      );
    }

    // 취소됨
    if (codeRow.cancelled_at) {
      return Response.json(
        { success: false, error: "취소된 코드입니다." },
        { status: 400 }
      );
    }

    // 만료됨
    if (codeRow.expires_at && new Date(codeRow.expires_at) < new Date()) {
      return Response.json(
        { success: false, error: "만료된 코드입니다. Admin에게 재발급을 요청해주세요." },
        { status: 400 }
      );
    }

    // target_user_id가 설정되어 있으면 매칭 확인
    if (codeRow.target_user_id && codeRow.target_user_id !== userId) {
      return Response.json(
        { 
          success: false, 
          error: "이 코드는 다른 계정으로 발급되었습니다." 
        },
        { status: 403 }
      );
    }

    // 자격 부여 (RLS: auth.uid() = user_id 검증)
    const { error: credErr } = await supabase
      .from("coach_credentials")
      .insert({
        user_id: userId,
        credential: codeRow.credential,
        activated_code_id: codeRow.id,
      });

    if (credErr) {
      console.error("자격 부여 실패:", credErr);
      return Response.json(
        { success: false, error: credErr.message, code: credErr.code },
        { status: 500 }
      );
    }

    // 코드 사용 처리 (RLS: 활성 코드만 가능, used_by = auth.uid())
    const { error: useErr } = await supabase
      .from("coach_codes")
      .update({
        used_at: new Date().toISOString(),
        used_by: userId,
      })
      .eq("id", codeRow.id);

    if (useErr) {
      console.error("코드 사용 처리 실패 (자격은 이미 부여됨):", useErr);
      // 자격 부여는 성공했으니 success 반환
    }

    return Response.json({
      success: true,
      credential: codeRow.credential,
    });
  } catch (e) {
    console.error("redeem-code 에러:", e);
    return Response.json(
      { success: false, error: e.message || "서버 오류" },
      { status: 500 }
    );
  }
}
