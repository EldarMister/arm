import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTheme } from '../../hooks/useTheme'

const SearchIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
)

const UserIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
)

const MenuIcon = () => (
  <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
)

const CloseIcon = () => (
  <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const SunIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="5" strokeWidth={2}/>
    <path strokeLinecap="round" strokeWidth={2}
      d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
  </svg>
)

const MoonIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
  </svg>
)

const TLVLogo = () => (
  <Link to="/" className="header-logo">
    <div>
      <div style={{ display: 'flex', alignItems: 'center', lineHeight: 1 }}>
        <span className="logo-tl">TL</span>
        <span className="logo-v">V</span>
      </div>
      <div className="logo-sub">AUTO</div>
    </div>
  </Link>
)

const navLinks = [
  { label: 'Главная', to: '/' },
  { label: 'Каталог', to: '/catalog' },
  { label: 'Контакты', to: '/contacts' },
]

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()
  const { theme, toggle } = useTheme()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`site-header${scrolled ? ' site-header-scrolled' : ''}`}>
      <div className="header-row">

        {/* Logo */}
        <TLVLogo />

        {/* Desktop Nav */}
        <nav className="header-nav">
          {navLinks.map(({ label, to }) => (
            <Link
              key={to}
              to={to}
              className={location.pathname === to ? 'active' : ''}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Desktop Search */}
        <div className="header-search">
          <span className="header-search-icon">
            <SearchIcon />
          </span>
          <input
            type="text"
            placeholder="VIN / Encar ID"
            className="search-input"
          />
        </div>

        {/* Theme toggle — desktop */}
        <button
          className="theme-toggle"
          onClick={e => toggle(e)}
          title={theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
        >
          {theme === 'light' ? <MoonIcon /> : <SunIcon />}
        </button>

        {/* Desktop Login */}
        <button className="header-login">
          <UserIcon />
          Войти
        </button>

        {/* Mobile controls */}
        <div className="header-mobile-controls">
          <button
            className="header-icon-btn"
            onClick={() => setMobileOpen(v => v === 'search' ? false : 'search')}
          >
            <SearchIcon />
          </button>
          <button className="theme-toggle" onClick={e => toggle(e)} title="Сменить тему" style={{ width: 32, height: 32 }}>
            {theme === 'light' ? <MoonIcon /> : <SunIcon />}
          </button>
          <button
            className="header-icon-btn"
            onClick={() => setMobileOpen(v => v === 'menu' ? false : 'menu')}
          >
            {mobileOpen === 'menu' ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {/* Mobile search dropdown */}
      {mobileOpen === 'search' && (
        <div className="header-mobile-menu">
          <div className="mobile-search-wrap">
            <span className="header-search-icon" style={{ top: '50%' }}>
              <SearchIcon />
            </span>
            <input
              autoFocus
              type="text"
              placeholder="VIN / Encar ID"
              className="search-input"
            />
          </div>
        </div>
      )}

      {/* Mobile nav dropdown */}
      {mobileOpen === 'menu' && (
        <div className="header-mobile-menu">
          {navLinks.map(({ label, to }) => (
            <Link
              key={to}
              to={to}
              className={`mobile-nav-link${location.pathname === to ? ' active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              {label}
            </Link>
          ))}
          <button className="mobile-login-btn">
            <UserIcon />
            Войти
          </button>
        </div>
      )}
    </header>
  )
}
