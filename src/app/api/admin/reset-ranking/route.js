import { createClient } from "@supabase/supabase-js";

/**
 * 관리자 전용: 랭킹 리셋
 * POST /api/admin/reset-ranking
 * Body: { type: "play" | "contest", userId: "..." }
 *
 * 랭킹 리셋 방식:
 * - type="play": 모든 일반 플레이 게임의 escaped=false, escape_time_sec=null 등으로 초기화
 *   (is_contest=false인 게임의 랭킹 집계 필드만 초기화, 게임 기록은 보존)
 * - type="contest": 대회 게임들을 일반 플레이로 전환 (is_contest=false)
 *   (새 시즌 시작 개념)
 */
export async function POST(request) {
  try {
    const { type, userId } = await request.json();

    if (!type || !userId) {
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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
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

    let affected = 0;

    if (type === "play") {
      // 플레이 모드 게임의 랭킹 집계 필드 초기화
      const { data, error } = await supabase
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
      const { data, error } = await supabase
        .from("games")
        .update({
          is_contest: false,
        })
        .eq("is_contest", true)
        .select("id");

      if (error) throw error;
      affected = data?.length || 0;

      // 대회 시즌 시작일 업데이트
      await supabase
        .from("gate_config")
        .update({
          season_started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          updated_by: userId,
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
