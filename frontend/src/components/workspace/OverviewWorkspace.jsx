import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Sparkles,
  ArrowRight,
  Brain,
  Award,
  Activity,
  MessageSquare,
  HelpCircle,
  Clock,
  Target,
  FileText,
  Upload,
  BookOpen,
  CheckCircle2,
  FolderOpen,
  Layers,
} from 'lucide-react'
import {
  getStudyProgress,
  getProjectMastery,
  getProjectRecommendations,
} from '../../lib/progressApi'
import { getThreads, getProject, getDocuments } from '../../api/client'
import { useWorkspace } from '../../context/WorkspaceContext'
import { CountUp } from '../common/StudyWidgets'
import {
  getProjectToolPath,
  getRecommendationAction,
  getContinueLearningAction,
} from '../../utils/overviewNavigation'

export default function OverviewWorkspace() {
  const { projectId: routeProjectId } = useParams()
  const navigate = useNavigate()

  const {
    activeProjectId,
    spaces,
    setActiveWorkspace,
    setActiveThreadId,
    activeThreadId,
    quizData,
    progressVersion,
  } = useWorkspace()

  // Project context is strictly anchored to the active or route-specified project
  const currentProjectId = routeProjectId || activeProjectId

  const [isLoading, setIsLoading] = useState(false)
  const [projectData, setProjectData] = useState(null)
  const [progressData, setProgressData] = useState(null)
  const [masteryList, setMasteryList] = useState([])
  const [recommendations, setRecommendations] = useState([])
  const [threads, setThreads] = useState([])
  const [documents, setDocuments] = useState([])
  const [fetchErrors, setFetchErrors] = useState({})

  // Find active project and space meta for friendly header display
  const activeProjectMeta = useMemo(() => {
    if (!currentProjectId || !spaces?.length) return null
    for (const space of spaces) {
      const proj = space.projects?.find?.((p) => p.id === currentProjectId)
      if (proj) return { ...proj, spaceName: space.name }
    }
    return null
  }, [currentProjectId, spaces])

  // Greeting based on time of day
  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 12) return 'Good morning'
    if (hour >= 12 && hour < 18) return 'Good afternoon'
    return 'Good evening'
  }, [])

  // Robust project workspace navigation preserving projectId
  const goToTool = useCallback(
    (tool, threadId = null) => {
      if (!currentProjectId) return
      if (threadId) {
        setActiveThreadId(threadId)
      }
      const toolId = tool === 'study-plan' ? 'planner' : tool
      setActiveWorkspace(toolId)
      navigate(getProjectToolPath(currentProjectId, tool))
    },
    [currentProjectId, setActiveWorkspace, setActiveThreadId, navigate]
  )

  // Load all project-scoped data
  useEffect(() => {
    if (!currentProjectId) {
      setProjectData(null)
      setProgressData(null)
      setMasteryList([])
      setRecommendations([])
      setThreads([])
      setDocuments([])
      setFetchErrors({})
      return
    }

    let cancelled = false
    setIsLoading(true)

    Promise.allSettled([
      getProject(currentProjectId),
      getStudyProgress(currentProjectId),
      getProjectMastery(currentProjectId),
      getProjectRecommendations(currentProjectId),
      getThreads(currentProjectId),
    ]).then(async ([projectResult, progressResult, masteryResult, recsResult, threadsResult]) => {
      if (cancelled) return

      const errors = {}

      if (projectResult.status === 'fulfilled') {
        setProjectData(projectResult.value)
      }

      if (progressResult.status === 'fulfilled') {
        setProgressData(progressResult.value)
      } else {
        errors.progress = progressResult.reason?.message || 'Failed to load progress'
      }

      if (masteryResult.status === 'fulfilled') {
        setMasteryList(masteryResult.value?.concepts ?? [])
      } else {
        errors.mastery = masteryResult.reason?.message || 'Failed to load concept mastery'
      }

      if (recsResult.status === 'fulfilled') {
        setRecommendations(recsResult.value?.recommendations ?? [])
      } else {
        errors.recommendations = recsResult.reason?.message || 'Failed to load recommendations'
      }

      let fetchedThreads = []
      if (threadsResult.status === 'fulfilled') {
        fetchedThreads = threadsResult.value ?? []
        setThreads(fetchedThreads)
      } else {
        errors.threads = threadsResult.reason?.message || 'Failed to load threads'
      }

      // Fetch documents across project threads for genuine materials count
      if (fetchedThreads.length > 0) {
        try {
          const docSettled = await Promise.allSettled(
            fetchedThreads.map((t) => getDocuments(t.id))
          )
          if (!cancelled) {
            const allDocs = []
            const seenDocIds = new Set()
            docSettled.forEach((res) => {
              if (res.status === 'fulfilled' && Array.isArray(res.value)) {
                res.value.forEach((doc) => {
                  if (doc?.id && !seenDocIds.has(doc.id)) {
                    seenDocIds.add(doc.id)
                    allDocs.push(doc)
                  }
                })
              }
            })
            setDocuments(allDocs)
          }
        } catch {
          // Non-critical fallback
        }
      } else {
        setDocuments([])
      }

      setFetchErrors(errors)
      setIsLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [currentProjectId, progressVersion])

  // ── Derived Real Metrics ───────────────────────────────────────────────────
  const projectName =
    projectData?.name || activeProjectMeta?.name || 'Current Project'
  const projectDescription =
    projectData?.description ||
    activeProjectMeta?.description ||
    'Build and retain mastery across core concepts through targeted practice and active recall.'
  const spaceName =
    activeProjectMeta?.spaceName || projectData?.space_name || 'Project Workspace'

  const latestThread = threads.length > 0 ? threads[0] : null
  const quizAttempts = progressData?.quiz_attempts ?? []

  // Overall progress percentage (mean of concept masteries, aligned with backend PRD)
  const overallProgress = useMemo(() => {
    if (masteryList.length > 0) {
      const sum = masteryList.reduce((acc, item) => acc + Number(item.score || 0), 0)
      return Math.round(sum / masteryList.length)
    }
    if (quizAttempts.length > 0) {
      const sum = quizAttempts.reduce((acc, q) => acc + Number(q.percentage || 0), 0)
      return Math.round(sum / quizAttempts.length)
    }
    return 0
  }, [masteryList, quizAttempts])

  // Performance uses the project's quiz records when available. Concept mastery
  // is itself updated from those graded attempts, so it is a truthful fallback
  // if the activity feed has not loaded yet. This prevents a project with
  // assessed concepts from being presented as "never quizzed".
  const performance = useMemo(() => {
    if (quizAttempts.length) {
      const sum = quizAttempts.reduce((acc, q) => acc + Number(q.percentage || 0), 0)
      return {
        score: Math.round(sum / quizAttempts.length),
        label: `Quiz average (${quizAttempts.length} ${quizAttempts.length === 1 ? 'test' : 'tests'})`,
      }
    }

    if (masteryList.length) {
      const sum = masteryList.reduce((acc, item) => acc + Number(item.score || 0), 0)
      return {
        score: Math.round(sum / masteryList.length),
        label: 'Performance from assessed concepts',
      }
    }

    return null
  }, [masteryList, quizAttempts])

  // Material counts
  const readyMaterialsCount = useMemo(() => {
    return documents.filter((d) => d.index_status === 'ready' || !d.index_status).length
  }, [documents])

  // Concept counts
  const masteredCount = useMemo(() => {
    return masteryList.filter((item) => Number(item.score) >= 75).length
  }, [masteryList])

  // Important concepts: top 4–6 concepts, prioritizing items needing practice first
  const importantConcepts = useMemo(() => {
    if (!masteryList.length) return []
    const sorted = [...masteryList].sort((a, b) => Number(a.score || 0) - Number(b.score || 0))
    return sorted.slice(0, 6)
  }, [masteryList])

  // Primary recommended next item
  const topRecommendation = useMemo(() => {
    if (recommendations.length > 0) {
      return recommendations[0]
    }
    if (masteryList.length > 0) {
      const lowest = [...masteryList].sort(
        (a, b) => Number(a.score || 0) - Number(b.score || 0)
      )[0]
      if (lowest && Number(lowest.score) < 75) {
        return {
          concept: lowest.concept,
          priority: 1,
          urgency: Number(lowest.score) < 50 ? 'critical' : 'moderate',
          score: Number(lowest.score),
          gap_description: `Current estimated mastery is ${Math.round(lowest.score)}%. Reviewing this topic will yield the biggest score improvement.`,
          action_recommendation: `Take a practice quiz on ${lowest.concept} to strengthen your understanding.`,
          reason: 'Identified as lowest mastery concept in this project.',
        }
      }
    }
    return null
  }, [recommendations, masteryList])

  // Recommendation CTA metadata
  const recommendationCTA = useMemo(() => {
    if (!topRecommendation) return null
    return getRecommendationAction(topRecommendation, currentProjectId)
  }, [topRecommendation, currentProjectId])

  // "Continue Learning" action determined according to PRD Priority Order
  const continueLearningAction = useMemo(() => {
    if (!currentProjectId) return null
    return getContinueLearningAction({
      projectId: currentProjectId,
      activeThreadId,
      threads,
      recommendations,
      quizData,
      documents,
    })
  }, [currentProjectId, activeThreadId, threads, recommendations, quizData, documents])

  // Real combined Activity Timeline
  const recentActivities = useMemo(() => {
    const list = []

    quizAttempts.forEach((attempt, idx) => {
      list.push({
        id: `quiz-${idx}-${attempt.topic}`,
        type: 'quiz',
        title: 'Quiz Completed',
        detail: `${attempt.topic} — ${attempt.formatted_score || `${attempt.score}`}`,
        timestamp: attempt.date ? new Date(attempt.date) : new Date(),
        actionTool: 'quiz',
      })
    })

    threads.forEach((thread) => {
      const threadDate = thread.updated_at || thread.created_at
      list.push({
        id: `thread-${thread.id}`,
        type: 'thread',
        title: 'Discussion with AI Tutor',
        detail: `"${thread.title || 'Untitled Session'}"`,
        timestamp: threadDate ? new Date(threadDate) : new Date(),
        actionTool: 'chat',
        threadId: thread.id,
      })
    })

    documents.forEach((doc) => {
      list.push({
        id: `doc-${doc.id}`,
        type: 'material',
        title: 'Material Ready',
        detail: `${doc.filename} indexed and ready for study`,
        timestamp: doc.uploaded_at ? new Date(doc.uploaded_at) : new Date(),
        actionTool: 'documents',
      })
    })

    list.sort((a, b) => b.timestamp - a.timestamp)
    return list.slice(0, 6)
  }, [quizAttempts, threads, documents])

  // Helper for human-friendly date labels
  const formatActivityDate = (date) => {
    if (!date || isNaN(date.getTime())) return 'Recently'
    const now = new Date()
    const isToday =
      now.getFullYear() === date.getFullYear() &&
      now.getMonth() === date.getMonth() &&
      now.getDate() === date.getDate()

    if (isToday) return 'Today'

    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const isYesterday =
      yesterday.getFullYear() === date.getFullYear() &&
      yesterday.getMonth() === date.getMonth() &&
      yesterday.getDate() === date.getDate()

    if (isYesterday) return 'Yesterday'

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Primary action button click handler
  const handlePrimaryContinue = () => {
    if (!continueLearningAction) return
    goToTool(continueLearningAction.tool, continueLearningAction.threadId)
  }

  // Empty state if no project is selected
  if (!currentProjectId) {
    return (
      <div className="h-full flex items-center justify-center p-8 text-center animate-fade-in font-sans">
        <div className="max-w-md p-8 rounded-2xl border border-slate-200 bg-white space-y-4 shadow-sm">
          <div className="grid size-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 mx-auto">
            <FolderOpen className="size-7" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-900 font-heading">
              Welcome to StudyMate
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Select or create a Project from the left sidebar to access your course materials,
              practice quizzes, AI tutor, and learning progress.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="study-overview h-full overflow-y-auto px-4 py-6 sm:px-8 sm:py-8 md:px-12 md:py-10 max-w-6xl mx-auto space-y-10 font-sans text-slate-900">
      {/* ── 1. PROJECT HEADER ─────────────────────────────────────────────── */}
      <header className="stagger-1 border-b border-slate-200/80 pb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            {/* Space tag / Context */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full font-mono-numbers">
                {spaceName}
              </span>
            </div>

            {/* Project Title (32–40px) */}
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight font-heading">
              {projectName}
            </h1>

            {/* Project Description (15–17px) */}
            <p className="text-[15px] sm:text-[16px] text-slate-600 leading-relaxed">
              {projectDescription}
            </p>

            {/* Primary Action Button */}
            <div className="pt-2">
              <button
                type="button"
                id="overview-continue-learning-btn"
                onClick={handlePrimaryContinue}
                className="inline-flex items-center gap-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 text-sm font-bold transition-all shadow-xs active:scale-[0.99] cursor-pointer"
              >
                {continueLearningAction?.tool === 'documents' && (
                  <Upload className="size-4 shrink-0" />
                )}
                <span>{continueLearningAction?.label || 'Continue Learning'}</span>
                <ArrowRight className="size-4 shrink-0" />
              </button>
              {continueLearningAction?.helperText && (
                <span className="block text-xs text-slate-500 mt-1.5 ml-1">
                  {continueLearningAction.helperText}
                </span>
              )}
            </div>
          </div>

          {/* Progress Stat Highlight */}
          <div className="flex md:flex-col items-baseline md:items-end justify-between md:justify-center border-t md:border-t-0 md:border-l border-slate-200/80 pt-4 md:pt-0 md:pl-8 shrink-0">
            <div className="space-y-1 md:text-right">
              <span className="text-3xl sm:text-4xl font-black font-mono-numbers text-slate-900 leading-none">
                <CountUp end={overallProgress} />%
              </span>
              <span className="block text-sm font-medium text-slate-500">
                Overall Progress
              </span>
            </div>
            {/* Subtle progress indicator */}
            <div className="w-28 md:w-32 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200 mt-2">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${Math.max(0, Math.min(100, overallProgress))}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* ── 2. LEARNING SNAPSHOT ──────────────────────────────────────────── */}
      <section className="stagger-2 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono-numbers">
          Learning Snapshot
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* 1. Overall Progress */}
          <div
            onClick={() => goToTool('progress')}
            className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-2.5 shadow-xs hover:border-emerald-300 transition-colors cursor-pointer group card-lift"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 font-mono-numbers">
                Overall Progress
              </span>
              <ArrowRight className="size-3 text-slate-300 group-hover:text-emerald-700 transition-colors" />
            </div>
            <div className="text-3xl font-black font-mono-numbers text-slate-900 leading-none">
              <CountUp end={overallProgress} />%
            </div>
            <div className="space-y-1">
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden border border-slate-200">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${Math.max(0, Math.min(100, overallProgress))}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 truncate">Concept mastery average</p>
            </div>
          </div>

          {/* 2. Learning Performance */}
          <div
            onClick={() => goToTool('quiz')}
            className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-2.5 shadow-xs hover:border-emerald-300 transition-colors cursor-pointer group card-lift"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 font-mono-numbers">
                Performance
              </span>
              <ArrowRight className="size-3 text-slate-300 group-hover:text-emerald-700 transition-colors" />
            </div>
            <div className="text-3xl font-black font-mono-numbers text-slate-900 leading-none">
              {performance ? (
                <span>
                  <CountUp end={performance.score} />%
                </span>
              ) : (
                <span className="text-slate-400 font-normal">—</span>
              )}
            </div>
            <p className="text-xs text-slate-500 truncate">
              {performance?.label || 'Take a quiz to test retention'}
            </p>
          </div>

          {/* 3. Materials */}
          <div
            onClick={() => goToTool('documents')}
            className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-2.5 shadow-xs hover:border-emerald-300 transition-colors cursor-pointer group card-lift"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 font-mono-numbers">
                Materials
              </span>
              <ArrowRight className="size-3 text-slate-300 group-hover:text-emerald-700 transition-colors" />
            </div>
            <div className="text-3xl font-black font-mono-numbers text-slate-900 leading-none">
              <CountUp end={documents.length} />
            </div>
            <p className="text-xs text-slate-500 truncate">
              {documents.length > 0
                ? `${readyMaterialsCount} Ready for study`
                : 'Upload notes to begin'}
            </p>
          </div>

          {/* 4. Concepts */}
          <div
            onClick={() => goToTool('progress')}
            className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-2.5 shadow-xs hover:border-emerald-300 transition-colors cursor-pointer group card-lift"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 font-mono-numbers">
                Concepts
              </span>
              <ArrowRight className="size-3 text-slate-300 group-hover:text-emerald-700 transition-colors" />
            </div>
            <div className="text-3xl font-black font-mono-numbers text-slate-900 leading-none">
              <CountUp end={masteryList.length} />
            </div>
            <p className="text-xs text-slate-500 truncate">
              {masteryList.length > 0
                ? `${masteredCount} Mastered (≥75%)`
                : 'Tracked concepts'}
            </p>
          </div>
        </div>
      </section>

      {/* ── 3. MAIN SECTION: IMPORTANT CONCEPTS + RECOMMENDED NEXT ────────── */}
      <div className="stagger-3 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (Important Concepts): col-span-7 */}
        <section className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900 font-heading">
                Important Concepts
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Evaluated topics and your current level of mastery
              </p>
            </div>
            {masteryList.length > 0 && (
              <button
                type="button"
                onClick={() => goToTool('progress')}
                className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span>View all</span>
                <ArrowRight className="size-3.5" />
              </button>
            )}
          </div>

          {/* Concept Rows or Empty State */}
          {importantConcepts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center space-y-3">
              <div className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 mx-auto">
                <Brain className="size-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900 font-heading">
                  No concepts evaluated yet
                </h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Take a practice quiz or ask questions in AI Tutor to start measuring your understanding of core topics.
                </p>
              </div>
              <button
                type="button"
                id="overview-concepts-take-quiz-btn"
                onClick={() => goToTool('quiz')}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-bold transition shadow-xs active:scale-[0.99] cursor-pointer mt-2"
              >
                <HelpCircle className="size-4" />
                <span>Take Quiz</span>
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200/90 bg-white overflow-hidden shadow-xs">
              {importantConcepts.map((item) => {
                const score = Math.round(Number(item.score || 0))
                const statusLabel =
                  score >= 75
                    ? 'Strong'
                    : score >= 50
                    ? 'Developing'
                    : 'Needs Practice'

                const statusClass =
                  score >= 75
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold'
                    : score >= 50
                    ? 'bg-amber-50 text-amber-800 border-amber-200 font-medium'
                    : 'bg-rose-50 text-rose-800 border-rose-200 font-semibold'

                return (
                  <div
                    key={item.concept}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors group"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0 pr-2">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h4 className="text-[16px] font-semibold text-slate-900 capitalize truncate">
                          {item.concept}
                        </h4>
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full border ${statusClass}`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="flex items-center gap-3">
                        <div className="flex-1 max-w-xs bg-slate-100 rounded-full h-1.5 overflow-hidden border border-slate-200">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ease-out ${
                              score >= 75
                                ? 'bg-emerald-500'
                                : score >= 50
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                            }`}
                            style={{ width: `${Math.max(4, Math.min(100, score))}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono-numbers text-slate-500">
                          {score}%
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => goToTool('quiz')}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 hover:text-white bg-emerald-50 hover:bg-emerald-600 border border-emerald-200 px-3 py-1.5 rounded-xl transition-colors shrink-0 self-start sm:self-center cursor-pointer"
                    >
                      <span>Practice</span>
                      <ArrowRight className="size-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Right Column (Recommended Next - PROMINENT): col-span-5 */}
        <section className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 font-heading">
              Recommended Next
            </h2>
          </div>

          {topRecommendation ? (
            <div className="rounded-2xl border-2 border-emerald-500 bg-white p-6 space-y-4 shadow-sm card-lift">
              {/* Badge & Urgency */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-900 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                  <Sparkles className="size-3.5 text-emerald-600" />
                  <span>Recommended Next</span>
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full font-mono-numbers">
                  {topRecommendation.urgency === 'critical' ? 'High Priority' : 'Next Step'}
                </span>
              </div>

              {/* WHAT */}
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-slate-900 leading-snug capitalize font-heading">
                  Practice {topRecommendation.concept}
                </h3>
                <p className="text-[15px] text-slate-700 leading-relaxed font-medium">
                  {topRecommendation.action_recommendation}
                </p>
              </div>

              {/* WHY */}
              <div className="text-sm text-slate-600 bg-emerald-50/40 p-3.5 rounded-xl border border-emerald-100 leading-relaxed">
                <strong className="text-slate-900 font-semibold block mb-0.5">Why this?</strong>
                {topRecommendation.gap_description}
              </div>

              {/* HOW: Contextual Actions */}
              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <button
                  type="button"
                  id="overview-recommended-cta-btn"
                  onClick={() => {
                    const targetTool = recommendationCTA?.tool || 'quiz'
                    goToTool(targetTool)
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-sm font-bold transition shadow-xs active:scale-[0.99] cursor-pointer"
                >
                  <HelpCircle className="size-4" />
                  <span>{recommendationCTA?.label || 'Take Quiz'}</span>
                  <ArrowRight className="size-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => goToTool('chat', latestThread?.id)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2.5 text-sm font-semibold transition active:scale-[0.99] cursor-pointer"
                >
                  <MessageSquare className="size-4 text-emerald-600" />
                  <span>Ask Tutor</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center space-y-3">
              <div className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 mx-auto">
                <Target className="size-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900 font-heading">
                  You're all caught up
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed max-w-sm mx-auto">
                  Complete a little more activity and StudyMate will suggest your next step.
                </p>
              </div>
              <div className="flex justify-center gap-2 pt-1">
                <button
                  type="button"
                  id="overview-empty-rec-quiz-btn"
                  onClick={() => goToTool('quiz')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold transition active:scale-[0.99] cursor-pointer"
                >
                  <span>Take Quiz</span>
                  <ArrowRight className="size-3" />
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ── 4. RECENT ACTIVITY TIMELINE ───────────────────────────────────── */}
      <section className="stagger-4 space-y-4 pt-2">
        <div className="flex items-center justify-between border-t border-slate-200/80 pt-8">
          <div>
            <h2 className="text-xl font-bold text-slate-900 font-heading">
              Recent Activity
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Your latest study sessions, quizzes, and course updates
            </p>
          </div>
          {recentActivities.length > 0 && (
            <button
              type="button"
              onClick={() => goToTool('progress')}
              className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>Full progress report</span>
              <ArrowRight className="size-3.5" />
            </button>
          )}
        </div>

        {recentActivities.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center space-y-3">
            <div className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 mx-auto">
              <Activity className="size-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900 font-heading">
                No learning activity yet
              </h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                Your learning activity will appear here as you study. Start by exploring notes or asking the AI Tutor.
              </p>
            </div>
            <div className="flex justify-center gap-3 pt-2">
              <button
                type="button"
                id="overview-empty-upload-btn"
                onClick={() => goToTool('documents')}
                className="inline-flex items-center gap-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2 text-sm font-semibold transition active:scale-[0.99] cursor-pointer"
              >
                <Upload className="size-4" />
                <span>Upload Materials</span>
              </button>
              <button
                type="button"
                id="overview-empty-ask-tutor-btn"
                onClick={() => goToTool('chat')}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-bold transition active:scale-[0.99] cursor-pointer"
              >
                <MessageSquare className="size-4" />
                <span>Ask Tutor</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs">
            <div className="relative border-l-2 border-slate-200 ml-3.5 sm:ml-4 pl-5 sm:pl-6 space-y-6">
              {recentActivities.map((act) => {
                const dateLabel = formatActivityDate(act.timestamp)

                let IconComponent = Clock
                let iconBg = 'bg-emerald-50 text-emerald-700 border border-emerald-200'

                if (act.type === 'quiz') {
                  IconComponent = HelpCircle
                  iconBg = 'bg-amber-50 text-amber-700 border border-amber-200'
                } else if (act.type === 'thread') {
                  IconComponent = MessageSquare
                  iconBg = 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                } else if (act.type === 'material') {
                  IconComponent = FileText
                  iconBg = 'bg-blue-50 text-blue-700 border border-blue-200'
                }

                return (
                  <div key={act.id} className="relative group">
                    {/* Timeline bullet icon */}
                    <div
                      className={`absolute -left-[31px] sm:-left-[35px] top-0 grid size-6 sm:size-7 place-items-center rounded-full ${iconBg} shadow-xs`}
                    >
                      <IconComponent className="size-3 sm:size-3.5" />
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono-numbers">
                            {dateLabel}
                          </span>
                          <span className="text-xs text-slate-300">•</span>
                          <span className="text-sm font-bold text-slate-900">
                            {act.title}
                          </span>
                        </div>
                        <p className="text-[15px] text-slate-600 leading-relaxed">
                          {act.detail}
                        </p>
                      </div>

                      {/* Contextual navigation */}
                      {act.actionTool && (
                        <button
                          type="button"
                          onClick={() => goToTool(act.actionTool, act.threadId)}
                          className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 hover:underline shrink-0 mt-1 sm:mt-0 cursor-pointer"
                        >
                          {act.actionTool === 'chat'
                            ? 'Resume discussion →'
                            : act.actionTool === 'quiz'
                            ? 'Take Quiz →'
                            : 'View material →'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>

      {/* ── 5. QUICK LEARNING WORKSPACE SHORTCUTS ─────────────────────────── */}
      <section className="border-t border-slate-200/80 pt-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div
            onClick={() => goToTool('chat', latestThread?.id)}
            className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-2 hover:border-emerald-300 transition-colors cursor-pointer card-lift group shadow-xs"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-mono-numbers">
                <MessageSquare className="size-3.5 text-emerald-600" />
                <span>AI Tutor</span>
              </span>
              <ArrowRight className="size-4 text-slate-300 group-hover:text-emerald-700 group-hover:translate-x-0.5 transition-all" />
            </div>
            <h3 className="text-base font-bold text-slate-900 font-heading group-hover:text-emerald-800 transition-colors">
              Ask Tutor
            </h3>
            <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">
              Ask deep conceptual questions grounded in your course materials.
            </p>
          </div>

          <div
            onClick={() => goToTool('quiz')}
            className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-2 hover:border-emerald-300 transition-colors cursor-pointer card-lift group shadow-xs"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-mono-numbers">
                <HelpCircle className="size-3.5 text-emerald-600" />
                <span>Assessment</span>
              </span>
              <ArrowRight className="size-4 text-slate-300 group-hover:text-emerald-700 group-hover:translate-x-0.5 transition-all" />
            </div>
            <h3 className="text-base font-bold text-slate-900 font-heading group-hover:text-emerald-800 transition-colors">
              Take Quiz
            </h3>
            <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">
              Test retention across key concepts with auto-graded questions.
            </p>
          </div>

          <div
            onClick={() => goToTool('flashcards')}
            className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-2 hover:border-emerald-300 transition-colors cursor-pointer card-lift group shadow-xs"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-mono-numbers">
                <Layers className="size-3.5 text-emerald-600" />
                <span>Spaced Repetition</span>
              </span>
              <ArrowRight className="size-4 text-slate-300 group-hover:text-emerald-700 group-hover:translate-x-0.5 transition-all" />
            </div>
            <h3 className="text-base font-bold text-slate-900 font-heading group-hover:text-emerald-800 transition-colors">
              Flashcards
            </h3>
            <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">
              Reinforce terminology and definitions using active recall.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
