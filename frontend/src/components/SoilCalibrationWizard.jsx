import { useEffect } from 'react'

const glass =
  'border border-white/80 bg-[linear-gradient(165deg,rgba(255,255,255,0.9),rgba(255,255,255,0.55))] shadow-[0_16px_36px_rgba(16,40,30,0.16)] backdrop-blur-2xl'

/**
 * @param {object} props
 */
export default function SoilCalibrationWizard({
  open,
  onClose,
  step,
  onStepChange,
  deviceName,
  mqttId,
  liveRaw,
  calibration,
  busy,
  onSaveDry,
  onSaveWet,
}) {
  useEffect(() => {
    if (!open) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[linear-gradient(160deg,#3aa0e8_0%,#7ed0ff_36%,#b6ef8a_72%,#3dae55_100%)]">
      <header className={`${glass} mx-3 mt-3 rounded-3xl px-4 py-3`}>
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="text-sm font-bold text-[#0a3d6b]" onClick={onClose}>
            Cancelar
          </button>
          <p className="text-center text-sm font-extrabold text-[#0a3d6b]">Calibrar suelo</p>
          <span className="w-16" />
        </div>
        <p className="mt-2 text-center text-xs font-semibold text-[#6b8494]">
          {deviceName} · <span className="font-mono">{mqttId}</span>
        </p>
        <nav className="mt-3 flex gap-1 text-center text-xs font-extrabold">
          {[
            ['1', 'Seco'],
            ['2', 'Mojado'],
          ].map(([id, label]) => (
            <span
              key={id}
              className={`flex-1 rounded-full py-1.5 ${step === Number(id) ? 'bg-gradient-to-r from-[#1d4ed8] to-[#22c55e] text-white' : 'bg-white/60 text-[#0a3d6b]'}`}
            >
              {id} {label}
            </span>
          ))}
        </nav>
      </header>

      <main className={`${glass} mx-3 my-3 flex flex-1 flex-col overflow-y-auto rounded-3xl p-4`}>
        <p className="text-sm font-semibold text-[#0a3d6b]">
          {step === 1
            ? 'Con la tierra bien seca (sin regar varios días), guarda el valor crudo del sensor.'
            : 'Tras regar hasta humedad óptima o encharcada según tu cultivo, guarda el valor crudo.'}
        </p>
        <p className="mt-6 text-center text-5xl font-extrabold text-[#0a3d6b]">
          {liveRaw == null ? '—' : liveRaw}
        </p>
        <p className="text-center text-xs font-semibold text-[#6b8494]">humedad_raw en vivo</p>
        <p className="mt-4 text-center text-xs text-[#6b8494]">
          Seco: <b>{calibration.humidityRawDry ?? '—'}</b> · Mojado:{' '}
          <b>{calibration.humidityRawWet ?? '—'}</b>
        </p>
        <button
          type="button"
          disabled={busy || liveRaw == null}
          className="mt-6 h-12 rounded-xl bg-gradient-to-r from-[#1d4ed8] to-[#22c55e] text-sm font-extrabold text-white disabled:opacity-50"
          onClick={() => (step === 1 ? onSaveDry() : onSaveWet())}
        >
          Guardar como {step === 1 ? 'seco' : 'mojado'}
        </button>
      </main>

      <footer className={`${glass} mx-3 mb-3 flex gap-2 rounded-3xl p-3`}>
        <button
          type="button"
          className="h-11 flex-1 rounded-xl border border-[#d7e3ee] bg-white font-bold text-[#0a3d6b] disabled:opacity-40"
          disabled={step <= 1 || busy}
          onClick={() => onStepChange(1)}
        >
          Atrás
        </button>
        <button
          type="button"
          className="h-11 flex-1 rounded-xl border border-[#d7e3ee] bg-white font-bold text-[#0a3d6b] disabled:opacity-40"
          disabled={step >= 2 || busy || calibration.humidityRawDry == null}
          onClick={() => onStepChange(2)}
        >
          Siguiente
        </button>
      </footer>
    </div>
  )
}