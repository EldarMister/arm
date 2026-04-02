import { useEffect, useRef } from 'react'

const TURNSTILE_SCRIPT_ID = 'tlv-turnstile-script'
const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let turnstileScriptPromise = null

function ensureTurnstileScript() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Turnstile is not available during SSR'))
  }

  if (window.turnstile?.render) {
    return Promise.resolve(window.turnstile)
  }

  if (turnstileScriptPromise) {
    return turnstileScriptPromise
  }

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(TURNSTILE_SCRIPT_ID)

    const handleLoad = () => {
      if (window.turnstile?.render) {
        resolve(window.turnstile)
        return
      }

      turnstileScriptPromise = null
      reject(new Error('Turnstile script loaded without API'))
    }

    const handleError = () => {
      turnstileScriptPromise = null
      reject(new Error('Failed to load Turnstile script'))
    }

    if (existingScript) {
      existingScript.addEventListener('load', handleLoad, { once: true })
      existingScript.addEventListener('error', handleError, { once: true })
      return
    }

    const script = document.createElement('script')
    script.id = TURNSTILE_SCRIPT_ID
    script.src = TURNSTILE_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener('error', handleError, { once: true })
    document.head.appendChild(script)
  })

  return turnstileScriptPromise
}

export default function TurnstileWidget({
  siteKey,
  onError,
  onTokenChange,
  theme = 'auto',
}) {
  const containerRef = useRef(null)
  const widgetIdRef = useRef(null)

  useEffect(() => {
    let disposed = false

    async function renderWidget() {
      if (!siteKey || !containerRef.current) return

      try {
        const turnstile = await ensureTurnstileScript()
        if (disposed || !containerRef.current) return

        containerRef.current.innerHTML = ''
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          action: 'register',
          callback: (token) => {
            onTokenChange?.(String(token || ''))
          },
          'expired-callback': () => {
            onTokenChange?.('')
          },
          'error-callback': () => {
            onTokenChange?.('')
            onError?.('Не удалось загрузить каптчу. Обновите страницу и повторите попытку.')
          },
        })
      } catch {
        if (disposed) return
        onTokenChange?.('')
        onError?.('Не удалось загрузить каптчу. Обновите страницу и повторите попытку.')
      }
    }

    renderWidget()

    return () => {
      disposed = true
      onTokenChange?.('')

      if (widgetIdRef.current !== null && typeof window !== 'undefined' && window.turnstile?.remove) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch {
          // Ignore widget cleanup issues.
        }
      }

      widgetIdRef.current = null
    }
  }, [onError, onTokenChange, siteKey, theme])

  return <div className="auth-modal-captcha" ref={containerRef} />
}
