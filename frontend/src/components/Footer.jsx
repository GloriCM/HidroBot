import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-grid">
        <div>
          <img
            className="logo-full"
            src="/logo.png"
            alt="HidroBot. Riego inteligente, naturaleza en equilibrio."
          />
          <p>Riego que escucha la tierra y suelta el agua solo cuando hace falta.</p>
        </div>
        <div>
          <p className="footer-label">Recorrer</p>
          <a href="#prototipo">El prototipo</a>
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#cuidado">El cuidado</a>
        </div>
        <div>
          <p className="footer-label">Entrar</p>
          <Link to="/registro">Crear cuenta</Link>
          <Link to="/ingresar">Iniciar sesión</Link>
          <Link to="/panel">Panel del jardín</Link>
        </div>
      </div>
      <div className="wrap footer-end">
        <small>Prototipo de riego inteligente para jardines pequeños.</small>
      </div>
    </footer>
  )
}
