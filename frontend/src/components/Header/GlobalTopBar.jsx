import React from 'react'
import UserMenu from './UserMenu'

export default function GlobalTopBar() {
  return (
    <header className="app-global-header">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* ── Right: Notifications & User Profile ───────────────── */}
        <div className="flex items-center gap-3">
          {/* User Profile Dropdown */}
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
