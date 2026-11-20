import { Check } from 'lucide-react'

export const SETUP_STEPS = [
  { n: 1, label: 'Cuenta' },
  { n: 2, label: 'Vincular' },
  { n: 3, label: 'Tanque' },
  { n: 4, label: 'Suelo' },
]

/**
 * @param {{ current: number, className?: string, compact?: boolean }} props — current = 1..4 (5 = todos hechos)
 */
export default function SetupStepBubbles({ current, className = '', compact = false }) {
  const safe = Math.min(SETUP_STEPS.length, Math.max(1, current))
  const allDone = current > SETUP_STEPS.length

  return (
    <nav className={className} aria-label="Progreso de configuración">
      <p className="mb-3 text-center text-xs font-bold tracking-wide text-[var(--pc-muted)] uppercase">
        {allDone ? 'Configuración completa' : `Paso ${safe} de ${SETUP_STEPS.length}`}
      </p>
      <ol className="flex items-start justify-center">
        {SETUP_STEPS.map((item, index) => {
          const num = item.n
          const done = allDone || num < safe
          const active = !allDone && num === safe
          const isLast = index === SETUP_STEPS.length - 1

          return (
            <li key={item.n} className="flex items-start">
              <div
                className={`flex flex-col items-center ${compact ? 'min-w-[3.25rem]' : 'min-w-[4.25rem] sm:min-w-[4.75rem]'}`}
              >
                <span
                  className={`grid place-items-center rounded-full border-2 font-bold transition ${
                    compact ? 'h-9 w-9 text-sm' : 'h-11 w-11 text-base'
                  } ${
                    done
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : active
                        ? 'border-emerald-500 bg-[var(--pc-surface)] text-emerald-600 shadow-md ring-4 ring-emerald-500/20'
                        : 'border-[color:var(--pc-border)] bg-[var(--pc-surface-muted)] text-[var(--pc-muted)]'
                  }`}
                  aria-current={active ? 'step' : undefined}
                >
                  {done ? <Check className={compact ? 'h-4 w-4' : 'h-5 w-5'} strokeWidth={2.5} /> : num}
                </span>
                <span
                  className={`mt-1.5 text-center leading-tight font-bold ${
                    compact ? 'text-[9px]' : 'text-[10px] sm:text-[11px]'
                  } ${active ? 'text-emerald-600' : done ? 'text-emerald-500' : 'text-[var(--pc-muted)]'}`}
                >
                  {item.label}
                </span>
              </div>
              {!isLast ? (
                <span
                  className={`mt-5 block h-0.5 shrink-0 rounded-full ${compact ? 'w-4 sm:w-6' : 'w-5 sm:w-8'} ${
                    done ? 'bg-emerald-500' : 'bg-[var(--pc-border)]'
                  }`}
                  aria-hidden
                />
              ) : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/** Mapea el índice interno del asistente (0–4) al paso visible 1–4 */
export function onboardingProgressStep(step) {
  if (step <= 0) return 2
  if (step === 1) return 2
  if (step === 2) return 3
  if (step === 3) return 4
  return 5
}

export const ONBOARDING_STEP_TITLES = {
  0: 'Antes de empezar',
  1: 'Vincular tu HidroBot',
  2: 'Calibrar el tanque',
  3: 'Calibrar el sensor de suelo',
  4: 'Todo listo',
}