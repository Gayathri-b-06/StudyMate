import { useEffect, useState } from 'react'
import { ArrowRight, Sun, Sprout, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { getGlobalDashboard } from '../api/client'
import { DashboardProfile, DashboardStats, ProgressBar, ProjectCards, ActivityList, StudyFocus } from '../components/Home/DashboardSections'
import { getRecommendationAction } from '../utils/overviewNavigation'
import './HomePage.css'

export default function HomePage() {
  const { user } = useAuth()
  const { setActiveProjectId, setActiveWorkspace } = useWorkspace()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  async function load() {
    setLoading(true); setError('')
    try { setData(await getGlobalDashboard()) }
    catch (err) { setError(err.message || 'Could not load your dashboard.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  const projects = data?.active_projects || []
  const project = data?.last_active_project || projects[0]
  const recommendation = data?.top_recommendation
  const recAction = getRecommendationAction(recommendation)
  function openProject(id, tool = 'overview') {
    if (!id) { navigate('/spaces'); return }
    setActiveProjectId(id); setActiveWorkspace(tool)
    navigate(`/projects/${encodeURIComponent(id)}/${tool}`)
  }
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  return <div className="study-desk"><div className="desk-main"><DashboardProfile /><div className="desk-hero-art" aria-hidden="true" /><main className="desk-content">
    <section className="desk-welcome"><p>{greeting},</p><h1>{user?.name || 'Student'} <Sun /></h1><div>Your learning journey continues. Keep going —<br />progress is built one step at a time.</div><span className="desk-handwriting">Better<br />Learning<br />Ahead ⤴</span></section>
    {error && <div className="desk-load-state" role="alert">{error}<button onClick={load}><RefreshCw />Retry</button></div>}
    {loading && <p role="status" className="desk-load-state">Loading your learning dashboard…</p>}
    {(!loading && !error) && <><DashboardStats stats={data?.stats} />
    <section className="desk-continue"><div><h2>Continue Learning</h2><p>Pick up where you left off and keep building your skills.</p><button onClick={() => openProject(project?.id)}>Continue Learning <ArrowRight /></button></div><div className="desk-continue-progress"><small>{project?.status || 'Ready to begin'}</small><h3>{project?.name || 'Start your learning journey'}</h3><ProgressBar value={project?.progress_pct} /></div><span className="desk-continue-note">Knowledge<br />builds<br />freedom ⤵</span></section>
    <div className="desk-grid"><ProjectCards projects={projects} openProject={openProject} /><ActivityList activity={data?.recent_activity || []} openProject={openProject} /><div className="desk-side-column"><StudyFocus recommendation={recommendation} label={recAction.label} onStart={() => openProject(recommendation?.project_id, recAction.tool)} /><section className="desk-motivation"><Sprout /><div><strong>“Progress, not perfection.”</strong><p>Small steps create big results.</p></div></section></div></div></>}
  </main></div></div>
}
