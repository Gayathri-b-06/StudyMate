/**
 * StudyWidgets — Shared micro-components used across Progress and Overview workspaces.
 *
 * Keeping CountUp and TrendBadge here (not inlined in each workspace) means
 * styling changes to badges and counters propagate everywhere from one file.
 */

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

// ---------------------------------------------------------------------------
// CountUp
// ---------------------------------------------------------------------------

/**
 * Animates a number from 0 → `end` over `duration` ms.
 * @param {{ end: number, duration?: number }} props
 */
export function CountUp({ end = 0, duration = 600 }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let startTimestamp = null
    const endValue = Number(end) || 0

    function step(timestamp) {
      if (!startTimestamp) startTimestamp = timestamp
      const progress = Math.min((timestamp - startTimestamp) / duration, 1)
      setCount(Math.floor(progress * endValue))
      if (progress < 1) {
        window.requestAnimationFrame(step)
      } else {
        setCount(endValue)
      }
    }

    window.requestAnimationFrame(step)
  }, [end, duration])

  return <span className="font-mono-numbers">{count}</span>
}

// ---------------------------------------------------------------------------
// TrendBadge
// ---------------------------------------------------------------------------

/**
 * Displays a coloured badge reflecting the growth trend of a mastery item.
 *
 * Expected shape of `item`:
 *   - trend: 'improving' | 'stable' | 'requires_attention' | 'insufficient_data' | null
 *   - trend_delta: number | null
 *   - snapshot_count: number | undefined
 *   - attempt_count: number | undefined
 *
 * @param {{ item: object }} props
 */
export function TrendBadge({ item }) {
  if (!item.trend || item.trend === 'insufficient_data') {
    const count = item.snapshot_count ?? item.attempt_count ?? 0
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-mono-numbers text-[var(--text-muted)] px-2 py-0.5 rounded-full border border-dashed border-[var(--border-strong)] bg-[var(--surface-1)]"
        title="At least 3 quiz sessions needed to establish a trend"
      >
        <span>Trend: {count}/3 quizzes</span>
      </span>
    )
  }

  if (item.trend === 'improving') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-black text-white border border-black shadow-xs">
        <TrendingUp className="size-3 shrink-0 stroke-[2.5]" />
        <span>Improving</span>
        {item.trend_delta !== null && item.trend_delta !== undefined && (
          <span className="font-mono-numbers text-[9px] opacity-90">
            ({item.trend_delta > 0 ? `+${item.trend_delta}%` : `${item.trend_delta}%`})
          </span>
        )}
      </span>
    )
  }

  if (item.trend === 'requires_attention') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border-2 border-black bg-[var(--surface-1)] text-black shadow-xs">
        <TrendingDown className="size-3 shrink-0 stroke-[2.5]" />
        <span>Attention</span>
        {item.trend_delta !== null && item.trend_delta !== undefined && (
          <span className="font-mono-numbers text-[9px]">
            ({item.trend_delta}%)
          </span>
        )}
      </span>
    )
  }

  // stable
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text-primary)]">
      <Minus className="size-3 shrink-0 stroke-[2]" />
      <span>Stable</span>
    </span>
  )
}
