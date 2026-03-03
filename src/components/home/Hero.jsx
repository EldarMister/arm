import { Link } from 'react-router-dom'

const CarIcon = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M13 6H4l-2 6v5h2m0 0h13m0 0h2v-5l-2-6H9m4 0V4m0 2l2 6M5 12h14" />
  </svg>
)

const ArrowIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
)

const PeopleIcon = () => (
  <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

const CarSmallIcon = () => (
  <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M13 6H4l-2 6v5h2m0 0h13m0 0h2v-5l-2-6H9m4 0V4m0 2l2 6M5 12h14" />
  </svg>
)

const BadgeIcon = () => (
  <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
  </svg>
)

const stats = [
  { value: '12-23', label: 'дней доставка', cls: 'stat-val-navy' },
  { value: '7%',    label: 'возврат НДС',   cls: 'stat-val-teal' },
  { value: '$200',  label: 'комиссия',      cls: 'stat-val-navy' },
]

const advantages = [
  { icon: <PeopleIcon />, value: '1000+', label: 'Довольных клиентов', labelCls: '' },
  { icon: <CarSmallIcon />, value: '1000+', label: 'Доставленных авто', labelCls: '' },
  { icon: <BadgeIcon />, value: '3+ года', label: 'На рынке', labelCls: 'adv-label-accent' },
]

const whyReasons = [
  'Экономия — цены ниже рынка',
  'Строгий техосмотр в Корее',
  'Богатая комплектация уже в базе',
  'Отличное качество кузова и двигателя',
  'Богатый выбор: Корейцы, Немцы, Японцы и др.',
]

export default function Hero() {
  return (
    <section>
      {/* ── Hero ── */}
      <div className="hero-section">
        <div className="hero-inner">

          <h1 className="hero-title">
            Автомобили из Кореи<br />
            с доставкой за 12-23 дней
          </h1>

          <p className="hero-sub">
            Покупайте качественные корейские автомобили с площадки Encar.{' '}
            Полная диагностика, возврат НДС и доставка под ключ.
          </p>

          {/* CTA Buttons */}
          <div className="hero-btns" style={{ marginTop: '28px', display: 'flex', gap: '12px' }}>
            <Link to="/catalog" className="btn-primary">
              <CarIcon />
              Посмотреть каталог
            </Link>
            <Link to="/contacts" className="btn-secondary">
              Связаться с нами
              <ArrowIcon />
            </Link>
          </div>

          {/* Stats */}
          <div className="stats-grid">
            {stats.map(({ value, label, cls }) => (
              <div key={label} className="stat-card">
                <div className={`stat-value ${cls}`}>{value}</div>
                <div className="stat-label">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Why Korea ── */}
      <div className="why-section">
        <div className="why-inner">
          <h2 className="why-title">
            Почему автомобили из Кореи?
          </h2>
          <ul className="why-list">
            {whyReasons.map((reason) => (
              <li key={reason} className="why-list-item">
                <span className="why-list-check">✓</span>
                {reason}
              </li>
            ))}
          </ul>

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
