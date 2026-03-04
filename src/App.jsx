import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import HomePage from './pages/HomePage'
import CatalogPage from './pages/CatalogPage'
import ContactsPage from './pages/ContactsPage'
import AdminPage from './pages/AdminPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Admin — без Layout */}
        <Route path="/admin" element={<AdminPage />} />
        {/* Public — с Layout */}
        <Route path="/" element={<Layout><HomePage /></Layout>} />
        <Route path="/catalog" element={<Layout><CatalogPage /></Layout>} />
        <Route path="/contacts" element={<Layout><ContactsPage /></Layout>} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
