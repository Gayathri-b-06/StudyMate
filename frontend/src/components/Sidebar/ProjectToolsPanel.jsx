import { BarChart3, CalendarDays, Layers, MessageSquare, PanelRightClose, PanelRightOpen, PencilLine, Target } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'

const TOOLS = [
  { id: 'chat', path: 'chat', label: 'AI Tutor', detail: 'Ask your sources', icon: MessageSquare },
  { id: 'quiz', path: 'quiz', label: 'Practice quiz', detail: 'Check your recall', icon: Target },
  { id: 'flashcards', path: 'flashcards', label: 'Flashcards', detail: 'Review concepts', icon: Layers },
  { id: 'planner', path: 'study-plan', label: 'Study plan', detail: 'Plan your sessions', icon: CalendarDays },
  { id: 'progress', path: 'analytics', label: 'Analytics', detail: 'Track mastery', icon: BarChart3 },
  { id: 'documents', path: 'documents', label: 'Notes & sources', detail: 'Manage material', icon: PencilLine },
]

export default function ProjectToolsPanel({ projectId, collapsed, onToggle }) {
  const { activeWorkspace, setActiveWorkspace } = useWorkspace()
  if (collapsed) {
    return <aside className="project-side-rail project-tools-rail project-rail-collapsed" aria-label="Open study tools">
      <button type="button" onClick={onToggle} className="project-rail-toggle" title="Open study tools"><PanelRightOpen className="size-4" /></button>
    </aside>
  }

  return <aside className="project-side-rail project-tools-rail" aria-label="Study tools">
    <div className="project-rail-header">
      <div><p className="project-rail-kicker">Workspace</p><h2>Study tools</h2></div>
      <button type="button" onClick={onToggle} className="project-rail-toggle" title="Collapse study tools"><PanelRightClose className="size-4" /></button>
    </div>
    <div className="project-tool-grid">
      {TOOLS.map(({ id, path, label, detail, icon: Icon }) => {
        const active = activeWorkspace === id || (id === 'planner' && activeWorkspace === 'study-plan') || (id === 'progress' && activeWorkspace === 'analytics')
        return <NavLink key={id} to={`/projects/${projectId}/${path}`} onClick={() => setActiveWorkspace(id)} className={`project-tool-card ${active ? 'is-active' : ''}`}>
          <Icon className="size-4" />
          <span><strong>{label}</strong><small>{detail}</small></span>
        </NavLink>
      })}
    </div>
  </aside>
}
