import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// Vercel Cron이 매일 새벽 5시에 호출한다 (vercel.json 참고). Vercel 무료 플랜은 크론이
// 하루 1회만 가능해서, 두 정리 작업을 이 배치 하나에 묶어둔다 — 유료 플랜으로 올리면
// 이 라우트는 그대로 두고 vercel.json의 주기만 매시간으로 좁히면 된다.
// 1. delete_old_rooms — 종료/방치된 PERSONAL 방 정리. 이 앱은 이제 B2B 전용이라 PERSONAL
//    방이 새로 생기지 않으므로 사실상 항상 매치되는 행이 없는 no-op이다. 과거 데이터
//    호환을 위해 RPC 자체는 그대로 남겨둔다(제거해도 얻는 게 없고, 나중에 정말 완전히
//    제거하기로 결정하면 그때 supabase 마이그레이션에서 함께 지운다).
// 2. 마감시간(+1시간)이 지났는데 운영자가 "영업 종료"를 안 누른 BUSINESS 방 자동 마감
//    (Phase 5.5, BUSINESS_RULES.md §2.1 "마감 시간 기반 자동 마감")
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServerSupabaseClient()

  const { error: deleteError } = await supabase.rpc('delete_old_rooms')
  if (deleteError) {
    console.error('[cleanup-rooms] delete_old_rooms error:', deleteError)
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  const { error: closeError } = await supabase.rpc('close_scheduled_business_sessions')
  if (closeError) {
    console.error('[cleanup-rooms] close_scheduled_business_sessions error:', closeError)
    return NextResponse.json({ error: closeError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
