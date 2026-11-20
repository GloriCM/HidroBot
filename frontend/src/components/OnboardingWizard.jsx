import { Check, ChevronRight, X } from 'lucide-react'
import SetupStepBubbles, { ONBOARDING_STEP_TITLES, onboardingProgressStep } from './SetupStepBubbles'
import { BtnPrimary, BtnSecondary, PanelCard, TextInput } from './panel/ui'

export default function OnboardingWizard({
  open,
  step,
  onStep,
  onClose,
  onFinish,
  zoneName,
  claimCode,
  setClaimCode,
  claimName,
  setClaimName,
  onClaim,
  claimBusy,
  claimError,
  hasDevice,
  deviceOnline,
  deviceName,
  tankCalibrated,
  soilCalibrated,
  onOpenTankWizard,
  onOpenSoilWizard,
  tankWizardOpen,
  soilWizardOpen,
}) {
  if (!open) return null

  const progress = onboardingProgressStep(step)
  const stepTitle = ONBOARDING_STEP_TITLES[step] ?? ''

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <PanelCard className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden sm:max-h-[88vh] sm:rounded-3xl">
        <div className="border-b border-slate-100 bg-slate-50/80 px-4 pt-4 pb-3 sm:px-5">
          <SetupStepBubbles current={progress} />
        </div>

        <header className="flex items-start justify-between gap-3 px-5 py-3">
          <div>
            <h2 id="onboarding-title" className="text-lg font-bold text-slate-900">
              {stepTitle}
            </h2>
            {zoneName ? (
              <p className="mt-0.5 text-sm text-slate-500">Zona: {zoneName}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
            aria-label="Cerrar y configurar después"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {step === 0 ? (
            <div className="grid gap-4 text-sm text-slate-600">
              <p>
                En unos minutos tendrás el panel listo: conecta el ESP32 a la red, anota el{' '}
                <strong className="text-slate-800">código de vinculación</strong> que muestra la pantalla y
                sigue los pasos.
              </p>
              <ul className="grid gap-2 rounded-xl bg-slate-50 p-4 text-slate-700">
                <li className="flex gap-2">
                  <span className="font-bold text-emerald-600">1.</span> Vincular el dispositivo a tu cuenta
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-emerald-600">2.</span> Calibrar el tanque (vacío y lleno)
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-emerald-600">3.</span> Calibrar el sensor de humedad del suelo
                </li>
              </ul>
              <p className="text-xs text-slate-500">
                Puedes salir en cualquier momento con la X y continuar después en Dispositivos y Ajustes.
              </p>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-4">
              <p className="text-sm text-slate-600">
                Enciende el HidroBot conectado a Wi‑Fi. En la pantalla verás un código tipo{' '}
                <span className="font-mono font-bold text-slate-800">ABC-123</span>.
              </p>
              <label className="block text-sm font-semibold text-slate-700">
                Código de vinculación
                <TextInput
                  className="mt-1.5 font-mono text-lg tracking-widest"
                  placeholder="XXX-XXX"
                  value={claimCode}
                  onChange={(e) => setClaimCode(e.target.value)}
                  disabled={claimBusy}
                  autoComplete="off"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Nombre del dispositivo
                <TextInput
                  className="mt-1.5"
                  placeholder="Mi HidroBot"
                  value={claimName}
                  onChange={(e) => setClaimName(e.target.value)}
                  disabled={claimBusy}
                />
              </label>
              {claimError ? (
                <p className="text-sm font-medium text-red-700" role="alert">
                  {claimError}
                </p>
              ) : null}
              {hasDevice ? (
                <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                  Dispositivo vinculado: {deviceName || 'HidroBot'}
                  {deviceOnline ? ' · en línea' : ' · esperando señal…'}
                </p>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-4 text-sm text-slate-600">
              <p>
                Mide la distancia del sensor ultrasónico con el tanque <strong>vacío</strong> y luego{' '}
                <strong>lleno</strong>. Usamos la mediana de varias lecturas para mayor precisión.
              </p>
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
                Ten el tanque accesible: vacíalo primero, guarda el punto vacío; después llénalo y guarda el
                lleno.
              </p>
              {tankCalibrated ? (
                <p className="font-semibold text-emerald-700">Tanque calibrado correctamente.</p>
              ) : tankWizardOpen ? (
                <p className="text-slate-500">Sigue las instrucciones del asistente de tanque…</p>
              ) : (
                <BtnPrimary type="button" className="w-full" onClick={onOpenTankWizard}>
                  Abrir calibración de tanque
                </BtnPrimary>
              )}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-4 text-sm text-slate-600">
              <p>
                Coloca la sonda en suelo <strong>seco</strong> y guarda la lectura; luego en suelo{' '}
                <strong>bien mojado</strong> (o en agua) y guarda otra vez.
              </p>
              {soilCalibrated ? (
                <p className="font-semibold text-emerald-700">Sensor de suelo calibrado.</p>
              ) : soilWizardOpen ? (
                <p className="text-slate-500">Sigue el asistente de humedad…</p>
              ) : (
                <BtnPrimary type="button" className="w-full" onClick={onOpenSoilWizard}>
                  Abrir calibración de suelo
                </BtnPrimary>
              )}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="grid gap-3 text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                <Check className="h-8 w-8" strokeWidth={2.5} />
              </div>
              <p className="text-lg font-bold text-slate-900">¡Todo listo!</p>
              <p className="text-sm text-slate-600">
                Ya puedes ver el resumen en Inicio, revisar el historial y ajustar umbrales cuando quieras.
              </p>
            </div>
          ) : null}
        </div>

        <footer className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-4">
          {step === 0 ? (
            <>
              <BtnSecondary type="button" className="flex-1" onClick={onClose}>
                Más tarde
              </BtnSecondary>
              <BtnPrimary type="button" className="flex-1" onClick={() => onStep(1)}>
                Empezar <ChevronRight className="h-4 w-4" />
              </BtnPrimary>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <BtnSecondary type="button" onClick={() => onStep(0)}>
                Atrás
              </BtnSecondary>
              {!hasDevice ? (
                <BtnPrimary type="button" className="ml-auto min-w-[10rem]" disabled={claimBusy} onClick={onClaim}>
                  {claimBusy ? 'Vinculando…' : 'Vincular'}
                </BtnPrimary>
              ) : (
                <BtnPrimary type="button" className="ml-auto" onClick={() => onStep(2)}>
                  Continuar <ChevronRight className="h-4 w-4" />
                </BtnPrimary>
              )}
            </>
          ) : null}

          {step === 2 ? (
            <>
              <BtnSecondary type="button" onClick={() => onStep(1)}>
                Atrás
              </BtnSecondary>
              <BtnPrimary
                type="button"
                className="ml-auto"
                disabled={!tankCalibrated}
                onClick={() => onStep(3)}
              >
                {tankCalibrated ? (
                  <>
                    Siguiente <ChevronRight className="h-4 w-4" />
                  </>
                ) : (
                  'Calibrar para continuar'
                )}
              </BtnPrimary>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <BtnSecondary type="button" onClick={() => onStep(2)}>
                Atrás
              </BtnSecondary>
              <BtnPrimary
                type="button"
                className="ml-auto"
                disabled={!soilCalibrated}
                onClick={() => onStep(4)}
              >
                {soilCalibrated ? (
                  <>
                    Finalizar pasos <ChevronRight className="h-4 w-4" />
                  </>
                ) : (
                  'Calibrar para continuar'
                )}
              </BtnPrimary>
            </>
          ) : null}

          {step === 4 ? (
            <BtnPrimary type="button" className="w-full" onClick={onFinish}>
              Ir al panel
            </BtnPrimary>
          ) : null}
        </footer>
      </PanelCard>
    </div>
  )
}