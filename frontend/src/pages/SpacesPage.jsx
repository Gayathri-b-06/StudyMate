import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FolderOpen,
  Plus,
  ArrowRight,
  Search,
  X,
  Loader2,
  Folder,
  AlertCircle,
  Pencil,
  Trash2,
} from 'lucide-react'
import './SpacesPage.css'
import GlobalTopBar from '../components/Header/GlobalTopBar'
import { getSpaces, createSpace, updateSpace, deleteSpace, getGlobalDashboard } from '../api/client'

export default function SpacesPage() {
  const navigate = useNavigate()

  // State
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [spaces, setSpaces] = useState([])
  const [dashboardData, setDashboardData] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Create Space Modal state
  const [isNewSpaceModalOpen, setIsNewSpaceModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)
  const [spaceName, setSpaceName] = useState('')
  const [spaceDescription, setSpaceDescription] = useState('')

  // Edit Space Modal state
  const [editingSpace, setEditingSpace] = useState(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')

  // Delete Space Modal state
  const [deletingSpace, setDeletingSpace] = useState(null)

  // Load spaces and project data
  const loadSpacesData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [spacesData, dashData] = await Promise.all([
        getSpaces(false),
        getGlobalDashboard(),
      ])
      setSpaces(spacesData || [])
      setDashboardData(dashData)
    } catch (err) {
      setError(err?.message || 'Failed to load spaces data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSpacesData()
  }, [])

  // Aggregate stats per space using real projects from getGlobalDashboard()
  const spaceSummaries = useMemo(() => {
    const projects = dashboardData?.active_projects || []
    return spaces.map((space) => {
      const spaceProjects = projects.filter((p) => p.space_id === space.id)
      const projectCount = spaceProjects.length
      const avgMastery =
        projectCount > 0
          ? Math.round(
              spaceProjects.reduce((acc, p) => acc + (p.progress_pct || 0), 0) / projectCount
            )
          : 0

      return {
        ...space,
        projectCount,
        avgMastery,
      }
    })
  }, [spaces, dashboardData])

  // Filtered spaces based on search query
  const filteredSpaces = useMemo(() => {
    if (!searchQuery.trim()) return spaceSummaries
    const q = searchQuery.toLowerCase()
    return spaceSummaries.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q))
    )
  }, [spaceSummaries, searchQuery])

  // Navigate to individual space
  const handleViewSpace = (spaceId) => {
    navigate(`/spaces/${spaceId}`)
  }

  // Handle Create Space
  const handleCreateSpaceSubmit = async (e) => {
    e.preventDefault()
    if (!spaceName.trim()) return
    setSubmitting(true)
    setFormError(null)
    try {
      const newSpace = await createSpace(spaceName.trim(), spaceDescription.trim() || null)
      setSpaceName('')
      setSpaceDescription('')
      setIsNewSpaceModalOpen(false)
      await loadSpacesData()
      if (newSpace?.id) {
        navigate(`/spaces/${newSpace.id}`)
      }
    } catch (err) {
      setFormError(err?.message || 'Failed to create space.')
    } finally {
      setSubmitting(false)
    }
  }

  // Handle Edit Space
  const handleEditSpaceSubmit = async (e) => {
    e.preventDefault()
    if (!editingSpace || !editName.trim()) return
    setSubmitting(true)
    setFormError(null)
    try {
      await updateSpace(editingSpace.id, {
        name: editName.trim(),
        description: editDescription.trim() || null,
      })
      setEditingSpace(null)
      await loadSpacesData()
    } catch (err) {
      setFormError(err?.message || 'Failed to update space.')
    } finally {
      setSubmitting(false)
    }
  }

  // Handle Delete Space
  const handleDeleteSpaceSubmit = async () => {
    if (!deletingSpace) return
    setSubmitting(true)
    setFormError(null)
    try {
      await deleteSpace(deletingSpace.id)
      setDeletingSpace(null)
      await loadSpacesData()
    } catch (err) {
      setFormError(err?.message || 'Failed to delete space.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="spaces-page min-h-screen bg-canvas text-slate-900 font-sans">
      {/* ── 1. Global Header ────────────────────────────────────────── */}
      <GlobalTopBar />

      <main className="spaces-content mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8 font-sans">
        {/* ── 2. Page Header ────────────────────────────────────────── */}
        <header className="spaces-heading flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-6">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 font-heading">
              Your Learning Spaces
            </h1>
            <p className="text-sm text-slate-600">
              Organize your learning by subject and track mastery across projects.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setFormError(null)
                setIsNewSpaceModalOpen(true)
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 text-xs font-bold shadow-xs transition cursor-pointer"
            >
              <Plus className="size-4" />
              <span>New Space</span>
            </button>
          </div>
        </header>

        {/* ── 3. Search Bar ─────────────────────────────────────────── */}
        <div className="spaces-search relative max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search spaces..."
            aria-label="Search spaces"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-9 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-900"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* ── Error Notification ────────────────────────────────────── */}
        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
            <AlertCircle className="size-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Loading Skeleton ──────────────────────────────────────── */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-44 rounded-2xl bg-white border border-slate-200" />
            ))}
          </div>
        )}

        {/* ── 4. MY SPACES SECTION (3-Column Grid) ──────────────────── */}
        {!loading && (
          <section className="space-y-4">
            {spaceSummaries.length === 0 ? (
              /* Empty State: No Spaces */
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center space-y-4">
                <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs">
                  <FolderOpen className="size-6" />
                </div>
                <div className="max-w-md mx-auto space-y-1">
                  <h3 className="font-bold text-base text-slate-900 font-heading">
                    Create your first learning space
                  </h3>
                  <p className="text-xs text-slate-600">
                    Organize your subjects and projects in one place (e.g. "Computer Science" or "Mathematics").
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsNewSpaceModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  <Plus className="size-4" />
                  <span>Create Space</span>
                </button>
              </div>
            ) : filteredSpaces.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-xs text-slate-500">
                No spaces match "{searchQuery}".
              </div>
            ) : (
              <div className="spaces-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredSpaces.map((space) => (
                  <div
                    key={space.id}
                    onClick={() => handleViewSpace(space.id)}
                    className="space-card group relative flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-6 transition-all hover:border-emerald-300 hover:shadow-md card-lift cursor-pointer"
                  >
                    <div className="space-y-3">
                      {/* Space Icon & Status */}
                      <div className="flex items-center justify-between">
                        <div className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                          <Folder className="size-4" />
                        </div>
                        <span className="text-[11px] font-mono-numbers font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
                          {space.projectCount} project{space.projectCount !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* Space Title & Description */}
                      <div>
                        <h3 className="font-bold text-base text-slate-900 font-heading group-hover:text-emerald-800 transition-colors">
                          {space.name}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2 min-h-[32px]">
                          {space.description || 'General subject learning space'}
                        </p>
                      </div>
                    </div>

                    <div className="space-mastery"><span>Overall mastery</span><strong>{space.avgMastery}%</strong><div role="progressbar" aria-label={`${space.name} mastery`} aria-valuenow={space.avgMastery} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${space.avgMastery}%` }} /></div></div>
                    {/* View Space CTA Link & Action Buttons */}
                    <div className="pt-4 border-t border-slate-100 mt-5 flex items-center justify-between">
                      <button type="button" onClick={(event) => { event.stopPropagation(); handleViewSpace(space.id) }} className="space-open inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 group-hover:text-emerald-800 group-hover:translate-x-0.5 transition-transform">
                        <span>View Space</span>
                        <ArrowRight className="size-3.5" />
                      </button>

                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          title="Edit Space"
                          onClick={(e) => {
                            e.stopPropagation()
                            setFormError(null)
                            setEditingSpace(space)
                            setEditName(space.name)
                            setEditDescription(space.description || '')
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition cursor-pointer"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Delete Space"
                          onClick={(e) => {
                            e.stopPropagation()
                            setFormError(null)
                            setDeletingSpace(space)
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                <button type="button" className="space-create-card" onClick={() => { setFormError(null); setIsNewSpaceModalOpen(true) }}>
                  <span className="space-create-icon"><Plus /></span>
                  <h3>Create New Space</h3>
                  <p>Start a new learning journey<br />and explore your interests.</p>
                  <span className="space-create-cta"><Plus />New Space</span>
                </button>
              </div>
            )}
          </section>
        )}
      </main>

      {/* ── Modal: Create New Space ───────────────────────────────── */}
      {isNewSpaceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 font-heading">Create New Space</h3>
              <button
                type="button"
                onClick={() => setIsNewSpaceModalOpen(false)}
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

            <form onSubmit={handleCreateSpaceSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-900">Space Name</label>
                <input
                  type="text"
                  required
                  value={spaceName}
                  onChange={(e) => setSpaceName(e.target.value)}
                  placeholder="e.g. Computer Science, Mathematics"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-900">Description (optional)</label>
                <textarea
                  rows={3}
                  value={spaceDescription}
                  onChange={(e) => setSpaceDescription(e.target.value)}
                  placeholder="What will you learn in this space?"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewSpaceModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !spaceName.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition disabled:opacity-50 cursor-pointer"
                >
                  {submitting && <Loader2 className="size-3.5 animate-spin" />}
                  <span>Create Space</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Edit Space ─────────────────────────────────────── */}
      {editingSpace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 font-heading">Edit Space</h3>
              <button
                type="button"
                onClick={() => setEditingSpace(null)}
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
                  onClick={() => setEditingSpace(null)}
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
      {deletingSpace && (
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
              Are you sure you want to delete <strong className="text-slate-900">"{deletingSpace.name}"</strong>? This will permanently delete this space and cascade to all of its associated projects, documents, chat threads, and quizzes.
            </p>

            {formError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                {formError}
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingSpace(null)}
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
