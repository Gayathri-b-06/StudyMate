import { useState } from 'react'
import { Plus, Search, X, Sparkles, Home } from 'lucide-react'
import { motion } from 'framer-motion'
import { useWorkspace } from '../../context/WorkspaceContext'
import WorkspaceSection from './WorkspaceSection'
import ChatSection from './ChatSection'
import SpaceProjectNav from './SpaceProjectNav'

function CloseSidebarIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}

export default function SidebarContainer({
  threads = [],
  isLoading = false,
  error = null,
  onCreate,
  onSelect,
  onRename,
  onDelete,
  onClose,
  onProjectSelected,
  style,
  startResize,
  isResizing,
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const { activeWorkspace, setActiveWorkspace } = useWorkspace()

  return (
    <div className="relative flex h-full shrink-0">
      <aside
        style={style}
        className="hidden shrink-0 border-r border-black/10 bg-[var(--color-panel)] p-4 md:flex md:flex-col h-full overflow-hidden backdrop-blur-md transition-colors font-sans"
      >
        {/* Header */}
        <div className="mb-4 flex shrink-0 items-center justify-between px-1">
          <button
            type="button"
            onClick={() => setActiveWorkspace('home')}
            className="flex items-center gap-3 text-left group cursor-pointer focus:outline-none"
            title="Go to Global Home Dashboard"
          >
            <div className="grid size-9 place-items-center rounded-xl bg-zinc-100 text-black font-bold border border-black/10 group-hover:bg-black group-hover:text-white transition-colors shadow-xs">
              <Sparkles className="size-4" />
            </div>
            <div>
              <p className="font-bold tracking-tight text-black text-sm group-hover:underline">StudyMate AI</p>
              <p className="text-[11px] text-zinc-500 font-medium">Global Dashboard</p>
            </div>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-black cursor-pointer"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <CloseSidebarIcon />
            </button>
          )}
        </div>

        {/* Home Dashboard Navigation Button */}
        <button
          type="button"
          onClick={() => setActiveWorkspace('home')}
          className={`mb-3 flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2 text-xs font-bold transition-all cursor-pointer ${
            activeWorkspace === 'home'
              ? 'bg-black text-white border-black shadow-xs'
              : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 hover:text-black hover:border-black/30 shadow-2xs'
          }`}
          title="Return to account-wide overview"
        >
          <Home className="size-4" />
          <span>Home Dashboard</span>
        </button>

        {/* New Chat Button */}
        <motion.button
          whileHover={{ scale: 1.02, y: -1 }}
          whileTap={{ scale: 0.98 }}
          type="button"
          onClick={onCreate}
          className="mb-3.5 flex shrink-0 items-center justify-center gap-2 rounded-xl bg-black hover:bg-zinc-800 px-4 py-2.5 text-xs font-bold text-white transition-colors focus:outline-none shadow-sm cursor-pointer"
        >
          <Plus className="size-4" />
          <span>New Chat</span>
        </motion.button>

        {/* Chat Search Input */}
        <div className="mb-4 relative flex shrink-0 items-center">
          <Search className="absolute left-3 size-3.5 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations…"
            className="w-full rounded-xl border border-zinc-300 bg-zinc-50 py-2 pl-8 pr-7 text-xs text-black placeholder:text-zinc-400 outline-none transition focus:border-black focus:bg-white focus:ring-1 focus:ring-black"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 rounded-md p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-black"
              title="Clear search"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        {/* Scrollable Navigation & Chat Container */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-3.5 pr-0.5">
          {/* Space → Project Navigation */}
          <div>
            <SpaceProjectNav onProjectSelected={onProjectSelected} />
          </div>

          <div className="h-px shrink-0 bg-black/10" />

          {/* Workspaces Section */}
          <WorkspaceSection />

          {/* Chats Section */}
          <ChatSection
            threads={threads}
            isLoading={isLoading}
            error={error}
            searchQuery={searchQuery}
            onSelect={onSelect}
            onRename={onRename}
            onDelete={onDelete}
          />
        </div>
      </aside>

      {/* Resizable Splitter Handle */}
      {startResize && (
        <div
          onMouseDown={startResize}
          className={`w-1 cursor-col-resize hover:bg-black/20 transition-colors ${
            isResizing ? 'bg-black' : 'bg-transparent'
          }`}
          title="Drag to resize sidebar width"
        />
      )}
    </div>
  )
}
