-- ═══════════════════════════════════════════════════════════════
-- 🔒 캐쉬플로우 코치 Sim — Row Level Security 정책
-- ═══════════════════════════════════════════════════════════════
--
-- 적용 순서:
--   1. Supabase Dashboard → SQL Editor
--   2. 아래 섹션을 순서대로 실행 (진단 → 적용)
--   3. 각 섹션 실행 후 결과 확인
--
-- 주의:
--   - 프로덕션 DB에 적용하기 전에 staging/dev에서 먼저 테스트
--   - 기존 정책이 있으면 "DROP POLICY IF EXISTS ..." 로 정리 후 재생성
--   - auth.uid() 는 Supabase가 자동으로 현재 로그인 사용자의 UUID 반환
-- ═══════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════
-- SECTION A: 진단 쿼리 (현재 상태 파악)
-- ══════════════════════════════════════════════════

-- A-1: games 테이블 RLS 활성화 여부 확인
SELECT
  schemaname, tablename,
  CASE WHEN rowsecurity THEN '🔒 활성' ELSE '⚠️ 비활성' END AS rls_status
FROM pg_tables
WHERE tablename IN ('games', 'profiles', 'admin_members');

-- A-2: 현재 games 테이블에 설정된 정책 목록
SELECT
  schemaname, tablename, policyname,
  permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'games';

-- A-3: admin 판별 가능한 컬럼 확인 (profiles 테이블)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND (column_name LIKE '%admin%' OR column_name LIKE '%role%' OR column_name LIKE '%credential%');

-- A-4: games 테이블 전체 row 수 (관리자만 보임 / RLS 비활성 시 전부 보임)
SELECT COUNT(*) AS total_rows, COUNT(DISTINCT user_id) AS unique_users
FROM games;


-- ══════════════════════════════════════════════════
-- SECTION B: Admin 판별 Helper Function
-- ══════════════════════════════════════════════════
-- 이 함수는 RLS 정책에서 "현재 사용자가 Admin인가?"를 판별하는 데 사용된다.
-- profiles 테이블의 is_admin 컬럼을 기준으로 판별한다.
-- 만약 컬럼 이름이 다르면 (예: role = 'admin'), 아래 함수를 수정하여 사용한다.

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND COALESCE(is_admin, FALSE) = TRUE
  );
$$;

-- 함수 실행 권한 부여
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin() TO anon;

-- 테스트: 현재 로그인 사용자가 admin인가?
-- SELECT is_admin();


-- ══════════════════════════════════════════════════
-- SECTION C: games 테이블 RLS 정책 적용
-- ══════════════════════════════════════════════════

-- C-1: RLS 활성화
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

-- C-2: 기존 정책 정리 (존재하면 삭제)
DROP POLICY IF EXISTS "users_select_own_games" ON games;
DROP POLICY IF EXISTS "users_insert_own_games" ON games;
DROP POLICY IF EXISTS "users_update_own_games" ON games;
DROP POLICY IF EXISTS "users_delete_own_games" ON games;
DROP POLICY IF EXISTS "admin_select_all_games" ON games;
DROP POLICY IF EXISTS "admin_update_all_games" ON games;
DROP POLICY IF EXISTS "admin_delete_all_games" ON games;

-- C-3: 사용자는 자신의 게임만 SELECT 가능
CREATE POLICY "users_select_own_games"
  ON games FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- C-4: 사용자는 자신의 user_id로만 INSERT 가능 (저장 시 다른 user_id 시도 차단)
CREATE POLICY "users_insert_own_games"
  ON games FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- C-5: 사용자는 자신의 게임만 UPDATE 가능
CREATE POLICY "users_update_own_games"
  ON games FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- C-6: 사용자는 자신의 게임만 DELETE 가능
CREATE POLICY "users_delete_own_games"
  ON games FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- C-7: Admin은 모든 게임을 SELECT 가능 (Admin 기능)
CREATE POLICY "admin_select_all_games"
  ON games FOR SELECT
  TO authenticated
  USING (is_admin());

-- C-8: Admin은 모든 게임을 UPDATE 가능 (Admin 디브리핑 기능)
CREATE POLICY "admin_update_all_games"
  ON games FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin() OR user_id = auth.uid());

-- C-9: Admin은 모든 게임을 DELETE 가능 (선택 - 필요 없으면 생략)
-- CREATE POLICY "admin_delete_all_games"
--   ON games FOR DELETE
--   TO authenticated
--   USING (is_admin());


-- ══════════════════════════════════════════════════
-- SECTION D: 검증 쿼리 (적용 후 확인)
-- ══════════════════════════════════════════════════

-- D-1: 정책이 잘 적용되었는지 확인
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'games'
ORDER BY policyname;

-- D-2: 본인 로그인 상태에서 본인 게임만 보이는지 확인
-- (Supabase Dashboard는 일반적으로 service_role로 실행되어 RLS를 무시할 수 있음)
-- 실제 테스트는 클라이언트(앱)에서 해야 정확함
SELECT COUNT(*) AS my_games, user_id
FROM games
WHERE user_id = auth.uid()
GROUP BY user_id;


-- ══════════════════════════════════════════════════
-- SECTION E: ⚠️ 롤백 (문제 발생 시)
-- ══════════════════════════════════════════════════
-- 만약 RLS 적용 후 앱이 동작하지 않으면 아래를 실행하여 즉시 해제

-- RLS 자체를 해제 (모든 정책이 비활성화됨)
-- ALTER TABLE games DISABLE ROW LEVEL SECURITY;

-- 또는 개별 정책만 삭제
-- DROP POLICY IF EXISTS "users_select_own_games" ON games;
-- DROP POLICY IF EXISTS "users_insert_own_games" ON games;
-- DROP POLICY IF EXISTS "users_update_own_games" ON games;
-- DROP POLICY IF EXISTS "users_delete_own_games" ON games;
-- DROP POLICY IF EXISTS "admin_select_all_games" ON games;
-- DROP POLICY IF EXISTS "admin_update_all_games" ON games;


-- ══════════════════════════════════════════════════
-- 📌 Notes
-- ══════════════════════════════════════════════════
--
-- 1. profiles 테이블에 is_admin 컬럼이 없다면:
--    - 대신 coach_credential = 'master' 등으로 판별
--    - is_admin() 함수를 수정하면 됨
--    예시:
--      RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
--        SELECT EXISTS (
--          SELECT 1 FROM profiles
--          WHERE id = auth.uid()
--          AND (is_admin = TRUE OR coach_credential = 'master')
--        );
--      $$;
--
-- 2. Supabase Dashboard에서 SQL 실행은 service_role로 되어 RLS가 우회됨
--    앱 레벨 테스트는 실제 브라우저에서 로그인 후 확인해야 정확함
--
-- 3. RLS 활성화 후 기존 기능이 깨질 수 있으므로:
--    - Kevin 본인(admin)부터 테스트
--    - 다음에 일반 사용자 계정으로 테스트
--    - 양쪽 다 정상 작동 확인 후 운영 적용
--
-- 4. adjust-plays API (server-side)는 service_role 키를 사용하므로
--    RLS 영향을 받지 않음 (그대로 동작)
