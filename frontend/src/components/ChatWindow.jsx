import { useEffect, useRef, useState } from 'react'
import { Plus, Clock, X, Search, Trash2, Pencil, Check, ChevronRight, MessageSquare, UserRound, BookOpen } from 'lucide-react'
import { getThreadMessages } from '../api/client'
import { sendChatMessageStream } from '../lib/api'
import { useWorkspace } from '../context/WorkspaceContext'
import ToolStatusIndicator from './ToolStatusIndicator'
import MarkdownMessage from './MarkdownMessage'
import CitationBadges from './CitationBadges'


/**
 * Extracts Markdown body content separate from trailing Sources section.
 * Parses any inline text citations like "sample.pdf, p. 18" or "sample.pdf (page 18)".
 */
function parseBodyAndSources(rawContent = '') {
  if (!rawContent) return { body: '', parsedSources: [] }

  const sourcesPattern = /(?:^|\n)(?:##\s*(?:📚\s*)?Sources|\*\*Sources:\*\*|Sources:)([\s\S]*)$/i
  const match = rawContent.match(sourcesPattern)

  if (!match) {
    return { body: rawContent, parsedSources: [] }
  }

  const body = rawContent.slice(0, match.index).trim()
  const sourcesText = match[1] ?? ''
  const parsedSources = []

  const regex = /(?:📄\s*)?([a-zA-Z0-9_\-.]+\.pdf)(?:[^\n\d]*?(\d+))?/gi
  let m
  while ((m = regex.exec(sourcesText)) !== null) {
    const doc = m[1]?.trim()
    const page = m[2] ? parseInt(m[2], 10) : null
    if (doc) {
      parsedSources.push({ document: doc, page })
    }
  }

  return { body, parsedSources }
}

/* ── Typing indicator dots ──────────────────────────────── */
function TypingDots() {
  return (
    <span className="flex items-center gap-1" aria-label="StudyMate is responding">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="block size-1.5 rounded-full bg-zinc-400"
          style={{ animation: `bounce-dot 1s ${delay}ms infinite ease-in-out` }}
        />
      ))}
    </span>
  )
}

/* ── SVG Icons ────────────────────────────────────────── */
function AlertTriangleIcon({ className = 'size-4 shrink-0 text-black' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  )
}

/* ── Generic assistant-response indicator ───────────────── */
function ThinkingIndicator() {
  return (
    <div className="flex items-start gap-3 animate-fade-in font-sans pt-1">
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-600 text-xs font-bold text-white shadow-xs mt-0.5">
        S
      </div>
      <div className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-900 shadow-xs">
        <span className="relative flex size-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-600" />
        </span>
        <span className="font-semibold text-slate-900">StudyMate is thinking…</span>
        <TypingDots />
      </div>
    </div>
  )
}

function StreamingCursor() {
  return (
    <span
      aria-label="StudyMate is still typing"
      className="ml-1 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-emerald-600 align-[-2px]"
    />
  )
}

/* ── Skeleton Message ───────────────────────────────────── */
function HistorySkeleton() {
  return (
    <div className="space-y-4 animate-fade-in py-4">
      <div className="flex gap-3 justify-end">
        <div className="skeleton h-10 w-2/3 rounded-2xl" />
      </div>
      <div className="flex gap-3 justify-start">
        <div className="skeleton size-8 rounded-lg" />
        <div className="skeleton h-16 w-3/4 rounded-2xl" />
      </div>
    </div>
  )
}

/* ── Thread Row with inline rename & delete ──────────── */
function ThreadRow({ thread, isActive, onSelect, onRename, onDelete }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(thread.title)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing])

  function startEdit(e) {
    e.stopPropagation()
    setEditValue(thread.title)
    setIsEditing(true)
  }

  function commitRename() {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== thread.title && onRename) onRename(thread.id, trimmed)
    setIsEditing(false)
  }

  function handleEditKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); commitRename() }
    if (e.key === 'Escape') { setIsEditing(false); setEditValue(thread.title) }
  }

  function handleDeleteClick(e) {
    e.stopPropagation()
    if (!showDeleteConfirm) { setShowDeleteConfirm(true); return }
    onDelete?.(thread.id)
    setShowDeleteConfirm(false)
  }

  return (
    <div className={`group relative rounded-xl transition-colors ${
      isActive ? 'bg-emerald-50 border border-emerald-200' : 'hover:bg-slate-50'
    }`}>
      {isEditing ? (
        /* Rename mode */
        <div className="flex items-center gap-1.5 px-3 py-2.5">
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleEditKey}
            onBlur={commitRename}
            className="min-w-0 flex-1 rounded-md border border-black bg-white px-2 py-1 text-xs text-black outline-none"
          />
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); commitRename() }}
            className="shrink-0 rounded-md p-1 text-black hover:bg-zinc-200 transition cursor-pointer"
            title="Save"
          >
            <Check className="size-3.5" />
          </button>
        </div>
      ) : (
        /* Normal mode */
        <button
          type="button"
          onClick={() => onSelect(thread.id)}
          className="flex w-full items-start gap-2.5 px-3 py-2 text-left cursor-pointer pr-16"
        >
          <MessageSquare className={`mt-0.5 size-4 shrink-0 ${isActive ? 'text-emerald-700' : 'text-slate-400'}`} />
          <div className="min-w-0 flex-1">
            <p className={`truncate text-sm font-semibold leading-snug ${
              isActive ? 'text-emerald-950 font-bold' : 'text-slate-900'
            }`}>
              {thread.title}
            </p>
            {thread.updated_at && (
              <p className={`text-[11px] font-mono-numbers mt-0.5 ${
                isActive ? 'text-emerald-700/80' : 'text-slate-400'
              }`}>
                {new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(thread.updated_at))}
              </p>
            )}
          </div>
        </button>
      )}

      {/* Action buttons — reveal on hover */}
      {!isEditing && (
        <div className={`absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 transition-opacity ${
          showDeleteConfirm ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}>
          <button
            type="button"
            onClick={startEdit}
            className={`rounded-md p-1.5 transition cursor-pointer ${
              isActive ? 'text-emerald-700 hover:bg-emerald-100 hover:text-emerald-900' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-900'
            }`}
            title="Rename"
          >
            <Pencil className="size-3" />
          </button>

          {showDeleteConfirm ? (
            <>
              <button
                type="button"
                onClick={handleDeleteClick}
                className="rounded-md bg-rose-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-rose-700 transition cursor-pointer"
              >
                Delete?
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false) }}
                className={`rounded-md p-1.5 transition cursor-pointer ${
                  isActive ? 'text-emerald-700 hover:bg-emerald-100' : 'text-slate-400 hover:bg-slate-100'
                }`}
              >
                <X className="size-3" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleDeleteClick}
              className={`rounded-md p-1.5 transition cursor-pointer ${
                isActive
                  ? 'text-emerald-700 hover:bg-emerald-100 hover:text-rose-600'
                  : 'text-slate-400 hover:bg-slate-100 hover:text-rose-600'
              }`}
              title="Delete conversation"
            >
              <Trash2 className="size-3" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* ── ChatWindow ─────────────────────────────────────────── */
function ChatWindow({
  threads = [],
  onSelectThread,
  onRenameThread,
  onDeleteThread,
  onNewChat,
  onFlashcardsCreated,
  onPlanCreated,
  onInvalidThread,
  onQuizCreated,
  onQuizTopic,
  onResponse,
  onThreadCreated,
  resetKey,
  threadId,
  projectId = null,
}) {
  const { activeWorkspace, setActiveWorkspace, activeProjectId: contextProjectId, setActiveThreadId } = useWorkspace()
  const effectiveProjectId = projectId || contextProjectId

  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isStreamingResponse, setIsStreamingResponse] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [messages, setMessages] = useState([])
  const messageListRef = useRef(null)
  const shouldAutoScrollRef = useRef(true)
  const streamTimerRef = useRef(null)
  const assistantMessageIdRef = useRef(0)
  const textareaRef = useRef(null)
  const pendingToolStatusRef = useRef(null)
  const createdThreadIdRef = useRef(null)
  const conversationRef = useRef(null)
  conversationRef.current = { threadId, projectId: effectiveProjectId, resetKey }

  /* Fetch history whenever threadId, resetKey, or activeWorkspace changes */
  useEffect(() => {
    if (activeWorkspace && activeWorkspace !== 'chat') {
      return
    }

    setDraft('')
    setError('')
    setMessages([])
    setIsSending(false)
    setIsStreamingResponse(false)
    clearInterval(streamTimerRef.current)
    pendingToolStatusRef.current = null
    createdThreadIdRef.current = null

    if (!threadId || threadId === 'undefined') {
      setIsLoadingHistory(false)
      setMessages([])
      return
    }

    let isCurrent = true
    setIsLoadingHistory(true)

    getThreadMessages(threadId)
      .then((history) => {
        if (isCurrent) setMessages(history ?? [])
      })
      .catch((requestError) => {
        if (isCurrent) {
          if (requestError.status === 404 || requestError.message?.includes('not found')) {
            if (onInvalidThread) onInvalidThread(threadId)
          } else {
            setError(requestError.message)
          }
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoadingHistory(false)
      })

    return () => {
      isCurrent = false
    }
  }, [threadId, resetKey, activeWorkspace, onInvalidThread])



  /* Only follow new content while the reader is already near the bottom. */
  useEffect(() => {
    if (!shouldAutoScrollRef.current) return
    const list = messageListRef.current
    if (!list) return
    requestAnimationFrame(() => { list.scrollTop = list.scrollHeight })
  }, [messages, isSending, isStreamingResponse, isLoadingHistory])

  useEffect(() => () => clearInterval(streamTimerRef.current), [])

  function handleMessageListScroll() {
    const list = messageListRef.current
    if (!list) return
    shouldAutoScrollRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 96
  }

  /* Auto-grow textarea */
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [draft])

  async function sendMessage() {
    const message = draft.trim()
    if (!message || isSending || isLoadingHistory) return

    if (!effectiveProjectId) {
      setError('Please select or create a project in the sidebar before sending a message.')
      return
    }

    setDraft('')
    setError('')
    setIsSending(true)
    setIsStreamingResponse(false)
    const conversation = conversationRef.current
    const isCurrentConversation = () => {
      const current = conversationRef.current
      return current.threadId === conversation.threadId
        && current.projectId === conversation.projectId
        && current.resetKey === conversation.resetKey
    }
    pendingToolStatusRef.current = null
    setMessages((prev) => [...prev, { content: message, role: 'user' }])

    try {
      await sendChatMessageStream(message, effectiveProjectId, threadId, {
        onToolResult: (toolResult) => {
          if (!isCurrentConversation()) return
          if (toolResult && toolResult.tool === 'quiz') {
            pendingToolStatusRef.current = {
              message: '✅ Quiz created',
              detail: toolResult.topic,
            }
            if (onQuizCreated) onQuizCreated(toolResult)
            setActiveWorkspace('quiz')
          } else if (toolResult && toolResult.tool === 'flashcards') {
            pendingToolStatusRef.current = {
              message: '✅ Flashcards created',
              detail: toolResult.topic,
            }
            if (onFlashcardsCreated) onFlashcardsCreated(toolResult)
            setActiveWorkspace('flashcards')
          } else if (toolResult && (toolResult.tool === 'study_planner' || toolResult.tool === 'notes')) {
            pendingToolStatusRef.current = {
              message: toolResult.tool === 'notes' ? '✅ Notes generated' : '✅ Study plan created',
              detail: toolResult.topic,
            }
            if (onPlanCreated) onPlanCreated(toolResult)
            setActiveWorkspace('planner')
          }
        },


        onMessage: (response) => {
          if (!isCurrentConversation()) return
          const toolStatus = pendingToolStatusRef.current
          pendingToolStatusRef.current = null
          const messageId = `stream-${++assistantMessageIdRef.current}`
          const finalContent = response.message ?? ''
          const chunks = finalContent.match(/\S+\s*/g) ?? []
          let cursor = 0

          setMessages((prev) => [
            ...prev,
            {
              id: messageId,
              content: '',
              role: 'assistant',
              isStreaming: true,
              sources: response.sources ?? [],
              response_type: response.response_type,
              toolStatus,
            },
          ])
          setIsStreamingResponse(true)

          clearInterval(streamTimerRef.current)
          streamTimerRef.current = setInterval(() => {
            if (!isCurrentConversation()) {
              clearInterval(streamTimerRef.current)
              return
            }
            cursor = Math.min(cursor + 4, chunks.length)
            const visibleContent = chunks.slice(0, cursor).join('')
            const complete = cursor >= chunks.length
            setMessages((prev) => prev.map((item) => (
              item.id === messageId
                ? { ...item, content: complete ? finalContent : visibleContent, isStreaming: !complete }
                : item
            )))
            if (complete) {
              clearInterval(streamTimerRef.current)
              setIsStreamingResponse(false)
            }
          }, 32)
          if (response.thread_id) {
            createdThreadIdRef.current = response.thread_id
            if (!threadId && onThreadCreated) {
              onThreadCreated(response.thread_id)
            }
          }
        },
      })
      if (onResponse) await onResponse()
    } catch (requestError) {
      if (!isCurrentConversation()) return
      if (requestError.status === 404 || requestError.message?.includes('not found')) {
        if (onInvalidThread) onInvalidThread(threadId)
      } else {
        setError(requestError.message)
      }
    } finally {
      if (isCurrentConversation()) setIsSending(false)
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage()
    }
  }

  const currentThread = threads.find((t) => t.id === threadId)
  const filteredThreads = threads.filter((t) =>
    !historySearch.trim() || t.title.toLowerCase().includes(historySearch.toLowerCase())
  )

  function handleSelectThread(id) {
    setIsHistoryOpen(false)
    if (onSelectThread) onSelectThread(id)
    else setActiveThreadId(id)
  }

  return (
    <section className="study-chat relative flex h-full min-w-0 flex-1 overflow-hidden">

      {/* ════════════════════════════════════════════════════
          HISTORY SIDE DRAWER & TAB
      ════════════════════════════════════════════════════ */}
      {/* Backdrop overlay */}
      {isHistoryOpen && (
        <div
          className="absolute inset-0 z-30 bg-black/25 backdrop-blur-[2px] transition-opacity"
          onClick={() => setIsHistoryOpen(false)}
        />
      )}

      {/* Slide-over Drawer Panel */}
      <div
        className={`absolute inset-y-0 left-0 z-40 flex w-80 max-w-[85vw] flex-col border-r border-black/15 bg-white shadow-2xl transition-transform duration-300 ease-in-out font-sans ${
          isHistoryOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-3.5 shrink-0 bg-zinc-50">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-zinc-500" />
            <span className="text-sm font-bold text-black tracking-wide">Previous Chats</span>
          </div>
          <button
            type="button"
            onClick={() => setIsHistoryOpen(false)}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-black transition cursor-pointer"
            title="Close panel"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2.5 border-b border-black/8 shrink-0">
          <div className="relative flex items-center">
            <Search className="absolute left-2.5 size-3.5 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Search conversations…"
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-1.5 pl-8 pr-7 text-xs text-black placeholder:text-zinc-400 outline-none focus:border-black focus:bg-white transition"
            />
            {historySearch && (
              <button
                type="button"
                onClick={() => setHistorySearch('')}
                className="absolute right-2 text-zinc-400 hover:text-black transition cursor-pointer"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>

        {/* New conversation shortcut inside panel */}
        <div className="px-3 py-2 border-b border-slate-100 shrink-0">
          <button
            type="button"
            onClick={() => {
              setIsHistoryOpen(false)
              if (onNewChat) onNewChat()
              else { setActiveThreadId(null); setMessages([]); setDraft('') }
            }}
            className="flex w-full items-center gap-2 rounded-xl border border-dashed border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-800 hover:border-emerald-500 hover:text-emerald-950 hover:bg-emerald-50 transition cursor-pointer"
          >
            <Plus className="size-3.5" />
            New conversation
          </button>
        </div>

        {/* Thread list — scrollable */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {filteredThreads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <MessageSquare className="size-8 text-slate-300 mb-2" />
              <p className="text-xs text-slate-400">
                {historySearch ? 'No conversations match.' : 'No conversations yet.'}
              </p>
            </div>
          ) : (
            filteredThreads.map((t) => (
              <ThreadRow
                key={t.id}
                thread={t}
                isActive={t.id === threadId}
                onSelect={(id) => {
                  handleSelectThread(id)
                  setIsHistoryOpen(false)
                }}
                onRename={onRenameThread}
                onDelete={onDeleteThread}
              />
            ))
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════
          MAIN CHAT AREA
      ════════════════════════════════════════════════════ */}
      <div className="flex flex-1 min-w-0 flex-col overflow-hidden bg-white">

        {/* ── Compact AI Tutor Header ─────────────────── */}
        <div className="flex items-center justify-between border-b border-slate-200/80 bg-white px-5 py-2.5 shrink-0 font-sans">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setIsHistoryOpen((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                isHistoryOpen
                  ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900'
              }`}
              title={isHistoryOpen ? 'Hide conversations' : 'Show conversations'}
            >
              <Clock className="size-3" />
              <span>Previous Chats</span>
              <ChevronRight className={`size-3 transition-transform duration-200 ${
                isHistoryOpen ? 'rotate-180' : ''
              }`} />
            </button>

            <span className="text-slate-300">│</span>
            <span className="text-xs font-bold text-slate-900 font-heading">AI Tutor</span>
            {currentThread && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-xs text-slate-500 truncate max-w-[200px]" title={currentThread.title}>
                  {currentThread.title}
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setIsHistoryOpen(false)
              if (onNewChat) onNewChat()
              else { setActiveThreadId(null); setMessages([]); setDraft('') }
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition cursor-pointer shadow-xs"
          >
            <Plus className="size-3" />
            <span>New chat</span>
          </button>
        </div>

      {/* ── Scrollable Message List ─────────────── */}
      <div ref={messageListRef} onScroll={handleMessageListScroll} className="min-h-0 flex-1 overflow-y-auto font-sans bg-canvas">
        <div className="flex w-full flex-col px-6 py-10">

          {isLoadingHistory ? (
            <HistorySkeleton />
          ) : messages.length === 0 ? (
            /* Empty state */
            <div className="my-auto py-16 animate-fade-in">
              <span className="mb-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-200">
                AI Tutor
              </span>
              <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                Start a conversation
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
                Ask questions about your course materials, explore concepts, or request practice problems.
              </p>
              <div className="mt-8 flex flex-wrap gap-2">
                {[
                  'Explain this concept simply',
                  'Quiz me on this topic',
                  'Give me study tips',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => { setDraft(suggestion); textareaRef.current?.focus() }}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-900 cursor-pointer"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {messages.map((message, index) => {
                const isInsufficientEvidence = (message.response_type || message.responseType) === 'insufficient_evidence'

                if (message.role === 'user') {
                  return (
                    <article
                      key={message.id ?? `${message.role}-${index}`}
                      className="study-message-user flex justify-end gap-3 animate-fade-in"
                    >
                      <div className="max-w-[75%] rounded-2xl bg-emerald-700 px-4 py-3 text-sm leading-[1.65] text-white shadow-xs">
                        {message.content}
                      </div>
                      <span className="study-chat-avatar study-chat-avatar-user" aria-label="You"><UserRound size={18} aria-hidden="true" /></span>
                    </article>
                  )
                }

                /* ── Assistant message: NO outer bubble, clean doc-like layout ── */
                return (
                  <article
                    key={message.id ?? `${message.role}-${index}`}
                    className="study-message-assistant flex items-start gap-3 animate-fade-in"
                  >
                    {/* Avatar badge */}
                    <div className="study-chat-avatar" aria-label="StudyMate assistant">
                      <BookOpen size={19} aria-hidden="true" />
                    </div>

                    {/* Content — no outer card/bubble */}
                    <div className="min-w-0 flex-1">
                      {(() => {
                        const { body, parsedSources } = parseBodyAndSources(message.content)

                        if (isInsufficientEvidence) {
                          return (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-amber-900">
                                <AlertTriangleIcon className="size-4 shrink-0 text-amber-700" />
                                <span>Not enough evidence in your documents</span>
                              </div>
                              <div className="text-sm text-slate-900 leading-relaxed">
                                <MarkdownMessage content={body} />
                              </div>
                              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-3.5 text-xs text-slate-600 space-y-1">
                                <p className="font-semibold text-slate-900">💡 Suggested next steps</p>
                                <p>Upload lecture notes or textbook chapters covering this topic, or refine your question to match the content in your active documents.</p>
                              </div>
                            </div>
                          )
                        }

                        return (
                          <>
                            <MarkdownMessage content={body} />
                            {message.isStreaming && <StreamingCursor />}

                            {message.toolStatus && (
                              <div className="mt-3 border-t border-slate-100 pt-2">
                                <ToolStatusIndicator
                                  message={message.toolStatus.message}
                                  detail={message.toolStatus.detail}
                                />
                              </div>
                            )}

                            <CitationBadges
                              sources={message.sources ?? []}
                              parsedSources={parsedSources}
                            />
                          </>
                        )
                      })()}
                    </div>
                  </article>
                )
              })}

              {isSending && !isStreamingResponse && <ThinkingIndicator />}
            </div>
          )}

          </div>
        </div>

        {/* ── Fixed Input bar ──────────────────────────────── */}
        <div className="shrink-0 border-t border-slate-200/80 bg-white px-6 py-4 font-sans">
          <div className="w-full">
            {error && (
              <p className="mb-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>
            )}
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xs transition-colors focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500">
              <textarea
                ref={textareaRef}
                id="chat-input"
                aria-label="Message StudyMate"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message StudyMate…"
                rows={1}
                disabled={isSending || isLoadingHistory}
                className="block w-full resize-none bg-transparent px-2 py-1 text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                style={{ minHeight: '40px', maxHeight: '180px' }}
              />
              <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-xs text-slate-400">Enter to send · Shift + Enter for new line</span>
                <button
                  id="send-message-btn"
                  type="button"
                  onClick={() => void sendMessage()}
                  disabled={!draft.trim() || isSending || isLoadingHistory}
                  className="rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                >
                  {isSending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>{/* end main chat area */}
    </section>
  )
}

export default ChatWindow
