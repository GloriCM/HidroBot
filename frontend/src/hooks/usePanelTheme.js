import { useCallback, useEffect, useState } from 'react'
import { getStoredTheme, resolveDark, setStoredTheme } from '../lib/theme'

/**
 * @returns {{ preference: 'light' | 'dark' | 'system', isDark: boolean, setPreference: (p: 'light' | 'dark' | 'system') => void, toggle: () => void }}
 */
export function usePanelTheme() {
  const [preference, setPreferenceState] = useState(getStoredTheme)
  const [isDark, setIsDark] = useState(() => resolveDark(getStoredTheme()))

  useEffect(() => {
    setIsDark(resolveDark(preference))
  }, [preference])

  useEffect(() => {
    if (preference !== 'system') return undefined
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setIsDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [preference])

  const setPreference = useCallback((next) => {
    setStoredTheme(next)
    setPreferenceState(next)
  }, [])

  const toggle = useCallback(() => {
    setPreference(isDark ? 'light' : 'dark')
  }, [isDark, setPreference])

  return { preference, isDark, setPreference, toggle }
}