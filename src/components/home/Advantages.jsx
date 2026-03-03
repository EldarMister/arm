const ShieldIcon = () => (
  <svg width="24" height="24" fill="none" stroke="#64748b" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
)

const ClockIcon = () => (
  <svg width="24" height="24" fill="none" stroke="#64748b" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" strokeWidth={1.8}/>
    <polyline points="12 6 12 12 16 14" strokeWidth={1.8} strokeLinecap="round"/>
  </svg>
)

const PercentIcon = () => (
  <svg width="24" height="24" fill="none" stroke="#64748b" viewBox="0 0 24 24">
    <line x1="19" y1="5" x2="5" y2="19" strokeWidth={1.8} strokeLinecap="round"/>
    <circle cx="6.5" cy="6.5" r="2.5" strokeWidth={1.8}/>
    <circle cx="17.5" cy="17.5" r="2.5" strokeWidth={1.8}/>
  </svg>
)

const MoneyIcon = () => (
  <svg width="24" height="24" fill="none" stroke="#64748b" viewBox="0 0 24 24">
    <rect x="2" y="5" width="20" height="14" rx="2" strokeWidth={1.8} strokeLinecap="round"/>
    <line x1="2" y1="10" x2="22" y2="10" strokeWidth={1.8}/>
  </svg>
)

const advantages = [
  {
    icon: <ShieldIcon />,
    title: 'Гарантия качества',
    desc: 'Все автомобили проходят детальную диагностику на Encar. Полная проверка истории и технического состояния.',
  },
  {
    icon: <ClockIcon />,
    title: 'Быстрая доставка',
    desc: 'Доставка автомобилей из Кореи занимает всего 12-23 дней. Мы контролируем весь процесс.',
  },
  {
    icon: <PercentIcon />,
    title: 'Возврат 7% НДС',
    desc: 'При экспорте автомобиля из Кореи вы получаете возврат 7% НДС от стоимости автомобиля.',
  },
  {
    icon: <MoneyIcon />,
    title: 'Фиксированная комиссия $300',
    desc: 'Наша комиссия за услуги составляет всего $300. Никаких скрытых платежей.',
  },
]

export default function Advantages() {
  return (
    <section className="advantages-section">
      <div className="section-inner">
        <h2 className="section-title reveal">Наши преимущества</h2>
        <p className="section-subtitle reveal reveal-delay-1">
          Почему клиенты выбирают AVT Auto V Korea для покупки автомобилей из Кореи
        </p>

        <div className="adv-grid">
          {advantages.map(({ icon, title, desc }, i) => (
            <div className={`adv-card reveal reveal-delay-${i + 1}`} key={title}>
              <div className="adv-icon-wrap">{icon}</div>
              <h3 className="adv-card-title">{title}</h3>
              <p className="adv-card-desc">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
