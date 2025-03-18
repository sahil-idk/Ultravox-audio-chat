// src/components/auth-provider.tsx
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

  // Move navigation logic to useEffect
  useEffect(() => {
    // If not authenticated and not on login page, redirect to login
    if (!isAuthenticated && pathname !== "/login") {
      router.push("/login")
    }
  }, [isAuthenticated, pathname, router])

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}