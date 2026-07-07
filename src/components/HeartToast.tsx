'use client'

import { useEffect, useState } from 'react'

interface Toast { id: string; message: string; emoji: string; color: string }

let addToastFn: ((toast: Omit<Toast, 'id'>) => void) | null = null

export function showToast(toast: Omit<Toast, 'id'>) {
  addToastFn?.(toast)
}

export default function HeartToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    addToastFn = (t) => {
      const id = Math.random().toString(36).slice(2)
      setToasts(prev => [...prev, { ...t, id }])
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 3000)
    }
    return () => { addToastFn = null }
  }, [])

  return (
    <div style={{ position: 'fixed', bottom: 120, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 448, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '0 24px', zIndex: 30, pointerEvents: 'none' }}>
      {toasts.map(t => (
        <div key={t.id} className="animate-fade-in" style={{ background: 'rgba(20,20,32,0.95)', border: `1px solid ${t.color}40`, borderRadius: 16, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, backdropFilter: 'blur(12px)', boxShadow: `0 8px 24px ${t.color}30` }}>
          <span style={{ fontSize: 24 }}>{t.emoji}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: t.color }}>{t.message}</span>
        </div>
      ))}
    </div>
  )
}
