// src/components/logout-button.tsx
"use client"

import { Button } from "@/components/ui/button"
import { LogOut } from "lucide-react"
import { useAuth } from "./auth-provider"

export function LogoutButton() {
  const { logout } = useAuth()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={logout}
      className="h-8 w-8"
      aria-label="Logout"
    >
      <LogOut className="h-4 w-4" />
    </Button>
  )
}