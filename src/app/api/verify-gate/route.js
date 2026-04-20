import { createClient } from "@supabase/supabase-js";

/**
 * 게이트 비밀번호 검증 API (Phase B)
 * POST /api/verify-gate
 * Body: { gateType: "contest" | "debrief", password: "..." }
 */

export async function POST(request) {
  try {
    const { gateType, password } = await request.json();

    if (!gateType || !password) {
      return Response.json(
        { success: false, error: "gateType과 password가 필요합니다." },
        { status: 400 }
      );
    }

    if (gateType !== "contest" && gateType !== "debrief") {
      return Response.json(
        { success: false, error: "잘못된 gateType입니다." },
        { status: 400 }
      );
    }

    // Supabase 클라이언트 (서비스 롤 우선, 없으면 anon key 사용)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const { data, error } = await supabase
      .from("gate_config")
      .select("contest_password, debrief_password, contest_enabled, debrief_gate_enabled")
      .eq("id", 1)
      .single();

    if (error || !data) {
      console.error("gate_config 조회 실패:", error);
      return Response.json(
        { success: false, error: "설정을 불러올 수 없습니다." },
        { status: 500 }
      );
    }

    // 게이트 활성화 여부 확인
    if (gateType === "contest" && !data.contest_enabled) {
      return Response.json(
        { success: false, error: "대회 모드가 비활성화되어 있습니다." },
        { status: 403 }
      );
    }

    if (gateType === "debrief" && !data.debrief_gate_enabled) {
      // 게이트 OFF면 무조건 허용
      return Response.json({ success: true, bypassed: true });
    }

    // 비밀번호 검증
    const correctPassword =
      gateType === "contest" ? data.contest_password : data.debrief_password;

    if (password !== correctPassword) {
      return Response.json(
        { success: false, error: "비밀번호가 일치하지 않습니다." },
        { status: 401 }
      );
    }

    return Response.json({ success: true });
  } catch (e) {
    console.error("verify-gate 에러:", e);
    return Response.json(
      { success: false, error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
