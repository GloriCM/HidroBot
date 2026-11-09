import { Link } from 'react-router-dom'

export default function Brand({ to = '/', href }) {
  const mark = (
    <>
      <img src="/isotipo.png" alt="" />
      <span className="word">
        <span className="word-a">Hidro</span>
        <span className="word-b">Bot</span>
      </span>
    </>
  )

  if (href) {
    return (
      <a className="nav-brand" href={href}>
        {mark}
      </a>
    )
  }

  return (
    <Link className="nav-brand" to={to} aria-label="HidroBot, inicio">
      {mark}
    </Link>
  )
}
