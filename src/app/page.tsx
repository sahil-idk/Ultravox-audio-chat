/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { useState, useEffect, useRef, type JSX } from "react"
import { Mic, X, Volume2, Loader2, Bot, Music } from "lucide-react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/toggle"
import { UltravoxSession, UltravoxSessionStatus } from "ultravox-client"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

// Voice interface from Ultravox API
interface UltravoxVoice {
  voiceId: string
  name: string
  description?: string
}

// Bot persona interface with voice integration
interface BotPersona {
  id: string
  name: string
  systemPrompt: string
  voice: string
  color: string
  icon: JSX.Element
  description: string
}

// System prompts for different assistant types
const systemPrompts = {
  general: "You are a helpful AI assistant talking to a user. Keep your responses helpful and concise.",
  customer:
    "You are a friendly customer service representative. Help the customer with their questions and concerns in a professional and friendly manner.",
  technical:
    "You are a technical support agent helping users troubleshoot problems with their devices. Be patient, methodical, and clear in your explanations.",
  creative:
    "You are a creative assistant helping users with generating ideas, writing content, and brainstorming. Be imaginative and enthusiastic.",
}

// Assign a color to each voice based on its name (for consistency)
// Update the getVoiceColor function to assign specific colors to our three voices
const getVoiceColor = (voiceName: string): string => {
  // Convert name to lowercase for case-insensitive matching
  const nameLower = voiceName.toLowerCase();
  
  // Directly assign colors to our three specific voices
  if (nameLower.includes("emily")) {
    return "bg-emerald-500"; // Emily gets green
  } else if (nameLower.includes("mark") && !nameLower.includes("slow")) {
    return "bg-violet-500"; // Mark gets violet/purple
  } else if (nameLower.includes("aaron")) {
    return "bg-amber-500"; // Aaron gets amber/orange
  }
  
  // Fallback color assignment for any other voices
  const colors = [
    "bg-blue-500",
    "bg-pink-500",
    "bg-teal-500",
  ];
  
  // Hash the name to get a consistent color
  let hash = 0;
  for (let i = 0; i < voiceName.length; i++) {
    hash = (hash << 5) - hash + voiceName.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  
  // Use absolute value and modulo to get index within colors array
  const colorIndex = Math.abs(hash) % colors.length;
  return colors[colorIndex];
}

// Connection states
const ConnectionState = {
  IDLE: "idle",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  ERROR: "error",
}

export default function AudioVisualizer() {
  const [isListening, setIsListening] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [selectedVoice, setSelectedVoice] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [availableVoices, setAvailableVoices] = useState<UltravoxVoice[]>([])
  const [botPersonas, setBotPersonas] = useState<BotPersona[]>([])
  const [isLoadingVoices, setIsLoadingVoices] = useState(true)
  const [windowWidth, setWindowWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1024)

  // Connection state management
  const [connectionState, setConnectionState] = useState(ConnectionState.IDLE)
  const [connectionProgress, setConnectionProgress] = useState(0)

  // Ultravox state
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [joinUrl, setJoinUrl] = useState<string | null>(null)
  const [sessionState, setSessionState] = useState<string>("idle")
  const [isConnected, setIsConnected] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [conversation, setConversation] = useState<Array<{ role: string; text: string }>>([])
  
  // Flag for showing transcript container
  const [showTranscript, setShowTranscript] = useState(false)

  // Refs
  const micStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const frameRef = useRef<number | null>(null)
  const prevLevelRef = useRef<number>(0)
  const uvSessionRef = useRef<UltravoxSession | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null)
  const connectionTimerRef = useRef<NodeJS.Timeout | null>(null)

  const SAMPLE_RATE = 16000 // Match with Ultravox requirements

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth)
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  // Initialize audio context and analyzer
  useEffect(() => {
    if (typeof window !== "undefined") {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext

      audioContextRef.current = new AudioContext({
        sampleRate: SAMPLE_RATE,
      })
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 256
      analyserRef.current.smoothingTimeConstant = 0.7

      audioRef.current = new Audio("/mixkit-select-click-1109.wav")

      // Fetch available voices
      fetchVoices()

      return () => {
        if (frameRef.current) {
          cancelAnimationFrame(frameRef.current)
        }
        if (micStreamRef.current) {
          micStreamRef.current.getTracks().forEach((track) => track.stop())
        }
        if (audioContextRef.current && audioContextRef.current.state !== "closed") {
          audioContextRef.current.close()
        }
        if (uvSessionRef.current) {
          uvSessionRef.current.leaveCall()
        }
        if (connectionTimerRef.current) {
          clearInterval(connectionTimerRef.current)
        }
      }
    }
  }, [])
  
  // Update showTranscript based on connection and transcript content
  useEffect(() => {
    if (isConnected && (transcript || conversation.length > 0)) {
      setShowTranscript(true)
    } else if (!isConnected) {
      setShowTranscript(false)
    }
  }, [isConnected, transcript, conversation])



const fetchVoices = async () => {
  try {
    setIsLoadingVoices(true)

    const response = await fetch("/api/create-ultravox-call", {
      method: "GET",
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch voices: ${response.status}`)
    }

    const data = await response.json()

    // Filter to only include our three desired voices:
    // Emily-English, Mark (not Mark-Slow), and Aaron-English
    const filteredVoices = data.filter((voice: UltravoxVoice) => {
      const voiceName = voice.name?.toLowerCase() || "";
      return (
        voiceName.includes("emily-english") || 
        (voiceName === "mark" && !voiceName.includes("slow")) || 
        voiceName.includes("aaron-english")
      );
    });

    if (filteredVoices.length > 0) {
      setAvailableVoices(filteredVoices)

      // Create personas from the filtered voices
      const personas: BotPersona[] = filteredVoices.map((voice: UltravoxVoice) => {
        // Choose a system prompt based on the voice name pattern
        let prompt = systemPrompts.general
        const voiceLower = voice.name?.toLowerCase() || ""

        if (voiceLower.includes("customer") || voiceLower.includes("service")) {
          prompt = systemPrompts.customer
        } else if (voiceLower.includes("tech") || voiceLower.includes("support")) {
          prompt = systemPrompts.technical
        } else if (voiceLower.includes("creative") || voiceLower.includes("writer")) {
          prompt = systemPrompts.creative
        }

        // Clean up the name - remove "-English" suffix
        let displayName = voice.name || "Unknown Voice";
        if (displayName.includes("-English")) {
          displayName = displayName.replace("-English", "");
        }

        return {
          id: voice.voiceId,
          name: displayName,
          systemPrompt: prompt,
          voice: voice.voiceId,
          color: 'bg-emerald-500', // All voices use the same emerald color
          icon: <Bot className="h-4 w-4" />,
          description: voice.description || `Voice assistant using ${displayName}`,
        }
      })

      setBotPersonas(personas)

      // Set default voice to Emily-English if available, otherwise fall back to first voice
      const emilyVoice = filteredVoices.find((voice: UltravoxVoice) => 
        voice.name?.toLowerCase().includes("emily")
      );
      
      if (emilyVoice) {
        setSelectedVoice(emilyVoice.voiceId)
      } else if (filteredVoices.length > 0) {
        setSelectedVoice(filteredVoices[0].voiceId)
      }
    } else {
      // If no voices match our filter or API doesn't return expected format, use fallback personas
      setFallbackPersonas()
    }
  } catch (error) {
    console.error("Error fetching voices:", error)
    setFallbackPersonas()
  } finally {
    setIsLoadingVoices(false)
  }
}


const setFallbackPersonas = () => {
  const fallbackPersonas = [
    {
      id: "87691b77-0174-4808-b73c-30000b334e14", // Emily-English voice ID
      name: "Emily",
      systemPrompt: systemPrompts.general,
      voice: "87691b77-0174-4808-b73c-30000b334e14",
      color: "bg-emerald-500", // All using emerald color
      icon: <Bot className="h-4 w-4" />,
      description: "A natural-sounding American English voice assistant.",
    },
    {
      id: "91fa9bcf-93c8-467c-8b29-973720e3f167", // Mark voice ID
      name: "Mark",
      systemPrompt: systemPrompts.general,
      voice: "91fa9bcf-93c8-467c-8b29-973720e3f167",
      color: "bg-emerald-500", // All using emerald color
      icon: <Bot className="h-4 w-4" />,
      description: "A clear male English voice assistant.",
    },
    {
      id: "feccf00b-417e-4e7a-9f89-62f537280334", // Aaron-English voice ID
      name: "Aaron",
      systemPrompt: systemPrompts.technical,
      voice: "feccf00b-417e-4e7a-9f89-62f537280334",
      color: "bg-emerald-500", // All using emerald color
      icon: <Bot className="h-4 w-4" />,
      description: "A technical specialist with an American English voice.",
    },
  ]

  setBotPersonas(fallbackPersonas)
  // Set Emily as the default voice
  setSelectedVoice(fallbackPersonas[0].id)
}
  // Auto-scroll the transcript container
  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight
    }
  }, [conversation, transcript])

  // Create Ultravox session
  const createUltravoxSession = async () => {
    try {
      setIsLoading(true)
      setErrorMessage(null)

      // Find the selected bot
      const botPersona = botPersonas.find((bot) => bot.id === selectedVoice) || botPersonas[0]

      console.log("Creating call with voice:", botPersona.voice)

      const response = await fetch("/api/create-ultravox-call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemPrompt: botPersona.systemPrompt,
          voice: botPersona.voice,
          temperature: 0.7,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `Failed to create Ultravox call: ${response.status}`)
      }

      const data = await response.json()

      if (!data.joinUrl) {
        throw new Error("Invalid response: missing joinUrl")
      }

      console.log("Created call with join URL:", data.joinUrl)

      setJoinUrl(data.joinUrl)
      setSessionId(data.callId)

      return data.joinUrl
    } catch (error) {
      console.error("Error creating Ultravox call:", error)
      setErrorMessage(error instanceof Error ? error.message : "Failed to create Ultravox call")
      setErrorDialogOpen(true)
      setConnectionState(ConnectionState.ERROR)
      return null
    } finally {
      setIsLoading(false)
    }
  }

  // Initialize and start Ultravox session
  const initializeUltravoxSession = async () => {
    try {
      // Set connection state to CONNECTING
      setConnectionState(ConnectionState.CONNECTING)
      setConnectionProgress(0)

      // Start progress animation with improved timing
      // First jump to 20% quickly to show immediate feedback
      setConnectionProgress(20)

      // Then continue with smoother progression
      connectionTimerRef.current = setInterval(() => {
        setConnectionProgress((prev) => {
          if (prev < 40) {
            // Faster in the beginning (20% to 40%)
            return Math.min(40, prev + Math.random() * 3 + 1)
          } else if (prev < 70) {
            // Medium speed in the middle (40% to 70%)
            return Math.min(70, prev + Math.random() * 2 + 0.5)
          } else {
            // Slow down as we approach 95% (70% to 95%)
            const remainingPercentage = 95 - prev
            const increment = Math.max(0.2, remainingPercentage * 0.05)
            return Math.min(95, prev + increment)
          }
        })
      }, 150)

      // Clean up any existing session
      if (uvSessionRef.current) {
        await uvSessionRef.current.leaveCall()
        uvSessionRef.current = null
      }

      // Create a new session
      const url = await createUltravoxSession()
      if (!url) {
        if (connectionTimerRef.current) {
          clearInterval(connectionTimerRef.current)
          connectionTimerRef.current = null
        }
        setConnectionState(ConnectionState.ERROR)
        return false
      }

      // Initialize the Ultravox session
      const session = new UltravoxSession({
        experimentalMessages: new Set(["debug"]),
      })

      // Set up event listeners
      session.addEventListener("status", (event) => {
        console.log("Session status changed:", session.status)
        setSessionState(session.status)

        // Update UI based on status
        if (
          session.status === UltravoxSessionStatus.LISTENING ||
          session.status === UltravoxSessionStatus.THINKING ||
          session.status === UltravoxSessionStatus.SPEAKING
        ) {
          // Successfully connected
          if (connectionState !== ConnectionState.CONNECTED) {
            // We're connected! Stop the progress timer and complete the progress bar
            if (connectionTimerRef.current) {
              clearInterval(connectionTimerRef.current)
              connectionTimerRef.current = null
            }
            setConnectionProgress(100)
            setConnectionState(ConnectionState.CONNECTED)
          }

          setIsConnected(true)
        } else if (session.status === UltravoxSessionStatus.DISCONNECTED) {
          setIsConnected(false)
          setAudioLevel(0)
          setConnectionState(ConnectionState.IDLE)
        }

        // When agent is speaking, start audio visualization
        if (session.status === UltravoxSessionStatus.SPEAKING) {
          analyzeAudio()
        }
      })

      // Set up transcript listener for real-time streaming updates
      session.addEventListener("transcripts", (event) => {
        const transcripts = session.transcripts

        if (transcripts.length > 0) {
          // Find the most recent agent transcript
          const agentTranscripts = transcripts.filter((t) => t.speaker === "agent")

          if (agentTranscripts.length > 0) {
            const latestTranscript = agentTranscripts[agentTranscripts.length - 1]

            // Update current transcript for non-final messages
            if (!latestTranscript.isFinal) {
              setTranscript(latestTranscript.text)
            } else {
              // When final, move to conversation and clear the transcript
              setConversation((prev) => {
                // Check if we already have this message to avoid duplicates
                const exists = prev.some((msg) => msg.role === "assistant" && msg.text === latestTranscript.text)

                if (!exists) {
                  return [...prev, { role: "assistant", text: latestTranscript.text }]
                }
                return prev
              })
              setTranscript("")
            }
          }

          // Find the most recent user transcript
          const userTranscripts = transcripts.filter((t) => t.speaker === "user")
          if (userTranscripts.length > 0) {
            const latestUserTranscript = userTranscripts[userTranscripts.length - 1]
            if (latestUserTranscript.isFinal) {
              setConversation((prev) => {
                // Check if we already have this message to avoid duplicates
                const exists = prev.some((msg) => msg.role === "user" && msg.text === latestUserTranscript.text)

                if (!exists) {
                  return [...prev, { role: "user", text: latestUserTranscript.text }]
                }
                return prev
              })
            }
          }
        }
      })

      // Set up debug message listener
      session.addEventListener("experimental_message", (event) => {
        console.log("Experimental message:", (event as any).message)
      })

      // Store the session
      uvSessionRef.current = session

      // Join the call
      session.joinCall(url)

      return true
    } catch (error) {
      console.error("Error initializing Ultravox session:", error)
      setErrorMessage(error instanceof Error ? error.message : "Failed to initialize Ultravox session")
      setErrorDialogOpen(true)
      setConnectionState(ConnectionState.ERROR)

      // Clear connection progress timer
      if (connectionTimerRef.current) {
        clearInterval(connectionTimerRef.current)
        connectionTimerRef.current = null
      }

      return false
    }
  }

  const handleMicToggle = async () => {
    if (!isConnected) {
      // Start a new session
      await startMicrophone()
    }
  }

  const startMicrophone = async () => {
    try {
      // Resume audio context if suspended
      if (audioContextRef.current?.state === "suspended") {
        await audioContextRef.current.resume()
      }

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })

      micStreamRef.current = stream

      if (!audioContextRef.current || !analyserRef.current) {
        throw new Error("Audio context not initialized")
      }

      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)

      // If not connected to Ultravox, initialize
      if (!uvSessionRef.current || uvSessionRef.current.status === UltravoxSessionStatus.DISCONNECTED) {
        const success = await initializeUltravoxSession()
        if (!success) {
          throw new Error("Failed to initialize Ultravox session")
        }
      } else {
        // If in IDLE state, ensure microphone is unmuted
        if (uvSessionRef.current.isMicMuted) {
          uvSessionRef.current.unmuteMic()
        }
      }

      setIsListening(true)

      analyzeAudio()
    } catch (error) {
      console.error("Error accessing microphone:", error)
      setErrorMessage(error instanceof Error ? error.message : "Failed to access microphone")
      setErrorDialogOpen(true)
      setConnectionState(ConnectionState.ERROR)
    }
  }

  const stopMicrophone = () => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop())
      micStreamRef.current = null
    }

    // Mute microphone in Ultravox session if connected
    if (
      uvSessionRef.current &&
      uvSessionRef.current.status !== UltravoxSessionStatus.DISCONNECTED &&
      !uvSessionRef.current.isMicMuted
    ) {
      uvSessionRef.current.muteMic()
    }

    setIsListening(false)
    setAudioLevel(0)

    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }

  const analyzeAudio = () => {
    if (!analyserRef.current) return

    const frequencyBinCount = analyserRef.current.frequencyBinCount
    const dataArray = new Uint8Array(frequencyBinCount)

    const updateLevel = () => {
      if (!analyserRef.current) return

      analyserRef.current.getByteFrequencyData(dataArray)

      let sum = 0
      let count = 0

      for (let i = 0; i < frequencyBinCount; i++) {
        const weight = i < frequencyBinCount / 2 ? 1.5 : 0.8
        sum += dataArray[i] * weight
        count++
      }

      const average = sum / count

      const targetLevel = Math.min(Math.pow(average / 128, 1.8), 1)
      const smoothingFactor = 0.15
      const interpolatedLevel = prevLevelRef.current + (targetLevel - prevLevelRef.current) * smoothingFactor

      prevLevelRef.current = interpolatedLevel
      setAudioLevel(interpolatedLevel)

      frameRef.current = requestAnimationFrame(updateLevel)
    }

    updateLevel()
  }

  const endSession = async () => {
    try {
      // Stop microphone if active
      if (isListening) {
        stopMicrophone()
      }

      // Leave Ultravox call
      if (uvSessionRef.current) {
        await uvSessionRef.current.leaveCall()
        uvSessionRef.current = null
      }

      // Reset state
      setSessionId(null)
      setJoinUrl(null)
      setIsConnected(false)
      setSessionState("idle")
      setTranscript("")
      setConversation([])
      setAudioLevel(0)
      setConnectionState(ConnectionState.IDLE)
      setConnectionProgress(0)
      setShowTranscript(false)

      // Clear any connection timers
      if (connectionTimerRef.current) {
        clearInterval(connectionTimerRef.current)
        connectionTimerRef.current = null
      }
    } catch (error) {
      console.error("Error ending session:", error)
      setErrorMessage(error instanceof Error ? error.message : "Failed to end session")
      setErrorDialogOpen(true)
    }
  }

  const handleVoiceChange = async (voiceId: string) => {
    console.log("Voice changed to:", voiceId)
    setSelectedVoice(voiceId)

    // If already connected, disconnect and reconnect with new voice
    if (isConnected) {
      await endSession()

      // Small delay to ensure everything is cleaned up
      setTimeout(async () => {
        await startMicrophone()
      }, 500)
    }
  }

  const getResponsiveSize = () => {
    if (windowWidth < 640) {
      return {
        baseSize: 90, // Smaller base size for mobile
        maxExpansion: 50, // Less expansion on mobile
      }
    }
    return {
      baseSize: 100, // Smaller base size for desktop
      maxExpansion: 70, // Less expansion on desktop
    }
  }

  const { baseSize, maxExpansion } = getResponsiveSize()
  const currentSize = baseSize + audioLevel * maxExpansion

  // Get the current bot
  const currentBot = botPersonas.find((bot) => bot.id === selectedVoice) || botPersonas[0]

  // Get box shadow color based on the current bot's color
  const getBoxShadowColor = (opacity = 0.4) => {
    const colorClass = currentBot?.color || "bg-emerald-500"

    switch (colorClass) {
      case "bg-emerald-500":
        return `rgba(16, 185, 129, ${opacity})`
      case "bg-violet-500":
        return `rgba(139, 92, 246, ${opacity})`
      case "bg-amber-500":
        return `rgba(245, 158, 11, ${opacity})`
      case "bg-red-500":
        return `rgba(239, 68, 68, ${opacity})`
      case "bg-blue-500":
        return `rgba(59, 130, 246, ${opacity})`
      case "bg-pink-500":
        return `rgba(236, 72, 153, ${opacity})`
      case "bg-teal-500":
        return `rgba(20, 184, 166, ${opacity})`
      default:
        return `rgba(16, 185, 129, ${opacity})`
    }
  }

  const getGlowIntensity = () => {
    return 0.2 + audioLevel * 0.8
  }

  // Display status text based on session state
  const getStatusText = () => {
    if (connectionState === ConnectionState.CONNECTING) {
      return `Connecting to ${currentBot?.name || "Assistant"}...`
    }

    if (!isConnected) return "Click microphone to start"

    switch (sessionState) {
      case "speaking":
        return `${currentBot?.name || "Assistant"} is speaking`
      case "thinking":
        return `${currentBot?.name || "Assistant"} is thinking`
      case "listening":
        return `${currentBot?.name || "Assistant"} is listening`
      default:
        return "Ready"
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-3 sm:p-4 bg-background text-foreground">
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="flex flex-row items-center justify-between p-3 sm:p-4">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-md">
          <Music size={24} className="text-emerald-500" />
            Voice Assistant
          </CardTitle>
          <div className="flex items-center  ">
            {/* <Badge variant="outline" className="text-xs">AI Voice</Badge> */}
            <ThemeToggle  />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-1 sm:space-y-2 p-3 sm:p-4">
          {/* Voice Tabs */}
          {/* Voice Tabs */}
<div className="w-full grid grid-cols-3 gap-2">
  {botPersonas.slice(0, 3).map((bot) => (
    <Button
      key={bot.id}
      onClick={() => handleVoiceChange(bot.id)}
      variant={selectedVoice === bot.id ? "default" : "outline"}
      className={selectedVoice === bot.id ? "bg-emerald-500" : ""}
      disabled={isLoadingVoices || connectionState === ConnectionState.CONNECTING || isConnected}
    >
      {bot.name}
    </Button>
  ))}
</div>

          {/* Indicator Circle */}
          <div className="relative h-44 sm:h-52 w-44 sm:w-52 flex items-center justify-center">
            {/* Outer reference circle */}
            <div className="absolute w-32 sm:w-36 h-32 sm:h-36 rounded-full border border-muted" />

            {/* Active indicator with motion */}
            <motion.div
              className={`rounded-full  bg-emerald-500 flex items-center justify-center`}
              animate={{
                width: `${currentSize}px`,
                height: `${currentSize}px`,
                opacity: isListening || sessionState === "speaking" ? 0.85 : 0.5,
                boxShadow:
                  isListening || sessionState === "speaking"
                    ? `0 0 ${20 + audioLevel * 15}px ${getBoxShadowColor(getGlowIntensity())}`
                    : "none",
              }}
              transition={{ duration: 0.1 }}
            >
              {connectionState === ConnectionState.CONNECTING ? (
                <Loader2 size={22} className="text-white animate-spin" />
              ) : isConnected ? (
                <div className="text-white">
                  {sessionState === "speaking" ? <Volume2 size={22} /> : <Mic size={22} />}
                </div>
              ) : null}
            </motion.div>
          </div>

          {/* Progress bar for connection state */}
          {connectionState === ConnectionState.CONNECTING && (
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mt-1 mb-1">
              <div
                className={currentBot?.color || "bg-emerald-500"}
                style={{
                  width: `${connectionProgress}%`,
                  height: "100%",
                  transition: "width 0.3s ease-out",
                }}
              />
            </div>
          )}

          {/* Audio level indicator */}
          <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
            <motion.div
              className={currentBot?.color || "bg-emerald-500"}
              animate={{
                width: `${Math.max(2, audioLevel * 100)}%`,
              }}
              transition={{ duration: 0.1 }}
            />
          </div>

          {/* Transcript Display - Only show when connected and has content */}
          {showTranscript && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              ref={transcriptContainerRef}
              className="w-full bg-muted/30 p-2 sm:p-3 rounded-md h-32 sm:h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-rounded scrollbar-thumb-gray-300 mt-2"
            >
              {transcript ? (
                <motion.p
                  initial={{ opacity: 0.5 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                  className="text-xs sm:text-sm"
                >
                  {transcript}
                </motion.p>
              ) : conversation.length > 0 ? (
                <p className="text-xs sm:text-sm">
                  {conversation.filter((msg) => msg.role === "assistant").pop()?.text || ""}
                </p>
              ) : null}
            </motion.div>
          )}

          {/* Status indicator */}
          <div className="w-full p-2 sm:p-3 bg-muted/50 rounded-md flex items-center justify-between text-xs sm:text-sm">
            <div className="flex items-center">
              {isConnected ? (
                <>
                  <motion.span
                    className={`inline-block w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500 mr-1.5 sm:mr-2`}
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
                  />
                  <span>{getStatusText()}</span>
                </>
              ) : (
                <>
                  <span className="inline-block w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-muted-foreground mr-1.5 sm:mr-2"></span>
                  <span className="text-muted-foreground">{getStatusText()}</span>
                </>
              )}
            </div>

            {isConnected && (
              <Badge variant="outline" className="font-mono text-xs">
                {Math.round(audioLevel * 100)}%
              </Badge>
            )}
          </div>

          {/* Control Button */}
          <div className="flex w-full justify-center mt-2">
            <Button
              onClick={isConnected ? endSession : handleMicToggle}
              variant={isConnected ? "destructive" : "default"}
              size="lg"
              className={`h-12 w-12 sm:h-14 sm:w-14 rounded-full ${isConnected ? "" : currentBot?.color || "bg-emerald-500"}`}
              disabled={connectionState === ConnectionState.CONNECTING}
            >
              {connectionState === ConnectionState.CONNECTING ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isConnected ? (
                <X className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </Button>
          </div>

          {/* Status Text */}
          <div className="w-full text-center text-xs sm:text-sm text-muted-foreground mt-1">
            {isConnected ? "Click button to end session" : "Click button to start session"}
          </div>
        </CardContent>
      </Card>

      {/* Error Dialog */}
      <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Error</DialogTitle>
            <DialogDescription>{errorMessage}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button onClick={() => setErrorDialogOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Audio element for click sound */}
      <audio ref={audioRef} className="hidden" />

      <div className="mt-2 sm:mt-3 text-xs text-muted-foreground">Voice Assistant © 2025</div>
    </div>
  )
}