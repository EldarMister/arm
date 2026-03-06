const GroupIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
    <circle cx="9" cy="7" r="4" strokeWidth={2}/>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
  </svg>
)

const ChannelIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
  </svg>
)

export default function WhatsAppSection() {
  return (
    <section id="whatsapp-sale" className="whatsapp-section">
      <div className="section-inner" style={{ textAlign: 'center' }}>
        <h2 className="section-title">Группа и канал WhatsApp</h2>
        <p className="section-subtitle">
          Присоединяйтесь к группе и каналу AVT Auto V Korea
        </p>

        <div className="whatsapp-btns">
          <a href="https://chat.whatsapp.com/KYOi5t749ZT16iyqAzbkSd" target="_blank" rel="noreferrer" className="btn-wa-primary">
            <GroupIcon />
            Присоединиться к группе
          </a>
          <a href="#" className="btn-wa-secondary">
            <ChannelIcon />
            Перейти в канал
          </a>
        </div>
      </div>
    </section>
  )
}

