import { useCallback, useEffect, useState } from 'react'
import { getDocuments, getThreads, removeThread, renameThread } from './api/client'
import ChatWindow from './components/ChatWindow'
import DocumentPanel from './components/DocumentPanel'
import RagDebugPanel from './components/RagDebugPanel'
import StudyLogPanel from './components/StudyLogPanel'
import ThreadSidebar from './components/ThreadSidebar'
import FlashcardsWorkspace from './components/workspace/FlashcardsWorkspace'
import QuizWorkspace from './components/workspace/QuizWorkspace'
import PlannerWorkspace from './components/workspace/PlannerWorkspace'
import WorkspaceErrorBoundary from './components/WorkspaceErrorBoundary'

/* ── Utility panel tab config (Student workspace) ────────── */
const TABS = [
  {
    id: 'documents',
    label: 'Documents',
    icon: (
      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
      </svg>
    ),
  },
  {
    id: 'quiz',
    label: 'Quiz',
    icon: (
      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6m-6 4h6m-6 4h4" />
      </svg>
    ),
  },
  {
    id: 'flashcards',
    label: 'Flashcards',
    icon: (
      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2m14 0V9a2 2 0 0 0-2-2M5 11V9a2 2 0 0 1 2-2m0 0V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    id: 'planner',
    label: 'Study Planner',
    icon: (
      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
      </svg>
    ),
  },
  {
    id: 'studylog',
    label: 'Study Log',
    icon: (
      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0z" />
      </svg>
    ),
  },
]

if (import.meta.env.DEV) {
  TABS.push({
    id: 'debug',
    label: 'RAG Debug',
    icon: (
      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0 0 21 17.25l-5.83-5.83M15 15l-3-3m-4.5 1.5a4.5 4.5 0 1 1 6.36-6.36 4.5 4.5 0 0 1-6.36 6.36z" />
      </svg>
    ),
  })
}

/* ── Close button icon ──────────────────────────────────── */
function CloseIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function SidebarOpenIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
    </svg>
  )
}

/* ── App ────────────────────────────────────────────────── */
function App() {
  const [activeThreadId, setActiveThreadId] = useState(null)
  const [activeTab, setActiveTab] = useState('documents')
  const [chatResetKey, setChatResetKey] = useState(0)
  const [isLoadingThreads, setIsLoadingThreads] = useState(true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isUtilityPanelOpen, setIsUtilityPanelOpen] = useState(false)
  const [isWorkspaceExpanded, setIsWorkspaceExpanded] = useState(false)
  const [threadError, setThreadError] = useState('')
  const [threads, setThreads] = useState([])
  const [documents, setDocuments] = useState([])
  const [quizData, setQuizData] = useState(null)
  const [flashcardData, setFlashcardData] = useState(null)
  const [planData, setPlanData] = useState(null)
  const [activeDocumentId, setActiveDocumentId] = useState('')
  const [quizPrefill, setQuizPrefill] = useState({ documentId: '', topic: '', difficulty: 'medium', numQuestions: 10 })
  const [flashcardPrefill, setFlashcardPrefill] = useState({ documentId: '', topic: '' })

  const loadThreads = useCallback(async () => {
    setIsLoadingThreads(true)
    setThreadError('')
    try {
      const loadedThreads = await getThreads()
      setThreads(loadedThreads ?? [])
      // If activeThreadId is set but doesn't exist in loadedThreads, clear it
      if (activeThreadId && loadedThreads && !loadedThreads.some((t) => t.id === activeThreadId)) {
        setActiveThreadId(null)
      }
    } catch (error) {
      setThreadError(error.message)
    } finally {
      setIsLoadingThreads(false)
    }
  }, [activeThreadId])

  const handleInvalidThread = useCallback(
    (staleThreadId) => {
      if (activeThreadId === staleThreadId || !staleThreadId) {
        setActiveThreadId(null)
      }
      void loadThreads()
    },
    [activeThreadId, loadThreads]
  )

  useEffect(() => {
    let isCurrent = true

    setIsLoadingThreads(true)
    getThreads()
      .then((loadedThreads) => {
        if (isCurrent) {
          setThreads(loadedThreads ?? [])
        }
      })
      .catch((error) => {
        if (isCurrent) setThreadError(error.message)
      })
      .finally(() => {
        if (isCurrent) setIsLoadingThreads(false)
      })

    return () => {
      isCurrent = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Fetch active thread documents */
  useEffect(() => {
    if (!activeThreadId) {
      setDocuments([])
      return
    }
    let isCurrent = true
    getDocuments(activeThreadId)
      .then((docs) => {
        if (isCurrent) setDocuments(docs ?? [])
      })
      .catch((err) => {
        if (isCurrent) {
          setDocuments([])
          if (err.status === 404 || err.message?.includes('not found')) {
            handleInvalidThread(activeThreadId)
          }
        }
      })
    return () => {
      isCurrent = false
    }
  }, [activeThreadId, handleInvalidThread])

  async function handleRename(threadId, title) {
    try {
      await renameThread(threadId, title)
      await loadThreads()
    } catch (error) {
      setThreadError(error.message)
    }
  }

  async function handleDelete(threadId) {
    try {
      await removeThread(threadId)
      setThreads((currentThreads) => currentThreads.filter((thread) => thread.id !== threadId))
      if (activeThreadId === threadId) setActiveThreadId(null)
    } catch (error) {
      setThreadError(error.message)
    }
  }

  const activeThread = threads.find((thread) => thread.id === activeThreadId)
  function openNewChat() {
    setActiveThreadId(null)
    setChatResetKey((currentKey) => currentKey + 1)
  }

  function selectThread(threadId) {
    setActiveThreadId(threadId)
    setChatResetKey((currentKey) => currentKey + 1)
  }

  async function handleThreadCreated(threadId) {
    setActiveThreadId(threadId)
  }

  /* Handler when tool_result for quiz arrives from chat SSE stream */
  const handleQuizCreated = useCallback((newQuizData) => {
    setQuizData(newQuizData)
    setActiveTab('quiz')
    setIsUtilityPanelOpen(true)
    setIsWorkspaceExpanded(true)   // auto-expand on new tool content
  }, [])

  const handleQuizUpdate = useCallback((refreshedQuizData) => {
    setQuizData(refreshedQuizData)
    // auto-expand on Regenerate (data present), but not on +New (null clears the deck)
    if (refreshedQuizData != null) setIsWorkspaceExpanded(true)
  }, [])

  /* Handler when tool_result for flashcards arrives from chat SSE stream */
  const handleFlashcardsCreated = useCallback((newFlashcardData) => {
    setFlashcardData(newFlashcardData)
    setActiveTab('flashcards')
    setIsUtilityPanelOpen(true)
    setIsWorkspaceExpanded(true)   // auto-expand on new tool content
  }, [])

  const handleFlashcardsUpdate = useCallback((refreshedData) => {
    setFlashcardData(refreshedData)
    // auto-expand on Regenerate (data present), but not on +New (null clears the deck)
    if (refreshedData != null) setIsWorkspaceExpanded(true)
  }, [])

  const handlePlanUpdate = useCallback((plan) => { setPlanData(plan); if (plan) setIsWorkspaceExpanded(true) }, [])
  const handlePlanCreated = useCallback((plan) => { setPlanData(plan); setActiveTab('planner'); setIsUtilityPanelOpen(true); setIsWorkspaceExpanded(true) }, [])
  const handleUsePlanTopic = useCallback((tab, topic, documentId) => {
    const resolvedDocumentId = documentId || planData?.document_id || ''
    setActiveDocumentId(resolvedDocumentId)
    if (tab === 'quiz') setQuizPrefill({ documentId: resolvedDocumentId, topic, difficulty: 'medium', numQuestions: 10 })
    else setFlashcardPrefill({ documentId: resolvedDocumentId, topic })
    setActiveTab(tab)
    setIsUtilityPanelOpen(true)
  }, [planData])

  /* ── Active panel renderer ──────────────────────────────── */
  function renderPanel() {
    switch (activeTab) {
      case 'documents':
        return <DocumentPanel threadId={activeThreadId} />
      case 'quiz':
        return (
          <QuizWorkspace
            documents={documents}
            isExpanded={isWorkspaceExpanded}
            onQuizUpdate={handleQuizUpdate}
            onToggleExpand={() => setIsWorkspaceExpanded((prev) => !prev)}
            quizData={quizData}
            quizPrefill={quizPrefill}
            threadId={activeThreadId}
          />
        )
      case 'flashcards':
        return (
          <FlashcardsWorkspace
            documents={documents}
            flashcardData={flashcardData}
            flashcardPrefill={flashcardPrefill}
            onFlashcardsUpdate={handleFlashcardsUpdate}
            threadId={activeThreadId}
          />
        )
      case 'planner':
        return <PlannerWorkspace documents={documents} planData={planData} onPlanUpdate={handlePlanUpdate} isExpanded={isWorkspaceExpanded} onToggleExpand={() => setIsWorkspaceExpanded((prev) => !prev)} onUseTopic={handleUsePlanTopic} />
      case 'studylog':
        return <StudyLogPanel threadId={activeThreadId} />
      case 'debug':
        return <RagDebugPanel threadId={activeThreadId} />
      default:
        return null
    }
  }

  return (
    <main className="h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="flex h-full w-full overflow-hidden">
        {/* Left Sidebar */}
        {isSidebarOpen && (
          <ThreadSidebar
            activeThreadId={activeThreadId}
            error={threadError}
            isLoading={isLoadingThreads}
            onClose={() => setIsSidebarOpen(false)}
            onCreate={openNewChat}
            onDelete={handleDelete}
            onRename={handleRename}
            onSelect={selectThread}
            threads={threads}
          />
        )}

        {/* Center Main Section */}
        <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
          {/* Header */}
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950/70 px-4 backdrop-blur md:px-8">
            <div className="flex items-center gap-3">
              {/* Left sidebar expand toggle button when sidebar is collapsed */}
              {!isSidebarOpen && (
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:text-white"
                  title="Open sidebar"
                  aria-label="Open sidebar"
                >
                  <SidebarOpenIcon />
                  <span className="hidden sm:inline">Sidebar</span>
                </button>
              )}

              <div>
                <p className="text-sm font-semibold text-white">
                  {activeThread?.title ?? 'New Chat'}
                </p>
                <p className="text-xs text-slate-500">Ask questions about your study topics or uploaded PDFs</p>
              </div>
            </div>

            <button
              id="utility-panel-toggle"
              type="button"
              onClick={() => setIsUtilityPanelOpen((isOpen) => !isOpen)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                isUtilityPanelOpen
                  ? 'border-violet-500/50 bg-violet-500/10 text-violet-300'
                  : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white'
              }`}
            >
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              {isUtilityPanelOpen ? 'Hide tools' : 'Open tools'}
            </button>
          </header>

          {/* Body Container */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Chat Area */}
            <ChatWindow
              onFlashcardsCreated={handleFlashcardsCreated}
              onPlanCreated={handlePlanCreated}
              onInvalidThread={handleInvalidThread}
              onQuizCreated={handleQuizCreated}
              onResponse={loadThreads}
              onThreadCreated={handleThreadCreated}
              resetKey={chatResetKey}
              threadId={activeThreadId}
            />

            {/* Utility Panel */}
            {isUtilityPanelOpen && (
              <aside
                id="utility-panel"
                style={{
                  width: isWorkspaceExpanded && (activeTab === 'quiz' || activeTab === 'flashcards' || activeTab === 'planner') ? '600px' : '352px',
                  maxWidth: '55vw',
                }}
                className="hidden h-full shrink-0 flex-col overflow-hidden border-l border-slate-800 bg-slate-900/50 transition-all duration-300 ease-in-out lg:flex"
              >
                {/* Tab Bar */}
                <div className="flex shrink-0 items-end gap-2 border-b border-slate-800 bg-slate-950/60 pl-3 pt-3">
                  <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
                    {TABS.map((tab) => (
                      <button
                        key={tab.id}
                        id={`tab-${tab.id}`}
                        type="button"
                        disabled={tab.disabled}
                        onClick={() => !tab.disabled && setActiveTab(tab.id)}
                        className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2 text-xs font-medium transition ${
                          tab.disabled
                            ? 'cursor-not-allowed border-transparent text-slate-600 opacity-50'
                            : activeTab === tab.id
                            ? 'border-violet-400 bg-slate-900/80 text-violet-300'
                            : 'border-transparent text-slate-500 hover:bg-slate-800/40 hover:text-slate-300'
                        }`}
                      >
                        {tab.icon}
                        {tab.label}
                        {tab.badge && (
                          <span className="ml-1 rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
                            {tab.badge}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  {/* Close button */}
                  <button
                    type="button"
                    onClick={() => setIsUtilityPanelOpen(false)}
                    className="mb-1 mr-3 shrink-0 rounded p-1 text-slate-600 transition hover:bg-slate-800 hover:text-slate-400"
                    aria-label="Close tools panel"
                  >
                    <CloseIcon />
                  </button>
                </div>

                {/* Panel Body */}
                <div className="flex-1 min-h-0 overflow-y-auto p-4">
                  <WorkspaceErrorBoundary resetKey={activeTab}>
                    {renderPanel()}
                  </WorkspaceErrorBoundary>
                </div>
              </aside>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

export default App
