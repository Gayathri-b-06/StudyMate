/**
 * Admin API service (PRD §16)
 *
 * Provides platform-wide telemetry, user journey insights, difficult concept
 * aggregations, and filtered activity event feeds with RBAC authorization boundary.
 */

const BASE_URL = '/api/admin'

function getAdminHeaders() { return { 'Content-Type': 'application/json' } }

export async function fetchAdminDashboard(filters = {}) {
  const params = new URLSearchParams()
  if (filters.user_id) params.set('user_id', filters.user_id)
  if (filters.space_id) params.set('space_id', filters.space_id)
  if (filters.project_id) params.set('project_id', filters.project_id)
  if (filters.event_type) params.set('event_type', filters.event_type)
  if (filters.time_period) params.set('time_period', filters.time_period)

  const queryString = params.toString() ? `?${params.toString()}` : ''
  const res = await fetch(`${BASE_URL}/dashboard${queryString}`, {
    headers: getAdminHeaders(),
  })
  if (!res.ok) {
    throw new Error(`Failed to load admin dashboard: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

export async function fetchAdminActivity(filters = {}) {
  const params = new URLSearchParams()
  if (filters.user_id) params.set('user_id', filters.user_id)
  if (filters.space_id) params.set('space_id', filters.space_id)
  if (filters.project_id) params.set('project_id', filters.project_id)
  if (filters.event_type) params.set('event_type', filters.event_type)
  if (filters.time_period) params.set('time_period', filters.time_period)
  if (filters.limit) params.set('limit', filters.limit.toString())

  const queryString = params.toString() ? `?${params.toString()}` : ''
  const res = await fetch(`${BASE_URL}/activity${queryString}`, {
    headers: getAdminHeaders(),
  })
  if (!res.ok) {
    throw new Error(`Failed to load admin activity: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

export async function fetchAdminFilterOptions(userId) {
  const query = userId ? `?user_id=${encodeURIComponent(userId)}` : ''
  const res = await fetch(`${BASE_URL}/filter-options${query}`, { headers: getAdminHeaders() })
  if (!res.ok) throw new Error(`Failed to load admin filter options: ${res.status} ${res.statusText}`)
  return res.json()
}
