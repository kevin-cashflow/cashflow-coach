import { createClient } from "@supabase/supabase-js";

/**
 * 코칭딜러 코드 취소 API (Admin 전용)
 * POST /api/coach/cancel-code
 * Body: { codeId, userId }
 * Headers: Authorization: Bearer <user_token>
 */
export async function POST(request) {
  try {
    const { codeId, userId } = await request.json();

    if (!codeId || !userId) {
      return Response.json(
        { success: false, error: "필수 파라미터 누락" },
        { status: 400 }
      );
    }

    const authHeader = request.headers.get("authorization");
    const userToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!userToken) {
      return Response.json(
        { success: false, error: "인증 토큰 없음" },
        { status: 401 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        global: {
          headers: { Authorization: `Bearer ${userToken}` },
        },
      }
    );

    // Admin 권한 검증
    const { data: admin } = await supabase
      .from("admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!admin) {
      return Response.json(
        { success: false, error: "관리자 권한이 없습니다." },
        { status: 403 }
      );
    }

    // 코드 조회
    const { data: codeRow } = await supabase
      .from("coach_codes")
      .select("*")
      .eq("id", codeId)
      .maybeSingle();

    if (!codeRow) {
      return Response.json(
        { success: false, error: "코드를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (codeRow.used_at) {
      return Response.json(
        { success: false, error: "이미 사용된 코드는 취소할 수 없습니다." },
        { status: 400 }
      );
    }

    if (codeRow.cancelled_at) {
      return Response.json(
        { success: false, error: "이미 취소된 코드입니다." },
        { status: 400 }
      );
    }

    // 취소 처리
    const { error } = await supabase
      .from("coach_codes")
      .update({
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", codeId);

    if (error) {
      return Response.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return Response.json({ success: true });
  } catch (e) {
    console.error("cancel-code 에러:", e);
    return Response.json(
      { success: false, error: e.message || "서버 오류" },
      { status: 500 }
    );
  }
}
