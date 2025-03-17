// components/toggle.tsx
"use client"

import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Moon, Sun } from "lucide-react"
import { useEffect, useState } from "react"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button variant="ghost" size="sm" className="h-9 w-20 rounded-md">
        <span className="sr-only">Toggle theme</span>
      </Button>
    )
  }

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="h-9 w-22 rounded-full  flex items-center justify-center gap-1"
    >
      {theme === "dark" ? (
        <div className="flex items-center justify-around gap-3 border-none">
        <span className="text-xs">Light</span>
        <Sun size={18} className="text-foreground" />
      
      </div>
        
      ) : (
        
        <div className="flex items-center justify-around gap-3 border-none">
        <span className="text-xs">Dark</span>
          <Moon size={18} className="text-foreground" />
          
        </div>
      )}
    </Button>
  )
}