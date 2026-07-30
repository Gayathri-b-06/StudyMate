import { useState } from 'react'
import { generateStudyPlan } from '../../lib/plannerApi'

export default function PlannerWorkspace({ documents = [], planData, onPlanUpdate, isExpanded, onToggleExpand, onUseTopic }) {
  const [documentId, setDocumentId] = useState(documents[0]?.id ?? '')
  const [topicsText, setTopicsText] = useState('')
  const [days, setDays] = useState(7)
  const [examDate, setExamDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState({})
  const [open, setOpen] = useState({})
  async function generate() {
    if (!documentId) return
    setLoading(true)
    try { const plan = await generateStudyPlan(documentId, topicsText.split(',').map(x => x.trim()).filter(Boolean), days, examDate); setChecked({}); setOpen({}); onPlanUpdate(plan) } finally { setLoading(false) }
  }
  if (!planData) return <div className="space-y-4"><h2 className="text-sm font-bold text-white">Study Planner</h2><p className="text-xs text-slate-500">No study plan yet — ask in chat or create one here.</p><select value={documentId} onChange={e=>setDocumentId(e.target.value)} className="w-full rounded bg-slate-800 p-2 text-sm">{documents.map(d=><option key={d.id} value={d.id}>{d.filename}</option>)}</select><input value={topicsText} onChange={e=>setTopicsText(e.target.value)} placeholder="Topics, optional (comma separated)" className="w-full rounded bg-slate-800 p-2 text-sm"/><input type="number" min="1" max="30" value={days} onChange={e=>setDays(+e.target.value)} className="w-full rounded bg-slate-800 p-2 text-sm"/><input type="date" value={examDate} onChange={e=>setExamDate(e.target.value)} className="w-full rounded bg-slate-800 p-2 text-sm"/><button disabled={loading || !documentId} onClick={generate} className="w-full rounded bg-violet-600 p-2 text-sm font-semibold">{loading ? 'Generating…' : 'Generate plan'}</button></div>
  const tasks = planData.days.flatMap(day => day.tasks.map((task, index) => `${day.day}-${index}`)); const done = tasks.filter(key => checked[key]).length
  return <div className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-sm font-bold">{planData.num_days}-day plan</h2><div className="flex gap-2"><button onClick={onToggleExpand} className="text-xs text-violet-300">{isExpanded?'Collapse':'Expand'}</button><button onClick={generate} className="text-xs text-violet-300">Regenerate</button><button onClick={()=>onPlanUpdate(null)} className="text-xs text-violet-300">+ New</button></div></div><div className="h-2 overflow-hidden rounded bg-slate-800"><div className="h-full bg-violet-500" style={{width:`${tasks.length ? done/tasks.length*100 : 0}%`}}/></div><p className="text-xs text-slate-500">{done}/{tasks.length} tasks complete</p>{planData.days.map(day=><section key={day.day} className="rounded border border-slate-800 bg-slate-900 p-3"><button onClick={()=>setOpen(p=>({...p,[day.day]:!p[day.day]}))} className="w-full text-left"><b>Day {day.day}</b> <span className="text-xs text-slate-400">{day.focus}</span></button>{open[day.day] && <div className="mt-3 space-y-2"><div className="flex flex-wrap gap-1">{day.topics.map(t=><span key={t} className="rounded bg-violet-500/15 px-2 py-1 text-xs text-violet-300">{t}</span>)}</div>{day.tasks.map((task,i)=>{const key=`${day.day}-${i}`;return <label key={key} className="flex gap-2 text-sm"><input type="checkbox" checked={!!checked[key]} onChange={()=>setChecked(p=>({...p,[key]:!p[key]}))}/>{task}</label>})}<div className="flex gap-2"><button onClick={()=>onUseTopic('quiz',day.topics[0])} className="text-xs text-violet-300">Quiz Me</button><button onClick={()=>onUseTopic('flashcards',day.topics[0])} className="text-xs text-violet-300">Flashcards</button></div></div>}</section>)}</div>
}
