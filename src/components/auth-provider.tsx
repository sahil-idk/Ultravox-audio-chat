"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check if user is authenticated
    const isAuthenticated = localStorage.getItem("isAuthenticated") === "true"
    const authTimestamp = Number(localStorage.getItem("authTimestamp") || "0")
    
    // Session expires after 24 hours
    const SESSION_DURATION = 24 * 60 * 60 * 1000 // 24 hours in milliseconds
    const isSessionValid = Date.now() - authTimestamp < SESSION_DURATION
    
    // If not on login page and not authenticated, redirect to login
    if (pathname !== "/login") {
      if (!isAuthenticated || !isSessionValid) {
        router.replace("/login")
      }
    } else {
      // If on login page but already authenticated, redirect to home
      if (isAuthenticated && isSessionValid) {
        router.replace("/")
      }
    }

    setIsLoading(false)
  }, [pathname, router])

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-emerald-500 mx-auto"></div>
          <p className="mt-4 text-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}