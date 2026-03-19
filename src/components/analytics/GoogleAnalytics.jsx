import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || 'G-T87WYYCK02'
const IS_ANALYTICS_ENABLED = Boolean(GA_MEASUREMENT_ID)
  && (import.meta.env.PROD || import.meta.env.VITE_ENABLE_ANALYTICS_IN_DEV === 'true')

function loadGtag(measurementId) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false

  const scriptId = `gtag-${measurementId}`
  if (document.getElementById(scriptId)) return true

  window.dataLayer = window.dataLayer || []
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments)
  }

  const script = document.createElement('script')
  script.id = scriptId
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
  document.head.appendChild(script)

  window.gtag('js', new Date())
  window.gtag('config', measurementId, {
    send_page_view: false,
    anonymize_ip: true,
  })

  return true
}

export default function GoogleAnalytics() {
  const location = useLocation()
  const initializedRef = useRef(false)
  const pageViewTimerRef = useRef(null)

  useEffect(() => {
    if (!IS_ANALYTICS_ENABLED || initializedRef.current) return
    initializedRef.current = loadGtag(GA_MEASUREMENT_ID)
  }, [])

  useEffect(() => {
    if (!IS_ANALYTICS_ENABLED || typeof window === 'undefined' || !window.gtag) return undefined

    if (pageViewTimerRef.current) {
      window.clearTimeout(pageViewTimerRef.current)
      pageViewTimerRef.current = null
    }

    const pagePath = `${location.pathname}${location.search}${location.hash}`
    pageViewTimerRef.current = window.setTimeout(() => {
      pageViewTimerRef.current = null
      const dedupeKey = `${pagePath}|${document.title}`
      const lastKey = window.__gaLastPageViewKey
      const lastAt = window.__gaLastPageViewAt || 0

      if (lastKey === dedupeKey && Date.now() - lastAt < 1000) return

      window.__gaLastPageViewKey = dedupeKey
      window.__gaLastPageViewAt = Date.now()

      window.gtag('event', 'page_view', {
        page_path: pagePath,
        page_location: window.location.href,
        page_title: document.title,
        send_to: GA_MEASUREMENT_ID,
      })
    }, 0)

    return () => {
      if (!pageViewTimerRef.current) return
      window.clearTimeout(pageViewTimerRef.current)
      pageViewTimerRef.current = null
    }
  }, [location.hash, location.pathname, location.search])

  return null
}
