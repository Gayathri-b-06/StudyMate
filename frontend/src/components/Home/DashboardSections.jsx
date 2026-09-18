import { Link } from 'react-router-dom'
import { BookOpen, FolderOpen, CircleGauge, ClipboardList, Flame, ChevronRight, ArrowRight, Brain, Code, Clock, Check, MessageCircle, FileText, Target, Star } from 'lucide-react'
import UserMenu from '../Header/UserMenu'

export function DashboardProfile() {
  return <header className="desk-profile"><UserMenu /></header>
}

export function ProgressBar({ value = 0 }) {
  const percent = Math.max(0, Math.min(100, Math.round(Number(value) || 0)))
  return <div className="desk-progress"><div role="progressbar" aria-label="Mastery" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div><small>{percent}%</small></div>
}

export function DashboardStats({ stats = {} }) {
  const items = [[FolderOpen, stats.total_projects || 0, 'Total Projects', '/spaces'], [CircleGauge, `${Math.round(stats.overall_mastery || 0)}%`, 'Overall Mastery', '/analytics'], [ClipboardList, stats.total_quizzes_taken || 0, 'Quizzes Taken', '/analytics'], [Flame, stats.study_streak_days || 0, 'Study Streak', '/analytics']]
  return <section className="desk-stats" aria-label="Learning statistics">{items.map(([Icon, value, label, route], index) => <Link to={route} key={label} style={{ animationDelay: `${index * 60}ms` }}><span className={`desk-stat-icon ${index === 3 ? 'gold' : ''}`}><Icon /></span><div><strong>{value}</strong><span>{label}</span></div><ChevronRight className="desk-stat-arrow" /></Link>)}</section>
}

export function Panel({ title, icon: Icon, link, linkText = 'View All', className = '', children }) {
  return <section className={`desk-panel ${className}`}><div className="desk-panel-heading"><h2><Icon />{title}</h2>{link && <Link to={link}>{linkText}<ArrowRight /></Link>}</div>{children}</section>
}

export function ProjectCards({ projects, openProject }) {
  return <Panel title="My Projects" icon={BookOpen} link="/spaces" className="desk-project-panel"><div className="desk-projects">{projects.length ? projects.slice(0,4).map((project,index) => { const Icon = index ? Code : Brain; return <button className="desk-project" key={project.id || project.name} onClick={() => openProject(project.id)}><span className={`desk-tile-icon ${index ? 'blue' : ''}`}><Icon /></span><div><small>{project.space_name}</small><h3>{project.name}</h3><ProgressBar value={project.progress_pct} /><p>{`${project.document_count || 0} study materials · ${project.status || 'Ready to learn'}`}</p></div><ChevronRight /></button> }) : <div className="desk-empty"><BookOpen /><p>Your next chapter starts here.</p><Link to="/spaces">Create your first project <ArrowRight /></Link></div>}</div></Panel>
}

export function ActivityList({ activity, openProject }) {
  const icons = [Check, BookOpen, MessageCircle, FileText]
  return <Panel title="Recent Activity" icon={Clock} link="/analytics" className="desk-activity-panel"><div className="desk-activity">{activity.length ? activity.slice(0,6).map((item,index) => { const Icon = icons[index % icons.length]; return <button key={item.id} onClick={() => openProject(item.project_id, item.event_type === 'quiz_completed' ? 'quiz' : 'overview')}><span className={`desk-activity-icon tone-${index}`}><Icon /></span><div><h3>{item.title}</h3><p>{item.description || item.project_name}</p></div><ChevronRight /></button> }) : <div className="desk-empty"><Clock /><p>Your study activity will appear here.</p></div>}</div></Panel>
}

export function StudyFocus({ recommendation, onStart, label = 'Start Quiz' }) {
  return <Panel title="Study Focus" icon={Target} link="/analytics" linkText="View Recommendations" className="desk-focus"><div className="desk-focus-content"><span className="desk-focus-star"><Star /></span><small>Your next best step</small><p>{recommendation?.action_recommendation || 'Choose a project and start your next learning session.'}</p><button className="desk-green-button" onClick={onStart}>{recommendation ? label : 'Explore Spaces'}<ArrowRight /></button></div></Panel>
}
