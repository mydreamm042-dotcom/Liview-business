'use client'

import { useRouter } from 'next/navigation'

// 운영자 전용 화면의 로드 실패/권한 없음 안내 (로그인 유도 + 홈으로). 4개 설정 하위 화면에
// 바이트 단위로 동일한 마크업이 중복돼있던 것을 뽑았다 (순수 추출 리팩토링).
export default function ErrorScreen({ message }: { message: string }) {
  const router = useRouter()
  return (
    <main className="flex flex-col min-h-dvh px-6" style={{ paddingTop: 56 }}>
      <p style={{ color: 'var(--accent)', fontSize: 14 }}>{message}</p>
      <button className="btn btn-primary" onClick={() => router.push('/operator/login')} style={{ marginTop: 16 }}>로그인하러 가기</button>
      <button className="btn btn-ghost" onClick={() => router.push('/')} style={{ marginTop: 8 }}>홈으로</button>
    </main>
  )
}
