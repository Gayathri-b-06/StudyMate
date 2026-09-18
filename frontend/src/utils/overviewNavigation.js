/**
 * overviewNavigation.js
 * 
 * Centralized, pure navigation and action resolution logic for StudyMate Project Overview.
 * Ensures strict preservation of projectId, contextual CTA labeling, and PRD-compliant
 * priority ordering for "Continue Learning".
 */

/**
 * Standard mapping between project tools and their canonical URL routes.
 */
export const TOOL_ROUTES = {
  overview: 'overview',
  chat: 'chat',
  documents: 'documents',
  quiz: 'quiz',
  flashcards: 'flashcards',
  progress: 'progress',
  analytics: 'progress',
  planner: 'study-plan',
  'study-plan': 'study-plan',
}

/**
 * Build a canonical project workspace path, strictly preserving projectId.
 *
 * @param {string} projectId - The active project ID (REQUIRED)
 * @param {string} tool - Destination tool name (chat, documents, quiz, flashcards, progress, study-plan)
 * @returns {string} Route URL e.g. `/projects/proj-123/quiz`
 */
export function getProjectToolPath(projectId, tool = 'overview') {
  if (!projectId) {
    throw new Error('projectId is required for project tool navigation')
  }
  const subpath = TOOL_ROUTES[tool] || tool
  return `/projects/${encodeURIComponent(projectId)}/${subpath}`
}

/**
 * Determine the destination tool and CTA label for a specific recommendation item.
 *
 * @param {object} recommendation - RecommendationItem from backend PRD §10
 * @returns {{ tool: string, label: string, path: string }}
 */
export function getRecommendationAction(recommendation, projectId) {
  if (!recommendation) {
    return {
      tool: 'quiz',
      label: 'Take Quiz',
      path: projectId ? getProjectToolPath(projectId, 'quiz') : '',
    }
  }

  const textToScan = [
    recommendation.action_recommendation || '',
    recommendation.gap_description || '',
    recommendation.reason || '',
  ]
    .join(' ')
    .toLowerCase()

  // Material / reading recommendation
  if (
    textToScan.includes('document') ||
    textToScan.includes('material') ||
    textToScan.includes('notes') ||
    textToScan.includes('slide') ||
    textToScan.includes('read')
  ) {
    return {
      tool: 'documents',
      label: 'Review Materials',
      path: projectId ? getProjectToolPath(projectId, 'documents') : '',
    }
  }

  // Tutor / chat recommendation
  if (
    textToScan.includes('tutor') ||
    textToScan.includes('ask') ||
    textToScan.includes('discuss') ||
    textToScan.includes('chat')
  ) {
    return {
      tool: 'chat',
      label: 'Ask Tutor',
      path: projectId ? getProjectToolPath(projectId, 'chat') : '',
    }
  }

  // Progress / growth review recommendation
  if (
    textToScan.includes('progress') ||
    textToScan.includes('growth') ||
    textToScan.includes('report')
  ) {
    return {
      tool: 'progress',
      label: 'View Progress',
      path: projectId ? getProjectToolPath(projectId, 'progress') : '',
    }
  }

  // Default: Practice / quiz recommendation
  return {
    tool: 'quiz',
    label: 'Take Quiz',
    path: projectId ? getProjectToolPath(projectId, 'quiz') : '',
  }
}

/**
 * Determine the "Continue Learning" primary action and destination for a Project.
 *
 * Priority Order:
 * A. If there is an in-progress Tutor conversation/thread:
 *    → /projects/:projectId/chat (with targetThreadId)
 * B. If the project has an explicit backend recommendation:
 *    → route to destination associated with that recommendation (quiz, documents, chat, progress)
 * C. If there is no explicit recommendation but there is an active/incomplete quiz:
 *    → /projects/:projectId/quiz
 * D. If there is no active quiz but there are uploaded materials:
 *    → /projects/:projectId/chat
 * E. If the project has no materials yet:
 *    → /projects/:projectId/documents
 *
 * @param {object} params
 * @param {string} params.projectId
 * @param {string|null} [params.activeThreadId]
 * @param {Array} [params.threads]
 * @param {Array} [params.recommendations]
 * @param {object|null} [params.quizData]
 * @param {Array} [params.documents]
 * @returns {{ tool: string, path: string, label: string, helperText: string, threadId: string|null }}
 */
export function getContinueLearningAction({
  projectId,
  activeThreadId = null,
  threads = [],
  recommendations = [],
  quizData = null,
  documents = [],
}) {
  if (!projectId) {
    throw new Error('projectId is required to resolve continue learning action')
  }

  // Check in-progress Tutor conversation/thread
  const hasActiveSessionThread =
    activeThreadId && threads.some((t) => t.id === activeThreadId)
  const hasPopulatedThread = threads.some(
    (t) => t.title && t.title.trim() !== 'New Chat'
  )

  const inProgressThread =
    hasActiveSessionThread ||
    hasPopulatedThread ||
    (threads.length > 0 && recommendations.length === 0 && !quizData && documents.length > 0)

  const targetThreadId =
    (activeThreadId && threads.some((t) => t.id === activeThreadId) && activeThreadId) ||
    threads[0]?.id ||
    null

  // A. If there is an in-progress Tutor conversation/thread
  if (inProgressThread && targetThreadId) {
    return {
      tool: 'chat',
      path: getProjectToolPath(projectId, 'chat'),
      label: 'Continue Learning',
      helperText: 'Resume your discussion with AI Tutor',
      threadId: targetThreadId,
    }
  }

  // B. If the project has an explicit backend recommendation
  if (recommendations && recommendations.length > 0) {
    const topRec = recommendations[0]
    const recAction = getRecommendationAction(topRec, projectId)
    return {
      tool: recAction.tool,
      path: recAction.path,
      label: 'Continue Learning',
      helperText: topRec.action_recommendation || recAction.label,
      threadId: targetThreadId,
      concept: topRec.concept,
    }
  }

  // C. If there is no explicit recommendation but there is an active/incomplete quiz
  const hasActiveQuiz =
    quizData &&
    Array.isArray(quizData.questions) &&
    quizData.questions.length > 0

  if (hasActiveQuiz) {
    return {
      tool: 'quiz',
      path: getProjectToolPath(projectId, 'quiz'),
      label: 'Continue Learning',
      helperText: 'Resume active quiz',
      threadId: null,
    }
  }

  // D. If there is no active quiz but there are uploaded materials
  if (documents && documents.length > 0) {
    return {
      tool: 'chat',
      path: getProjectToolPath(projectId, 'chat'),
      label: 'Continue Learning',
      helperText: 'Explore concepts with AI Tutor',
      threadId: targetThreadId,
    }
  }

  // E. If the project has no materials yet
  return {
    tool: 'documents',
    path: getProjectToolPath(projectId, 'documents'),
    label: 'Add your first study material',
    helperText: 'Upload notes or slides to give StudyMate knowledge to work with',
    threadId: null,
  }
}
