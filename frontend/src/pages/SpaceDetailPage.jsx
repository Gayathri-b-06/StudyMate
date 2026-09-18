import '../styles/project-theme.css'
import React, { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ChevronRight,
  Plus,
  ArrowRight,
  Folder,
  FileText,
  MessageSquare,
  Target,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  Calendar,
  TrendingUp,
  Pencil,
  Trash2,
} from 'lucide-react'
import GlobalTopBar from '../components/Header/GlobalTopBar'
import { getSpace, getSpaces, getGlobalDashboard, createProject, updateSpace, deleteSpace } from '../api/client'
import { useWorkspace } from '../context/WorkspaceContext'

export default function SpaceDetailPage({ tab: defaultTab = 'overview' }) {
  const { spaceId, tab: urlTab } = useParams()
  const activeTab = urlTab || defaultTab
  const navigate = useNavigate()
  const { setActiveProjectId, setActiveWorkspace } = useWorkspace()

  // State
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [space, setSpace] = useState(null)
  const [dashboardData, setDashboardData] = useState(null)

  // Create Project Modal state
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)

  // Edit Space Modal state
  const [isEditSpaceModalOpen, setIsEditSpaceModalOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')

  // Delete Space Modal state
  const [isDeleteSpaceModalOpen, setIsDeleteSpaceModalOpen] = useState(false)

  // Fetch space data and global dashboard
  const loadSpaceData = async () => {
    if (!spaceId) return
    setLoading(true)
    setError(null)
    try {
      const [spaceData, dashData, allSpaces] = await Promise.all([
        getSpace(spaceId).catch(() => null),
        getGlobalDashboard(),
        getSpaces(false).catch(() => []),
      ])

      // If getSpace endpoint succeeded or search in allSpaces
      const foundSpace =
        spaceData || allSpaces.find((s) => s.id === spaceId)

      if (!foundSpace) {
        throw new Error('Space not found.')
      }

      setSpace(foundSpace)
      setDashboardData(dashData)
    } catch (err) {
      setError(err?.message || 'Failed to load space data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSpaceData()
  }, [spaceId])

  // Filter projects belonging ONLY to this space
  const spaceProjects = useMemo(() => {
    const projects = dashboardData?.active_projects || []
    return projects.filter((p) => p.space_id === spaceId)
  }, [dashboardData, spaceId])

  // Space-level metrics
  const spaceStats = useMemo(() => {
    const count = spaceProjects.length
    const totalDocs = spaceProjects.reduce((acc, p) => acc + (p.document_count || 0), 0)
    const totalConcepts = spaceProjects.reduce((acc, p) => acc + (p.concept_count || 0), 0)
    // Both values come from the same project concept rows supplied by the
    // dashboard. This prevents a non-zero average with an empty concept count.
    const avgMastery = totalConcepts > 0
      ? Math.round(spaceProjects.reduce(
          (sum, project) => sum + ((project.progress_pct || 0) * (project.concept_count || 0)),
          0,
        ) / totalConcepts)
      : 0

    return {
      projectCount: count,
      avgMastery,
      totalDocs,
      totalConcepts,
    }
  }, [spaceProjects])

  // Filter recommendations/weak concepts belonging to this space
  const spaceRecommendations = useMemo(() => {
    const allRecs = dashboardData?.recommendations || []
    const matching = allRecs.filter((r) => r.space_name === space?.name || spaceProjects.some((p) => p.id === r.project_id))
    if (matching.length > 0) return matching
    if (dashboardData?.top_recommendation) {
      const top = dashboardData.top_recommendation
      if (spaceProjects.some((p) => p.id === top.project_id)) {
        return [top]
      }
    }
    return []
  }, [dashboardData, space, spaceProjects])

  // Filter recent activity belonging to this space
  const spaceActivity = useMemo(() => {
    const allActivity = dashboardData?.recent_activity || []
    return allActivity.filter((a) => spaceProjects.some((p) => p.id === a.project_id))
  }, [dashboardData, spaceProjects])

  // Format timestamp helper
  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return 'Not yet studied'
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 5) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  // Open a project workspace
  const handleOpenProject = (projectId, tool = 'overview') => {
    setActiveProjectId(projectId)
    setActiveWorkspace(tool)
    navigate(`/projects/${projectId}/${tool}`)
  }

  // Switch tab
  const handleSelectTab = (tabKey) => {
    navigate(`/spaces/${spaceId}/${tabKey}`)
  }

  // Create Project submit
  const handleCreateProjectSubmit = async (e) => {
    e.preventDefault()
    if (!projectName.trim() || !spaceId) return
    setSubmitting(true)
    setFormError(null)
    try {
      const newProj = await createProject(spaceId, projectName.trim(), projectDescription.trim() || null)
      setProjectName('')
      setProjectDescription('')
      setIsNewProjectModalOpen(false)
      if (newProj?.id) {
        handleOpenProject(newProj.id, 'overview')
      } else {
        await loadSpaceData()
      }
    } catch (err) {
      setFormError(err?.message || 'Failed to create project.')
    } finally {
      setSubmitting(false)
    }
  }

  // Handle Edit Space
  const handleEditSpaceSubmit = async (e) => {
    e.preventDefault()
    if (!space || !editName.trim()) return
    setSubmitting(true)
    setFormError(null)
    try {
      const updated = await updateSpace(space.id, {
        name: editName.trim(),
        description: editDescription.trim() || null,
      })
      setSpace((prev) => ({
        ...prev,
        name: updated?.name || editName.trim(),
        description: updated?.description !== undefined ? updated.description : (editDescription.trim() || null),
      }))
      setIsEditSpaceModalOpen(false)
    } catch (err) {
      setFormError(err?.message || 'Failed to update space.')
    } finally {
      setSubmitting(false)
    }
  }

  // Handle Delete Space
  const handleDeleteSpaceSubmit = async () => {
    if (!space) return
    setSubmitting(true)
    setFormError(null)
    try {
      await deleteSpace(space.id)
      setIsDeleteSpaceModalOpen(false)
      navigate('/spaces')
    } catch (err) {
      setFormError(err?.message || 'Failed to delete space.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="study-workspace min-h-screen bg-canvas text-slate-900 font-sans">
        <GlobalTopBar />
        <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-pulse">
          <div className="h-8 w-48 rounded-lg bg-white border border-slate-200" />
          <div className="h-32 rounded-2xl bg-white border border-slate-200" />
          <div className="h-10 w-96 rounded-xl bg-white border border-slate-200" />
          <div className="h-64 rounded-2xl bg-white border border-slate-200" />
        </main>
      </div>
    )
  }

  if (error || !space) {
    return (
      <div className="study-workspace min-h-screen bg-canvas text-slate-900 font-sans">
        <GlobalTopBar />
        <main className="mx-auto max-w-2xl px-4 py-24 text-center">
          <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 mb-4">
            <AlertCircle className="size-6" />
          </div>
          <h2 className="text-xl font-bold font-heading mb-2 text-slate-900">Space Not Found</h2>
          <p className="text-sm text-slate-600 mb-6">{error || 'The requested space does not exist.'}</p>
          <Link
            to="/spaces"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition"
          >
            <span>Back to Spaces</span>
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div className="study-workspace min-h-screen bg-canvas text-slate-900 font-sans">
      {/* ── 1. Global Header Bar ───────────────────────────────────── */}
      <GlobalTopBar />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6 font-sans">
        {/* ── 2. Top Breadcrumbs ────────────────────────────────────── */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-500 font-medium">
          <Link
            to="/home"
            className="hover:text-emerald-700 font-semibold text-slate-600 transition"
            title="Go to Home"
          >
            StudyMate
          </Link>
          <ChevronRight className="size-3 text-slate-400 shrink-0" />
          <Link
            to="/spaces"
            className="hover:text-emerald-700 font-semibold text-slate-600 transition"
            title="Go to Spaces"
          >
            Spaces
          </Link>
          <ChevronRight className="size-3 text-slate-400 shrink-0" />
          <span className="font-bold text-slate-900 truncate">{space.name}</span>
        </nav>

        {/* ── 3. Space Header & Actions ─────────────────────────────── */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="size-2.5 rounded-full bg-emerald-600 shrink-0" />
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 font-heading">
                {space.name}
              </h1>
            </div>
            <p className="text-sm text-slate-600 pl-5">
              {space.description || 'Subject learning workspace and projects.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setFormError(null)
                setEditName(space.name)
                setEditDescription(space.description || '')
                setIsEditSpaceModalOpen(true)
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 transition cursor-pointer"
              title="Edit Space name or description"
            >
              <Pencil className="size-3.5" />
              <span>Edit Space</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setFormError(null)
                setIsDeleteSpaceModalOpen(true)
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-600 shadow-xs hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition cursor-pointer"
              title="Delete Space and all associated projects"
            >
              <Trash2 className="size-3.5" />
              <span>Delete</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setFormError(null)
                setIsNewProjectModalOpen(true)
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition cursor-pointer"
            >
              <Plus className="size-4" />
              <span>+ New Project</span>
            </button>
          </div>
        </header>

        {/* ── 4. Compact Space Summary Strip ────────────────────────── */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-1 shadow-xs card-lift">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono-numbers">
              Projects
            </span>
            <p className="text-xl font-extrabold text-slate-900 font-mono-numbers">
              {spaceStats.projectCount} <span className="text-xs font-semibold text-slate-500">active</span>
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-1 shadow-xs card-lift">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono-numbers">
              Overall Mastery
            </span>
            <p className="text-xl font-extrabold text-slate-900 font-mono-numbers">
              {spaceStats.avgMastery}%
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-1 shadow-xs card-lift">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono-numbers">
              Documents
            </span>
            <p className="text-xl font-extrabold text-slate-900 font-mono-numbers">
              {spaceStats.totalDocs} <span className="text-xs font-semibold text-slate-500">files</span>
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-1 shadow-xs card-lift">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono-numbers">
              Concepts Tracked
            </span>
            <p className="text-xl font-extrabold text-slate-900 font-mono-numbers">
              {spaceStats.totalConcepts > 0 ? spaceStats.totalConcepts : '—'}
            </p>
          </div>
        </section>

        {/* ── 5. Space Secondary Navigation Tabs ────────────────────── */}
        <nav aria-label="Space Navigation" className="flex items-center gap-2 border-b border-slate-200/80 pb-2">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'projects', label: `Projects (${spaceProjects.length})` },
            { id: 'progress', label: 'Progress' },
            { id: 'study-plan', label: 'Study Plan' },
          ].map((tabItem) => {
            const isTabActive = activeTab === tabItem.id
            return (
              <button
                key={tabItem.id}
                type="button"
                onClick={() => handleSelectTab(tabItem.id)}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                  isTabActive
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {tabItem.label}
              </button>
            )
          })}
        </nav>

        {/* ── 6. TAB CONTENT ────────────────────────────────────────── */}

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-8 pt-2">
            {/* A. Continue Learning in this Space */}
            <section className="space-y-3">
              <h2 className="text-base font-bold text-slate-900 font-heading">
                Continue Learning
              </h2>
              {spaceProjects.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center space-y-3">
                  <p className="text-xs text-slate-600">No projects created in this space yet.</p>
                  <button
                    type="button"
                    onClick={() => setIsNewProjectModalOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer"
                  >
                    <Plus className="size-3.5" />
                    <span>Create First Project</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {spaceProjects.slice(0, 2).map((proj) => (
                    <div
                      key={proj.id}
                      className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 transition-all hover:border-emerald-300 hover:shadow-md card-lift"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono-numbers">
                            Project
                          </span>
                          <span className="text-xs font-bold text-emerald-700 font-mono-numbers bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                            {Math.round(proj.progress_pct)}% mastery
                          </span>
                        </div>
                        <h3 className="font-bold text-base text-slate-900 font-heading group-hover:text-emerald-800 transition-colors">
                          {proj.name}
                        </h3>
                        <p className="text-xs text-slate-500 font-mono-numbers">
                          Last active {formatTimeAgo(proj.last_studied)} • {proj.document_count} docs
                        </p>
                      </div>

                      <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => handleOpenProject(proj.id)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer"
                        >
                          <span>Continue Project</span>
                          <ArrowRight className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* B. Needs Attention (Weak Concepts in this space) */}
            <section className="space-y-3">
              <h2 className="text-base font-bold text-slate-900 font-heading">
                Needs Attention
              </h2>
              {spaceRecommendations.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center text-xs text-slate-500">
                  No weak concepts currently flagged in this space. All concepts are in good standing!
                </div>
              ) : (
                <div className="space-y-3">
                  {spaceRecommendations.map((rec, idx) => (
                    <div
                      key={`${rec.project_id}-${rec.concept}-${idx}`}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-200/90 bg-white p-4 transition-all hover:border-emerald-300 card-lift shadow-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900">{rec.concept}</span>
                          <span className="rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 text-[10px] font-bold font-mono-numbers">
                            {rec.score !== null ? `${Math.round(rec.score <= 1.0 && rec.score > 0 ? rec.score * 100 : rec.score)}% mastery` : 'Review needed'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600">
                          {rec.reason || rec.gap_description}
                        </p>
                        <p className="text-[11px] text-slate-400 font-mono-numbers">
                          Project: {rec.project_name}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenProject(rec.project_id, 'quiz')}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-600 hover:text-white transition cursor-pointer shrink-0"
                      >
                        <span>Review Concept</span>
                        <ArrowRight className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* C. Projects Preview */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900 font-heading">
                  Projects in {space.name}
                </h2>
                {spaceProjects.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleSelectTab('projects')}
                    className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800 transition cursor-pointer"
                  >
                    <span>View all {spaceProjects.length} projects</span>
                    <ArrowRight className="size-3" />
                  </button>
                )}
              </div>

              {spaceProjects.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
                  No projects in this space.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {spaceProjects.slice(0, 3).map((proj) => (
                    <div
                      key={proj.id}
                      className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 transition-all hover:border-emerald-300 card-lift shadow-xs"
                    >
                      <div className="space-y-2">
                        <h4 className="font-bold text-sm text-slate-900 group-hover:text-emerald-800 transition-colors">
                          {proj.name}
                        </h4>
                        <p className="text-xs text-slate-500 font-mono-numbers">
                          {proj.document_count} docs • {proj.thread_count} chats
                        </p>
                        <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${Math.min(proj.progress_pct, 100)}%` }}
                          />
                        </div>
                      </div>

                      <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 font-mono-numbers">
                          {Math.round(proj.progress_pct)}%
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenProject(proj.id)}
                          className="text-xs font-bold text-emerald-700 hover:text-emerald-800 transition cursor-pointer"
                        >
                          Open →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* D. Recent Activity in this space */}
            <section className="space-y-3">
              <h2 className="text-base font-bold text-slate-900 font-heading">
                Recent Activity
              </h2>
              {spaceActivity.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center text-xs text-slate-500">
                  No activity recorded in this space yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200/90 bg-white overflow-hidden shadow-xs">
                  {spaceActivity.slice(0, 4).map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleOpenProject(item.project_id)}
                      className="flex items-center justify-between p-3.5 hover:bg-slate-50 transition cursor-pointer text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-emerald-600 font-bold">✓</span>
                        <div>
                          <p className="font-semibold text-slate-900">{item.title}</p>
                          <p className="text-[11px] text-slate-400 font-mono-numbers">
                            {item.project_name}
                          </p>
                        </div>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono-numbers">
                        {formatTimeAgo(item.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 2: PROJECTS (SHOW ONLY PROJECTS IN THIS SPACE) */}
        {activeTab === 'projects' && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 font-heading">
                  Projects in {space.name}
                </h2>
                <p className="text-xs text-slate-500">
                  Focus on learning modules and materials dedicated to this subject.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsNewProjectModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-600 hover:text-white transition cursor-pointer"
              >
                <Plus className="size-3.5" />
                <span>+ New Project</span>
              </button>
            </div>

            {spaceProjects.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center space-y-3">
                <p className="text-xs text-slate-600">No projects in this space yet.</p>
                <button
                  type="button"
                  onClick={() => setIsNewProjectModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer"
                >
                  <Plus className="size-3.5" />
                  <span>Create First Project</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {spaceProjects.map((project) => (
                  <div
                    key={project.id}
                    className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 transition-all hover:border-emerald-300 hover:shadow-md card-lift"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="size-2 rounded-full bg-emerald-500 shrink-0" />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono-numbers">
                          {project.status || 'Active'}
                        </span>
                      </div>

                      <div>
                        <h3 className="font-bold text-lg text-slate-900 font-heading group-hover:text-emerald-800 transition-colors">
                          {project.name}
                        </h3>
                        <p className="text-xs text-slate-500 font-mono-numbers mt-1">
                          {project.document_count} docs • {project.thread_count} chats
                        </p>
                      </div>

                      {/* Mastery Progress */}
                      <div className="space-y-1 pt-2">
                        <div className="flex items-center justify-between text-xs font-mono-numbers">
                          <span className="text-slate-500">Mastery</span>
                          <span className="font-bold text-slate-900">{Math.round(project.progress_pct)}%</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${Math.min(project.progress_pct, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 mt-5 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 font-mono-numbers">
                        Last active {formatTimeAgo(project.last_studied)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenProject(project.id)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer"
                      >
                        <span>Open Project</span>
                        <ArrowRight className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: PROGRESS */}
        {activeTab === 'progress' && (
          <div className="space-y-6 pt-2">
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 space-y-4 shadow-xs">
              <h2 className="text-base font-bold text-slate-900 font-heading flex items-center gap-2">
                <TrendingUp className="size-4 text-emerald-600" />
                <span>Space Mastery Analytics</span>
              </h2>
              <p className="text-xs text-slate-600">
                Aggregate learning performance across all projects inside {space.name}.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono-numbers">Average Score</span>
                  <p className="text-2xl font-black text-slate-900 font-mono-numbers mt-1">{spaceStats.avgMastery}%</p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono-numbers">Tracked Projects</span>
                  <p className="text-2xl font-black text-slate-900 font-mono-numbers mt-1">{spaceProjects.length}</p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono-numbers">Course Materials</span>
                  <p className="text-2xl font-black text-slate-900 font-mono-numbers mt-1">{spaceStats.totalDocs}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: STUDY PLAN */}
        {activeTab === 'study-plan' && (
          <div className="space-y-6 pt-2">
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 space-y-4 shadow-xs">
              <h2 className="text-base font-bold text-slate-900 font-heading flex items-center gap-2">
                <Calendar className="size-4 text-emerald-600" />
                <span>Structured Study Schedule</span>
              </h2>
              <p className="text-xs text-slate-600">
                Coordinated milestones and topics for {space.name}.
              </p>

              {spaceProjects.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Create a project to generate study schedules.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {spaceProjects.map((p, idx) => (
                    <div key={p.id} className="py-3 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-slate-900 font-mono-numbers">0{idx + 1}. {p.name}</span>
                        <p className="text-[11px] text-slate-500">Core learning modules & quizzes</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenProject(p.id, 'study-plan')}
                        className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline cursor-pointer"
                      >
                        View Project Plan →
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── Modal: Create New Project in This Space ─────────────────── */}
      {isNewProjectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 font-heading">Create New Project</h3>
                <p className="text-xs text-slate-500">Adding to {space.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsNewProjectModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            {formError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateProjectSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-900">Project Name</label>
                <input
                  type="text"
                  required
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. Transformers, Linear Algebra"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-900">Description (optional)</label>
                <textarea
                  rows={3}
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  placeholder="Focus topics, objectives..."
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewProjectModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !projectName.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition disabled:opacity-50 cursor-pointer"
                >
                  {submitting && <Loader2 className="size-3.5 animate-spin" />}
                  <span>Create Project</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Edit Space ─────────────────────────────────────── */}
      {isEditSpaceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 font-heading">Edit Space</h3>
              <button
                type="button"
                onClick={() => setIsEditSpaceModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            {formError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                {formError}
              </div>
            )}

            <form onSubmit={handleEditSpaceSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-900">Space Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Computer Science, Mathematics"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-900">Description</label>
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="What will you learn in this space?"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditSpaceModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !editName.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition disabled:opacity-50 cursor-pointer"
                >
                  {submitting && <Loader2 className="size-3.5 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Delete Space Confirmation ──────────────────────── */}
      {isDeleteSpaceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="size-10 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                <Trash2 className="size-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 font-heading">Delete Learning Space</h3>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete <strong className="text-slate-900">"{space.name}"</strong>? This will permanently delete this space and cascade to all of its associated projects, documents, chat threads, and quizzes.
            </p>

            {formError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                {formError}
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsDeleteSpaceModalOpen(false)}
                disabled={submitting}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSpaceSubmit}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-rose-700 transition disabled:opacity-50 cursor-pointer"
              >
                {submitting && <Loader2 className="size-3.5 animate-spin" />}
                <span>Delete Space</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
