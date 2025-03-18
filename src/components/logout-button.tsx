"use client"

import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"

export function LogoutButton() {
  const router = useRouter()

  const handleLogout = () => {
    // Clear authentication from localStorage
    localStorage.removeItem("isAuthenticated")
    localStorage.removeItem("authTimestamp")
    
    // Redirect to login page
    router.push("/login")
  }

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={handleLogout}
      className="h-9 w-22 rounded-full flex items-center justify-center gap-1"
    >
      <span className="text-xs">Logout</span>
      <LogOut size={16} className="text-foreground" />
    </Button>
  )
}