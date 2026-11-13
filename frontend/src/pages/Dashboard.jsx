import {
  Bell,
  Calendar,
  Camera,
  ChartColumn,
  Droplets,
  Gauge,
  Home,
  Info,
  Leaf,
  LogOut,
  Play,
  Settings,
  Square,
  User,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import HistoryChart from '../components/HistoryChart'
import { useAuth } from '../hooks/useAuth'
import { api } from '../lib/api'
import { moistureState } from '../lib/moisture'

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

const emptySummary = {
  zone: null,
  settings: null,
  device: null,
  calibration: null,
  latest: null,
  series: [],
  irrigations: [],
  alerts: [],
  online: false,
  pump: false,
  onBattery: false,
}

const glass =
  'rounded-3xl border border-white/80 bg-[linear-gradient(165deg,rgba(255,255,255,0.72),rgba(255,255,255,0.38))] shadow-[0_16px_36px_rgba(16,40,30,0.12),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-2xl'

function clientRangeMeta(rangeKey) {
  const hours = rangeKey === '1h' ? 1 : rangeKey === '6h' ? 6 : rangeKey === '12h' ? 12 : 24
  const toT = Date.now()
  return { fromT: toT - hours * 60 * 60 * 1000, toT, key: rangeKey }
}

function MiniChart({ data, dataKey, color }) {
  if (!data?.length) return <div className="mt-2 h-10" />
  return (
    <div className="mt-2 h-10">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <Area type="monotone" dataKey={dataKey} stroke={color} fill={color} fillOpacity={0.12} strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function Dashboard() {
  const { user, ready, logout, updateProfile, resetPassword } = useAuth()
  const [summary, setSummary] = useState(emptySummary)
  const [series, setSeries] = useState([])
  const [seriesMeta, setSeriesMeta] = useState(null)
  const [chartIrrigations, setChartIrrigations] = useState([])
  const [range, setRange] = useState('24h')
  const [section, setSection] = useState('inicio')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionNote, setActionNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [newApiKey, setNewApiKey] = useState('')
  const [mqttIdDraft, setMqttIdDraft] = useState('esp32-1')
  const [menu, setMenu] = useState(false)
  const [photo, setPhoto] = useState(() => readPhoto(user?.email))
  const [draft, setDraft] = useState(() => ({
    name: user?.name || '',
    email: user?.email || '',
    garden: user?.garden || '',
  }))
  const [settingsDraft, setSettingsDraft] = useState({})
  const [calDraft, setCalDraft] = useState({})
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' })
  const [profileNote, setProfileNote] = useState('')
  const [profileError, setProfileError] = useState('')
  const [profileTab, setProfileTab] = useState('datos')
  const menuRef = useRef(null)

  const loadSummary = useCallback(async () => {
    try {
      const data = await api.panelSummary()
      setSummary(data)
      setSettingsDraft({
        thresholdPct: data.settings?.thresholdPct ?? 35,
        maxIrrigationSeconds: data.settings?.maxIrrigationSeconds ?? 60,
        mode: data.settings?.mode ?? 'auto',
        tankMinPct: data.settings?.tankMinPct ?? 10,
        batteryMinPct: data.settings?.batteryMinPct ?? 30,
        allowManualOnBattery: data.settings?.allowManualOnBattery ?? false,
      })
      setCalDraft({
        humidityRawDry: data.calibration?.humidityRawDry ?? 3000,
        humidityRawWet: data.calibration?.humidityRawWet ?? 1200,
        distanceFullCm: data.calibration?.distanceFullCm ?? 5,
        distanceEmptyCm: data.calibration?.distanceEmptyCm ?? 40,
        batteryVEmpty: data.calibration?.batteryVEmpty ?? 9,
        batteryVFull: data.calibration?.batteryVFull ?? 12.6,
      })
      setError('')
      return data
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los datos del panel.')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const loadSeries = useCallback(async (deviceId, nextRange) => {
    if (!deviceId) {
      setSeries([])
      setSeriesMeta(null)
      setChartIrrigations([])
      return
    }
    try {
      const data = await api.telemetry(deviceId, nextRange)
      // Actualización in-place: no vaciar antes (evita parpadeo).
      setSeries(data.series || [])
      setSeriesMeta(data.range || null)
      setChartIrrigations(data.irrigations || [])
    } catch {
      /* resumen cubre el error */
    }
  }, [])

  useEffect(() => {
    if (!ready || !user) return undefined
    let cancelled = false
    ;(async () => {
      const data = await loadSummary()
      if (cancelled || !data?.device?.id) return
      await loadSeries(data.device.id, range)
    })()
    // El ESP32 envía cada 10 s: refrescar en el mismo ritmo sin recargar la página.
    const id = setInterval(() => {
      void loadSummary().then((data) => {
        if (data?.device?.id) void loadSeries(data.device.id, range)
      })
    }, 10_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [ready, user, loadSummary, loadSeries, range])

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

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-[linear-gradient(160deg,#3aa0e8_0%,#7ed0ff_32%,#b6ef8a_68%,#3dae55_100%)] text-[#07182b]">
        <p className="rounded-2xl bg-white/80 px-6 py-4 font-bold shadow">Cargando panel…</p>
      </div>
    )
  }

  if (!user) return <Navigate to="/ingresar" replace />

  const value = summary.latest?.humidity
  const tank = summary.latest?.tank
  const battery = summary.latest?.battery
  const threshold = summary.settings?.thresholdPct ?? 35
  const watch = summary.settings?.watchPct ?? 55
  const auto = (settingsDraft.mode || summary.settings?.mode) !== 'manual'
  const online = summary.online
  const pump = summary.pump
  const onBattery = summary.onBattery
  const state = moistureState(value, threshold, watch)
  const humidityStatus = !summary.device
    ? 'Sin dispositivo'
    : !online
      ? 'Sin red'
      : state.key === 'ok'
        ? 'Óptima'
        : state.key === 'watch'
          ? 'Vigilar'
          : state.key === 'dry'
            ? 'Baja'
            : 'Sin datos'
  const now = new Date().toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const chartData = series.length ? series : summary.series || []
  const show = (id) => section === 'inicio' || section === id

  async function onPhoto(event) {
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
          /* ignore */
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
    try {
      await updateProfile({ name: draft.name, email: draft.email, garden: draft.garden })
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

  async function startWater() {
    if (!summary.zone?.id || busy) return
    setBusy(true)
    setActionError('')
    setActionNote('')
    try {
      const result = await api.irrigate(summary.zone.id)
      setActionNote(
        result.command?.pushed
          ? 'Orden enviada al ESP32 por MQTT.'
          : 'Comando en cola: se aplicará en la próxima telemetría.',
      )
      await loadSummary()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function stopWater() {
    if (!summary.zone?.id || busy) return
    setBusy(true)
    setActionError('')
    try {
      const result = await api.stopIrrigation(summary.zone.id)
      setActionNote(
        result.command?.pushed
          ? 'Detener enviado al ESP32.'
          : 'Detener en cola hasta la próxima telemetría.',
      )
      await loadSummary()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function saveSettings(event) {
    event.preventDefault()
    if (!summary.zone?.id || busy) return
    setBusy(true)
    setActionError('')
    try {
      await api.patchSettings(summary.zone.id, {
        thresholdPct: Number(settingsDraft.thresholdPct),
        maxIrrigationSeconds: Number(settingsDraft.maxIrrigationSeconds),
        mode: settingsDraft.mode,
        tankMinPct: Number(settingsDraft.tankMinPct),
        batteryMinPct: Number(settingsDraft.batteryMinPct),
        allowManualOnBattery: Boolean(settingsDraft.allowManualOnBattery),
      })
      setActionNote('Configuración guardada.')
      await loadSummary()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function saveCalibration(event) {
    event.preventDefault()
    if (!summary.device?.id || busy) return
    setBusy(true)
    setActionError('')
    try {
      await api.patchCalibration(summary.device.id, {
        humidityRawDry: Number(calDraft.humidityRawDry),
        humidityRawWet: Number(calDraft.humidityRawWet),
        distanceFullCm: Number(calDraft.distanceFullCm),
        distanceEmptyCm: Number(calDraft.distanceEmptyCm),
        batteryVEmpty: Number(calDraft.batteryVEmpty),
        batteryVFull: Number(calDraft.batteryVFull),
      })
      setActionNote('Calibración guardada.')
      await loadSummary()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function captureSoil(kind) {
    const raw = summary.latest?.humidityRaw
    if (raw == null) {
      setActionError('Aún no hay humedad_raw del sensor.')
      return
    }
    setCalDraft((current) => ({
      ...current,
      [kind === 'dry' ? 'humidityRawDry' : 'humidityRawWet']: raw,
    }))
    setActionNote(kind === 'dry' ? `Seco guardado como ${raw}` : `Mojado guardado como ${raw}`)
  }

  async function createDevice() {
    if (!summary.zone?.id || busy) return
    setBusy(true)
    setActionError('')
    setNewApiKey('')
    try {
      const created = await api.createDevice(summary.zone.id, {
        name: 'ESP32',
        mqttId: mqttIdDraft.trim() || undefined,
      })
      setNewApiKey(created.apiKey)
      setActionNote(
        `Dispositivo ${created.device.mqttId} creado. Añade la clave en DEVICE_API_KEYS de Node-RED.`,
      )
      await loadSummary()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative min-h-screen text-[#07182b]">
      <div className="pointer-events-none fixed inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-[linear-gradient(160deg,#3aa0e8_0%,#7ed0ff_32%,#b6ef8a_68%,#3dae55_100%)]" />
        <div className="absolute top-1/2 left-[58%] h-[70vh] w-[70vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.55),transparent_68%)]" />
        <img className="absolute top-1/2 left-[58%] h-[min(84vh,800px)] w-auto max-w-none -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-[0_18px_40px_rgba(10,70,140,0.28)]" src="/logo.png" alt="" />
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
                <button className={`grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-[#1276cc] font-extrabold text-white ${menu ? 'ring-2 ring-[#0c5c2c] ring-offset-2' : ''}`} type="button" onClick={() => setMenu((open) => !open)} aria-label={`Perfil de ${user.name}`}>
                  {photo ? <img className="h-full w-full object-cover" src={photo} alt="" /> : user.name.slice(0, 1).toUpperCase()}
                </button>
                {menu && (
                  <div className="absolute top-12 right-0 z-20 w-56 overflow-hidden rounded-2xl border border-[#d7e6f2] bg-white text-left shadow-[0_16px_40px_rgba(16,40,30,0.18)]" role="menu">
                    <button className="flex w-full items-center gap-3 px-4 py-3 text-left font-bold text-[#16324a] hover:bg-[#f4f8fb]" type="button" onClick={() => { setSection('perfil'); setMenu(false) }}>
                      <User className="h-4 w-4" /> Perfil
                    </button>
                    <button className="flex w-full items-center gap-3 border-t border-[#e7eef3] px-4 py-3 text-left font-bold text-[#16324a] hover:bg-[#f4f8fb]" type="button" onClick={() => { void logout() }}>
                      <LogOut className="h-4 w-4" /> Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {section === 'perfil' ? (
            <article className={`${glass} mx-auto w-full max-w-[420px] px-6 py-6`}>
              <h1 className="text-center text-3xl font-extrabold">Perfil</h1>
              <div className="mt-4 grid grid-cols-2 rounded-full bg-white/80 p-1">
                {[['datos', 'Datos'], ['clave', 'Contraseña']].map(([id, label]) => (
                  <button key={id} className={`h-10 rounded-full text-sm font-extrabold ${profileTab === id ? 'bg-[#1276cc] text-white' : 'text-[#0a3d6b]'}`} type="button" onClick={() => setProfileTab(id)}>
                    {label}
                  </button>
                ))}
              </div>
              {profileTab === 'datos' ? (
                <form className="mt-5 grid gap-3 text-left" onSubmit={saveProfile}>
                  <label className="mx-auto block w-fit cursor-pointer text-center">
                    <span className="relative mx-auto grid h-24 w-24 place-items-center overflow-hidden rounded-full border-4 border-white bg-[#1276cc] text-3xl font-extrabold text-white shadow">
                      {photo ? <img className="h-full w-full object-cover" src={photo} alt="" /> : user.name.slice(0, 1).toUpperCase()}
                      <span className="absolute right-0 bottom-0 grid h-7 w-7 place-items-center rounded-full bg-white text-[#0a3d6b] shadow"><Camera className="h-3.5 w-3.5" /></span>
                    </span>
                    <input className="sr-only" type="file" accept="image/*" onChange={onPhoto} />
                  </label>
                  {[['name', 'Nombre'], ['email', 'Correo'], ['garden', 'Jardín']].map(([key, label]) => (
                    <label key={key} className="block">
                      <span className="mb-1 block text-sm font-bold text-[#0a3d6b]">{label}</span>
                      <input className="h-12 w-full rounded-xl border border-[#d7e3ee] bg-white px-3 font-bold outline-none" value={draft[key]} onChange={(e) => setDraft((c) => ({ ...c, [key]: e.target.value }))} />
                    </label>
                  ))}
                  <button className="h-12 rounded-xl bg-gradient-to-r from-[#1d4ed8] to-[#22c55e] font-extrabold text-white" type="submit">Guardar</button>
                </form>
              ) : (
                <form className="mt-5 grid gap-3 text-left" onSubmit={savePassword}>
                  {[['current', 'Contraseña actual'], ['next', 'Nueva'], ['confirm', 'Confirmar']].map(([key, label]) => (
                    <label key={key} className="block">
                      <span className="mb-1 block text-sm font-bold text-[#0a3d6b]">{label}</span>
                      <input className="h-12 w-full rounded-xl border border-[#d7e3ee] bg-white px-3 font-bold outline-none" type="password" value={passwords[key]} onChange={(e) => setPasswords((c) => ({ ...c, [key]: e.target.value }))} />
                    </label>
                  ))}
                  <button className="h-12 rounded-xl bg-gradient-to-r from-[#1d4ed8] to-[#22c55e] font-extrabold text-white" type="submit">Restablecer</button>
                </form>
              )}
              {profileError && <p className="mt-3 text-center text-sm font-bold text-[#b42318]">{profileError}</p>}
              {profileNote && <p className="mt-3 text-center text-sm font-bold text-[#0f6b32]">{profileNote}</p>}
            </article>
          ) : (
            <>
              {onBattery && (
                <p className={`${glass} mb-3 px-4 py-3 text-sm font-extrabold text-[#9a3412]`} role="status">
                  Equipo en batería ({battery == null ? '—' : `${Math.round(battery)}%`}). El riego automático puede estar limitado.
                </p>
              )}
              {error && <p className={`${glass} mb-3 px-4 py-3 text-sm font-bold text-[#b42318]`}>{error}</p>}
              {loading && <p className={`${glass} mb-3 px-4 py-3 text-sm font-bold text-[#0a3d6b]`}>Actualizando…</p>}

              <section className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <article className={`${glass} p-4`}>
                  <div className="flex items-center gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-[#1d6eab] text-white"><Droplets className="h-5 w-5" /></span>
                    <div>
                      <p className="text-sm font-semibold text-[#0a3d6b]">Humedad del suelo</p>
                      <p className="text-2xl font-extrabold">{value == null ? '—' : `${Number(value).toFixed(1)}%`} <span className="text-sm font-bold text-[#1f9d4a]">{humidityStatus}</span></p>
                    </div>
                  </div>
                  <MiniChart data={chartData} dataKey="humidity" color="#1d6eab" />
                </article>

                <article className={`${glass} p-4`}>
                  <div className="flex items-center gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-[#0f766e] text-white"><Gauge className="h-5 w-5" /></span>
                    <div>
                      <p className="text-sm font-semibold text-[#0a3d6b]">Nivel del tanque</p>
                      <p className="text-2xl font-extrabold">{tank == null ? '—' : `${Math.round(tank)}%`}</p>
                      <p className="text-xs text-[#6b8494]">{summary.latest?.distanceCm == null ? 'Sin distancia' : `${summary.latest.distanceCm} cm`}</p>
                    </div>
                  </div>
                  <MiniChart data={chartData} dataKey="tank" color="#0f766e" />
                </article>

                <article className={`${glass} p-4`}>
                  <div className="flex items-center gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-[#a16207] text-white"><Zap className="h-5 w-5" /></span>
                    <div>
                      <p className="text-sm font-semibold text-[#0a3d6b]">Energía</p>
                      <p className="text-2xl font-extrabold">{onBattery ? 'Batería' : 'Red'}</p>
                      <p className="text-xs text-[#6b8494]">
                        Red {summary.latest?.vRed ?? '—'} V · Bat {summary.latest?.vBat ?? '—'} V
                        {battery != null ? ` (${Math.round(battery)}%)` : ''}
                      </p>
                    </div>
                  </div>
                </article>

                <article className={`${glass} p-4`}>
                  <div className="flex items-center gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-[#1d6eab] text-white"><Droplets className="h-5 w-5" /></span>
                    <div>
                      <p className="text-sm font-semibold text-[#0a3d6b]">Bomba</p>
                      <p className="text-2xl font-extrabold text-[#1f9d4a]">{pump ? 'Regando' : 'Apagada'}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button className="flex h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#1d4ed8] to-[#22c55e] text-sm font-extrabold text-white disabled:opacity-60" type="button" disabled={!online || busy || !summary.device} onClick={() => { void startWater() }}>
                      <Play className="h-4 w-4 fill-white" /> Regar
                    </button>
                    <button className="flex h-11 items-center justify-center gap-2 rounded-full border border-[#d7e3ee] bg-white text-sm font-extrabold text-[#0a3d6b] disabled:opacity-60" type="button" disabled={busy || !summary.device} onClick={() => { void stopWater() }}>
                      <Square className="h-3.5 w-3.5 fill-current" /> Detener
                    </button>
                  </div>
                </article>

                <article className={`${glass} p-4 md:col-span-2 xl:col-span-1`}>
                  <h2 className="mb-2 font-extrabold">Estado del dispositivo</h2>
                  <ul className="text-sm">
                    {[
                      ['MQTT', summary.device?.mqttId || '—'],
                      ['ESP32', !summary.device ? 'Sin dispositivo' : online ? 'En línea' : 'Desconectado'],
                      ['Última señal', summary.device?.lastSeenLabel || '—'],
                      ['RSSI', summary.latest?.rssi ?? '—'],
                    ].map(([name, detail]) => (
                      <li key={name} className="flex justify-between gap-3 border-t border-[#e7eef3] py-2">
                        {name} <b className="text-right text-[#1f9d4a]">{detail}</b>
                      </li>
                    ))}
                  </ul>
                </article>
              </section>

              <section className="grid gap-3 lg:grid-cols-[1.4fr_0.7fr]">
                {show('historial') && (
                  <article className={`${glass} p-4`}>
                    <header className="mb-2 flex items-center justify-between">
                      <h2 className="flex items-center gap-2 font-extrabold"><ChartColumn className="h-4 w-4" /> Historial</h2>
                      <div className="flex gap-1 text-xs font-bold text-[#6b8494]">
                        {['1h', '6h', '12h', '24h'].map((item) => (
                          <button
                            key={item}
                            type="button"
                            className={`rounded-full px-2 py-1 ${range === item ? 'bg-[#16324a] text-white' : ''}`}
                            onClick={() => {
                              setRange(item)
                              setSeriesMeta(clientRangeMeta(item))
                              if (summary.device?.id) void loadSeries(summary.device.id, item)
                            }}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </header>
                    <HistoryChart
                      data={chartData}
                      rangeMeta={seriesMeta}
                      irrigations={chartIrrigations}
                    />
                  </article>
                )}

                {show('sistema') && (
                  <article className={`${glass} p-4`}>
                    <h2 className="mb-3 font-extrabold">Configuración</h2>
                    {!summary.device && summary.zone ? (
                      <div className="grid gap-2">
                        <label className="block text-sm font-bold text-[#0a3d6b]">
                          mqtt_id
                          <input className="mt-1 h-11 w-full rounded-xl border border-[#d7e3ee] bg-white px-3" value={mqttIdDraft} onChange={(e) => setMqttIdDraft(e.target.value)} placeholder="esp32-1" />
                        </label>
                        <button className="h-11 rounded-xl bg-gradient-to-r from-[#1d4ed8] to-[#22c55e] font-extrabold text-white" type="button" disabled={busy} onClick={() => { void createDevice() }}>
                          Vincular ESP32
                        </button>
                      </div>
                    ) : (
                      <>
                        <form className="grid gap-2" onSubmit={saveSettings}>
                          {[
                            ['thresholdPct', 'Umbral humedad %'],
                            ['maxIrrigationSeconds', 'Duración máx. (s)'],
                            ['tankMinPct', 'Tanque mínimo %'],
                            ['batteryMinPct', 'Batería mínima %'],
                          ].map(([key, label]) => (
                            <label key={key} className="block text-sm font-bold text-[#0a3d6b]">
                              {label}
                              <input className="mt-1 h-10 w-full rounded-xl border border-[#d7e3ee] bg-white px-3" type="number" value={settingsDraft[key] ?? ''} onChange={(e) => setSettingsDraft((c) => ({ ...c, [key]: e.target.value }))} />
                            </label>
                          ))}
                          <label className="flex items-center justify-between text-sm font-bold text-[#0a3d6b]">
                            Modo automático
                            <button type="button" className={`h-7 w-12 rounded-full p-1 ${auto ? 'bg-[#2fbe59]' : 'bg-[#24527a]'}`} onClick={() => setSettingsDraft((c) => ({ ...c, mode: auto ? 'manual' : 'auto' }))}>
                              <i className={`block h-5 w-5 rounded-full bg-white transition ${auto ? 'translate-x-5' : ''}`} />
                            </button>
                          </label>
                          <label className="flex items-center justify-between text-sm font-bold text-[#0a3d6b]">
                            Manual con batería baja
                            <input type="checkbox" checked={Boolean(settingsDraft.allowManualOnBattery)} onChange={(e) => setSettingsDraft((c) => ({ ...c, allowManualOnBattery: e.target.checked }))} />
                          </label>
                          <button className="h-11 rounded-xl bg-gradient-to-r from-[#1d4ed8] to-[#22c55e] font-extrabold text-white" type="submit" disabled={busy}>Guardar ajustes</button>
                        </form>

                        <form className="mt-5 grid gap-2 border-t border-[#e7eef3] pt-4" onSubmit={saveCalibration}>
                          <h3 className="font-extrabold">Calibraciones</h3>
                          <p className="text-xs font-semibold text-[#6b8494]">Pon el sensor en tierra seca y pulsa “Guardar como seco”.</p>
                          <div className="grid grid-cols-2 gap-2">
                            <button type="button" className="h-10 rounded-xl border border-[#d7e3ee] bg-white text-sm font-bold" onClick={() => { void captureSoil('dry') }}>Guardar como seco</button>
                            <button type="button" className="h-10 rounded-xl border border-[#d7e3ee] bg-white text-sm font-bold" onClick={() => { void captureSoil('wet') }}>Guardar como mojado</button>
                          </div>
                          {[
                            ['humidityRawDry', 'Raw seco'],
                            ['humidityRawWet', 'Raw mojado'],
                            ['distanceFullCm', 'Dist. lleno cm'],
                            ['distanceEmptyCm', 'Dist. vacío cm'],
                            ['batteryVEmpty', 'V batería vacía'],
                            ['batteryVFull', 'V batería llena'],
                          ].map(([key, label]) => (
                            <label key={key} className="block text-sm font-bold text-[#0a3d6b]">
                              {label}
                              <input className="mt-1 h-10 w-full rounded-xl border border-[#d7e3ee] bg-white px-3" type="number" step="any" value={calDraft[key] ?? ''} onChange={(e) => setCalDraft((c) => ({ ...c, [key]: e.target.value }))} />
                            </label>
                          ))}
                          <button className="h-11 rounded-xl border border-[#d7e3ee] bg-white font-extrabold text-[#0a3d6b]" type="submit" disabled={busy}>Guardar calibración</button>
                        </form>
                      </>
                    )}
                    {newApiKey && (
                      <p className="mt-3 break-all rounded-xl bg-[#f4f8fb] p-3 text-xs font-semibold text-[#0a3d6b]">
                        Clave (DEVICE_API_KEYS): <code>{newApiKey}</code>
                      </p>
                    )}
                    {actionError && <p className="mt-3 text-sm font-bold text-[#b42318]">{actionError}</p>}
                    {actionNote && <p className="mt-3 text-sm font-bold text-[#0f6b32]">{actionNote}</p>}
                  </article>
                )}

                {show('sistema') && (
                  <article className={`${glass} p-4`}>
                    <h2 className="mb-2 font-extrabold">Historial de riegos</h2>
                    <ul className="text-sm">
                      {(summary.irrigations || []).length === 0 ? (
                        <li className="border-t border-[#e7eef3] py-3 text-[#6b8494]">Sin riegos aún.</li>
                      ) : (
                        summary.irrigations.slice(0, 8).map((row) => (
                          <li key={row.id} className="flex justify-between gap-3 border-t border-[#e7eef3] py-2">
                            <span>{row.reason} · {row.secondsRequested ?? '—'}s</span>
                            <time className="text-[#7e94a3]">{row.startedLabel}</time>
                          </li>
                        ))
                      )}
                    </ul>
                  </article>
                )}

                {show('alertas') && (
                  <article className={`${glass} p-4`}>
                    <h2 className="mb-2 flex items-center gap-2 font-extrabold"><Bell className="h-4 w-4" /> Alertas</h2>
                    <ul>
                      {(summary.alerts || []).length === 0 ? (
                        <li className="border-t border-[#e7eef3] py-3 text-sm font-semibold text-[#6b8494]">No hay alertas.</li>
                      ) : (
                        summary.alerts.map((entry) => (
                          <li key={entry.id} className="flex justify-between gap-3 border-t border-[#e7eef3] py-2 text-sm">
                            <span>{entry.message}</span>
                            <time className="shrink-0 text-[#7e94a3]">{entry.createdLabel}</time>
                          </li>
                        ))
                      )}
                    </ul>
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
