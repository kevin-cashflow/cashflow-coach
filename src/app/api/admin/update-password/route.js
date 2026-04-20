import { createClient } from "@supabase/supabase-js";

/**
 * 관리자 전용: 게이트 비밀번호 변경
 * POST /api/admin/update-password
 * Body: { gateType: "contest" | "debrief", newPassword: "...", userId: "..." }
 */
export async function POST(request) {
  try {
    const { gateType, newPassword, userId } = await request.json();

    if (!gateType || !newPassword || !userId) {
      return Response.json(
        { success: false, error: "필수 파라미터 누락" },
        { status: 400 }
      );
    }

    if (newPassword.length < 4) {
      return Response.json(
        { success: false, error: "비밀번호는 최소 4자 이상이어야 합니다." },
        { status: 400 }
      );
    }

    if (gateType !== "contest" && gateType !== "debrief") {
      return Response.json(
        { success: false, error: "잘못된 gateType" },
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

    // 비밀번호 업데이트
    const column = gateType === "contest" ? "contest_password" : "debrief_password";
    const { error } = await supabase
      .from("gate_config")
      .update({
        [column]: newPassword,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq("id", 1);

    if (error) {
      console.error("비밀번호 업데이트 실패:", error);
      return Response.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return Response.json({ success: true });
  } catch (e) {
    console.error("update-password 에러:", e);
    return Response.json(
      { success: false, error: "서버 오류" },
      { status: 500 }
    );
  }
}
