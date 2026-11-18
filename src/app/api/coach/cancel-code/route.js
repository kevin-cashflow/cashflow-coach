import { authenticateAdmin } from "@/lib/apiAuth";

/**
 * 코칭딜러 코드 취소 API (Admin 전용)
 * POST /api/coach/cancel-code
 * Headers: Authorization: Bearer <supabase access_token>
 * Body: { codeId }   (userId는 더 이상 쓰지 않음 — 무시)
 *
 * 보안 (2026-11):
 * - 권한 확인은 본문 userId가 아니라 토큰의 실제 user.id로 한다.
 *   (update-password / adjust-plays / issue-code와 동일 방식)
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

    const { codeId } = body || {};

    // ─── 인증 + 관리자 권한 (토큰 기준) ───
    const auth = await authenticateAdmin(request);
    if (auth.error) return auth.error;
    const { supabaseAdmin } = auth;

    if (!codeId) {
      return Response.json(
        { success: false, error: "필수 파라미터 누락" },
        { status: 400 }
      );
    }

    // 코드 조회
    const { data: codeRow } = await supabaseAdmin
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
    const { error } = await supabaseAdmin
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
