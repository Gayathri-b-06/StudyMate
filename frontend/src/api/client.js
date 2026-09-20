// Vercel builds have no local `/api` proxy. Production therefore defaults to
// the deployed Render service, while `.env.development` keeps local Vite
// development on its `/api` proxy. Strip a trailing slash once so every API
// helper can safely keep its existing leading-slash path.
const viteEnv = import.meta.env
const configuredApiBaseUrl = viteEnv?.VITE_API_BASE_URL
  ?? (viteEnv ? 'https://studymate-rfmo.onrender.com' : '/api')

export const API_BASE_URL = configuredApiBaseUrl.replace(/\/+$/, '')

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData
  const token = (() => {
    try { return JSON.parse(localStorage.getItem('studymate_auth_session'))?.token }
    catch { return null }
  })()
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (response.status === 204) {
    return null
  }

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    let detail = 'The request could not be completed.'
    if (typeof payload?.detail === 'string') {
      detail = payload.detail
    } else if (Array.isArray(payload?.detail)) {
      detail = payload.detail.map((err) => err.msg || JSON.stringify(err)).join(', ')
    } else if (payload?.detail && typeof payload.detail === 'object') {
      detail = JSON.stringify(payload.detail)
    } else if (typeof payload?.message === 'string') {
      detail = payload.message
    }
    throw new ApiError(detail, response.status)
  }

  return payload
}

// ---------------------------------------------------------------------------
// Spaces
// ---------------------------------------------------------------------------

export function getSpaces(includeArchived = false) {
  const qs = includeArchived ? '?include_archived=true' : ''
  return request(`/spaces${qs}`)
}

export function getSpace(spaceId) {
  return request(`/spaces/${encodeURIComponent(spaceId)}`)
}

export function createSpace(name, description = null) {
  return request('/spaces', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  })
}

export function updateSpace(spaceId, patch) {
  return request(`/spaces/${encodeURIComponent(spaceId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function deleteSpace(spaceId) {
  return request(`/spaces/${encodeURIComponent(spaceId)}`, { method: 'DELETE' })
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export function getProjects(spaceId, includeArchived = false) {
  const qs = includeArchived ? '?include_archived=true' : ''
  return request(`/spaces/${encodeURIComponent(spaceId)}/projects${qs}`)
}

/**
 * Create a project inside a space.
 * Response includes `default_thread_id` — the auto-created conversation thread.
 */
export function createProject(spaceId, name, description = null) {
  return request(`/spaces/${encodeURIComponent(spaceId)}/projects`, {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  })
}

export function getProject(projectId) {
  return request(`/projects/${encodeURIComponent(projectId)}`)
}

export function updateProject(projectId, patch) {
  return request(`/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function deleteProject(projectId) {
  return request(`/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' })
}

// ---------------------------------------------------------------------------
// Threads  (project_id is REQUIRED — no unscoped fallback)
// ---------------------------------------------------------------------------

/** @param {string} projectId - REQUIRED. Returns 422 if absent. */
export function getThreads(projectId) {
  if (!projectId) throw new Error('getThreads requires a projectId')
  return request(`/threads?project_id=${encodeURIComponent(projectId)}`)
}

export function getThreadMessages(threadId) {
  return request(`/threads/${encodeURIComponent(threadId)}/messages`)
}

export function renameThread(threadId, title) {
  return request(`/threads/${encodeURIComponent(threadId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  })
}

export function removeThread(threadId) {
  return request(`/threads/${encodeURIComponent(threadId)}`, { method: 'DELETE' })
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

/**
 * @param {string} message
 * @param {string} projectId - REQUIRED for server-side isolation
 * @param {string|null} threadId - Optional, null creates a new thread
 */
export function sendChatMessage(message, projectId, threadId = null) {
  return request('/chat', {
    method: 'POST',
    body: JSON.stringify({
      message,
      project_id: projectId,
      ...(threadId ? { thread_id: threadId } : {}),
    }),
  })
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export function getDocuments(threadId) {
  return request(`/threads/${encodeURIComponent(threadId)}/documents`)
}

export function getProjectDocuments(projectId) {
  return request(`/projects/${encodeURIComponent(projectId)}/documents`)
}

export function uploadDocuments(threadId, files) {
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))
  return request(`/threads/${encodeURIComponent(threadId)}/documents/upload`, {
    method: 'POST',
    body: formData,
  })
}

export function uploadProjectDocuments(projectId, files) {
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))
  return request(`/projects/${encodeURIComponent(projectId)}/documents/upload`, { method: 'POST', body: formData })
}

export function removeDocument(documentId) {
  return request(`/documents/${encodeURIComponent(documentId)}`, { method: 'DELETE' })
}

export function getDocumentStatus(documentId) {
  return request(`/documents/${encodeURIComponent(documentId)}/status`)
}

// ---------------------------------------------------------------------------
// Study Log / Progress
// ---------------------------------------------------------------------------

export function getStudyLog(threadId) {
  return request(`/threads/${encodeURIComponent(threadId)}/study-log`)
}

/**
 * Query an existing FAISS index for debug purposes.
 * payload shape must match RagQueryRequest:
 *   { query, index_path, k?, use_reranking?, use_hybrid_search?, rerank_top_k? }
 */
export function queryRag(payload) {
  return request('/rag/query', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getProjectMastery(projectId) {
  if (!projectId) return Promise.resolve({ project_id: '', concepts: [] })
  return request(`/projects/${encodeURIComponent(projectId)}/mastery`)
}

export function getProjectRecommendations(projectId) {
  if (!projectId) return Promise.resolve({ project_id: '', recommendations: [] })
  return request(`/projects/${encodeURIComponent(projectId)}/recommendations`)
}

// ---------------------------------------------------------------------------
// Global Analytics & Dashboard
// ---------------------------------------------------------------------------

export function getGlobalDashboard(full = false) {
  return request(`/analytics/global${full ? '?full=true' : ''}`)
}
