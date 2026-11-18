import { authenticateAdmin } from "@/lib/apiAuth";

/**
 * 코칭딜러 코드 발급 API (Admin 전용)
 * POST /api/coach/issue-code
 * Headers: Authorization: Bearer <supabase access_token>
 * Body: { targetEmail, credential }   (userId는 더 이상 쓰지 않음 — 무시)
 *
 * 보안 (2026-11):
 * - 권한 확인과 issued_by 기록은 본문 userId가 아니라 토큰의 실제 user.id를 사용한다.
 *   (update-password / adjust-plays와 동일 방식)
 */
export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (_) {
      return Response.json(
        { success: false, error: "요청 본문이 올바른 JSON이 아닙니다." },
        { status: 400 }
      );
    }

    const { targetEmail, credential } = body || {};

    // ─── 인증 + 관리자 권한 (토큰 기준) ───
    const auth = await authenticateAdmin(request);
    if (auth.error) return auth.error;
    const { user: requestingUser, supabaseAdmin } = auth;

    if (!targetEmail || !credential) {
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

    const targetUserId = null;

    // 중복 코드 방지
    const { data: existing } = await supabaseAdmin
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
      const { data: dup } = await supabaseAdmin
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

    // 코드 삽입 (발급자 = 토큰의 실제 사용자)
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("coach_codes")
      .insert({
        code,
        target_email: targetEmail,
        target_user_id: targetUserId,
        credential,
        issued_by: requestingUser.id,
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
