import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Target, CheckCircle2, BookOpen, Lightbulb } from 'lucide-react'
import heroTutorImg from '../../assets/hero-tutor.jpg'

export default function HeroIllustration({
  masteryScore = null,
  accuracyScore = null,
  conceptsReviewedCount = 0,
}) {
  const shouldReduceMotion = useReducedMotion()

  // Gentle floating animation variants
  const floatVariant1 = shouldReduceMotion
    ? {}
    : {
        animate: {
          y: [0, -7, 0],
          transition: { duration: 4.8, repeat: Infinity, ease: 'easeInOut' },
        },
      }

  const floatVariant2 = shouldReduceMotion
    ? {}
    : {
        animate: {
          y: [0, 8, 0],
          transition: { duration: 5.5, repeat: Infinity, ease: 'easeInOut', delay: 0.6 },
        },
      }

  const floatVariant3 = shouldReduceMotion
    ? {}
    : {
        animate: {
          y: [0, -6, 0],
          transition: { duration: 5.0, repeat: Infinity, ease: 'easeInOut', delay: 1.2 },
        },
      }

  const pulseVariant = shouldReduceMotion
    ? {}
    : {
        animate: {
          scale: [1, 1.1, 1],
          opacity: [0.85, 1, 0.85],
          transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
        },
      }

  return (
    <div className="relative w-full max-w-[620px] mx-auto select-none py-2 px-2 sm:px-4">
      {/* ── Soft Ambient Glow / Aura ────────────────────────────────── */}
      <div className="absolute -inset-6 bg-gradient-to-tr from-indigo-100/60 via-purple-100/40 to-blue-50/50 rounded-full filter blur-3xl pointer-events-none -z-10" />

      {/* ── Decorative Dotted Orbit ─────────────────────────────────── */}
      <svg
        className="absolute -top-4 -left-6 w-36 h-36 text-indigo-300/50 pointer-events-none -z-10 hidden sm:block"
        viewBox="0 0 100 100"
        fill="none"
      >
        <path
          d="M 10,80 Q 30,10 90,20"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="4 6"
          strokeLinecap="round"
        />
        <circle cx="90" cy="20" r="3" fill="#6366F1" />
      </svg>

      {/* ── Decorative Lightbulb (Idea Spark) ───────────────────────── */}
      <motion.div
        variants={pulseVariant}
        animate="animate"
        className="absolute top-0 right-32 hidden sm:flex items-center justify-center h-9 w-9 rounded-full bg-amber-50 border border-amber-200/80 shadow-xs z-20"
        title="Insight"
      >
        <Lightbulb className="h-4.5 w-4.5 text-amber-500" />
      </motion.div>

      {/* ── Main Illustration Container ─────────────────────────────── */}
      <div className="relative flex items-center justify-center">
        <img
          src={heroTutorImg}
          alt="StudyMate AI Tutor explaining concepts on blackboard"
          className="w-full h-auto object-contain max-h-[360px] sm:max-h-[420px] drop-shadow-sm rounded-2xl"
          loading="eager"
        />
      </div>

      {/* ── Floating Learning Insight Cards (REAL DATA ONLY) ────────── */}

      {/* Floating Card 1: Current Mastery (Top Left of Character) */}
      <motion.div
        variants={floatVariant1}
        animate="animate"
        whileHover={{ scale: 1.05, y: -4 }}
        className="absolute top-4 sm:top-8 left-0 sm:-left-4 bg-white/95 border border-zinc-200/90 rounded-2xl px-3.5 py-2.5 shadow-md backdrop-blur-md flex items-center gap-3 transition-shadow hover:shadow-lg cursor-default z-20"
      >
        <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 font-bold text-xs">
          <Target className="h-4.5 w-4.5" />
        </div>
        <div>
          <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
            Mastery
          </span>
          <span className="text-sm font-extrabold text-zinc-900 font-mono-numbers">
            {masteryScore !== null ? `${masteryScore}%` : '—'}
          </span>
        </div>
      </motion.div>

      {/* Floating Card 2: Concepts Reviewed (Top Right of Blackboard) */}
      <motion.div
        variants={floatVariant2}
        animate="animate"
        whileHover={{ scale: 1.05, y: -4 }}
        className="absolute top-2 sm:top-6 right-2 sm:-right-4 bg-white/95 border border-zinc-200/90 rounded-2xl px-3.5 py-2.5 shadow-md backdrop-blur-md flex items-center gap-3 transition-shadow hover:shadow-lg cursor-default z-20"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-50 text-purple-600">
          <BookOpen className="h-4.5 w-4.5" />
        </div>
        <div>
          <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
            Concepts
          </span>
          <span className="text-sm font-extrabold text-zinc-900">
            {conceptsReviewedCount > 0 ? `${conceptsReviewedCount} Reviewed` : '—'}
          </span>
        </div>
      </motion.div>

      {/* Floating Card 3: Quiz Accuracy (Middle Right of Desk) */}
      <motion.div
        variants={floatVariant3}
        animate="animate"
        whileHover={{ scale: 1.05, y: -4 }}
        className="absolute bottom-6 sm:bottom-12 right-0 sm:-right-6 bg-white/95 border border-zinc-200/90 rounded-2xl px-3.5 py-2.5 shadow-md backdrop-blur-md flex items-center gap-3 transition-shadow hover:shadow-lg cursor-default z-20"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-4.5 w-4.5" />
        </div>
        <div>
          <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
            Quiz Accuracy
          </span>
          <span className="text-sm font-extrabold text-zinc-900 font-mono-numbers">
            {accuracyScore !== null ? `${accuracyScore}%` : '—'}
          </span>
        </div>
      </motion.div>

      {/* ── Subtle Hand-Drawn Doodle Text: "Better concepts. Bigger goals." ── */}
      <div className="hidden md:flex flex-col items-end absolute bottom-0 right-10 pointer-events-none opacity-80">
        <span
          className="text-[12px] font-medium text-indigo-900 italic transform rotate-6 tracking-tight"
          style={{ fontFamily: 'ui-serif, Georgia, Cambria, serif' }}
        >
          Better concepts.
          <br />
          Bigger goals.
        </span>
        <svg className="w-10 h-6 text-indigo-400 transform -rotate-12 mt-1" viewBox="0 0 50 30" fill="none">
          <path d="M 5,5 Q 25,25 45,15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M 40,20 L 45,15 L 42,8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  )
}
