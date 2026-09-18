import { request } from './api'

/**
 * @param {string} projectId - REQUIRED for data isolation
 * @param {string} documentId
 * @param {string} topic
 * @param {Array} results
 */
export function reportQuizResult(projectId, documentId, topic, results) {
  return request('/learning/quiz-result', {
    method: 'POST',
    body: JSON.stringify({ project_id: projectId, document_id: documentId, topic, results }),
  })
}

/**
 * @param {string} projectId - REQUIRED for data isolation
 * @param {string} documentId
 * @param {string} topic
 * @param {Array} cards
 */
export function reportFlashcardResult(projectId, documentId, topic, cards) {
  return request('/learning/flashcard-result', {
    method: 'POST',
    body: JSON.stringify({ project_id: projectId, document_id: documentId, topic, cards }),
  })
}

/**
 * @param {string} projectId - REQUIRED for data isolation
 */
export function getStudyProgress(projectId) {
  if (!projectId) return Promise.resolve({ quiz_attempts: [], weak_topics: [], studied_topics: [] })
  return request(`/learning?project_id=${encodeURIComponent(projectId)}`)
}

/**
 * Fetch concept mastery scores for a project.
 * @param {string} projectId - REQUIRED for data isolation
 */
export function getProjectMastery(projectId) {
  if (!projectId) return Promise.resolve({ project_id: '', concepts: [] })
  return request(`/projects/${encodeURIComponent(projectId)}/mastery`)
}

/**
 * Fetch prioritized study recommendations for a project (PRD §10).
 * @param {string} projectId - REQUIRED for data isolation
 */
export function getProjectRecommendations(projectId) {
  if (!projectId) return Promise.resolve({ project_id: '', recommendations: [] })
  return request(`/projects/${encodeURIComponent(projectId)}/recommendations`)
}

/**
 * Fetch chronological concept mastery score history and snapshots (PRD §10 Growth Analysis).
 * @param {string} projectId - REQUIRED for data isolation
 * @param {string|null} [concept] - Optional concept filter
 */
export function getProjectMasteryHistory(projectId, concept = null) {
  if (!projectId) return Promise.resolve({ project_id: '', series: [] })
  const qs = concept ? `?concept=${encodeURIComponent(concept)}` : ''
  return request(`/projects/${encodeURIComponent(projectId)}/mastery/history${qs}`)
}
