import React from 'react'

/**
 * Signature pill-shaped "index tab" component anchored to top edges of content cards.
 * Inspired by catalog cards and physical study index tabs.
 */
export default function IndexTab({
  children,
  variant = 'accent', // 'accent' | 'success' | 'warning' | 'danger' | 'muted'
  className = '',
  icon: Icon = null,
}) {
  const variantStyles = {
    accent: 'bg-zinc-100 text-black border-black/20 font-semibold',
    success: 'bg-black text-white border-black font-semibold',
    warning: 'bg-zinc-100 text-zinc-800 border-zinc-400 font-semibold',
    danger: 'bg-zinc-200 text-black border-black/40 font-bold',
    muted: 'bg-zinc-50 text-zinc-500 border-zinc-200',
    neutral: 'bg-zinc-100 text-black border-black/20 font-semibold',
  }

  const selectedVariant = variantStyles[variant] || variantStyles.accent

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide uppercase font-sans ${selectedVariant} ${className}`}
    >
      {Icon && <Icon className="size-3 shrink-0" />}
      <span className="truncate">{children}</span>
    </span>
  )
}
