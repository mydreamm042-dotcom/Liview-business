'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { GAP, TYPE, ICON } from '@/lib/design'
import Icon from '@/components/Icon'

// 없는 경로 폴백 (ADR-0009). 404를 그대로 보여주지 않고 홈 지도로 되돌린다.
//
// 왜: 이 앱의 손님 진입 경로는 QR/링크 공유(`/v/[매장id]`)라, 링크가 잘려서 전달되거나 매장이
// 지워진 뒤에 눌리는 일이 실제로 생긴다. 그 손님에게 막다른 404를 보여주면 이탈로 끝나지만,
// 홈 지도로 보내면 "주변 매장 찾기"라는 다음 행동이 남는다.
//
// `replace`인 이유: `push`면 잘못된 URL이 히스토리에 남아, 홈에서 뒤로가기를 누른 손님이
// 다시 이 화면으로 튕겨 들어온다.
//
// 화면을 잠깐이라도 보여주는 이유: 리다이렉트만 하면 흰 화면이 스쳤다가 홈이 떠서, 손님은
// 자기가 뭘 눌렀는데 아무 일도 안 일어난 것처럼 느낀다. 무슨 일이 있었는지 한 줄로 알려준다.
export default function NotFound() {
  const router = useRouter()

  useEffect(() => {
    const timer = setTimeout(() => router.replace('/'), 1200)
    return () => clearTimeout(timer)
  }, [router])

  return (
    <main className="flex flex-col min-h-dvh px-6" style={{
      alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: GAP.base,
    }}>
      <span style={{ color: 'var(--muted)' }}>
        <Icon name="search" size={ICON.hero} />
      </span>
      <h1 style={TYPE.heading}>없는 주소예요</h1>
      <p style={TYPE.caption}>홈으로 이동할게요. 주변 매장을 다시 찾아보세요</p>
      {/* 자동 이동이 막히는 환경(리다이렉트 차단 등)에서도 손으로 나갈 길을 남긴다 */}
      <button className="btn btn-secondary" onClick={() => router.replace('/')}
        style={{ marginTop: GAP.base, width: 'auto', padding: '0 24px', minHeight: 48 }}>
        홈으로 가기
      </button>
    </main>
  )
}
