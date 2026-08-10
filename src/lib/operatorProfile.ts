import type { SupabaseClient, User } from '@supabase/supabase-js'

// 로그인/회원가입 직후 operators 프로필 행이 없으면 만든다 (Operator 도메인, BUSINESS_RULES.md
// §2.11). 이메일 인증이 켜져있으면 회원가입 시점엔 세션이 없어 행을 못 만들 수 있으므로,
// "세션이 실제로 생기는 시점"(가입 직후 또는 이메일 인증 후 첫 로그인)마다 공통으로 호출해
// 누락을 막는다 — insert 자체는 RLS(operators_insert_own)가 본인 id로만 허용한다.
export async function ensureOperatorProfile(
  supabase: SupabaseClient,
  user: User,
  displayName?: string,
) {
  const { data: existing } = await supabase
    .from('operators')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  if (!existing) {
    await supabase.from('operators').insert({ id: user.id, display_name: displayName ?? null })
  }
}
