'use client'

import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  return (
    <main className="flex flex-col min-h-dvh px-6" style={{ paddingTop: '80px', paddingBottom: '40px' }}>
      {/* 헤더 */}
      <div className="animate-fade-in" style={{ marginBottom: '60px', textAlign: 'center' }}>
        <div style={{
          width: 72, height: 72,
          borderRadius: 22,
          background: 'linear-gradient(135deg, #ff6b6b, #ee4444)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 36,
          marginBottom: 24,
          boxShadow: '0 12px 32px rgba(255,107,107,0.4)',
          margin: '0 auto 24px',
        }}>👁️</div>
        <h1 style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.15, marginBottom: 10, letterSpacing: '-0.5px' }}>
          noonchi - demo
        </h1>
        <p style={{ color: 'var(--muted2)', fontSize: 15, lineHeight: 1.6 }}>
          모임에서 익명으로<br />마음을 표현해요 ✨
        </p>
      </div>

      {/* 기능 소개 */}
      <div className="animate-fade-in" style={{ marginBottom: 40, animationDelay: '0.1s', opacity: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { emoji: '💖', label: '익명 하트', desc: '호감을 몰래 전달' },
            { emoji: '⭐', label: '분위기 별점', desc: '지금 이 자리 몇 점?' },
            { emoji: '🤫', label: '자제 시그널', desc: '살짝 과할 때 신호' },
            { emoji: '📊', label: '결과 리포트', desc: '오늘의 하이라이트' },
          ].map(f => (
            <div key={f.label} className="card-sm" style={{ padding: '16px 14px' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{f.emoji}</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{f.label}</div>
              <div style={{ fontSize: 11, color: 'var(--muted2)' }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 버튼 */}
      <div className="animate-slide-up" style={{ animationDelay: '0.2s', opacity: 0 }}>
        <button className="btn btn-primary" style={{ marginBottom: 12, fontSize: 17 }}
          onClick={() => router.push('/create')}>
          🍻 방 만들기
        </button>
        <button className="btn btn-secondary" style={{ fontSize: 17 }}
          onClick={() => router.push('/join')}>
          🔗 방 참여하기
        </button>
      </div>

      <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 24 }}>
        앱 설치 없이 링크/QR로 참여 가능
      </p>
    </main>
  )
}
