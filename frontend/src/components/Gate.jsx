import { Bell, Droplets, Leaf, Settings } from 'lucide-react'

const features = [
  { icon: Droplets, lines: ['Monitorea', 'en tiempo real'], tint: 'text-sky-600' },
  { icon: Settings, lines: ['Control', 'inteligente'], tint: 'text-emerald-600' },
  { icon: Bell, lines: ['Alertas', 'por correo'], tint: 'text-sky-600' },
  { icon: Leaf, lines: ['Ahorro', 'de agua'], tint: 'text-emerald-600' },
]

export default function Gate({ children }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-100 text-slate-900">
      <div
        className="pointer-events-none absolute inset-0 bg-[url('/cesped.jpg')] bg-cover bg-bottom opacity-40"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/90 via-white/75 to-emerald-50/80" />

      <div className="relative z-10 flex min-h-screen w-full items-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_400px]">
          <section className="max-w-xl">
            <div className="flex items-center gap-3">
              <img className="h-12 w-12 object-contain" src="/isotipo.png" alt="" />
              <p className="text-2xl font-bold tracking-tight">
                <span className="text-slate-800">Hidro</span>
                <span className="text-emerald-600">Bot</span>
              </p>
            </div>
            <h1 className="mt-6 text-4xl leading-tight font-bold tracking-tight sm:text-5xl">
              Riego inteligente,
              <span className="mt-1 block text-emerald-700">naturaleza en equilibrio</span>
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-slate-600">
              Monitorea humedad y tanque, riega desde el panel y recibe avisos cuando tu jardín lo necesite.
            </p>
            <ul className="mt-8 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
              {features.map((item) => (
                <li
                  key={item.lines.join(' ')}
                  className="flex min-h-[100px] flex-col items-center justify-center rounded-2xl border border-white/80 bg-white/70 px-3 py-4 text-center shadow-sm backdrop-blur-sm"
                >
                  <item.icon className={`h-6 w-6 ${item.tint}`} strokeWidth={2} />
                  <span className="mt-2 text-xs leading-snug font-semibold text-slate-700">
                    {item.lines.map((line) => (
                      <span key={line} className="block">
                        {line}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mx-auto w-full max-w-md rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xl sm:max-w-[440px] sm:p-8">
            {children}
          </section>
        </div>
      </div>
    </main>
  )
}