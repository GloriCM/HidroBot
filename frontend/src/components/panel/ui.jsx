export function PanelCard({ className = '', children, as: Tag = 'article' }) {
  return (
    <Tag
      className={`rounded-2xl border bg-[var(--pc-surface)] shadow-[var(--pc-shadow)] border-[color:var(--pc-border)] ${className}`}
    >
      {children}
    </Tag>
  )
}

export function PageHeader({ title, description, action }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--pc-text)] sm:text-[1.65rem]">{title}</h1>
        {description ? <p className="mt-1 text-sm text-[var(--pc-muted)]">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  )
}

const BANNER_TONE_CLASS = {
  info: 'pc-banner-info border-sky-200 bg-sky-50 text-sky-950',
  warn: 'pc-banner-warn border-amber-200 bg-amber-50 text-amber-950',
  error: 'pc-banner-error border-red-200 bg-red-50 text-red-900',
  ok: 'pc-banner-ok border-emerald-200 bg-emerald-50 text-emerald-950',
}

export function StatusBanner({ tone = 'info', className = '', children }) {
  return (
    <p
      className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${BANNER_TONE_CLASS[tone] || BANNER_TONE_CLASS.info} ${className}`}
      role="status"
    >
      {children}
    </p>
  )
}

export function StatCard({ icon: Icon, iconClass, label, value, meta, footer }) {
  return (
    <PanelCard className="p-4">
      <div className="flex items-start gap-3">
        <span
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white shadow-sm ${iconClass}`}
        >
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="pc-stat-label">{label}</p>
          <p className="mt-1 text-2xl font-bold text-[var(--pc-text)]">{value}</p>
          {meta ? <p className="mt-1 text-xs font-medium text-[var(--pc-muted)]">{meta}</p> : null}
        </div>
      </div>
      {footer ? <div className="pc-border-t mt-3 border-t pt-3">{footer}</div> : null}
    </PanelCard>
  )
}

export function BtnPrimary({ className = '', children, ...props }) {
  return (
    <button
      type="button"
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function BtnSecondary({ className = '', children, ...props }) {
  return (
    <button
      type="button"
      className={`pc-btn-secondary inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--pc-border)] bg-[var(--pc-surface)] px-4 text-sm font-bold text-[var(--pc-text)] transition hover:bg-[var(--pc-surface-muted)] disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function FieldLabel({ label, hint, children, className = '', htmlFor }) {
  return (
    <label htmlFor={htmlFor} className={`block ${className}`}>
      <span className="block text-sm font-semibold text-[var(--pc-text)]">{label}</span>
      {hint ? <span className="mt-0.5 block text-xs font-normal text-[var(--pc-muted)]">{hint}</span> : null}
      <div className="mt-2">{children}</div>
    </label>
  )
}

export function TextInput({ className = '', id, ...props }) {
  return (
    <input
      id={id}
      className={`pc-input block h-12 w-full px-4 text-base shadow-sm outline-none transition placeholder:text-[var(--pc-muted)] focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 disabled:opacity-60 ${className}`}
      {...props}
    />
  )
}

export function ToggleSwitch({ checked, onChange, label }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-semibold text-[var(--pc-text)]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`relative h-7 w-12 rounded-full p-0.5 transition ${checked ? 'bg-emerald-500' : 'bg-slate-400'}`}
        onClick={() => onChange(!checked)}
      >
        <span
          className={`block h-6 w-6 rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </button>
    </div>
  )
}