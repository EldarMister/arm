import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.jsx'
import { getClerkPublishableKey } from './lib/clerk.js'

const clerkPublishableKey = getClerkPublishableKey()
const app = clerkPublishableKey
  ? (
      <ClerkProvider publishableKey={clerkPublishableKey}>
        <App />
      </ClerkProvider>
    )
  : <App />

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {app}
  </StrictMode>,
)
