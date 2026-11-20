import { Bell, ChartColumn, Cpu, Home, Leaf, LogOut, Menu, SlidersHorizontal, User, X } from 'lucide-react'
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
  children,
}) {
  const [drawer, setDrawer] = useState(false)

  function go(id) {
    onSection(id)
    setDrawer(false)
    setMenu(false)
  }

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-slate-900">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.12),transparent)]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1400px]">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200/80 bg-white/90 px-4 py-6 backdrop-blur lg:sticky lg:top-0 lg:flex lg:h-screen">
          <Link className="mb-8 flex items-center gap-2.5 px-2" to="/">
            <img className="h-10 w-10 object-contain" src="/isotipo.png" alt="" />
            <span className="text-lg font-bold tracking-tight">
              <span className="text-slate-800">Hidro</span>
              <span className="text-emerald-600">Bot</span>
            </span>
          </Link>

          <nav className="grid gap-1" aria-label="Secciones del panel">
            {NAV.map((item) => {
              const active = section === item.id
              const badge = item.id === 'alertas' && alertCount > 0
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => go(item.id)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                    active
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                  <span className="flex-1">{item.label}</span>
                  {badge ? (
                    <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-900">
                      {alertCount > 9 ? '9+' : alertCount}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </nav>

          <p className="mt-auto flex items-start gap-2 px-2 pt-6 text-xs leading-relaxed text-slate-500">
            <Leaf className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            Riego inteligente para tu jardín
          </p>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur lg:px-8">
            <div className="flex items-center gap-2 lg:hidden">
              <button
                type="button"
                className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white"
                aria-label="Menú"
                onClick={() => setDrawer(true)}
              >
                <Menu className="h-5 w-5" />
              </button>
              <img className="h-8 w-8" src="/isotipo.png" alt="" />
            </div>

            <div className="hidden items-center gap-2 text-sm font-medium text-slate-600 lg:flex">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                  online ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
                }`}
              >
                <i className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                {online ? 'En línea' : 'Sin señal reciente'}
              </span>
            </div>

            <div className="relative ml-auto" ref={menuRef}>
              <button
                type="button"
                className={`grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-slate-800 text-sm font-bold text-white ring-offset-2 ${menu ? 'ring-2 ring-emerald-500' : ''}`}
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
                  className="absolute top-12 right-0 z-40 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
                  role="menu"
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => go('perfil')}
                  >
                    <User className="h-4 w-4" /> Perfil
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
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
            className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden"
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
                        active ? 'text-emerald-700' : 'text-slate-500'
                      }`}
                    >
                      <item.icon className={`h-5 w-5 ${active ? 'text-emerald-600' : ''}`} />
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
            className="absolute inset-0 bg-slate-900/40"
            aria-label="Cerrar menú"
            onClick={() => setDrawer(false)}
          />
          <div className="absolute top-0 left-0 flex h-full w-[min(280px,88vw)] flex-col bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-lg font-bold">Menú</span>
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200"
                onClick={() => setDrawer(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="grid gap-1">
              {NAV.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => go(item.id)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left font-semibold ${
                    section === item.id ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  )
}