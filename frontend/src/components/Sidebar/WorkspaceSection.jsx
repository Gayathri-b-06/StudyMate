import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { motion } from 'framer-motion'
import { WORKSPACES } from '../../config/toolRegistry'
import { useWorkspace } from '../../context/WorkspaceContext'

export default function WorkspaceSection() {
  const [isOpen, setIsOpen] = useState(true)
  const { activeWorkspace, setActiveWorkspace } = useWorkspace()

  return (
    <div className="mb-4">
      {/* Section Header */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-black transition-colors"
      >
        <span>Workspaces</span>
        <ChevronDown
          className={`size-3.5 transition-transform duration-200 ${
            isOpen ? 'rotate-0' : '-rotate-90'
          }`}
        />
      </button>

      {/* Collapsible Content */}
      <div
        className={`grid transition-all duration-300 ease-in-out ${
          isOpen ? 'grid-rows-[1fr] opacity-100 mt-1' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <ul className="space-y-1">
            {WORKSPACES.map((workspace) => {
              const Icon = workspace.icon
              const isActive = activeWorkspace === workspace.id
              return (
                <li key={workspace.id} className="relative">
                  <button
                    type="button"
                    onClick={() => setActiveWorkspace(workspace.id)}
                    className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all ${
                      isActive
                        ? 'text-black'
                        : 'text-zinc-600 hover:bg-zinc-100 hover:text-black'
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeWorkspacePill"
                        className="absolute inset-0 rounded-xl bg-zinc-100 border border-black/15 shadow-sm"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}

                    <div className={`relative z-10 grid size-6 place-items-center rounded-lg border transition-all ${
                      isActive
                        ? 'border-black bg-black text-white shadow-sm'
                        : 'border-black/10 bg-zinc-50 text-zinc-500 group-hover:border-black/30 group-hover:text-black group-hover:scale-105'
                    }`}>
                      <Icon className="size-3.5" />
                    </div>

                    <span className="relative z-10 truncate">{workspace.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
