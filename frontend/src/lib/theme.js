const STORAGE_KEY = 'hidrobot_panel_theme'

/** @typedef {'light' | 'dark' | 'system'} PanelTheme */

/** @returns {PanelTheme} */
export function getStoredTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* ignore */
  }
  return 'system'
}

/** @param {PanelTheme} theme */
export function setStoredTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
}

/** @param {PanelTheme} theme */
export function resolveDark(theme) {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}