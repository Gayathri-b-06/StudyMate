import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import HomePage from '../pages/HomePage'
import OverviewWorkspace from './workspace/OverviewWorkspace'
import ChatWindow from './ChatWindow'
import DocumentPanel from './DocumentPanel'
import QuizWorkspace from './workspace/QuizWorkspace'
import FlashcardsWorkspace from './workspace/FlashcardsWorkspace'
import AnalyticsWorkspace from './workspace/ProgressWorkspace'
import PlannerWorkspace from './workspace/PlannerWorkspace'
import WorkspaceErrorBoundary from './WorkspaceErrorBoundary'

export default function WorkspaceRouter({
  documents = [],
  loadDocuments,
  threads = [],
  loadThreads,
  onSelectThread,
  onRenameThread,
  onDeleteThread,
  onNewChat,
  handleInvalidThread,
  handleThreadCreated,
  chatResetKey,
  activeProjectId = null,
}) {
  const navigate = useNavigate()
  const {
    activeWorkspace,
    setActiveWorkspace,
    activeThreadId,
    quizData,
    quizPrefill,
    flashcardData,
    flashcardPrefill,
    planData,
    handleUsePlanTopic,
    setQuizData,
    setFlashcardData,
    setPlanData,
  } = useWorkspace()

  const openPlanTopic = (targetWorkspace, topic, documentId, options) => {
    handleUsePlanTopic(targetWorkspace, topic, documentId, options)
    if (activeProjectId) {
      navigate(`/projects/${encodeURIComponent(activeProjectId)}/${targetWorkspace}`)
    }
  }

  // Workspace Framer Motion Transition Variant
  const transitionVariants = {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.18, ease: 'easeOut' } },
    exit: { opacity: 0, y: -6, transition: { duration: 0.15, ease: 'easeIn' } },
  }

  return (
    <div className={`project-feature-workspace workspace-${activeWorkspace} relative flex-1 h-full w-full overflow-hidden bg-[var(--color-ink)]`}>
      {/* -1. Global Home Dashboard Workspace */}
      {activeWorkspace === 'home' && <div className="flex flex-col h-full w-full overflow-y-auto">
        <motion.div
          key="home-panel"
          variants={transitionVariants}
          initial="initial"
          animate={activeWorkspace === 'home' ? 'animate' : 'initial'}
          className="h-full w-full"
        >
          <WorkspaceErrorBoundary activeTab="home">
            <HomePage />
          </WorkspaceErrorBoundary>
        </motion.div>
      </div>}

      {/* 0. Overview Workspace */}
      {activeWorkspace === 'overview' && <div className="flex flex-col h-full w-full">
        <motion.div
          key="overview-panel"
          variants={transitionVariants}
          initial="initial"
          animate={activeWorkspace === 'overview' ? 'animate' : 'initial'}
          className="h-full w-full"
        >
          <WorkspaceErrorBoundary activeTab="overview">
            <OverviewWorkspace />
          </WorkspaceErrorBoundary>
        </motion.div>
      </div>}

      {/* 1. Chat Workspace */}
      {activeWorkspace === 'chat' && <div className="flex flex-col h-full w-full">
        <motion.div
          key="chat-panel"
          variants={transitionVariants}
          initial="initial"
          animate={activeWorkspace === 'chat' ? 'animate' : 'initial'}
          className="h-full w-full flex flex-col"
        >
          <WorkspaceErrorBoundary activeTab="chat">
            <ChatWindow
              threads={threads}
              onSelectThread={onSelectThread}
              onRenameThread={onRenameThread}
              onDeleteThread={onDeleteThread}
              onNewChat={onNewChat}
              onFlashcardsCreated={setFlashcardData}
              onPlanCreated={setPlanData}
              onInvalidThread={handleInvalidThread}
              onQuizCreated={setQuizData}
              onQuizTopic={(topic) => handleUsePlanTopic('quiz', topic)}
              onResponse={loadThreads}
              onThreadCreated={handleThreadCreated}
              resetKey={chatResetKey}
              threadId={activeThreadId}
              projectId={activeProjectId}
            />
          </WorkspaceErrorBoundary>
        </motion.div>
      </div>}

      {/* 2. Documents Workspace */}
      {activeWorkspace === 'documents' && <div className="flex flex-col h-full w-full p-4 overflow-y-auto">
        <motion.div
          key="documents-panel"
          variants={transitionVariants}
          initial="initial"
          animate={activeWorkspace === 'documents' ? 'animate' : 'initial'}
          className="h-full w-full"
        >
          <WorkspaceErrorBoundary activeTab="documents">
            <DocumentPanel
              documents={documents}
              onDocumentUploaded={loadDocuments}
              projectId={activeProjectId}
            />
          </WorkspaceErrorBoundary>
        </motion.div>
      </div>}

      {/* 3. Quiz Workspace */}
      {activeWorkspace === 'quiz' && <div className="flex flex-col h-full w-full overflow-y-auto">
        <motion.div
          key="quiz-panel"
          variants={transitionVariants}
          initial="initial"
          animate={activeWorkspace === 'quiz' ? 'animate' : 'initial'}
          className="h-full w-full"
        >
          <WorkspaceErrorBoundary activeTab="quiz">
            <QuizWorkspace
              documents={documents}
              quizData={quizData}
              quizPrefill={quizPrefill}
              threadId={activeThreadId}
              projectId={activeProjectId}
              onQuizUpdate={setQuizData}
            />
          </WorkspaceErrorBoundary>
        </motion.div>
      </div>}

      {/* 4. Flashcards Workspace */}
      {activeWorkspace === 'flashcards' && <div className="flex flex-col h-full w-full overflow-y-auto">
        <motion.div
          key="flashcards-panel"
          variants={transitionVariants}
          initial="initial"
          animate={activeWorkspace === 'flashcards' ? 'animate' : 'initial'}
          className="h-full w-full"
        >
          <WorkspaceErrorBoundary activeTab="flashcards">
            <FlashcardsWorkspace
              documents={documents}
              flashcardData={flashcardData}
              flashcardPrefill={flashcardPrefill}
              onFlashcardsUpdate={(updated) => setFlashcardData((prev) => (prev ? { ...prev, ...updated } : updated))}
              threadId={activeThreadId}
              projectId={activeProjectId}
            />
          </WorkspaceErrorBoundary>
        </motion.div>
      </div>}

      {/* Project analytics remains a normal tool; it is not used by AI Tutor status answers. */}
      {activeWorkspace === 'progress' && <div className="flex flex-col h-full w-full overflow-y-auto">
        <motion.div key="analytics-panel" variants={transitionVariants} initial="initial" animate="animate" className="h-full w-full">
          <WorkspaceErrorBoundary activeTab="analytics">
            <AnalyticsWorkspace projectId={activeProjectId} onUseTopic={handleUsePlanTopic} />
          </WorkspaceErrorBoundary>
        </motion.div>
      </div>}

      {/* 5. Study Plan Workspace */}
      {activeWorkspace === 'planner' && <div className="flex flex-col h-full w-full overflow-y-auto p-4">
        <motion.div
          key="planner-panel"
          variants={transitionVariants}
          initial="initial"
          animate={activeWorkspace === 'planner' ? 'animate' : 'initial'}
          className="h-full w-full"
        >
          <WorkspaceErrorBoundary activeTab="planner">
            <PlannerWorkspace
              documents={documents}
              planData={planData}
              onPlanUpdate={setPlanData}
              onUseTopic={openPlanTopic}
            />
          </WorkspaceErrorBoundary>
        </motion.div>
      </div>}
    </div>
  )
}
