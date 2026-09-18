import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

/**
 * Route wrapper that requires active authentication.
 * If user is unauthenticated, redirects to /login preserving the intended target URL.
 */
export function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--color-ink)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-black border-t-transparent" />
          <span className="text-xs text-zinc-500 font-medium">Verifying session...</span>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children
}

/**
 * Route wrapper for public auth pages (/login, /signup).
 * If user is already authenticated, redirects them directly to /home.
 */
export function PublicOnlyRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return null
  }

  if (isAuthenticated) {
    const destination = location.state?.from?.pathname || '/home'
    return <Navigate to={destination} replace />
  }

  return children
}

/**
 * Route wrapper that enforces administrative role access.
 * Non-admin students are redirected to /home.
 */
export function AdminRoute({ children }) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--color-ink)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-black border-t-transparent" />
          <span className="text-xs text-zinc-500 font-medium">Verifying authorization...</span>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (user?.role !== 'admin') {
    return <Navigate to="/home" replace />
  }

  return children
}
