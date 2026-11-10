import { Eye, EyeOff, Leaf, Lock, LogIn, User } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import Gate from '../components/Gate'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { user, ready, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (!ready) {
    return (
      <Gate>
        <p className="py-8 text-sm font-bold text-[#5d7384]">Comprobando sesión…</p>
      </Gate>
    )
  }

  if (user) {
    return <Navigate to="/panel" replace />
  }

  async function onSubmit(event) {
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
    setLoading(true)
    try {
      await login({ email, password })
      navigate('/panel')
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión.')
    } finally {
      setLoading(false)
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
            className="h-10 w-full bg-transparent text-base outline-none disabled:opacity-60"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Correo"
            aria-label="Correo"
            disabled={loading}
          />
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-[#d7e3ee] bg-[#f7fafc] px-3">
          <Lock className="h-4 w-4 shrink-0 text-[#8aa0ae]" />
          <input
            className="h-10 w-full bg-transparent text-base outline-none disabled:opacity-60"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Contraseña"
            aria-label="Contraseña"
            disabled={loading}
          />
          <button
            className="shrink-0 text-[#8aa0ae] disabled:opacity-60"
            type="button"
            onClick={() => setShow((value) => !value)}
            aria-label={show ? 'Ocultar contraseña' : 'Ver contraseña'}
            disabled={loading}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </label>
        {error && (
          <p className="text-sm font-bold text-[#b42318]" role="alert">
            {error}
          </p>
        )}
        <button
          className="flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1d4ed8] to-[#22c55e] text-base font-bold text-white disabled:opacity-70"
          type="submit"
          disabled={loading}
        >
          <LogIn className="h-4 w-4" /> {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
      <p className="mt-3 text-sm text-[#5d7384]">
        ¿Aún no tienes cuenta?{' '}
        <Link className="font-extrabold text-[#1f9d4a]" to="/registro">
          Crear cuenta
        </Link>
      </p>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-[#2f9a4a]">
        <Leaf className="h-3.5 w-3.5" /> Tecnología al servicio del medio ambiente
      </p>
    </Gate>
  )
}
