import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'mySTAR — 술자리 실시간 피드백',
  description: '아는 사람끼리 모임에서 익명으로 마음을 표현해요',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0a0a0f',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="antialiased">
        {/* min-height 대신 relative만 유지 — 페이지별 높이는 각 페이지의 <main>이 직접
            결정한다. 부모까지 dvh 기반 높이를 중복으로 잡으면, 모바일 브라우저에서
            주소창 표시/숨김에 따라 dvh 값이 각기 다른 시점에 계산되어 실제 뷰포트보다
            큰 스크롤 영역이 생기는 문제가 있었다. */}
        <div className="max-w-md mx-auto relative">
          {children}
        </div>
      </body>
    </html>
  )
}
