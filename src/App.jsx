import { Suspense, lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/layout/Layout'
import HomePage from './pages/HomePage'
import DamagedStockTabs from './components/catalog/DamagedStockTabs.jsx'
import { CAR_SECTION_CONFIG } from './lib/catalogSections.js'

const CatalogPage = lazy(() => import('./pages/CatalogPage'))
const CarDetailsPage = lazy(() => import('./pages/CarDetailsPage'))
const ContactsPage = lazy(() => import('./pages/ContactsPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const PartsCatalogPage = lazy(() => import('./pages/PartsCatalogPage'))
const PartDetailsPage = lazy(() => import('./pages/PartDetailsPage'))
const DeliveryPriceListPage = lazy(() => import('./pages/DeliveryPriceListPage'))

function LazyRoute({ children }) {
  return (
    <Suspense fallback={null}>
      {children}
    </Suspense>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/admin"
          element={(
            <LazyRoute>
              <AdminPage />
            </LazyRoute>
          )}
        />
        <Route path="/" element={<Layout><HomePage /></Layout>} />
        <Route
          path="/delivery-price-list"
          element={<Layout><LazyRoute><DeliveryPriceListPage /></LazyRoute></Layout>}
        />
        <Route
          path="/catalog"
          element={<Layout><LazyRoute><CatalogPage section={CAR_SECTION_CONFIG.main} /></LazyRoute></Layout>}
        />
        <Route
          path="/catalog/:id"
          element={<Layout><LazyRoute><CarDetailsPage section={CAR_SECTION_CONFIG.main} /></LazyRoute></Layout>}
        />
        <Route
          path="/urgent-sale"
          element={<Layout><LazyRoute><CatalogPage section={CAR_SECTION_CONFIG.urgent} /></LazyRoute></Layout>}
        />
        <Route
          path="/urgent-sale/:id"
          element={<Layout><LazyRoute><CarDetailsPage section={CAR_SECTION_CONFIG.urgent} /></LazyRoute></Layout>}
        />
        <Route
          path="/damaged-stock"
          element={(
            <Layout>
              <LazyRoute>
                <CatalogPage section={CAR_SECTION_CONFIG.damaged} introContent={<DamagedStockTabs active="cars" />} />
              </LazyRoute>
            </Layout>
          )}
        />
        <Route
          path="/damaged-stock/:id"
          element={<Layout><LazyRoute><CarDetailsPage section={CAR_SECTION_CONFIG.damaged} /></LazyRoute></Layout>}
        />
        <Route
          path="/damaged-stock/parts"
          element={(
            <Layout>
              <LazyRoute>
                <PartsCatalogPage introContent={<DamagedStockTabs active="parts" />} />
              </LazyRoute>
            </Layout>
          )}
        />
        <Route
          path="/damaged-stock/parts/:id"
          element={(
            <Layout>
              <LazyRoute>
                <PartDetailsPage introContent={<DamagedStockTabs active="parts" />} />
              </LazyRoute>
            </Layout>
          )}
        />
        <Route
          path="/contacts"
          element={<Layout><LazyRoute><ContactsPage /></LazyRoute></Layout>}
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
