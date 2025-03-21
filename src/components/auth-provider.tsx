// src/components/auth-provider.tsx - simplified version
"use client"

import { createContext, useContext, useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"

type AuthContextType = {
  isAuthenticated: boolean
  login: () => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  login: () => {},
  logout: () => {},
})

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  // Simple login function
  const login = () => {
    setIsAuthenticated(true)
  }

  // Simple logout function
  const logout = () => {
    setIsAuthenticated(false)
    router.push("/login")
  }

  // Check if we should render the children or redirect
  const shouldRenderChildren = isAuthenticated || pathname === "/login"

  // If not on login page and not authenticated, redirect to login
  useEffect(() => {
    if (!isAuthenticated && pathname !== "/login") {
      router.push("/login")
    }
  }, [isAuthenticated, pathname, router])

  // Only render children if authenticated or on login page
  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {shouldRenderChildren ? children : null}
    </AuthContext.Provider>
  )
}