import React from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpen,
  Sparkles,
  ArrowRight,
  BrainCircuit,
  FileCheck,
  TrendingUp,
  Target,
  ShieldCheck,
} from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#F8FAF9] text-slate-800 font-sans antialiased selection:bg-emerald-100">
      {/* ── Navigation ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-slate-900">StudyMate</span>
              <span className="text-[10px] text-slate-500 font-medium -mt-0.5">Your AI Learning Companion</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              id="landing-signin-nav-btn"
              className="rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-emerald-700 cursor-pointer"
            >
              Sign In
            </Link>
            <Link
              to="/signup"
              id="landing-signup-nav-btn"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 cursor-pointer"
            >
              <span>Get Started</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero Section ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-8">
            {/* Left: Headline & Copy */}
            <div className="lg:col-span-7 flex flex-col items-start">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 mb-6">
                <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                <span>Grounded Learning & Adaptive Mastery</span>
              </div>

              <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.12]">
                Learn smarter. <br />
                <span className="text-emerald-700">Grow faster.</span>
              </h1>

              <p className="mt-6 text-base sm:text-lg text-slate-600 max-w-xl leading-relaxed">
                Turn your study material into personalized learning, practice, and progress with AI. Grounded strictly in your documents with verified citations.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  to="/signup"
                  id="landing-hero-get-started-btn"
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-bold text-white shadow-xs transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer"
                >
                  <span>Get Started</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/login"
                  id="landing-hero-sign-in-btn"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 hover:border-slate-300 cursor-pointer"
                >
                  <span>Sign In</span>
                </Link>
              </div>

              <div className="mt-8 flex items-center gap-6 text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span>Document-grounded answers</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <FileCheck className="h-4 w-4 text-emerald-600" />
                  <span>No hallucinations or off-topic synthesis</span>
                </div>
              </div>
            </div>

            {/* Right: Academic Architecture Illustration */}
            <div className="lg:col-span-5">
              <div className="relative rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs card-lift">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4 text-xs font-semibold text-slate-500">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-emerald-800">Study Engine</span>
                  <span className="badge-mint">Grounded RAG</span>
                </div>

                {/* Conceptual Card Stack */}
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 shadow-2xs">
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5 font-mono">
                      <span>DOC-01 // Machine_Learning_Lecture_4.pdf</span>
                      <span className="text-slate-600">p. 14-18</span>
                    </div>
                    <p className="text-xs font-medium text-slate-800 leading-snug">
                      &ldquo;Dropout regularizes deep networks by stochastically setting hidden unit activations to zero...&rdquo;
                    </p>
                    <div className="mt-2.5 flex items-center gap-2 text-[11px] text-slate-500">
                      <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                      <span>Retrieved with 94% relevance score</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 shadow-2xs">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-2 font-mono">
                      <span>CONCEPT MASTERY</span>
                      <span className="text-emerald-700 font-bold">82%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-emerald-600" style={{ width: '82%' }} />
                    </div>
                    <div className="mt-2 flex justify-between text-[11px] text-slate-500">
                      <span>Neural Regularization</span>
                      <span className="text-emerald-800 font-bold">Mastered</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/40 p-3 text-center">
                    <span className="text-xs text-emerald-900 font-semibold">
                      Adaptive Question Assessment & Personalized Study Plan
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works Section ────────────────────────────────────── */}
      <section className="border-t border-slate-200/80 bg-slate-50/40 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl mb-14">
            <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              How it works
            </h2>
            <p className="mt-2 text-sm sm:text-base text-slate-600">
              A structured five-step workflow designed to take you from raw course material to confident mastery.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {[
              {
                step: '01',
                title: 'Upload',
                desc: 'Upload course notes, textbook chapters, or lecture slides directly into your project space.',
              },
              {
                step: '02',
                title: 'Understand',
                desc: 'Ask complex questions to an AI tutor grounded strictly in your source documents with citations.',
              },
              {
                step: '03',
                title: 'Practice',
                desc: 'Generate adaptive multiple-choice and open-ended quizzes evaluated against rubric standards.',
              },
              {
                step: '04',
                title: 'Track',
                desc: 'Review quantitative concept mastery and identify knowledge gaps automatically over time.',
              },
              {
                step: '05',
                title: 'Improve',
                desc: 'Receive focused study plans and targeted flashcard sets tailored directly to your weak points.',
              },
            ].map((item) => (
              <div
                key={item.step}
                className="relative rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs card-lift transition hover:border-emerald-300"
              >
                <span className="font-mono text-xs font-bold text-emerald-700">{item.step}</span>
                <h3 className="mt-3 text-sm font-bold text-slate-900">{item.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Core Capabilities ───────────────────────────────────────── */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl mb-14">
            <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Core Capabilities
            </h2>
            <p className="mt-2 text-sm sm:text-base text-slate-600">
              Built for high-retention academic learning and exam preparation.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs card-lift hover:border-emerald-300 transition">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 mb-4">
                <BrainCircuit className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Grounded AI Tutor</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Answers strictly from your uploaded materials with exact citations. Explicitly declines out-of-scope questions.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs card-lift hover:border-emerald-300 transition">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 mb-4">
                <FileCheck className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Adaptive Practice</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Multiple-choice questions and rubric-evaluated open-ended assessments provide in-depth conceptual feedback.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs card-lift hover:border-emerald-300 transition">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 mb-4">
                <TrendingUp className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Concept Mastery</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Automated concept tracking that calculates your retention velocity, confidence level, and mastery score.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs card-lift hover:border-emerald-300 transition">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 mb-4">
                <Target className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Targeted Study Plans</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Actionable study schedules dynamically prioritize identified gaps so you spend time only where you need it most.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final Call to Action ────────────────────────────────────── */}
      <section className="border-t border-slate-200/80 bg-emerald-50/40 py-16">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="font-heading text-3xl font-bold tracking-tight text-slate-900">
            Ready to transform how you study?
          </h2>
          <p className="mt-3 text-sm text-slate-600 max-w-lg mx-auto">
            Experience an AI companion designed specifically for academic rigor, structured retention, and measurable progress.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link
              to="/signup"
              id="landing-final-cta-btn"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-bold text-white shadow-xs transition hover:bg-emerald-700 cursor-pointer"
            >
              <span>Get Started</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200/80 bg-white py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900">StudyMate</span>
            <span>—</span>
            <span>Your AI Learning Companion</span>
          </div>
          <div>
            <span>Academic Learning Companion</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

