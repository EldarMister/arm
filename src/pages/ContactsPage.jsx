const WhatsAppIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
)
const EmailIcon = () => (
  <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
  </svg>
)
const InstagramIcon = () => (
  <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" strokeWidth={1.8}/>
    <circle cx="12" cy="12" r="4" strokeWidth={1.8}/>
    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
  </svg>
)
const YouTubeIcon = () => (
  <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="2" y="5" width="20" height="14" rx="4" strokeWidth={1.8}/>
    <polygon points="10,9 16,12 10,15" fill="currentColor" stroke="none"/>
  </svg>
)
const PhoneIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
  </svg>
)
const ClockIcon = () => (
  <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" strokeWidth={1.8}/>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6v6l4 2"/>
  </svg>
)
const PinIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
    <circle cx="12" cy="11" r="3" strokeWidth={2}/>
  </svg>
)
const ChatIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
  </svg>
)
const GlobeIcon = () => (
  <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" strokeWidth={1.8}/>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
  </svg>
)
const PlayIcon = () => (
  <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="2" y="5" width="20" height="14" rx="4" strokeWidth={1.8}/>
    <polygon points="10,9 16,12 10,15" fill="currentColor" stroke="none"/>
  </svg>
)

const CONTACT_CARDS = [
  {
    icon: <WhatsAppIcon size={22} />,
    title: 'WhatsApp',
    desc: 'Написать, заказать, позвонить',
    value: '+996 705 18 80 88',
    valueClass: 'cnt-val-teal',
    sub: 'Ответим в течение 5 минут',
    href: 'https://wa.me/996705188088',
  },
  {
    icon: <EmailIcon />,
    title: 'Email',
    desc: 'Письменные обращения',
    value: 'director@tlv-auto.com',
    valueClass: 'cnt-val-dark',
    sub: 'Ответ в течение 2 часов',
    href: 'mailto:director@tlv-auto.com',
  },
  {
    icon: <InstagramIcon />,
    title: 'Instagram',
    desc: 'Instagram консультации',
    value: '@tlv_auto_korea',
    valueClass: 'cnt-val-blue',
    sub: 'Прямая связь с менеджером',
    href: 'https://instagram.com/tlv_auto_korea',
  },
  {
    icon: <YouTubeIcon />,
    title: 'YouTube',
    desc: 'Видео обзоры и контент',
    value: '@tlvauto1',
    valueClass: 'cnt-val-blue',
    sub: 'Обзоры автомобилей и процесс доставки',
    href: 'https://youtube.com/@tlvauto1',
  },
]

const OFFICES = [
  {
    city: 'Бишкек',
    address: 'ул. Бакаева 140/1, БЦ SKY PLAZA, 5 этаж, 505 кабинет',
    phone: '+996 705 18 80 88',
    email: 'director@tlv-auto.com',
  },
  {
    city: 'Бишкек',
    address: 'ул. Турусбекова 109/3, БЦ Максимум, офис 208',
    phone: '+996 705 18 80 88',
    email: 'director@tlv-auto.com',
  },
  {
    city: 'Ош',
    address: 'ул. Аскар Шакиров 30, БЦ MAHCOM, 5 этаж 9 кабинет',
    phone: '+996 705 18 80 88',
    email: 'director@tlv-auto.com',
  },
  {
    city: 'Корея',
    address: 'Сеул (офис в Корее — уточняйте у менеджера)',
    phone: '+996 705 18 80 88',
    email: 'director@tlv-auto.com',
  },
]

export default function ContactsPage() {
  return (
    <div className="cnt-page">

      {/* Hero */}
      <section className="cnt-hero">
        <div className="cnt-inner">
          <h1 className="cnt-hero-title">Контакты</h1>
          <p className="cnt-hero-sub">
            Свяжитесь с нами удобным способом. Мы всегда готовы ответить на ваши вопросы и помочь выбрать автомобиль
          </p>
        </div>
      </section>

      {/* Ways to connect */}
      <section className="cnt-section">
        <div className="cnt-inner">
          <h2 className="cnt-section-title reveal">Способы связи</h2>
          <div className="cnt-ways-grid">
            {CONTACT_CARDS.map((card, i) => (
              <a key={card.title} href={card.href} target="_blank" rel="noreferrer" className={`cnt-way-card reveal reveal-delay-${i + 1}`}>
                <div className="cnt-way-icon">
                  {card.icon}
                </div>
                <div className="cnt-way-title">{card.title}</div>
                <div className="cnt-way-desc">{card.desc}</div>
                <div className={`cnt-way-value ${card.valueClass}`}>{card.value}</div>
                <div className="cnt-way-sub">{card.sub}</div>
              </a>
            ))}
          </div>

          {/* Quick CTA */}
          <div className="cnt-quick">
            <p className="cnt-quick-text">Нужна быстрая консультация? Выберите удобный способ связи:</p>
            <div className="cnt-quick-btns">
              <a
                href="https://wa.me/996705188088"
                target="_blank"
                rel="noreferrer"
                className="cnt-btn-primary"
              >
                <ChatIcon /> Написать в WhatsApp
              </a>
              <a href="tel:+996705188088" className="cnt-btn-outline">
                <PhoneIcon /> Позвонить сейчас
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Work hours */}
      <section className="cnt-section cnt-section-alt">
        <div className="cnt-inner">
          <h2 className="cnt-section-title">Режим работы</h2>
          <div className="cnt-hours-wrap">
            <div className="cnt-hours-card">
              <div className="cnt-hours-header">
                <span className="cnt-hours-clock"><ClockIcon /></span>
                <div>
                  <div className="cnt-hours-card-title">Рабочее время</div>
                  <div className="cnt-hours-card-sub">Время указано по времени Кыргызстана (GMT+6)</div>
                </div>
              </div>
              <div className="cnt-hours-row">
                <span className="cnt-hours-label">Ежедневно без выходных</span>
                <span className="cnt-hours-value">10:00 - 20:00</span>
              </div>
              <div className="cnt-hours-divider" />
              <div className="cnt-hours-row">
                <span className="cnt-hours-label">Экстренная связь</span>
                <span className="cnt-hours-value">24/7 через WhatsApp</span>
              </div>
              <div className="cnt-hours-note">
                <strong>Экстренная связь:</strong> Вне рабочего времени вы можете написать нам в WhatsApp, и мы ответим при первой возможности.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Offices */}
      <section className="cnt-section">
        <div className="cnt-inner">
          <h2 className="cnt-section-title">Наши офисы</h2>
          <div className="cnt-offices-grid">
            {OFFICES.map((o, i) => (
              <div key={i} className="cnt-office-card">
                <div className="cnt-office-city">
                  <PinIcon /> {o.city}
                </div>
                <div className="cnt-office-row">
                  <span className="cnt-office-label">Адрес:</span>
                  <span className="cnt-office-text">{o.address}</span>
                </div>
                <div className="cnt-office-row">
                  <span className="cnt-office-label">Телефон:</span>
                  <a href={`tel:${o.phone.replace(/\s/g,'')}`} className="cnt-office-link">{o.phone}</a>
                </div>
                <div className="cnt-office-row">
                  <span className="cnt-office-label">Email:</span>
                  <a href={`mailto:${o.email}`} className="cnt-office-link">{o.email}</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WhatsApp groups */}
      <section className="cnt-section cnt-section-wa">
        <div className="cnt-inner cnt-centered">
          <h2 className="cnt-section-title">Группа и канал WhatsApp</h2>
          <p className="cnt-section-sub">Присоединяйтесь к группе и каналу AVT Auto V Korea</p>
          <div className="cnt-wa-btns">
            <a
              href="https://chat.whatsapp.com/KYOi5t749ZT16iyqAzbkSd"
              target="_blank"
              rel="noreferrer"
              className="cnt-btn-primary"
            >
              <WhatsAppIcon size={17} /> Присоединиться к группе
            </a>
            <a
              href="https://wa.me/996705188088"
              target="_blank" rel="noreferrer"
              className="cnt-btn-outline"
            >
              <WhatsAppIcon size={17} /> Перейти в канал
            </a>
          </div>
        </div>
      </section>

      {/* Social media */}
      <section className="cnt-section cnt-section-social">
        <div className="cnt-inner cnt-centered">
          <h2 className="cnt-section-title">Мы в социальных сетях</h2>
          <p className="cnt-section-sub">Следите за новостями, новыми поступлениями и полезными советами</p>
          <div className="cnt-social-btns">
            <a
              href="https://instagram.com/tlv_auto_korea"
              target="_blank" rel="noreferrer"
              className="cnt-btn-social"
            >
              <GlobeIcon /> Instagram
            </a>
            <a
              href="https://youtube.com/@tlvauto1"
              target="_blank" rel="noreferrer"
              className="cnt-btn-social"
            >
              <PlayIcon /> YouTube
            </a>
          </div>
        </div>
      </section>

    </div>
  )
}


