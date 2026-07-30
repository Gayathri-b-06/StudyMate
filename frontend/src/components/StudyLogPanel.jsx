import { useEffect, useState } from 'react'
import { getStudyLog } from '../api/client'

/* ── Event type badge config ────────────────────────────── */
const EVENT_STYLES = {
  retrieval:   { label: 'Retrieval',   classes: 'bg-violet-500/15 text-violet-300 ring-violet-400/20' },
  question:    { label: 'Question',    classes: 'bg-amber-500/15 text-amber-300 ring-amber-400/20' },
  quiz:        { label: 'Quiz',        classes: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/20' },
  default:     { label: '',            classes: 'bg-slate-700/40 text-slate-400 ring-slate-600/30' },
}

function getEventStyle(eventType) {
  return EVENT_STYLES[eventType?.toLowerCase()] ?? EVENT_STYLES.default
}

function formatDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

/* ── Skeleton row ───────────────────────────────────────── */
function SkeletonEntry() {
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="skeleton mt-0.5 size-2.5 rounded-full" />
        <div className="skeleton mt-1 w-px flex-1" style={{ minHeight: '32px' }} />
      </div>
      <div className="mb-4 flex-1 space-y-1.5">
        <div className="skeleton h-3 w-3/4 rounded" />
        <div className="skeleton h-2.5 w-1/2 rounded" />
      </div>
    </li>
  )
}

/* ── Log entry ──────────────────────────────────────────── */
function LogEntry({ entry, isLast }) {
  const style = getEventStyle(entry.event_type)
  const label = style.label || entry.event_type

  return (
    <li className="flex gap-3 animate-fade-in">
      {/* Timeline spine */}
      <div className="flex flex-col items-center">
        <div className="mt-0.5 size-2.5 shrink-0 rounded-full bg-violet-500 ring-2 ring-violet-500/25 ring-offset-1 ring-offset-slate-950" />
        {!isLast && <div className="mt-1 w-px flex-1 bg-gradient-to-b from-slate-700 to-transparent" style={{ minHeight: '28px' }} />}
      </div>
      {/* Content */}
      <div className="mb-4 min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${style.classes}`}>
            {label}
          </span>
          <span className="text-xs text-slate-600">{formatDate(entry.created_at)}</span>
        </div>
        {entry.topic && (
          <p className="mt-1 text-sm leading-5 text-slate-300">{entry.topic}</p>
        )}
      </div>
    </li>
  )
}

/* ── Main Component ─────────────────────────────────────── */
export default function StudyLogPanel({ threadId }) {
  const [entries, setEntries] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!threadId) { setEntries([]); return }
    let cancelled = false
    setIsLoading(true)
    setError('')
    getStudyLog(threadId)
      .then((data) => { if (!cancelled) setEntries(data) })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [threadId])

  /* No thread */
  if (!threadId) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center animate-fade-in">
        <div className="grid size-12 place-items-center rounded-2xl bg-slate-800 text-slate-500">
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-400">No thread selected</p>
        <p className="text-xs leading-5 text-slate-600">Your study activity will appear here once a thread is active.</p>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Activity Timeline</p>

      {error && (
        <p className="mb-4 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>
      )}

      <ul className="space-y-0">
        {isLoading ? (
          <><SkeletonEntry /><SkeletonEntry /><SkeletonEntry /></>
        ) : entries.length === 0 ? (
          <li className="rounded-xl border border-dashed border-slate-800 px-4 py-8 text-center">
            <p className="text-xs text-slate-600">No study activity yet.</p>
            <p className="mt-1 text-xs text-slate-700">Interact with the AI to start building your log.</p>
          </li>
        ) : (
          entries.map((entry, i) => (
            <LogEntry key={entry.id} entry={entry} isLast={i === entries.length - 1} />
          ))
        )}
      </ul>

      {entries.length > 0 && (
        <p className="mt-2 text-right text-xs text-slate-700">
          {entries.length} event{entries.length !== 1 ? 's' : ''} recorded
        </p>
      )}
    </div>
  )
}
