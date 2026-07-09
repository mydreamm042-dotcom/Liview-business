import { useEffect, useState } from 'react'

export interface KakaoMapInstance {
  setCenter: (position: unknown) => void
  relayout: () => void
}

declare global {
  interface Window {
    kakao: {
      maps: {
        load: (cb: () => void) => void
        Map: new (container: HTMLElement, options: unknown) => KakaoMapInstance
        LatLng: new (lat: number, lng: number) => unknown
        Marker: new (options: unknown) => { setMap: (map: unknown) => void }
        MarkerImage: new (src: string, size: unknown, options?: unknown) => unknown
        Size: new (w: number, h: number) => unknown
        event: {
          addListener: (target: unknown, type: string, handler: () => void) => void
          trigger: (target: unknown, type: string) => void
        }
      }
    }
  }
}

let loadPromise: Promise<void> | null = null

// 카카오맵 SDK를 1회만 로드한다. NEXT_PUBLIC_KAKAO_MAP_KEY가 없으면 로드하지 않고
// 에러 상태를 반환해, 홈 화면이 무한 로딩에 빠지지 않도록 한다.
function loadKakaoSdk(): Promise<void> {
  if (loadPromise) return loadPromise

  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY
  if (!appKey) {
    return Promise.reject(new Error('NEXT_PUBLIC_KAKAO_MAP_KEY가 설정되지 않았습니다'))
  }

  loadPromise = new Promise((resolve, reject) => {
    if (window.kakao?.maps) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`
    script.async = true
    script.onload = () => {
      window.kakao.maps.load(() => resolve())
    }
    script.onerror = () => reject(new Error('카카오맵 SDK 로드 실패'))
    document.head.appendChild(script)
  })

  return loadPromise
}

export function useKakaoMapSdk() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadKakaoSdk()
      .then(() => { if (!cancelled) setStatus('ready') })
      .catch(e => {
        if (!cancelled) {
          setStatus('error')
          setError(e instanceof Error ? e.message : '지도를 불러올 수 없습니다')
        }
      })
    return () => { cancelled = true }
  }, [])

  return { status, error }
}

export interface GeoPosition {
  lat: number
  lng: number
}

// 참여자 위치 권한 요청. 거부/실패 시에도 화면이 멈추지 않도록 상태를 명확히 구분한다.
// locate()로 수동 재요청 가능 — "현재 위치로 이동" 버튼에서 사용한다 (처음에 거부했어도
// 버튼을 누르면 브라우저가 다시 권한을 물어볼 수 있고, 이미 허용된 상태면 바로 갱신된다).
export function useGeolocation() {
  const [position, setPosition] = useState<GeoPosition | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'denied' | 'unsupported'>('loading')

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setStatus('unsupported')
      return
    }
    setStatus('loading')
    navigator.geolocation.getCurrentPosition(
      pos => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setStatus('ready')
      },
      () => setStatus('denied'),
      // 버튼으로 직접 누른 요청은 정확도를 우선한다 (자동 최초 요청은 배터리 고려해 저정확도).
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    )
  }

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unsupported')
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setStatus('ready')
      },
      () => setStatus('denied'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
    )
  }, [])

  return { position, status, locate }
}
