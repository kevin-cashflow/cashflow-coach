import { authenticateAdmin } from "@/lib/apiAuth";

/**
 * 관리자 전용: 랭킹 리셋
 * POST /api/admin/reset-ranking
 * Headers: Authorization: Bearer <supabase access_token>
 * Body: { type: "play" | "contest" }   (userId는 더 이상 받지 않음 — 무시)
 *
 * 랭킹 리셋 방식:
 * - type="play": 모든 일반 플레이 게임의 escaped=false, escape_time_sec=null 등으로 초기화
 *   (is_contest=false인 게임의 랭킹 집계 필드만 초기화, 게임 기록은 보존)
 * - type="contest": 대회 게임들을 일반 플레이로 전환 (is_contest=false)
 *   (새 시즌 시작 개념)
 *
 * 보안 (2026-11):
 * - update-password / adjust-plays와 동일하게 Bearer 토큰 → auth.getUser() → 토큰의 실제
 *   user.id로 admins 테이블을 조회한다. 본문 userId는 신뢰하지 않고 무시한다.
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

    const { type } = body || {};

    // ─── 인증 + 관리자 권한 (토큰 기준) ───
    const auth = await authenticateAdmin(request);
    if (auth.error) return auth.error;
    const { user: requestingUser, supabaseAdmin } = auth;

    if (!type) {
      return Response.json(
        { success: false, error: "필수 파라미터 누락" },
        { status: 400 }
      );
    }

    if (type !== "play" && type !== "contest") {
      return Response.json(
        { success: false, error: "잘못된 type" },
        { status: 400 }
      );
    }

    let affected = 0;

    if (type === "play") {
      // 플레이 모드 게임의 랭킹 집계 필드 초기화
      const { data, error } = await supabaseAdmin
        .from("games")
        .update({
          escaped: false,
          escape_time_sec: null,
          passive_income_at_escape: null,
          job_at_escape: null,
        })
        .eq("is_contest", false)
        .select("id");

      if (error) throw error;
      affected = data?.length || 0;
    } else if (type === "contest") {
      // 대회 게임을 일반 플레이로 전환 (is_contest=false)
      const { data, error } = await supabaseAdmin
        .from("games")
        .update({
          is_contest: false,
        })
        .eq("is_contest", true)
        .select("id");

      if (error) throw error;
      affected = data?.length || 0;

      // 대회 시즌 시작일 업데이트 (기록자는 토큰의 실제 사용자)
      await supabaseAdmin
        .from("gate_config")
        .update({
          season_started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          updated_by: requestingUser.id,
        })
        .eq("id", 1);
    }

    return Response.json({ success: true, affected });
  } catch (e) {
    console.error("reset-ranking 에러:", e);
    return Response.json(
      { success: false, error: e.message || "서버 오류" },
      { status: 500 }
    );
  }
}
