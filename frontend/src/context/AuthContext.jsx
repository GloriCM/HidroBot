import { useMemo, useState } from 'react'
import { AuthContext } from './auth-context'

const KEY_USERS = 'hidrobot_users'
const KEY_SESSION = 'hidrobot_session'

const DEMO = {
  name: 'Demo',
  email: 'demo@hidrobot.local',
  password: 'cesped123',
  garden: 'Jardín principal',
}

function save(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* El navegador puede bloquear el almacenamiento. La sesión sigue en memoria. */
  }
}

function readUsers() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY_USERS) || '[]')
    const users = Array.isArray(parsed) ? parsed : []
    if (!users.some((user) => user.email === DEMO.email)) {
      users.unshift(DEMO)
      save(KEY_USERS, JSON.stringify(users))
    }
    return users
  } catch {
    return [DEMO]
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    readUsers()
    try {
      const raw = localStorage.getItem(KEY_SESSION)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })

  const api = useMemo(() => {
    function persist(next) {
      const session = {
        name: next.name,
        email: next.email,
        garden: next.garden,
      }
      save(KEY_SESSION, JSON.stringify(session))
      setUser(session)
    }

    return {
      user,
      register({ name, email, password, garden }) {
        const users = readUsers()
        const normalized = email.trim().toLowerCase()
        if (users.some((item) => item.email === normalized)) {
          throw new Error('Ya existe una cuenta con ese correo.')
        }
        const next = {
          name: name.trim(),
          email: normalized,
          password,
          garden: garden.trim() || 'Mi jardín',
        }
        users.push(next)
        save(KEY_USERS, JSON.stringify(users))
        persist(next)
      },
      login({ email, password }) {
        const found = readUsers().find(
          (item) => item.email === email.trim().toLowerCase() && item.password === password,
        )
        if (!found) {
          throw new Error('Correo o contraseña incorrectos.')
        }
        persist(found)
      },
      loginWithGoogle() {
        const users = readUsers()
        const email = 'cuenta.google@gmail.com'
        let found = users.find((item) => item.email === email)
        if (!found) {
          found = {
            name: 'Cuenta de Google',
            email,
            password: '',
            garden: 'Jardín principal',
          }
          users.push(found)
          save(KEY_USERS, JSON.stringify(users))
        }
        persist(found)
      },
      updateProfile({ name, email, garden }) {
        const users = readUsers()
        const index = users.findIndex((item) => item.email === user.email)
        if (index < 0) throw new Error('No se encontró la cuenta.')
        const normalized = email.trim().toLowerCase()
        if (users.some((item, itemIndex) => itemIndex !== index && item.email === normalized)) {
          throw new Error('Ya existe una cuenta con ese correo.')
        }
        const next = {
          ...users[index],
          name: name.trim(),
          email: normalized,
          garden: garden.trim() || 'Mi jardín',
        }
        users[index] = next
        save(KEY_USERS, JSON.stringify(users))
        persist(next)
      },
      resetPassword({ current, next }) {
        const users = readUsers()
        const index = users.findIndex((item) => item.email === user.email)
        if (index < 0) throw new Error('No se encontró la cuenta.')
        if (users[index].password !== current) throw new Error('La contraseña actual no coincide.')
        if (next.length < 8) throw new Error('La contraseña necesita al menos 8 caracteres.')
        users[index] = { ...users[index], password: next }
        save(KEY_USERS, JSON.stringify(users))
      },
      logout() {
        try {
          localStorage.removeItem(KEY_SESSION)
        } catch {
          /* sigue el cierre en memoria */
        }
        setUser(null)
      },
    }
  }, [user])

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>
}
