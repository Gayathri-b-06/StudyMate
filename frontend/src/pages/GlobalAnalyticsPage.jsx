import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RefreshCw,
  AlertCircle,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  Minus,
  CircleGauge,
  FolderOpen,
  Brain,
  ClipboardCheck,
  Sprout,
} from 'lucide-react'
import './GlobalAnalyticsPage.css'
import GlobalTopBar from '../components/Header/GlobalTopBar'
import { getGlobalDashboard } from '../api/client'
import { useWorkspace } from '../context/WorkspaceContext'

// ─── helpers ────────────────────────────────────────────────────────────────

function formatTimeAgo(dateStr) {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return '—'
  const now = new Date()
  const diffMs = now - date
  if (isNaN(diffMs)) return '—'
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

function masteryStatus(score) {
  if (score >= 75) return 'Strong'
  if (score >= 40) return 'Developing'
  return 'Needs Attention'
}

function StatusBadge({ score }) {
  const label = masteryStatus(score)
  const cls =
    label === 'Strong'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : label === 'Developing'
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : 'bg-rose-50 text-rose-800 border-rose-200'
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${cls}`}
    >
      {label}
    </span>
  )
}

function TrendIcon({ trend }) {
  if (trend === 'improving') return <TrendingUp className="size-3.5 text-emerald-600" />
  if (trend === 'requires_attention') return <TrendingDown className="size-3.5 text-rose-500" />
  return <Minus className="size-3.5 text-slate-400" />
}

// ─── SVG Activity Sparkline ──────────────────────────────────────────────────

function ActivityChart({ activities = [] }) {
  const W = 600
  const H = 120
  const PAD = { top: 12, right: 16, bottom: 28, left: 32 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  // Build 7-day buckets
  const days = useMemo(() => {
    const now = new Date()
    const buckets = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now)
      d.setDate(d.getDate() - (6 - i))
      return {
        label: d.toLocaleDateString(undefined, { weekday: 'short' }),
        date: d.toDateString(),
        tutor: 0,
        quiz: 0,
        session: 0,
      }
    })
    if (Array.isArray(activities)) {
      for (const act of activities) {
        if (!act?.timestamp) continue
        const dateObj = new Date(act.timestamp)
        if (isNaN(dateObj.getTime())) continue
        const d = dateObj.toDateString()
        const bucket = buckets.find((b) => b.date === d)
        if (!bucket) continue
        if (act.event_type === 'quiz_completed') bucket.quiz++
        else if (act.event_type === 'question_answered') bucket.tutor++
        else bucket.session++
      }
    }
    return buckets
  }, [activities])

  const series = [
    { key: 'tutor', label: 'Tutor Questions', color: '#27694d' },
    { key: 'quiz', label: 'Quiz Attempts', color: '#7a9f85' },
    { key: 'session', label: 'Study Sessions', color: '#c19b52' },
  ]

  const maxVal = Math.max(1, ...days.flatMap((d) => series.map((s) => d[s.key])))

  function points(key) {
    return days
      .map((d, i) => {
        const x = PAD.left + (i / (days.length - 1)) * innerW
        const y = PAD.top + innerH - (d[key] / maxVal) * innerH
        return `${x},${y}`
      })
      .join(' ')
  }

  return (
    <div className="analytics-chart space-y-3">
      <div className="analytics-legend flex items-center gap-4 flex-wrap">
        {series.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-4 rounded-sm"
              style={{ background: s.color }}
            />
            <span className="text-xs font-medium text-slate-600">{s.label}</span>
          </div>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        aria-label="Learning activity over the last 7 days"
      >
        {/* Grid lines */}
        {[0, 0.5, 1].map((frac) => {
          const y = PAD.top + (1 - frac) * innerH
          return (
            <line
              key={frac}
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y}
              y2={y}
              stroke="#dfe8d9"
              strokeWidth="1"
            />
          )
        })}

        {/* Day labels */}
        {days.map((d, i) => {
          const x = PAD.left + (i / (days.length - 1)) * innerW
          return (
            <text
              key={d.date}
              x={x}
              y={H - 6}
              textAnchor="middle"
              fontSize="10"
              fill="#75907b"
              fontFamily="system-ui, sans-serif"
            >
              {d.label}
            </text>
          )
        })}

        {/* Y-axis label */}
        <text
          x={PAD.left - 4}
          y={PAD.top}
          textAnchor="end"
          fontSize="9"
          fill="#75907b"
          fontFamily="system-ui, sans-serif"
        >
          {maxVal}
        </text>

        {/* Series lines */}
        {series.map((s) => (
          <polyline
            key={s.key}
            points={points(s.key)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.key === 'tutor' ? '2.5' : '1.5'}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={s.key === 'session' ? '4 3' : undefined}
          />
        ))}

        {/* Dots for primary series */}
        {days.map((d, i) => {
          const x = PAD.left + (i / (days.length - 1)) * innerW
          const y = PAD.top + innerH - (d.tutor / maxVal) * innerH
          return (
            <circle key={d.date} cx={x} cy={y} r="3" fill="#27694d" />
          )
        })}
      </svg>
    </div>
  )
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="analytics-page min-h-screen bg-[#F8FAF9] font-sans">
      <GlobalTopBar />
      <main className="analytics-content mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10 space-y-8 animate-pulse">
        <div className="h-14 w-80 rounded-xl bg-slate-200/70" />
        <div className="analytics-kpis grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-white border border-slate-200/90" />
          ))}
        </div>
        <div className="h-44 rounded-2xl bg-white border border-slate-200/90" />
        <div className="h-64 rounded-2xl bg-white border border-slate-200/90" />
        <div className="h-48 rounded-2xl bg-white border border-slate-200/90" />
      </main>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function GlobalAnalyticsPage() {
  const { setActiveProjectId, setActiveWorkspace } = useWorkspace()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await getGlobalDashboard(true)
      setData(d)
    } catch (err) {
      setError(err?.message || 'Failed to load analytics.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const stats = data?.stats ?? {}
  const activeProjects = Array.isArray(data?.active_projects) ? data.active_projects.filter(Boolean) : []
  const difficultConcepts = Array.isArray(data?.difficult_concepts) ? data.difficult_concepts.filter(Boolean) : []
  const recentActivity = Array.isArray(data?.recent_activity) ? data.recent_activity.filter(Boolean) : []

  // Sort concepts: lowest mastery first (Needs Attention at top)
  const sortedConcepts = useMemo(() => {
    return [...difficultConcepts].sort(
      (a, b) => (Number(a.mastery_score) || 0) - (Number(b.mastery_score) || 0),
    )
  }, [difficultConcepts])

  // Derive last-assessed per concept from activity feed
  const lastAssessedMap = useMemo(() => {
    const map = {}
    for (const act of recentActivity) {
      if (act?.event_type === 'quiz_completed' && act?.project_id && act?.timestamp) {
        const key = act.project_id
        const actDate = new Date(act.timestamp)
        if (!isNaN(actDate.getTime())) {
          if (!map[key] || actDate > new Date(map[key])) {
            map[key] = act.timestamp
          }
        }
      }
    }
    return map
  }, [recentActivity])

  const openProject = (projectId, tool = 'overview') => {
    if (!projectId) return
    setActiveProjectId(projectId)
    setActiveWorkspace(tool)
    navigate(`/projects/${projectId}/${tool}`)
  }

  if (loading) return <Skeleton />

  if (error && !data) {
    return (
      <div className="analytics-page min-h-screen bg-[#F8FAF9] font-sans">
        <GlobalTopBar />
        <main className="mx-auto max-w-xl px-4 py-24 text-center">
          <AlertCircle className="mx-auto mb-4 size-10 text-rose-500" />
          <h2 className="text-lg font-bold text-slate-900 mb-2">Unable to Load Analytics</h2>
          <p className="text-sm text-slate-500 mb-6">{error}</p>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 transition cursor-pointer shadow-xs"
          >
            <RefreshCw className="size-4" />
            Retry
          </button>
        </main>
      </div>
    )
  }

  const KPIs = [
    {
      label: 'Overall Mastery',
      icon: CircleGauge,
      value: `${Math.round(stats.overall_mastery ?? 0)}%`,
      isPrimary: true,
    },
    {
      label: 'Active Projects',
      icon: FolderOpen,
      value: activeProjects.length,
    },
    {
      label: 'Concepts Tracked',
      icon: Brain,
      value: stats.total_topics_studied ?? 0,
    },
    {
      label: 'Assessments Completed',
      icon: ClipboardCheck,
      value: stats.total_quizzes_taken ?? 0,
    },
  ]

  return (
    <div className="analytics-page min-h-screen bg-[#F8FAF9] font-sans text-slate-800">
      <GlobalTopBar />

      <main className="analytics-content mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10 space-y-10">
        <Sprout className="analytics-botanical" aria-hidden="true" />

        {/* ── 1. Header ──────────────────────────────────────────────── */}
        <div className="analytics-heading flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 font-heading">
              Global Analytics
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Track your learning progress and mastery across all projects.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition cursor-pointer shrink-0 shadow-2xs"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </button>
        </div>

        {/* ── 2. KPI Summary Cards ───────────────────────────────────── */}
        <div className="analytics-kpis grid grid-cols-2 sm:grid-cols-4 gap-4">
          {KPIs.map((kpi) => (
            <div
              key={kpi.label}
              className="analytics-kpi rounded-2xl border border-slate-200/90 bg-white p-5 space-y-1 shadow-xs card-lift transition-all hover:border-emerald-300"
            >
              <span className="analytics-kpi-icon"><kpi.icon aria-hidden="true" /></span>
              <p className={`text-3xl font-black font-mono-numbers leading-none ${kpi.isPrimary ? 'text-emerald-700' : 'text-slate-900'}`}>
                {kpi.value}
              </p>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {kpi.label}
              </p>
            </div>
          ))}
        </div>

        {/* ── 3. Learning Activity Chart ─────────────────────────────── */}
        <section className="analytics-panel analytics-activity rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs card-lift space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Learning Activity</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tutor questions, quiz attempts, and study sessions — last 7 days.
            </p>
          </div>
          {recentActivity.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">
              No activity data yet. Start studying to see your chart.
            </p>
          ) : (
            <ActivityChart activities={recentActivity} />
          )}
        </section>

        {/* ── 4. Concept Mastery Overview (focal point) ─────────────── */}
        <section className="analytics-panel space-y-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Concept Mastery Overview</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Sorted by lowest mastery first — focus on items needing attention.
            </p>
          </div>

          {sortedConcepts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-10 text-center text-xs text-slate-400 shadow-xs">
              No concepts tracked yet. Complete quizzes to populate this table.
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
              {/* Table header */}
              <div className="analytics-table-head hidden sm:grid grid-cols-[2fr_3fr_140px_120px_110px] gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <span>Project</span>
                <span>Concept</span>
                <span>Mastery</span>
                <span>Status</span>
                <span>Last Assessed</span>
              </div>

              <div className="divide-y divide-slate-100">
                {sortedConcepts.map((item, idx) => {
                  const lastTs = lastAssessedMap[item.project_id]
                  const mastery = Math.round(item.mastery_score)
                  return (
                    <div
                      key={`${item.project_id}-${item.concept}-${idx}`}
                      className="analytics-concept-row grid sm:grid-cols-[2fr_3fr_140px_120px_110px] gap-3 items-center px-5 py-3.5 hover:bg-emerald-50/20 transition"
                    >
                      {/* Project */}
                      <span className="text-xs text-slate-500 truncate font-medium">
                        {item.project_name}
                      </span>

                      {/* Concept */}
                      <span className="text-sm font-semibold text-slate-900 truncate">
                        {item.concept}
                      </span>

                      {/* Mastery with bar */}
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden min-w-0">
                          <div
                            className="h-full rounded-full bg-emerald-600 transition-all"
                            style={{ width: `${Math.min(mastery, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-slate-800 font-mono-numbers shrink-0 w-9 text-right">
                          {mastery}%
                        </span>
                      </div>

                      {/* Status */}
                      <span>
                        <StatusBadge score={mastery} />
                      </span>

                      {/* Last assessed */}
                      <span className="text-xs text-slate-400 font-mono-numbers">
                        {lastTs ? formatTimeAgo(lastTs) : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        {/* ── 5. Project Progress ────────────────────────────────────── */}
        <section className="analytics-panel space-y-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Project Progress</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Overall mastery, documents, and assessments per project.
            </p>
          </div>

          {activeProjects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-10 text-center text-xs text-slate-400 shadow-xs">
              No active projects yet.
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden divide-y divide-slate-100">
              {activeProjects.map((proj) => {
                const mastery = Math.round(proj.progress_pct ?? 0)
                return (
                  <div
                    key={proj.id}
                    className="analytics-project-row flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 px-5 py-4 hover:bg-emerald-50/20 transition group cursor-pointer"
                    role="link"
                    tabIndex={0}
                    aria-label={`Open ${proj.name}`}
                    onKeyDown={(event) => { if (event.key === 'Enter') openProject(proj.id, 'overview') }}
                    onClick={() => openProject(proj.id, 'overview')}
                  >
                    {/* Name + space */}
                    <div className="min-w-0 sm:w-52 shrink-0">
                      <p className="text-sm font-semibold text-slate-900 truncate group-hover:text-emerald-700 transition">
                        {proj.name}
                      </p>
                      <p className="text-xs text-slate-400 truncate">{proj.space_name}</p>
                    </div>

                    {/* Mastery bar */}
                    <div className="flex flex-1 items-center gap-3 min-w-0">
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-600 transition-all"
                          style={{ width: `${Math.min(mastery, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-800 font-mono-numbers w-9 text-right shrink-0">
                        {mastery}%
                      </span>
                    </div>

                    {/* Meta */}
                    <div className="flex items-center gap-4 shrink-0 text-xs text-slate-500 font-mono-numbers">
                      <span>{proj.document_count} docs</span>
                      <span>{proj.thread_count} threads</span>
                      <StatusBadge score={mastery} />
                    </div>

                    {/* Open link */}
                    <ArrowUpRight className="size-4 text-slate-300 group-hover:text-emerald-600 transition shrink-0 hidden sm:block" />
                  </div>
                )
              })}
            </div>
          )}
        </section>

      </main>
    </div>
  )
}

