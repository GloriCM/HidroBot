import {
  Bell,
  Camera,
  ChartColumn,
  Droplets,
  Gauge,
  Play,
  Square,
  User,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import OnboardingWizard from '../components/OnboardingWizard'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import HistoryChart from '../components/HistoryChart'
import SoilCalibrationWizard from '../components/SoilCalibrationWizard'
import TankCalibrationWizard from '../components/TankCalibrationWizard'
import PanelChrome from '../components/panel/PanelChrome'
import { BtnPrimary, BtnSecondary, PageHeader, PanelCard, StatusBanner, StatCard } from '../components/panel/ui'
import { useAuth } from '../hooks/useAuth'
import { api } from '../lib/api'
import { validateClaimCodeInput } from '../lib/apiErrors'
import { usePanelTheme } from '../hooks/usePanelTheme'
import { ONBOARDING_START_KEY } from '../lib/onboarding'
import { moistureState } from '../lib/moisture'
import {
  isTankCalibrated,
  stableMedianFromReadings,
  TANK_MEDIAN_SAMPLE_SIZE,
  validateTankDistancePair,
} from '../lib/tankCalibration'

const SECTION_COPY = {
  inicio: {
    title: 'Resumen',
    description: 'Estado actual de humedad, tanque y riego.',
  },
  dispositivos: {
    title: 'Dispositivos',
    description: 'Vincula tu ESP32 y gestiona la propiedad.',
  },
  historial: {
    title: 'Historial',
    description: 'Gráficos de telemetría y riegos recientes.',
  },
  sistema: {
    title: 'Ajustes',
    description: 'Umbrales, notificaciones y calibración.',
  },
  alertas: {
    title: 'Alertas',
    description: 'Avisos del sistema en tu jardín.',
  },
}

function photoKey(email) {
  return `hidrobot_photo_${email}`
}

function onboardingDoneKey(userId) {
  return `hidrobot_onboarding_done_${userId}`
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

function clientRangeMeta(rangeKey) {
  const hours = rangeKey === '1h' ? 1 : rangeKey === '6h' ? 6 : rangeKey === '12h' ? 12 : 24
  const toT = Date.now()
  return { fromT: toT - hours * 60 * 60 * 1000, toT, key: rangeKey }
}

/** Acepta "12,6" y "12.6". */
function parseLocaleNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN
  if (value == null) return NaN
  const text = String(value).trim().replace(/\s/g, '').replace(',', '.')
  if (!text) return NaN
  return Number(text)
}

function settingsFromSummary(data) {
  return {
    thresholdPct: data.settings?.thresholdPct ?? 35,
    maxIrrigationSeconds: data.settings?.maxIrrigationSeconds ?? 60,
    mode: data.settings?.mode ?? 'auto',
    tankMinPct: data.settings?.tankMinPct ?? 10,
    batteryMinPct: data.settings?.batteryMinPct ?? 30,
    allowManualOnBattery: data.settings?.allowManualOnBattery ?? false,
  }
}

function calibrationFromSummary(data) {
  return {
    humidityRawDry: data.calibration?.humidityRawDry ?? 3000,
    humidityRawWet: data.calibration?.humidityRawWet ?? 1200,
    distanceFullCm: data.calibration?.distanceFullCm ?? 5,
    distanceEmptyCm: data.calibration?.distanceEmptyCm ?? 40,
    batteryVEmpty: data.calibration?.batteryVEmpty ?? 9,
    batteryVFull: data.calibration?.batteryVFull ?? 12.6,
    updatedAt: data.calibration?.updatedAt ?? null,
  }
}

function calibrationFromApi(cal) {
  if (!cal) return calibrationFromSummary({ calibration: null })
  return {
    humidityRawDry: cal.humidityRawDry ?? 3000,
    humidityRawWet: cal.humidityRawWet ?? 1200,
    distanceFullCm: cal.distanceFullCm ?? 5,
    distanceEmptyCm: cal.distanceEmptyCm ?? 40,
    batteryVEmpty: cal.batteryVEmpty ?? 9,
    batteryVFull: cal.batteryVFull ?? 12.6,
    updatedAt: cal.updatedAt ?? null,
  }
}

function formatCalDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return '—'
  }
}

function isSoilCalibrated(cal) {
  const dry = Number(cal?.humidityRawDry)
  const wet = Number(cal?.humidityRawWet)
  return Number.isFinite(dry) && Number.isFinite(wet) && dry > wet
}

function sameSettings(a, b) {
  if (!a || !b) return false
  return (
    parseLocaleNumber(a.thresholdPct) === parseLocaleNumber(b.thresholdPct) &&
    parseLocaleNumber(a.maxIrrigationSeconds) === parseLocaleNumber(b.maxIrrigationSeconds) &&
    a.mode === b.mode &&
    parseLocaleNumber(a.tankMinPct) === parseLocaleNumber(b.tankMinPct) &&
    parseLocaleNumber(a.batteryMinPct) === parseLocaleNumber(b.batteryMinPct) &&
    Boolean(a.allowManualOnBattery) === Boolean(b.allowManualOnBattery)
  )
}

function sameCalibration(a, b) {
  if (!a || !b) return false
  const keys = [
    'humidityRawDry',
    'humidityRawWet',
    'distanceFullCm',
    'distanceEmptyCm',
    'batteryVEmpty',
    'batteryVFull',
  ]
  return keys.every((key) => parseLocaleNumber(a[key]) === parseLocaleNumber(b[key]))
}

function validateSettingsDraft(draft) {
  const thresholdPct = parseLocaleNumber(draft.thresholdPct)
  const maxIrrigationSeconds = parseLocaleNumber(draft.maxIrrigationSeconds)
  const tankMinPct = parseLocaleNumber(draft.tankMinPct)
  const batteryMinPct = parseLocaleNumber(draft.batteryMinPct)
  if (![thresholdPct, maxIrrigationSeconds, tankMinPct, batteryMinPct].every(Number.isFinite)) {
    return 'Revisa los números (usa punto o coma para decimales).'
  }
  if (thresholdPct < 0 || thresholdPct > 100) return 'El umbral de humedad debe estar entre 0 y 100.'
  if (tankMinPct < 0 || tankMinPct > 100) return 'El tanque mínimo debe estar entre 0 y 100.'
  if (batteryMinPct < 0 || batteryMinPct > 100) return 'La batería mínima debe estar entre 0 y 100.'
  if (!Number.isInteger(maxIrrigationSeconds) || maxIrrigationSeconds < 1 || maxIrrigationSeconds > 600) {
    return 'La duración máxima debe ser un entero entre 1 y 600 s.'
  }
  return null
}

function validateCalibrationDraft(draft) {
  const humidityRawDry = parseLocaleNumber(draft.humidityRawDry)
  const humidityRawWet = parseLocaleNumber(draft.humidityRawWet)
  const distanceFullCm = parseLocaleNumber(draft.distanceFullCm)
  const distanceEmptyCm = parseLocaleNumber(draft.distanceEmptyCm)
  const batteryVEmpty = parseLocaleNumber(draft.batteryVEmpty)
  const batteryVFull = parseLocaleNumber(draft.batteryVFull)
  const values = [humidityRawDry, humidityRawWet, distanceFullCm, distanceEmptyCm, batteryVEmpty, batteryVFull]
  if (!values.every(Number.isFinite)) {
    return 'Revisa los números (usa punto o coma para decimales).'
  }
  if (!Number.isInteger(humidityRawDry) || !Number.isInteger(humidityRawWet)) {
    return 'Los raw de humedad deben ser enteros.'
  }
  if (humidityRawDry <= humidityRawWet) {
    return 'El raw seco debe ser mayor que el raw mojado.'
  }
  const tankErr = validateTankDistancePair(distanceFullCm, distanceEmptyCm)
  if (tankErr) return tankErr
  if (batteryVFull <= batteryVEmpty) {
    return 'El voltaje lleno debe ser mayor que el vacío.'
  }
  if (batteryVEmpty < 0 || batteryVFull > 20) {
    return 'Los voltajes de batería no tienen sentido (0–20 V).'
  }
  return null
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
  const { isDark, toggle: onThemeToggle } = usePanelTheme()
  const [searchParams, setSearchParams] = useSearchParams()
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
  const [devicesList, setDevicesList] = useState({ devices: [], previous: [] })
  const [claimCode, setClaimCode] = useState('')
  const [claimName, setClaimName] = useState('Mi HidroBot')
  const [menu, setMenu] = useState(false)
  const [photo, setPhoto] = useState(() => readPhoto(user?.email))
  const [draft, setDraft] = useState(() => ({
    name: user?.name || '',
    email: user?.email || '',
    garden: user?.garden || '',
  }))
  const [settingsDraft, setSettingsDraft] = useState({})
  const [calDraft, setCalDraft] = useState({})
  const [settingsBaseline, setSettingsBaseline] = useState(null)
  const [calBaseline, setCalBaseline] = useState(null)
  const [tankWizardOpen, setTankWizardOpen] = useState(false)
  const [soilWizardOpen, setSoilWizardOpen] = useState(false)
  const [tankWizardStep, setTankWizardStep] = useState(1)
  const [soilWizardStep, setSoilWizardStep] = useState(1)
  const [advancedCalOpen, setAdvancedCalOpen] = useState(false)
  const [calDeviceId, setCalDeviceId] = useState('')
  const [calDeviceCal, setCalDeviceCal] = useState(() => calibrationFromSummary({ calibration: null }))
  const [tankSamples, setTankSamples] = useState([])
  const [liveDeviceTelemetry, setLiveDeviceTelemetry] = useState({ distanceCm: null, humidityRaw: null, at: null })
  const [wizardSavedEmpty, setWizardSavedEmpty] = useState(false)
  const [wizardSavedFull, setWizardSavedFull] = useState(false)
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' })
  const [profileNote, setProfileNote] = useState('')
  const [profileError, setProfileError] = useState('')
  const [profileTab, setProfileTab] = useState('datos')
  const [notifDraft, setNotifDraft] = useState(null)
  const [extraEmail, setExtraEmail] = useState('')
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [onboardingStep, setOnboardingStep] = useState(0)
  const [onboardingClaimError, setOnboardingClaimError] = useState('')
  const [showResumeOnboarding, setShowResumeOnboarding] = useState(false)
  const menuRef = useRef(null)
  const formsHydratedRef = useRef(false)
  const settingsDirtyRef = useRef(false)
  const calDirtyRef = useRef(false)
  const summaryRef = useRef(emptySummary)
  const onboardingStartHandledRef = useRef(false)

  const syncFormsFrom = useCallback((data) => {
    if (!data) return
    const nextSettings = settingsFromSummary(data)
    const nextCal = calibrationFromSummary(data)
    setSettingsDraft(nextSettings)
    setCalDraft(nextCal)
    setSettingsBaseline(nextSettings)
    setCalBaseline(nextCal)
    formsHydratedRef.current = true
  }, [])

  const loadSummary = useCallback(async ({ syncForms = false } = {}) => {
    try {
      const data = await api.panelSummary()
      setSummary(data)
      summaryRef.current = data
      // Solo hidratar formularios la 1ª vez, al abrir Configuración (si está limpio) o tras guardar.
      if (syncForms || !formsHydratedRef.current) {
        syncFormsFrom(data)
      }
      setError('')
      return data
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los datos del panel.')
      return null
    } finally {
      setLoading(false)
    }
  }, [syncFormsFrom])

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
    // El ESP32 envía cada 10 s: refresca telemetría sin tocar los borradores del formulario.
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
    if (section !== 'dispositivos') return undefined
    void loadDevices()
    const id = setInterval(() => {
      void loadDevices()
    }, 10_000)
    return () => clearInterval(id)
  }, [section])

  useEffect(() => {
    if (section !== 'sistema') return
    void loadDevices()
  }, [section])

  useEffect(() => {
    if (!calDeviceId || (!tankWizardOpen && !soilWizardOpen)) return undefined
    const pull = async () => {
      try {
        const data = await api.telemetry(calDeviceId, '1h')
        const series = data.series || []
        const last = series[series.length - 1]
        if (!last) return
        const at = last.t ?? Date.now()
        setLiveDeviceTelemetry({
          distanceCm: last.distanceCm ?? null,
          humidityRaw: last.humidityRaw ?? null,
          at,
        })
        if (tankWizardOpen && last.distanceCm != null) {
          setTankSamples((prev) => {
            if (prev.length && prev[prev.length - 1].at === at) return prev
            return [...prev, { value: last.distanceCm, at }].slice(-30)
          })
        }
      } catch {
        /* telemetría opcional */
      }
    }
    void pull()
    const id = setInterval(pull, 10_000)
    return () => clearInterval(id)
  }, [calDeviceId, tankWizardOpen, soilWizardOpen])

  useEffect(() => {
    if (!tankWizardOpen || !summary.device?.id || calDeviceId !== summary.device.id) return
    const d = summary.latest?.distanceCm
    const at = summary.latest?.recordedAt
    if (d == null || !Number.isFinite(d)) return
    setLiveDeviceTelemetry((prev) => ({
      ...prev,
      distanceCm: d,
      at: at ?? prev.at,
    }))
    setTankSamples((prev) => {
      if (prev.length && prev[prev.length - 1].at === at) return prev
      return [...prev, { value: d, at: at ?? Date.now() }].slice(-30)
    })
  }, [tankWizardOpen, calDeviceId, summary.device?.id, summary.latest?.distanceCm, summary.latest?.recordedAt])

  useEffect(() => {
    if (section !== 'sistema') return
    if (settingsDirtyRef.current || calDirtyRef.current) return
    if (summaryRef.current?.settings || summaryRef.current?.calibration) {
      syncFormsFrom(summaryRef.current)
    }
  }, [section, syncFormsFrom])

  useEffect(() => {
    if (section !== 'sistema' || !summary.zone?.id) return
    api
      .getNotifications(summary.zone.id)
      .then((data) => setNotifDraft(data.notifications))
      .catch(() => setNotifDraft(null))
  }, [section, summary.zone?.id])

  useEffect(() => {
    if (!user?.id || !ready) return

    let shouldStart = searchParams.get('bienvenida') === '1'
    if (shouldStart) {
      setSearchParams({}, { replace: true })
    }
    try {
      if (sessionStorage.getItem(ONBOARDING_START_KEY) === '1') {
        shouldStart = true
        sessionStorage.removeItem(ONBOARDING_START_KEY)
      }
    } catch {
      /* ignore */
    }

    if (shouldStart && !onboardingStartHandledRef.current) {
      onboardingStartHandledRef.current = true
      setOnboardingOpen(true)
      setOnboardingStep(0)
      setShowResumeOnboarding(false)
      return
    }

    const done = localStorage.getItem(onboardingDoneKey(user.id)) === '1'
    const needsSetup =
      !summary.device ||
      !isTankCalibrated(summary.calibration ?? calDraft) ||
      !isSoilCalibrated(summary.calibration ?? calDraft)
    setShowResumeOnboarding(!done && needsSetup && !onboardingOpen)
  }, [
    user?.id,
    ready,
    searchParams,
    setSearchParams,
    summary.device,
    summary.calibration,
    calDraft,
    onboardingOpen,
  ])

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
      <div className="grid min-h-screen place-items-center bg-slate-100 text-slate-800">
        <p className="rounded-2xl border border-slate-200 bg-white px-6 py-4 font-semibold shadow-sm">
          Cargando panel…
        </p>
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
  const cardTankCal = summary.calibration ?? calDraft
  const tankCalibrated = isTankCalibrated(cardTankCal)
  const soilCalibrated = isSoilCalibrated(cardTankCal)
  const calDisplayDevice =
    devicesList.devices?.find((d) => d.id === summary.device?.id) ?? summary.device
  const wizardLiveDistance =
    calDeviceId === summary.device?.id
      ? summary.latest?.distanceCm ?? liveDeviceTelemetry.distanceCm
      : liveDeviceTelemetry.distanceCm
  const wizardLiveRaw =
    calDeviceId === summary.device?.id
      ? summary.latest?.humidityRaw ?? liveDeviceTelemetry.humidityRaw
      : liveDeviceTelemetry.humidityRaw
  const wizardDeviceMeta =
    devicesList.devices?.find((d) => d.id === calDeviceId) ||
    (summary.device?.id === calDeviceId
      ? { id: summary.device.id, name: summary.device.name, mqttId: summary.device.mqttId }
      : null)
  const tankCanAdvance =
    (tankWizardStep === 1 && wizardSavedEmpty) ||
    (tankWizardStep === 2 && wizardSavedFull) ||
    tankWizardStep >= 3
  const onBattery = summary.onBattery
  const settingsDirty = Boolean(settingsBaseline) && !sameSettings(settingsDraft, settingsBaseline)
  const calDirty = Boolean(calBaseline) && !sameCalibration(calDraft, calBaseline)
  settingsDirtyRef.current = settingsDirty
  calDirtyRef.current = calDirty
  const formsDirty = settingsDirty || calDirty
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
  const isSection = (id) => section === id
  const sectionCopy = SECTION_COPY[section]
  const alertCount = (summary.alerts || []).length

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
    const invalid = validateSettingsDraft(settingsDraft)
    if (invalid) {
      setActionError(invalid)
      return
    }
    setBusy(true)
    setActionError('')
    try {
      await api.patchSettings(summary.zone.id, {
        thresholdPct: parseLocaleNumber(settingsDraft.thresholdPct),
        maxIrrigationSeconds: Math.round(parseLocaleNumber(settingsDraft.maxIrrigationSeconds)),
        mode: settingsDraft.mode,
        tankMinPct: parseLocaleNumber(settingsDraft.tankMinPct),
        batteryMinPct: parseLocaleNumber(settingsDraft.batteryMinPct),
        allowManualOnBattery: Boolean(settingsDraft.allowManualOnBattery),
      })
      setActionNote('Configuración guardada.')
      await loadSummary({ syncForms: true })
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function saveNotifications() {
    if (!summary.zone?.id || !notifDraft || busy) return
    const low = parseLocaleNumber(notifDraft.tankAlertLowPct)
    if (!Number.isFinite(low) || low < 0 || low > 100) {
      setActionError('El umbral de aviso de tanque debe estar entre 0 y 100.')
      return
    }
    setBusy(true)
    setActionError('')
    try {
      const data = await api.patchNotifications(summary.zone.id, {
        enabled: Boolean(notifDraft.enabled),
        notifyTankLow: Boolean(notifDraft.notifyTankLow),
        notifyTankEmpty: Boolean(notifDraft.notifyTankEmpty),
        notifyTankRecovered: Boolean(notifDraft.notifyTankRecovered),
        notifyDeviceOffline: Boolean(notifDraft.notifyDeviceOffline),
        ownerEmailEnabled: Boolean(notifDraft.ownerEmailEnabled),
        tankAlertLowPct: low,
      })
      setNotifDraft(data.notifications)
      setActionNote('Notificaciones guardadas.')
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function addExtraRecipient() {
    if (!summary.zone?.id || busy) return
    const email = extraEmail.trim()
    if (!email) return
    setBusy(true)
    setActionError('')
    try {
      const data = await api.addNotificationRecipient(summary.zone.id, email)
      setNotifDraft((prev) =>
        prev
          ? {
              ...prev,
              extraRecipients: [...(prev.extraRecipients || []), data.recipient],
            }
          : prev,
      )
      setExtraEmail('')
      setActionNote('Revisa el correo para confirmar el destinatario adicional.')
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function removeExtraRecipient(id) {
    if (!summary.zone?.id || busy) return
    setBusy(true)
    try {
      await api.removeNotificationRecipient(summary.zone.id, id)
      setNotifDraft((prev) =>
        prev
          ? { ...prev, extraRecipients: (prev.extraRecipients || []).filter((r) => r.id !== id) }
          : prev,
      )
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function sendTestEmail() {
    if (!summary.zone?.id || busy) return
    setBusy(true)
    setActionError('')
    try {
      const result = await api.sendTestNotificationEmail(summary.zone.id)
      setActionNote(result.message || 'Correo de prueba encolado.')
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function saveCalibration(event) {
    event.preventDefault()
    if (!summary.device?.id || busy) return
    const v0 = parseLocaleNumber(calDraft.batteryVEmpty)
    const v1 = parseLocaleNumber(calDraft.batteryVFull)
    if (!Number.isFinite(v0) || !Number.isFinite(v1) || v1 <= v0) {
      setActionError('Revisa los voltajes de batería (lleno debe ser mayor que vacío).')
      return
    }
    setBusy(true)
    setActionError('')
    try {
      await api.patchCalibration(summary.device.id, {
        batteryVEmpty: v0,
        batteryVFull: v1,
      })
      setActionNote('Calibración de batería guardada.')
      await loadSummary({ syncForms: true })
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function loadCalibrationForDevice(deviceId) {
    if (!deviceId) return
    try {
      const data = await api.getCalibration(deviceId)
      setCalDeviceCal(calibrationFromApi(data.calibration))
      if (deviceId === summary.device?.id) {
        const next = calibrationFromApi(data.calibration)
        setCalDraft(next)
        setCalBaseline(next)
      }
    } catch (err) {
      setActionError(err.message)
    }
  }

  function pickCalDeviceId() {
    return summary.device?.id || devicesList.devices?.[0]?.id || ''
  }

  async function openTankWizard() {
    const id = pickCalDeviceId()
    if (!id) {
      setActionError('No hay dispositivo vinculado para calibrar.')
      return
    }
    setCalDeviceId(id)
    setTankWizardStep(1)
    setWizardSavedEmpty(false)
    setWizardSavedFull(false)
    setTankSamples([])
    setTankWizardOpen(true)
    await loadCalibrationForDevice(id)
  }

  async function openSoilWizard() {
    const id = pickCalDeviceId()
    if (!id) {
      setActionError('No hay dispositivo vinculado para calibrar.')
      return
    }
    setCalDeviceId(id)
    setSoilWizardStep(1)
    setSoilWizardOpen(true)
    await loadCalibrationForDevice(id)
  }

  async function captureTankLevel(kind) {
    if (!calDeviceId || busy) return
    const values = tankSamples.map((s) => s.value)
    const { median, count, stability } = stableMedianFromReadings(values, TANK_MEDIAN_SAMPLE_SIZE)
    if (median == null || count < TANK_MEDIAN_SAMPLE_SIZE || stability.unstable) return
    const key = kind === 'empty' ? 'distanceEmptyCm' : 'distanceFullCm'
    const full =
      kind === 'full' ? median : parseLocaleNumber(calDeviceCal.distanceFullCm)
    const empty =
      kind === 'empty' ? median : parseLocaleNumber(calDeviceCal.distanceEmptyCm)
    const tankErr = validateTankDistancePair(full, empty)
    if (tankErr) return
    const nextCal = { ...calDeviceCal, [key]: Math.round(median * 10) / 10 }
    setBusy(true)
    setActionError('')
    try {
      await api.patchCalibration(calDeviceId, { [key]: nextCal[key] })
      setCalDeviceCal(nextCal)
      if (calDeviceId === summary.device?.id) {
        setCalDraft((c) => ({ ...c, [key]: nextCal[key] }))
        setCalBaseline((c) => ({ ...c, [key]: nextCal[key] }))
      }
      setActionNote(
        `Tanque ${kind === 'empty' ? 'vacío' : 'lleno'}: mediana ${median.toFixed(1)} cm (${count} lecturas).`,
      )
      if (kind === 'empty') {
        setWizardSavedEmpty(true)
        setTankWizardStep(2)
        setTankSamples([])
      } else {
        setWizardSavedFull(true)
        setTankWizardStep(3)
      }
      await loadSummary({ syncForms: false })
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function captureSoil(kind) {
    if (!calDeviceId || busy) return
    const raw =
      calDeviceId === summary.device?.id
        ? summary.latest?.humidityRaw ?? liveDeviceTelemetry.humidityRaw
        : liveDeviceTelemetry.humidityRaw
    if (raw == null) {
      setActionError('Aún no hay lectura de humedad del sensor.')
      return
    }
    const key = kind === 'dry' ? 'humidityRawDry' : 'humidityRawWet'
    const nextCal = { ...calDeviceCal, [key]: raw }
    const invalid = validateCalibrationDraft(nextCal)
    if (invalid) {
      setActionError(invalid)
      return
    }
    setBusy(true)
    setActionError('')
    try {
      await api.patchCalibration(calDeviceId, { [key]: Number(raw) })
      setCalDeviceCal(nextCal)
      if (calDeviceId === summary.device?.id) {
        setCalDraft(nextCal)
        setCalBaseline((c) => ({ ...c, [key]: raw }))
      }
      setActionNote(
        kind === 'dry' ? `Seco guardado: ${raw}.` : `Mojado guardado: ${raw}.`,
      )
      if (kind === 'dry') setSoilWizardStep(2)
      else setSoilWizardOpen(false)
      await loadSummary({ syncForms: false })
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function loadDevices() {
    try {
      const data = await api.listDevices()
      setDevicesList({
        devices: Array.isArray(data?.devices) ? data.devices : [],
        previous: Array.isArray(data?.previous) ? data.previous : [],
      })
    } catch (err) {
      setActionError(err.message)
    }
  }

  async function claimDevice() {
    if (!summary.zone?.id || busy) return
    setBusy(true)
    setActionError('')
    try {
      await api.claimDevice({
        code: claimCode.trim(),
        zoneId: summary.zone.id,
        name: claimName.trim() || 'Mi HidroBot',
      })
      setActionNote('Dispositivo vinculado correctamente.')
      setClaimCode('')
      await loadSummary({ syncForms: true })
      await loadDevices()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function claimDeviceForOnboarding() {
    if (!summary.zone?.id || busy) return
    const codeProblem = validateClaimCodeInput(claimCode)
    if (codeProblem) {
      setOnboardingClaimError(codeProblem)
      return
    }
    setBusy(true)
    setOnboardingClaimError('')
    try {
      await api.claimDevice({
        code: claimCode.trim(),
        zoneId: summary.zone.id,
        name: claimName.trim() || 'Mi HidroBot',
      })
      const data = await loadSummary({ syncForms: true })
      await loadDevices()
      if (data?.device?.id) setCalDeviceId(data.device.id)
      setOnboardingStep(2)
      setActionNote('Dispositivo vinculado. Sigue con la calibración del tanque.')
    } catch (err) {
      setOnboardingClaimError(err.message || 'No se pudo vincular.')
    } finally {
      setBusy(false)
    }
  }

  function finishOnboarding() {
    if (user?.id) localStorage.setItem(onboardingDoneKey(user.id), '1')
    setOnboardingOpen(false)
    setShowResumeOnboarding(false)
    setSection('inicio')
    setActionNote('¡Listo! Tu HidroBot está configurado.')
  }

  function dismissOnboarding() {
    setOnboardingOpen(false)
  }

  async function unlinkDevice(deviceId) {
    const keep = window.confirm(
      '¿Conservar el historial de este periodo en "Dispositivos anteriores"? Pulsa Cancelar para borrarlo.',
    )
    setBusy(true)
    try {
      await api.unlinkDevice(deviceId, { keepHistory: keep })
      setActionNote(keep ? 'Dispositivo desvinculado. Historial conservado.' : 'Dispositivo desvinculado. Historial borrado.')
      await loadSummary({ syncForms: true })
      await loadDevices()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
    <PanelChrome
      section={section}
      onSection={setSection}
      user={user}
      photo={photo}
      menu={menu}
      setMenu={setMenu}
      menuRef={menuRef}
      alertCount={alertCount}
      online={online}
      isDark={isDark}
      onThemeToggle={onThemeToggle}
      onLogout={() => logout()}
    >
      {section !== 'perfil' && sectionCopy ? (
        <PageHeader title={sectionCopy.title} description={`${sectionCopy.description} · ${now}`} />
      ) : null}

      {section === 'perfil' ? (
        <PanelCard className="mx-auto w-full max-w-md p-6">
              <PageHeader title="Perfil" description="Datos de cuenta y seguridad." />
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
        </PanelCard>
      ) : (
        <div className="mx-auto w-full max-w-5xl">
          {onBattery ? (
            <StatusBanner tone="warn">
              Equipo en batería ({battery == null ? '—' : `${Math.round(battery)}%`}). El riego automático puede
              estar limitado.
            </StatusBanner>
          ) : null}
          {error ? <StatusBanner tone="error">{error}</StatusBanner> : null}
          {loading ? <StatusBanner tone="info">Actualizando datos del jardín…</StatusBanner> : null}

          {isSection('inicio') && showResumeOnboarding && !onboardingOpen ? (
            <PanelCard className="pc-banner-ok mb-4 flex flex-wrap items-center justify-between gap-3 border-emerald-200 bg-emerald-50/80 p-4">
              <p className="text-sm font-medium text-emerald-950">
                Aún no has terminado la configuración inicial (vincular y calibrar).
              </p>
              <BtnPrimary
                type="button"
                className="h-9 px-4 text-sm"
                onClick={() => {
                  setOnboardingOpen(true)
                  setOnboardingStep(summary.device ? (tankCalibrated ? (soilCalibrated ? 4 : 3) : 2) : 1)
                }}
              >
                Continuar configuración
              </BtnPrimary>
            </PanelCard>
          ) : null}

          {isSection('inicio') ? (
            <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard
                icon={Droplets}
                iconClass="bg-sky-600"
                label="Humedad del suelo"
                value={value == null ? '—' : `${Number(value).toFixed(1)}%`}
                meta={humidityStatus}
                footer={<MiniChart data={chartData} dataKey="humidity" color="#0284c7" />}
              />
              <StatCard
                icon={Gauge}
                iconClass="bg-teal-600"
                label="Nivel del tanque"
                value={tank == null ? '—' : `${Math.round(tank)}%`}
                meta={
                  summary.latest?.distanceCm == null
                    ? 'Sin lectura del ultrasónico'
                    : `${summary.latest.distanceCm} cm al sensor`
                }
                footer={<MiniChart data={chartData} dataKey="tank" color="#0d9488" />}
              />
              <StatCard
                icon={Zap}
                iconClass="bg-amber-600"
                label="Energía"
                value={onBattery ? 'Batería' : 'Red eléctrica'}
                meta={`Red ${summary.latest?.vRed ?? '—'} V · Bat ${summary.latest?.vBat ?? '—'} V${
                  battery != null ? ` (${Math.round(battery)}%)` : ''
                }`}
              />
              <StatCard
                icon={Droplets}
                iconClass="bg-emerald-600"
                label="Bomba"
                value={pump ? 'Regando' : 'Apagada'}
                footer={
                  <div className="grid grid-cols-2 gap-2">
                    <BtnPrimary
                      className="w-full rounded-full"
                      disabled={!online || busy || !summary.device}
                      onClick={() => {
                        void startWater()
                      }}
                    >
                      <Play className="h-4 w-4 fill-white" /> Regar
                    </BtnPrimary>
                    <BtnSecondary
                      className="w-full rounded-full"
                      disabled={busy || !summary.device}
                      onClick={() => {
                        void stopWater()
                      }}
                    >
                      <Square className="h-3.5 w-3.5 fill-current" /> Detener
                    </BtnSecondary>
                  </div>
                }
              />
              <PanelCard className="p-4 sm:col-span-2 xl:col-span-1">
                <h2 className="pc-section-title mb-2 text-sm">Estado del dispositivo</h2>
                <ul className="text-sm text-[var(--pc-text-secondary)]">
                  {[
                    ['MQTT', summary.device?.mqttId || '—'],
                    ['ESP32', !summary.device ? 'Sin dispositivo' : online ? 'En línea' : 'Desconectado'],
                    ['Última señal', summary.device?.lastSeenLabel || '—'],
                    ['RSSI', summary.latest?.rssi ?? '—'],
                  ].map(([name, detail]) => (
                    <li key={name} className="pc-border-t flex justify-between gap-3 border-t py-2">
                      <span>{name}</span>
                      <b className="text-right font-semibold text-emerald-700">{detail}</b>
                    </li>
                  ))}
                </ul>
              </PanelCard>
            </section>
          ) : null}

          <section className="grid gap-4">
            {isSection('dispositivos') ? (
              <PanelCard className="p-4 md:p-5">
                    <h2 className="pc-section-title mb-3 text-base">Mis dispositivos</h2>
                    {devicesList.devices?.length ? (
                      <ul className="mb-4 grid gap-2 text-sm">
                        {devicesList.devices.map((d) => (
                          <li key={d.id} className="pc-legacy-card rounded-xl border border-[#d7e3ee] bg-white/80 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="font-extrabold">{d.name}</p>
                                <p className="text-[#6b8494]">{d.zoneName} · {d.mqttId}</p>
                                <p className="text-xs">
                                  FW {d.firmwareVersion || '—'} · {d.online ? 'En línea' : 'Desconectado'}
                                </p>
                              </div>
                              <button
                                type="button"
                                className="rounded-full border border-[#d7e3ee] px-3 py-1 text-xs font-bold"
                                disabled={busy}
                                onClick={() => { void unlinkDevice(d.id) }}
                              >
                                Desvincular
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mb-3 text-sm font-semibold text-[#0a3d6b]">No tienes dispositivos activos.</p>
                    )}
                    {summary.zone && !summary.device ? (
                      <div className="grid gap-2 border-t border-[#e7eef3] pt-3">
                        <p className="text-sm font-bold text-[#0a3d6b]">Añadir dispositivo (zona: {summary.zone.name})</p>
                        <input
                          className="h-11 rounded-xl border border-[#d7e3ee] bg-white px-3 font-mono text-lg tracking-widest"
                          placeholder="XXX-XXX"
                          value={claimCode}
                          onChange={(e) => setClaimCode(e.target.value)}
                        />
                        <input
                          className="h-11 rounded-xl border border-[#d7e3ee] bg-white px-3"
                          placeholder="Nombre"
                          value={claimName}
                          onChange={(e) => setClaimName(e.target.value)}
                        />
                        <button
                          type="button"
                          className="h-11 rounded-xl bg-gradient-to-r from-[#1d4ed8] to-[#22c55e] font-extrabold text-white"
                          disabled={busy}
                          onClick={() => { void claimDevice() }}
                        >
                          Reclamar con código
                        </button>
                      </div>
                    ) : null}
                    {devicesList.previous?.length ? (
                      <div className="mt-4 border-t border-[#e7eef3] pt-3">
                        <h3 className="mb-2 text-sm font-extrabold">Dispositivos anteriores</h3>
                        <ul className="text-xs text-[#6b8494]">
                          {devicesList.previous.map((p) => (
                            <li key={p.ownershipId}>{p.name} · {p.zoneName}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
              </PanelCard>
            ) : null}

            {isSection('historial') ? (
              <>
                <PanelCard className="p-4 md:p-5">
                  <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                      <ChartColumn className="h-4 w-4" /> Telemetría
                    </h2>
                    <div className="flex gap-1 rounded-full bg-slate-100 p-1 text-xs font-bold text-slate-600">
                      {['1h', '6h', '12h', '24h'].map((item) => (
                        <button
                          key={item}
                          type="button"
                          className={`rounded-full px-3 py-1 ${range === item ? 'bg-white text-slate-900 shadow-sm' : ''}`}
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
                  <HistoryChart data={chartData} rangeMeta={seriesMeta} irrigations={chartIrrigations} />
                </PanelCard>
                <PanelCard className="p-4 md:p-5">
                  <h2 className="mb-2 text-base font-bold text-slate-900">Historial de riegos</h2>
                  <ul className="text-sm text-slate-600">
                    {(summary.irrigations || []).length === 0 ? (
                      <li className="border-t border-slate-100 py-3 text-slate-500">Sin riegos aún.</li>
                    ) : (
                      summary.irrigations.slice(0, 12).map((row) => (
                        <li key={row.id} className="flex justify-between gap-3 border-t border-slate-100 py-2">
                          <span>
                            {row.reason} · {row.secondsRequested ?? '—'}s
                          </span>
                          <time className="shrink-0 text-slate-400">{row.startedLabel}</time>
                        </li>
                      ))
                    )}
                  </ul>
                </PanelCard>
              </>
            ) : null}

            {isSection('sistema') ? (
              <PanelCard className="p-4 md:p-5">
                    <header className="mb-3 flex items-center justify-between gap-3">
                      <h2 className="font-extrabold">Configuración</h2>
                      {formsDirty ? (
                        <span className="rounded-full bg-[#fff4e5] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#9a5b00]">
                          Cambios sin guardar
                        </span>
                      ) : null}
                    </header>
                    {!summary.device && summary.zone ? (
                      <p className="text-sm font-semibold text-[#0a3d6b]">
                        No hay dispositivo en esta zona. Añádelo en <strong>Mis dispositivos</strong> con el código de la pantalla del ESP32.
                      </p>
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
                              <input
                                className="mt-1 h-10 w-full rounded-xl border border-[#d7e3ee] bg-white px-3"
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                value={settingsDraft[key] ?? ''}
                                onChange={(e) => setSettingsDraft((c) => ({ ...c, [key]: e.target.value }))}
                              />
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

                        {notifDraft ? (
                          <div className="mt-5 grid gap-3 rounded-2xl border border-[#d7e3ee] bg-white/75 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h3 className="font-extrabold text-[#0a3d6b]">Notificaciones</h3>
                              {!notifDraft.smtpConfigured ? (
                                <span className="rounded-full bg-[#fff4e5] px-2.5 py-1 text-[11px] font-bold text-[#9a5b00]">
                                  SMTP no configurado en el servidor
                                </span>
                              ) : null}
                            </div>
                            <p className="text-xs font-semibold text-[#6b8494]">
                              Dueño: {notifDraft.ownerEmail || '—'}
                            </p>
                            <label className="flex items-center justify-between text-sm font-bold text-[#0a3d6b]">
                              Activar correos
                              <button
                                type="button"
                                className={`h-7 w-12 rounded-full p-1 ${notifDraft.enabled ? 'bg-[#2fbe59]' : 'bg-[#24527a]'}`}
                                onClick={() => setNotifDraft((c) => ({ ...c, enabled: !c.enabled }))}
                              >
                                <i
                                  className={`block h-5 w-5 rounded-full bg-white transition ${notifDraft.enabled ? 'translate-x-5' : ''}`}
                                />
                              </button>
                            </label>
                            <label className="block text-sm font-bold text-[#0a3d6b]">
                              Umbral aviso tanque bajo (%)
                              <input
                                className="mt-1 h-10 w-full rounded-xl border border-[#d7e3ee] bg-white px-3"
                                type="text"
                                inputMode="decimal"
                                value={notifDraft.tankAlertLowPct ?? 20}
                                onChange={(e) =>
                                  setNotifDraft((c) => ({ ...c, tankAlertLowPct: e.target.value }))
                                }
                              />
                            </label>
                            {[
                              ['notifyTankLow', 'Tanque bajo'],
                              ['notifyTankEmpty', 'Tanque vacío (riego bloqueado)'],
                              ['notifyTankRecovered', 'Tanque recuperado'],
                              ['notifyDeviceOffline', 'Dispositivo desconectado'],
                            ].map(([key, label]) => (
                              <label
                                key={key}
                                className="flex items-center justify-between text-sm font-bold text-[#0a3d6b]"
                              >
                                {label}
                                <input
                                  type="checkbox"
                                  checked={Boolean(notifDraft[key])}
                                  onChange={(e) =>
                                    setNotifDraft((c) => ({ ...c, [key]: e.target.checked }))
                                  }
                                />
                              </label>
                            ))}
                            <label className="flex items-center justify-between text-sm font-bold text-[#0a3d6b]">
                              Correo del dueño activo
                              <input
                                type="checkbox"
                                checked={Boolean(notifDraft.ownerEmailEnabled)}
                                onChange={(e) =>
                                  setNotifDraft((c) => ({ ...c, ownerEmailEnabled: e.target.checked }))
                                }
                              />
                            </label>
                            <ul className="grid gap-2 text-sm">
                              {(notifDraft.extraRecipients || []).map((r) => (
                                <li
                                  key={r.id}
                                  className="flex items-center justify-between rounded-xl border border-[#d7e3ee] bg-white px-3 py-2"
                                >
                                  <span>
                                    {r.email}{' '}
                                    <span className="text-xs text-[#6b8494]">
                                      {r.confirmed ? '(confirmado)' : '(pendiente)'}
                                    </span>
                                  </span>
                                  <button
                                    type="button"
                                    className="text-xs font-bold text-[#b42318]"
                                    onClick={() => {
                                      void removeExtraRecipient(r.id)
                                    }}
                                  >
                                    Quitar
                                  </button>
                                </li>
                              ))}
                            </ul>
                            {(notifDraft.extraRecipients || []).length < 3 ? (
                              <div className="flex gap-2">
                                <input
                                  className="h-10 flex-1 rounded-xl border border-[#d7e3ee] bg-white px-3 text-sm"
                                  type="email"
                                  placeholder="Correo adicional"
                                  value={extraEmail}
                                  onChange={(e) => setExtraEmail(e.target.value)}
                                />
                                <button
                                  type="button"
                                  className="h-10 rounded-xl border border-[#d7e3ee] bg-white px-3 text-sm font-bold text-[#0a3d6b]"
                                  disabled={busy}
                                  onClick={() => {
                                    void addExtraRecipient()
                                  }}
                                >
                                  Añadir
                                </button>
                              </div>
                            ) : null}
                            <div className="grid gap-2 sm:grid-cols-2">
                              <button
                                type="button"
                                className="h-11 rounded-xl border border-[#d7e3ee] bg-white font-extrabold text-[#0a3d6b]"
                                disabled={busy}
                                onClick={() => {
                                  void saveNotifications()
                                }}
                              >
                                Guardar notificaciones
                              </button>
                              <button
                                type="button"
                                className="h-11 rounded-xl bg-[#16324a] font-extrabold text-white disabled:opacity-50"
                                disabled={busy || !notifDraft.smtpConfigured}
                                onClick={() => {
                                  void sendTestEmail()
                                }}
                              >
                                Enviar correo de prueba
                              </button>
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-5 grid gap-3 border-t border-[#e7eef3] pt-4">
                          <h3 className="font-extrabold">Calibraciones</h3>

                          <div className="rounded-2xl border border-[#d7e3ee] bg-white/75 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <h4 className="text-base font-extrabold text-[#0a3d6b]">Calibrar tanque</h4>
                                <p className="mt-1 text-xs font-semibold text-[#6b8494]">
                                  {calDisplayDevice
                                    ? `${calDisplayDevice.name ?? summary.device?.name} · ${calDisplayDevice.mqttId ?? summary.device?.mqttId}`
                                    : 'Sin dispositivo en la zona'}
                                </p>
                              </div>
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-extrabold ${tankCalibrated ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#fff4e5] text-[#9a5b00]'}`}
                              >
                                {tankCalibrated ? 'Calibrado' : 'Sin calibrar'}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-[#0a3d6b]">
                              Vacío <b>{cardTankCal.distanceEmptyCm} cm</b> · Lleno{' '}
                              <b>{cardTankCal.distanceFullCm} cm</b>
                            </p>
                            <p className="text-xs text-[#6b8494]">
                              Última actualización: {formatCalDate(summary.calibration?.updatedAt)}
                            </p>
                            <button
                              type="button"
                              className="mt-3 h-12 w-full rounded-xl bg-gradient-to-r from-[#1d4ed8] to-[#22c55e] text-sm font-extrabold text-white disabled:opacity-50"
                              disabled={busy || !summary.device}
                              onClick={() => { void openTankWizard() }}
                            >
                              Iniciar calibración
                            </button>
                          </div>

                          <div className="rounded-2xl border border-[#d7e3ee] bg-white/75 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <h4 className="text-base font-extrabold text-[#0a3d6b]">Calibrar sensor de suelo</h4>
                                <p className="mt-1 text-sm text-[#0a3d6b]">
                                  Seco <b>{cardTankCal.humidityRawDry}</b> · Mojado{' '}
                                  <b>{cardTankCal.humidityRawWet}</b>
                                </p>
                              </div>
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-extrabold ${soilCalibrated ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#fff4e5] text-[#9a5b00]'}`}
                              >
                                {soilCalibrated ? 'Calibrado' : 'Sin calibrar'}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="mt-3 h-12 w-full rounded-xl border border-[#d7e3ee] bg-white text-sm font-extrabold text-[#0a3d6b] disabled:opacity-50"
                              disabled={busy || !summary.device}
                              onClick={() => { void openSoilWizard() }}
                            >
                              Iniciar calibración de suelo
                            </button>
                          </div>

                          <details
                            className="rounded-2xl border border-[#d7e3ee] bg-white/70 p-3"
                            open={advancedCalOpen}
                            onToggle={(e) => setAdvancedCalOpen(e.target.open)}
                          >
                            <summary className="cursor-pointer text-sm font-extrabold text-[#0a3d6b]">
                              Avanzado (batería)
                            </summary>
                            <form className="mt-3 grid gap-2" onSubmit={saveCalibration}>
                              {[
                                ['batteryVEmpty', 'V batería vacía'],
                                ['batteryVFull', 'V batería llena'],
                              ].map(([key, label]) => (
                                <label key={key} className="block text-sm font-bold text-[#0a3d6b]">
                                  {label}
                                  <input
                                    className="mt-1 h-10 w-full rounded-xl border border-[#d7e3ee] bg-white px-3"
                                    type="text"
                                    inputMode="decimal"
                                    autoComplete="off"
                                    value={calDraft[key] ?? ''}
                                    onChange={(e) => setCalDraft((c) => ({ ...c, [key]: e.target.value }))}
                                  />
                                </label>
                              ))}
                              <button
                                className="h-11 rounded-xl border border-[#d7e3ee] bg-white font-extrabold text-[#0a3d6b]"
                                type="submit"
                                disabled={busy}
                              >
                                Guardar batería
                              </button>
                            </form>
                          </details>
                        </div>
                      </>
                    )}
                {actionError ? (
                  <StatusBanner tone="error" className="mt-4">
                    {actionError}
                  </StatusBanner>
                ) : null}
                {actionNote ? (
                  <StatusBanner tone="ok" className="mt-4">
                    {actionNote}
                  </StatusBanner>
                ) : null}
              </PanelCard>
            ) : null}

            {isSection('alertas') ? (
              <PanelCard className="p-4 md:p-5">
                <h2 className="mb-2 flex items-center gap-2 text-base font-bold text-slate-900">
                  <Bell className="h-4 w-4" /> Últimas alertas
                </h2>
                <ul>
                  {(summary.alerts || []).length === 0 ? (
                    <li className="border-t border-slate-100 py-3 text-sm text-slate-500">No hay alertas.</li>
                  ) : (
                    summary.alerts.map((entry) => (
                      <li
                        key={entry.id}
                        className="flex justify-between gap-3 border-t border-slate-100 py-2 text-sm text-slate-700"
                      >
                        <span>{entry.message}</span>
                        <time className="shrink-0 text-slate-400">{entry.createdLabel}</time>
                      </li>
                    ))
                  )}
                </ul>
              </PanelCard>
            ) : null}
          </section>
        </div>
      )}
    </PanelChrome>

      <OnboardingWizard
        open={onboardingOpen}
        isDark={isDark}
        step={onboardingStep}
        onStep={setOnboardingStep}
        onClose={dismissOnboarding}
        onFinish={finishOnboarding}
        zoneName={summary.zone?.name}
        claimCode={claimCode}
        setClaimCode={setClaimCode}
        claimName={claimName}
        setClaimName={setClaimName}
        onClaim={() => {
          void claimDeviceForOnboarding()
        }}
        claimBusy={busy}
        claimError={onboardingClaimError}
        hasDevice={Boolean(summary.device)}
        deviceOnline={online}
        deviceName={summary.device?.name}
        tankCalibrated={tankCalibrated}
        soilCalibrated={soilCalibrated}
        onOpenTankWizard={() => {
          void openTankWizard()
        }}
        onOpenSoilWizard={() => {
          void openSoilWizard()
        }}
        tankWizardOpen={tankWizardOpen}
        soilWizardOpen={soilWizardOpen}
      />

      <TankCalibrationWizard
        open={tankWizardOpen}
        onClose={() => setTankWizardOpen(false)}
        step={tankWizardStep}
        onStepChange={setTankWizardStep}
        devices={devicesList.devices}
        deviceId={calDeviceId}
        deviceName={wizardDeviceMeta?.name ?? 'HidroBot'}
        mqttId={wizardDeviceMeta?.mqttId ?? '—'}
        onSelectDevice={(id) => {
          setCalDeviceId(id)
          setTankSamples([])
          setWizardSavedEmpty(false)
          setWizardSavedFull(false)
          setTankWizardStep(1)
          void loadCalibrationForDevice(id)
        }}
        calibration={calDeviceCal}
        samples={tankSamples}
        liveDistance={wizardLiveDistance}
        lastSampleAt={
          tankSamples.length ? tankSamples[tankSamples.length - 1].at : liveDeviceTelemetry.at
        }
        busy={busy}
        onSaveEmpty={() => captureTankLevel('empty')}
        onSaveFull={() => captureTankLevel('full')}
        onRepeat={() => {
          setTankWizardStep(1)
          setWizardSavedEmpty(false)
          setWizardSavedFull(false)
          setTankSamples([])
        }}
        canAdvanceStep={tankCanAdvance}
      />
      <SoilCalibrationWizard
        open={soilWizardOpen}
        onClose={() => setSoilWizardOpen(false)}
        step={soilWizardStep}
        onStepChange={setSoilWizardStep}
        deviceName={wizardDeviceMeta?.name ?? 'HidroBot'}
        mqttId={wizardDeviceMeta?.mqttId ?? '—'}
        liveRaw={wizardLiveRaw}
        calibration={calDeviceCal}
        busy={busy}
        onSaveDry={() => captureSoil('dry')}
        onSaveWet={() => captureSoil('wet')}
      />
    </>
  )
}
