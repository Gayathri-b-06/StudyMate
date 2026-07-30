import { useEffect, useRef, useState } from 'react'
import { regenerateQuiz } from '../../lib/quizApi'
import { reportQuizResult } from '../../lib/progressApi'
import QuizSetupForm from './QuizSetupForm'

/* ── SVG Icons ────────────────────────────────────────── */
function RefreshIcon({ className = 'size-3.5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M160 80A120 120 0 1 1 80 160" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5" />
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

function ExpandIcon({ className = 'size-3.5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  )
}

function CollapseIcon({ className = 'size-3.5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 14h6v6M20 10h-6V4M10 14l-7 7M14 10l7-7" />
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

function CheckCircleIcon() {
  return (
    <svg className="size-4 shrink-0 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
    </svg>
  )
}

function XCircleIcon() {
  return (
    <svg className="size-4 shrink-0 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
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
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [userAnswers, setUserAnswers] = useState({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')
  const [showSetupForm, setShowSetupForm] = useState(false)
  const [reportedQuizData, setReportedQuizData] = useState(quizData)
  const hasReportedRef = useRef(false)
  const questions = Array.isArray(quizData?.questions) ? quizData.questions : []
  const hasQuestions = questions.length > 0
  const answeredCount = Object.keys(userAnswers).length

  useEffect(() => {
    setUserAnswers({})
    setCurrentIndex(0)
    hasReportedRef.current = false
    setReportedQuizData(quizData)
  }, [quizData])

  useEffect(() => {
    if (
      !quizData ||
      reportedQuizData !== quizData ||
      !hasQuestions ||
      answeredCount !== questions.length ||
      hasReportedRef.current
    ) return

    hasReportedRef.current = true
    void reportQuizResult(
      quizData.document_id,
      quizData.topic,
      questions.map((question, index) => ({
        question: question.question,
        correct: userAnswers[index] === question.correct_index,
      })),
    ).catch(() => {})
  }, [answeredCount, hasQuestions, questions, quizData, reportedQuizData, userAnswers])

  // Trigger quiz generation from QuizSetupForm
  async function handleGenerateForm({ documentId, topic, numQuestions, difficulty }) {
    setIsGenerating(true)
    setError('')
    try {
      const result = await regenerateQuiz(documentId, topic, numQuestions, difficulty)
      setUserAnswers({})
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

  /* Render QuizSetupForm if no quiz data active OR user wants to create new quiz */
  if (!quizData || !hasQuestions || showSetupForm) {
    return (
      <div className="space-y-3">
        {showSetupForm && quizData && (
          <button
            type="button"
            onClick={() => setShowSetupForm(false)}
            className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white"
          >
            <ChevronLeftIcon /> Back to current quiz
          </button>
        )}
        {error && (
          <p className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
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

  const currentQuestion = questions[currentIndex] ?? questions[0]
  const totalQuestions = questions.length

  // Resolve document name if matching doc exists
  const docObj = documents.find((d) => d.id === quizData.document_id)
  const docName = docObj?.filename ?? quizData.document_name ?? `Doc: ${quizData.document_id}`

  // Calculate running score
  const correctCount = Object.entries(userAnswers).reduce((count, [qIdx, chosenIdx]) => {
    const question = questions[Number(qIdx)]
    return question && question.correct_index === chosenIdx ? count + 1 : count
  }, 0)

  // Selection handler for options
  function handleSelectOption(optionIndex) {
    if (userAnswers[currentIndex] !== undefined) return
    setUserAnswers((prev) => ({
      ...prev,
      [currentIndex]: optionIndex,
    }))
  }

  // Direct regenerate button action
  async function handleRegenerate() {
    if (isGenerating) return
    setIsGenerating(true)
    setError('')
    try {
      const refreshed = await regenerateQuiz(
        quizData.document_id,
        quizData.topic,
        questions.length,
        quizData.difficulty ?? 'medium'
      )
      setUserAnswers({})
      hasReportedRef.current = false
      setCurrentIndex(0)
      if (onQuizUpdate) onQuizUpdate(refreshed)
    } catch (err) {
      setError(err.message || 'Failed to regenerate quiz.')
    } finally {
      setIsGenerating(false)
    }
  }

  const selectedAnswer = userAnswers[currentIndex]
  const isAnswered = selectedAnswer !== undefined
  const optionLabels = ['A', 'B', 'C', 'D', 'E', 'F']

  const difficultyColors = {
    easy: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    medium: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    hard: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  }

  return (
    <div className="flex flex-col gap-4 animate-fade-in text-slate-100">
      {/* ── Header Toolbar ──────────────────────────────── */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 backdrop-blur">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="truncate text-xs font-medium text-slate-400" title={docName}>
                📄 {docName}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${difficultyColors[quizData.difficulty] ?? difficultyColors.medium}`}>
                {quizData.difficulty ?? 'medium'}
              </span>
            </div>
            <h2 className="text-base font-bold tracking-tight text-white capitalize">
              {quizData.topic}
            </h2>
          </div>

          {/* Header Action Buttons (Matching Sibling Toolbar Group) */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Expand / Collapse Toggle Button */}
            {onToggleExpand && (
              <button
                type="button"
                onClick={onToggleExpand}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:border-violet-500/50 hover:bg-violet-500/10 hover:text-white"
                title={isExpanded ? 'Collapse panel width' : 'Widen panel width'}
                aria-label={isExpanded ? 'Collapse panel width' : 'Widen panel width'}
              >
                {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
                <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
              </button>
            )}

            {/* Regenerate Button */}
            <button
              type="button"
              onClick={() => void handleRegenerate()}
              disabled={isGenerating}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:border-violet-500/50 hover:bg-violet-500/10 hover:text-white disabled:opacity-50"
              title="Regenerate Quiz"
            >
              <RefreshIcon className={`size-3.5 ${isGenerating ? 'animate-spin text-violet-400' : ''}`} />
              <span>{isGenerating ? 'Generating…' : 'Regenerate'}</span>
            </button>

            {/* New Quiz Button */}
            <button
              type="button"
              onClick={() => setShowSetupForm(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:border-violet-500/50 hover:bg-violet-500/10 hover:text-white"
              title="Configure a new quiz"
            >
              <PlusIcon />
              <span>+ New</span>
            </button>
          </div>
        </div>

        {/* Score & Progress Summary */}
        <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-3 text-xs text-slate-400">
          <span>
            Questions: <strong className="text-slate-200">{totalQuestions}</strong>
          </span>
          <span>
            Score: <strong className="text-emerald-400">{correctCount}</strong> / {answeredCount} answered
          </span>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </p>
      )}

      {/* ── Question & Options Card ──────────────────────── */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        {/* Navigation & Progress Header Row (Clean flex arrangement) */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-800/60 pb-3">
          <span className="text-xs font-semibold text-violet-300 shrink-0">
            Question {currentIndex + 1} of {totalQuestions}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className="rounded p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:opacity-30"
              aria-label="Previous question"
            >
              <ChevronLeftIcon />
            </button>
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
              disabled={currentIndex === totalQuestions - 1}
              className="rounded p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:opacity-30"
              aria-label="Next question"
            >
              <ChevronRightIcon />
            </button>
          </div>
        </div>

        {/* Progress Dots Row (Clean single line with horizontal scroll fallback) */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 pr-1 no-scrollbar">
          {questions.map((_, idx) => {
            const isAnsweredDot = userAnswers[idx] !== undefined
            const isCorrectDot = userAnswers[idx] === questions[idx].correct_index
            const isCurrentDot = idx === currentIndex

            let dotStyle = 'bg-slate-800 text-slate-400 border-slate-700'
            if (isAnsweredDot) {
              dotStyle = isCorrectDot
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                : 'bg-rose-500/20 text-rose-300 border-rose-500/50'
            }
            if (isCurrentDot) {
              dotStyle += ' ring-2 ring-violet-400 ring-offset-1 ring-offset-slate-950 font-bold text-white'
            }

            return (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={`size-6 shrink-0 rounded-md border text-[11px] font-medium transition ${dotStyle}`}
              >
                {idx + 1}
              </button>
            )
          })}
        </div>

        {/* Question Text */}
        <p className="text-sm font-semibold text-white leading-relaxed">
          {currentQuestion.question}
        </p>

        {/* Full-width Clickable Answer Option Rows */}
        <div className="space-y-2.5">
          {currentQuestion.options.map((optionText, optIdx) => {
            const isSelected = selectedAnswer === optIdx
            const isCorrect = optIdx === currentQuestion.correct_index

            let btnStyle =
              'border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700 hover:bg-slate-800/60'

            if (isAnswered) {
              if (isCorrect) {
                btnStyle = 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200 font-medium'
              } else if (isSelected) {
                btnStyle = 'border-rose-500/60 bg-rose-500/15 text-rose-200 font-medium'
              } else {
                btnStyle = 'border-slate-800/50 bg-slate-950/40 text-slate-500 opacity-60'
              }
            }

            return (
              <button
                key={optIdx}
                type="button"
                onClick={() => handleSelectOption(optIdx)}
                disabled={isAnswered}
                className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left text-xs transition ${btnStyle} ${
                  isAnswered ? 'cursor-default' : 'cursor-pointer'
                }`}
              >
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-lg border text-xs font-bold ${
                    isAnswered && isCorrect
                      ? 'border-emerald-400 bg-emerald-500/30 text-emerald-200'
                      : isAnswered && isSelected
                      ? 'border-rose-400 bg-rose-500/30 text-rose-200'
                      : 'border-slate-700 bg-slate-900 text-slate-300'
                  }`}
                >
                  {optionLabels[optIdx] ?? optIdx + 1}
                </span>

                <span className="flex-1 leading-5 pt-0.5">{optionText}</span>

                {isAnswered && isCorrect && <CheckCircleIcon />}
                {isAnswered && isSelected && !isCorrect && <XCircleIcon />}
              </button>
            )
          })}
        </div>

        {/* Explanation Callout (Revealed after selecting an option) */}
        {isAnswered && (
          <div className="mt-2 rounded-xl border border-violet-500/30 bg-violet-500/10 p-3.5 text-xs text-violet-200 animate-fade-in">
            <div className="flex items-center gap-1.5 font-semibold text-violet-300 mb-1">
              <span>💡 Explanation</span>
            </div>
            <p className="leading-relaxed text-slate-300">{currentQuestion.explanation}</p>
          </div>
        )}

        {/* Footer Navigation Buttons */}
        <div className="flex items-center justify-between border-t border-slate-800/80 pt-3">
          <button
            type="button"
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
            className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-600 hover:text-white disabled:opacity-30"
          >
            <ChevronLeftIcon /> Previous
          </button>

          <button
            type="button"
            onClick={() => setCurrentIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
            disabled={currentIndex === totalQuestions - 1}
            className="flex items-center gap-1 rounded-lg bg-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-violet-500 disabled:opacity-30"
          >
            Next <ChevronRightIcon />
          </button>
        </div>
      </div>
    </div>
  )
}
