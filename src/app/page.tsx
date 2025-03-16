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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
      };
    }
  }, []);

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
      if (Array.isArray(data)) {
        setAvailableVoices(data);
        
        // Create personas from the voices
        const personas: BotPersona[] = data.map((voice: UltravoxVoice) => {
          // Choose a system prompt based on the voice name pattern
          let prompt = systemPrompts.general;
          const voiceLower = voice.name.toLowerCase();
          
          if (voiceLower.includes('customer') || voiceLower.includes('service')) {
            prompt = systemPrompts.customer;
          } else if (voiceLower.includes('tech') || voiceLower.includes('support')) {
            prompt = systemPrompts.technical;
          } else if (voiceLower.includes('creative') || voiceLower.includes('writer')) {
            prompt = systemPrompts.creative;
          }
          
          return {
            id: voice.voiceId,
            name: voice.name,
            systemPrompt: prompt,
            voice: voice.voiceId,
            color: getVoiceColor(voice.name),
            icon: <Bot className="h-4 w-4" />,
            description: voice.description || `Voice assistant using ${voice.name}`
          };
        });
        
        // Add a default persona if none are available
        if (personas.length === 0) {
          personas.push({
            id: 'default',
            name: 'Default Assistant',
            systemPrompt: systemPrompts.general,
            voice: "Mark", // Fallback to Mark as in original code
            color: "bg-blue-500",
            icon: <Bot className="h-4 w-4" />,
            description: "A general-purpose assistant that can help with a variety of topics."
          });
        }
        
        setBotPersonas(personas);
        
        // Set the default selected voice
        if (personas.length > 0 && !selectedVoice) {
          setSelectedVoice(personas[0].id);
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
      },
      {
        id: 'Daniel',
        name: 'Daniel',
        systemPrompt: systemPrompts.creative,
        voice: "Daniel",
        color: "bg-purple-600",
        icon: <Bot className="h-4 w-4" />,
        description: "A creative assistant for brainstorming and writing."
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
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize and start Ultravox session
  const initializeUltravoxSession = async () => {
    try {
      // Clean up any existing session
      if (uvSessionRef.current) {
        await uvSessionRef.current.leaveCall();
        uvSessionRef.current = null;
      }

      // Create a new session
      const url = await createUltravoxSession();
      if (!url) return false;
      
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
          setIsConnected(true);
        } else {
          setIsConnected(false);
        }
        
        // When agent is speaking, start audio visualization
        if (session.status === UltravoxSessionStatus.SPEAKING) {
          analyzeAudio();
        } else if (session.status === UltravoxSessionStatus.DISCONNECTED) {
          setAudioLevel(0);
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
      return false;
    }
  };

  const handleMicToggle = async () => {
    if (isListening) {
      stopMicrophone();
    } else {
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

  // Get indicator color based on selected bot
  const getIndicatorColor = () => {
    return currentBot?.color || "bg-blue-500";
  };

  // Get box shadow color
  const getBoxShadowColor = (opacity = 0.4) => {
    const botColor = (currentBot?.color || "bg-blue-500").replace('bg-', '');
    let rgbColor;
    
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
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {currentBot?.icon || <Bot className="h-4 w-4" />}
            <span>{currentBot?.name || 'Assistant'}</span>
          </CardTitle>
          <div className="flex items-center gap-3">
            <Select 
              value={selectedVoice} 
              onValueChange={handleVoiceChange} 
              disabled={isLoadingVoices || isConnected}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder={isLoadingVoices ? "Loading..." : "Select voice"} />
              </SelectTrigger>
              <SelectContent>
                {botPersonas.map(bot => (
                  <SelectItem key={bot.id} value={bot.id}>
                    <div className="flex items-center gap-2">
                      {bot.icon}
                      <span>{bot.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ThemeToggle />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-6">
          {/* Indicator Circle */}
          <div className="relative h-48 w-48 flex items-center justify-center">
            {/* Outer reference circle */}
            <div className="absolute w-36 h-36 rounded-full border border-muted" />
            
            {/* Active indicator with motion */}
            <motion.div 
              className={`rounded-full ${getIndicatorColor()} flex items-center justify-center`}
              animate={{ 
                width: `${currentSize}px`,
                height: `${currentSize}px`,
                opacity: isListening || sessionState === "speaking" ? 0.85 : 0.5,
                boxShadow: isListening || sessionState === "speaking" ? 
                  `0 0 ${30 + (audioLevel * 20)}px ${getBoxShadowColor(getGlowIntensity())}` : 'none'
              }}
              transition={{ duration: 0.1 }}
            >
              {isLoading ? (
                <Loader2 size={28} className="text-white animate-spin" />
              ) : isListening || sessionState === "speaking" ? (
                <div className="text-white">
                  {sessionState === "speaking" ? (
                    <Volume2 size={28} />
                  ) : (
                    <Mic size={28} />
                  )}
                </div>
              ) : null}
            </motion.div>
          </div>
          
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
            {conversation.map((message, index) => (
              <div 
                key={index} 
                className={`p-2 rounded-lg max-w-[85%] mb-2 ${
                  message.role === 'user' 
                    ? 'ml-auto bg-blue-500 text-white' 
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
              >
                <p className="text-sm">{message.text}</p>
              </div>
            ))}
            {transcript && (
              <div className="p-2 rounded-lg max-w-[85%] mb-2 bg-gray-200 dark:bg-gray-700">
                <motion.p
                  initial={{ opacity: 0.5 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                  className="text-sm"
                >
                  {transcript}
                </motion.p>
              </div>
            )}
            {!transcript && conversation.length === 0 && (
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
          
          {/* Mic and End Call Buttons */}
          <div className="flex w-full justify-center gap-4">
            <Button 
              onClick={handleMicToggle}
              variant={isListening ? "destructive" : "default"}
              size="lg"
              className={`h-16 w-16 rounded-full ${!isListening ? getIndicatorColor() : ''}`}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : isListening ? (
                <X className="h-6 w-6" />
              ) : (
                <Mic className="h-6 w-6" />
              )}
            </Button>
            
            {isConnected && (
              <Button 
                onClick={endSession}
                variant="destructive"
                size="lg"
                className="h-16 w-16 rounded-full"
              >
                <Phone className="h-6 w-6 transform rotate-135" />
              </Button>
            )}
          </div>
          
          {/* Status Text */}
          <div className="w-full text-center text-sm text-muted-foreground">
            {getStatusText()}
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