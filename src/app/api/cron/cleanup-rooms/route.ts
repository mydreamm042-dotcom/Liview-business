import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// Vercel Cron이 주기적으로 호출한다 (vercel.json 참고).
// 종료된 지 24시간 지난 방 + 종료 안 된 채로 2일 지난 방을 정리한다.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.rpc('delete_old_rooms')

  if (error) {
    console.error('[cleanup-rooms] rpc error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
