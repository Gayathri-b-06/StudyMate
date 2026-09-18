import React, { useState, useRef, useEffect } from 'react'
import { LogOut, ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function UserMenu() {
  const { user, logout } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef(null)
  const navigate = useNavigate()

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!user) return null

  // Initials generator
  const initials = user.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U'

  const handleSignOut = async () => {
    setIsOpen(false)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        id="user-menu-button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 shadow-2xs transition hover:border-emerald-300 hover:bg-emerald-50/30 focus:outline-none cursor-pointer"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white shadow-2xs">
          {initials}
        </div>
        <div className="hidden flex-col items-start text-left sm:flex">
          <span className="text-xs font-semibold text-slate-800 leading-tight">
            {user.name}
          </span>
          <span className="text-[10.5px] text-slate-400 leading-tight truncate max-w-[120px]">
            {user.email}
          </span>
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-56 origin-top-right rounded-2xl border border-slate-200 bg-white p-2 shadow-xl backdrop-blur-md focus:outline-none animate-in fade-in zoom-in-95 duration-100">
          <div className="border-b border-slate-100 px-3 py-2.5">
            <p className="text-sm font-semibold text-slate-900">{user.name}</p>
            <p className="text-xs text-slate-500 truncate mt-0.5">{user.email}</p>
            {user.isDemo && (
              <span className="mt-1.5 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200">
                Demo Account
              </span>
            )}
          </div>

          <div className="pt-1.5">
            <button
              type="button"
              id="sign-out-button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition text-left cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
