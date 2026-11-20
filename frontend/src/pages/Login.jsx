import { Eye, EyeOff, Lock, LogIn, User } from 'lucide-react'
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
      <h2 className="flex items-center justify-center gap-2 text-xl font-bold text-slate-900">
        <Lock className="h-5 w-5 text-emerald-600" /> Iniciar sesión
      </h2>
      <p className="mt-1 mb-4 text-center text-sm text-slate-500">Accede a tu panel de control</p>
      <form className="grid gap-3 text-left" onSubmit={onSubmit} noValidate>
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
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
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
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
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-base font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-70"
          type="submit"
          disabled={loading}
        >
          <LogIn className="h-4 w-4" /> {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        ¿Aún no tienes cuenta?{' '}
        <Link className="font-bold text-emerald-700 hover:underline" to="/registro">
          Crear cuenta
        </Link>
      </p>
    </Gate>
  )
}
