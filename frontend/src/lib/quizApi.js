import { request } from './api'

/**
 * Regenerate a document quiz directly via backend endpoint.
 *
 * @param {string} documentId - ID of the target document
 * @param {string} topic - Topic for quiz questions
 * @param {number} [numQuestions=10] - Number of questions requested
 * @param {'easy'|'medium'|'hard'} [difficulty='medium'] - Desired difficulty level
 * @param {'mcq'|'open_ended'|'mixed'} [questionType='mcq'] - Format of questions
 * @returns {Promise<import('../schemas/quiz').QuizGenerateResponse>} The generated quiz payload
 */
export async function regenerateQuiz(
  documentId,
  topic,
  numQuestions = 10,
  difficulty = 'medium',
  questionType = 'mcq'
) {
  return request('/quiz/generate', {
    method: 'POST',
    body: JSON.stringify({
      document_id: documentId,
      topic,
      num_questions: numQuestions,
      difficulty,
      question_type: questionType,
    }),
  })
}

/**
 * Grade an open-ended quiz answer via server-side evaluation.
 *
 * @param {Object} params
 * @param {string} params.projectId - ID of active project
 * @param {string} params.documentId - ID of source document
 * @param {string} params.topic - Quiz topic
 * @param {string} params.question - The question prompt
 * @param {string} params.userAnswer - The student's written response
 * @param {string} params.gradingToken - AES encrypted confidential grading rubric
 * @returns {Promise<Object>} The graded response with score and qualitative feedback
 */
export async function gradeOpenEndedAnswer({
  projectId,
  documentId,
  topic,
  question,
  userAnswer,
  gradingToken,
}) {
  return request('/quiz/grade-open-ended', {
    method: 'POST',
    body: JSON.stringify({
      project_id: projectId,
      document_id: documentId,
      topic,
      question,
      user_answer: userAnswer,
      grading_token: gradingToken,
    }),
  })
}
