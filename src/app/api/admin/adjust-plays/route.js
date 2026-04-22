import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/admin/adjust-plays
 *
 * 어드민이 특정 유저의 플레이 횟수를 조정합니다.
 * 실제 게임 세션 데이터는 건드리지 않고, admin_play_adjustments 테이블에
 * 조정값을 누적 저장합니다. user_stats / admin_members 뷰가 이 값을
 * COALESCE(adjustment, 0)으로 더해서 total_plays를 계산합니다.
 *
 * 배포 위치: app/api/admin/adjust-plays/route.js
 * 필요 환경 변수: SUPABASE_SERVICE_ROLE_KEY
 *
 * 요청 헤더: Authorization: Bearer <user_token>
 * 요청 body:
 *   {
 *     targetUserId: UUID,      // 조정할 사용자 ID
 *     mode: "set" | "delta",   // set=절대값, delta=증감값
 *     value: number,           // set이면 목표 총 횟수, delta면 증감값
 *     reason?: string,         // 조정 사유 (선택)
 *   }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { targetUserId, mode, value, reason } = body;

    // ─── 입력 검증 ───
    if (!targetUserId) {
      return Response.json(
        { success: false, error: "targetUserId 필수" },
        { status: 400 }
      );
    }
    if (mode !== "set" && mode !== "delta") {
      return Response.json(
        { success: false, error: "mode는 'set' 또는 'delta'여야 합니다" },
        { status: 400 }
      );
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return Response.json(
        { success: false, error: "value는 유효한 숫자여야 합니다" },
        { status: 400 }
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
    if (!serviceRoleKey) {
      return Response.json(
        {
          success: false,
          error: "SUPABASE_SERVICE_ROLE_KEY 환경 변수가 필요합니다. Vercel 또는 .env.local에 추가하세요.",
        },
        { status: 500 }
      );
    }

    // ─── 인증: Authorization 헤더에서 Bearer 토큰 추출 ───
    const authHeader = request.headers.get("authorization");
    const userToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!userToken) {
      return Response.json(
        { success: false, error: "인증 토큰 없음. 다시 로그인해주세요." },
        { status: 401 }
      );
    }

    // 사용자 토큰으로 Supabase 클라이언트 생성 (본인 인증용)
    const supabase = createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: `Bearer ${userToken}` },
      },
    });

    // Service Role 클라이언트 (RLS 우회 — 어드민 권한 확인 + 뷰 읽기 + 조정값 저장)
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ─── 요청자 확인 ───
    const { data: { user: requestingUser }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !requestingUser) {
      return Response.json(
        { success: false, error: "인증되지 않은 요청입니다" },
        { status: 401 }
      );
    }

    // ─── 어드민 권한 확인 (admins 테이블 존재 여부) ───
    const { data: adminRow, error: adminErr } = await supabaseAdmin
      .from("admins")
      .select("user_id")
      .eq("user_id", requestingUser.id)
      .maybeSingle();

    if (adminErr) {
      console.error("[adjust-plays] 어드민 확인 실패:", adminErr);
      return Response.json(
        { success: false, error: "어드민 권한 확인 실패: " + adminErr.message },
        { status: 500 }
      );
    }

    if (!adminRow) {
      return Response.json(
        {
          success: false,
          error: "어드민 권한이 없습니다",
          hint: "admins 테이블에 등록되어 있지 않습니다.",
        },
        { status: 403 }
      );
    }

    // ─── 대상 사용자의 실제 플레이 횟수 조회 (games 테이블) ───
    let actualCount = 0;
    let foundViaTable = false;
    try {
      const { count, error: cntErr } = await supabaseAdmin
        .from("games")
        .select("*", { count: "exact", head: true })
        .eq("user_id", targetUserId);
      if (!cntErr && count !== null) {
        actualCount = count;
        foundViaTable = true;
      }
    } catch (_) {
      // 테이블명이 다르면 여기로 옴
    }

    // games 접근 실패 시 → 뷰에서 역산
    if (!foundViaTable) {
      const { data: targetStats } = await supabaseAdmin
        .from("admin_members")
        .select("total_plays")
        .eq("user_id", targetUserId)
        .maybeSingle();
      const { data: existingAdj } = await supabaseAdmin
        .from("admin_play_adjustments")
        .select("adjustment")
        .eq("user_id", targetUserId)
        .maybeSingle();
      // 현재 뷰값 = 실제 + 기존 조정값 → 실제 = 뷰값 - 조정값
      actualCount = (targetStats?.total_plays || 0) - (existingAdj?.adjustment || 0);
      if (actualCount < 0) actualCount = 0;
    }

    // ─── 기존 조정값 조회 ───
    const { data: existing, error: readErr } = await supabaseAdmin
      .from("admin_play_adjustments")
      .select("adjustment")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (readErr && readErr.code !== "PGRST116") {
      console.error("[adjust-plays] 기존 조정값 조회 실패:", readErr);
      return Response.json(
        {
          success: false,
          error: "조정값 조회 실패: " + readErr.message,
          hint: "admin_play_adjustments 테이블이 존재하는지 확인하세요.",
        },
        { status: 500 }
      );
    }

    const previousAdjustment = existing?.adjustment || 0;

    // ─── 새 조정값 계산 ───
    // mode="set": 최종 total_plays = value 가 되도록 adjustment = value - actualCount
    // mode="delta": 기존 조정값 + value
    let newAdjustment;
    if (mode === "set") {
      newAdjustment = Math.round(value) - actualCount;
    } else {
      newAdjustment = previousAdjustment + Math.round(value);
    }

    // ─── upsert ───
    const { error: upsertErr } = await supabaseAdmin
      .from("admin_play_adjustments")
      .upsert(
        {
          user_id: targetUserId,
          adjustment: newAdjustment,
          reason: reason || null,
          adjusted_by: requestingUser.id,
          adjusted_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id",
        }
      );

    if (upsertErr) {
      console.error("[adjust-plays] upsert 실패:", upsertErr);
      return Response.json(
        {
          success: false,
          error: "조정값 저장 실패: " + upsertErr.message,
          hint: "admin_play_adjustments 테이블이 존재하는지, RLS가 Service Role을 허용하는지 확인하세요.",
        },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      actualCount,
      previousAdjustment,
      newAdjustment,
      newTotalPlays: actualCount + newAdjustment,
    });
  } catch (e) {
    console.error("[adjust-plays] 예외:", e);
    return Response.json(
      { success: false, error: e.message || "서버 오류" },
      { status: 500 }
    );
  }
}
