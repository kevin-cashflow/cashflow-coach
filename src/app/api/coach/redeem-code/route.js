import { authenticateUser } from "@/lib/apiAuth";

/**
 * 코칭딜러 코드 등록 API (사용자가 코드로 자격 활성화)
 * POST /api/coach/redeem-code
 * Headers: Authorization: Bearer <supabase access_token>   (필수)
 * Body: { code }   (userId는 더 이상 쓰지 않음 — 무시)
 *
 * 보안 (2026-11):
 * - Authorization 토큰을 auth.getUser()로 반드시 검증하고, 자격 부여 대상·사용 기록은
 *   본문 userId가 아니라 토큰의 실제 user.id를 쓴다. (타인 계정 도용/스푸핑 방지)
 *
 * 변경점(2026-04):
 *  - coach_codes.used_at/used_by 업데이트를 Service Role로 강제 실행하도록 변경.
 *    RLS 정책이 UPDATE를 거부해 어드민에서 "사용됨" 표시가 안 되던 버그 수정.
 *  - used_at 업데이트 실패는 critical error로 처리(이전엔 무시됨).
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

    const { code } = body || {};

    // ─── 인증: Authorization 헤더 토큰으로 실제 사용자 확인 ───
    const auth = await authenticateUser(request);
    if (auth.error) return auth.error;
    const { user: requestingUser, supabaseUser, supabaseAdmin } = auth;

    if (!code) {
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

    // 이미 자격 보유 중인지 확인
    const { data: existing } = await supabaseUser
      .from("coach_credentials")
      .select("credential")
      .eq("user_id", requestingUser.id)
      .maybeSingle();

    if (existing) {
      return Response.json(
        {
          success: false,
          error: `이미 ${existing.credential === "master" ? "🎓 마스터 강사" : "🎯 코칭딜러"} 자격을 보유하고 있습니다.`,
        },
        { status: 400 }
      );
    }

    // 코드 조회
    const { data: codeRow, error: codeErr } = await supabaseAdmin
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

    // target_user_id가 설정되어 있으면 매칭 확인 (토큰의 실제 사용자 기준)
    if (codeRow.target_user_id && codeRow.target_user_id !== requestingUser.id) {
      return Response.json(
        {
          success: false,
          error: "이 코드는 다른 계정으로 발급되었습니다.",
        },
        { status: 403 }
      );
    }

    // 자격 부여 (RLS: auth.uid() = user_id 검증 — 토큰 사용자 본인 행만 생성)
    const { error: credErr } = await supabaseUser
      .from("coach_credentials")
      .insert({
        user_id: requestingUser.id,
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

    // ★ 코드 사용 처리 (Service Role로 RLS 우회)
    // 어드민 화면에서 '사용됨'으로 뜨려면 이 업데이트가 반드시 성공해야 함.
    const { error: useErr } = await supabaseAdmin
      .from("coach_codes")
      .update({
        used_at: new Date().toISOString(),
        used_by: requestingUser.id,
      })
      .eq("id", codeRow.id)
      .is("used_at", null); // race condition 방지: 아직 안 쓰인 레코드만

    if (useErr) {
      // 자격 insert는 이미 성공했으므로 롤백이 깔끔하지 않음.
      // 로그에 critical로 남기고, 사용자에게는 성공 응답을 주되 어드민 체크는 수동 처리 안내.
      console.error("[CRITICAL] coach_codes.used_at 업데이트 실패:", useErr);
      console.error("  → 어드민에서 이 코드의 '사용됨' 체크가 안 될 수 있음. 수동 처리 필요:", codeRow.id);
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
