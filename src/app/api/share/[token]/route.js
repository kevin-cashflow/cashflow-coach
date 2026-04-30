// app/api/share/[token]/route.js
//
// 공유 데이터 조회 + 삭제 API
//
// GET /api/share/{token} → 익명 OK, 공유 데이터 반환 + 조회수 증가
// DELETE /api/share/{token} → 본인만 OK, 공유 취소

import { createClient } from "@supabase/supabase-js";

// ─── GET: 공유 데이터 조회 (익명 OK) ───
export async function GET(request, context) {
  try {
    // 🔧 Next.js 14 / 15 양쪽 버전 호환:
    //   - Next.js 15: params는 Promise → await 필요
    //   - Next.js 14: params는 일반 객체 → await 불필요 (await도 동작은 함)
    //   - 안전하게 await 사용 (둘 다 작동)
    const params = context?.params ? await context.params : {};
    const token = params?.token;

    console.log("[share/get] 요청 token:", token);

    if (!token || !/^[A-Za-z0-9]{8}$/.test(token)) {
      return Response.json(
        { error: "유효하지 않은 공유 링크" },
        { status: 400 }
      );
    }
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[share/get] Supabase 환경변수 누락");
      return Response.json(
        { error: "서버 설정 오류" },
        { status: 500 }
      );
    }
    
    // 익명 클라이언트 (anon key만 사용 - RLS가 SELECT 허용)
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    
    // 공유 데이터 조회
    const { data: share, error } = await supabase
      .from("shared_debriefs")
      .select("token, nickname, version, job, turn_count, escaped, date_played, analysis, feedback_text, feedback_tier, persona_key, persona_name, created_at, view_count")
      .eq("token", token)
      .single();
    
    if (error || !share) {
      return Response.json(
        { error: "공유 링크를 찾을 수 없습니다 (삭제되었거나 잘못된 링크)" },
        { status: 404 }
      );
    }
    
    // 조회수 증가 (실패해도 무시)
    try {
      await supabase.rpc("increment_share_view", { share_token: token });
    } catch (e) {
      console.warn("[share/get] 조회수 증가 실패 (무시):", e.message);
    }
    
    return Response.json(share);
    
  } catch (e) {
    console.error("[share/get] 예외:", e);
    return Response.json(
      { error: e.message || "알 수 없는 오류" },
      { status: 500 }
    );
  }
}

// ─── DELETE: 공유 취소 (본인만) ───
export async function DELETE(request, context) {
  try {
    const params = context?.params ? await context.params : {};
    const token = params?.token;
    
    if (!token || !/^[A-Za-z0-9]{8}$/.test(token)) {
      return Response.json(
        { error: "유효하지 않은 공유 링크" },
        { status: 400 }
      );
    }
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    const authHeader = request.headers.get("authorization");
    const accessToken = authHeader?.replace("Bearer ", "");
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader || "" } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
    
    if (userError || !user) {
      return Response.json(
        { error: "로그인이 필요합니다" },
        { status: 401 }
      );
    }
    
    // RLS가 본인 것만 삭제 허용 (정책에 의해)
    const { error: deleteError } = await supabase
      .from("shared_debriefs")
      .delete()
      .eq("token", token);
    
    if (deleteError) {
      console.error("[share/delete] 삭제 실패:", deleteError);
      return Response.json(
        { error: "삭제 실패: " + deleteError.message },
        { status: 500 }
      );
    }
    
    return Response.json({ success: true });
    
  } catch (e) {
    console.error("[share/delete] 예외:", e);
    return Response.json(
      { error: e.message || "알 수 없는 오류" },
      { status: 500 }
    );
  }
}
