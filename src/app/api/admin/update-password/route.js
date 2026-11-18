import { createClient } from "@supabase/supabase-js";

/**
 * 관리자 전용: 게이트 비밀번호 변경
 * POST /api/admin/update-password
 * Headers: Authorization: Bearer <supabase access_token>
 * Body: { gateType: "contest" | "debrief", newPassword: "..." }
 *
 * 보안 (2026-11):
 * - adjust-plays / coach/issue-code와 동일하게 Bearer 토큰으로 실제 로그인 사용자를 확인하고
 *   그 user.id로 admins 테이블을 조회합니다. (본문 userId는 신뢰하지 않음)
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

    const { gateType, newPassword } = body || {};

    // ─── 인증: Authorization 헤더에서 Bearer 토큰 추출 ───
    const authHeader = request.headers.get("authorization");
    const userToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!userToken) {
      return Response.json(
        { success: false, error: "인증 토큰 없음. 다시 로그인해주세요." },
        { status: 401 }
      );
    }

    // ─── 환경 변수 체크 ───
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !anonKey) {
      return Response.json(
        { success: false, error: "Supabase 설정 누락" },
        { status: 500 }
      );
    }

    // ─── 입력 검증 ───
    if (!gateType || !newPassword) {
      return Response.json(
        { success: false, error: "필수 파라미터 누락" },
        { status: 400 }
      );
    }

    if (typeof newPassword !== "string" || newPassword.length < 4) {
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

    // 사용자 토큰으로 Supabase 클라이언트 생성 (본인 인증용)
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    });

    // Service Role 클라이언트 (있는 경우 RLS 우회 — 어드민 확인 + 설정 업데이트)
    const supabaseAdmin = serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : supabaseUser;

    // ─── 요청자 확인 (토큰의 실제 사용자) ───
    const { data: { user: requestingUser }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !requestingUser) {
      return Response.json(
        { success: false, error: "인증되지 않은 요청입니다" },
        { status: 401 }
      );
    }

    // ─── 어드민 권한 확인 (admins 테이블 존재 여부) ───
    const { data: admin, error: adminErr } = await supabaseAdmin
      .from("admins")
      .select("user_id")
      .eq("user_id", requestingUser.id)
      .maybeSingle();

    if (adminErr) {
      console.error("[update-password] 어드민 확인 실패:", adminErr);
      return Response.json(
        { success: false, error: "어드민 권한 확인 실패: " + adminErr.message },
        { status: 500 }
      );
    }

    if (!admin) {
      return Response.json(
        { success: false, error: "관리자 권한이 없습니다." },
        { status: 403 }
      );
    }

    // ─── 비밀번호 업데이트 ───
    const column = gateType === "contest" ? "contest_password" : "debrief_password";
    const { error } = await supabaseAdmin
      .from("gate_config")
      .update({
        [column]: newPassword,
        updated_at: new Date().toISOString(),
        updated_by: requestingUser.id,
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
