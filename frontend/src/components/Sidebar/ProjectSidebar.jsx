import { FileText, PanelLeftClose, PanelLeftOpen, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'

/** Project sources rail. It only surfaces existing documents and the existing Documents page. */
export default function ProjectSidebar({ project, projectId, documents = [], collapsed, onToggle }) {
  if (collapsed) {
    return (
      <aside className="project-side-rail project-sources-rail project-rail-collapsed" aria-label="Open project sources">
        <button type="button" onClick={onToggle} className="project-rail-toggle" title="Open sources">
          <PanelLeftOpen className="size-4" />
        </button>
        <Link to={`/projects/${projectId}/documents`} className="project-rail-icon" title="Documents">
          <FileText className="size-4" />
        </Link>
      </aside>
    )
  }

  return (
    <aside className="project-side-rail project-sources-rail" aria-label="Project sources">
      <div className="project-rail-header">
        <div className="min-w-0">
          <p className="project-rail-kicker">{project?.space_name || 'Space'}</p>
          <h1 className="truncate">{project?.name || 'Project'}</h1>
        </div>
        <button type="button" onClick={onToggle} className="project-rail-toggle" title="Collapse sources">
          <PanelLeftClose className="size-4" />
        </button>
      </div>

      <div className="project-rail-section">
        <div className="project-rail-section-title"><span>Sources</span><span>{documents.length}</span></div>
        <div className="project-source-list">
          {documents.length > 0 ? documents.map((document) => (
            <Link key={document.id} to={`/projects/${projectId}/documents`} className="project-source-item" title={document.filename}>
              <FileText className="size-4 shrink-0" />
              <span className="truncate">{document.filename}</span>
            </Link>
          )) : (
            <Link to={`/projects/${projectId}/documents`} className="project-source-empty">
              <Upload className="size-4" />
              <span>Add source PDFs</span>
            </Link>
          )}
        </div>
      </div>

      <Link to={`/projects/${projectId}/documents`} className="project-rail-footer">
        <FileText className="size-4" /> Manage documents
      </Link>
    </aside>
  )
}
