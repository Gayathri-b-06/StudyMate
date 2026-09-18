import React, { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Award,
  TrendingUp,
  Sparkles,
  ArrowRight,
  TrendingDown,
  Minus,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  FileText,
  MessageSquare,
  Search,
  Filter,
  RefreshCw,
  Clock,
  Target,
  BarChart2,
} from 'lucide-react'
import {
  getStudyProgress,
  getProjectMastery,
  getProjectRecommendations,
  getProjectMasteryHistory,
} from '../../lib/progressApi'
import { useWorkspace } from '../../context/WorkspaceContext'
import { CountUp } from '../common/StudyWidgets'

// ─── Semantic Threshold Helpers (50% / 75% App-Wide Standard) ───────────────

export function getMasteryTier(score) {
  const num = Number(score) || 0
  if (num >= 75) {
    return {
      tier: 'mastered',
      label: 'Mastered',
      badgeClass: 'badge-mastered',
      fillClass: 'progress-fill-mastered',
      color: '#059669',
    }
  }
  if (num >= 50) {
    return {
      tier: 'developing',
      label: 'Developing',
      badgeClass: 'badge-developing',
      fillClass: 'progress-fill-developing',
      color: '#D97706',
    }
  }
  return {
    tier: 'attention',
    label: 'Needs Attention',
    badgeClass: 'badge-attention',
    fillClass: 'progress-fill-attention',
    color: '#DC2626',
  }
}

function TrendIcon({ trend }) {
  if (trend === 'improving') {
    return <TrendingUp className="size-3.5 text-emerald-600" />
  }
  if (trend === 'requires_attention') {
    return <TrendingDown className="size-3.5 text-rose-500" />
  }
  return <Minus className="size-3.5 text-slate-400" />
}

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

// ─── SVG Growth Time-Series Chart ───────────────────────────────────────────

const SERIES_COLORS = ['#059669', '#3B82F6', '#D97706', '#8B5CF6', '#EC4899', '#06B6D4']

function GrowthLineChart({ series = [], selectedConcept, onSelectConcept }) {
  const W = 720
  const H = 220
  const PAD = { top: 20, right: 24, bottom: 36, left: 40 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const activeSeriesList = useMemo(() => {
    if (!series || series.length === 0) return []
    if (selectedConcept) {
      const match = series.find((s) => s.concept === selectedConcept)
      return match ? [match] : series
    }
    return series
  }, [series, selectedConcept])

  // Extract all points with valid timestamps across active series
  const allTimestamps = useMemo(() => {
    const tsSet = new Set()
    for (const s of activeSeriesList) {
      for (const p of s.points || []) {
        if (p?.recorded_at) {
          const t = new Date(p.recorded_at).getTime()
          if (!isNaN(t)) tsSet.add(t)
        }
      }
    }
    return Array.from(tsSet).sort((a, b) => a - b)
  }, [activeSeriesList])

  const minTime = allTimestamps[0] || Date.now() - 86400000
  const maxTime = allTimestamps[allTimestamps.length - 1] || Date.now()
  const timeSpan = Math.max(1, maxTime - minTime)

  function getX(recordedAt) {
    const t = new Date(recordedAt).getTime()
    if (isNaN(t) || allTimestamps.length <= 1) return PAD.left + innerW / 2
    return PAD.left + ((t - minTime) / timeSpan) * innerW
  }

  function getY(score) {
    const clamped = Math.max(0, Math.min(100, Number(score) || 0))
    return PAD.top + innerH - (clamped / 100) * innerH
  }

  if (activeSeriesList.length === 0 || allTimestamps.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
        <div className="space-y-1">
          <BarChart2 className="mx-auto size-8 text-slate-300" />
          <p className="text-xs font-semibold text-slate-600">No snapshot history yet</p>
          <p className="text-[11px] text-slate-400">Complete practice quizzes to generate growth trends.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full rounded-2xl border border-slate-200/90 bg-white p-2 shadow-xs"
        aria-label="Concept mastery score progression over time"
      >
        {/* Y-axis horizontal grid lines (0%, 25%, 50%, 75%, 100%) */}
        {[0, 25, 50, 75, 100].map((val) => {
          const y = getY(val)
          const isKeyThreshold = val === 50 || val === 75
          return (
            <g key={val}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y}
                y2={y}
                stroke={isKeyThreshold ? '#CBD5E1' : '#E2E8F0'}
                strokeWidth={isKeyThreshold ? '1.2' : '0.8'}
                strokeDasharray={isKeyThreshold ? '4 3' : undefined}
              />
              <text
                x={PAD.left - 6}
                y={y + 3.5}
                textAnchor="end"
                fontSize="9"
                fill="#94A3B8"
                fontFamily="system-ui, sans-serif"
                className="font-mono-numbers"
              >
                {val}%
              </text>
            </g>
          )
        })}

        {/* X-axis date labels */}
        {allTimestamps.length > 1 && (
          <>
            <text
              x={PAD.left}
              y={H - 8}
              textAnchor="start"
              fontSize="9"
              fill="#94A3B8"
              fontFamily="system-ui, sans-serif"
            >
              {new Date(minTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </text>
            <text
              x={W - PAD.right}
              y={H - 8}
              textAnchor="end"
              fontSize="9"
              fill="#94A3B8"
              fontFamily="system-ui, sans-serif"
            >
              {new Date(maxTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </text>
          </>
        )}

        {/* Series polylines */}
        {activeSeriesList.map((s, idx) => {
          const color = SERIES_COLORS[idx % SERIES_COLORS.length]
          const validPoints = (s.points || []).filter((p) => p && !isNaN(Number(p.score)))
          if (validPoints.length === 0) return null

          const polylinePoints = validPoints
            .map((p) => `${getX(p.recorded_at)},${getY(p.score)}`)
            .join(' ')

          return (
            <g key={s.concept}>
              <polyline
                points={polylinePoints}
                fill="none"
                stroke={color}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {validPoints.map((p, pIdx) => {
                const cx = getX(p.recorded_at)
                const cy = getY(p.score)
                return (
                  <circle
                    key={`${s.concept}-${pIdx}`}
                    cx={cx}
                    cy={cy}
                    r="4"
                    fill="#FFFFFF"
                    stroke={color}
                    strokeWidth="2"
                  >
                    <title>{`${s.concept}: ${Math.round(p.score)}% (${new Date(p.recorded_at).toLocaleDateString()})`}</title>
                  </circle>
                )
              })}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ─── Main Component: ProgressWorkspace ─────────────────────────────────────

export default function ProgressWorkspace({
  progressData = null,
  projectId = null,
  onUseTopic,
}) {
  const { activeProjectId, progressVersion } = useWorkspace()
  const currentProjectId = projectId || activeProjectId

  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') || 'mastery'
  const [activeSubTab, setActiveSubTab] = useState(
    ['mastery', 'growth', 'recommendations'].includes(initialTab) ? initialTab : 'mastery',
  )

  // Sub-tab switcher syncing with URL
  const handleTabChange = (tabKey) => {
    setActiveSubTab(tabKey)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', tabKey)
      return next
    })
  }

  // Data state
  const [masteryList, setMasteryList] = useState([])
  const [isMasteryLoading, setIsMasteryLoading] = useState(false)
  const [recommendations, setRecommendations] = useState([])
  const [isRecsLoading, setIsRecsLoading] = useState(false)
  const [historySeries, setHistorySeries] = useState([])
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [selectedGrowthConcept, setSelectedGrowthConcept] = useState(null)

  // Search & Filter state for Mastery tab
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('lowest') // 'lowest' | 'highest' | 'attempts' | 'alpha'

  // 1. Fetch Concept Mastery
  useEffect(() => {
    if (!currentProjectId) {
      setMasteryList([])
      return
    }
    let cancelled = false
    setIsMasteryLoading(true)
    getProjectMastery(currentProjectId)
      .then((res) => {
        if (!cancelled && res?.concepts) {
          setMasteryList(res.concepts)
        }
      })
      .catch(() => {
        if (!cancelled) setMasteryList([])
      })
      .finally(() => {
        if (!cancelled) setIsMasteryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [currentProjectId, progressVersion])

  // 2. Fetch Growth History
  useEffect(() => {
    if (!currentProjectId) {
      setHistorySeries([])
      return
    }
    let cancelled = false
    setIsHistoryLoading(true)
    getProjectMasteryHistory(currentProjectId)
      .then((res) => {
        if (!cancelled && res?.series) {
          setHistorySeries(res.series)
        }
      })
      .catch(() => {
        if (!cancelled) setHistorySeries([])
      })
      .finally(() => {
        if (!cancelled) setIsHistoryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [currentProjectId, progressVersion])

  // 3. Fetch Recommendations
  useEffect(() => {
    if (!currentProjectId) {
      setRecommendations([])
      return
    }
    let cancelled = false
    setIsRecsLoading(true)
    getProjectRecommendations(currentProjectId)
      .then((res) => {
        if (!cancelled && res?.recommendations) {
          setRecommendations(res.recommendations)
        }
      })
      .catch(() => {
        if (!cancelled) setRecommendations([])
      })
      .finally(() => {
        if (!cancelled) setIsRecsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [currentProjectId, progressVersion])

  // Computed mastery aggregates (using strict 50% / 75% thresholds)
  const stats = useMemo(() => {
    if (!masteryList || masteryList.length === 0) {
      return { total: 0, mastered: 0, developing: 0, attention: 0, overall: 0 }
    }
    let sum = 0
    let mastered = 0
    let developing = 0
    let attention = 0

    for (const item of masteryList) {
      const s = Number(item.score) || 0
      sum += s
      if (s >= 75) mastered++
      else if (s >= 50) developing++
      else attention++
    }

    return {
      total: masteryList.length,
      mastered,
      developing,
      attention,
      overall: Math.round(sum / masteryList.length),
    }
  }, [masteryList])

  // Filtered & Sorted concepts for Mastery view
  const filteredConcepts = useMemo(() => {
    let list = [...masteryList]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter((c) => c.concept.toLowerCase().includes(q))
    }
    list.sort((a, b) => {
      const scoreA = Number(a.score) || 0
      const scoreB = Number(b.score) || 0
      if (sortBy === 'lowest') return scoreA - scoreB
      if (sortBy === 'highest') return scoreB - scoreA
      if (sortBy === 'attempts') return (b.attempt_count || 0) - (a.attempt_count || 0)
      if (sortBy === 'alpha') return a.concept.localeCompare(b.concept)
      return 0
    })
    return list
  }, [masteryList, searchQuery, sortBy])

  // Growth trend counts
  const growthCounts = useMemo(() => {
    let improving = 0
    let attention = 0
    let stable = 0
    for (const s of historySeries) {
      if (s.trend === 'improving') improving++
      else if (s.trend === 'requires_attention') attention++
      else stable++
    }
    return { improving, attention, stable }
  }, [historySeries])

  return (
    <div className="min-h-full w-full bg-[#F8FAF9] p-4 sm:p-6 lg:p-8 font-sans space-y-6">

      {/* ── 1. Page Header & Workspace Sub-Tabs ────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 font-heading">
            Project Analytics & Growth
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Detailed concept mastery levels, historical growth trajectories, and prioritized study actions.
          </p>
        </div>

        {/* 3 Sub-Tabs matching reference architecture */}
        <nav
          className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xs"
          aria-label="Analytics Sub-views"
        >
          <button
            type="button"
            onClick={() => handleTabChange('mastery')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'mastery'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-emerald-800 hover:bg-emerald-50/50'
            }`}
          >
            <Award className="size-3.5" />
            <span>Mastery</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold font-mono-numbers ${
                activeSubTab === 'mastery' ? 'bg-emerald-700/80 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {stats.total}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('growth')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'growth'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-emerald-800 hover:bg-emerald-50/50'
            }`}
          >
            <TrendingUp className="size-3.5" />
            <span>Growth</span>
            {growthCounts.improving > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold font-mono-numbers ${
                  activeSubTab === 'growth' ? 'bg-emerald-700/80 text-white' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                +{growthCounts.improving}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('recommendations')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'recommendations'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-emerald-800 hover:bg-emerald-50/50'
            }`}
          >
            <Sparkles className="size-3.5" />
            <span>Recommendations</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold font-mono-numbers ${
                activeSubTab === 'recommendations'
                  ? 'bg-emerald-700/80 text-white'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {recommendations.length}
            </span>
          </button>
        </nav>
      </div>

      {/* ── 2. KPI Summary Cards (Universal Strip) ─────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card-academic card-lift p-4 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono-numbers">
            Overall Project Mastery
          </span>
          <p className="text-2xl font-black text-emerald-700 font-mono-numbers">
            {stats.overall}%
          </p>
          <span className="text-[11px] text-slate-500 block">EMA weighted average</span>
        </div>

        <div className="card-academic card-lift p-4 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono-numbers">
            Mastered (≥75%)
          </span>
          <p className="text-2xl font-black text-slate-900 font-mono-numbers">
            {stats.mastered} <span className="text-xs font-normal text-slate-400">concepts</span>
          </p>
          <span className="badge-mastered">High Retention</span>
        </div>

        <div className="card-academic card-lift p-4 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono-numbers">
            Developing (50–74%)
          </span>
          <p className="text-2xl font-black text-slate-900 font-mono-numbers">
            {stats.developing} <span className="text-xs font-normal text-slate-400">concepts</span>
          </p>
          <span className="badge-developing">Active Practice</span>
        </div>

        <div className="card-academic card-lift p-4 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono-numbers">
            Needs Attention (&lt;50%)
          </span>
          <p className="text-2xl font-black text-rose-600 font-mono-numbers">
            {stats.attention} <span className="text-xs font-normal text-slate-400">concepts</span>
          </p>
          <span className="badge-attention">Critical Review</span>
        </div>
      </div>

      {/* ── 3. SUB-VIEW 1: MASTERY ──────────────────────────────────────── */}
      {activeSubTab === 'mastery' && (
        <section className="space-y-4">
          {/* Controls Bar: Search & Sort */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 card-academic p-3.5">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 size-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search concepts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-1.5 pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none transition"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <span className="text-xs font-semibold text-slate-500 shrink-0">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label="Sort concepts by"
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-slate-300 focus:outline-none cursor-pointer"
              >
                <option value="lowest">Lowest Mastery First</option>
                <option value="highest">Highest Mastery First</option>
                <option value="attempts">Most Quiz Attempts</option>
                <option value="alpha">Alphabetical</option>
              </select>
            </div>
          </div>

          {/* Concepts Grid / List */}
          {isMasteryLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-pulse">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-28 rounded-2xl bg-slate-200/70" />
              ))}
            </div>
          ) : filteredConcepts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center space-y-2">
              <Award className="mx-auto size-8 text-slate-300" />
              <p className="text-sm font-bold text-slate-800">
                {searchQuery ? 'No concepts matching query' : 'No tracked concepts yet'}
              </p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {searchQuery
                  ? 'Try adjusting your search terms.'
                  : 'Take practice quizzes in the Quiz tab to assess knowledge and build concept mastery.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredConcepts.map((item) => {
                const score = Math.round(Number(item.score) || 0)
                const tier = getMasteryTier(score)
                return (
                  <div
                    key={item.concept}
                    className="card-academic card-lift p-5 space-y-3.5 transition-all hover:border-emerald-300 flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-bold text-slate-900 capitalize truncate">
                          {item.concept}
                        </h3>
                        <span className={tier.badgeClass}>{tier.label}</span>
                      </div>

                      {/* Progress Bar with Semantic Token Class */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-mono-numbers">
                          <span className="text-slate-500 text-[11px]">Mastery Score</span>
                          <span className="font-extrabold text-slate-900">{score}%</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${tier.fillClass}`}
                            style={{ width: `${Math.min(score, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-mono-numbers">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1" title="Growth Trend">
                          <TrendIcon trend={item.trend} />
                          <span className="capitalize">{item.trend?.replace('_', ' ') || 'Stable'}</span>
                        </span>
                        <span>•</span>
                        <span>{item.attempt_count || 1} {item.attempt_count === 1 ? 'quiz' : 'quizzes'}</span>
                      </div>

                      {onUseTopic && (
                        <button
                          type="button"
                          onClick={() => onUseTopic('quiz', item.concept)}
                          className="btn-mint text-[11px] py-1 px-2.5"
                        >
                          Practice Quiz
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* ── 4. SUB-VIEW 2: GROWTH ───────────────────────────────────────── */}
      {activeSubTab === 'growth' && (
        <section className="space-y-6">
          <div className="card-academic p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 font-heading">
                  Growth Trajectory (Score Over Time)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Historical mastery scores captured sequentially from quiz completion checkpoints.
                </p>
              </div>

              {/* Concept Selector Pills */}
              {historySeries.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setSelectedGrowthConcept(null)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                      selectedGrowthConcept === null
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    All Concepts
                  </button>
                  {historySeries.slice(0, 5).map((s) => (
                    <button
                      key={s.concept}
                      type="button"
                      onClick={() => setSelectedGrowthConcept(s.concept)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize transition cursor-pointer ${
                        selectedGrowthConcept === s.concept
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {s.concept}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Line Chart */}
            {isHistoryLoading ? (
              <div className="h-56 rounded-2xl bg-slate-200/70 animate-pulse" />
            ) : (
              <GrowthLineChart
                series={historySeries}
                selectedConcept={selectedGrowthConcept}
                onSelectConcept={setSelectedGrowthConcept}
              />
            )}
          </div>

          {/* Detailed Concept Growth Cards */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Per-Concept Growth Trends</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {historySeries.map((s) => {
                const delta = s.trend_delta !== null && s.trend_delta !== undefined ? s.trend_delta : 0
                const isPositive = delta > 0
                return (
                  <div key={s.concept} className="card-academic card-lift p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 capitalize truncate">
                        {s.concept}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          s.trend === 'improving'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : s.trend === 'requires_attention'
                              ? 'bg-rose-50 text-rose-800 border border-rose-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        <TrendIcon trend={s.trend} />
                        <span className="capitalize">{s.trend?.replace('_', ' ') || 'Stable'}</span>
                      </span>
                    </div>

                    <p className="text-lg font-black text-slate-900 font-mono-numbers">
                      {Math.round(s.current_score)}%
                      {delta !== 0 && (
                        <span
                          className={`ml-2 text-xs font-bold ${
                            isPositive ? 'text-emerald-700' : 'text-rose-600'
                          }`}
                        >
                          {isPositive ? `+${delta}%` : `${delta}%`}
                        </span>
                      )}
                    </p>

                    <p className="text-[11px] text-slate-500">
                      {s.points?.length || 0} historical assessment snapshots recorded.
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── 5. SUB-VIEW 3: RECOMMENDATIONS ─────────────────────────────── */}
      {activeSubTab === 'recommendations' && (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 font-heading">
              Prioritized Study Recommendations
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Explainable diagnostic actions based on gaps in quiz accuracy, low retention, and study streaks.
            </p>
          </div>

          {isRecsLoading ? (
            <div className="space-y-3 animate-pulse">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 rounded-2xl bg-slate-200/70" />
              ))}
            </div>
          ) : recommendations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center space-y-2">
              <Sparkles className="mx-auto size-8 text-emerald-500" />
              <p className="text-sm font-bold text-slate-800">All caught up!</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No immediate gaps detected. Continue your study sessions or review course materials to sustain mastery.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {recommendations.map((rec, index) => {
                const priorityLabels = {
                  1: { label: 'P1 • Urgent Gap', cls: 'badge-rose' },
                  2: { label: 'P2 • Critical Attention', cls: 'badge-rose' },
                  3: { label: 'P3 • Spaced Review', cls: 'badge-amber' },
                  4: { label: 'P4 • Growth Target', cls: 'badge-blue' },
                  5: { label: 'P5 • Mastery Maintenance', cls: 'badge-mint' },
                }
                const pInfo = priorityLabels[rec.priority] || {
                  label: `P${rec.priority} • Recommendation`,
                  cls: 'badge-mint',
                }

                return (
                  <div
                    key={`${rec.concept || 'rec'}-${index}`}
                    className="card-academic card-lift p-5 space-y-3 transition-all hover:border-emerald-300"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={pInfo.cls}>{pInfo.label}</span>
                        {rec.concept && (
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700 capitalize font-mono-numbers">
                            {rec.concept}
                          </span>
                        )}
                      </div>

                      {onUseTopic && rec.concept && (
                        <button
                          type="button"
                          onClick={() => onUseTopic('quiz', rec.concept)}
                          className="btn-emerald text-xs py-1.5 px-3 self-start sm:self-auto"
                        >
                          <span>Take Targeted Quiz</span>
                          <ArrowRight className="size-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Diagnosis & Reason Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="space-y-1">
                        <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px] font-mono-numbers block">
                          Diagnosis
                        </span>
                        <p className="text-slate-900 font-semibold leading-relaxed">
                          {rec.gap_description || rec.action_recommendation}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px] font-mono-numbers block">
                          Why this is recommended
                        </span>
                        <p className="text-slate-600 leading-relaxed">
                          {rec.reason || 'Calculated from historical quiz assessment performance.'}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

    </div>
  )
}
