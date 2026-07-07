import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

interface ReactionSummary {
  heart_counts: Record<string, number>
  warning_counts: Record<string, number>
  mood_average: number | null
  total_reactions: number
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const room_id = searchParams.get('room_id')

  if (!room_id) {
    return NextResponse.json({ error: 'room_id가 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase.rpc('get_reaction_summary', { p_room_id: room_id })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const summary = data as ReactionSummary
  return NextResponse.json({ summary })
}
