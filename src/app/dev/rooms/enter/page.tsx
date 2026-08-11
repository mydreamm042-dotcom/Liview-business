'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { setSessionToken, storeRoomData } from '@/lib/session'
import LoadingScreen from '@/components/LoadingScreen'

// /dev/rooms의 "테스트 입장"이 만든 링크를 소비하는 화면. 일부러 로그인(운영자 인증)을
// 요구하지 않는다 — 이 화면의 존재 이유 자체가 "운영자 로그인 세션이 없는 브라우저에서
// 열어야 진짜 손님 화면(호스트 아님)이 보인다"는 것이기 때문이다. 방 화면의 isHost는
// Supabase Auth 세션으로만 판정되므로(참여자 session_token과 무관), 운영자로 로그인된
// 같은 탭에서는 아무리 손님 세션으로 바꿔도 계속 운영자 화면이 뜬다 — 그래서 이 링크를
// 시크릿창 등 로그인 안 된 컨텍스트에서 열도록 안내한다.
export default function DevRoomsEnterPage() {
  const router = useRouter()
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const url = new URL(window.location.href)
    const code = url.searchParams.get('code')
    const token = url.searchParams.get('token')
    const roomId = url.searchParams.get('roomId')
    const roomName = url.searchParams.get('roomName')
    const participantId = url.searchParams.get('participantId')
    const nickname = url.searchParams.get('nickname')

    if (!code || !token || !roomId || !roomName || !participantId || !nickname) {
      router.replace('/dev/rooms')
      return
    }

    setSessionToken(token)
    storeRoomData({ roomId, roomCode: code, roomName, participantId, nickname })
    router.replace(`/room/${code}`)
  }, [router])

  return <LoadingScreen label="테스트 손님으로 입장하는 중..." />
}
