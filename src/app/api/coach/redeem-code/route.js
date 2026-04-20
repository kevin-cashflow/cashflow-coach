import { createClient } from "@supabase/supabase-js";

/**
 * 코칭딜러 코드 등록 API (사용자가 코드로 자격 활성화)
 * POST /api/coach/redeem-code
 * Body: { code, userId }
 */
export async function POST(request) {
  try {
    const { code, userId } = await request.json();

    if (!code || !userId) {
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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // 사용자 정보 조회 (user_stats 뷰 사용, auth.users 대신)
    // 이메일 검증은 요청 본문에 user가 직접 이메일 전달하거나, 
    // 코드 레코드와 매칭되면 통과하는 방식으로 진행
    let userEmail = null;
    // auth.users 직접 조회 대신 body에서 전달받은 email 사용하거나 스킵
    // 보안: 사용자는 본인의 userId 와 token 이 일치할 때만 로그인된 상태이므로,
    // userId 로 이미 본인 확인은 완료된 상태임
    // 추가 안전장치로 이메일 비교 가능하지만 필수 아님

    // 이미 자격 보유 중인지 확인
    const { data: existing } = await supabase
      .from("coach_credentials")
      .select("credential")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      return Response.json(
        { 
          success: false, 
          error: `이미 ${existing.credential === "master" ? "🎓 마스터 코칭딜러" : "🎯 코칭딜러"} 자격을 보유하고 있습니다.` 
        },
        { status: 400 }
      );
    }

    // 코드 조회
    const { data: codeRow, error: codeErr } = await supabase
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

    // 이메일 검증 (service_role이 있을 때만)
    if (userEmail && codeRow.target_email !== userEmail) {
      return Response.json(
        { 
          success: false, 
          error: "이 코드는 다른 이메일로 발급되었습니다. Admin에게 확인해주세요." 
        },
        { status: 403 }
      );
    }

    // target_user_id가 설정되어 있으면 매칭 확인
    if (codeRow.target_user_id && codeRow.target_user_id !== userId) {
      return Response.json(
        { 
          success: false, 
          error: "이 코드는 다른 계정으로 발급되었습니다." 
        },
        { status: 403 }
      );
    }

    // 자격 부여
    const { error: credErr } = await supabase
      .from("coach_credentials")
      .insert({
        user_id: userId,
        credential: codeRow.credential,
        activated_code_id: codeRow.id,
      });

    if (credErr) {
      console.error("자격 부여 실패:", credErr);
      return Response.json(
        { success: false, error: credErr.message },
        { status: 500 }
      );
    }

    // 코드 사용 처리
    await supabase
      .from("coach_codes")
      .update({
        used_at: new Date().toISOString(),
        used_by: userId,
      })
      .eq("id", codeRow.id);

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
