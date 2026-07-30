import { useState } from 'react'

function formatUpdatedAt(value) {
  if (!value) return ''

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

/* ── Close icon helper ─────────────────────────────────── */
function CloseSidebarIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function ThreadSidebar({
  activeThreadId,
  error,
  isLoading,
  onCreate,
  onDelete,
  onRename,
  onSelect,
  onClose,
  threads,
}) {
  const [editingThreadId, setEditingThreadId] = useState(null)
  const [editedTitle, setEditedTitle] = useState('')

  function beginRename(thread) {
    setEditingThreadId(thread.id)
    setEditedTitle(thread.title)
  }

  async function saveRename(threadId) {
    const title = editedTitle.trim()
    if (!title) return

    await onRename(threadId, title)
    setEditingThreadId(null)
  }

  return (
    <aside className="hidden w-72 shrink-0 border-r border-slate-800 bg-slate-900/70 p-4 md:flex md:flex-col h-full overflow-hidden">
      {/* Header with Collapse Button */}
      <div className="mb-6 flex shrink-0 items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl bg-violet-500 font-bold text-white shadow-lg shadow-violet-500/20">
            S
          </div>
          <div>
            <p className="font-semibold tracking-tight text-white">StudyMate</p>
            <p className="text-xs text-slate-400">Your study workspace</p>
          </div>
        </div>

        {/* Left Sidebar Collapse Button (matches right panel pattern) */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <CloseSidebarIcon />
          </button>
        )}
      </div>

      {/* New Chat Button */}
      <button
        type="button"
        onClick={onCreate}
        className="mb-5 flex shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300"
      >
        <span aria-hidden="true">+</span> New chat
      </button>

      {/* Independently Scrollable Conversations List */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <p className="px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Conversations
        </p>

        {isLoading && <p className="px-2 py-4 text-sm text-slate-500">Loading conversations…</p>}
        {error && <p className="px-2 py-4 text-sm text-rose-300">{error}</p>}

        {!isLoading && !error && threads.length === 0 && (
          <p className="px-2 py-4 text-sm leading-6 text-slate-500">Start a chat to create your first conversation.</p>
        )}

        <ul className="mt-2 space-y-1">
          {threads.map((thread) => (
            <li key={thread.id} className="group">
              {editingThreadId === thread.id ? (
                <form
                  className="flex gap-1 rounded-lg bg-slate-800 p-1"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void saveRename(thread.id)
                  }}
                >
                  <input
                    autoFocus
                    value={editedTitle}
                    onChange={(event) => setEditedTitle(event.target.value)}
                    onBlur={(event) => {
                      if (!event.currentTarget.form?.contains(event.relatedTarget)) {
                        setEditingThreadId(null)
                      }
                    }}
                    maxLength="200"
                    className="min-w-0 flex-1 rounded bg-slate-900 px-2 py-1 text-sm text-white outline-none ring-violet-400 focus:ring-1"
                  />
                  <button type="submit" className="rounded px-2 text-xs font-medium text-violet-200 hover:bg-slate-700">
                    Save
                  </button>
                </form>
              ) : (
                <div
                  className={`flex items-center gap-1 rounded-lg p-1 transition ${
                    activeThreadId === thread.id ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/70'
                  }`}
                >
                  <button
                    type="button"
                    title={thread.title}
                    onClick={() => onSelect(thread.id)}
                    className="min-w-0 flex-1 truncate px-2 py-2 text-left text-sm"
                  >
                    <span className="block truncate">{thread.title}</span>
                    <span className="block text-xs text-slate-500">{formatUpdatedAt(thread.updated_at)}</span>
                  </button>
                  <div className="hidden shrink-0 gap-1 group-hover:flex">
                    <button
                      type="button"
                      onClick={() => beginRename(thread)}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white"
                      aria-label={`Rename ${thread.title}`}
                      title="Rename"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Delete “${thread.title}”? This also removes its document indexes.`)) {
                          void onDelete(thread.id)
                        }
                      }}
                      className="rounded p-1.5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300"
                      aria-label={`Delete ${thread.title}`}
                      title="Delete"
                    >
                      ×
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <p className="shrink-0 px-2 pt-4 text-xs text-slate-500">Study with clarity.</p>
    </aside>
  )
}

export default ThreadSidebar
