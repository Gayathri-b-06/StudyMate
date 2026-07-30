import { useCallback, useRef, useState } from 'react'
import { generateFlashcards } from '../../lib/flashcardsApi'
import { reportFlashcardResult } from '../../lib/progressApi'
import FlashcardsSetupForm from './FlashcardsSetupForm'

/* ── Icons ──────────────────────────────────────────────── */
function RefreshIcon() {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15" />
    </svg>
  )
}

function PlusCircleIcon() {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
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

function LightbulbIcon() {
  return (
    <svg className="size-3.5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  )
}

/* ── FlashCard (single card with flip) ─────────────────── */
function FlashCard({ card, isFlipped, onFlip }) {
  return (
    <div
      className="relative w-full cursor-pointer select-none"
      style={{ perspective: '1200px', minHeight: '220px' }}
      onClick={onFlip}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onFlip()}
      aria-label={isFlipped ? 'Card back — click to see front' : 'Card front — click to reveal answer'}
    >
      <div
        className="relative w-full h-full transition-transform duration-500 ease-in-out"
        style={{
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          minHeight: '220px',
        }}
      >
        {/* Front */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl border border-teal-500/30 bg-gradient-to-br from-slate-900 to-teal-950/30 p-6 shadow-xl shadow-teal-900/20 backface-hidden"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-teal-500/70">Term / Question</span>
          <p className="text-center text-base font-semibold leading-relaxed text-white">{card.front}</p>
          <span className="mt-2 text-[10px] text-slate-500">Click to reveal answer</span>
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-slate-900 to-emerald-950/20 p-6 shadow-xl shadow-emerald-900/20"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-emerald-500/70">Answer</span>
          <p className="text-center text-sm leading-relaxed text-slate-200">{card.back}</p>
          {card.hint && (
            <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-left">
              <LightbulbIcon />
              <span className="text-xs text-amber-300/90">{card.hint}</span>
            </div>
          )}
          <span className="mt-2 text-[10px] text-slate-500">Click to see front</span>
        </div>
      </div>
    </div>
  )
}

/* ── Toolbar Button ─────────────────────────────────────── */
function ToolbarBtn({ onClick, disabled, children, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:border-teal-500/50 hover:bg-teal-500/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

/* ── Progress Dots ──────────────────────────────────────── */
function ProgressDots({ indices, current, statuses }) {
  const total = indices.length
  const MAX_DOTS = 15
  if (total <= MAX_DOTS) {
    return (
      <div className="flex items-center gap-1">
        {indices.map((cardIndex, i) => (
          <div
            key={cardIndex}
            className={`rounded-full transition-all duration-200 ${
              i === current
                ? 'size-2 bg-teal-400'
                : statuses[cardIndex] === 'known'
                ? 'size-1.5 bg-emerald-400'
                : statuses[cardIndex] === 'learning'
                ? 'size-1.5 bg-amber-400'
                : 'size-1.5 bg-slate-700'
            }`}
          />
        ))}
      </div>
    )
  }
  return (
    <span className="text-xs text-slate-400">
      {current + 1} / {total}
    </span>
  )
}

/* ── FlashcardsWorkspace ────────────────────────────────── */
export default function FlashcardsWorkspace({
  documents = [],
  flashcardData,
  onFlashcardsUpdate,
  threadId,
  flashcardPrefill,
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [cardStatuses, setCardStatuses] = useState({})
  const [visibleCardIndices, setVisibleCardIndices] = useState([])
  const hasReportedRef = useRef(false)

  const cards = flashcardData?.cards ?? []
  const allIndices = cards.map((_, index) => index)
  const activeIndices = visibleCardIndices.length > 0 ? visibleCardIndices : allIndices
  const total = activeIndices.length
  const currentCardIndex = activeIndices[currentIndex]
  const currentCard = currentCardIndex == null ? null : cards[currentCardIndex]

  /* Reset position when new deck arrives */
  const handleNewDeck = useCallback((data) => {
    setCurrentIndex(0)
    setIsFlipped(false)
    setCardStatuses({})
    setVisibleCardIndices([])
    hasReportedRef.current = false
    if (onFlashcardsUpdate) onFlashcardsUpdate(data)
  }, [onFlashcardsUpdate])

  /* Navigate cards */
  function goNext() {
    setIsFlipped(false)
    setTimeout(() => setCurrentIndex((i) => Math.min(total - 1, i + 1)), 150)
  }

  function goPrev() {
    setIsFlipped(false)
    setTimeout(() => setCurrentIndex((i) => Math.max(0, i - 1)), 150)
  }

  function flipCard() {
    setIsFlipped((f) => !f)
  }

  function assessCurrentCard(status) {
    if (currentCardIndex == null) return
    setCardStatuses((current) => ({ ...current, [currentCardIndex]: status }))
    setIsFlipped(false)
    if (currentIndex < total - 1) setTimeout(() => setCurrentIndex((index) => index + 1), 150)
    else if (!hasReportedRef.current && flashcardData) {
      hasReportedRef.current = true
      const nextStatuses = { ...cardStatuses, [currentCardIndex]: status }
      const reportedCards = cards.flatMap((card, index) => nextStatuses[index] ? [{ front: card.front, status: nextStatuses[index] }] : [])
      void reportFlashcardResult(flashcardData.document_id, flashcardData.topic, reportedCards).catch(() => {})
    }
  }

  function reviewLearningCards() {
    setVisibleCardIndices(allIndices.filter((index) => cardStatuses[index] === 'learning'))
    setCurrentIndex(0)
    setIsFlipped(false)
  }

  function reportSession() {
    if (!flashcardData || hasReportedRef.current) return
    hasReportedRef.current = true
    const reportedCards = cards.flatMap((card, index) => cardStatuses[index] ? [{ front: card.front, status: cardStatuses[index] }] : [])
    void reportFlashcardResult(flashcardData.document_id, flashcardData.topic, reportedCards).catch(() => {})
  }

  /* Direct regenerate */
  async function handleRegenerate() {
    if (!flashcardData || isGenerating) return
    reportSession(); setIsGenerating(true)
    setGenError('')
    try {
      const refreshed = await generateFlashcards(
        flashcardData.document_id,
        flashcardData.topic,
        total || 10
      )
      handleNewDeck(refreshed)
    } catch (err) {
      setGenError(err.message ?? 'Failed to regenerate flashcards.')
    } finally {
      setIsGenerating(false)
    }
  }

  /* New deck from setup form */
  async function handleSetupSubmit({ documentId, topic, numCards }) {
    setIsGenerating(true)
    setGenError('')
    try {
      const data = await generateFlashcards(documentId, topic, numCards)
      handleNewDeck(data)
    } catch (err) {
      setGenError(err.message ?? 'Failed to generate flashcards.')
    } finally {
      setIsGenerating(false)
    }
  }

  /* ── Empty / Setup state ──────────────────────────────── */
  if (!flashcardData) {
    return (
      <div className="flex flex-col gap-4">
        <FlashcardsSetupForm
          documents={documents}
          isGenerating={isGenerating}
          onSubmit={handleSetupSubmit}
          flashcardPrefill={flashcardPrefill}
        />
        {genError && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {genError}
          </p>
        )}
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/30 p-3 text-center text-xs text-slate-500">
          Or ask in chat: <span className="font-medium text-teal-400">"Make flashcards on [topic]"</span>
        </div>
      </div>
    )
  }

  /* ── Active Deck ──────────────────────────────────────── */
  const progress = total > 0 ? Math.round(((currentIndex + 1) / total) * 100) : 0

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-white">{flashcardData.topic}</h2>
            <p className="truncate text-xs text-slate-500">
              {documents.find((d) => d.id === flashcardData.document_id)?.filename ?? 'Uploaded document'} · {total} cards
            </p>
          </div>

          {/* Toolbar */}
          <div className="flex shrink-0 items-center gap-1.5">
            <ToolbarBtn
              onClick={handleRegenerate}
              disabled={isGenerating}
              title="Regenerate same topic"
            >
              <RefreshIcon />
              Regenerate
            </ToolbarBtn>
            <ToolbarBtn
              onClick={() => { reportSession(); onFlashcardsUpdate && onFlashcardsUpdate(null) }}
              title="Start new deck"
            >
              <PlusCircleIcon />
              + New
            </ToolbarBtn>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 w-full rounded-full bg-slate-800">
          <div
            className="h-1 rounded-full bg-gradient-to-r from-teal-500 to-cyan-400 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Error */}
      {genError && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {genError}
        </p>
      )}

      {/* Generating spinner overlay */}
      {isGenerating && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-teal-500/20 bg-teal-500/5 py-4 text-xs text-teal-300">
          <span className="size-4 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
          Generating flashcards…
        </div>
      )}

      {/* Card display */}
      {!isGenerating && currentCard && (
        <>
          <FlashCard card={currentCard} isFlipped={isFlipped} onFlip={flipCard} />

          {isFlipped && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => assessCurrentCard('known')} className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20">Got it</button>
              <button type="button" onClick={() => assessCurrentCard('learning')} className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20">Still learning</button>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-300 transition hover:border-teal-500/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeftIcon />
              Prev
            </button>

            <ProgressDots indices={activeIndices} current={currentIndex} statuses={cardStatuses} />

            <button
              type="button"
              onClick={goNext}
              disabled={currentIndex === total - 1}
              className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-300 transition hover:border-teal-500/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            >
              Next
              <ChevronRightIcon />
            </button>
          </div>

          {/* Keyboard hint */}
          <p className="text-center text-[10px] text-slate-600">
            Click card to flip · navigate with Prev / Next
          </p>
        </>
      )}

      {/* Empty state (no cards returned) */}
      {!isGenerating && total === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-10 text-center">
          <p className="text-sm text-slate-500">No cards were generated. Try a different topic.</p>
        </div>
      )}
    </div>
  )
}
