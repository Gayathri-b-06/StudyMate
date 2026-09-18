import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

/* ── SVG Icons ────────────────────────────────────────── */
function QuizSparklesIcon() {
  return (
    <svg className="size-6 text-emerald-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.25 7.5l.406 1.423a2.25 2.25 0 0 0 1.546 1.546L21.625 10.875l-1.423.406a2.25 2.25 0 0 0-1.546 1.546L18.25 14.25l-.406-1.423a2.25 2.25 0 0 0-1.546-1.546L14.875 10.875l1.423-.406a2.25 2.25 0 0 0 1.546-1.546L18.25 7.5z" />
    </svg>
  )
}

function BookOpenIcon() {
  return (
    <svg className="size-5 text-emerald-700 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  )
}

function MinusIcon() {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

/* ── QuizSetupForm Component ───────────────────────────── */
export default function QuizSetupForm({ documents = [], isGenerating = false, onSubmit, quizPrefill }) {
  const [topic, setTopic] = useState(quizPrefill?.topic ?? '')
  const [difficulty, setDifficulty] = useState(quizPrefill?.difficulty ?? 'medium')
  const [numQuestions, setNumQuestions] = useState(quizPrefill?.numQuestions ?? 10)
  const [questionType, setQuestionType] = useState(quizPrefill?.questionType ?? 'mcq')
  const [selectedDocId, setSelectedDocId] = useState(quizPrefill?.documentId ?? '')
  const [isCustomizing, setIsCustomizing] = useState(false)

  const isFromStudyProgress = Boolean(quizPrefill?.topic)

  // Update form fields when quizPrefill prop changes
  useEffect(() => {
    if (!quizPrefill) return
    setIsCustomizing(false)

    setTopic(quizPrefill.topic ?? '')
    setDifficulty(quizPrefill.difficulty ?? 'medium')
    setNumQuestions(quizPrefill.numQuestions ?? 10)
    setQuestionType(quizPrefill.questionType ?? 'mcq')
    if (quizPrefill.documentId) {
      setSelectedDocId(quizPrefill.documentId)
    }
  }, [quizPrefill])

  // Keep selectedDocId aligned with available documents without overwriting explicit prefill
  useEffect(() => {
    if (documents.length === 0) return

    // If we have a prefilled documentId and it exists in documents, keep it
    if (quizPrefill?.documentId && documents.some((d) => d.id === quizPrefill.documentId)) {
      if (selectedDocId !== quizPrefill.documentId) {
        setSelectedDocId(quizPrefill.documentId)
      }
      return
    }

    // Otherwise, if current selectedDocId is invalid or empty, set a fallback
    if (!selectedDocId || (selectedDocId !== 'all' && !documents.some((d) => d.id === selectedDocId))) {
      setSelectedDocId(documents.length > 1 ? 'all' : documents[0].id)
    }
  }, [documents, quizPrefill, selectedDocId])

  const effectiveDocId = selectedDocId || (documents.length > 1 ? 'all' : (documents[0]?.id ?? ''))
  const hasDocuments = documents.length > 0
  const isDocumentMissing = Boolean(quizPrefill?.documentId) && !documents.some((d) => d.id === quizPrefill.documentId)

  // Find document name for banner
  const matchedDoc = documents.find((d) => d.id === effectiveDocId)
  const sourceDocName = matchedDoc?.filename ?? quizPrefill?.documentName ?? (effectiveDocId === 'all' ? `All ${documents.length} Combined PDFs` : 'Uploaded Document')

  function handleSubmit(e) {
    if (e && e.preventDefault) e.preventDefault()
    if (!topic.trim() || isGenerating || !hasDocuments) return
    const actualDocId = effectiveDocId === 'all' ? documents[0]?.id : effectiveDocId
    if (onSubmit) {
      onSubmit({
        documentId: actualDocId,
        topic: topic.trim(),
        numQuestions,
        difficulty,
        questionType,
      })
    }
  }

  const difficultyOptions = [
    { value: 'easy', label: 'Easy' },
    { value: 'medium', label: 'Medium' },
    { value: 'hard', label: 'Hard' },
  ]

  const questionTypeOptions = [
    { value: 'mcq', label: 'Multiple Choice' },
    { value: 'open_ended', label: 'Open-Ended' },
    { value: 'mixed', label: 'Mixed' },
  ]

  // ── Weak Topic Context Banner View (From Progress) ─────────────────
  if (isFromStudyProgress && !isCustomizing) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col gap-5 max-w-xl mx-auto font-sans"
      >
        {/* Banner Card */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-5">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700">
                <BookOpenIcon />
              </div>
              <div>
                <span className="text-[11px] font-mono-numbers font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  Topic Focused Quiz
                </span>
                <h2 className="font-heading text-lg font-bold text-slate-900 mt-1 leading-snug">
                  Targeted Weak Topic Review
                </h2>
              </div>
            </div>
          </div>

          {/* Focused Topic Highlight Card */}
          <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/40 p-4 space-y-3">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                Target Topic
              </span>
              <p className="text-base font-bold text-slate-900 mt-0.5">
                {topic}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-emerald-200/40 text-xs text-slate-600 font-mono-numbers">
              <div>
                <span className="text-slate-500">Source: </span>
                <span className="font-semibold text-slate-800">📄 {sourceDocName}</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700 font-semibold shadow-2xs">
                  {numQuestions} Questions
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white font-bold uppercase text-[11px] shadow-2xs">
                  {difficulty}
                </span>
              </div>
            </div>
          </div>

          {/* Missing PDF Warning (If document was deleted) */}
          {isDocumentMissing && (
            <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-3.5 text-xs text-amber-900 space-y-2">
              <p className="font-semibold">⚠️ This document is no longer available.</p>
              <button
                type="button"
                onClick={() => setIsCustomizing(true)}
                className="text-xs font-bold text-emerald-700 underline hover:text-emerald-800"
              >
                Choose another document →
              </button>
            </div>
          )}

          {/* Lightweight Multi-PDF Selector if multiple files exist */}
          {documents.length > 1 && (
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-semibold text-slate-600 block">
                We found this topic in multiple documents. Selected source:
              </span>
              <select
                value={effectiveDocId}
                onChange={(e) => setSelectedDocId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
              >
                <option value="all">📚 All Thread PDFs ({documents.length} Combined)</option>
                {documents.map((d) => (
                  <option key={d.id} value={d.id}>
                    📄 {d.filename}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Single-Click Start Quiz Button */}
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            type="button"
            disabled={!topic.trim() || !hasDocuments || isGenerating}
            onClick={handleSubmit}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-40 cursor-pointer"
          >
            {isGenerating ? (
              <span className="flex items-center gap-2">
                <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Generating Focused Quiz…
              </span>
            ) : (
              <>
                <PlayIcon />
                <span>Start Quiz</span>
              </>
            )}
          </motion.button>

          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => setIsCustomizing(true)}
              className="text-[11px] font-medium text-slate-500 hover:text-emerald-700 underline transition cursor-pointer"
            >
              Customize difficulty or question count
            </button>
          </div>
        </div>
      </motion.div>
    )
  }

  // ── Standard Full Setup Form View ────────────────────────────────
  return (
    <div className="flex flex-col gap-5 animate-fade-in text-slate-800 font-sans">
      {/* Header Banner */}
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700">
          <QuizSparklesIcon />
        </div>
        <div>
          <h2 className="font-heading text-base font-bold text-slate-900">Generate Quiz</h2>
          <p className="text-xs text-slate-500">Build practice questions grounded directly in your uploaded PDFs</p>
        </div>
      </div>

      {/* Form Card */}
      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
        {/* Document Selection */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="quiz-document-select" className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Source Document ({documents.length} Uploaded)
            </label>
          </div>
          {!hasDocuments ? (
            <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-3 text-xs text-amber-900">
              ⚠️ Please upload a PDF in the <strong>Documents</strong> tab first before generating a quiz.
            </div>
          ) : (
            <select
              id="quiz-document-select"
              value={effectiveDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
            >
              {documents.length > 1 && (
                <option value="all">
                  📚 All Thread PDFs ({documents.length} Files Combined)
                </option>
              )}
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  📄 {doc.filename}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Topic Input */}
        <div>
          <label htmlFor="quiz-topic-input" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">
            Topic / Subject <span className="text-emerald-600 font-bold">*</span>
          </label>
          <input
            id="quiz-topic-input"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Linear Regression, Chapter 2, Photosynthesis"
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
          />
        </div>

        {/* Question Format Selection */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">
            Question Format
          </label>
          <div className="grid grid-cols-3 gap-2">
            {questionTypeOptions.map((opt) => {
              const isSelected = questionType === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setQuestionType(opt.value)}
                  className={`rounded-xl border py-2.5 text-xs font-semibold transition cursor-pointer ${
                    isSelected
                      ? 'border-2 border-emerald-600 bg-emerald-50/80 text-emerald-900 font-bold shadow-2xs'
                      : 'border-slate-200 bg-slate-50/60 text-slate-600 hover:border-emerald-300 hover:text-slate-900 hover:bg-white'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Difficulty Level */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">
            Difficulty Level
          </label>
          <div className="grid grid-cols-3 gap-2">
            {difficultyOptions.map((opt) => {
              const isSelected = difficulty === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDifficulty(opt.value)}
                  className={`rounded-xl border py-2.5 text-xs font-semibold transition cursor-pointer ${
                    isSelected
                      ? 'border-2 border-emerald-600 bg-emerald-50/80 text-emerald-900 font-bold shadow-2xs'
                      : 'border-slate-200 bg-slate-50/60 text-slate-600 hover:border-emerald-300 hover:text-slate-900 hover:bg-white'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Number of Questions Stepper */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">
            Number of Questions
          </label>
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2">
            <span className="text-xs text-slate-500 font-mono-numbers">Questions (3 - 20)</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setNumQuestions((prev) => Math.max(3, prev - 1))}
                disabled={numQuestions <= 3}
                className="grid size-7 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-30 cursor-pointer"
                aria-label="Decrease question count"
              >
                <MinusIcon />
              </button>
              <span className="w-6 text-center font-mono-numbers text-sm font-bold text-slate-900">
                {numQuestions}
              </span>
              <button
                type="button"
                onClick={() => setNumQuestions((prev) => Math.min(20, prev + 1))}
                disabled={numQuestions >= 20}
                className="grid size-7 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-30 cursor-pointer"
                aria-label="Increase question count"
              >
                <PlusIcon />
              </button>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!topic.trim() || !hasDocuments || isGenerating}
          className="mt-2 w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-40 cursor-pointer"
        >
          {isGenerating ? (
            <span className="flex items-center justify-center gap-2">
              <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Generating Quiz…
            </span>
          ) : (
            'Generate Quiz'
          )}
        </button>
      </form>
    </div>
  )
}

