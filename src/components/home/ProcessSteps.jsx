import { Link } from 'react-router-dom'

const SearchIcon = () => (
  <svg width="22" height="22" fill="none" stroke="#ffffff" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
)

const CardIcon = () => (
  <svg width="22" height="22" fill="none" stroke="#ffffff" viewBox="0 0 24 24">
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
    <line x1="1" y1="10" x2="23" y2="10" strokeWidth={2} strokeLinecap="round"/>
  </svg>
)

const DollarIcon = () => (
  <svg width="22" height="22" fill="none" stroke="#ffffff" viewBox="0 0 24 24">
    <line x1="12" y1="1" x2="12" y2="23" strokeWidth={2} strokeLinecap="round"/>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
  </svg>
)

const ShipIcon = () => (
  <svg width="22" height="22" fill="none" stroke="#ffffff" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M2 20a2.4 2.4 0 002 1 2.4 2.4 0 002-1 2.4 2.4 0 012-1 2.4 2.4 0 012 1 2.4 2.4 0 002 1 2.4 2.4 0 002-1 2.4 2.4 0 012-1 2.4 2.4 0 012 1"/>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 18l-1-5h18l-2 5"/>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 13V3l4 3H8l4-3v10"/>
  </svg>
)

const FileIcon = () => (
  <svg width="22" height="22" fill="none" stroke="#ffffff" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
    <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}/>
    <line x1="16" y1="13" x2="8" y2="13" strokeLinecap="round" strokeWidth={2}/>
    <line x1="16" y1="17" x2="8" y2="17" strokeLinecap="round" strokeWidth={2}/>
    <polyline points="10 9 9 9 8 9" strokeLinecap="round" strokeWidth={2}/>
  </svg>
)

const ClockIcon = ({ color = '#065f46' }) => (
  <svg width="11" height="11" fill="none" stroke={color} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" strokeWidth={2}/>
    <polyline points="12 6 12 12 16 14" strokeWidth={2} strokeLinecap="round"/>
  </svg>
)

const steps = [
  {
    num: 1,
    icon: <SearchIcon />,
    badge: '1-3 дня',
    badgeType: 'green',
    title: 'Выбор автомобиля',
    desc: 'Выберите автомобиль из нашего каталога с площадки Encar. Мы покажем все доступные опции с диагностикой.',
    items: [
      'Просмотр каталога на Encar',
      'Проверка диагностики и истории',
      'Консультация с менеджером',
      'Расчет полной стоимости',
    ],
  },
  {
    num: 2,
    icon: <CardIcon />,
    badge: '1-2 дня',
    badgeType: 'green',
    title: 'Оплата, оформление и осмотр автомобиля',
    desc: 'После выбора автомобиля производится оплата. Наша комиссия составляет всего $200. Выезд на осмотр автомобиля и подробную проверку.',
    items: [
      'Подписание договора',
      'Оплата комиссии 200$',
      'Подробный фото и видеоотчет',
      'Оплата стоимости автомобиля',
      'Оформление экспортных документов',
    ],
  },
  {
    num: 3,
    icon: <DollarIcon />,
    badge: 'После отправки',
    badgeType: 'orange',
    title: 'Возврат НДС 7%',
    desc: 'При экспорте автомобиля из Кореи вы получаете возврат 7% НДС.',
    items: [
      'Оформление возврата НДС',
      'Получение 7% НДС',
      'Экономия на покупке',
    ],
  },
  {
    num: 4,
    icon: <ShipIcon />,
    badge: '12-23 дней',
    badgeType: 'green',
    title: 'Доставка',
    desc: 'Автомобиль доставляется морским путем. Срок доставки составляет 12-23 дней.',
    items: [
      'Погрузка в порту Кореи',
      'Морская доставка',
      'Отслеживание груза онлайн',
      'Прибытие в порт назначения',
    ],
  },
  {
    num: 5,
    icon: <FileIcon />,
    badge: '1-3 дня',
    badgeType: 'green',
    title: 'Получение автомобиля',
    desc: 'Получите ваш автомобиль с полным комплектом документов для регистрации.',
    items: [
      'Проверка автомобиля при получении',
      'Передача всех документов',
      'Консультация по регистрации',
      'Поддержка после покупки',
    ],
  },
]

export default function ProcessSteps() {
  return (
    <section className="process-section">
      <div className="process-inner">

        <h2 className="process-title">Как происходит покупка автомобиля из Кореи</h2>
        <p className="process-subtitle">Простой и прозрачный процесс от выбора до получения</p>

        <div className="steps-list">
          {steps.map((step) => (
            <div className="step-row" key={step.num}>
              {/* Timeline: icon + connecting line */}
              <div className="step-timeline">
                <div className="step-icon-circle">
                  {step.icon}
                </div>
                <div className="step-line" />
              </div>

              {/* Card */}
              <div className="step-card">
                <div className="step-header">
                  <span className="step-label">Шаг {step.num}</span>
                  <span className={`step-badge ${step.badgeType}`}>
                    <ClockIcon color={step.badgeType === 'orange' ? '#92400e' : '#065f46'} />
                    {step.badge}
                  </span>
                </div>
                <h3 className="step-card-title">{step.title}</h3>
                <p className="step-card-desc">{step.desc}</p>
                <ul className="step-checklist">
                  {step.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        <div className="process-cta">
          <Link to="/catalog" className="btn-process-cta">
            Выбрать автомобиль →
          </Link>
        </div>

      </div>
    </section>
  )
}
