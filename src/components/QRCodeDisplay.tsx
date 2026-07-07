'use client'

import { QRCodeSVG } from 'qrcode.react'

interface Props { url: string; code: string; roomName: string }

export default function QRCodeDisplay({ url, code, roomName }: Props) {
  const handleCopy = () => navigator.clipboard.writeText(url)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <p style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{roomName}</p>
      <p style={{ fontSize: 13, color: 'var(--muted2)', marginBottom: 20 }}>QR 스캔 또는 코드로 참여</p>
      <div style={{ padding: 16, borderRadius: 20, background: '#fff', marginBottom: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
        <QRCodeSVG value={url} size={180} />
      </div>
      <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: '0.25em', color: 'var(--accent)', marginBottom: 16 }}>{code}</div>
      <button className="btn btn-secondary" onClick={handleCopy} style={{ fontSize: 15 }}>🔗 링크 복사하기</button>
    </div>
  )
}
