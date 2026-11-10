import {
  Bell,
  Calendar,
  Camera,
  ChartColumn,
  Droplets,
  Home,
  Info,
  Leaf,
  LogOut,
  Play,
  Settings,
  User,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from '../hooks/useAuth'
import { moistureState } from '../lib/moisture'

const hours = ['12AM', '2AM', '4AM', '6AM', '8AM', '10AM', '12PM', '2PM', '4PM', '6PM', '8PM', '10PM', '12AM']
const nav = [
  { id: 'inicio', label: 'Inicio', icon: Home },
  { id: 'historial', label: 'Historial', icon: ChartColumn },
  { id: 'sistema', label: 'Configuración', icon: Settings },
  { id: 'alertas', label: 'Alertas', icon: Bell },
]

function photoKey(email) {
  return `hidrobot_photo_${email}`
}

function readPhoto(email) {
  try {
    return localStorage.getItem(photoKey(email)) || ''
  } catch {
    return ''
  }
}

function buildSeries() {
  let value = 62
  return hours.map((hour, index) => {
    value += Math.sin(index / 2.1) * 5 + ((index * 3) % 4) - 2
    value = Math.min(78, Math.max(48, value))
    return { hour, humedad: Math.round(value) }
  })
}

function clock() {
  return new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

export default function Dashboard() {
  const { user, ready, logout, updateProfile, resetPassword } = useAuth()
  const [value, setValue] = useState(68)
  const [online, setOnline] = useState(true)
  const [pump, setPump] = useState(false)
  const [auto, setAuto] = useState(true)
  const [alerts, setAlerts] = useState(() => localStorage.getItem('hidrobot_alerts') !== 'off')
  const [section, setSection] = useState('inicio')
  const [range, setRange] = useState('24h')
  const [logs, setLogs] = useState([
    { id: 1, time: 'Hace 1 min', text: 'Sistema funcionando correctamente.', ok: true },
    { id: 2, time: 'Hace 5 min', text: 'Humedad en rango óptimo.', ok: true },
    { id: 3, time: 'Hace 1 h', text: 'Riego automático desactivado.', ok: false },
  ])
  const [menu, setMenu] = useState(false)
  const [photo, setPhoto] = useState(() => readPhoto(user?.email))
  const [draft, setDraft] = useState(() => ({
    name: user?.name || '',
    email: user?.email || '',
    garden: user?.garden || '',
  }))
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' })
  const [profileNote, setProfileNote] = useState('')
  const [profileError, setProfileError] = useState('')
  const [profileTab, setProfileTab] = useState('datos')
  const timer = useRef(null)
  const menuRef = useRef(null)
  const base = useMemo(() => buildSeries(), [])

  useEffect(() => () => clearTimeout(timer.current), [])

  useEffect(() => {
    if (!user) return
    setPhoto(readPhoto(user.email))
    setDraft({ name: user.name, email: user.email, garden: user.garden || '' })
  }, [user])

  useEffect(() => {
    if (!menu) return undefined
    function close(event) {
      if (!menuRef.current?.contains(event.target)) setMenu(false)
    }
    function onKey(event) {
      if (event.key === 'Escape') setMenu(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  useEffect(() => {
    const id = setInterval(() => {
      setValue((current) => {
        const drift = pump ? 1.4 : (Math.random() - 0.55) * 0.8
        return Math.min(92, Math.max(22, current + drift))
      })
    }, 1500)
    return () => clearInterval(id)
  }, [pump])

  const series = useMemo(() => {
    const next = base.map((point) => ({ ...point }))
    next[next.length - 1].humedad = Math.round(value)
    const count = range === '1h' ? 2 : range === '6h' ? 4 : range === '12h' ? 7 : next.length
    return next.slice(-count)
  }, [base, range, value])

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-[linear-gradient(160deg,#3aa0e8_0%,#7ed0ff_32%,#b6ef8a_68%,#3dae55_100%)] text-[#07182b]">
        <p className="rounded-2xl bg-white/80 px-6 py-4 font-bold shadow">Cargando panel…</p>
      </div>
    )
  }

  if (!user) return <Navigate to="/ingresar" replace />

  const state = moistureState(value)
  const status = !online ? 'Sin red' : state.key === 'ok' ? 'Óptima' : state.key === 'watch' ? 'Vigilar' : 'Baja'
  const now = new Date().toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  function push(text, ok = true) {
    setLogs((list) => [{ id: Date.now(), time: 'Ahora', text, ok }, ...list].slice(0, 6))
  }

  function startWater() {
    if (!online || pump) return
    setPump(true)
    push('Riego manual. El agua sale del tanque hacia los aspersores.')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setPump(false)
      push('Riego terminado. La bomba quedó apagada.')
    }, 8000)
  }

  function loseConnection() {
    clearTimeout(timer.current)
    setPump(false)
    setOnline(false)
    push('Se perdió la conexión. La bomba se apagó para proteger el tanque.', false)
  }

  function restore() {
    setOnline(true)
    push('Conexión HTTP restablecida con el servidor.')
  }

  function onPhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        const max = 320
        const scale = Math.min(max / image.width, max / image.height, 1)
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
        const data = canvas.toDataURL('image/jpeg', 0.82)
        try {
          localStorage.setItem(photoKey(user.email), data)
        } catch {
          /* la foto sigue visible en esta visita */
        }
        setPhoto(data)
      }
      image.src = reader.result
    }
    reader.readAsDataURL(file)
  }

  async function saveProfile(event) {
    event.preventDefault()
    setProfileNote('')
    setProfileError('')
    const email = draft.email.trim().toLowerCase()
    if (draft.name.trim().length < 2) {
      setProfileError('Escribe tu nombre.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setProfileError('Escribe un correo válido.')
      return
    }
    try {
      await updateProfile({ name: draft.name, email, garden: draft.garden })
      if (email !== user.email) {
        const current = readPhoto(user.email)
        if (current) {
          try {
            localStorage.setItem(photoKey(email), current)
            localStorage.removeItem(photoKey(user.email))
          } catch {
            /* la foto sigue en esta visita */
          }
          setPhoto(current)
        }
      }
      setProfileNote('Cambios guardados.')
    } catch (err) {
      setProfileError(err.message)
    }
  }

  async function savePassword(event) {
    event.preventDefault()
    setProfileNote('')
    setProfileError('')
    if (passwords.next !== passwords.confirm) {
      setProfileError('Las contraseñas no coinciden.')
      return
    }
    try {
      await resetPassword({ current: passwords.current, next: passwords.next })
      setPasswords({ current: '', next: '', confirm: '' })
      setProfileNote('Contraseña actualizada.')
    } catch (err) {
      setProfileError(err.message)
    }
  }

  function toggleAlerts() {
    setAlerts((current) => {
      const next = !current
      try {
        localStorage.setItem('hidrobot_alerts', next ? 'on' : 'off')
      } catch {
        /* preferencia solo en memoria */
      }
      push(next ? 'Alertas de Telegram activas.' : 'Alertas de Telegram en pausa.', next)
      return next
    })
  }

  const show = (id) => section === 'inicio' || section === id
  const glass = 'rounded-3xl border border-white/80 bg-[linear-gradient(165deg,rgba(255,255,255,0.72),rgba(255,255,255,0.38))] shadow-[0_16px_36px_rgba(16,40,30,0.12),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-2xl'

  return (
    <div className="relative min-h-screen text-[#07182b]">
      <div className="pointer-events-none fixed inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-[linear-gradient(160deg,#3aa0e8_0%,#7ed0ff_32%,#b6ef8a_68%,#3dae55_100%)]" />
        <div className="absolute top-1/2 left-[58%] h-[70vh] w-[70vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.55),transparent_68%)]" />
        <img className="absolute top-1/2 left-[58%] h-[min(84vh,800px)] w-auto max-w-none -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-[0_18px_40px_rgba(10,70,140,0.28)]" src="/logo.png" alt="" />
        <svg className="absolute top-0 left-0 h-[220px] w-[300px]" viewBox="0 0 300 220" fill="none">
          <path d="M0 0h186C148 48 102 102 40 154 20 172 8 188 0 202V0Z" fill="#1276cc" />
          <path d="M214 6C168 42 118 92 52 146 28 166 12 186 0 214" stroke="#6bc63a" strokeWidth="22" strokeLinecap="round" />
        </svg>
        <svg className="absolute right-0 bottom-0 h-[min(200px,30vh)] w-[min(640px,62vw)]" viewBox="0 0 640 200" fill="none">
          <path d="M0 200C80 176 110 128 190 122 280 116 320 168 420 136 510 108 555 128 590 86 618 54 632 30 640 8V200H0Z" fill="#1a82d6" />
          <path d="M0 200C100 186 170 158 270 162 390 168 450 184 530 150 580 128 615 136 640 108V200H0Z" fill="#0c4f96" />
          <path d="M190 122C280 116 320 168 420 136 510 108 555 128 590 86 618 54 632 30 640 8" stroke="#6bc63a" strokeWidth="16" strokeLinecap="round" />
        </svg>
      </div>

      <div className="relative z-10 grid min-h-screen lg:grid-cols-[240px_1fr]">
        <aside className="flex flex-col border-white/60 bg-white/55 px-4 py-6 backdrop-blur-xl lg:sticky lg:top-0 lg:h-screen lg:border-r">
          <Link className="mb-8 flex items-center gap-2 text-xl font-extrabold" to="/">
            <img className="h-12 w-12 object-contain" src="/isotipo.png" alt="" />
            <span><span className="text-[#0a3d6b]">Hidro</span><span className="text-[#0f6b32]">Bot</span></span>
          </Link>
          <nav className="grid gap-1" aria-label="Panel">
            {nav.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left font-bold ${section === item.id ? 'bg-[#1276cc] text-white' : 'text-[#07182b] hover:bg-white/50'}`}
                onClick={() => setSection(item.id)}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
            <Link className="flex items-center gap-3 rounded-xl px-3 py-2.5 font-bold text-[#07182b] hover:bg-white/50" to="/">
              <Info className="h-4 w-4" /> Acerca de
            </Link>
          </nav>
          <p className="mt-auto flex items-start gap-2 pt-8 text-sm font-semibold text-[#0f6b32]">
            <Leaf className="mt-0.5 h-4 w-4 shrink-0" />
            Riego inteligente, naturaleza en equilibrio
          </p>
        </aside>

        <main className="px-5 py-5" id="contenido">
          <header className="mb-3 flex items-center justify-end gap-3">
            <div className="flex items-center gap-3 text-sm font-semibold text-[#07182b]">
              <span className="flex items-center gap-2 px-1 py-1.5">
                <Calendar className="h-4 w-4" /> {now}
              </span>
              <div className="relative" ref={menuRef}>
                <button className={`grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-[#1276cc] font-extrabold text-white ${menu ? 'ring-2 ring-[#0c5c2c] ring-offset-2' : ''}`} type="button" onClick={() => setMenu((open) => !open)} aria-label={`Perfil de ${user.name}`} aria-expanded={menu} aria-haspopup="menu">
                  {photo ? <img className="h-full w-full object-cover" src={photo} alt="" /> : user.name.slice(0, 1).toUpperCase()}
                </button>
                {menu && (
                  <div className="absolute top-12 right-0 z-20 w-56 overflow-hidden rounded-2xl border border-[#d7e6f2] bg-white text-left shadow-[0_16px_40px_rgba(16,40,30,0.18)]" role="menu">
                    <button className="flex w-full items-center gap-3 px-4 py-3 text-left font-bold text-[#16324a] hover:bg-[#f4f8fb]" type="button" role="menuitem" onClick={() => { setSection('perfil'); setProfileTab('datos'); setMenu(false) }}>
                      <User className="h-4 w-4" /> Perfil
                    </button>
                    <button
                      className="flex w-full items-center gap-3 border-t border-[#e7eef3] px-4 py-3 text-left font-bold text-[#16324a] hover:bg-[#f4f8fb]"
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        void logout()
                      }}
                    >
                      <LogOut className="h-4 w-4" /> Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {section === 'perfil' ? (
            <article className={`${glass} mx-auto w-full max-w-[420px] px-6 py-6`}>
              <h1 className="text-center text-3xl font-extrabold text-[#07182b]">Perfil</h1>
              <div className="mt-4 grid grid-cols-2 rounded-full bg-white/80 p-1">
                {[
                  ['datos', 'Datos'],
                  ['clave', 'Contraseña'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={`h-10 rounded-full text-sm font-extrabold ${profileTab === id ? 'bg-[#1276cc] text-white' : 'text-[#0a3d6b]'}`}
                    type="button"
                    onClick={() => { setProfileTab(id); setProfileError(''); setProfileNote('') }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {profileTab === 'datos' ? (
                <form className="mt-5 grid gap-3 text-left" onSubmit={saveProfile}>
                  <label className="mx-auto block w-fit cursor-pointer text-center">
                    <span className="relative mx-auto grid h-24 w-24 place-items-center overflow-hidden rounded-full border-4 border-white bg-[#1276cc] text-3xl font-extrabold text-white shadow">
                      {photo ? <img className="h-full w-full object-cover" src={photo} alt="" /> : user.name.slice(0, 1).toUpperCase()}
                      <span className="absolute right-0 bottom-0 grid h-7 w-7 place-items-center rounded-full bg-white text-[#0a3d6b] shadow">
                        <Camera className="h-3.5 w-3.5" />
                      </span>
                    </span>
                    <span className="mt-2 block text-sm font-bold text-[#0a3d6b]">Pon tu foto</span>
                    <input className="sr-only" type="file" accept="image/*" onChange={onPhoto} />
                  </label>
                  {[
                    ['name', 'Nombre', 'text'],
                    ['email', 'Correo', 'email'],
                    ['garden', 'Jardín', 'text'],
                  ].map(([key, label, type]) => (
                    <label key={key} className="block">
                      <span className="mb-1 block text-sm font-bold text-[#0a3d6b]">{label}</span>
                      <input
                        className="h-12 w-full rounded-xl border border-[#d7e3ee] bg-white px-3 text-base font-bold text-[#07182b] outline-none"
                        type={type}
                        value={draft[key]}
                        onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
                      />
                    </label>
                  ))}
                  <button className="h-12 rounded-xl bg-gradient-to-r from-[#1d4ed8] to-[#22c55e] font-extrabold text-white" type="submit">
                    Guardar
                  </button>
                </form>
              ) : (
                <form className="mt-5 grid gap-3 text-left" onSubmit={savePassword}>
                  <p className="text-sm font-semibold text-[#0a3d6b]">Escribe la contraseña actual y elige una nueva de al menos 8 caracteres.</p>
                  {[
                    ['current', 'Contraseña actual', 'current-password'],
                    ['next', 'Nueva contraseña', 'new-password'],
                    ['confirm', 'Confirmar contraseña', 'new-password'],
                  ].map(([key, label, complete]) => (
                    <label key={key} className="block">
                      <span className="mb-1 block text-sm font-bold text-[#0a3d6b]">{label}</span>
                      <input
                        className="h-12 w-full rounded-xl border border-[#d7e3ee] bg-white px-3 text-base font-bold text-[#07182b] outline-none"
                        type="password"
                        autoComplete={complete}
                        value={passwords[key]}
                        onChange={(event) => setPasswords((current) => ({ ...current, [key]: event.target.value }))}
                      />
                    </label>
                  ))}
                  <button className="h-12 rounded-xl bg-gradient-to-r from-[#1d4ed8] to-[#22c55e] font-extrabold text-white" type="submit">
                    Restablecer contraseña
                  </button>
                </form>
              )}
              {profileError && <p className="mt-3 text-center text-sm font-bold text-[#b42318]" role="alert">{profileError}</p>}
              {profileNote && <p className="mt-3 text-center text-sm font-bold text-[#0f6b32]" role="status">{profileNote}</p>}
            </article>
          ) : (
          <>
          <section className="mb-4 grid gap-3 md:grid-cols-3">
            <article className={`${glass} p-4`}>
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-[#1d6eab] text-white"><Droplets className="h-5 w-5" /></span>
                <div>
                  <p className="text-sm font-semibold text-[#0a3d6b]">Humedad del césped</p>
                  <p className="text-2xl font-extrabold">{Math.round(value)}% <span className="text-sm font-bold text-[#1f9d4a]">{status}</span></p>
                </div>
              </div>
              <div className="mt-2 h-10">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series}>
                    <Area type="monotone" dataKey="humedad" stroke="#1d6eab" fill="#1d6eab" fillOpacity={0.12} strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </article>
            <article className={`${glass} p-4`}>
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-[#22a34a] text-white"><ChartColumn className="h-5 w-5" /></span>
                <div>
                  <p className="text-sm font-semibold text-[#0a3d6b]">Umbral de riego</p>
                  <p className="text-2xl font-extrabold">35%</p>
                </div>
              </div>
              <div className="mt-2 h-10">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series}>
                    <Area type="monotone" dataKey="humedad" stroke="#22a34a" fill="#22a34a" fillOpacity={0.12} strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </article>
            <article className={`${glass} p-4`}>
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-[#1d6eab] text-white"><Droplets className="h-5 w-5" /></span>
                <div>
                  <p className="text-sm font-semibold text-[#0a3d6b]">Estado de la bomba</p>
                  <p className="text-2xl font-extrabold text-[#1f9d4a]">{pump ? 'Regando' : 'Apagada'}</p>
                  <p className="text-xs text-[#6b8494]">{pump ? 'Llevando agua' : 'No se requiere riego'}</p>
                </div>
              </div>
            </article>
          </section>

          <section className="grid gap-3 lg:grid-cols-[1.4fr_0.7fr]">
            {show('historial') && (
              <article className={`${glass} p-4`}>
                <header className="mb-2 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 font-extrabold"><ChartColumn className="h-4 w-4 text-[#0a3d6b]" /> Historial de humedad</h2>
                  <div className="flex gap-1 text-xs font-bold text-[#6b8494]">
                    {['1h', '6h', '12h', '24h'].map((item) => (
                      <button key={item} type="button" className={`rounded-full px-2 py-1 ${range === item ? 'bg-[#16324a] text-white' : ''}`} onClick={() => setRange(item)}>
                        {item}
                      </button>
                    ))}
                  </div>
                </header>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series}>
                      <XAxis dataKey="hour" tick={{ fill: '#8aa0ae', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(tick) => `${tick}%`} tick={{ fill: '#8aa0ae', fontSize: 12 }} axisLine={false} tickLine={false} width={42} />
                      <Tooltip formatter={(point) => [`${point}%`, 'Humedad']} />
                      <Area type="monotone" dataKey="humedad" stroke="#1d6eab" fill="#1d6eab" fillOpacity={0.16} strokeWidth={3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </article>
            )}

            {show('sistema') && (
              <article className={`${glass} p-4`}>
                <h2 className="flex items-center gap-2 font-extrabold"><Droplets className="h-4 w-4 text-[#0a3d6b]" /> Control manual</h2>
                <p className="mb-3 text-sm font-semibold text-[#0a3d6b]">Activa el riego cuando lo necesites</p>
                <button className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#1d4ed8] to-[#22c55e] font-extrabold text-white disabled:opacity-70" type="button" onClick={startWater} disabled={!online || pump}>
                  <Play className="h-4 w-4 fill-white" /> {pump ? 'Regando…' : 'Regar ahora'}
                </button>
                <label className="mt-4 flex items-center justify-between text-sm">
                  Modo automático
                  <button type="button" className={`h-7 w-12 rounded-full p-1 ${auto ? 'bg-[#2fbe59]' : 'bg-[#24527a]'}`} aria-pressed={auto} onClick={() => { setAuto((current) => !current); push(auto ? 'Modo automático en pausa.' : 'Modo automático activo.', !auto) }}>
                    <i className={`block h-5 w-5 rounded-full bg-white transition ${auto ? 'translate-x-5' : ''}`} />
                  </button>
                </label>
                <button className="mt-3 text-sm font-bold text-[#0a3d6b]" type="button" onClick={online ? loseConnection : restore}>
                  {online ? 'Simular corte de red' : 'Restablecer conexión'}
                </button>
              </article>
            )}

            {show('sistema') && (
              <article className={`${glass} p-4`}>
                <h2 className="mb-2 font-extrabold">Estado del sistema</h2>
                <ul className="text-sm">
                  {[
                    ['Conexión a internet', online ? 'Activa' : 'Caída'],
                    ['ESP32', online ? 'En línea' : 'Sin enlace'],
                    ['Fuente de alimentación', 'Normal'],
                    ['Última actualización', clock()],
                  ].map(([name, detail]) => (
                    <li key={name} className="flex justify-between border-t border-[#e7eef3] py-2">
                      {name} <b className="text-[#1f9d4a]">{detail}</b>
                    </li>
                  ))}
                </ul>
              </article>
            )}

            {show('alertas') && (
              <article className={`${glass} p-4`}>
                <header className="mb-2 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 font-extrabold"><Bell className="h-4 w-4 text-[#0a3d6b]" /> Alertas recientes</h2>
                  <button className="text-sm font-bold text-[#1d6eab]" type="button" onClick={toggleAlerts}>
                    {alerts ? 'Ver todas' : 'En pausa'}
                  </button>
                </header>
                <ul>
                  {logs.map((entry) => (
                    <li key={entry.id} className="flex justify-between gap-3 border-t border-[#e7eef3] py-2 text-sm">
                      <span>{entry.text}</span>
                      <time className="shrink-0 text-[#7e94a3]">{entry.time}</time>
                    </li>
                  ))}
                </ul>
              </article>
            )}

            {section === 'inicio' && (
              <article className={`${glass} flex min-h-28 items-end p-5`}>
                <p className="text-xl font-extrabold text-[#07182b]">
                  Cuidemos el agua, con tecnología
                </p>
              </article>
            )}
          </section>
          </>
          )}
        </main>
      </div>
    </div>
  )
}
