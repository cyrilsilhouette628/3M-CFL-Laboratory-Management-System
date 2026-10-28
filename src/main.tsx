import "@/lib/logger";
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import { TRPCProvider } from "@/providers/trpc"
import { AuthProvider } from "@/lib/auth"
import { ThemeProvider } from "@/lib/theme"
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <TRPCProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </TRPCProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
