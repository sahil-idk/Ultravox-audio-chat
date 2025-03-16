/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useRef, JSX } from 'react';
import { Mic, X, Volume2, Loader2, Bot, Phone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/toggle';
import { UltravoxSession, UltravoxSessionStatus } from 'ultravox-client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { VoiceTabs } from '@/components/voice-tabs';

// Voice interface from Ultravox API
interface UltravoxVoice {
  voiceId: string;
  name: string;
  description?: string;
}

// Bot persona interface with voice integration
interface BotPersona {
  id: string;
  name: string;
  systemPrompt: string;
  voice: string;
  color: string;
  icon: JSX.Element;
  description: string;
}

// System prompts for different assistant types
const systemPrompts = {
  general: "You are a helpful AI assistant talking to a user. Keep your responses helpful and concise.",
  customer: "You are a friendly customer service representative. Help the customer with their questions and concerns in a professional and friendly manner.",
  technical: "You are a technical support agent helping users troubleshoot problems with their devices. Be patient, methodical, and clear in your explanations.",
  creative: "You are a creative assistant helping users with generating ideas, writing content, and brainstorming. Be imaginative and enthusiastic."
};

// Assign a color to each voice based on its name (for consistency)
const getVoiceColor = (voiceName: string): string => {
  const colors = [
    "bg-blue-500", "bg-green-600", "bg-purple-600", "bg-red-600", 
    "bg-yellow-500", "bg-indigo-600", "bg-pink-600", "bg-teal-600"
  ];
  
  // Hash the name to get a consistent color
  let hash = 0;
  for (let i = 0; i < voiceName.length; i++) {
    hash = ((hash << 5) - hash) + voiceName.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  
  // Use absolute value and modulo to get index within colors array
  const colorIndex = Math.abs(hash) % colors.length;
  return colors[colorIndex];
};

// Connection states
const ConnectionState = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error'
};

export default function AudioVisualizer() {
  const [isListening, setIsListening] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [selectedVoice, setSelectedVoice] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<UltravoxVoice[]>([]);
  const [botPersonas, setBotPersonas] = useState<BotPersona[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(true);
  
  // Connection state management
  const [connectionState, setConnectionState] = useState(ConnectionState.IDLE);
  const [connectionProgress, setConnectionProgress] = useState(0);
  
  // Ultravox state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<string>("idle");
  const [isConnected, setIsConnected] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [conversation, setConversation] = useState<Array<{role: string, text: string}>>([]);
  
  // Refs
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number | null>(null);
  const prevLevelRef = useRef<number>(0);
  const uvSessionRef = useRef<UltravoxSession | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);
  const connectionTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const SAMPLE_RATE = 16000; // Match with Ultravox requirements
  
  // Initialize audio context and analyzer
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      
      audioContextRef.current = new AudioContext({
        sampleRate: SAMPLE_RATE
      });
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.7;
      
      audioRef.current = new Audio("/mixkit-select-click-1109.wav");
      
      // Fetch available voices
      fetchVoices();
      
      return () => {
        if (frameRef.current) {
          cancelAnimationFrame(frameRef.current);
        }
        if (micStreamRef.current) {
          micStreamRef.current.getTracks().forEach(track => track.stop());
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }
        if (uvSessionRef.current) {
          uvSessionRef.current.leaveCall();
        }
        if (connectionTimerRef.current) {
          clearInterval(connectionTimerRef.current);
        }
      };
    }
  },[]);

  // Fetch available voices from Ultravox API
  const fetchVoices = async () => {
    try {
      setIsLoadingVoices(true);
      
      const response = await fetch('/api/create-ultravox-call', {
        method: 'GET'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch voices: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Ensure the data is in the expected format
      // Find default voice - prefer Elihiz/Emily
      const findDefaultVoice = (voices: UltravoxVoice[]) => {
        // First try to find Elihiz
        const elihizVoice = voices.find(voice => 
          voice.name?.toLowerCase().includes('elihiz')
        );
        
        if (elihizVoice) return elihizVoice.voiceId;
        
        // Next try for Emily (might be a similar female voice)
        const emilyVoice = voices.find(voice => 
          voice.name?.toLowerCase().includes('emily')
        );
        
        if (emilyVoice) return emilyVoice.voiceId;
        
        // Fall back to first female voice or just first voice
        const femaleVoice = voices.find(voice => 
          voice.name?.toLowerCase().includes('female') || 
          voice.description?.toLowerCase().includes('female')
        );
        
        if (femaleVoice) return femaleVoice.voiceId;
        
        // Last resort: first available voice
        return voices.length > 0 ? voices[0].voiceId : '';
      };
        
      if (Array.isArray(data)) {
        setAvailableVoices(data);
        
        // Create personas from the voices
        const personas: BotPersona[] = data.map((voice: UltravoxVoice) => {
          // Choose a system prompt based on the voice name pattern
          let prompt = systemPrompts.general;
          const voiceLower = voice.name?.toLowerCase() || '';
          
          if (voiceLower.includes('customer') || voiceLower.includes('service')) {
            prompt = systemPrompts.customer;
          } else if (voiceLower.includes('tech') || voiceLower.includes('support')) {
            prompt = systemPrompts.technical;
          } else if (voiceLower.includes('creative') || voiceLower.includes('writer')) {
            prompt = systemPrompts.creative;
          }
          
          return {
            id: voice.voiceId,
            name: voice.name || 'Unknown Voice',
            systemPrompt: prompt,
            voice: voice.voiceId,
            color: getVoiceColor(voice.name || ''),
            icon: <Bot className="h-4 w-4" />,
            description: voice.description || `Voice assistant using ${voice.name}`
          };
        });
        
        setBotPersonas(personas);
        
        // Set default voice to Elihiz or similar female voice
        const defaultVoiceId = findDefaultVoice(data);
        if (defaultVoiceId) {
          setSelectedVoice(defaultVoiceId);
        }
      } else {
        // If the API doesn't return an array, use fallback personas
        setFallbackPersonas();
      }
    } catch (error) {
      console.error("Error fetching voices:", error);
      setFallbackPersonas();
    } finally {
      setIsLoadingVoices(false);
    }
  };

  // Set fallback personas if voice API fails
  const setFallbackPersonas = () => {
    const fallbackPersonas = [
      {
        id: 'Mark',
        name: 'Mark',
        systemPrompt: systemPrompts.general,
        voice: "Mark",
        color: "bg-blue-500",
        icon: <Bot className="h-4 w-4" />,
        description: "A general-purpose assistant that can help with a variety of topics."
      },
      {
        id: 'Emily',
        name: 'Emily',
        systemPrompt: systemPrompts.customer,
        voice: "Emily",
        color: "bg-green-600",
        icon: <Bot className="h-4 w-4" />,
        description: "A friendly customer service representative."
      },
      {
        id: 'Josh',
        name: 'Josh',
        systemPrompt: systemPrompts.technical,
        voice: "Josh",
        color: "bg-red-600",
        icon: <Bot className="h-4 w-4" />,
        description: "A technical support specialist."
      }
    ];
    
    setBotPersonas(fallbackPersonas);
    setSelectedVoice(fallbackPersonas[0].id);
  };

  // Auto-scroll the transcript container
  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, [conversation, transcript]);

  // Create Ultravox session
  const createUltravoxSession = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      
      // Find the selected bot
      const botPersona = botPersonas.find(bot => bot.id === selectedVoice) || botPersonas[0];
      
      console.log("Creating call with voice:", botPersona.voice);
      
      const response = await fetch('/api/create-ultravox-call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          systemPrompt: botPersona.systemPrompt,
          voice: botPersona.voice,
          temperature: 0.7
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to create Ultravox call: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.joinUrl) {
        throw new Error("Invalid response: missing joinUrl");
      }
      
      console.log("Created call with join URL:", data.joinUrl);
      
      setJoinUrl(data.joinUrl);
      setSessionId(data.callId);
      
      return data.joinUrl;
    } catch (error) {
      console.error("Error creating Ultravox call:", error);
      setErrorMessage(error instanceof Error ? error.message : "Failed to create Ultravox call");
      setErrorDialogOpen(true);
      setConnectionState(ConnectionState.ERROR);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize and start Ultravox session
  const initializeUltravoxSession = async () => {
    try {
      // Set connection state to CONNECTING
      setConnectionState(ConnectionState.CONNECTING);
      setConnectionProgress(0);
      
      // Start progress animation with improved timing
      // First jump to 20% quickly to show immediate feedback
      setConnectionProgress(20);
      
      // Then continue with smoother progression
      connectionTimerRef.current = setInterval(() => {
        setConnectionProgress(prev => {
          if (prev < 40) {
            // Faster in the beginning (20% to 40%)
            return Math.min(40, prev + Math.random() * 3 + 1);
          } else if (prev < 70) {
            // Medium speed in the middle (40% to 70%)
            return Math.min(70, prev + Math.random() * 2 + 0.5);
          } else {
            // Slow down as we approach 95% (70% to 95%)
            const remainingPercentage = 95 - prev;
            const increment = Math.max(0.2, remainingPercentage * 0.05);
            return Math.min(95, prev + increment);
          }
        });
      }, 150);
      
      // Clean up any existing session
      if (uvSessionRef.current) {
        await uvSessionRef.current.leaveCall();
        uvSessionRef.current = null;
      }

      // Create a new session
      const url = await createUltravoxSession();
      if (!url) {
        if (connectionTimerRef.current) {
          clearInterval(connectionTimerRef.current);
          connectionTimerRef.current = null;
        }
        setConnectionState(ConnectionState.ERROR);
        return false;
      }
      
      // Initialize the Ultravox session
      const session = new UltravoxSession({
        experimentalMessages: new Set(['debug'])
      });
      
      // Set up event listeners
      session.addEventListener('status', (event) => {
        console.log('Session status changed:', session.status);
        setSessionState(session.status);
        
        // Update UI based on status
        if (session.status === UltravoxSessionStatus.LISTENING || 
            session.status === UltravoxSessionStatus.THINKING || 
            session.status === UltravoxSessionStatus.SPEAKING) {
          
          // Successfully connected
          if (connectionState !== ConnectionState.CONNECTED) {
            // We're connected! Stop the progress timer and complete the progress bar
            if (connectionTimerRef.current) {
              clearInterval(connectionTimerRef.current);
              connectionTimerRef.current = null;
            }
            setConnectionProgress(100);
            setConnectionState(ConnectionState.CONNECTED);
          }
          
          setIsConnected(true);
        } else if (session.status === UltravoxSessionStatus.DISCONNECTED) {
          setIsConnected(false);
          setAudioLevel(0);
          setConnectionState(ConnectionState.IDLE);
        }
        
        // When agent is speaking, start audio visualization
        if (session.status === UltravoxSessionStatus.SPEAKING) {
          analyzeAudio();
        }
      });
      
      // Set up transcript listener for real-time streaming updates
      session.addEventListener('transcripts', (event) => {
        const transcripts = session.transcripts;
        
        if (transcripts.length > 0) {
          // Find the most recent agent transcript
          const agentTranscripts = transcripts.filter(t => t.speaker === 'agent');
          
          if (agentTranscripts.length > 0) {
            const latestTranscript = agentTranscripts[agentTranscripts.length - 1];
            
            // Update current transcript for non-final messages
            if (!latestTranscript.isFinal) {
              setTranscript(latestTranscript.text);
            } else {
              // When final, move to conversation and clear the transcript
              setConversation(prev => {
                // Check if we already have this message to avoid duplicates
                const exists = prev.some(
                  msg => msg.role === 'assistant' && msg.text === latestTranscript.text
                );
                
                if (!exists) {
                  return [...prev, { role: 'assistant', text: latestTranscript.text }];
                }
                return prev;
              });
              setTranscript("");
            }
          }
          
          // Find the most recent user transcript
          const userTranscripts = transcripts.filter(t => t.speaker === 'user');
          if (userTranscripts.length > 0) {
            const latestUserTranscript = userTranscripts[userTranscripts.length - 1];
            if (latestUserTranscript.isFinal) {
              setConversation(prev => {
                // Check if we already have this message to avoid duplicates
                const exists = prev.some(
                  msg => msg.role === 'user' && msg.text === latestUserTranscript.text
                );
                
                if (!exists) {
                  return [...prev, { role: 'user', text: latestUserTranscript.text }];
                }
                return prev;
              });
            }
          }
        }
      });
      
      // Set up debug message listener
      session.addEventListener('experimental_message', (event) => {
        console.log('Experimental message:', (event as any).message);
      });

      // Store the session
      uvSessionRef.current = session;
      
      // Join the call
      session.joinCall(url);
      
      return true;
    } catch (error) {
      console.error("Error initializing Ultravox session:", error);
      setErrorMessage(error instanceof Error ? error.message : "Failed to initialize Ultravox session");
      setErrorDialogOpen(true);
      setConnectionState(ConnectionState.ERROR);
      
      // Clear connection progress timer
      if (connectionTimerRef.current) {
        clearInterval(connectionTimerRef.current);
        connectionTimerRef.current = null;
      }
      
      return false;
    }
  };

  const handleMicToggle = async () => {
    if (!isConnected) {
      // Start a new session
      await startMicrophone();
    }
  };

  const startMicrophone = async () => {
    try {
      // Resume audio context if suspended
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }, 
        video: false 
      });
      
      micStreamRef.current = stream;
      
      if (!audioContextRef.current || !analyserRef.current) {
        throw new Error("Audio context not initialized");
      }
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      
      // If not connected to Ultravox, initialize
      if (!uvSessionRef.current || uvSessionRef.current.status === UltravoxSessionStatus.DISCONNECTED) {
        const success = await initializeUltravoxSession();
        if (!success) {
          throw new Error("Failed to initialize Ultravox session");
        }
      } else {
        // If in IDLE state, ensure microphone is unmuted
        if (uvSessionRef.current.isMicMuted) {
          uvSessionRef.current.unmuteMic();
        }
      }
      
      setIsListening(true);
      
      analyzeAudio();
    } catch (error) {
      console.error("Error accessing microphone:", error);
      setErrorMessage(error instanceof Error ? error.message : "Failed to access microphone");
      setErrorDialogOpen(true);
      setConnectionState(ConnectionState.ERROR);
    }
  };

  const stopMicrophone = () => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    
    // Mute microphone in Ultravox session if connected
    if (uvSessionRef.current && 
        uvSessionRef.current.status !== UltravoxSessionStatus.DISCONNECTED && 
        !uvSessionRef.current.isMicMuted) {
      uvSessionRef.current.muteMic();
    }
    
    setIsListening(false);
    setAudioLevel(0);
    
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  };

  const analyzeAudio = () => {
    if (!analyserRef.current) return;
    
    const frequencyBinCount = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(frequencyBinCount);
    
    const updateLevel = () => {
      if (!analyserRef.current) return;
      
      analyserRef.current.getByteFrequencyData(dataArray);
      
      let sum = 0;
      let count = 0;
      
      for (let i = 0; i < frequencyBinCount; i++) {
        const weight = i < frequencyBinCount / 2 ? 1.5 : 0.8;
        sum += dataArray[i] * weight;
        count++;
      }
      
      const average = sum / count;
      
      const targetLevel = Math.min(Math.pow(average / 128, 1.8), 1);
      const smoothingFactor = 0.15; 
      const interpolatedLevel = prevLevelRef.current + 
        (targetLevel - prevLevelRef.current) * smoothingFactor;
      
      prevLevelRef.current = interpolatedLevel;
      setAudioLevel(interpolatedLevel);
      
      frameRef.current = requestAnimationFrame(updateLevel);
    };
    
    updateLevel();
  };

  const endSession = async () => {
    try {
      // Stop microphone if active
      if (isListening) {
        stopMicrophone();
      }
      
      // Leave Ultravox call
      if (uvSessionRef.current) {
        await uvSessionRef.current.leaveCall();
        uvSessionRef.current = null;
      }
      
      // Reset state
      setSessionId(null);
      setJoinUrl(null);
      setIsConnected(false);
      setSessionState("idle");
      setTranscript("");
      setConversation([]);
      setAudioLevel(0);
      setConnectionState(ConnectionState.IDLE);
      setConnectionProgress(0);
      
      // Clear any connection timers
      if (connectionTimerRef.current) {
        clearInterval(connectionTimerRef.current);
        connectionTimerRef.current = null;
      }
      
    } catch (error) {
      console.error("Error ending session:", error);
      setErrorMessage(error instanceof Error ? error.message : "Failed to end session");
      setErrorDialogOpen(true);
    }
  };

  const handleVoiceChange = async (voiceId: string) => {
    console.log("Voice changed to:", voiceId);
    setSelectedVoice(voiceId);
    
    // If already connected, disconnect and reconnect with new voice
    if (isConnected) {
      await endSession();
      
      // Small delay to ensure everything is cleaned up
      setTimeout(async () => {
        await startMicrophone();
      }, 500);
    }
  };

  const baseSize = 120; 
  const maxExpansion = 80; 
  const currentSize = baseSize + (audioLevel * maxExpansion);
  
  // Get the current bot
  const currentBot = botPersonas.find(bot => bot.id === selectedVoice) || botPersonas[0];

  // Use red for the indicator color to match the design
  const getIndicatorColor = () => {
    return "bg-red-600";
  };

  // Get box shadow color
  const getBoxShadowColor = (opacity = 0.4) => {
    const botColor = (currentBot?.color || "bg-blue-500").replace('bg-', '');
    
    switch(botColor) {
      case 'blue-500':
        return `rgba(59, 130, 246, ${opacity})`;
      case 'green-600':
        return `rgba(5, 150, 105, ${opacity})`;
      case 'red-600':
        return `rgba(220, 38, 38, ${opacity})`;
      case 'purple-600':
        return `rgba(124, 58, 237, ${opacity})`;
      case 'yellow-500':
        return `rgba(245, 158, 11, ${opacity})`;
      case 'indigo-600':
        return `rgba(79, 70, 229, ${opacity})`;
      case 'pink-600':
        return `rgba(219, 39, 119, ${opacity})`;
      case 'teal-600':
        return `rgba(13, 148, 136, ${opacity})`;
      default:
        return `rgba(59, 130, 246, ${opacity})`;
    }
  };

  const getGlowIntensity = () => {
    return 0.2 + (audioLevel * 0.8);
  };

  // Display status text based on session state
  const getStatusText = () => {
    if (connectionState === ConnectionState.CONNECTING) {
      return `Connecting to ${currentBot?.name || 'Assistant'}...`;
    }
    
    if (!isConnected) return "Click microphone to start";
    
    switch(sessionState) {
      case "speaking": return `${currentBot?.name || 'Assistant'} is speaking`;
      case "thinking": return `${currentBot?.name || 'Assistant'} is thinking`;
      case "listening": return `${currentBot?.name || 'Assistant'} is listening`;
      default: 
        return "Ready";
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-0 bg-black text-white">
      <Card className="w-full max-w-md bg-black border-gray-800 shadow-2xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <span>Voice Assistant</span>
          </CardTitle>
          <div className="flex items-center">
            <ThemeToggle />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-6">
          {/* Voice Tabs */}
          <VoiceTabs 
            voices={botPersonas}
            selectedVoiceId={selectedVoice}
            onSelectVoice={handleVoiceChange}
            disabled={isLoadingVoices || connectionState === ConnectionState.CONNECTING || isConnected}
            loading={connectionState === ConnectionState.CONNECTING}
          />
          
          {/* Indicator Circle */}
          <div className="relative h-48 w-48 flex items-center justify-center">
            {/* Outer reference circle */}
            <div className="absolute w-36 h-36 rounded-full border border-gray-700" />
            
            {/* Active indicator with motion */}
            <motion.div 
              className="rounded-full bg-red-600 flex items-center justify-center"
              animate={{ 
                width: `${currentSize}px`,
                height: `${currentSize}px`,
                opacity: isListening || sessionState === "speaking" ? 0.85 : 0.5
              }}
              transition={{ duration: 0.1 }}
            >
              {/* No loader in the center indicator */}
            </motion.div>
          </div>
          
          {/* Progress bar for connection state */}
          {connectionState === ConnectionState.CONNECTING && (
            <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden mt-2">
              <motion.div 
                className="h-full bg-red-600"
                style={{ 
                  width: `${connectionProgress}%`,
                  transition: 'width 0.3s ease-out'
                }}
              />
            </div>
          )}
          
          {/* Audio level indicator */}
          <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
            <motion.div 
              className={getIndicatorColor()}
              animate={{ 
                width: `${Math.max(2, audioLevel * 100)}%` 
              }}
              transition={{ duration: 0.1 }}
            />
          </div>
          
          {/* Transcript Display */}
          <div 
            ref={transcriptContainerRef}
            className="w-full bg-muted/30 p-3 rounded-md h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-rounded scrollbar-thumb-gray-300"
          >
            {/* Only show the latest assistant message, not a conversation */}
            {transcript ? (
              <motion.p
                initial={{ opacity: 0.5 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="text-sm"
              >
                {transcript}
              </motion.p>
            ) : conversation.length > 0 ? (
              <p className="text-sm">
                {conversation.filter(msg => msg.role === 'assistant').pop()?.text || ''}
              </p>
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-muted-foreground text-center">
                  {isConnected 
                    ? "Start speaking to begin a conversation..." 
                    : "Click the microphone button to start talking with the voice assistant"}
                </p>
              </div>
            )}
          </div>
          
          {/* Connection Status Badge */}
          {sessionId && (
            <div className="w-full text-center">
              <Badge variant={isConnected ? "default" : "outline"} className={isConnected ? getIndicatorColor() : ""}>
                {isConnected ? "Connected" : "Disconnected"}
              </Badge>
            </div>
          )}
          
          {/* Single Mic Button for start/end */}
          <div className="flex w-full justify-center">
            <Button 
              onClick={isConnected ? endSession : handleMicToggle}
              variant={isConnected ? "destructive" : "default"}
              size="lg"
              className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-700"
              disabled={connectionState === ConnectionState.CONNECTING}
            >
              {connectionState === ConnectionState.CONNECTING ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Mic className="h-6 w-6" />
              )}
            </Button>
          </div>
          
          {/* Status Text */}
          <div className="w-full text-center text-sm text-muted-foreground">
            {isConnected ? "Click microphone to end" : "Click microphone to start"}
          </div>
        </CardContent>
      </Card>
      
      {/* Error Dialog */}
      <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Error</DialogTitle>
            <DialogDescription>
              {errorMessage}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button onClick={() => setErrorDialogOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Audio element for click sound */}
      <audio ref={audioRef} className="hidden" />
    </div>
  );
}