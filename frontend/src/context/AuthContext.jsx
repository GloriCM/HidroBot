import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../lib/api'
import { AuthContext } from './auth-context'

const LEGACY_KEYS = ['hidrobot_users', 'hidrobot_session']

function clearLegacyAuth() {
  for (const key of LEGACY_KEYS) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  }
}

function mapAuthPayload(data) {
  const gardens = Array.isArray(data?.gardens) ? data.gardens : []
  const user = data?.user
  if (!user) return { user: null, gardens: [] }
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      garden: gardens[0]?.name || 'Mi jardín',
    },
    gardens,
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [gardens, setGardens] = useState([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    clearLegacyAuth()
    let cancelled = false

    ;(async () => {
      try {
        const data = await api.me()
        if (cancelled) return
        const mapped = mapAuthPayload(data)
        setUser(mapped.user)
        setGardens(mapped.gardens)
      } catch (error) {
        if (cancelled) return
        if (!(error instanceof ApiError && (error.status === 401 || error.status === 0))) {
          console.warn('No se pudo restaurar la sesión', error)
        }
        setUser(null)
        setGardens([])
      } finally {
        if (!cancelled) setReady(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo(() => {
    function applySession(data) {
      const mapped = mapAuthPayload(data)
      setUser(mapped.user)
      setGardens(mapped.gardens)
      return mapped
    }

    return {
      user,
      gardens,
      ready,
      async register(input) {
        const data = await api.register(input)
        return applySession(data)
      },
      async login(input) {
        const data = await api.login(input)
        return applySession(data)
      },
      async logout() {
        try {
          await api.logout()
        } catch {
          /* cierra igual en el cliente */
        }
        setUser(null)
        setGardens([])
      },
      async updateProfile() {
        throw new Error('La edición de perfil en el servidor estará disponible pronto.')
      },
      async resetPassword() {
        throw new Error('El cambio de contraseña en el servidor estará disponible pronto.')
      },
    }
  }, [user, gardens, ready])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
