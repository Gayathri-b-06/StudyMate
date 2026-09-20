/** Server-issued authentication sessions with bounded requests. */
import { API_BASE_URL } from '../api/client.js'

const SESSION_KEY = 'studymate_auth_session'
export const AUTH_TIMEOUT_MS = 15000

async function authRequest(path, body, token) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS)
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (response.status === 204) return null
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const detail = payload?.detail
      const message = typeof detail === 'string' ? detail
        : Array.isArray(detail) ? detail.map((item) => item.msg).join(', ')
          : 'Unable to reach the sign-in service. Please make sure the backend is running and try again.'
      throw new Error(message)
    }
    return payload
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Sign-in service took too long to respond. Please try again shortly.')
    }
    if (error instanceof TypeError) {
      throw new Error('Unable to reach the sign-in service. Please make sure the backend is running and try again.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function authenticate(path, body) {
  const payload = await authRequest(path, body)
  if (!payload?.user?.id || !payload?.token) {
    throw new Error('The sign-in service returned an invalid response. Please try again.')
  }
  const user = {
    ...payload.user,
    isDemo: Boolean(payload.user.is_demo),
    token: payload.token,
    loggedInAt: new Date().toISOString(),
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  return { user, token: user.token }
}

export const authService = {
  async login(email, password) {
    return authenticate('/auth/login', { email: email.trim().toLowerCase(), password })
  },
  async signup(name, email, password) {
    return authenticate('/auth/signup', { name: name.trim(), email: email.trim().toLowerCase(), password })
  },
  async logout() {
    const token = this.getCurrentUser()?.token
    localStorage.removeItem(SESSION_KEY)
    if (token) {
      try { await authRequest('/auth/logout', null, token) }
      catch { /* The local session has already been cleared. */ }
    }
  },
  getCurrentUser() {
    try {
      const user = JSON.parse(localStorage.getItem(SESSION_KEY))
      // Legacy browser-only sessions cannot authenticate against the API.
      if (!user?.token || user.token.startsWith('demo_tok_')) return null
      return user
    } catch {
      return null
    }
  },
  isAuthenticated() {
    return Boolean(this.getCurrentUser()?.token)
  },
}
