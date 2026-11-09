import { Link } from 'react-router-dom'

export default function AuthShell({ title, lead, children, alternate }) {
  return (
    <main className="auth" id="contenido">
      <section className="auth-brand">
        <Link className="auth-back" to="/">
          Volver al prototipo
        </Link>
        <img className="auth-mark" src="/isotipo.png" alt="" />
        <div>
          <p className="eyebrow">HidroBot</p>
          <h1>Riego inteligente, naturaleza en equilibrio.</h1>
        </div>
        <ul className="auth-points">
          <li>Humedad del césped en tiempo real</li>
          <li>Riego manual con un botón</li>
          <li>Avisos por Telegram</li>
          <li>La bomba se apaga si se pierde la red</li>
        </ul>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <h2>{title}</h2>
          <p className="auth-lead">{lead}</p>
          {children}
          <p className="auth-alt">{alternate}</p>
        </div>
      </section>
    </main>
  )
}
