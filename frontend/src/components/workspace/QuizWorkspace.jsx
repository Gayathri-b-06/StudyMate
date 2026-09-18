import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { regenerateQuiz, gradeOpenEndedAnswer } from '../../lib/quizApi'
import { reportQuizResult } from '../../lib/progressApi'
import { useWorkspace } from '../../context/WorkspaceContext'
import IndexTab from '../common/IndexTab'
import QuizSetupForm from './QuizSetupForm'

/* ── SVG Icons ────────────────────────────────────────── */
function RefreshIcon({ className = 'size-3.5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15" />
    </svg>
  )
}

function ChevronLeftIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}

function PlusIcon({ className = 'size-3.5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  )
}

function CheckIcon({ className = 'size-4 text-white shrink-0' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function XIcon({ className = 'size-4 text-black shrink-0' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function DocumentIcon() {
  return (
    <svg className="size-3.5 text-current shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
    </svg>
  )
}

function AlertTriangleIcon({ className = 'size-4 shrink-0 text-black' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  )
}

/* ── Main QuizWorkspace Component ──────────────────────── */
export default function QuizWorkspace({
  quizData,
  onQuizUpdate,
  documents = [],
  isExpanded = false,
  onToggleExpand,
  quizPrefill,
  projectId = null,
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [userAnswers, setUserAnswers] = useState({})
  const [openEndedDrafts, setOpenEndedDrafts] = useState({})
  const [openEndedEvaluations, setOpenEndedEvaluations] = useState({})
  const [openEndedScores, setOpenEndedScores] = useState({})
  const [isGradingOpenEnded, setIsGradingOpenEnded] = useState(false)
  const [gradingErrors, setGradingErrors] = useState({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')
  const [showSetupForm, setShowSetupForm] = useState(false)
  const [localQuizData, setLocalQuizData] = useState(quizData)
  const [shakingIdx, setShakingIdx] = useState(null)

  const [reportedQuizData, setReportedQuizData] = useState(quizData)
  const hasReportedRef = useRef(false)

  useEffect(() => {
    if (quizData) setLocalQuizData(quizData)
  }, [quizData])

  useEffect(() => {
    if (quizPrefill) {
      setLocalQuizData(null)
      setShowSetupForm(false)
    }
  }, [quizPrefill])

  const activeQuiz = localQuizData || quizData
  const questions = Array.isArray(activeQuiz?.questions) ? activeQuiz.questions : []
  const hasQuestions = questions.length > 0

  useEffect(() => {
    setUserAnswers({})
    setOpenEndedDrafts({})
    setOpenEndedEvaluations({})
    setOpenEndedScores({})
    setGradingErrors({})
    setCurrentIndex(0)
    hasReportedRef.current = false
    setReportedQuizData(activeQuiz)
  }, [activeQuiz])

  const { refreshProgress } = useWorkspace()

  // Track answered questions across both MCQ and Open-Ended formats
  const answeredCount = questions.reduce((acc, q, idx) => {
    if (q.question_type === 'open_ended') {
      return openEndedEvaluations[idx] !== undefined ? acc + 1 : acc
    }
    return userAnswers[idx] !== undefined ? acc + 1 : acc
  }, 0)

  // Running passed/correct tally
  const correctCount = questions.reduce((acc, q, idx) => {
    if (q.question_type === 'open_ended') {
      return (openEndedScores[idx] ?? 0) >= 60 ? acc + 1 : acc
    }
    return userAnswers[idx] === q.correct_index ? acc + 1 : acc
  }, 0)

  // Automatically report quiz score once all questions are answered
  useEffect(() => {
    if (
      !activeQuiz ||
      reportedQuizData !== activeQuiz ||
      !hasQuestions ||
      answeredCount !== questions.length ||
      hasReportedRef.current
    ) return

    hasReportedRef.current = true
    void reportQuizResult(
      projectId,
      activeQuiz.document_id,
      activeQuiz.topic,
      questions.map((question, index) => {
        if (question.question_type === 'open_ended') {
          return {
            question: question.question,
            correct: (openEndedScores[index] ?? 0) >= 60,
          }
        }
        return {
          question: question.question,
          correct: userAnswers[index] === question.correct_index,
        }
      }),
    )
      .then(() => {
        if (refreshProgress) refreshProgress()
      })
      .catch(() => {})
  }, [answeredCount, hasQuestions, questions, activeQuiz, reportedQuizData, userAnswers, openEndedScores, projectId, refreshProgress])

  async function handleGenerateForm({ documentId, topic, numQuestions, difficulty, questionType = 'mcq' }) {
    setIsGenerating(true)
    setError('')
    try {
      const result = await regenerateQuiz(documentId, topic, numQuestions, difficulty, questionType)
      setLocalQuizData(result)
      setUserAnswers({})
      setOpenEndedDrafts({})
      setOpenEndedEvaluations({})
      setOpenEndedScores({})
      setGradingErrors({})
      setCurrentIndex(0)
      hasReportedRef.current = false
      setShowSetupForm(false)
      if (onQuizUpdate) onQuizUpdate(result)
    } catch (err) {
      setError(err.message || 'Failed to generate quiz.')
    } finally {
      setIsGenerating(false)
    }
  }

  function handleSelectOption(optionIndex) {
    if (userAnswers[currentIndex] !== undefined) return
    const currentQ = questions[currentIndex]
    if (currentQ && optionIndex !== currentQ.correct_index) {
      setShakingIdx(optionIndex)
      setTimeout(() => setShakingIdx(null), 500)
    }
    setUserAnswers((prev) => ({
      ...prev,
      [currentIndex]: optionIndex,
    }))
  }

  async function handleRegenerate() {
    if (isGenerating || !activeQuiz) return
    setIsGenerating(true)
    setError('')
    try {
      const refreshed = await regenerateQuiz(
        activeQuiz.document_id,
        activeQuiz.topic,
        questions.length,
        activeQuiz.difficulty ?? 'medium',
        activeQuiz.question_type ?? 'mcq'
      )
      setLocalQuizData(refreshed)
      setUserAnswers({})
      setOpenEndedDrafts({})
      setOpenEndedEvaluations({})
      setOpenEndedScores({})
      setGradingErrors({})
      hasReportedRef.current = false
      setCurrentIndex(0)
      if (onQuizUpdate) onQuizUpdate(refreshed)
    } catch (err) {
      setError(err.message || 'Failed to regenerate quiz.')
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleSubmitOpenEnded(qIndex) {
    const q = questions[qIndex]
    const answerText = (openEndedDrafts[qIndex] || '').trim()
    if (!q || !answerText || isGradingOpenEnded) return

    setIsGradingOpenEnded(true)
    setGradingErrors((prev) => {
      const next = { ...prev }
      delete next[qIndex]
      return next
    })

    try {
      const result = await gradeOpenEndedAnswer({
        projectId,
        documentId: activeQuiz.document_id,
        topic: activeQuiz.topic,
        question: q.question,
        userAnswer: answerText,
        gradingToken: q.grading_token,
      })

      setOpenEndedEvaluations((prev) => ({
        ...prev,
        [qIndex]: result.evaluation,
      }))
      setOpenEndedScores((prev) => ({
        ...prev,
        [qIndex]: result.score,
      }))
      setUserAnswers((prev) => ({
        ...prev,
        [qIndex]: result.score >= 60 ? 'passed' : 'needs_review',
      }))

      if (refreshProgress) {
        refreshProgress()
      }
    } catch (err) {
      setGradingErrors((prev) => ({
        ...prev,
        [qIndex]: err.message || 'Grading failed. The evaluation service encountered an error. Please retry.',
      }))
    } finally {
      setIsGradingOpenEnded(false)
    }
  }

  const currentQuestion = questions[currentIndex] ?? questions[0]
  const isOpenEnded = currentQuestion?.question_type === 'open_ended'
  const currentOpenEvaluation = openEndedEvaluations[currentIndex]
  const currentOpenScore = openEndedScores[currentIndex]
  const selectedAnswer = userAnswers[currentIndex]
  const isAnswered = isOpenEnded ? Boolean(currentOpenEvaluation) : selectedAnswer !== undefined
  const optionLabels = ['A', 'B', 'C', 'D', 'E', 'F']

  // Keyboard navigation & option selection (only active for MCQ)
  useEffect(() => {
    function handleKeyDown(e) {
      if (showSetupForm || !hasQuestions) return
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return
      }

      if (!isOpenEnded && !isAnswered && currentQuestion?.options) {
        const optionCount = currentQuestion.options.length
        if (e.key >= '1' && e.key <= String(optionCount)) {
          handleSelectOption(Number(e.key) - 1)
          return
        }
        const lower = e.key.toLowerCase()
        const keys = ['a', 'b', 'c', 'd', 'e', 'f']
        const idx = keys.indexOf(lower)
        if (idx !== -1 && idx < optionCount) {
          handleSelectOption(idx)
          return
        }
      }

      if (isAnswered && e.key === 'Enter') {
        e.preventDefault()
        if (currentIndex < questions.length - 1) {
          setCurrentIndex((prev) => prev + 1)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showSetupForm, hasQuestions, isAnswered, currentIndex, questions.length, currentQuestion, isOpenEnded])

  // Setup Form View
  if (!activeQuiz || !hasQuestions || showSetupForm) {
    return (
      <div className="study-setup space-y-4 max-w-xl mx-auto p-4 animate-fade-in font-sans">
        {showSetupForm && activeQuiz && (
          <button
            type="button"
            onClick={() => setShowSetupForm(false)}
            className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-black transition-colors mb-2"
          >
            <ChevronLeftIcon />
            <span>Back to current quiz</span>
          </button>
        )}

        {error && (
          <p className="rounded-xl border border-black/20 bg-zinc-100 p-3 text-xs font-medium text-black">
            {error}
          </p>
        )}

        <QuizSetupForm
          documents={documents}
          isGenerating={isGenerating}
          onSubmit={handleGenerateForm}
          quizPrefill={quizPrefill}
        />
      </div>
    )
  }

  // Document provenance name
  const docObj = documents.find((d) => d.id === activeQuiz?.document_id)
  const docName = docObj?.filename ?? activeQuiz?.document_name ?? (activeQuiz?.document_id ? `Doc: ${activeQuiz.document_id}` : 'Uploaded Document')
  const citationText = currentQuestion?.source_citation ?? docName

  return (
    <div className="study-quiz flex flex-col gap-6 p-6 max-w-3xl mx-auto animate-fade-in text-slate-900 font-sans">
      {/* ── Header Toolbar & Score Tally ────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-900 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                {activeQuiz?.topic ?? 'Practice Quiz'}
              </span>
              <span className="text-[10px] font-mono-numbers text-slate-400 uppercase tracking-wider font-semibold">
                {activeQuiz?.difficulty ?? 'medium'}
              </span>
              {activeQuiz?.question_type && (
                <span className="text-[10px] font-mono-numbers bg-slate-100 border border-slate-200 text-slate-700 px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold">
                  {activeQuiz.question_type.replace('_', ' ')}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              📄 {docName}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Running Score Tally */}
            <div className="font-mono-numbers text-xs font-bold text-emerald-900 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
              {correctCount} / {questions.length} correct
            </div>

            <button
              type="button"
              onClick={() => void handleRegenerate()}
              disabled={isGenerating}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-800 hover:bg-emerald-50/50 disabled:opacity-50 cursor-pointer shadow-xs"
              title="Regenerate Quiz"
            >
              <RefreshIcon className={`size-3.5 ${isGenerating ? 'animate-spin text-emerald-600' : ''}`} />
              <span>{isGenerating ? 'Generating…' : 'Regenerate'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSetupForm(true)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-800 hover:bg-emerald-50/50 cursor-pointer shadow-xs"
              title="New Quiz"
            >
              <PlusIcon />
              <span>New</span>
            </button>
          </div>
        </div>

        {/* Progress Bar Track */}
        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden border border-slate-200">
          <motion.div
            className="h-full bg-emerald-500"
            initial={{ width: 0 }}
            animate={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* ── Question Card ─────────────────────────────────────────── */}
      <motion.div
        key={currentIndex}
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs card-lift space-y-6"
      >
        {/* Question Header */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono-numbers text-xs font-bold text-slate-400 uppercase tracking-wider">
              Question {currentIndex + 1} of {questions.length}
            </span>
            <span className="text-[10px] font-mono-numbers font-semibold uppercase px-2 py-0.5 rounded-md border border-slate-200 bg-slate-50 text-slate-700">
              {isOpenEnded ? 'Open-Ended' : 'Multiple Choice'}
            </span>
          </div>
          <h3 className="font-heading text-lg font-bold leading-relaxed text-slate-900">
            {currentQuestion?.question}
          </h3>
        </div>

        {/* ── Open-Ended Question Answering UI ──────────────────────── */}
        {isOpenEnded ? (
          <div className="space-y-4">
            {!isAnswered ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label htmlFor={`open-answer-${currentIndex}`} className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                    Your Response
                  </label>
                  <textarea
                    id={`open-answer-${currentIndex}`}
                    rows={5}
                    value={openEndedDrafts[currentIndex] || ''}
                    onChange={(e) => setOpenEndedDrafts((prev) => ({ ...prev, [currentIndex]: e.target.value }))}
                    disabled={isGradingOpenEnded}
                    placeholder="Write a clear explanation covering key mechanisms, definitions, and reasoning based on the material…"
                    className="w-full rounded-xl border border-slate-200 bg-white p-3.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                  />
                  <div className="flex justify-between text-[11px] text-slate-400 font-mono-numbers">
                    <span>Be thorough — AI assesses understanding, accuracy, and key concepts.</span>
                    <span>{(openEndedDrafts[currentIndex] || '').length} characters</span>
                  </div>
                </div>

                {/* Permanent Failure State Handling */}
                {gradingErrors[currentIndex] && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-rose-300 bg-rose-50 p-4 space-y-3"
                  >
                    <div className="flex items-start gap-2.5">
                      <AlertTriangleIcon className="size-4 shrink-0 text-rose-600 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-rose-900">Grading Unsuccessful</p>
                        <p className="text-xs text-rose-700 leading-relaxed">
                          {gradingErrors[currentIndex]}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleSubmitOpenEnded(currentIndex)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-rose-700 cursor-pointer"
                    >
                      <RefreshIcon className="size-3" />
                      <span>Retry Evaluation</span>
                    </button>
                  </motion.div>
                )}

                <div className="flex items-center justify-end pt-1">
                  <button
                    type="button"
                    disabled={!(openEndedDrafts[currentIndex] || '').trim() || isGradingOpenEnded}
                    onClick={() => void handleSubmitOpenEnded(currentIndex)}
                    className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-40 cursor-pointer"
                  >
                    {isGradingOpenEnded ? (
                      <>
                        <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        <span>Evaluating Response…</span>
                      </>
                    ) : (
                      <span>Submit for AI Evaluation →</span>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Graded Open-Ended Evaluation Card */
              <div className="space-y-4">
                {/* Submitted Answer Recap */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Your Submitted Answer
                  </span>
                  <p className="text-xs leading-relaxed text-slate-900 whitespace-pre-wrap">
                    {openEndedDrafts[currentIndex]}
                  </p>
                </div>

                {/* Qualitative Evaluation Box */}
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-900">
                        AI Evaluation
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono-numbers font-bold ${
                        (currentOpenScore ?? 0) >= 60
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}>
                        Score: {Math.round(currentOpenScore ?? 0)} / 100
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono-numbers">
                      <span className="px-2 py-0.5 rounded-md border border-slate-200 bg-slate-50 text-slate-800 capitalize">
                        Understanding: <strong>{currentOpenEvaluation?.understanding_level}</strong>
                      </span>
                      <span className="px-2 py-0.5 rounded-md border border-slate-200 bg-slate-50 text-slate-800 capitalize">
                        Accuracy: <strong>{currentOpenEvaluation?.accuracy_level?.replace('_', ' ')}</strong>
                      </span>
                      <span className="px-2 py-0.5 rounded-md border border-slate-200 bg-slate-50 text-slate-800 capitalize">
                        Relevance: <strong>{currentOpenEvaluation?.relevance_level?.replace('_', ' ')}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Feedback Narrative */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Feedback & Analysis
                    </span>
                    <p className="text-xs leading-relaxed text-slate-900">
                      {currentOpenEvaluation?.feedback}
                    </p>
                  </div>

                  {/* Concepts Breakdown */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    {/* Key Concepts Covered */}
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                        <CheckIcon className="size-3.5 text-emerald-700 shrink-0" />
                        <span>Concepts Covered</span>
                      </span>
                      {currentOpenEvaluation?.key_concepts_covered?.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {currentOpenEvaluation.key_concepts_covered.map((concept, cIdx) => (
                            <span
                              key={cIdx}
                              className="text-[11px] bg-white border border-emerald-200 text-emerald-800 px-2 py-0.5 rounded-md font-medium"
                            >
                              ✓ {concept}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400 italic">No key concepts identified</p>
                      )}
                    </div>

                    {/* Missing Concepts */}
                    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                        <AlertTriangleIcon className="size-3.5 text-amber-700 shrink-0" />
                        <span>Missing Concepts</span>
                      </span>
                      {currentOpenEvaluation?.missing_concepts?.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {currentOpenEvaluation.missing_concepts.map((concept, cIdx) => (
                            <span
                              key={cIdx}
                              className="text-[11px] bg-white border border-amber-200 text-amber-800 px-2 py-0.5 rounded-md font-medium"
                            >
                              ! {concept}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400 italic">None — complete coverage!</p>
                      )}
                    </div>
                  </div>

                  {/* Source PDF Citation Chip */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Document Grounding</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-mono-numbers text-emerald-900 font-semibold">
                      <DocumentIcon />
                      <span>{citationText}</span>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── Full-Width MCQ Option Rows with Shake & Check Animations ─── */
          <div className="space-y-3">
            {currentQuestion?.options?.map((option, idx) => {
              const isSelected = selectedAnswer === idx
              const isCorrect = currentQuestion.correct_index === idx
              const isShaking = shakingIdx === idx

              let rowStyle = 'border-slate-200 bg-white text-slate-900 hover:border-emerald-300 hover:bg-emerald-50/40 shadow-xs'

              if (isAnswered) {
                if (isCorrect) {
                  rowStyle = 'border-2 border-emerald-600 bg-emerald-600 text-white font-semibold shadow-xs'
                } else if (isSelected && !isCorrect) {
                  rowStyle = 'border-2 border-dashed border-rose-400 bg-rose-50 text-rose-900 font-semibold shadow-xs'
                } else {
                  rowStyle = 'border-slate-200 bg-slate-50 text-slate-400 opacity-40 pointer-events-none'
                }
              }

              return (
                <motion.button
                  key={idx}
                  type="button"
                  disabled={isAnswered}
                  whileHover={!isAnswered ? { scale: 1.01, x: 2 } : {}}
                  whileTap={!isAnswered ? { scale: 0.99 } : {}}
                  animate={isShaking ? { x: [-10, 10, -8, 8, -4, 4, 0] } : {}}
                  transition={{ duration: 0.4 }}
                  onClick={() => handleSelectOption(idx)}
                  className={`study-quiz-option w-full flex items-center justify-between gap-4 rounded-xl border p-4 text-left text-xs transition-all focus-visible cursor-pointer ${rowStyle}`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span
                      className={`grid size-7 shrink-0 place-items-center rounded-lg font-mono-numbers text-xs font-bold transition-all ${
                        isAnswered && isCorrect
                          ? 'bg-white text-emerald-900 shadow-xs'
                          : isAnswered && isSelected && !isCorrect
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'bg-slate-100 border border-slate-200 text-slate-700'
                      }`}
                    >
                      {optionLabels[idx] ?? idx + 1}
                    </span>
                    <span className="leading-relaxed">{option}</span>
                  </div>

                  {/* Status Icon Slot */}
                  {isAnswered && (
                    <div className="shrink-0 pl-2">
                      {isCorrect ? (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}>
                          <CheckIcon className="size-4 text-white shrink-0" />
                        </motion.div>
                      ) : isSelected ? (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                          <XIcon className="size-4 text-rose-600 shrink-0" />
                        </motion.div>
                      ) : null}
                    </div>
                  )}
                </motion.button>
              )
            })}
          </div>
        )}

        {/* ── Animated MCQ Explanation & PDF Citation Panel ────────────── */}
        <AnimatePresence>
          {!isOpenEnded && isAnswered && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/50 p-4.5 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                  {selectedAnswer === currentQuestion.correct_index ? '✓ Correct Answer' : '✕ Explanation'}
                </span>

                {/* Source PDF Citation Chip */}
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-3 py-1 text-[11px] font-mono-numbers text-emerald-900 font-semibold">
                  <DocumentIcon />
                  <span>{citationText}</span>
                </span>
              </div>

              <p className="text-xs leading-relaxed text-slate-700">
                {currentQuestion?.explanation || 'No explanation provided.'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Next Question Button / Pagination Footer ────────────── */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200/80">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:text-slate-900 hover:bg-slate-50 disabled:opacity-30 cursor-pointer shadow-xs"
            >
              <ChevronLeftIcon />
              <span>Prev</span>
            </button>

            <button
              type="button"
              disabled={currentIndex === questions.length - 1}
              onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
              className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:text-slate-900 hover:bg-slate-50 disabled:opacity-30 cursor-pointer shadow-xs"
            >
              <span>Next</span>
              <ChevronRightIcon />
            </button>
          </div>

          {/* Sliding Next Question Button once answered */}
          {isAnswered && currentIndex < questions.length - 1 && (
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={() => setCurrentIndex((prev) => prev + 1)}
              className="flex-1 ml-4 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-emerald-700 cursor-pointer"
            >
              Next Question →
            </motion.button>
          )}
        </div>
      </motion.div>
    </div>
  )
}
