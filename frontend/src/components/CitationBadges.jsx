/**
 * Compact citation badge component rendering sources as pill badges at the bottom of messages.
 */
export default function CitationBadges({ sources = [], parsedSources = [] }) {
  const combined = []
  const seen = new Set()

  const addSource = (doc, page) => {
    if (!doc) return
    const cleanDoc = doc.trim()
    const key = `${cleanDoc.toLowerCase()}:${page ?? ''}`
    if (!seen.has(key)) {
      seen.add(key)
      combined.push({ document: cleanDoc, page })
    }
  }

  for (const s of sources) {
    addSource(s.document, s.page)
  }
  for (const s of parsedSources) {
    addSource(s.document, s.page)
  }

  if (combined.length === 0) return null

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/10 pt-3 text-xs font-sans">
      <span className="flex items-center gap-1.5 font-semibold text-zinc-500 text-[11px] uppercase tracking-wider">
        <svg className="size-3.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        Sources ({combined.length})
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {combined.map((src, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 rounded-full border border-black/15 bg-zinc-50 px-3 py-1 text-xs font-medium text-black transition-all hover:border-black hover:bg-white shadow-xs"
          >
            <svg className="size-3 text-black shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="truncate max-w-[180px]">{src.document}</span>
            {src.page != null && (
              <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-bold text-black font-mono-numbers">
                p. {src.page}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}
