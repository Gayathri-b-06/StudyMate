/**
 * Visual badge indicator for completed tool operations inside chat history.
 */
export function ToolStatusIndicator({ message, detail }) {
  if (!message) return null
  return (

    <div className="my-2.5 flex items-center gap-2.5 rounded-xl border border-black/15 bg-zinc-50 px-3.5 py-2.5 text-xs text-black shadow-sm font-sans animate-fade-in">
      <span className="relative flex size-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-black opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-black" />
      </span>
      <span className="font-semibold text-black">{message}</span>
      {detail && <span className="text-zinc-500">— {detail}</span>}
    </div>
  )
}

export default ToolStatusIndicator
