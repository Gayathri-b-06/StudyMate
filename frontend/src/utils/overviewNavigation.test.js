import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getProjectToolPath,
  getRecommendationAction,
  getContinueLearningAction,
} from './overviewNavigation.js'

const TEST_PROJECT_ID = 'proj-ml-101'

test('1. Take Quiz maps to /projects/:projectId/quiz', () => {
  const path = getProjectToolPath(TEST_PROJECT_ID, 'quiz')
  assert.equal(path, `/projects/${TEST_PROJECT_ID}/quiz`)

  const rec = {
    concept: 'Decision Trees',
    action_recommendation: 'Take a practice quiz on Decision Trees',
  }
  const action = getRecommendationAction(rec, TEST_PROJECT_ID)
  assert.equal(action.tool, 'quiz')
  assert.equal(action.label, 'Take Quiz')
  assert.equal(action.path, `/projects/${TEST_PROJECT_ID}/quiz`)
})

test('2. Upload Materials maps to /projects/:projectId/documents', () => {
  const path = getProjectToolPath(TEST_PROJECT_ID, 'documents')
  assert.equal(path, `/projects/${TEST_PROJECT_ID}/documents`)
})

test('3. Ask Tutor maps to /projects/:projectId/chat', () => {
  const path = getProjectToolPath(TEST_PROJECT_ID, 'chat')
  assert.equal(path, `/projects/${TEST_PROJECT_ID}/chat`)

  const rec = {
    concept: 'Neural Networks',
    action_recommendation: 'Ask tutor about gradient descent in neural nets',
  }
  const action = getRecommendationAction(rec, TEST_PROJECT_ID)
  assert.equal(action.tool, 'chat')
  assert.equal(action.label, 'Ask Tutor')
  assert.equal(action.path, `/projects/${TEST_PROJECT_ID}/chat`)
})

test('4. Review Materials maps to /projects/:projectId/documents', () => {
  const path = getProjectToolPath(TEST_PROJECT_ID, 'documents')
  assert.equal(path, `/projects/${TEST_PROJECT_ID}/documents`)

  const rec = {
    concept: 'Linear Regression',
    action_recommendation: 'Review your study material and lecture slides on Linear Regression',
  }
  const action = getRecommendationAction(rec, TEST_PROJECT_ID)
  assert.equal(action.tool, 'documents')
  assert.equal(action.label, 'Review Materials')
  assert.equal(action.path, `/projects/${TEST_PROJECT_ID}/documents`)
})

test('5. View Progress maps to /projects/:projectId/progress', () => {
  const path = getProjectToolPath(TEST_PROJECT_ID, 'progress')
  assert.equal(path, `/projects/${TEST_PROJECT_ID}/progress`)

  const rec = {
    concept: 'Growth',
    action_recommendation: 'Check your mastery progress and growth metrics',
  }
  const action = getRecommendationAction(rec, TEST_PROJECT_ID)
  assert.equal(action.tool, 'progress')
  assert.equal(action.label, 'View Progress')
  assert.equal(action.path, `/projects/${TEST_PROJECT_ID}/progress`)
})

test('6. Continue Learning with active tutor thread maps to /projects/:projectId/chat', () => {
  const action = getContinueLearningAction({
    projectId: TEST_PROJECT_ID,
    activeThreadId: 'thread-999',
    threads: [
      { id: 'thread-999', title: 'Deep dive into SVM', updated_at: '2026-09-18T10:00:00Z' },
    ],
    recommendations: [],
    quizData: null,
    documents: [{ id: 'doc-1', filename: 'lecture.pdf' }],
  })

  assert.equal(action.tool, 'chat')
  assert.equal(action.path, `/projects/${TEST_PROJECT_ID}/chat`)
  assert.equal(action.threadId, 'thread-999')
  assert.equal(action.label, 'Continue Learning')
})

test('7. Continue Learning with active/incomplete quiz maps to /projects/:projectId/quiz', () => {
  const action = getContinueLearningAction({
    projectId: TEST_PROJECT_ID,
    activeThreadId: null,
    threads: [],
    recommendations: [],
    quizData: {
      questions: [
        { question: 'What is entropy?', options: ['A', 'B', 'C', 'D'] },
      ],
    },
    documents: [{ id: 'doc-1', filename: 'lecture.pdf' }],
  })

  assert.equal(action.tool, 'quiz')
  assert.equal(action.path, `/projects/${TEST_PROJECT_ID}/quiz`)
  assert.equal(action.label, 'Continue Learning')
})

test('8. Continue Learning with materials but no active learning state maps to /projects/:projectId/chat', () => {
  const action = getContinueLearningAction({
    projectId: TEST_PROJECT_ID,
    activeThreadId: null,
    threads: [],
    recommendations: [],
    quizData: null,
    documents: [{ id: 'doc-1', filename: 'notes.pdf' }],
  })

  assert.equal(action.tool, 'chat')
  assert.equal(action.path, `/projects/${TEST_PROJECT_ID}/chat`)
  assert.equal(action.label, 'Continue Learning')
})

test('9. Continue Learning with no materials maps to /projects/:projectId/documents', () => {
  const action = getContinueLearningAction({
    projectId: TEST_PROJECT_ID,
    activeThreadId: null,
    threads: [],
    recommendations: [],
    quizData: null,
    documents: [],
  })

  assert.equal(action.tool, 'documents')
  assert.equal(action.path, `/projects/${TEST_PROJECT_ID}/documents`)
  assert.equal(action.label, 'Add your first study material')
})

test('10. Verify projectId is preserved in every navigation', () => {
  const customProjectId = 'proj-algorithms-404'
  const tools = ['overview', 'chat', 'documents', 'quiz', 'flashcards', 'progress', 'study-plan']

  for (const tool of tools) {
    const path = getProjectToolPath(customProjectId, tool)
    assert.ok(path.startsWith(`/projects/${customProjectId}/`), `Path ${path} must include projectId`)
    assert.ok(!path.includes('undefined'), `Path ${path} must not contain undefined`)
    assert.ok(!path.includes('null'), `Path ${path} must not contain null`)
  }
})
