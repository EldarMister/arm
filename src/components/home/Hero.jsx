import { Link } from 'react-router-dom'
import { VAT_REFUND_RATE } from '../../lib/vehicleDisplay'

const PRIMARY_WHATSAPP_URL = 'https://wa.me/821056650943'
const VAT_REFUND_PERCENT = Math.round(VAT_REFUND_RATE * 100)

const CarIcon = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M13 6H4l-2 6v5h2m0 0h13m0 0h2v-5l-2-6H9m4 0V4m0 2l2 6M5 12h14"
    />
  </svg>
)

const ArrowIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
)

const PeopleIcon = () => (
  <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
    />
  </svg>
)

const CarSmallIcon = () => (
  <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M13 6H4l-2 6v5h2m0 0h13m0 0h2v-5l-2-6H9m4 0V4m0 2l2 6M5 12h14"
    />
  </svg>
)

const BadgeIcon = () => (
  <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
    />
  </svg>
)

const stats = [
  {
    value: '12-23',
    label: 'дней доставка',
    valueClass: 'stat-val-navy',
  },
  {
    value: `${VAT_REFUND_PERCENT}%`,
    label: 'возврат НДС',
    valueClass: 'stat-val-teal',
  },
  {
    value: '$200',
    label: 'комиссия',
    valueClass: 'stat-val-navy',
  },
  {
    value: '🔥',
    label: 'Срочная продажа',
    to: '/urgent-sale',
    extra: <div className="stat-note">Нажмите чтобы перейти</div>,
    cardClass: 'stat-card-clickable',
  },
  {
    value: '🛠️',
    label: 'Битые авто и запчасти',
    to: '/damaged-stock',
    extra: <div className="stat-note">Нажмите чтобы перейти</div>,
    cardClass: 'stat-card-clickable',
  },
]

const advantages = [
  { icon: <PeopleIcon />, value: '1000+', label: 'Довольных клиентов', labelCls: '' },
  { icon: <CarSmallIcon />, value: '1000+', label: 'Доставленных авто', labelCls: '' },
  { icon: <BadgeIcon />, value: '3+ года', label: 'На рынке', labelCls: '' },
]

const whyReasons = [
  'Экономия: цены ниже рынка',
  'Строгий техосмотр в Корее',
  'Богатая комплектация уже в базе',
  'Отличное качество',
  'Большой выбор: корейцы, немцы, японцы и др.',
  'Доставка в любую точку мира',
]

const logisticsFlags = ['🇰🇬', '🇰🇿', '🇷🇺', '🇺🇿', '🇹🇯', '🇧🇾', '🇦🇿', '🇺🇦', '🇬🇪']

export default function Hero() {
  return (
    <section>
      <div className="hero-video-section">
        <video src="/hero1.mp4" autoPlay muted loop playsInline className="hero-video-banner" />
      </div>

      <div className="hero-section">
        <div className="hero-inner">
          <div className="hero-delivery-badge">
            <span className="badge-globe">🌍</span> Доставка в любую точку мира
          </div>

          <h1 className="hero-title">
            Автомобили из Кореи
            <br />
            в Кыргызстан и другие страны
            <br />
            Доставка 12-23 дня
          </h1>

          <p className="hero-sub">
            Покупайте автомобили из Кореи напрямую без посредников. С площадки Encar возврат НДС {VAT_REFUND_PERCENT}% от стоимости авто. Подберём лучшие
            варианты под ваш бюджет. Выгодные цены для покупки и перепродажи.
          </p>

          <div className="hero-btns" style={{ marginTop: '28px', display: 'flex', gap: '12px' }}>
            <Link to="/catalog" className="btn-primary">
              <CarIcon />
              Посмотреть каталог
            </Link>
            <a href={PRIMARY_WHATSAPP_URL} target="_blank" rel="noreferrer" className="btn-secondary">
              Связаться с нами
              <ArrowIcon />
            </a>
          </div>

          <div className="stats-grid">
            {stats.map(({ value, label, valueClass, extra, to, cardClass = '' }) => {
              const content = (
                <>
                  <div className={`stat-value ${valueClass}`}>{value}</div>
                  <div className="stat-label">{label}</div>
                  {extra}
                </>
              )

              if (to) {
                return (
                  <Link key={label} to={to} className={`stat-card ${cardClass}`.trim()}>
                    {content}
                  </Link>
                )
              }

              return (
                <div key={label} className={`stat-card ${cardClass}`.trim()}>
                  {content}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="why-section">
        <div className="why-inner">
          <h2 className="why-title">Почему автомобили из Кореи?</h2>
          <ul className="why-list">
            {whyReasons.map((reason) => (
              <li key={reason} className="why-list-item">
                <span className="why-list-check">✓</span>
                {reason}
              </li>
            ))}
          </ul>

          <div className="why-logistics-card">
            <div className="why-logistics-title">SHORING-LOGISTICS</div>
            <div className="why-logistics-flags" aria-label="SHORING logistics countries">
              {logisticsFlags.map((flag) => (
                <span key={flag} className="why-logistics-flag">{flag}</span>
              ))}
            </div>
          </div>

          <div className="advantages-grid">
            {advantages.map(({ icon, value, label, labelCls }) => (
              <div key={label} className="adv-item">
                <div className="adv-item-icon">{icon}</div>
                <div className="adv-item-value">{value}</div>
                <div className={`adv-item-label ${labelCls}`}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
