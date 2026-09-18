import React, { createContext, useContext, useEffect, useState } from 'react'
import { authService } from '../services/authService'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  // Restore session on mount / browser refresh
  useEffect(() => {
    try {
      const activeUser = authService.getCurrentUser()
      if (activeUser && activeUser.token) {
        setUser(activeUser)
      } else {
        setUser(null)
      }
    } catch (err) {
      console.error('Failed to restore auth session:', err)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const login = async (email, password) => {
    const result = await authService.login(email, password)
    setUser(result.user)
    return result
  }

  const signup = async (name, email, password) => {
    const result = await authService.signup(name, email, password)
    setUser(result.user)
    return result
  }

  const logout = async () => {
    await authService.logout()
    setUser(null)
  }

  const value = {
    user,
    isAuthenticated: Boolean(user?.token),
    isLoading,
    login,
    signup,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
