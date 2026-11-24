import { Check, ChevronRight, X } from 'lucide-react'
import SetupStepBubbles, { ONBOARDING_STEP_TITLES, onboardingProgressStep } from './SetupStepBubbles'
import { BtnPrimary, BtnSecondary, FieldLabel, StatusBanner, TextInput } from './panel/ui'

export default function OnboardingWizard({
  open,
  isDark = false,
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
      className="onboarding-modal-backdrop fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-5"
      role="presentation"
    >
      <div
        className={`panel-skin flex w-full justify-center sm:max-w-lg ${isDark ? 'theme-dark' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <div className="onboarding-modal-shell sm:rounded-3xl">
          <div className="onboarding-modal-head px-4 pt-4 pb-3 sm:px-5">
            <SetupStepBubbles current={progress} />
          </div>

          <header className="flex items-start justify-between gap-3 px-5 py-4">
            <div className="min-w-0 pr-2">
              <h2 id="onboarding-title" className="text-xl font-bold text-[var(--pc-text)]">
                {stepTitle}
              </h2>
              {zoneName ? (
                <p className="mt-1 text-sm font-medium text-[var(--pc-muted)]">Zona: {zoneName}</p>
              ) : null}
            </div>
            <button
              type="button"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[color:var(--pc-border)] bg-[var(--pc-surface-muted)] text-[var(--pc-muted)] transition hover:bg-[var(--pc-nav-hover-bg)] hover:text-[var(--pc-text)]"
              aria-label="Cerrar y configurar después"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="onboarding-modal-scroll px-5 py-1 pb-5">
            {step === 0 ? (
              <div className="grid gap-4 text-sm leading-relaxed text-[var(--pc-text-secondary)]">
                <p>
                  En unos minutos tendrás el panel listo: conecta el ESP32 a la red, anota el{' '}
                  <strong className="text-[var(--pc-text)]">código de vinculación</strong> que muestra la pantalla y
                  sigue los pasos.
                </p>
                <ul className="onboarding-modal-checklist">
                  <li className="flex gap-2">
                    <span className="font-bold text-emerald-500">1.</span>
                    <span>Vincular el dispositivo a tu cuenta</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-emerald-500">2.</span>
                    <span>Calibrar el tanque (vacío y lleno)</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-emerald-500">3.</span>
                    <span>Calibrar el sensor de humedad del suelo</span>
                  </li>
                </ul>
                <p className="text-xs text-[var(--pc-muted)]">
                  Puedes salir en cualquier momento con la X y continuar después en Dispositivos y Ajustes.
                </p>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="grid gap-4">
                <p className="text-sm leading-relaxed text-[var(--pc-text-secondary)]">
                  Enciende el HidroBot conectado a Wi‑Fi. En la pantalla verás un código tipo{' '}
                  <span className="font-mono font-bold text-[var(--pc-text)]">ABC-123</span>.
                </p>
                <FieldLabel
                  label="Código de vinculación"
                  hint="Copia las 6 letras y números de la pantalla OLED (con o sin guion)."
                  htmlFor="onboarding-claim-code"
                >
                  <TextInput
                    id="onboarding-claim-code"
                    className="font-mono text-lg tracking-[0.2em]"
                    placeholder="ABC-123"
                    value={claimCode}
                    onChange={(e) => setClaimCode(e.target.value)}
                    disabled={claimBusy}
                    autoComplete="off"
                    inputMode="text"
                    autoCapitalize="characters"
                    spellCheck={false}
                    aria-invalid={claimError ? true : undefined}
                  />
                </FieldLabel>
                <FieldLabel
                  label="Nombre del dispositivo"
                  hint="Cómo quieres verlo en el panel (puedes cambiarlo después)."
                  htmlFor="onboarding-claim-name"
                >
                  <TextInput
                    id="onboarding-claim-name"
                    placeholder="Mi HidroBot"
                    value={claimName}
                    onChange={(e) => setClaimName(e.target.value)}
                    disabled={claimBusy}
                    maxLength={80}
                  />
                </FieldLabel>
                {claimError ? (
                  <StatusBanner tone="error" className="mb-0" role="alert">
                    {claimError}
                  </StatusBanner>
                ) : null}
                {hasDevice ? (
                  <p className="pc-banner-ok rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-900">
                    Dispositivo vinculado: {deviceName || 'HidroBot'}
                    {deviceOnline ? ' · en línea' : ' · esperando señal…'}
                  </p>
                ) : null}
              </div>
            ) : null}

            {step === 2 ? (
              <div className="grid gap-4 text-sm leading-relaxed text-[var(--pc-text-secondary)]">
                <p>
                  Mide la distancia del sensor ultrasónico con el tanque <strong className="text-[var(--pc-text)]">vacío</strong> y
                  luego <strong className="text-[var(--pc-text)]">lleno</strong>. Usamos la mediana de varias lecturas para mayor
                  precisión.
                </p>
                <p className="pc-banner-warn rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-950">
                  Ten el tanque accesible: vacíalo primero, guarda el punto vacío; después llénalo y guarda el lleno.
                </p>
                {tankCalibrated ? (
                  <p className="font-semibold text-emerald-600">Tanque calibrado correctamente.</p>
                ) : tankWizardOpen ? (
                  <p className="text-[var(--pc-muted)]">Sigue las instrucciones del asistente de tanque…</p>
                ) : (
                  <BtnPrimary type="button" className="w-full" onClick={onOpenTankWizard}>
                    Abrir calibración de tanque
                  </BtnPrimary>
                )}
              </div>
            ) : null}

            {step === 3 ? (
              <div className="grid gap-4 text-sm leading-relaxed text-[var(--pc-text-secondary)]">
                <p>
                  Coloca la sonda en suelo <strong className="text-[var(--pc-text)]">seco</strong> y guarda la lectura; luego en suelo{' '}
                  <strong className="text-[var(--pc-text)]">bien mojado</strong> (o en agua) y guarda otra vez.
                </p>
                {soilCalibrated ? (
                  <p className="font-semibold text-emerald-600">Sensor de suelo calibrado.</p>
                ) : soilWizardOpen ? (
                  <p className="text-[var(--pc-muted)]">Sigue el asistente de humedad…</p>
                ) : (
                  <BtnPrimary type="button" className="w-full" onClick={onOpenSoilWizard}>
                    Abrir calibración de suelo
                  </BtnPrimary>
                )}
              </div>
            ) : null}

            {step === 4 ? (
              <div className="grid gap-3 py-2 text-center">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500/15 text-emerald-600">
                  <Check className="h-8 w-8" strokeWidth={2.5} />
                </div>
                <p className="text-lg font-bold text-[var(--pc-text)]">¡Todo listo!</p>
                <p className="text-sm text-[var(--pc-text-secondary)]">
                  Ya puedes ver el resumen en Inicio, revisar el historial y ajustar umbrales cuando quieras.
                </p>
              </div>
            ) : null}
          </div>

          <footer className="flex flex-wrap gap-2 border-t border-[color:var(--pc-border)] bg-[var(--pc-surface-muted)] px-5 py-4">
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
                <BtnPrimary type="button" className="ml-auto" disabled={!tankCalibrated} onClick={() => onStep(3)}>
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
                <BtnPrimary type="button" className="ml-auto" disabled={!soilCalibrated} onClick={() => onStep(4)}>
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
        </div>
      </div>
    </div>
  )
}