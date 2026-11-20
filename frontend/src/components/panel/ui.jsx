export function PanelCard({ className = '', children, as: Tag = 'article' }) {
  return (
    <Tag
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_30px_rgba(15,40,60,0.06)] ${className}`}
    >
      {children}
    </Tag>
  )
}

export function PageHeader({ title, description, action }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.65rem]">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  )
}

export function StatusBanner({ tone = 'info', className = '', children }) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-950',
    warn: 'border-amber-200 bg-amber-50 text-amber-950',
    error: 'border-red-200 bg-red-50 text-red-900',
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  }
  return (
    <p
      className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${tones[tone] || tones.info} ${className}`}
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
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white ${iconClass}`}
        >
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-0.5 text-2xl font-bold text-slate-900">{value}</p>
          {meta ? <p className="mt-0.5 text-xs text-slate-500">{meta}</p> : null}
        </div>
      </div>
      {footer ? <div className="mt-3 border-t border-slate-100 pt-3">{footer}</div> : null}
    </PanelCard>
  )
}

export function BtnPrimary({ className = '', children, ...props }) {
  return (
    <button
      type="button"
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 ${className}`}
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
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function FieldLabel({ label, children, className = '' }) {
  return (
    <label className={`block text-sm font-semibold text-slate-700 ${className}`}>
      {label}
      <div className="mt-1.5">{children}</div>
    </label>
  )
}

export function TextInput(props) {
  return (
    <input
      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-slate-900 outline-none ring-emerald-500/30 placeholder:text-slate-400 focus:ring-2"
      {...props}
    />
  )
}

export function ToggleSwitch({ checked, onChange, label }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`relative h-7 w-12 rounded-full p-0.5 transition ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}
        onClick={() => onChange(!checked)}
      >
        <span
          className={`block h-6 w-6 rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </button>
    </div>
  )
}