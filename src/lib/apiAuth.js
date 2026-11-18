import { createClient } from "@supabase/supabase-js";

/**
 * API 공통 인증 헬퍼 (2026-11 보안 정리)
 *
 * 원칙:
 * - 요청 본문(userId 등)은 절대 신뢰하지 않는다. 권한 확인과 기록 대상은 항상
 *   Authorization: Bearer <supabase access_token> 에서 getUser()로 확인한 실제 user.id 를 쓴다.
 * - 권한이 필요한 API는 anon key + 사용자 토큰으로 본인을 확인하고,
 *   admins 테이블 조회(그리고 필요하면 쓰기)는 Service Role 로 RLS를 우회한다.
 *   (SUPABASE_SERVICE_ROLE_KEY 가 없으면 사용자 토큰 클라이언트로 대체)
 */

function jsonError(status, error) {
  return { error: Response.json({ success: false, error }, { status }) };
}

function getSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { supabaseUrl, anonKey, serviceRoleKey };
}

/**
 * 토큰만 검증하고 실제 사용자 정보를 돌려준다. (권한 검사 없음 — 로그인 사용자 대상 API용)
 * @returns {Promise<{user?: object, supabaseUser?: object, supabaseAdmin?: object, error?: Response}>}
 */
export async function authenticateUser(request) {
  const { supabaseUrl, anonKey, serviceRoleKey } = getSupabaseEnv();
  if (!supabaseUrl || !anonKey) {
    return jsonError(500, "Supabase 설정 누락");
  }

  const authHeader = request.headers.get("authorization");
  const userToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!userToken) {
    return jsonError(401, "인증 토큰 없음. 다시 로그인해주세요.");
  }

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${userToken}` } },
  });

  const supabaseAdmin = serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : supabaseUser;

  const {
    data: { user },
    error: userErr,
  } = await supabaseUser.auth.getUser();

  if (userErr || !user) {
    return jsonError(401, "인증되지 않은 요청입니다");
  }

  return { user, supabaseUser, supabaseAdmin };
}

/**
 * 토큰의 실제 사용자가 admins 테이블에 있는지 확인한다. (관리자 전용 API용)
 * @returns {Promise<{user?: object, supabaseUser?: object, supabaseAdmin?: object, error?: Response}>}
 */
export async function authenticateAdmin(request) {
  const auth = await authenticateUser(request);
  if (auth.error) return auth;

  const { user, supabaseAdmin } = auth;

  const { data: admin, error: adminErr } = await supabaseAdmin
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminErr) {
    console.error("[apiAuth] 어드민 확인 실패:", adminErr);
    return jsonError(500, "어드민 권한 확인 실패: " + adminErr.message);
  }

  if (!admin) {
    return jsonError(403, "관리자 권한이 없습니다.");
  }

  return auth;
}
