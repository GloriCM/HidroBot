import { Eye, EyeOff, Leaf, Lock, LogIn, User } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import Gate from '../components/Gate'
import { useAuth } from '../hooks/useAuth'

const DEMO = {
  email: 'demo@hidrobot.local',
  password: 'cesped123',
}

export default function Login() {
  const { user, login, loginWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')

  if (user) {
    return <Navigate to="/panel" replace />
  }

  function onSubmit(event) {
    event.preventDefault()
    setError('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Escribe un correo válido.')
      return
    }
    if (!password) {
      setError('Escribe la contraseña.')
      return
    }
    try {
      login({ email, password })
      navigate('/panel')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Gate>
      <img className="mx-auto h-12 w-12 object-contain" src="/isotipo.png" alt="" />
      <p className="mt-0.5 text-2xl font-extrabold tracking-tight">
        <span className="text-[#1d6eab]">Hidro</span>
        <span className="text-[#1f9d4a]">Bot</span>
      </p>
      <p className="mx-auto mt-1.5 flex max-w-[240px] items-center gap-3 text-xs text-[#5f7f86] before:h-px before:flex-1 before:bg-[#d5e4ea] after:h-px after:flex-1 after:bg-[#d5e4ea]">
        Conecta · Controla · Cuida
      </p>
      <h2 className="mt-3 flex items-center justify-center gap-2 text-lg font-extrabold text-[#16324a]">
        <Lock className="h-4 w-4" /> Iniciar sesión
      </h2>
      <p className="mt-0.5 mb-2 text-sm text-[#5d7384]">Accede a tu panel de control</p>
      <form className="grid gap-2 text-left" onSubmit={onSubmit} noValidate>
        <label className="flex items-center gap-2 rounded-xl border border-[#d7e3ee] bg-[#f7fafc] px-3">
          <User className="h-4 w-4 shrink-0 text-[#8aa0ae]" />
          <input
            className="h-10 w-full bg-transparent text-base outline-none"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Usuario"
            aria-label="Usuario"
          />
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-[#d7e3ee] bg-[#f7fafc] px-3">
          <Lock className="h-4 w-4 shrink-0 text-[#8aa0ae]" />
          <input
            className="h-10 w-full bg-transparent text-base outline-none"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Contraseña"
            aria-label="Contraseña"
          />
          <button className="shrink-0 text-[#8aa0ae]" type="button" onClick={() => setShow((value) => !value)} aria-label={show ? 'Ocultar contraseña' : 'Ver contraseña'}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </label>
        {error && (
          <p className="text-sm font-bold text-[#b42318]" role="alert">
            {error}
          </p>
        )}
        <button className="flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1d4ed8] to-[#22c55e] text-base font-bold text-white" type="submit">
          <LogIn className="h-4 w-4" /> Ingresar
        </button>
      </form>
      <p className="my-2.5 flex items-center gap-3 text-sm text-[#8aa0ae]">
        <span className="h-px flex-1 bg-[#e1ebf2]" />
        o
        <span className="h-px flex-1 bg-[#e1ebf2]" />
      </p>
      <button
        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#d5e2ee] bg-white text-base font-bold whitespace-nowrap text-[#16324a]"
        type="button"
        onClick={() => {
          loginWithGoogle()
          navigate('/panel')
        }}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
          <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
          <path fill="#FBBC05" d="M5.4 14.4A7.2 7.2 0 0 1 5 12c0-.8.1-1.6.4-2.4V6.5H1.4A12 12 0 0 0 0 12c0 1.9.5 3.8 1.4 5.5l4-3.1z" />
          <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4C17.9 1.1 15.2 0 12 0A12 12 0 0 0 1.4 6.5l4 3.1C6.3 6.8 8.9 4.8 12 4.8z" />
        </svg>
        Continuar con Google
      </button>
      <button
        className="mt-2.5 text-sm font-bold text-[#1d6eab]"
        type="button"
        onClick={() => {
          setEmail(DEMO.email)
          setPassword(DEMO.password)
          setError('')
        }}
      >
        Usar cuenta de demostración
      </button>
      <p className="mt-2 text-sm text-[#5d7384]">
        ¿Aún no tienes cuenta? <Link className="font-extrabold text-[#1f9d4a]" to="/registro">Crear cuenta</Link>
      </p>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-[#2f9a4a]">
        <Leaf className="h-3.5 w-3.5" /> Tecnología al servicio del medio ambiente
      </p>
    </Gate>
  )
}
