import { useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, LineChart, Line } from 'recharts'
import {
  TANK_MEDIAN_SAMPLE_SIZE,
  stabilityStatus,
  stableMedianFromReadings,
  tankPctFromDistance,
  tankStepLiveValidation,
} from '../lib/tankCalibration'

const glass =
  'border border-white/80 bg-[linear-gradient(165deg,rgba(255,255,255,0.9),rgba(255,255,255,0.55))] shadow-[0_16px_36px_rgba(16,40,30,0.16)] backdrop-blur-2xl'

function TankIllustration({ step, distanceCm }) {
  const waterPct = step === 1 ? 0.12 : step === 2 ? 0.82 : 0.5
  const arrowLen = step === 1 ? 72 : step === 2 ? 28 : 48
  return (
    <svg viewBox="0 0 200 160" className="mx-auto h-36 w-full max-w-[220px]" aria-hidden>
      <rect x="55" y="30" width="90" height="110" rx="8" fill="#e8f4fc" stroke="#0a3d6b" strokeWidth="2" />
      <rect
        x="58"
        y={30 + (1 - waterPct) * 104}
        width="84"
        height={waterPct * 104}
        fill="url(#waterGrad)"
      />
      <rect x="92" y="12" width="16" height="18" rx="2" fill="#6b8494" />
      <text x="100" y="24" textAnchor="middle" fontSize="8" fill="#fff">
        HC
      </text>
      <line x1="155" y1="28" x2="155" y2={28 + arrowLen} stroke="#1d4ed8" strokeWidth="2" markerEnd="url(#arr)" />
      <text x="165" y={38 + arrowLen / 2} fontSize="11" fill="#0a3d6b" fontWeight="700">
        {distanceCm != null ? `${distanceCm} cm` : '— cm'}
      </text>
      <defs>
        <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7ed0ff" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
        <marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#1d4ed8" />
        </marker>
      </defs>
    </svg>
  )
}

function TankGauge({ pct }) {
  const p = pct == null ? 0 : Math.min(100, Math.max(0, pct))
  return (
    <div className="mx-auto flex max-w-xs items-end justify-center gap-3">
      <div className="relative h-40 w-24 overflow-hidden rounded-2xl border-2 border-[#0a3d6b] bg-[#e8f4fc]">
        <div
          className="absolute bottom-0 w-full bg-gradient-to-t from-[#1d4ed8] to-[#22c55e] transition-all duration-500"
          style={{ height: `${p}%` }}
        />
      </div>
      <p className="text-4xl font-extrabold text-[#1f9d4a]">{pct == null ? '—' : `${pct.toFixed(1)}%`}</p>
    </div>
  )
}

const STEP_META = [
  {
    id: 1,
    title: 'Tanque vacío',
    short: 'Vacío',
    help: 'Vacía hasta el mínimo útil: cuando la bomba ya no alcanza a sacar agua. El líquido debe quedar quieto.',
    extra:
      'Si el agua se mueve o hay gotas en la superficie, las lecturas saltan. Espera unos segundos entre cada muestra del sensor.',
  },
  {
    id: 2,
    title: 'Tanque lleno',
    short: 'Lleno',
    help: 'Llena hasta el máximo de uso, dejando al menos 5 cm libres bajo el sensor ultrasónico.',
    extra: 'No llenes hasta tocar el sensor: por debajo de ~5 cm el HC-SR04 pierde fiabilidad.',
  },
  {
    id: 3,
    title: 'Comprobar',
    short: 'Comprobar',
    help: 'Observa el porcentaje en vivo con la calibración que acabas de guardar.',
    extra: 'Si no cuadra con lo que ves, pulsa Repetir calibración y vuelve a medir vacío y lleno.',
  },
]

/**
 * @param {object} props
 */
export default function TankCalibrationWizard({
  open,
  onClose,
  step,
  onStepChange,
  devices,
  deviceId,
  deviceName,
  mqttId,
  onSelectDevice,
  calibration,
  samples,
  liveDistance,
  lastSampleAt,
  busy,
  onSaveEmpty,
  onSaveFull,
  onRepeat,
  canAdvanceStep,
}) {
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const values = useMemo(() => samples.map((s) => s.value), [samples])
  const preview = useMemo(
    () => stableMedianFromReadings(values, TANK_MEDIAN_SAMPLE_SIZE),
    [values],
  )
  const livePct = useMemo(
    () => (liveDistance != null ? tankPctFromDistance(liveDistance, calibration) : null),
    [liveDistance, calibration],
  )
  const stab = stabilityStatus(
    preview.samples,
    preview.stability,
    lastSampleAt ?? (samples.length ? samples[samples.length - 1].at : null),
  )
  const stepValidation = tankStepLiveValidation(step, liveDistance, calibration?.distanceEmptyCm)
  const readingCount = Math.min(preview.count, TANK_MEDIAN_SAMPLE_SIZE)
  const canSave =
    !busy &&
    step < 3 &&
    readingCount >= TANK_MEDIAN_SAMPLE_SIZE &&
    !preview.stability.unstable &&
    stepValidation.ok

  const chartData = samples.slice(-8).map((s, i) => ({ i, d: s.value }))

  if (!open) return null

  const meta = STEP_META[step - 1]

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[linear-gradient(160deg,#3aa0e8_0%,#7ed0ff_36%,#b6ef8a_72%,#3dae55_100%)]">
      <header className={`${glass} mx-3 mt-3 rounded-3xl px-4 py-3`}>
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="text-sm font-bold text-[#0a3d6b]" onClick={onClose}>
            Cancelar
          </button>
          <p className="text-center text-sm font-extrabold text-[#0a3d6b]">Calibrar tanque</p>
          <span className="w-16" />
        </div>
        {devices?.length > 1 ? (
          <label className="mt-2 block text-xs font-bold text-[#0a3d6b]">
            Dispositivo
            <select
              className="mt-1 h-10 w-full rounded-xl border border-[#d7e3ee] bg-white px-3 text-sm"
              value={deviceId}
              onChange={(e) => onSelectDevice(e.target.value)}
            >
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.mqttId}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="mt-2 text-center text-xs font-semibold text-[#6b8494]">
            {deviceName} · <span className="font-mono">{mqttId}</span>
          </p>
        )}
        <nav className="mt-3 flex gap-1 text-center text-xs font-extrabold">
          {STEP_META.map((s) => (
            <span
              key={s.id}
              className={`flex-1 rounded-full py-1.5 ${step === s.id ? 'bg-gradient-to-r from-[#1d4ed8] to-[#22c55e] text-white' : 'bg-white/60 text-[#0a3d6b]'}`}
            >
              {s.id} {s.short}
            </span>
          ))}
        </nav>
      </header>

      <main className={`${glass} mx-3 my-3 flex min-h-0 flex-1 flex-col overflow-y-auto rounded-3xl p-4`}>
        <h2 className="text-lg font-extrabold text-[#0a3d6b]">{meta.title}</h2>
        <p className="mt-1 text-sm font-semibold text-[#0a3d6b]">{meta.help}</p>
        <button
          type="button"
          className="mt-1 text-left text-xs font-bold text-[#1d4ed8]"
          onClick={() => setHelpOpen((v) => !v)}
        >
          {helpOpen ? 'Ocultar ayuda' : 'Más ayuda'}
        </button>
        {helpOpen ? <p className="mt-1 text-xs text-[#6b8494]">{meta.extra}</p> : null}

        <TankIllustration step={step} distanceCm={liveDistance} />

        {step < 3 ? (
          <>
            <p className="text-center text-5xl font-extrabold tracking-tight text-[#0a3d6b]">
              {liveDistance == null ? '—' : liveDistance.toFixed(1)}
              <span className="text-2xl text-[#6b8494]"> cm</span>
            </p>

            <div className="mt-2 flex items-center justify-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-extrabold ${
                  stab.key === 'stable'
                    ? 'bg-[#dcfce7] text-[#166534]'
                    : stab.key === 'unstable'
                      ? 'bg-[#fff4e5] text-[#9a5b00]'
                      : 'bg-[#fee2e2] text-[#b42318]'
                }`}
              >
                {stab.label}
              </span>
            </div>

            <div className="mt-3 h-12">
              {chartData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <Line type="monotone" dataKey="d" stroke="#1d4ed8" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-xs text-[#6b8494]">Esperando lecturas del sensor…</p>
              )}
            </div>

            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs font-bold text-[#0a3d6b]">
                <span>Tomando lecturas</span>
                <span>
                  {readingCount}/{TANK_MEDIAN_SAMPLE_SIZE}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#e7eef3]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#1d4ed8] to-[#22c55e] transition-all"
                  style={{ width: `${(readingCount / TANK_MEDIAN_SAMPLE_SIZE) * 100}%` }}
                />
              </div>
            </div>

            {!stepValidation.ok ? (
              <p className="mt-3 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm font-semibold text-[#b42318]">
                {stepValidation.message}
              </p>
            ) : null}

            <button
              type="button"
              disabled={!canSave}
              className="mt-4 h-12 w-full rounded-xl bg-gradient-to-r from-[#1d4ed8] to-[#22c55e] text-sm font-extrabold text-white disabled:opacity-50"
              onClick={() => {
                if (step === 1) void onSaveEmpty()
                if (step === 2) void onSaveFull()
              }}
            >
              Guardar {step === 1 ? 'como vacío' : 'como lleno'}
            </button>
          </>
        ) : (
          <>
            <p className="text-center text-xs text-[#6b8494]">
              Vacío <b>{calibration.distanceEmptyCm} cm</b> · Lleno{' '}
              <b>{calibration.distanceFullCm} cm</b>
            </p>
            <TankGauge pct={livePct} />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="h-11 rounded-xl border border-[#d7e3ee] bg-white font-extrabold text-[#0a3d6b]"
                onClick={onRepeat}
              >
                Repetir
              </button>
              <button
                type="button"
                className="h-11 rounded-xl bg-gradient-to-r from-[#1d4ed8] to-[#22c55e] font-extrabold text-white"
                onClick={onClose}
              >
                Terminar
              </button>
            </div>
          </>
        )}
      </main>

      <footer className={`${glass} mx-3 mb-3 flex gap-2 rounded-3xl p-3`}>
        <button
          type="button"
          className="h-11 flex-1 rounded-xl border border-[#d7e3ee] bg-white font-bold text-[#0a3d6b] disabled:opacity-40"
          disabled={step <= 1 || busy}
          onClick={() => onStepChange(step - 1)}
        >
          Atrás
        </button>
        <button
          type="button"
          className="h-11 flex-1 rounded-xl border border-[#d7e3ee] bg-white font-bold text-[#0a3d6b] disabled:opacity-40"
          disabled={step >= 3 || busy || !canAdvanceStep}
          onClick={() => onStepChange(Math.min(3, step + 1))}
        >
          Siguiente
        </button>
      </footer>
    </div>
  )
}