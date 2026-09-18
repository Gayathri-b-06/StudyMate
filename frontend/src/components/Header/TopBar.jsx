import React from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { WORKSPACE_TOOLS } from '../../config/toolRegistry'
import UserMenu from './UserMenu'

export default function TopBar({ project }) {
  const { activeWorkspace, activeProjectId } = useWorkspace()

  // Find active tool config
  const currentTool = WORKSPACE_TOOLS.find((t) => t.id === activeWorkspace) || WORKSPACE_TOOLS[0]
  const Icon = currentTool.icon

  const spaceName = project?.space_name || 'Space'
  const projectName = project?.name || 'Project'

  return (
    <header className="project-topbar sticky top-0 z-30 flex h-16 w-full shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/95 px-6 backdrop-blur-md font-sans transition-colors">
      {/* ── Left: Breadcrumbs & Current Tool Badge ─────────────────────── */}
      <div className="flex items-center gap-3">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 font-medium">
          <Link
            to="/home"
            className="hover:text-emerald-700 font-semibold text-slate-700 transition flex items-center gap-1"
            title="Go to Home Dashboard"
          >
            StudyMate
          </Link>
          <ChevronRight className="size-3.5 text-slate-400 shrink-0" />
          <Link
            to="/spaces"
            className="hover:text-emerald-700 font-semibold text-slate-700 transition"
            title="Go to Spaces"
          >
            Spaces
          </Link>
          <ChevronRight className="size-3.5 text-slate-400 shrink-0" />
          {project?.space_id ? (
            <Link
              to={`/spaces/${project.space_id}`}
              className="hover:text-emerald-700 font-semibold text-slate-700 transition truncate max-w-[120px]"
              title={spaceName}
            >
              {spaceName}
            </Link>
          ) : (
            <span className="text-slate-600 truncate max-w-[120px]" title={spaceName}>
              {spaceName}
            </span>
          )}
          <ChevronRight className="size-3.5 text-slate-400 shrink-0" />
          <Link
            to={`/projects/${activeProjectId || project?.id}/overview`}
            className="hover:text-emerald-700 font-semibold text-slate-700 transition truncate max-w-[140px]"
            title={projectName}
          >
            {projectName}
          </Link>
          <ChevronRight className="size-3.5 text-slate-400 shrink-0" />
          <span className="flex items-center gap-1.5 font-bold text-slate-900">
            <Icon className="size-4 text-emerald-600" />
            {currentTool.title}
          </span>
        </nav>

      </div>

      {/* ── Right: User Profile & Controls ────────────────────────────── */}
      <div className="flex items-center gap-3">
        <UserMenu />
      </div>
    </header>
  )
}
