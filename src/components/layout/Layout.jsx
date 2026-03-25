import Header from './Header'
import Footer from './Footer'
import { useScrollReveal } from '../../hooks/useScrollReveal'

export default function Layout({ children }) {
  useScrollReveal()

  return (
    <div className="site-layout">
      <Header />
      <main className="site-main">
        {children}
      </main>
      <Footer />
    </div>
  )
}
