'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import jsQR from 'jsqr'

// QR 스캔 카메라 (Phase 9, 홈 지도 "입장"). 후면 카메라를 열어 매장 고정 QR을 인식한다.
// QR에는 매장 랜딩 URL(.../v/[venueId])이 담겨 있고, 인식되면 그 경로로 이동한다 —
// 실제 비밀번호/위치 반경 검증은 여전히 /v/[id] 화면이 담당한다(BUSINESS_RULES.md §2.1~2.3).
export default function QRScanner({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [handled, setHandled] = useState(false)

  useEffect(() => {
    let cancelled = false

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('이 브라우저는 카메라를 지원하지 않아요')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play()
          tick()
        }
      } catch {
        setError('카메라 권한이 필요해요. 브라우저 설정에서 카메라를 허용해주세요.')
      }
    }

    const tick = () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) { rafRef.current = requestAnimationFrame(tick); return }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
      if (code && code.data) {
        onDetect(code.data)
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    const onDetect = (raw: string) => {
      setHandled(true)
      // QR이 URL이면 경로만 뽑아 내부 이동, 아니면 매장 id로 보고 /v/[id]로 이동한다.
      let target: string | null = null
      try {
        const url = new URL(raw)
        if (url.pathname.startsWith('/v/')) target = url.pathname
      } catch {
        // URL이 아니면 uuid(매장 id) 형태인지 확인
        if (/^[0-9a-f-]{16,}$/i.test(raw.trim())) target = `/v/${raw.trim()}`
      }
      if (target) {
        stop()
        router.push(target)
      } else {
        setError('LIview 매장 QR이 아니에요. 매장에 비치된 QR을 스캔해주세요.')
        setHandled(false)
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    start()
    return () => { cancelled = true; stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, background: '#000', display: 'flex', flexDirection: 'column' }}>
      <video ref={videoRef} playsInline muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* 스캔 가이드 프레임 */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ width: 240, height: 240, border: '3px solid var(--accent)', borderRadius: 24, boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)' }} />
      </div>

      {/* 상단 안내 + 닫기 */}
      <div style={{ position: 'relative', zIndex: 2, padding: '20px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>매장 QR 스캔</p>
        <button onClick={() => { stop(); onClose() }} aria-label="닫기"
          style={{ width: 36, height: 36, borderRadius: 999, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>

      {/* 하단 안내/에러 */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 40, zIndex: 2, textAlign: 'center', padding: '0 24px' }}>
        {error ? (
          <div style={{ background: 'rgba(0,0,0,0.7)', borderRadius: 14, padding: '14px 18px', display: 'inline-block' }}>
            <p style={{ fontSize: 13, color: '#fff', marginBottom: error.includes('권한') || error.includes('지원') ? 12 : 0 }}>{error}</p>
            {(error.includes('권한') || error.includes('지원')) && (
              <button className="btn btn-secondary" onClick={() => { stop(); onClose() }} style={{ minHeight: 40, maxWidth: 140, margin: '0 auto' }}>닫기</button>
            )}
          </div>
        ) : !handled ? (
          <p style={{ fontSize: 13, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.7)' }}>매장에 비치된 QR을 프레임 안에 맞춰주세요</p>
        ) : null}
      </div>
    </div>
  )
}
