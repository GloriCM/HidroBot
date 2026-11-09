import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Brand from './Brand'

const links = [
  { href: '#prototipo', label: 'El prototipo' },
  { href: '#como-funciona', label: 'Cómo funciona' },
  { href: '#cuidado', label: 'El cuidado' },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(() => window.scrollY > 8)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function close() {
    setOpen(false)
  }

  return (
    <header className={`nav ${scrolled || open ? 'nav-scrolled' : ''}`}>
      <Brand href="#inicio" />
      <nav className="nav-links" aria-label="Secciones">
        {links.map((link) => (
          <a key={link.href} href={link.href} onClick={close}>
            {link.label}
          </a>
        ))}
      </nav>
      <div className="nav-actions">
        <Link className="btn btn-ghost btn-sm" to="/ingresar" onClick={close}>
          Iniciar sesión
        </Link>
        <Link className="btn btn-primary btn-sm" to="/registro" onClick={close}>
          Crear cuenta
        </Link>
      </div>
      <button
        className={`nav-burger ${open ? 'is-open' : ''}`}
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
        onClick={() => setOpen((value) => !value)}
      >
        <span />
        <span />
      </button>
      {open && (
        <div className="nav-drawer">
          {links.map((link) => (
            <a key={link.href} href={link.href} onClick={close}>
              {link.label}
            </a>
          ))}
          <Link to="/ingresar" onClick={close}>
            Iniciar sesión
          </Link>
          <Link className="btn btn-primary" to="/registro" onClick={close}>
            Crear cuenta
          </Link>
        </div>
      )}
    </header>
  )
}
