/**
 * SpaceProjectNav
 * ===============
 * A collapsible Space → Project tree for the left sidebar.
 *
 * - Each Space can be expanded to reveal its Projects.
 * - Clicking a Project selects it, loads its threads, and activates the first thread.
 * - Inline Create buttons open minimal name prompts.
 * - Uses Framer Motion for smooth expand/collapse animations.
 */

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronRight,
  FolderOpen,
  Folder,
  Plus,
  LayoutGrid,
  Loader2,
  AlertCircle,
  Pencil,
  Trash2,
} from 'lucide-react'
import {
  getSpaces,
  createSpace,
  updateSpace,
  deleteSpace,
  getProjects,
  createProject,
  updateProject,
  deleteProject,
} from '../../api/client'
import { useWorkspace } from '../../context/WorkspaceContext'

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SpinnerIcon() {
  return <Loader2 className="size-3.5 animate-spin text-zinc-500" />
}

function InlineForm({ placeholder, initialValue = '', submitLabel = 'Add', onSubmit, onCancel }) {
  const [value, setValue] = useState(initialValue)

  function handleKey(e) {
    if (e.key === 'Enter' && value.trim()) onSubmit(value.trim())
    if (e.key === 'Escape') onCancel()
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSubmit(value.trim()) }}
      className="flex items-center gap-1.5 mt-1"
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        className="flex-1 min-w-0 rounded-lg bg-white border border-zinc-300 px-2.5 py-1 text-xs text-black placeholder:text-zinc-400 outline-none focus:border-black focus:ring-1 focus:ring-black"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="rounded-lg bg-black hover:bg-zinc-800 px-2 py-1 text-xs font-bold text-white disabled:opacity-40 transition shadow-sm"
      >
        {submitLabel}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg px-1.5 py-1 text-xs text-zinc-500 hover:text-black transition"
      >
        ✕
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SpaceProjectNav({ onProjectSelected }) {
  const {
    spaces,
    setSpaces,
    activeSpaceId,
    setActiveSpaceId,
    activeProjectId,
    setActiveProjectId,
    setActiveWorkspace,
  } = useWorkspace()

  const [expandedSpaces, setExpandedSpaces] = useState({})
  const [projectsBySpace, setProjectsBySpace] = useState({})
  const [loadingProjects, setLoadingProjects] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Forms
  const [showNewSpaceForm, setShowNewSpaceForm] = useState(false)
  const [newProjectForSpace, setNewProjectForSpace] = useState(null) // spaceId or null
  const [editingSpaceId, setEditingSpaceId] = useState(null) // spaceId or null
  const [editingProjectId, setEditingProjectId] = useState(null) // projectId or null

  // ---------------------------------------------------------------------------
  // Load projects for a space
  // ---------------------------------------------------------------------------
  const loadProjectsForSpace = useCallback(async (spaceId, autoSelectFirst = false) => {
    if (projectsBySpace[spaceId]) {
      if (autoSelectFirst && projectsBySpace[spaceId].length > 0 && !activeProjectId) {
        selectProject(spaceId, projectsBySpace[spaceId][0].id)
      }
      return
    }
    setLoadingProjects((prev) => ({ ...prev, [spaceId]: true }))
    try {
      const data = await getProjects(spaceId)
      setProjectsBySpace((prev) => ({ ...prev, [spaceId]: data }))
      if (autoSelectFirst && data.length > 0 && !activeProjectId) {
        selectProject(spaceId, data[0].id)
      }
    } catch {
      // silently ignore — user can retry by toggling
    } finally {
      setLoadingProjects((prev) => ({ ...prev, [spaceId]: false }))
    }
  }, [projectsBySpace, activeProjectId])

  // ---------------------------------------------------------------------------
  // Load spaces on mount
  // ---------------------------------------------------------------------------
  const loadSpaces = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getSpaces()
      setSpaces(data)
      // Auto-expand the first space and select its first project
      if (data.length > 0 && Object.keys(expandedSpaces).length === 0) {
        setExpandedSpaces({ [data[0].id]: true })
        void loadProjectsForSpace(data[0].id, true)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [loadProjectsForSpace, expandedSpaces]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadSpaces()
  }, [loadSpaces])

  // ---------------------------------------------------------------------------
  // Expand / collapse a space
  // ---------------------------------------------------------------------------
  function toggleSpace(spaceId) {
    const next = !expandedSpaces[spaceId]
    setExpandedSpaces((prev) => ({ ...prev, [spaceId]: next }))
    if (next) loadProjectsForSpace(spaceId)
  }

  // ---------------------------------------------------------------------------
  // Select project
  // ---------------------------------------------------------------------------
  function selectProject(spaceId, projectId) {
    setActiveSpaceId(spaceId)
    setActiveProjectId(projectId)
    setActiveWorkspace('overview')
    onProjectSelected?.(projectId)
  }

  // ---------------------------------------------------------------------------
  // Create space
  // ---------------------------------------------------------------------------
  async function handleCreateSpace(name) {
    setShowNewSpaceForm(false)
    try {
      const space = await createSpace(name)
      setSpaces((prev) => [...prev, space])
      setExpandedSpaces((prev) => ({ ...prev, [space.id]: true }))
      setProjectsBySpace((prev) => ({ ...prev, [space.id]: [] }))
    } catch (err) {
      alert(`Failed to create space: ${err.message}`)
    }
  }

  // ---------------------------------------------------------------------------
  // Edit & Delete space
  // ---------------------------------------------------------------------------
  async function handleUpdateSpace(spaceId, name) {
    try {
      const updated = await updateSpace(spaceId, { name })
      setSpaces((prev) =>
        prev.map((s) => (s.id === spaceId ? { ...s, name: updated.name } : s))
      )
      setEditingSpaceId(null)
    } catch (err) {
      alert(`Failed to update space: ${err.message}`)
    }
  }

  async function handleDeleteSpace(space) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${space.name}"?\n\nThis will permanently delete this space and all of its projects, threads, and uploaded documents.`
    )
    if (!confirmed) return

    try {
      await deleteSpace(space.id)
      const remainingSpaces = spaces.filter((s) => s.id !== space.id)
      setSpaces(remainingSpaces)

      // Clean up local cache
      setExpandedSpaces((prev) => {
        const copy = { ...prev }
        delete copy[space.id]
        return copy
      })
      setProjectsBySpace((prev) => {
        const copy = { ...prev }
        delete copy[space.id]
        return copy
      })

      // If active space was deleted, select next available space or clear
      if (activeSpaceId === space.id) {
        if (remainingSpaces.length > 0) {
          const nextSpace = remainingSpaces[0]
          setActiveSpaceId(nextSpace.id)
          setExpandedSpaces((prev) => ({ ...prev, [nextSpace.id]: true }))
          void loadProjectsForSpace(nextSpace.id, true)
        } else {
          setActiveSpaceId(null)
          setActiveProjectId(null)
          onProjectSelected?.(null, null)
        }
      }
    } catch (err) {
      alert(`Failed to delete space: ${err.message}`)
    }
  }

  // ---------------------------------------------------------------------------
  // Create project
  // ---------------------------------------------------------------------------
  async function handleCreateProject(spaceId, name) {
    setNewProjectForSpace(null)
    try {
      const result = await createProject(spaceId, name)
      // result has default_thread_id — select it immediately
      setProjectsBySpace((prev) => ({
        ...prev,
        [spaceId]: [...(prev[spaceId] || []), result],
      }))
      selectProject(spaceId, result.id)
      // Tell App to activate the auto-created default thread
      onProjectSelected?.(result.id, result.default_thread_id)
    } catch (err) {
      alert(`Failed to create project: ${err.message}`)
    }
  }

  // ---------------------------------------------------------------------------
  // Edit & Delete project
  // ---------------------------------------------------------------------------
  async function handleUpdateProject(spaceId, projectId, name) {
    try {
      const updated = await updateProject(projectId, { name })
      setProjectsBySpace((prev) => ({
        ...prev,
        [spaceId]: (prev[spaceId] || []).map((p) =>
          p.id === projectId ? { ...p, name: updated.name } : p
        ),
      }))
      setEditingProjectId(null)
    } catch (err) {
      alert(`Failed to update project: ${err.message}`)
    }
  }

  async function handleDeleteProject(spaceId, project) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${project.name}"?\n\nThis will permanently delete this project and all of its threads and documents.`
    )
    if (!confirmed) return

    try {
      await deleteProject(project.id)
      const currentProjects = projectsBySpace[spaceId] || []
      const remaining = currentProjects.filter((p) => p.id !== project.id)

      setProjectsBySpace((prev) => ({
        ...prev,
        [spaceId]: remaining,
      }))

      // If active project was deleted:
      if (activeProjectId === project.id) {
        if (remaining.length > 0) {
          const nextProj = remaining[0]
          selectProject(spaceId, nextProj.id)
        } else {
          setActiveProjectId(null)
          onProjectSelected?.(null, null)
        }
      }
    } catch (err) {
      alert(`Failed to delete project: ${err.message}`)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-2 py-3 text-xs text-[var(--text-muted)]">
        <SpinnerIcon />
        Loading spaces…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-2 py-2 text-xs text-red-400">
        <AlertCircle className="size-3.5 shrink-0" />
        {error}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0.5">
      {/* Section header */}
      <div className="flex items-center justify-between px-1 mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          Spaces
        </span>
        <button
          id="create-space-btn"
          type="button"
          onClick={() => setShowNewSpaceForm(true)}
          title="New space"
          className="rounded-md p-0.5 text-zinc-400 hover:text-black hover:bg-zinc-100 transition"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {/* New space form */}
      {showNewSpaceForm && (
        <InlineForm
          placeholder="Space name…"
          onSubmit={handleCreateSpace}
          onCancel={() => setShowNewSpaceForm(false)}
        />
      )}

      {/* Spaces list */}
      {spaces.length === 0 && !showNewSpaceForm && (
        <p className="px-2 py-1 text-[11px] text-zinc-400 italic">
          No spaces yet. Click + to create one.
        </p>
      )}

      {spaces.map((space) => {
        const isExpanded = !!expandedSpaces[space.id]
        const projects = projectsBySpace[space.id] || []
        const isLoadingProjects = !!loadingProjects[space.id]
        const isEditing = editingSpaceId === space.id

        return (
          <div key={space.id} className="group/space flex flex-col">
            {/* Space row or inline edit form */}
            {isEditing ? (
              <div className="px-1 py-1">
                <InlineForm
                  placeholder="Space name…"
                  initialValue={space.name}
                  submitLabel="Save"
                  onSubmit={(newName) => handleUpdateSpace(space.id, newName)}
                  onCancel={() => setEditingSpaceId(null)}
                />
              </div>
            ) : (
              <div className="flex w-full items-center rounded-lg hover:bg-zinc-100 transition-colors">
                <button
                  id={`space-${space.id}`}
                  type="button"
                  onClick={() => toggleSpace(space.id)}
                  className="flex flex-1 min-w-0 items-center gap-1.5 px-2 py-1.5 text-left text-xs text-zinc-600 hover:text-black transition-colors"
                >
                  <motion.span
                    animate={{ rotate: isExpanded ? 90 : 0 }}
                    transition={{ duration: 0.18 }}
                    className="shrink-0"
                  >
                    <ChevronRight className="size-3.5 text-zinc-400" />
                  </motion.span>
                  <LayoutGrid className="size-3.5 shrink-0 text-black" />
                  <span className="truncate flex-1 font-medium">{space.name}</span>
                </button>

                {/* Edit & Delete Actions */}
                <div className="flex items-center gap-0.5 pr-1.5 opacity-0 group-hover/space:opacity-100 transition-opacity">
                  <button
                    id={`edit-space-${space.id}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingSpaceId(space.id)
                    }}
                    title="Rename space"
                    className="rounded p-1 text-zinc-400 hover:text-black hover:bg-zinc-200 transition"
                  >
                    <Pencil className="size-3" />
                  </button>
                  <button
                    id={`delete-space-${space.id}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteSpace(space)
                    }}
                    title="Delete space"
                    className="rounded p-1 text-zinc-400 hover:text-black hover:bg-zinc-200 transition"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>
            )}

            {/* Projects list (animated) */}
            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  key="projects"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1, transition: { duration: 0.2, ease: 'easeOut' } }}
                  exit={{ height: 0, opacity: 0, transition: { duration: 0.15, ease: 'easeIn' } }}
                  className="overflow-hidden"
                >
                  <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-black/10 pl-2">
                    {isLoadingProjects && (
                      <div className="flex items-center gap-1.5 py-1 text-[11px] text-zinc-400">
                        <SpinnerIcon />
                        Loading…
                      </div>
                    )}

                    {projects.map((project) => {
                      const isActive = project.id === activeProjectId
                      const isEditing = editingProjectId === project.id

                      return (
                        <div key={project.id} className="group/project flex flex-col">
                          {isEditing ? (
                            <div className="py-0.5">
                              <InlineForm
                                placeholder="Project name…"
                                initialValue={project.name}
                                submitLabel="Save"
                                onSubmit={(newName) => handleUpdateProject(space.id, project.id, newName)}
                                onCancel={() => setEditingProjectId(null)}
                              />
                            </div>
                          ) : (
                            <div
                              className={`flex w-full items-center rounded-lg transition-colors ${
                                isActive
                                  ? 'bg-zinc-100 text-black font-semibold border border-black/20 shadow-sm'
                                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-black'
                              }`}
                            >
                              <button
                                id={`project-${project.id}`}
                                type="button"
                                onClick={() => selectProject(space.id, project.id)}
                                className="flex flex-1 min-w-0 items-center gap-1.5 px-2 py-1.5 text-left text-xs"
                              >
                                {isActive
                                  ? <FolderOpen className="size-3.5 shrink-0 text-black" />
                                  : <Folder className="size-3.5 shrink-0 text-zinc-400" />
                                }
                                <span className="truncate flex-1">{project.name}</span>
                              </button>

                              {/* Project Edit & Delete Actions */}
                              <div className="flex items-center gap-0.5 pr-1.5 opacity-0 group-hover/project:opacity-100 transition-opacity">
                                <button
                                  id={`edit-project-${project.id}`}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setEditingProjectId(project.id)
                                  }}
                                  title="Rename project"
                                  className="rounded p-1 text-zinc-400 hover:text-black hover:bg-zinc-200 transition"
                                >
                                  <Pencil className="size-3" />
                                </button>
                                <button
                                  id={`delete-project-${project.id}`}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDeleteProject(space.id, project)
                                  }}
                                  title="Delete project"
                                  className="rounded p-1 text-zinc-400 hover:text-black hover:bg-zinc-200 transition"
                                >
                                  <Trash2 className="size-3" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* New project form or button */}
                    {newProjectForSpace === space.id ? (
                      <InlineForm
                        placeholder="Project name…"
                        onSubmit={(name) => handleCreateProject(space.id, name)}
                        onCancel={() => setNewProjectForSpace(null)}
                      />
                    ) : (
                      <button
                        id={`create-project-${space.id}`}
                        type="button"
                        onClick={() => setNewProjectForSpace(space.id)}
                        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-zinc-500 hover:text-black hover:bg-zinc-100 transition"
                      >
                        <Plus className="size-3" />
                        New project
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}
