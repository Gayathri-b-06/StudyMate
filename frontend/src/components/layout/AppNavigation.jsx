import { useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { BookOpen, Home, LayoutGrid, ChartNoAxesCombined, Shield, Sprout, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import './AppNavigation.css'

export default function AppNavigation({ children }) {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('studymate_sidebar_collapsed') === 'true' } catch { return false }
  })
  const [mobileOpen, setMobileOpen] = useState(false)
  const publicPage = ['/', '/login', '/signup'].includes(pathname)
  if (!user || publicPage) return children
  const links = [[Home, 'Home', '/home'], [LayoutGrid, 'Spaces', '/spaces'], [ChartNoAxesCombined, 'Analytics', '/analytics'], ...(user.role === 'admin' ? [[Shield, 'Admin', '/admin']] : [])]
  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem('studymate_sidebar_collapsed', String(next)) } catch { /* In-memory preference remains usable. */ }
  }
  return <div className={`app-navigation ${collapsed ? 'nav-collapsed' : ''} ${mobileOpen ? 'nav-mobile-open' : ''}`}>
    <button className="app-mobile-toggle" aria-label="Open navigation" aria-controls="app-sidebar" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><PanelLeftOpen /></button>
    {mobileOpen && <button className="app-nav-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside id="app-sidebar" className="app-sidebar" aria-label="Main sidebar" onKeyDown={(event) => { if (event.key === 'Escape') setMobileOpen(false) }}>
      <Link to="/home" className="app-nav-brand" aria-label="StudyMate home" onClick={() => setMobileOpen(false)}><span><BookOpen /></span><div><strong>StudyMate</strong><small>AI STUDY COMPANION</small></div></Link>
      <button className="app-sidebar-toggle" onClick={toggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} aria-controls="app-sidebar" title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button>
      <button className="app-mobile-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X /></button>
      <nav aria-label="Main navigation">{links.map(([Icon,label,path]) => <NavLink key={path} to={path} title={label} aria-label={label} className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setMobileOpen(false)}><Icon /><span>{label}</span></NavLink>)}</nav>
      <div className="app-sidebar-note"><Sprout /><p>Small steps<br />every day make<br />big progress.</p></div>
    </aside>
    <div className="app-route-content">{children}</div>
  </div>
}
