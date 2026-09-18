import { useEffect, useState } from 'react'

/* ── Icons ──────────────────────────────────────────────── */
function FlashcardIcon() {
  return (
    <svg className="size-6 text-emerald-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2m14 0V9a2 2 0 0 0-2-2M5 11V9a2 2 0 0 1 2-2m0 0V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M7 7h10" />
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

/* ── FlashcardsSetupForm ────────────────────────────────── */
export default function FlashcardsSetupForm({ documents = [], isGenerating = false, onSubmit, flashcardPrefill }) {
  const [topic, setTopic] = useState('')
  const [numCards, setNumCards] = useState(10)
  const [selectedDocId, setSelectedDocId] = useState(documents[0]?.id ?? '')

  useEffect(() => {
    if (!flashcardPrefill) return
    setSelectedDocId(flashcardPrefill.documentId ?? '')
    setTopic(flashcardPrefill.topic ?? '')
  }, [flashcardPrefill])

  // Keep selectedDocId valid when documents prop updates
  useEffect(() => {
    if (documents.length > 0 && (!selectedDocId || (selectedDocId !== 'all' && !documents.some((d) => d.id === selectedDocId)))) {
      setSelectedDocId(documents.length > 1 ? 'all' : documents[0].id)
    }
  }, [documents, selectedDocId])

  const effectiveDocId = selectedDocId || (documents.length > 1 ? 'all' : (documents[0]?.id ?? ''))
  const hasDocuments = documents.length > 0

  function handleSubmit(e) {
    e.preventDefault()
    if (!topic.trim() || isGenerating || !hasDocuments) return
    const actualDocId = effectiveDocId === 'all' ? documents[0]?.id : effectiveDocId
    if (onSubmit) {
      onSubmit({ documentId: actualDocId, topic: topic.trim(), numCards })
    }
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-in text-slate-800 font-sans">
      {/* Header Banner */}
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700">
          <FlashcardIcon />
        </div>
        <div>
          <h2 className="font-heading text-base font-bold text-slate-900">Create Study Flashcards</h2>
          <p className="text-xs text-slate-500">Generate recall cards grounded directly in your uploaded PDFs</p>
        </div>
      </div>

      {/* Form Card */}
      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
        {/* Document Selection */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="fc-document-select" className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Source Document ({documents.length} Uploaded)
            </label>
          </div>
          {!hasDocuments ? (
            <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-3 text-xs text-amber-900">
              ⚠️ Please upload a PDF in the <strong>Documents</strong> tab first before generating flashcards.
            </div>
          ) : (
            <select
              id="fc-document-select"
              value={effectiveDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
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
          <label htmlFor="fc-topic-input" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">
            Topic / Subject <span className="text-emerald-600 font-bold">*</span>
          </label>
          <input
            id="fc-topic-input"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Mitosis, Chapter 3, Neural Networks"
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
          />
        </div>

        {/* Number of Cards Stepper */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">
            Number of Cards
          </label>
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2">
            <span className="text-xs text-slate-500 font-mono-numbers">Cards (3 – 20)</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setNumCards((prev) => Math.max(3, prev - 1))}
                disabled={numCards <= 3}
                className="grid size-7 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-30 cursor-pointer"
                aria-label="Decrease card count"
              >
                <MinusIcon />
              </button>
              <span className="w-6 text-center font-mono-numbers text-sm font-bold text-slate-900">
                {numCards}
              </span>
              <button
                type="button"
                onClick={() => setNumCards((prev) => Math.min(20, prev + 1))}
                disabled={numCards >= 20}
                className="grid size-7 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-30 cursor-pointer"
                aria-label="Increase card count"
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
          className="mt-2 w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          {isGenerating ? (
            <span className="flex items-center justify-center gap-2">
              <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Generating Flashcards…
            </span>
          ) : (
            'Generate Flashcards'
          )}
        </button>
      </form>
    </div>
  )
}

