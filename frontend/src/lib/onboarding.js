export const ONBOARDING_START_KEY = 'hidrobot_start_onboarding'

export function markOnboardingStart() {
  try {
    sessionStorage.setItem(ONBOARDING_START_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function takeOnboardingStart() {
  try {
    const pending = sessionStorage.getItem(ONBOARDING_START_KEY) === '1'
    if (pending) sessionStorage.removeItem(ONBOARDING_START_KEY)
    return pending
  } catch {
    return false
  }
}