export default function HumidityRing({ value }) {
  const safe = Math.max(0, Math.min(100, value))
  const tone = safe < 35 ? 'dry' : safe < 55 ? 'watch' : 'ok'

  return (
    <div className={`meter meter-${tone}`}>
      <div className="meter-read">
        <strong>{Math.round(safe)}</strong>
        <span>%</span>
      </div>
      <div className="meter-track" aria-hidden="true">
        <span style={{ width: `${safe}%` }} />
        <i style={{ left: '35%' }} />
      </div>
      <p>Humedad del césped · umbral 35%</p>
    </div>
  )
}
