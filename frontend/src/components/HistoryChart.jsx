import { useMemo, useState } from 'react'
import {
  Area,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const TZ = 'America/Bogota'

function formatTick(ms) {
  return new Date(ms).toLocaleTimeString('es-CO', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatExact(ms) {
  return new Date(ms).toLocaleTimeString('es-CO', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatHm(ms) {
  return new Date(ms).toLocaleTimeString('es-CO', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  })
}

function pct1(value) {
  return value == null || Number.isNaN(Number(value)) ? 'sin dato' : `${Number(value).toFixed(1)} %`
}

function volts1(value) {
  return value == null || Number.isNaN(Number(value)) ? 'sin dato' : `${Number(value).toFixed(1)} V`
}

/** Lectura real más cercana en el tiempo (ignora puntos de hueco). */
function nearestReading(points, cursorT) {
  let best = null
  let bestDist = Infinity
  for (const point of points) {
    if (point.gap || (point.humidity == null && point.tank == null && point.battery == null)) continue
    if (point.t == null) continue
    const dist = Math.abs(Number(point.t) - cursorT)
    if (dist < bestDist) {
      bestDist = dist
      best = point
    }
  }
  return best
}

function HistoryTooltip({ active, label, points }) {
  if (!active || label == null) return null
  const point = nearestReading(points, Number(label))
  if (!point) return null

  const isAvg = Boolean(point.aggregated) && !point.rawLatest
  const title = isAvg && point.binEndT
    ? `Promedio ${formatHm(point.t)}–${formatHm(point.binEndT)} · mín ${pct1(point.humidityMin)} · máx ${pct1(point.humidityMax)}`
    : formatExact(point.t)

  return (
    <div className="rounded-xl border border-white/80 bg-white/95 px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-extrabold text-[#0a3d6b]">{title}</p>
      {point.rawLatest ? (
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#6b8494]">
          Última lectura
        </p>
      ) : null}
      <ul className="grid gap-0.5 text-[#16324a]">
        <li>Humedad suelo: <b>{pct1(point.humidity)}</b></li>
        <li>Nivel tanque: <b>{pct1(point.tank)}</b></li>
        <li>Voltaje red: <b>{volts1(point.vRed)}</b></li>
        <li>Voltaje batería: <b>{volts1(point.vBat)}</b></li>
        <li>Batería: <b>{pct1(point.battery)}</b></li>
        <li>Bomba: <b>{point.pump ? 'encendida' : 'apagada'}</b></li>
      </ul>
    </div>
  )
}

/**
 * @param {{
 *   data: Array<Record<string, unknown>>,
 *   rangeMeta?: { fromT: number, toT: number } | null,
 *   irrigations?: Array<{ id: string, startedT: number, endedT: number | null }>,
 * }} props
 */
export default function HistoryChart({ data, rangeMeta, irrigations = [] }) {
  const [showTank, setShowTank] = useState(true)
  const [showIrrigation, setShowIrrigation] = useState(true)

  const domain = useMemo(() => {
    if (rangeMeta?.fromT != null && rangeMeta?.toT != null) {
      return [rangeMeta.fromT, rangeMeta.toT]
    }
    const times = data.map((d) => Number(d.t)).filter((n) => Number.isFinite(n))
    if (!times.length) return ['auto', 'auto']
    return [Math.min(...times), Math.max(...times)]
  }, [data, rangeMeta])

  const showDots = data.filter((d) => !d.gap && d.humidity != null).length <= 40

  const ticks = useMemo(() => {
    const [from, to] = domain
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return undefined
    const span = to - from
    const step =
      span <= 60 * 60 * 1000
        ? 10 * 60 * 1000
        : span <= 6 * 60 * 60 * 1000
          ? 60 * 60 * 1000
          : span <= 12 * 60 * 60 * 1000
            ? 2 * 60 * 60 * 1000
            : 4 * 60 * 60 * 1000
    const out = []
    const start = Math.ceil(from / step) * step
    const seen = new Set()
    for (let t = start; t <= to; t += step) {
      const label = formatTick(t)
      if (seen.has(label)) continue
      seen.add(label)
      out.push(t)
    }
    return out
  }, [domain])

  if (!data.length) {
    return (
      <p className="grid h-64 place-items-center text-sm font-semibold text-[#6b8494]">
        Sin telemetría en este rango.
      </p>
    )
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2 text-xs font-bold text-[#6b8494]">
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked disabled className="accent-[#1d6eab]" />
          Humedad
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            className="accent-[#0f766e]"
            checked={showTank}
            onChange={(e) => setShowTank(e.target.checked)}
          />
          Tanque
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            className="accent-[#22c55e]"
            checked={showIrrigation}
            onChange={(e) => setShowIrrigation(e.target.checked)}
          />
          Riegos
        </label>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={domain}
              ticks={ticks}
              tickFormatter={formatTick}
              tick={{ fill: '#8aa0ae', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={28}
              allowDataOverflow
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v) => `${Number(v).toFixed(1)}%`}
              tick={{ fill: '#8aa0ae', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip
              content={<HistoryTooltip points={data} />}
              cursor={{ stroke: '#94a3b8', strokeDasharray: '4 4' }}
              isAnimationActive={false}
            />
            {showIrrigation &&
              irrigations.map((event) => {
                const end = event.endedT ?? domain[1]
                if (end <= event.startedT) {
                  return (
                    <ReferenceLine
                      key={event.id}
                      x={event.startedT}
                      stroke="#22c55e"
                      strokeOpacity={0.7}
                      strokeDasharray="3 3"
                    />
                  )
                }
                return (
                  <ReferenceArea
                    key={event.id}
                    x1={event.startedT}
                    x2={end}
                    fill="#22c55e"
                    fillOpacity={0.12}
                    strokeOpacity={0}
                  />
                )
              })}
            <Area
              type="linear"
              dataKey="humidity"
              name="Humedad"
              stroke="#1d6eab"
              fill="#1d6eab"
              fillOpacity={0.12}
              strokeWidth={2.5}
              dot={showDots ? { r: 2, strokeWidth: 0, fill: '#1d6eab' } : false}
              activeDot={{ r: 4 }}
              connectNulls={false}
              isAnimationActive={false}
            />
            {showTank ? (
              <Line
                type="linear"
                dataKey="tank"
                name="Tanque"
                stroke="#0f766e"
                strokeWidth={2}
                dot={showDots ? { r: 2, strokeWidth: 0, fill: '#0f766e' } : false}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
