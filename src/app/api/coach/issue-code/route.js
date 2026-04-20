import { createClient } from "@supabase/supabase-js";

/**
 * 코칭딜러 코드 발급 API (Admin 전용)
 * POST /api/coach/issue-code
 * Body: { targetEmail, credential, userId (Admin) }
 * Headers: Authorization: Bearer <user_token>
 */
export async function POST(request) {
  try {
    const { targetEmail, credential, userId } = await request.json();

    if (!targetEmail || !credential || !userId) {
      return Response.json(
        { success: false, error: "필수 파라미터 누락" },
        { status: 400 }
      );
    }

    if (credential !== "master" && credential !== "dealer") {
      return Response.json(
        { success: false, error: "잘못된 credential (master 또는 dealer만 가능)" },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(targetEmail)) {
      return Response.json(
        { success: false, error: "올바른 이메일 형식이 아닙니다." },
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

    // Admin 권한 검증
    const { data: admin, error: adminErr } = await supabase
      .from("admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (adminErr) {
      console.error("admin 조회 에러:", adminErr);
      return Response.json(
        { success: false, error: `권한 확인 실패: ${adminErr.message}` },
        { status: 500 }
      );
    }

    if (!admin) {
      return Response.json(
        { success: false, error: "관리자 권한이 없습니다." },
        { status: 403 }
      );
    }

    const targetUserId = null;

    // 중복 코드 방지
    const { data: existing } = await supabase
      .from("coach_codes")
      .select("*")
      .eq("target_email", targetEmail)
      .eq("credential", credential)
      .is("used_at", null)
      .is("cancelled_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (existing) {
      return Response.json({
        success: true,
        code: existing.code,
        id: existing.id,
        already_issued: true,
        message: "이미 발급된 활성 코드가 있습니다.",
      });
    }

    // 고유한 6자리 코드 생성
    let code;
    for (let i = 0; i < 10; i++) {
      code = String(Math.floor(100000 + Math.random() * 900000));
      const { data: dup } = await supabase
        .from("coach_codes")
        .select("id")
        .eq("code", code)
        .is("used_at", null)
        .is("cancelled_at", null)
        .maybeSingle();
      if (!dup) break;
      code = null;
    }

    if (!code) {
      return Response.json(
        { success: false, error: "코드 생성 실패. 다시 시도해주세요." },
        { status: 500 }
      );
    }

    // 코드 삽입
    const { data: inserted, error: insertError } = await supabase
      .from("coach_codes")
      .insert({
        code,
        target_email: targetEmail,
        target_user_id: targetUserId,
        credential,
        issued_by: userId,
      })
      .select()
      .single();

    if (insertError) {
      console.error("코드 발급 실패:", insertError);
      return Response.json(
        { success: false, error: insertError.message, code: insertError.code },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      code: inserted.code,
      id: inserted.id,
      expires_at: inserted.expires_at,
    });
  } catch (e) {
    console.error("issue-code 에러:", e);
    return Response.json(
      { success: false, error: e.message || "서버 오류" },
      { status: 500 }
    );
  }
}
