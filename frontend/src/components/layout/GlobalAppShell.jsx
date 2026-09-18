import React from 'react'
import { NavLink, Link, useNavigate } from 'react-router-dom'
import { Sparkles, Home, FolderOpen, Plus, BookOpen, Layers } from 'lucide-react'
import UserMenu from '../Header/UserMenu'

export default function GlobalAppShell({ children, activeSpaces = [], onCreateSpace }) {
  const navigate = useNavigate()

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--color-ink)] text-[var(--color-parchment)] font-sans">
      {/* ── Global Left Sidebar ───────────────────────────────────── */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col justify-between border-r border-black/10 bg-[var(--color-panel)] p-4 overflow-y-auto">
        <div className="space-y-6">
          {/* Brand Header */}
          <Link
            to="/home"
            className="flex items-center gap-3 px-1.5 py-1 text-left group focus:outline-none"
            title="StudyMate AI"
          >
            <div className="grid size-9 place-items-center rounded-xl bg-black text-white font-bold shadow-xs group-hover:scale-105 transition-transform">
              <Sparkles className="size-4" />
            </div>
            <div>
              <p className="font-bold tracking-tight text-black text-sm font-heading">StudyMate AI</p>
              <p className="text-[11px] text-zinc-500 font-medium">Global Navigation</p>
            </div>
          </Link>

          {/* Primary Global Navigation */}
          <nav className="space-y-1" aria-label="Global Application Navigation">
            <NavLink
              to="/home"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-black text-white shadow-xs'
                    : 'text-zinc-600 hover:bg-zinc-200/60 hover:text-black'
                }`
              }
            >
              <Home className="size-4" />
              <span>Home Dashboard</span>
            </NavLink>

            <NavLink
              to="/spaces"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-black text-white shadow-xs'
                    : 'text-zinc-600 hover:bg-zinc-200/60 hover:text-black'
                }`
              }
            >
              <FolderOpen className="size-4" />
              <span>Spaces & Projects</span>
            </NavLink>
          </nav>

          {/* Quick Spaces List (if active spaces exist) */}
          {activeSpaces.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-black/10">
              <div className="flex items-center justify-between px-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 font-mono-numbers">
                  Spaces
                </span>
                {onCreateSpace && (
                  <button
                    type="button"
                    onClick={onCreateSpace}
                    className="p-1 rounded-md text-zinc-400 hover:text-black hover:bg-zinc-200/60 transition cursor-pointer"
                    title="Create New Space"
                  >
                    <Plus className="size-3.5" />
                  </button>
                )}
              </div>

              <ul className="space-y-0.5">
                {activeSpaces.slice(0, 5).map((space) => (
                  <li key={space.id}>
                    <button
                      type="button"
                      onClick={() => navigate('/spaces')}
                      className="w-full text-left flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:text-black hover:bg-zinc-200/40 transition cursor-pointer truncate"
                    >
                      <span className="size-1.5 rounded-full bg-black/40 shrink-0" />
                      <span className="truncate">{space.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* User Profile at Bottom */}
        <div className="pt-4 border-t border-black/10 flex items-center justify-between px-1">
          <UserMenu />
        </div>
      </aside>

      {/* ── Main Content Area ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Mobile Top Header (Visible on small screens) */}
        <header className="md:hidden flex h-14 shrink-0 items-center justify-between border-b border-black/10 bg-white px-4">
          <Link to="/home" className="flex items-center gap-2">
            <div className="grid size-7 place-items-center rounded-lg bg-black text-white">
              <Sparkles className="size-3.5" />
            </div>
            <span className="font-bold text-sm text-black font-heading">StudyMate</span>
          </Link>

          <div className="flex items-center gap-2">
            <NavLink
              to="/home"
              className={({ isActive }) =>
                `px-2.5 py-1 rounded-lg text-xs font-semibold ${
                  isActive ? 'bg-black text-white' : 'text-zinc-600'
                }`
              }
            >
              Home
            </NavLink>
            <NavLink
              to="/spaces"
              className={({ isActive }) =>
                `px-2.5 py-1 rounded-lg text-xs font-semibold ${
                  isActive ? 'bg-black text-white' : 'text-zinc-600'
                }`
              }
            >
              Spaces
            </NavLink>
          </div>
        </header>

        {/* Scrollable Page Body */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  )
}
