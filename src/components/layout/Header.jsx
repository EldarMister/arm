import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  SignInButton,
  UserButton,
  useClerk,
  useUser,
} from '@clerk/clerk-react'
import { useTheme } from '../../hooks/useTheme'
import { getClerkUserLabel, isClerkConfigured } from '../../lib/clerk'
import logoImg from '../../assets/logo.png'

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
    <circle cx="12" cy="12" r="5" strokeWidth={2} />
    <path
      strokeLinecap="round"
      strokeWidth={2}
      d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
    />
  </svg>
)

const MoonIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
    />
  </svg>
)

const AVTLogo = () => (
  <Link to="/" className="header-logo">
    <img src={logoImg} alt="AVT Auto V Korea" className="header-logo-img" />
  </Link>
)

const navLinks = [
  { label: 'Главная', to: '/' },
  { label: 'Каталог', to: '/catalog' },
  { label: 'Контакты', to: '/contacts' },
]

function AuthButtonContent({ label }) {
  return (
    <>
      <UserIcon />
      {label}
    </>
  )
}

function DisabledAuthButton({ mobile = false }) {
  const className = mobile ? 'mobile-login-btn' : 'header-login'

  return (
    <button
      className={className}
      disabled
      title="Добавь VITE_CLERK_PUBLISHABLE_KEY для Clerk"
      type="button"
    >
      <AuthButtonContent label="Войти" />
    </button>
  )
}

function ClerkAuthControl({ mobile = false, onAction }) {
  const { isLoaded, isSignedIn, user } = useUser()
  const { openUserProfile } = useClerk()
  const buttonClassName = mobile ? 'mobile-login-btn' : 'header-login'

  if (!isLoaded) {
    return (
      <button className={buttonClassName} disabled type="button">
        <AuthButtonContent label="..." />
      </button>
    )
  }

  if (!isSignedIn || !user) {
    return (
      <SignInButton mode="modal">
        <button
          className={buttonClassName}
          onClick={() => onAction?.()}
          title="Войти"
          type="button"
        >
          <AuthButtonContent label="Войти" />
        </button>
      </SignInButton>
    )
  }

  const label = getClerkUserLabel(user)
  const authenticatedClassName = `${buttonClassName} ${mobile ? 'mobile-login-btn-authenticated' : 'header-login-authenticated'}`
  const rowClassName = mobile ? 'mobile-auth-row' : 'header-auth-row'

  return (
    <div className={rowClassName}>
      <button
        className={authenticatedClassName}
        onClick={() => {
          onAction?.()
          openUserProfile()
        }}
        title={label}
        type="button"
      >
        <AuthButtonContent label={label} />
      </button>
      <div className="clerk-user-button-wrap">
        <UserButton afterSignOutUrl="/" />
      </div>
    </div>
  )
}

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchDirty, setSearchDirty] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const clerkConfigured = isClerkConfigured()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    setSearchTerm(params.get('q') || '')
  }, [location.search])

  useEffect(() => {
    if (!searchDirty) return

    const currentQuery = new URLSearchParams(location.search).get('q') || ''
    const nextQuery = searchTerm.trim()
    if (currentQuery === nextQuery && location.pathname === '/catalog') {
      setSearchDirty(false)
      return
    }

    const timer = setTimeout(() => {
      if (!nextQuery && location.pathname !== '/catalog' && !currentQuery) {
        setSearchDirty(false)
        return
      }

      const params = new URLSearchParams(location.search)
      if (nextQuery) params.set('q', nextQuery)
      else params.delete('q')

      navigate(`/catalog${params.toString() ? `?${params}` : ''}`, { replace: true })
      setSearchDirty(false)
    }, 250)

    return () => clearTimeout(timer)
  }, [searchDirty, searchTerm, location.pathname, location.search, navigate])

  const submitSearch = (event) => {
    event.preventDefault()
    const query = searchTerm.trim()
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    navigate(`/catalog${params.toString() ? `?${params}` : ''}`, { replace: true })
    setMobileOpen(false)
    setSearchDirty(false)
  }

  const handleSearchChange = (value) => {
    setSearchTerm(value)
    setSearchDirty(true)
  }

  return (
    <header className={`site-header${scrolled ? ' site-header-scrolled' : ''}`}>
      <div className="header-row">
        <AVTLogo />

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

        <form className="header-search" onSubmit={submitSearch}>
          <span className="header-search-icon">
            <SearchIcon />
          </span>
          <input
            type="text"
            placeholder="Марка / модель / VIN / Encar ID"
            className="search-input"
            value={searchTerm}
            onChange={(event) => handleSearchChange(event.target.value)}
          />
        </form>

        <button
          className="theme-toggle"
          onClick={(event) => toggle(event)}
          title={theme === 'light' ? 'Темная тема' : 'Светлая тема'}
        >
          {theme === 'light' ? <MoonIcon /> : <SunIcon />}
        </button>

        {clerkConfigured
          ? <ClerkAuthControl />
          : <DisabledAuthButton />}

        <div className="header-mobile-controls">
          <button
            className="header-icon-btn"
            onClick={() => setMobileOpen((value) => (value === 'search' ? false : 'search'))}
          >
            <SearchIcon />
          </button>
          <button className="theme-toggle" onClick={(event) => toggle(event)} title="Сменить тему" style={{ width: 32, height: 32 }}>
            {theme === 'light' ? <MoonIcon /> : <SunIcon />}
          </button>
          <button
            className="header-icon-btn"
            onClick={() => setMobileOpen((value) => (value === 'menu' ? false : 'menu'))}
          >
            {mobileOpen === 'menu' ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {mobileOpen === 'search' && (
        <div className="header-mobile-menu">
          <form className="mobile-search-wrap" onSubmit={submitSearch}>
            <span className="header-search-icon" style={{ top: '50%' }}>
              <SearchIcon />
            </span>
            <input
              autoFocus
              type="text"
              placeholder="Марка / модель / VIN / Encar ID"
              className="search-input"
              value={searchTerm}
              onChange={(event) => handleSearchChange(event.target.value)}
            />
          </form>
        </div>
      )}

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
          {clerkConfigured
            ? (
                <ClerkAuthControl
                  mobile
                  onAction={() => setMobileOpen(false)}
                />
              )
            : <DisabledAuthButton mobile />}
        </div>
      )}
    </header>
  )
}
