import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getProjectDocuments, getThreads, removeThread, renameThread, getProject, getSpaces } from '../../api/client'
import { getStudyProgress } from '../../lib/progressApi'
import { useWorkspace } from '../../context/WorkspaceContext'
import ProjectSidebar from '../Sidebar/ProjectSidebar'
import ProjectToolsPanel from '../Sidebar/ProjectToolsPanel'
import WorkspaceRouter from '../WorkspaceRouter'
import TopBar from '../Header/TopBar'
import '../../styles/project-theme.css'
import { WORKSPACE_TOOLS } from '../../config/toolRegistry'

export default function ProjectWorkspace({ tool: toolProp }) {
  const { projectId, tool: urlTool, '*': subpath } = useParams()
  const navigate = useNavigate()

  const {
    activeProjectId,
    setActiveProjectId,
    activeWorkspace,
    setActiveWorkspace,
    setProgressData,
    activeThreadId,
    setActiveThreadId,
    progressVersion,
  } = useWorkspace()

  const [project, setProject] = useState(null)
  const [threads, setThreads] = useState([])
  const [documents, setDocuments] = useState([])
  const [chatResetKey, setChatResetKey] = useState(0)
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false)
  const [toolsCollapsed, setToolsCollapsed] = useState(false)

  // 1. Synchronize URL route param (projectId) with WorkspaceContext
  useEffect(() => {
    if (projectId && projectId !== activeProjectId) {
      setActiveProjectId(projectId)
    }
  }, [projectId, activeProjectId, setActiveProjectId])

  // 2. Synchronize active workspace tool based on props or URL
  useEffect(() => {
    let targetTool = toolProp || urlTool
    if (!targetTool && subpath) {
      targetTool = subpath.split('/')[0]
    }
    if (targetTool === 'study-plan') {
      targetTool = 'planner'
    }
    if (targetTool === 'analytics') {
      targetTool = 'progress'
    }
    if (targetTool && WORKSPACE_TOOLS.some((t) => t.id === targetTool) && targetTool !== activeWorkspace) {
      setActiveWorkspace(targetTool)
    }
  }, [toolProp, urlTool, subpath, activeWorkspace, setActiveWorkspace])

  // 3. Fetch project and space details for breadcrumbs and sidebar
  useEffect(() => {
    let isMounted = true
    const currentId = projectId || activeProjectId
    if (!currentId) return

    async function loadProjectDetails() {
      try {
        const [proj, spaces] = await Promise.all([
          getProject(currentId).catch(() => null),
          getSpaces(false).catch(() => []),
        ])

        if (!isMounted) return

        if (proj) {
          const parentSpace = spaces?.find((s) => s.id === proj.space_id)
          setProject({
            ...proj,
            space_name: parentSpace?.name || 'Space',
          })
        } else if (spaces && spaces.length > 0) {
          // Fallback: search spaces for project
          for (const s of spaces) {
            const found = s.projects?.find((p) => p.id === currentId)
            if (found) {
              setProject({
                ...found,
                space_name: s.name,
                space_id: s.id,
              })
              break
            }
          }
        }
      } catch {
        /* ignore */
      }
    }

    void loadProjectDetails()
    return () => {
      isMounted = false
    }
  }, [projectId, activeProjectId])

  /* Load threads scoped to the active project */
  const loadThreads = useCallback(
    async (targetProjectId = activeProjectId || projectId) => {
      if (!targetProjectId) {
        setThreads([])
        return
      }
      try {
        const data = await getThreads(targetProjectId)
        setThreads(data)
      } catch {
        setThreads([])
      }
    },
    [activeProjectId, projectId]
  )

  const loadDocuments = useCallback(
    async (targetProjectId = activeProjectId || projectId) => {
      if (!targetProjectId) {
        setDocuments([])
        return
      }
      try {
        const data = await getProjectDocuments(targetProjectId)
        setDocuments(data)
      } catch {
        setDocuments([])
      }
    },
    [activeProjectId, projectId]
  )

  /* Load user progress — scoped to the active project */
  const loadProgress = useCallback(
    async (targetProjectId = activeProjectId || projectId) => {
      if (!targetProjectId) return
      try {
        const data = await getStudyProgress(targetProjectId)
        if (data) setProgressData(data)
      } catch {
        /* ignore */
      }
    },
    [activeProjectId, projectId, setProgressData]
  )

  /* When the active project changes, reload threads and progress */
  useEffect(() => {
    const currId = activeProjectId || projectId
    if (currId) {
      void loadThreads(currId)
      void loadProgress(currId)
      // Clear the active thread so the user isn't stuck on a cross-project thread
      setActiveThreadId(null)
      setChatResetKey((prev) => prev + 1)
    }
  }, [activeProjectId, projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Reload progress when quiz submission triggers refresh */
  useEffect(() => {
    const currId = activeProjectId || projectId
    if (currId && progressVersion > 0) {
      void loadProgress(currId)
    }
  }, [progressVersion, activeProjectId, projectId, loadProgress])

  useEffect(() => { void loadDocuments() }, [loadDocuments])

  /* Thread actions */
  function handleNewChat() {
    setActiveWorkspace('chat')
    setActiveThreadId(null)
    setChatResetKey((prev) => prev + 1)
    navigate(`/projects/${projectId || activeProjectId}/chat`)
  }

  function handleSelectThread(id) {
    setActiveWorkspace('chat')
    setActiveThreadId(id)
    setChatResetKey((prev) => prev + 1)
    navigate(`/projects/${projectId || activeProjectId}/chat`)
  }

  const handleThreadCreated = useCallback((newId) => {
    setActiveThreadId(newId)
    void loadThreads()
  }, [loadThreads])

  async function handleRenameThread(threadId, newTitle) {
    try {
      await renameThread(threadId, newTitle)
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, title: newTitle } : t))
      )
    } catch (err) {
      alert(`Failed to rename thread: ${err.message}`)
    }
  }

  async function handleDeleteThread(threadId) {
    try {
      await removeThread(threadId)
      setThreads((prev) => prev.filter((t) => t.id !== threadId))
      if (activeThreadId === threadId) {
        handleNewChat()
      }
    } catch (err) {
      alert(`Failed to delete thread: ${err.message}`)
    }
  }

  const handleInvalidThread = useCallback(
    (invalidId) => {
      setThreads((prev) => prev.filter((t) => t.id !== invalidId))
      if (activeThreadId === invalidId) {
        setActiveThreadId(null)
        setChatResetKey((prev) => prev + 1)
      }
    },
    [activeThreadId, setActiveThreadId]
  )

  return (
    <main
      className="study-workspace h-screen w-full overflow-hidden bg-[var(--color-ink)] text-[var(--color-parchment)] font-sans"
    >
      <div className="flex h-full w-full overflow-hidden">
        {/* Main Content Area */}
        <div className="relative flex flex-1 flex-col overflow-hidden bg-[var(--color-ink)]">
          {/* Header Bar */}
          <TopBar project={project} />
          <div className="project-three-panel flex min-h-0 flex-1 overflow-hidden">
            <ProjectSidebar
              projectId={activeProjectId || projectId}
              project={project}
              documents={documents}
              collapsed={sourcesCollapsed}
              onToggle={() => setSourcesCollapsed((value) => !value)}
            />
            <div className="min-w-0 flex flex-1 overflow-hidden">
              <WorkspaceRouter
                documents={documents}
                loadDocuments={loadDocuments}
                threads={threads}
                loadThreads={loadThreads}
                onSelectThread={handleSelectThread}
                onRenameThread={handleRenameThread}
                onDeleteThread={handleDeleteThread}
                onNewChat={handleNewChat}
                handleInvalidThread={handleInvalidThread}
                handleThreadCreated={handleThreadCreated}
                chatResetKey={chatResetKey}
                activeProjectId={activeProjectId || projectId}
              />
            </div>
            <ProjectToolsPanel
              projectId={activeProjectId || projectId}
              collapsed={toolsCollapsed}
              onToggle={() => setToolsCollapsed((value) => !value)}
            />
          </div>
        </div>
      </div>
    </main>
  )
}
