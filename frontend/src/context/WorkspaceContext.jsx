import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'

const WorkspaceContext = createContext(null)

export function WorkspaceProvider({ children, value = {} }) {
  const { user } = useAuth()
  const [activeWorkspace, setActiveWorkspace] = useState('overview')
  const [activeThreadIdInternal, setActiveThreadIdInternal] = useState(null)
  const [quizPrefill, setQuizPrefill] = useState(null)
  const [flashcardPrefill, setFlashcardPrefill] = useState(null)
  const [progressData, setProgressData] = useState(null)
  const [quizData, setQuizData] = useState(null)
  const [flashcardData, setFlashcardData] = useState(null)
  const [planData, setPlanData] = useState(null)

  // Space → Project state
  const [spaces, setSpaces] = useState([])
  const [activeSpaceId, setActiveSpaceId] = useState(null)
  const [activeProjectId, setActiveProjectId] = useState(null)
  const [progressVersion, setProgressVersion] = useState(0)

  const resetWorkspaceState = useCallback(() => {
    setActiveWorkspace('overview'); setActiveThreadIdInternal(null); setQuizPrefill(null)
    setFlashcardPrefill(null); setProgressData(null); setQuizData(null); setFlashcardData(null)
    setPlanData(null); setSpaces([]); setActiveSpaceId(null); setActiveProjectId(null)
    setProgressVersion((v) => v + 1)
  }, [])

  useEffect(() => { resetWorkspaceState() }, [user?.id, resetWorkspaceState])

  const refreshProgress = useCallback(() => {
    setProgressVersion((v) => v + 1)
  }, [])

  const activeThreadId = value?.activeThreadId ?? activeThreadIdInternal
  const setActiveThreadId = value?.setActiveThreadId ?? setActiveThreadIdInternal

  const handleUsePlanTopic = useCallback((targetWorkspace, topic, docId, options = {}) => {
    const prefillPayload = {
      documentId: docId || options.documentId || '',
      documentName: options.documentName || '',
      topic: topic || '',
      difficulty: options.difficulty || 'medium',
      numQuestions: options.numQuestions || 10,
      quizMode: options.quizMode || 'topic',
      source: options.source || 'study-progress',
    }

    if (targetWorkspace === 'quiz') {
      setQuizData(null) // Clear active quiz data to ensure weak topic setup form is shown immediately
      setQuizPrefill(prefillPayload)
      setActiveWorkspace('quiz')
    } else if (targetWorkspace === 'flashcards') {
      setFlashcardData(null) // Clear active flashcard data
      setFlashcardPrefill({
        documentId: docId || options.documentId || '',
        topic: topic || '',
        numCards: 10,
      })
      setActiveWorkspace('flashcards')
    }
  }, [])

  const contextValue = {
    // Merge external value first so internal state is the primary authority
    ...(value || {}),
    // Space / Project
    spaces,
    setSpaces,
    activeSpaceId,
    setActiveSpaceId,
    activeProjectId,
    setActiveProjectId,
    // Workspace tabs
    activeWorkspace,
    setActiveWorkspace,
    activeThreadId,
    setActiveThreadId,
    quizPrefill,
    setQuizPrefill,
    flashcardPrefill,
    setFlashcardPrefill,
    progressData,
    setProgressData,
    quizData,
    setQuizData,
    flashcardData,
    setFlashcardData,
    planData,
    setPlanData,
    handleUsePlanTopic,
    progressVersion,
    refreshProgress,
    resetWorkspaceState,
  }

  return (
    <WorkspaceContext.Provider value={contextValue}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider')
  }
  return context
}
