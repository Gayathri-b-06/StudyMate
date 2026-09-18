import { useEffect, useState } from 'react'
import { generateStudyPlan } from '../../lib/plannerApi'
import IndexTab from '../common/IndexTab'

function CalendarIcon() {
  return (
    <svg className="size-5 text-emerald-700 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
    </svg>
  )
}

export default function PlannerWorkspace({
  documents = [],
  planData,
  onPlanUpdate,
  isExpanded,
  onToggleExpand,
  onUseTopic,
}) {
  const [documentId, setDocumentId] = useState(documents[0]?.id ?? '')
  const [topicsText, setTopicsText] = useState('')
  const [days, setDays] = useState(7)
  const [examDate, setExamDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState({})
  const [open, setOpen] = useState({})
  const [localPlanData, setLocalPlanData] = useState(planData)

  useEffect(() => {
    if (planData) setLocalPlanData(planData)
  }, [planData])

  const activePlan = localPlanData || planData

  // Keep documentId valid when documents prop updates
  useEffect(() => {
    if (documents.length > 0 && (!documentId || (documentId !== 'all' && !documents.some((d) => d.id === documentId)))) {
      setDocumentId(documents.length > 1 ? 'all' : documents[0].id)
    }
  }, [documents, documentId])

  const effectiveDocId = documentId || (documents.length > 1 ? 'all' : (documents[0]?.id ?? ''))

  async function generate() {
    const targetDocId = effectiveDocId === 'all' ? documents[0]?.id : effectiveDocId
    if (!targetDocId) return
    setLoading(true)
    try {
      const plan = await generateStudyPlan(
        targetDocId,
        topicsText.split(',').map((x) => x.trim()).filter(Boolean),
        days,
        examDate
      )
      setChecked({})
      setOpen({})
      setLocalPlanData(plan)
      if (onPlanUpdate) onPlanUpdate(plan)
    } finally {
      setLoading(false)
    }
  }

  // Setup Stage View
  if (!activePlan) {
    return (
      <div className="study-setup space-y-5 max-w-xl mx-auto p-4 animate-fade-in text-slate-800 font-sans">
        {/* Header Card */}
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 shadow-2xs">
            <CalendarIcon />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Build Study Plan</h2>
            <p className="text-xs text-slate-500">Generate a structured day-by-day revision schedule grounded in your PDFs</p>
          </div>
        </div>

        {/* Setup Form Card */}
        <div className="space-y-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
          {/* Source Document Selection */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">
              Source Document ({documents.length} Uploaded)
            </label>
            <select
              value={effectiveDocId}
              onChange={(e) => setDocumentId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
            >
              {documents.length > 1 && (
                <option value="all">📚 All Thread PDFs ({documents.length} Files Combined)</option>
              )}
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  📄 {d.filename}
                </option>
              ))}
            </select>
          </div>

          {/* Topics Input */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">
              Topics / Focus Areas (Optional, comma-separated)
            </label>
            <input
              value={topicsText}
              onChange={(e) => setTopicsText(e.target.value)}
              placeholder="e.g. Chapter 1, Regression, Neural Networks"
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
            />
          </div>

          {/* Days & Exam Date Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Duration (Days)
              </label>
              <input
                type="number"
                min="1"
                max="30"
                value={days}
                onChange={(e) => setDays(+e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-mono-numbers text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Exam Target Date
              </label>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            disabled={loading || !effectiveDocId}
            onClick={generate}
            className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-50 focus-visible mt-2 cursor-pointer"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Generating Schedule…
              </span>
            ) : (
              'Generate Study Plan'
            )}
          </button>
        </div>
      </div>
    )
  }

  // Result Stage View
  const daysList = Array.isArray(activePlan?.days) ? activePlan.days : []
  const tasks = daysList.flatMap((day) =>
    (day.tasks || []).map((_, index) => `${day.day}-${index}`)
  )
  const done = tasks.filter((key) => checked[key]).length

  return (
    <div className="study-plan space-y-5 p-4 max-w-2xl mx-auto text-slate-800 font-sans animate-fade-in">
      {/* ── Plan Header & Progress Bar ────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="badge-mint">{activePlan.num_days ?? daysList.length}-Day Plan</span>
            <span className="text-xs text-slate-500 font-mono-numbers font-medium">
              {done} / {tasks.length} tasks completed
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs font-semibold">
            {onToggleExpand && (
              <button onClick={onToggleExpand} className="text-slate-600 hover:text-emerald-700 transition cursor-pointer">
                {isExpanded ? 'Collapse' : 'Expand'}
              </button>
            )}
            <button onClick={generate} className="text-emerald-700 font-semibold hover:underline cursor-pointer">
              Regenerate
            </button>
            <button
              onClick={() => {
                setLocalPlanData(null)
                if (onPlanUpdate) onPlanUpdate(null)
              }}
              className="text-slate-600 hover:text-emerald-700 transition cursor-pointer"
            >
              + New Plan
            </button>
          </div>
        </div>

        {/* Progress Track */}
        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden border border-slate-200/60">
          <div
            className="h-full bg-emerald-600 transition-all duration-300 ease-out"
            style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* ── Day Cards List ───────────────────────────────────────── */}
      <div className="study-plan-timeline space-y-4">
        {daysList.map((day) => (
          <section
            key={day.day}
            className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs card-lift space-y-3 transition hover:border-emerald-300"
          >
            <button
              onClick={() => setOpen((p) => ({ ...p, [day.day]: !p[day.day] }))}
              className="flex w-full items-center justify-between text-left focus-visible rounded-lg p-1 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <IndexTab variant="neutral">Day {day.day}</IndexTab>
                <span className="text-sm font-semibold text-slate-900">
                  {day.focus}
                </span>
              </div>
              <span className="text-xs text-slate-400 font-mono-numbers">
                {open[day.day] ? '▲' : '▼'}
              </span>
            </button>

            {open[day.day] && (
              <div className="space-y-3 pt-3 border-t border-slate-100 animate-accordion-down">
                {/* Day Topic Chips */}
                <div className="flex flex-wrap gap-1.5">
                  {(day.topics || []).map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-900"
                    >
                      {t}
                    </span>
                  ))}
                </div>

                {/* Day Tasks Checklist */}
                <div className="space-y-2">
                  {(day.tasks || []).map((task, i) => {
                    const key = `${day.day}-${i}`
                    const isChecked = !!checked[key]
                    return (
                      <label
                        key={key}
                        className="flex items-start gap-2.5 text-xs text-slate-800 cursor-pointer select-none rounded-lg p-1.5 hover:bg-slate-50 transition"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => setChecked((p) => ({ ...p, [key]: !p[key] }))}
                          className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/20 cursor-pointer"
                        />
                        <span className={isChecked ? 'line-through text-slate-400 font-normal' : 'leading-relaxed font-normal'}>
                          {task}
                        </span>
                      </label>
                    )
                  })}
                </div>

                {/* Topic-specific quick actions */}
                {onUseTopic && day.topics?.length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2">
                    {day.topics.map((topic) => (
                      <div key={topic} className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => onUseTopic('quiz', topic, activePlan.document_id)}
                          className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>Quiz: {topic} →</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onUseTopic('flashcards', topic, activePlan.document_id)}
                          className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>Flashcards: {topic} →</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}

