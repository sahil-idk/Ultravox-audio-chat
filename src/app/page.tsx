/* eslint-disable react-hooks/rules-of-hooks */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { useState, useEffect, useRef, type JSX } from "react"
import { Mic, X, Volume2, Loader2, Bot, Music, Play } from "lucide-react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/toggle"
import { UltravoxSession as AudioSession, UltravoxSessionStatus as AudioStatus } from "ultravox-client"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { LogoutButton } from "@/components/logout-button"
import { error } from "console"


// Voice interface from Ultravox API
interface VoiceOption {
  voiceId: string
  name: string
  description?: string
}

// Bot persona interface with voice integration
interface BotPersona {
  id: string
  name: string
  systemPrompt: string
  initialGreeting: string
  voice: string
  color: string
  icon: JSX.Element
  description: string
}


const ConnectionState = {
  IDLE: "idle",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  ERROR: "error",
}

const BOT_PERSONAS: BotPersona[] = [
  {
    id: "emily-bot",
    name: "Emily",
    systemPrompt: 
      "You are Emily, a friendly Pizza Hut assistant. You provide helpful information about Pizza Hut's menu, deals, locations, and ordering options. Keep your responses concise, friendly, and focused on Pizza Hut offerings. If asked about items not on the Pizza Hut menu, politely redirect to available options. You should know about popular pizzas like Pepperoni Lovers, Meat Lovers, Veggie Lovers, and Supreme, as well as sides like breadsticks, wings, and desserts like Hershey's cookies. You should be familiar with Pizza Hut's specials like the $10 Tastemaker, Big Dinner Box, and Triple Treat Box. Mention that customers can order through the Pizza Hut app or website for delivery or carryout.",
    initialGreeting: 
      "Hi there! I'm Emily, your Pizza Hut assistant. How can I help you today? I can tell you about our menu, deals, or help you place an order!",
    voice: "ab9492de-25b5-492f-b2a7-9dcb2cabe347", // Deobra voice ID (New Zealand female)
    color: "bg-emerald-500", // Pizza Hut red
    icon: <Bot className="h-4 w-4" />,
    description: "Meet Emily, your friendly Pizza Hut assistant! Ask about the menu, deals, and more."
  },
  {
    id: "mark-bot",
    name: "Mark",
    systemPrompt: 
      "You are Mark, a knowledgeable Starbucks barista assistant. You provide helpful information about Starbucks' menu, seasonal drinks, rewards program, and ordering options. Keep your responses concise, friendly, and focused on Starbucks offerings. If asked about items not on the Starbucks menu, politely redirect to available options. You should know about popular drinks like Frappuccinos, lattes, cold brews, and refreshers, as well as food items like breakfast sandwiches, pastries, and protein boxes. You should be familiar with the Starbucks Rewards program, mobile ordering through the Starbucks app, and customization options for drinks.",
    initialGreeting: 
      "Hello! I'm Mark, your Starbucks assistant. How can I help you today? I can tell you about our drinks, food menu, or the Starbucks Rewards program!",
    voice: "91fa9bcf-93c8-467c-8b29-973720e3f167", // Mark voice ID
    color: "bg-emerald-500", // Starbucks green
    icon: <Bot className="h-4 w-4" />,
    description: "Mark is your Starbucks expert for drinks, food, and rewards information."
  },
  {
    id: "aaron-bot",
    name: "Aaron",
    systemPrompt: 
      "You are Aaron, a helpful Chipotle Mexican Grill assistant. You provide information about Chipotle's menu, ingredients, nutritional information, and ordering options. Keep your responses concise, friendly, and focused on Chipotle offerings. If asked about items not on the Chipotle menu, politely redirect to available options. You should know about building burritos, bowls, tacos, and quesadillas, as well as proteins like chicken, steak, barbacoa, carnitas, and plant-based options. You should be familiar with Chipotle's commitment to Food With Integrity, the rewards program, and digital ordering through the Chipotle app or website.",
    initialGreeting: 
      "Hi there! I'm Aaron from Chipotle. How can I help you today? I can tell you about our menu items, ingredients, or how to place an order!",
    voice: "feccf00b-417e-4e7a-9f89-62f537280334", // Aaron-English voice ID
    color: "bg-emerald-500", // Chipotle dark red
    icon: <Bot className="h-4 w-4" />,
    description: "Aaron can help with Chipotle's menu, ingredients, and ordering options."
  }
];


const APP_TITLE = "Voice AI Demo";
const APP_FOOTER = "Dot Vector Voice Research © 2025";



const getVoiceColor = (voiceName: string): string => {
  // Convert name to lowercase for case-insensitive matching
  const nameLower = voiceName.toLowerCase();
  
  // Fallback color assignment for any voices
  const colors = [
    "bg-blue-500",
    "bg-emerald-500",
    "bg-violet-500",
    "bg-amber-500",
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

export default function AudioVisualizer() {
  const [isListening, setIsListening] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [selectedVoice, setSelectedVoice] = useState<string>(BOT_PERSONAS[0].id)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>([])
  const [botPersonas, setBotPersonas] = useState<BotPersona[]>(BOT_PERSONAS)
  const [isLoadingVoices, setIsLoadingVoices] = useState(false)
  const [windowWidth, setWindowWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1024)
  const [aiSpeaking, setAiSpeaking] = useState(false)
  const [waveEffect, setWaveEffect] = useState(false)

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
  const [isPageVisible, setIsPageVisible] = useState(true)
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  const MAX_RECONNECT_ATTEMPTS = 3
  const INACTIVITY_TIMEOUT = 5 * 60 * 1000 
  
  // Flag for showing transcript container
  const [showTranscript, setShowTranscript] = useState(false)

  // Refs
  const micStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const frameRef = useRef<number | null>(null)
  const prevLevelRef = useRef<number>(0)
  const audioEngineRef = useRef<AudioSession | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null)
  const connectionTimerRef = useRef<NodeJS.Timeout | null>(null)
  // Use refs for inactivity tracking instead of state
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastActivityTimeRef = useRef<number>(Date.now())
  // Add visibility timer ref for tab switching
  const visibilityTimerRef = useRef<NodeJS.Timeout | null>(null)
  // Add refs for handling dialog flickering
  const isTabSwitchingRef = useRef(false);
  const dialogDebounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get custom voice prompts
  

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
  // Update initialization in useEffect
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

    // If you want to fetch voices from API, uncomment this
    // fetchVoices()

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
      if (audioEngineRef.current) {
        audioEngineRef.current.leaveCall()
      }
      if (connectionTimerRef.current) {
        clearInterval(connectionTimerRef.current)
      }
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
      }
      if (visibilityTimerRef.current) {
        clearTimeout(visibilityTimerRef.current)
      }
      if (dialogDebounceTimeoutRef.current) {
        clearTimeout(dialogDebounceTimeoutRef.current)
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

  // This function would fetch voices from API if needed
  // Currently using our predefined BOT_PERSONAS instead
     
  const fetchVoices = async () => {
    try {
      setIsLoadingVoices(true)
  
      const response = await fetch("/api/create-ultravox-call", { // Keep API endpoint the same
        method: "GET",
      })
  
      if (!response.ok) {
        throw new Error(`Failed to fetch voice options: ${response.status}`)
      }
  
      const data = await response.json()
      setAvailableVoices(data)
      
    } catch (error) {
      console.error("Error fetching voice options")
    } finally {
      setIsLoadingVoices(false)
    }
  }

  // Auto-scroll the transcript container
  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight
    }
  }, [conversation, transcript])

  // Create Ultravox session
  const setupAudioConnection = async () => {
    try {
      setIsLoading(true)
      setErrorMessage(null)
  
      // Find the selected bot
      const botPersona = botPersonas.find((bot) => bot.id === selectedVoice) || botPersonas[0]
  
      // Get any custom greeting from the hook, fallback to the default initial greeting
      const customPrompt = botPersona.initialGreeting;
      
      console.log("Creating audio connection:", botPersona.voice)
  
      const response = await fetch("/api/create-ultravox-call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemPrompt: `${botPersona.systemPrompt} 
  
  Initial greeting: ${customPrompt}`,
          voice: botPersona.voice,
          temperature: 0.7,
        }),
      })
  
      // Check for specific error status codes
      if (!response.ok) {
        const errorData = await response.json()
        
        // Set specific error messages based on status code
        if (response.status === 403) {
          throw new Error("INVALID_TOKEN")
        } else if (response.status === 402) {
          throw new Error("EXPIRED_TOKEN")
        } else {
          throw new Error(`Request failed: ${response.status}`)
        }
      }
  
      const data = await response.json()
  
      if (!data.joinUrl) {
        throw new Error("Invalid response: missing connection URL")
      }
  
      console.log("Connection created successfully")
  
      setJoinUrl(data.joinUrl)
      setSessionId(data.callId)
  
      return data.joinUrl
    } catch (error) {
      // Handle specific error types
      if (error instanceof Error) {
        if (error.message === "INVALID_TOKEN") {
          console.error("Invalid session token")
          setErrorMessage("Invalid Session Token")
        } else if (error.message === "EXPIRED_TOKEN") {
          console.error("Expired session token")
          setErrorMessage("Expired Session Token")
        } else {
          console.error("Connection setup failed")
          setErrorMessage("Failed to create connection")
        }
      } else {
        console.error("Connection setup failed")
        setErrorMessage("Failed to create connection")
      }
      
      setErrorDialogOpen(true)
      setConnectionState(ConnectionState.ERROR)
      return null
    } finally {
      setIsLoading(false)
    }
  }
  
  // Improved visibility change handler with delayed session end
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';
      setIsPageVisible(isVisible);
      
      // Clear any existing visibility timer
      if (visibilityTimerRef.current) {
        clearTimeout(visibilityTimerRef.current);
        visibilityTimerRef.current = null;
      }
      
      // Clear any existing dialog debounce timeout
      if (dialogDebounceTimeoutRef.current) {
        clearTimeout(dialogDebounceTimeoutRef.current);
        dialogDebounceTimeoutRef.current = null;
      }
      
      if (!isVisible && isConnected) {
        // Mark that we're handling a tab switch
        isTabSwitchingRef.current = true;
        
        // Add a short delay before ending session
        visibilityTimerRef.current = setTimeout(() => {
          // Only proceed if the page is still not visible
          if (document.visibilityState !== 'visible' && isConnected) {
            // Set the error message first
            setErrorMessage("Session ended due to tab change/browser minimization.");
            
            // End the session
            endSession();
            
            // Show dialog after a small delay to avoid flickering
            dialogDebounceTimeoutRef.current = setTimeout(() => {
              if (!isTabSwitchingRef.current) return; // Safety check
              setErrorDialogOpen(true);
              isTabSwitchingRef.current = false;
            }, 300);
          } else {
            // If user came back quickly, reset the flag
            isTabSwitchingRef.current = false;
          }
        }, 1000); // 1 second delay
      } else if (isVisible) {
        // If user quickly returns to the tab
        isTabSwitchingRef.current = false;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (visibilityTimerRef.current) {
        clearTimeout(visibilityTimerRef.current);
      }
      if (dialogDebounceTimeoutRef.current) {
        clearTimeout(dialogDebounceTimeoutRef.current);
      }
    };
  }, [isConnected]);

  // Add this useEffect to handle beforeunload event - fixed deprecated returnValue warning
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isConnected) {
        // Clean up the session
        endSession()
        
        // Show a confirmation dialog to the user
        e.preventDefault()
        
        // Use a message string
        const message = 'You have an active voice session. Are you sure you want to leave?'
        
        // For older browsers, use type assertion to avoid TypeScript warnings
        // This is still necessary for browser compatibility
        e.returnValue = message as any
        
        return message
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [isConnected])

  // Add this useEffect to handle network connectivity changes
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Update online handler reference
const handleOnline = () => {
  setIsOnline(true)
  
  // If we were previously connected and went offline, try to reconnect
  if (isConnected && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    tryReconnect()
  }
}

    const handleOffline = () => {
      setIsOnline(false)
      
      if (isConnected) {
        setErrorMessage("Network connection lost. Session disconnected.")
        setErrorDialogOpen(true)
        
        // Set state to disconnected but don't fully end session yet
        setConnectionState(ConnectionState.ERROR)
      }
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [isConnected, reconnectAttempts])

  // FIXED: Handle user inactivity with proper refs instead of state
  useEffect(() => {
    if (!isConnected) return
    
    // Function to handle user activity
    const handleUserActivity = () => {
      // Update the ref directly instead of using state
      lastActivityTimeRef.current = Date.now()
      
      // Reset the timer when there's user activity
      resetInactivityTimer()
    }
    
    // Function to reset the inactivity timer
    const resetInactivityTimer = () => {
      // Clear any existing timer
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
        inactivityTimerRef.current = null
      }
      
      // Set a new timer using the ref
      inactivityTimerRef.current = setTimeout(() => {
        const currentTime = Date.now()
        const inactiveTime = currentTime - lastActivityTimeRef.current
        
        if (inactiveTime >= INACTIVITY_TIMEOUT && isConnected) {
          setErrorMessage("Session disconnected due to inactivity.")
          setErrorDialogOpen(true)
          endSession()
        }
      }, INACTIVITY_TIMEOUT)
    }
    
    // Add event listeners for user activity
    window.addEventListener('mousemove', handleUserActivity)
    window.addEventListener('keydown', handleUserActivity)
    window.addEventListener('click', handleUserActivity)
    window.addEventListener('touchstart', handleUserActivity)
    
    // Initial setup of the inactivity timer
    resetInactivityTimer()
    
    // Clean up
    return () => {
      window.removeEventListener('mousemove', handleUserActivity)
      window.removeEventListener('keydown', handleUserActivity)
      window.removeEventListener('click', handleUserActivity)
      window.removeEventListener('touchstart', handleUserActivity)
      
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
        inactivityTimerRef.current = null
      }
    }
  }, [isConnected, INACTIVITY_TIMEOUT]) // Only depend on isConnected and constants
  
  // Add this function to attempt reconnection
  // Renamed from attemptReconnect to tryReconnect
const tryReconnect = async () => {
  try {
    setReconnectAttempts(prev => prev + 1)
    setConnectionState(ConnectionState.CONNECTING)
    setConnectionProgress(30)
    
    // Clear any previous errors
    setErrorMessage(null)
    setErrorDialogOpen(false)
    
    // Attempt to rejoin the existing call if we have a join URL
    if (joinUrl && audioEngineRef.current) {
      audioEngineRef.current.joinCall(joinUrl)
      return true
    } else {
      // Otherwise create a new session
      return await configureAudioSession()
    }
  } catch (error) {
    console.error("Reconnection failed")
    setErrorMessage("Failed to reconnect, please try again.")
    setErrorDialogOpen(true)
    setConnectionState(ConnectionState.ERROR)
    return false
  }
}
  
  // Update the endSession function to use the refs for the timer
  const endSession = async () => {
    try {
      // Stop microphone if active
      if (isListening) {
        stopAudioInput()
      }
  
      // Leave audio call
      if (audioEngineRef.current) {
        await audioEngineRef.current.leaveCall()
        audioEngineRef.current = null
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
      setReconnectAttempts(0) // Reset reconnection attempts
  
      // Clear all timers
      if (connectionTimerRef.current) {
        clearInterval(connectionTimerRef.current)
        connectionTimerRef.current = null
      }
      
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
        inactivityTimerRef.current = null
      }
      
      if (visibilityTimerRef.current) {
        clearTimeout(visibilityTimerRef.current)
        visibilityTimerRef.current = null
      }
      
      if (dialogDebounceTimeoutRef.current) {
        clearTimeout(dialogDebounceTimeoutRef.current)
        dialogDebounceTimeoutRef.current = null
      }
    } catch (error) {
      console.error("Disconnection failed")
      setErrorMessage("Failed to disconnect properly")
      
      // Ensure we don't show multiple dialogs
      if (!isTabSwitchingRef.current) {
        setErrorDialogOpen(true)
      }
    }
  }

  // Initialize and start Ultravox session
  // Initialize and start audio session
const configureAudioSession = async () => {
  try {
    // Set connection state to CONNECTINGf
    setConnectionState(ConnectionState.CONNECTING)
    setConnectionProgress(0)

    // Start progress animation with improved timing
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
    if (audioEngineRef.current) {
      await audioEngineRef.current.leaveCall()
      audioEngineRef.current = null
    }

    // Create a new session
    const url = await setupAudioConnection()
    if (!url) {
      if (connectionTimerRef.current) {
        clearInterval(connectionTimerRef.current)
        connectionTimerRef.current = null
      }
      setConnectionState(ConnectionState.ERROR)
      return false
    }

    // Initialize the audio session
    const session = new AudioSession({
      experimentalMessages: new Set(["debug"]),
    })

    // Set up event listeners
    session.addEventListener("status", (event) => {
      console.log("Connection status updated:", session.status)
      setSessionState(session.status)
    
      // Update UI based on status
      if (
        session.status === AudioStatus.LISTENING ||
        session.status === AudioStatus.THINKING ||
        session.status === AudioStatus.SPEAKING
      ) {
        // Successfully connected
        if (connectionState !== ConnectionState.CONNECTED) {
          if (connectionTimerRef.current) {
            clearInterval(connectionTimerRef.current)
            connectionTimerRef.current = null
          }
          setConnectionProgress(100)
          setConnectionState(ConnectionState.CONNECTED)
          
          // Reset reconnection attempts on successful connection
          setReconnectAttempts(0)
        }
    
        setIsConnected(true)
        
        // Set AI speaking state based on status
        setAiSpeaking(session.status === AudioStatus.SPEAKING)
        
        // Trigger wave effect when AI starts speaking
        if (session.status === AudioStatus.SPEAKING) {
          setWaveEffect(true)
          // Start audio visualization for AI speaking
          analyzeAudio()
        } else {
          setWaveEffect(false)
        }
      } else if (session.status === AudioStatus.DISCONNECTED) {
        setIsConnected(false)
        setAudioLevel(0)
        setConnectionState(ConnectionState.IDLE)
        setAiSpeaking(false)
        setWaveEffect(false)
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
      console.log("Debug message:", (event as any).message)
    })

    // Store the session
    audioEngineRef.current = session

    // Join the call
    session.joinCall(url)

    return true
  } catch (error) {
    // Only set a new error message if one wasn't already set by setupAudioConnection
    if (!errorMessage || !errorDialogOpen) {
      console.error("Connection initialization failed")
      setErrorMessage(error instanceof Error ? error.message : String(error))
      setErrorDialogOpen(true)
    }
    
    setConnectionState(ConnectionState.ERROR)

    // Clear connection progress timer
    if (connectionTimerRef.current) {
      clearInterval(connectionTimerRef.current)
      connectionTimerRef.current = null
    }
    return false
  }
}

  const toggleMicrophone = async () => {
    if (!isConnected) {
      // Start a new session
      await startAudioInput()
    }
  }

  // Enhanced Error Dialog component with fix for flickering
  const ErrorDialog = () => {
    // Use local state to prevent dialog flickering
    const [localDialogOpen, setLocalDialogOpen] = useState(false);
    const [localErrorMessage, setLocalErrorMessage] = useState<string | null>(null);
    
    // Only sync state from parent when needed
    useEffect(() => {
      if (errorDialogOpen && !localDialogOpen) {
        setLocalDialogOpen(true);
        setLocalErrorMessage(errorMessage);
      }
    }, [errorDialogOpen, errorMessage]);
    
    const handleClose = () => {
      setLocalDialogOpen(false);
      setErrorDialogOpen(false);
    };
    
    const handleRetry = async () => {
      setLocalDialogOpen(false);
      setErrorDialogOpen(false);
      await tryReconnect();
    };
    
    return (
      <Dialog 
        open={localDialogOpen} 
        onOpenChange={(open) => {
          if (!open) {
            handleClose();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {localErrorMessage?.includes("Network") || localErrorMessage?.includes("Failed to reconnect") 
                ? "Connection Error" 
                : localErrorMessage?.includes("Session paused") || localErrorMessage?.includes("Session ended")
                  ? "Session Ended" 
                  : "Error"}
            </DialogTitle>
            <DialogDescription>{localErrorMessage}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            {(localErrorMessage?.includes("Network") || localErrorMessage?.includes("reconnect")) && isOnline && (
              <Button onClick={handleRetry}>
                Retry
              </Button>
            )}
            <Button onClick={handleClose}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  const startAudioInput = async () => {
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

    // If not connected, initialize
    if (!audioEngineRef.current || audioEngineRef.current.status === AudioStatus.DISCONNECTED) {
      const success = await configureAudioSession()
      if (!success) {
        // Don't override error message here if one is already set from configureAudioSession
        if (!errorMessage) {
          throw new Error(errorMessage || 'expired token')
        } else {
          // Return false without throwing a new error to preserve the error message
          return false
        }
      }
    } else {
      // If in IDLE state, ensure microphone is unmuted
      if (audioEngineRef.current.isMicMuted) {
        audioEngineRef.current.unmuteMic()
      }
    }

    setIsListening(true)

    analyzeAudio()
    return true
  } catch (error) {
    // Only set a new error message if one wasn't already set by configureAudioSession
    if (!errorMessage || !errorDialogOpen) {
      console.log(error)
      console.error("Failed to access microphone")
      setErrorMessage(error instanceof Error ? error.message : String(error))
      setErrorDialogOpen(true)
    }
    setConnectionState(ConnectionState.ERROR)
    return false
  }
}
  

  const stopAudioInput = () => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop())
      micStreamRef.current = null
    }
  
    // Mute microphone in session if connected
    if (
      audioEngineRef.current &&
      audioEngineRef.current.status !== AudioStatus.DISCONNECTED &&
      !audioEngineRef.current.isMicMuted
    ) {
      audioEngineRef.current.muteMic()
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

  const handleVoiceChange = async (voiceId: string) => {
    console.log("Voice changed to:", voiceId)
    setSelectedVoice(voiceId)

    // If already connected, disconnect and reconnect with new voice
    if (isConnected) {
      await endSession()

      // Small delay to ensure everything is cleaned up
      setTimeout(async () => {
        await startAudioInput()
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
      baseSize: 120, // Smaller base size for desktop
      maxExpansion: 80, // Less expansion on desktop
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

  // Enhanced glow intensity function
  const getGlowIntensity = () => {
    if (aiSpeaking) {
      return 0.3 + audioLevel * 0.7; // More intense glow when AI is speaking
    }
    return 0.2 + audioLevel * 0.6; // Normal glow for user speaking
  }

  // Display status text based on session state
  const getStatusText = () => {
    if (connectionState === ConnectionState.CONNECTING) {
      return (
        <div className="flex items-center">
          <div className="w-2 h-2 bg-yellow-500 rounded-full mr-2 animate-pulse"></div>
          Connecting to {currentBot?.name || "Assistant"}...
        </div>
      );
    }
  
    if (!isConnected) {
      return (
        <div className="flex items-center">
          <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
          Disconnected 
        </div>
      );
    }
  
    switch (sessionState) {
      case "speaking":
        return (
          <div className="flex items-center">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
            {currentBot?.name || "Assistant"} is speaking
          </div>
        );
      case "thinking":
        return (
          <div className="flex items-center">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
            {currentBot?.name || "Assistant"} is thinking
          </div>
        );
      case "listening":
        return (
          <div className="flex items-center">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
            {currentBot?.name || "Assistant"} is listening
          </div>
        );
      default:
        return (
          <div className="flex items-center">
            <div className="w-2 h-2 bg-gray-500 rounded-full mr-2"></div>
            Ready
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-5 sm:p-10 bg-background text-foreground">
      <Card className="w-full max-w-md ">
      {/* // Update the header section in your page.tsx */}
<CardHeader className="flex flex-row items-center justify-between">
  <CardTitle className="flex items-center gap-2 text-lg sm:text-md">
    <Bot size={24} className="text-emerald-500" />
    {APP_TITLE}
  </CardTitle>
  <div className="flex items-center gap-3">
    <ThemeToggle />
    {/* <LogoutButton /> */}
  </div>
</CardHeader>
        <CardContent className="flex flex-col items-center space-y-4 sm:space-y-6 ">
          {/* Voice Tabs */}
          <div className="w-full grid grid-cols-3 gap-2">
            {botPersonas.slice(0, 3).map((bot) => (
              <Button
                key={bot.id}
                onClick={() => handleVoiceChange(bot.id)}
                variant={selectedVoice === bot.id ? "outline" : "outline"}
                className={selectedVoice === bot.id ? "border-emerald-500" :""}
                disabled={isLoadingVoices || connectionState === ConnectionState.CONNECTING || isConnected}
              >
                {bot.name}
              </Button>
            ))}
          </div>

          {/* Bot Description */}
          <div className="w-full text-center text-sm text-muted-foreground">
            {currentBot?.description || "Voice assistant ready to help"}
          </div>

          {/* Indicator Circle */}
          {/* Indicator Circle Container */}
          <div className="relative h-44 sm:h-72 w-44 sm:w-72 flex items-center justify-center overflow-hidden">
            {/* Structure similar to reference code */}
            <div className="absolute w-full h-full z-0 top-0">
              {/* Central reference point similar to the span in reference */}
              <span 
                className="aspect-square h-20 sm:h-24 absolute translate-x-[-50%] translate-y-[-50%] top-[50%] left-[50%] rounded-full z-10"
              />
              
              {/* Container for animation effects - similar to the canvas container */}
              <div className="w-full h-[120%] z-0 top-[50%] translate-y-[-50%] absolute">
                {/* Ripple effect when AI is speaking */}
                {waveEffect && (
                  <motion.div
                    className="absolute left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] rounded-full border-2 border-emerald-500/30"
                    style={{ 
                      width: `${baseSize}px`, 
                      height: `${baseSize}px`,
                      pointerEvents: 'none' 
                    }}
                    animate={{ 
                      scale: [1, 2.5],
                      opacity: [0.5, 0],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "linear"
                    }}
                  />
                )}
                
                {/* Secondary pulse effect for continuous motion */}
                {aiSpeaking && (
                  <motion.div
                    className="absolute left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] rounded-full bg-emerald-400/60"
                    style={{ 
                      width: `${baseSize * 1.3}px`, 
                      height: `${baseSize * 1.3}px`,
                      pointerEvents: 'none'
                    }}
                    animate={{ 
                      scale: [0.9, 1.1],
                      opacity: [0.2, 0.3],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      repeatType: "reverse",
                      ease: "easeInOut"
                    }}
                  />
                )}
                
                {/* Main circle effect - always present */}
                <motion.div
                  className="absolute left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] rounded-full bg-emerald-500 flex items-center justify-center"
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
                    <Loader2 size={28} className="text-white animate-spin" />
                  ) : isConnected ? (
                    <div className="text-white">
                      {sessionState === "speaking" ? <Volume2 size={28} /> : <Mic size={28} />}
                    </div>
                  ) : null}
                </motion.div>
              </div>
            </div>
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

          {/* Transcript Display - Only show when connected and has content */}
          {showTranscript && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="w-full bg-muted/30 p-2 sm:p-3 rounded-md max-h-[4.5em] sm:max-h-[4.5em] overflow-y-auto mt-2"
              ref={transcriptContainerRef}
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(156, 163, 175, 0.5) transparent',
              }}
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
              {getStatusText()}
            </div>

            {isConnected && (
              <Badge variant="outline" className="font-mono text-xs">
                {Math.round(audioLevel * 100)}%
              </Badge>
            )}
          </div>

                
          {/* Control Button */}
          <div className="flex w-full justify-center">
          <Button
  onClick={isConnected ? endSession : toggleMicrophone}
  variant={isConnected ? "destructive" : "default"}
  className={`flex-1 py-5 ${
    isConnected 
      ? "bg-red-500 hover:bg-red-700" 
      : connectionState === ConnectionState.CONNECTING
        ? "bg-emerald-500 hover:bg-emerald-600"
        : "bg-emerald-500 hover:bg-emerald-600"
  }`}
  disabled={connectionState === ConnectionState.CONNECTING}
>
  {connectionState === ConnectionState.CONNECTING ? (
    <>
      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
      Connecting...
    </>
  ) : isConnected ? (
    <>
      <X className="mr-2" size={20} />
      Stop Session
    </>
  ) : (
    <>
      <Play className="mr-2" size={20} />
      Start Session
    </>
  )}
</Button>
          </div>
        </CardContent>
      </Card>

      {/* Error Dialog */}
      <ErrorDialog />

      {/* Audio element for click sound */}
      <audio ref={audioRef} className="hidden" />

      <div className="mt-2 sm:mt-3 text-xs text-muted-foreground">{APP_FOOTER}</div>
    </div>
  )
}