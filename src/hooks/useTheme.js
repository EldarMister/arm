import { useState, useEffect } from 'react'

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('tlv-theme')
    if (saved) return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('tlv-theme', theme)
  }, [theme])

  const toggle = (event) => {
    const newTheme = theme === 'light' ? 'dark' : 'light'

    // Fallback — без анимации если API не поддерживается
    if (!document.startViewTransition) {
      setTheme(newTheme)
      return
    }

    // Координаты кнопки — откуда расходится круг
    const btn = event?.currentTarget
    const rect = btn?.getBoundingClientRect()
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2
    const y = rect ? rect.top + rect.height / 2 : 32

    // Радиус до самого дальнего угла экрана
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    )

    const transition = document.startViewTransition(() => {
      document.documentElement.setAttribute('data-theme', newTheme)
      localStorage.setItem('tlv-theme', newTheme)
      setTheme(newTheme)
    })

    transition.ready.then(() => {
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`,
      ]

      document.documentElement.animate(
        { clipPath },
        {
          duration: 1000,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          pseudoElement: '::view-transition-new(root)',
        }
      )
    })
  }

  return { theme, toggle }
}
