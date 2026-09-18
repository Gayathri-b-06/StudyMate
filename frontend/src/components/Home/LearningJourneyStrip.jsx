import React from 'react'
import { FileText, Bot, BookOpen, Target, Trophy, TrendingUp, ArrowRight } from 'lucide-react'

const JOURNEY_STEPS = [
  { label: 'Material', icon: FileText, bg: 'bg-blue-50 text-blue-600' },
  { label: 'AI Tutor', icon: Bot, bg: 'bg-indigo-50 text-indigo-600' },
  { label: 'Practice', icon: BookOpen, bg: 'bg-blue-50 text-blue-600' },
  { label: 'Assessment', icon: Target, bg: 'bg-purple-50 text-purple-600' },
  { label: 'Mastery', icon: Trophy, bg: 'bg-indigo-50 text-indigo-600' },
  { label: 'Growth', icon: TrendingUp, bg: 'bg-blue-50 text-blue-600' },
]

export default function LearningJourneyStrip() {
  return (
    <section className="w-full" aria-label="StudyMate Learning Journey">
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 sm:p-6 shadow-xs transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Left: Heading & Subtitle */}
          <div className="shrink-0">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900 tracking-tight">
              StudyMate Method
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Your complete learning journey, from study material to real growth.
            </p>
          </div>

          {/* Right: Steps Progression */}
          <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-2 lg:pb-0 scrollbar-none">
            {JOURNEY_STEPS.map((step, idx) => {
              const Icon = step.icon
              const isLast = idx === JOURNEY_STEPS.length - 1
              return (
                <div key={step.label} className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-xl ${step.bg} transition-transform hover:scale-105`}
                    >
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <span className="text-xs sm:text-sm font-semibold text-zinc-800 whitespace-nowrap">
                      {step.label}
                    </span>
                  </div>
                  {!isLast && (
                    <ArrowRight className="h-3.5 w-3.5 text-zinc-300 shrink-0 mx-1" />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
