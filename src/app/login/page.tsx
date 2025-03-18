"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Bot } from "lucide-react"
import { ThemeToggle } from "@/components/toggle"

// Hardcoded credentials
const VALID_CREDENTIALS = {
  email: "demo@dotvector.ai",
  password: "voiceai2025"
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    // Simple validation
    if (!email || !password) {
      setError("Please enter both email and password")
      setIsLoading(false)
      return
    }

    // Check against hardcoded credentials
    if (email === VALID_CREDENTIALS.email && password === VALID_CREDENTIALS.password) {
      // Store authentication in localStorage
      localStorage.setItem("isAuthenticated", "true")
      localStorage.setItem("authTimestamp", Date.now().toString())
      
      // Redirect to main app
      router.push("/")
    } else {
      setError("Invalid email or password")
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-5 sm:p-10 bg-background text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Bot size={24} className="text-emerald-500" />
            Dot Vector Voice AI
          </CardTitle>
          <div className="flex items-center gap-3">
            <ThemeToggle />
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full"
              />
            </div>
            {error && (
              <div className="text-sm text-red-500">{error}</div>
            )}
            <Button
              type="submit"
              className="w-full bg-emerald-500 hover:bg-emerald-600"
              disabled={isLoading}
            >
              {isLoading ? "Logging in..." : "Log in"}
            </Button>
            <div className="text-center text-sm text-muted-foreground mt-4">
              <p>Demo Credentials:</p>
              <p>Email: demo@dotvector.ai</p>
              <p>Password: voiceai2025</p>
            </div>
          </form>
        </CardContent>
      </Card>
      <div className="mt-2 sm:mt-3 text-xs text-muted-foreground">
        Dot Vector Voice Research © 2025
      </div>
    </div>
  )
}