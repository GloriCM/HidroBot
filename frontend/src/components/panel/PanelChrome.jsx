import {
  Bell,
  ChartColumn,
  Cpu,
  Home,
  Leaf,
  LogOut,
  Menu,
  Moon,
  SlidersHorizontal,
  Sun,
  User,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

const NAV = [
  { id: 'inicio', label: 'Inicio', short: 'Inicio', icon: Home },
  { id: 'dispositivos', label: 'Dispositivos', short: 'Disp.', icon: Cpu },
  { id: 'historial', label: 'Historial', short: 'Datos', icon: ChartColumn },
  { id: 'sistema', label: 'Ajustes', short: 'Ajustes', icon: SlidersHorizontal },
  { id: 'alertas', label: 'Alertas', short: 'Alertas', icon: Bell },
]

export function panelNavItems() {
  return NAV
}

function NavButton({ item, active, badge, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
        active ? 'shadow-sm' : ''
      }`}
      style={
        active
          ? { background: 'var(--pc-nav-active-bg)', color: 'var(--pc-nav-active-text)' }
          : { color: 'var(--pc-nav-idle)' }
      }
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--pc-nav-hover-bg)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent'
      }}
    >
      <item.icon className="h-4 w-4 shrink-0" strokeWidth={2} />
      <span className="flex-1">{item.label}</span>
      {badge ? (
        <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-900">
          {badge > 9 ? '9+' : badge}
        </span>
      ) : null}
    </button>
  )
}

export default function PanelChrome({
  section,
  onSection,
  user,
  photo,
  menu,
  setMenu,
  menuRef,
  alertCount = 0,
  online,
  onLogout,
  isDark = false,
  onThemeToggle,
  children,
}) {
  const [drawer, setDrawer] = useState(false)

  function go(id) {
    onSection(id)
    setDrawer(false)
    setMenu(false)
  }

  return (
    <div
      className={`panel-skin min-h-screen text-[var(--pc-text)] ${isDark ? 'theme-dark' : ''}`}
      style={{ background: 'var(--pc-page)' }}
    >
      <div
        className="pointer-events-none fixed inset-0"
        style={{ background: `radial-gradient(ellipse 80% 50% at 50% -20%, var(--pc-accent-soft), transparent)` }}
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1400px]">
        <aside
          className="hidden w-64 shrink-0 flex-col border-r border-[color:var(--pc-border)] bg-[var(--pc-surface)]/95 px-4 py-6 backdrop-blur lg:sticky lg:top-0 lg:flex lg:h-screen"
        >
          <Link className="mb-8 flex items-center gap-2.5 px-2" to="/">
            <img className="h-10 w-10 object-contain" src="/isotipo.png" alt="" />
            <span className="text-lg font-bold tracking-tight">
              <span className="text-[var(--pc-text)]">Hidro</span>
              <span className="text-emerald-500">Bot</span>
            </span>
          </Link>

          <nav className="grid gap-1.5" aria-label="Secciones del panel">
            {NAV.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                active={section === item.id}
                badge={item.id === 'alertas' && alertCount > 0 ? alertCount : 0}
                onClick={() => go(item.id)}
              />
            ))}
          </nav>

          <p className="mt-auto flex items-start gap-2 px-2 pt-6 text-xs leading-relaxed text-[var(--pc-muted)]">
            <Leaf className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            Riego inteligente para tu jardín
          </p>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header
            className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[color:var(--pc-border)] px-4 py-3 backdrop-blur lg:px-8"
            style={{ background: 'var(--pc-header-bg)' }}
          >
            <div className="flex items-center gap-2 lg:hidden">
              <button
                type="button"
                className="grid h-10 w-10 place-items-center rounded-xl border border-[color:var(--pc-border)] bg-[var(--pc-surface)] text-[var(--pc-text)]"
                aria-label="Menú"
                onClick={() => setDrawer(true)}
              >
                <Menu className="h-5 w-5" />
              </button>
              <img className="h-8 w-8" src="/isotipo.png" alt="" />
            </div>

            <div className="hidden items-center gap-2 lg:flex">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                  online
                    ? `bg-emerald-500/15 ${isDark ? 'text-emerald-300' : 'text-emerald-800'}`
                    : `bg-amber-500/15 ${isDark ? 'text-amber-200' : 'text-amber-900'}`
                }`}
              >
                <i className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                {online ? 'En línea' : 'Sin señal reciente'}
              </span>
            </div>

            <div className="relative ml-auto flex items-center gap-2" ref={menuRef}>
              <button
                type="button"
                className="grid h-10 w-10 place-items-center rounded-xl border border-[color:var(--pc-border)] bg-[var(--pc-surface-muted)] text-[var(--pc-text)] transition hover:bg-[var(--pc-nav-hover-bg)]"
                onClick={onThemeToggle}
                aria-label={isDark ? 'Usar tema claro' : 'Usar tema oscuro'}
                title={isDark ? 'Tema claro' : 'Tema oscuro'}
              >
                {isDark ? <Sun className="h-5 w-5 text-amber-300" /> : <Moon className="h-5 w-5" />}
              </button>
              <button
                type="button"
                className={`grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-emerald-700 text-sm font-bold text-white ring-offset-2 ${menu ? 'ring-2 ring-emerald-500' : ''}`}
                onClick={() => setMenu((o) => !o)}
                aria-label={`Perfil de ${user.name}`}
              >
                {photo ? (
                  <img className="h-full w-full object-cover" src={photo} alt="" />
                ) : (
                  user.name.slice(0, 1).toUpperCase()
                )}
              </button>
              {menu ? (
                <div
                  className="absolute top-12 right-0 z-40 w-52 overflow-hidden rounded-xl border border-[color:var(--pc-border)] bg-[var(--pc-surface)] shadow-xl"
                  role="menu"
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-[var(--pc-text)] hover:bg-[var(--pc-nav-hover-bg)]"
                    onClick={() => go('perfil')}
                  >
                    <User className="h-4 w-4" /> Perfil
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 border-t border-[color:var(--pc-border)] px-4 py-3 text-left text-sm font-semibold text-[var(--pc-text)] hover:bg-[var(--pc-nav-hover-bg)]"
                    onClick={() => {
                      setMenu(false)
                      void onLogout?.()
                    }}
                  >
                    <LogOut className="h-4 w-4" /> Cerrar sesión
                  </button>
                </div>
              ) : null}
            </div>
          </header>

          <main className="flex-1 px-4 py-5 pb-24 lg:px-8 lg:pb-8" id="contenido">
            {children}
          </main>

          <nav
            className="fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--pc-border)] bg-[var(--pc-header-bg)] px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden"
            aria-label="Navegación rápida"
          >
            <ul className="mx-auto flex max-w-lg justify-between gap-0.5">
              {NAV.map((item) => {
                const active = section === item.id
                return (
                  <li key={item.id} className="flex-1">
                    <button
                      type="button"
                      onClick={() => go(item.id)}
                      className={`flex w-full flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-bold ${
                        active ? 'text-emerald-500' : 'text-[var(--pc-muted)]'
                      }`}
                    >
                      <item.icon className={`h-5 w-5 ${active ? 'text-emerald-500' : ''}`} />
                      {item.short}
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>
        </div>
      </div>

      {drawer ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Cerrar menú"
            onClick={() => setDrawer(false)}
          />
          <div
            className="absolute top-0 left-0 flex h-full w-[min(280px,88vw)] flex-col border-r border-[color:var(--pc-border)] p-4 shadow-2xl"
            style={{ background: 'var(--pc-surface)' }}
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-lg font-bold text-[var(--pc-text)]">Menú</span>
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-lg border border-[color:var(--pc-border)] text-[var(--pc-text)]"
                onClick={() => setDrawer(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="grid gap-1.5">
              {NAV.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  active={section === item.id}
                  badge={0}
                  onClick={() => go(item.id)}
                />
              ))}
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  )
}