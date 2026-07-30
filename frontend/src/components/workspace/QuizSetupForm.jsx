import { useEffect, useState } from 'react'

/* ── SVG Icons ────────────────────────────────────────── */
function QuizSparklesIcon() {
  return (
    <svg className="size-7 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.25 7.5l.406 1.423a2.25 2.25 0 0 0 1.546 1.546L21.625 10.875l-1.423.406a2.25 2.25 0 0 0-1.546 1.546L18.25 14.25l-.406-1.423a2.25 2.25 0 0 0-1.546-1.546L14.875 10.875l1.423-.406a2.25 2.25 0 0 0 1.546-1.546L18.25 7.5z" />
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

/* ── QuizSetupForm Component ───────────────────────────── */
export default function QuizSetupForm({ documents = [], isGenerating = false, onSubmit, quizPrefill }) {
  const [topic, setTopic] = useState('')
  const [difficulty, setDifficulty] = useState('medium')
  const [numQuestions, setNumQuestions] = useState(5)
  const [selectedDocId, setSelectedDocId] = useState(documents[0]?.id ?? '')
  useEffect(() => {
    if (!quizPrefill) return
    setSelectedDocId(quizPrefill.documentId ?? '')
    setTopic(quizPrefill.topic ?? '')
    setDifficulty(quizPrefill.difficulty ?? 'medium')
    setNumQuestions(quizPrefill.numQuestions ?? 10)
  }, [quizPrefill])

  // Keep selectedDocId synced if documents list updates
  const effectiveDocId = selectedDocId || (documents[0]?.id ?? '')
  const hasDocuments = documents.length > 0

  function handleSubmit(e) {
    e.preventDefault()
    if (!topic.trim() || isGenerating || !hasDocuments) return
    if (onSubmit) {
      onSubmit({
        documentId: effectiveDocId,
        topic: topic.trim(),
        numQuestions,
        difficulty,
      })
    }
  }

  const difficultyOptions = [
    { value: 'easy', label: 'Easy' },
    { value: 'medium', label: 'Medium' },
    { value: 'hard', label: 'Hard' },
  ]

  return (
    <div className="flex flex-col gap-5 animate-fade-in text-slate-100">
      {/* Header Banner */}
      <div className="flex items-center gap-3 rounded-xl border border-violet-500/20 bg-gradient-to-r from-violet-950/50 to-purple-950/30 p-4 shadow-inner">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-violet-500/15 border border-violet-400/30 text-violet-300">
          <QuizSparklesIcon />
        </div>
        <div>
          <h2 className="text-sm font-bold text-white">Create a Practice Quiz</h2>
          <p className="text-xs text-slate-400">Generate grounded questions directly from your study PDFs</p>
        </div>
      </div>

      {/* Form Card */}
      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        {/* Document Selection (if documents exist) */}
        <div>
          <label htmlFor="quiz-document-select" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Source Document
          </label>
          {!hasDocuments ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
              ⚠️ Please upload a PDF in the <strong>Documents</strong> tab first before generating a quiz.
            </div>
          ) : (
            <select
              id="quiz-document-select"
              value={effectiveDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none transition focus:border-violet-400/70"
            >
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
          <label htmlFor="quiz-topic-input" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Topic / Subject <span className="text-violet-400">*</span>
          </label>
          <input
            id="quiz-topic-input"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Linear Regression, Chapter 2, Photosynthesis"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none transition focus:border-violet-400/70"
          />
        </div>

        {/* Difficulty Pill Selection */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
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
                  className={`rounded-xl border py-2 text-xs font-semibold transition ${
                    isSelected
                      ? 'border-violet-400/70 bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-md shadow-violet-500/20'
                      : 'border-slate-800 bg-slate-950/70 text-slate-400 hover:border-slate-700 hover:text-slate-200'
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
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Number of Questions
          </label>
          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-2">
            <span className="text-xs text-slate-400">Questions (3 - 20)</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setNumQuestions((prev) => Math.max(3, prev - 1))}
                disabled={numQuestions <= 3}
                className="grid size-7 place-items-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-violet-400 hover:text-white disabled:opacity-30 disabled:hover:border-slate-700"
                aria-label="Decrease question count"
              >
                <MinusIcon />
              </button>
              <span className="w-6 text-center font-mono text-sm font-bold text-violet-300">
                {numQuestions}
              </span>
              <button
                type="button"
                onClick={() => setNumQuestions((prev) => Math.min(20, prev + 1))}
                disabled={numQuestions >= 20}
                className="grid size-7 place-items-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-violet-400 hover:text-white disabled:opacity-30 disabled:hover:border-slate-700"
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
          className="mt-2 w-full rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 py-3 text-xs font-bold text-white shadow-lg shadow-violet-500/25 transition hover:from-violet-400 hover:to-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
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
