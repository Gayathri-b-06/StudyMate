import React, { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

/**
 * Emoji character regex — matches any leading emoji at the start of a string.
 * Used to strip emojis that the AI may include in headings to avoid doubling.
 */
const LEADING_EMOJI_RE = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D]+\s*/u

/**
 * Strips leading emoji characters from a plain-text string.
 */
function stripLeadingEmoji(str = '') {
  return str.replace(LEADING_EMOJI_RE, '').trim()
}

/**
 * Flattens React children to a plain string, stripping any leading emoji.
 * This prevents double-icon when the AI already put an emoji in the heading markdown.
 */
function headingText(children) {
  const raw = React.Children.toArray(children)
    .map((c) => (typeof c === 'string' ? c : ''))
    .join('')
  return stripLeadingEmoji(raw)
}

/** Remove retrieval-only markers and normalize common LaTex delimiters before rendering. */
function prepareTutorMarkdown(content = '') {
  return content
    .replace(/\[\[?cite:\d+\]?\]/gi, '')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '')
    .replace(/^\s*svg(?:sources)?\b[^\n]*$/gim, '')
    .replace(/^\s*(?:svg|asset|parser)[\w .:_-]*(?:\.pdf)?[^\n]*$/gim, '')
    .replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$')
    .replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Returns icon and style for a given section heading.
 */
// Kept only for legacy heading helpers; it no longer controls rendered sections.
// eslint-disable-next-line no-unused-vars
function getSectionStyle(titleText = '') {
  const text = titleText.toLowerCase()

  let icon = '📍'
  if (text.includes('overview') || text.includes('definition') || text.includes('what is') || text.includes('introduction')) icon = '📖'
  else if (text.includes('intuition') || text.includes('intuitive') || text.includes('why')) icon = '💡'
  else if (text.includes('how it works') || text.includes('working') || text.includes('steps') || text.includes('process') || text.includes('mechanism')) icon = '⚙️'
  else if (text.includes('formula') || text.includes('diagram') || text.includes('math') || text.includes('equation') || text.includes('notation')) icon = '🧮'
  else if (text.includes('example') || text.includes('use case') || text.includes('demo')) icon = '✅'
  else if (text.includes('key point') || text.includes('key takeaway') || text.includes('takeaway') || text.includes('summary') || text.includes('conclusion')) icon = '⭐'
  else if (text.includes('advantage') || text.includes('benefit') || text.includes('pros')) icon = '✅'
  else if (text.includes('limitation') || text.includes('disadvantage') || text.includes('cons') || text.includes('tradeoff') || text.includes('caveat')) icon = '⚠️'
  else if (text.includes('application') || text.includes('real-world') || text.includes('practice')) icon = '🔬'
  else if (text.includes('comparison') || text.includes('vs') || text.includes('difference')) icon = '⚖️'
  else if (text.includes('type') || text.includes('categor') || text.includes('kind')) icon = '🗂️'

  return { icon }
}

/**
 * Rich markdown renderer for structured AI study responses.
 * - Strips leading emojis from headings to avoid doubling when the AI includes them.
 * - Renders H2/H3 as styled section cards with a left accent border.
 * - Uses consistent academic typography throughout.
 */
function MarkdownMessage({ content }) {
  if (!content) return null
  const preparedContent = prepareTutorMarkdown(content)
  if (!preparedContent) return null

  return (
    <div className="space-y-3 text-slate-900 text-[15.5px] leading-[1.75] font-sans [&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto [&_.katex-display]:rounded-xl [&_.katex-display]:border [&_.katex-display]:border-emerald-100 [&_.katex-display]:bg-emerald-50/60 [&_.katex-display]:px-5 [&_.katex-display]:py-4">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{

          // ── H1: Concept / Document Title ──────────────────────────────
          h1({ children }) {
            const label = headingText(children)
            return (
              <div className="mb-5 pb-3 border-b-2 border-black/10">
                <h1 className="font-heading text-2xl font-bold tracking-tight text-black">
                  {label}
                </h1>
              </div>
            )
          },

          // ── H2: Major Section Card ─────────────────────────────────────
          h2({ children }) {
            return (
              <h2 className="mt-6 mb-2 border-l-4 border-emerald-600 pl-3 text-lg font-bold tracking-tight text-slate-950">{children}</h2>
            )
          },

          // ── H3: Sub-section ────────────────────────────────────────────
          h3({ children }) {
            return (
              <h3 className="mt-5 mb-1.5 text-base font-bold text-slate-900">{children}</h3>
            )
          },

          // ── H4: Minor heading ──────────────────────────────────────────
          h4({ children }) {
            const label = headingText(children)
            return (
              <h4 className="mt-3 mb-1 text-[14.5px] font-semibold text-black underline decoration-black/20 underline-offset-2">
                {label}
              </h4>
            )
          },

          // ── Paragraphs ─────────────────────────────────────────────────
          p({ children }) {
            return (
              <p className="text-[15.5px] leading-[1.8] text-black/90 my-2.5 first:mt-0 last:mb-0">
                {children}
              </p>
            )
          },

          // ── Bold ───────────────────────────────────────────────────────
          strong({ children }) {
            return <strong className="font-semibold text-black">{children}</strong>
          },

          // ── Italic ─────────────────────────────────────────────────────
          em({ children }) {
            return <em className="italic text-zinc-700">{children}</em>
          },

          // ── Unordered list ─────────────────────────────────────────────
          ul({ children }) {
            return (
              <ul className="my-2.5 space-y-1.5 pl-5 text-[15px] text-black/90 list-disc marker:text-black/40">
                {children}
              </ul>
            )
          },

          // ── Ordered list ───────────────────────────────────────────────
          ol({ children }) {
            return (
              <ol className="my-2.5 space-y-1.5 pl-5 text-[15px] text-black/90 list-decimal marker:font-semibold marker:text-black">
                {children}
              </ol>
            )
          },

          li({ children }) {
            return <li className="leading-[1.75] text-black/90 pl-0.5">{children}</li>
          },

          // ── Blockquote ─────────────────────────────────────────────────
          blockquote({ children }) {
            return (
              <blockquote className="my-3 border-l-4 border-black/20 bg-zinc-50 pl-4 pr-3 py-2 rounded-r-lg italic text-zinc-700 text-[14.5px]">
                {children}
              </blockquote>
            )
          },

          // ── Horizontal Rule ────────────────────────────────────────────
          hr() {
            return <hr className="my-4 border-emerald-900/10" />
          },

          math({ children }) {
            return <div className="my-4 overflow-x-auto rounded-xl border border-emerald-100 bg-emerald-50/60 px-5 py-4 text-center text-[1.05em] shadow-xs">{children}</div>
          },

          // ── Tables ─────────────────────────────────────────────────────
          table({ children }) {
            return (
              <div className="my-4 overflow-x-auto rounded-xl border border-black/10 bg-white shadow-sm">
                <table className="w-full text-left text-sm text-black border-collapse">
                  {children}
                </table>
              </div>
            )
          },
          thead({ children }) {
            return <thead className="bg-zinc-100 border-b border-black/10">{children}</thead>
          },
          th({ children }) {
            return <th className="px-4 py-2.5 font-bold text-black text-xs uppercase tracking-wide">{children}</th>
          },
          td({ children }) {
            return <td className="px-4 py-2.5 border-t border-black/5 text-black/80 text-sm">{children}</td>
          },
          tr({ children }) {
            return <tr className="hover:bg-zinc-50/70 transition-colors">{children}</tr>
          },

          // ── Code ───────────────────────────────────────────────────────
          code({ inline, className, children, ...props }) {
            if (inline) {
              return (
                <code
                  className="rounded-md bg-zinc-100 border border-black/10 px-1.5 py-0.5 font-mono text-[0.85em] text-black"
                  {...props}
                >
                  {children}
                </code>
              )
            }
            return (
              <pre className="my-3 overflow-x-auto rounded-xl border border-black/10 bg-zinc-950 p-4 font-mono text-[13px] leading-5 text-zinc-100 shadow-sm">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            )
          },
        }}
      >
        {preparedContent}
      </ReactMarkdown>
    </div>
  )
}

export default memo(MarkdownMessage)
