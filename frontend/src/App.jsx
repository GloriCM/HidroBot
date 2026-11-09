import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'

const titles = {
  '/': 'HidroBot — Riego inteligente',
  '/ingresar': 'Iniciar sesión — HidroBot',
  '/registro': 'Crear cuenta — HidroBot',
  '/panel': 'Panel — HidroBot',
}

function Frame() {
  const { pathname } = useLocation()
  const marketing = false

  useEffect(() => {
    document.title = titles[pathname] || 'HidroBot'
  }, [pathname])

  return (
    <>
      <a className="skip" href="#contenido">
        Saltar al contenido
      </a>
      {marketing && <Navbar />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/ingresar" element={<Login />} />
        <Route path="/registro" element={<Register />} />
        <Route path="/panel" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {marketing && <Footer />}
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Frame />
    </AuthProvider>
  )
}
