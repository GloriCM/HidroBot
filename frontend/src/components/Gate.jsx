import { Bell, Droplets, Leaf, Settings } from 'lucide-react'

const features = [
  { icon: Droplets, lines: ['Monitorea', 'en tiempo real'], tint: 'text-[#0a3d6b]' },
  { icon: Settings, lines: ['Control', 'inteligente'], tint: 'text-[#0f6b32]' },
  { icon: Bell, lines: ['Alertas por', 'Telegram'], tint: 'text-[#0a3d6b]' },
  { icon: Leaf, lines: ['Ahorro', 'de agua'], tint: 'text-[#0f6b32]' },
]

export default function Gate({ children }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#cfe8c8] text-[#12324a]">
      <img
        className="absolute bottom-0 left-0 h-[124vh] w-full max-w-none object-cover object-bottom"
        src="/cesped.jpg"
        alt=""
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0.08)_28%,transparent_48%)]" />
      <div className="pointer-events-none absolute inset-0 z-[1]" aria-hidden="true">
        <svg className="absolute top-0 left-0 h-[220px] w-[300px]" viewBox="0 0 300 220" fill="none">
          <path d="M0 0h186C148 48 102 102 40 154 20 172 8 188 0 202V0Z" fill="#1276cc" />
          <path d="M214 6C168 42 118 92 52 146 28 166 12 186 0 214" stroke="#6bc63a" strokeWidth="22" strokeLinecap="round" />
        </svg>
        <svg className="absolute right-0 bottom-0 h-[min(200px,30vh)] w-[min(640px,62vw)]" viewBox="0 0 640 200" fill="none">
          <path d="M0 200C80 176 110 128 190 122 280 116 320 168 420 136 510 108 555 128 590 86 618 54 632 30 640 8V200H0Z" fill="#1a82d6" />
          <path d="M0 200C100 186 170 158 270 162 390 168 450 184 530 150 580 128 615 136 640 108V200H0Z" fill="#0c4f96" />
          <path d="M190 122C280 116 320 168 420 136 510 108 555 128 590 86 618 54 632 30 640 8" stroke="#6bc63a" strokeWidth="16" strokeLinecap="round" />
        </svg>
      </div>

      <div className="relative z-10 flex min-h-screen w-full items-center px-6 py-8 sm:px-10 lg:px-14">
        <div className="mx-auto grid w-full max-w-[1120px] items-center gap-8 min-[860px]:grid-cols-[minmax(0,1fr)_400px] min-[860px]:gap-10">
          <section className="max-w-[620px]">
            <div className="flex items-center gap-3">
              <img className="h-14 w-14 object-contain" src="/isotipo.png" alt="" />
              <p className="text-3xl font-extrabold tracking-tight">
                <span className="text-[#0a3d6b]">Hidro</span>
                <span className="text-[#0f6b32]">Bot</span>
              </p>
            </div>
            <h1 className="mt-7 text-[2.8rem] leading-[0.92] font-extrabold tracking-tight text-[#07182b] sm:text-[3.6rem]">
              Bienvenido a
              <span className="mt-1 block">
                Hidro<span className="text-[#0c5c2c]">Bot</span>
              </span>
            </h1>
            <p className="mt-5 text-xl font-bold text-[#07182b] sm:text-[1.65rem]">
              Riego inteligente, naturaleza en equilibrio
            </p>
            <p className="mt-2 max-w-[34rem] text-base leading-relaxed font-semibold text-[#07182b]">
              Monitorea, controla y optimiza el riego de tus espacios verdes de forma automática.
            </p>
            <ul className="mt-8 flex flex-wrap gap-4">
              {features.map((item) => (
                <li
                  key={item.lines.join(' ')}
                  className="flex h-[118px] w-[118px] shrink-0 flex-col items-center justify-center rounded-full border border-white/70 bg-white/25 px-3 text-center shadow-[0_8px_20px_rgba(20,60,40,0.12)] backdrop-blur-md"
                >
                  <item.icon className={`h-6 w-6 ${item.tint}`} strokeWidth={1.75} />
                  <span className="mt-1.5 text-[12px] leading-[1.15] font-bold text-[#07182b]">
                    {item.lines.map((line) => (
                      <span key={line} className="block">{line}</span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mx-auto w-full max-w-[400px] rounded-[28px] border border-white/70 bg-white/75 px-6 py-5 text-center shadow-[0_24px_60px_rgba(16,40,30,0.16)] backdrop-blur-xl">
            {children}
          </section>
        </div>
      </div>
    </main>
  )
}
