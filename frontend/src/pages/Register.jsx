import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import Gate from '../components/Gate'
import { useAuth } from '../hooks/useAuth'

const empty = {
  name: '',
  email: '',
  garden: '',
  password: '',
  confirm: '',
}

export default function Register() {
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(empty)
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')

  if (user) {
    return <Navigate to="/panel" replace />
  }

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function onSubmit(event) {
    event.preventDefault()
    setError('')
    if (form.name.trim().length < 2) {
      setError('Escribe tu nombre.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError('Escribe un correo válido.')
      return
    }
    if (form.password.length < 8) {
      setError('La contraseña necesita al menos 8 caracteres.')
      return
    }
    if (form.password !== form.confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }
    try {
      register({
        name: form.name,
        email: form.email,
        password: form.password,
        garden: form.garden,
      })
      navigate('/panel')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Gate>
      <img className="mx-auto h-[3.2em] w-[3.2em] object-contain" src="/isotipo.png" alt="" />
      <p className="text-[1.65em] font-extrabold tracking-tight">
        <span className="text-[#1d6eab]">Hidro</span>
        <span className="text-[#1f9d4a]">Bot</span>
      </p>
      <p className="mx-auto mt-1 flex max-w-[240px] items-center gap-2 text-[0.82em] text-[#6d8b84] before:h-px before:flex-1 before:bg-[#d5e4ea] after:h-px after:flex-1 after:bg-[#d5e4ea]">
        Conecta · Controla · Cuida
      </p>
      <h2 className="mt-3 text-[1.15em] font-extrabold">Crear cuenta</h2>
      <p className="mb-2 text-[0.9em] text-[#6b8794]">Dale un nombre al jardín y entra al panel.</p>
      <form className="grid gap-2 text-left" onSubmit={onSubmit} noValidate>
        <input
          id="name"
          autoComplete="name"
          value={form.name}
          onChange={(event) => update('name', event.target.value)}
          className="h-[2.35em] w-full rounded-xl border border-[#d7e3ee] bg-[#f8fbfe] px-3 text-[1em] text-[#16324a] outline-none"
          placeholder="Tu nombre"
          aria-label="Nombre"
          maxLength={80}
        />
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(event) => update('email', event.target.value)}
          className="h-[2.35em] w-full rounded-xl border border-[#d7e3ee] bg-[#f8fbfe] px-3 text-[1em] text-[#16324a] outline-none"
          placeholder="tu@correo.com"
          aria-label="Correo"
          maxLength={120}
        />
        <input
          id="garden"
          value={form.garden}
          onChange={(event) => update('garden', event.target.value)}
          className="h-[2.35em] w-full rounded-xl border border-[#d7e3ee] bg-[#f8fbfe] px-3 text-[1em] text-[#16324a] outline-none"
          placeholder="Nombre del jardín"
          aria-label="Nombre del jardín"
          maxLength={80}
        />
        <div className="flex items-center rounded-xl border border-[#d7e3ee] bg-[#f8fbfe] px-3">
          <input
            id="password"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            value={form.password}
            onChange={(event) => update('password', event.target.value)}
            className="h-[2.35em] w-full bg-transparent text-[1em] text-[#16324a] outline-none"
            placeholder="Contraseña, mínimo 8"
            aria-label="Contraseña"
          />
          <button className="shrink-0 text-[#8aa0ae]" type="button" onClick={() => setShow((value) => !value)} aria-label={show ? 'Ocultar contraseña' : 'Ver contraseña'}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <input
          id="confirm"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          value={form.confirm}
          onChange={(event) => update('confirm', event.target.value)}
          className="h-[2.35em] w-full rounded-xl border border-[#d7e3ee] bg-[#f8fbfe] px-3 text-[1em] text-[#16324a] outline-none"
          placeholder="Repite la contraseña"
          aria-label="Confirmar contraseña"
        />
        {error && (
          <p className="text-[0.85em] font-bold text-[#b42318]" role="alert">
            {error}
          </p>
        )}
        <button className="mt-1 h-[2.45em] rounded-xl bg-gradient-to-r from-[#1d4ed8] to-[#22c55e] text-[1em] font-bold text-white" type="submit">
          Crear cuenta
        </button>
      </form>
      <Link
        className="mt-3 flex h-12 w-full items-center justify-center rounded-xl border border-[#d5e2ee] text-base font-bold text-[#1d6eab]"
        to="/ingresar"
      >
        Volver a inicio de sesión
      </Link>
    </Gate>
  )
}
