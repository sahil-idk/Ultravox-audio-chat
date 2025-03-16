/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useRef } from 'react';
import { Play, Mic, X, Volume2, Loader2, Music } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/toggle';

type TrackId = 'gardens' | 'kugelsicher' | 'spinningHead';
type AudioSourceType = 'microphone' | 'playback' | null;

// Backend server URLs - change these to match your deployment
const BACKEND_URL = "https://fast-api-uv-backend.onrender.com";
const WS_URL = "wss://fast-api-uv-backend.onrender.com";

// Match audio sample rate with the backend
const SAMPLE_RATE = 16000;

export default function AudioVisualizer() {
  const [isListening, setIsListening] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioSource, setAudioSource] = useState<AudioSourceType>(null);
  const [selectedTrack, setSelectedTrack] = useState<TrackId>('gardens');
  const [isLoading, setIsLoading] = useState(false);
  
  // Ultravox state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState("idle"); // idle, listening, thinking, speaking
  const [isConnected, setIsConnected] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const prevLevelRef = useRef<number>(0);
  const websocketRef = useRef<WebSocket | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // For audio output from Ultravox
  const audioOutputContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  
  const audioTracks = {
    gardens: {
      name: "Gardens",
      path: "/audio/gardens.mp3",
      color: "bg-emerald-500",
      hoverColor: "hover:bg-emerald-600",
      activeColor: "bg-emerald-600"
    },
    kugelsicher: {
      name: "Kugelsicher",
      path: "/audio/kugelsicher.mp3",
      color: "bg-violet-500",
      hoverColor: "hover:bg-violet-600",
      activeColor: "bg-violet-600"
    },
    spinningHead: {
      name: "Spinning Head",
      path: "/audio/spinning-head.mp3",
      color: "bg-amber-500",
      hoverColor: "hover:bg-amber-600",
      activeColor: "bg-amber-600"
    }
  };
  
  const sampleAudioUrl = audioTracks[selectedTrack].path;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      
      audioContextRef.current = new AudioContext({
        sampleRate: SAMPLE_RATE // Match the sample rate with backend configuration
      });
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.7;
      
      // For UI click sounds
      audioRef.current = new Audio("/mixkit-select-click-1109.wav");
      
      // Initialize audio output context for ultravox audio
      audioOutputContextRef.current = new AudioContext({
        sampleRate: SAMPLE_RATE
      });
      
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
        if (audioOutputContextRef.current && audioOutputContextRef.current.state !== 'closed') {
          audioOutputContextRef.current.close();
        }
        if (websocketRef.current) {
          websocketRef.current.close();
        }
        if (processorNodeRef.current) {
          processorNodeRef.current.disconnect();
        }
      };
    }
  }, []);

  // Process audio queue for Ultravox output
  useEffect(() => {
    const playNextAudio = async () => {
      if (audioQueueRef.current.length === 0 || isPlayingRef.current) {
        return;
      }
      
      isPlayingRef.current = true;
      const audioData = audioQueueRef.current.shift();
      
      if (!audioData) return;
      
      try {
        // Create an audio context if we don't have one
        if (!audioOutputContextRef.current || audioOutputContextRef.current.state === 'closed') {
          audioOutputContextRef.current = new AudioContext({
            sampleRate: SAMPLE_RATE
          });
        }
        
        // Resume the audio context if it's suspended
        if (audioOutputContextRef.current.state === 'suspended') {
          await audioOutputContextRef.current.resume();
        }
        
        // Decode the audio data
        const audioBuffer = await audioOutputContextRef.current.decodeAudioData(audioData);
        
        const source = audioOutputContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioOutputContextRef.current.destination);
        
        source.onended = () => {
          isPlayingRef.current = false;
          
          // Try to play next audio in queue
          if (audioQueueRef.current.length > 0) {
            setTimeout(playNextAudio, 0);
          }
          // If we're not speaking anymore, update UI
          else if (sessionState === "speaking") {
            setSessionState("idle");
          }
        };
        
        source.start();
        setAudioSource('playback');
        setAudioLevel(prevLevelRef.current); // Maintain current volume level
      } catch (error) {
        console.error("Error playing audio:", error);
        isPlayingRef.current = false;
        
        // Try to play next chunk even if this one failed
        if (audioQueueRef.current.length > 0) {
          setTimeout(playNextAudio, 0);
        }
      }
    };

    // Start playing if we have audio in queue
    if (audioQueueRef.current.length > 0 && !isPlayingRef.current) {
      playNextAudio();
    }
  }, [audioQueueRef.current.length, sessionState]);

  const startMicrophone = async () => {
    try {
      if (isPlaying) {
        stopAudio();
      }
      
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
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
      
      if (audioContextRef.current && analyserRef.current) {
        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(analyserRef.current);
        
        // If not connected to Ultravox yet, initialize the session
        if (!sessionId) {
          await initializeUltravoxSession();
        } else if (!isConnected && sessionId) {
          // If we have a session ID but not connected, try to reconnect
          connectWebSocket(sessionId);
        }

        // Clean up old processor node if exists
        if (processorNodeRef.current) {
          processorNodeRef.current.disconnect();
        }

        // Set up audio processing for sending to Ultravox
        const processorNode = audioContextRef.current.createScriptProcessor(4096, 1, 1);
        processorNodeRef.current = processorNode;
        
        processorNode.onaudioprocess = (e) => {
          if (websocketRef.current && 
              websocketRef.current.readyState === WebSocket.OPEN && 
              !(websocketRef.current as any).paused) {
            const inputData = e.inputBuffer.getChannelData(0);
            
            // Convert float32 to int16
            const int16Data = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              int16Data[i] = Math.max(-32768, Math.min(32767, Math.floor(inputData[i] * 32768)));
            }
            
            // Send audio data as bytes
            try {
              websocketRef.current.send(int16Data.buffer);
            } catch (err) {
              console.error("Error sending audio data:", err);
            }
          }
        };

        // Connect the processor node
        source.connect(processorNode);
        processorNode.connect(audioContextRef.current.destination);
      }
      
      setIsListening(true);
      setAudioSource('microphone');
      
      analyzeAudio();
    } catch (error) {
      console.error("Error accessing microphone:", error);
      alert("Could not access microphone. Please check permissions.");
      setError(error instanceof Error ? error.message : "Failed to access microphone");
    }
  };

  const stopMicrophone = () => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    
    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }
    
    setIsListening(false);
    setAudioSource(null);
    setAudioLevel(0);
    
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  };

  const playAudio = async () => {
    if (isListening) {
      stopMicrophone();
    }
    
    setIsLoading(true);
    
    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume();
    }
    
    if (audioElementRef.current) {
      audioElementRef.current.removeEventListener('ended', stopAudio);
      audioElementRef.current = null;
      if (sourceNodeRef.current) {
        sourceNodeRef.current.disconnect();
        sourceNodeRef.current = null;
      }
    }
    
    audioElementRef.current = new Audio(sampleAudioUrl);
    audioElementRef.current.addEventListener('ended', stopAudio);
    audioElementRef.current.addEventListener('loadeddata', () => {
      setIsLoading(false);
    });
    
    if (audioContextRef.current && analyserRef.current && audioElementRef.current) {
      sourceNodeRef.current = audioContextRef.current.createMediaElementSource(audioElementRef.current);
      sourceNodeRef.current.connect(analyserRef.current);
      analyserRef.current.connect(audioContextRef.current.destination);
    }
    
    try {
      if (audioElementRef.current) {
        await audioElementRef.current.play();
        setIsPlaying(true);
        setAudioSource('playback');
        
        analyzeAudio();
      }
    } catch (error) {
      console.error("Error playing audio:", error);
      setIsLoading(false);
      alert("Could not play audio. Please try clicking the play button again.");
    }
  };

  const stopAudio = () => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
    }
    
    setIsPlaying(false);
    setAudioSource(null);
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

  const selectTrack = (trackId: TrackId) => {
    if (isPlaying) {
      stopAudio();
    }
    setSelectedTrack(trackId);
  };

  const handleMicToggle = () => {
    if (isListening) {
      stopMicrophone();
    } else {
      startMicrophone();
    }
  };

  const handlePlayToggle = () => {
    if (isPlaying) {
      stopAudio();
    } else {
      playAudio();
    }
  };

  // Initialize a new Ultravox session
  const initializeUltravoxSession = async () => {
    try {
      console.log("Initializing Ultravox session...");
      setIsLoading(true);
      
      const requestBody = {
        system_prompt: "You are a helpful AI assistant talking to a user through a web UI. Be concise and friendly in your responses.",
        temperature: 0.7,
        user_speaks_first: true,
        voice: "Mark"  // Including voice parameter explicitly
      };
      
      console.log("Request payload:", JSON.stringify(requestBody, null, 2));
      
      const response = await fetch(`${BACKEND_URL}/api/create-call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      console.log("Response status:", response.status);
      
      if (!response.ok) {
        throw new Error(`Failed to create session: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.session_id) {
        throw new Error("Invalid response format from server - missing session_id");
      }
      
      setSessionId(data.session_id);
      console.log("Session created successfully with ID:", data.session_id);
      
      // Connect to the WebSocket with the new session ID
      connectWebSocket(data.session_id);
      
    } catch (error) {
      console.error("Error initializing Ultravox session:", error);
      setError(error instanceof Error ? error.message : "Failed to initialize voice session");
    } finally {
      setIsLoading(false);
    }
  };

  // Connect to the WebSocket backend
  const connectWebSocket = (sessionId: string) => {
    console.log(`Connecting to WebSocket for session ${sessionId}...`);
    
    // Close existing connection if any
    if (websocketRef.current) {
      console.log("Closing existing WebSocket connection");
      websocketRef.current.close();
    }
    
    const wsUrl = `${WS_URL}/ws/${sessionId}`;
    console.log(`WebSocket URL: ${wsUrl}`);
    
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer"; // Important for binary audio data
    
    ws.onopen = () => {
      console.log(`WebSocket connection successfully established for session ${sessionId}`);
      setIsConnected(true);
      setError(null);
      (ws as any).paused = false; // Add a property to track if we're pausing audio
    };
    
    ws.onmessage = async (event) => {
      // Handle binary data (audio)
      if (event.data instanceof ArrayBuffer) {
        console.log(`Received audio chunk: ${event.data.byteLength} bytes`);
        try {
          // Clone the buffer before pushing to queue to prevent issues
          const clonedBuffer = event.data.slice(0);
          audioQueueRef.current.push(clonedBuffer);
          
          // Update UI state
          if (sessionState !== "speaking") {
            setSessionState("speaking");
          }
        } catch (error) {
          console.error("Error processing audio data:", error);
        }
      } 
      // Handle JSON messages
      else {
        try {
          const message = JSON.parse(event.data);
          console.log("Received WebSocket message:", message);
          
          switch (message.type) {
            case "connection":
              console.log("Connection status:", message.status);
              setIsConnected(message.status === "connected");
              if (message.state) {
                setSessionState(message.state);
              }
              break;
              
            case "state":
              console.log("State changed:", message.state);
              setSessionState(message.state);
              break;
              
            case "transcript":
              console.log("Transcript update:", message.text, "final:", message.final);
              setTranscript(message.text);
              if (message.final) {
                setFinalTranscript(prev => prev + "\n" + message.text);
              }
              break;
              
            case "clear_buffer":
              console.log("Received clear buffer command");
              // Clear audio buffer
              audioQueueRef.current = [];
              isPlayingRef.current = false;
              break;
              
            case "error":
              console.error("Error from server:", message.message);
              setError(message.message);
              break;
              
            default:
              // For other messages, we just log them
              console.log("Other message type:", message.type);
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error, "Raw message:", event.data);
        }
      }
    };
    
    ws.onclose = (event) => {
      console.log("WebSocket connection closed:", event.code, event.reason);
      setIsConnected(false);
      setSessionState("idle");
    };
    
    // In the connectWebSocket function
ws.onerror = (error) => {
  console.error("WebSocket error:", error);
  console.error("WebSocket URL:", wsUrl);
  console.error("WebSocket readyState:", ws.readyState);
  setError("WebSocket connection error");
  setIsConnected(false);
};
    
    websocketRef.current = ws;
  };
  
  // End the current session
  const endSession = async () => {
    try {
      if (sessionId) {
        // Stop the mic first
        if (isListening) {
          stopMicrophone();
        }
        
        // Close the WebSocket
        if (websocketRef.current) {
          websocketRef.current.close();
          websocketRef.current = null;
        }
        
        // Call API to end the session
        await fetch(`${BACKEND_URL}/api/session/${sessionId}`, {
          method: 'DELETE'
        });
        
        // Reset state
        setSessionId(null);
        setIsConnected(false);
        setSessionState("idle");
        setTranscript("");
        setFinalTranscript("");
        setError(null);
      }
    } catch (error) {
      console.error("Error ending session:", error);
      setError(error instanceof Error ? error.message : "Failed to end session");
    }
  };

  const baseSize = 120; 
  const maxExpansion = 80; 
  const currentSize = baseSize + (audioLevel * maxExpansion);

  const getIndicatorColor = () => {
    // If connected to Ultravox and speaking or listening
    if (isConnected && (sessionState === "speaking" || sessionState === "thinking")) {
      return "bg-blue-500";
    }
    return audioTracks[selectedTrack].color;
  };

  const getBoxShadowColor = (trackId: TrackId, opacity = 0.4) => {
    // If connected to Ultravox and speaking or listening
    if (isConnected && (sessionState === "speaking" || sessionState === "thinking")) {
      return `rgba(59, 130, 246, ${opacity})`; // blue shadow
    }
    
    const opacityValue = opacity.toFixed(2);
    switch (trackId) {
      case 'gardens':
        return `rgba(16, 185, 129, ${opacityValue})`;
      case 'kugelsicher':
        return `rgba(139, 92, 246, ${opacityValue})`; 
      case 'spinningHead':
        return `rgba(245, 158, 11, ${opacityValue})`; 
      default:
        return `rgba(129, 140, 248, ${opacityValue})`; 
    }
  };

  const getGlowIntensity = () => {
    return 0.2 + (audioLevel * 0.8);
  };

  // Display status text based on session state
  const getStatusText = () => {
    if (!isConnected) return "Not connected";
    
    switch(sessionState) {
      case "speaking": return "AI is speaking";
      case "thinking": return "AI is thinking";
      case "listening": return "AI is listening";
      default: 
        if (isListening) return "Microphone active";
        if (isPlaying) return `Playing ${audioTracks[selectedTrack].name}`;
        return "Waiting for input";
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Music size={24} className="text-emerald-500" />
            Creek
          </CardTitle>
          <div className="flex items-center gap-3">
            <Badge variant="outline">Audio Visualizer</Badge>
            <ThemeToggle />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-6">
          {/* Track Selection */}
          <div className="w-full grid grid-cols-3 gap-2">
            {(Object.entries(audioTracks) as [TrackId, typeof audioTracks[TrackId]][]).map(([id, track]) => (
              <Button
                key={id}
                onClick={() => selectTrack(id)}
                variant={selectedTrack === id ? "default" : "outline"}
                className={selectedTrack === id ? track.color : ""}
                disabled={isConnected} // Disable track selection when connected to Ultravox
              >
                {track.name}
              </Button>
            ))}
          </div>
          
          {/* Indicator Circle */}
          <div className="relative h-72 w-72 flex items-center justify-center">
            {/* Outer reference circle */}
            <div className="absolute w-48 h-48 rounded-full border border-muted" />
            
            {/* Active indicator with motion */}
            <motion.div 
              className={`rounded-full ${getIndicatorColor()} flex items-center justify-center`}
              animate={{ 
                width: `${currentSize}px`,
                height: `${currentSize}px`,
                opacity: audioSource || sessionState === "speaking" ? 0.85 : 0.5,
                boxShadow: audioSource || sessionState === "speaking" ? 
                  `0 0 ${30 + (audioLevel * 20)}px ${getBoxShadowColor(selectedTrack, getGlowIntensity())}` : 'none'
              }}
              transition={{ duration: 0.1 }}
            >
              {isLoading ? (
                <Loader2 size={28} className="text-white animate-spin" />
              ) : audioSource || sessionState === "speaking" ? (
                <div className="text-white">
                  {sessionState === "speaking" ? (
                    <Volume2 size={28} />
                  ) : audioSource === 'microphone' ? (
                    <Mic size={28} />
                  ) : (
                    <Volume2 size={28} />
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
          
          {/* Transcript Display (only show when connected) */}
          {isConnected && (
            <div className="w-full bg-muted/30 p-3 rounded-md max-h-24 overflow-y-auto">
              <p className="text-sm font-medium mb-1">Transcript:</p>
              <p className="text-sm">
                {transcript || "Waiting for conversation..."}
              </p>
            </div>
          )}
          
          {/* Connection Status Indicator */}
          {sessionId && (
            <div className="w-full text-center">
              <Badge variant={isConnected ? "default" : "destructive"}>
                {isConnected ? "Connected" : "Disconnected"}
              </Badge>
            </div>
          )}
          
          {/* Control Buttons */}
          <div className="flex w-full gap-3">
            <Button 
              onClick={handleMicToggle}
              variant={isListening ? "destructive" : "outline"}
              className="flex-1"
              disabled={isLoading}
            >
              {isListening ? (
                <>
                  <X className="mr-2" size={18} />
                  Stop Mic
                </>
              ) : (
                <>
                  <Mic className="mr-2" size={18} />
                  Start Mic
                </>
              )}
            </Button>
            
            {!isConnected ? (
              <Button 
                onClick={handlePlayToggle}
                variant={isPlaying ? "destructive" : "default"}
                className={isPlaying ? "" : getIndicatorColor()}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 animate-spin" size={18} />
                    Loading...
                  </>
                ) : isPlaying ? (
                  <>
                    <X className="mr-2" size={18} />
                    Stop Audio
                  </>
                ) : (
                  <>
                    <Play className="mr-2" size={18} />
                    Play {audioTracks[selectedTrack].name}
                  </>
                )}
              </Button>
            ) : (
              <Button 
                onClick={endSession}
                variant="destructive"
                className="flex-1"
                disabled={isLoading}
              >
                <X className="mr-2" size={18} />
                End Session
              </Button>
            )}
          </div>
          
          {/* Status indicator */}
          <div className="w-full p-3 bg-muted/50 rounded-md flex items-center justify-between text-sm">
            <div className="flex items-center">
              {(audioSource || isConnected) ? (
                <>
                  <motion.span 
                    className={`inline-block w-2 h-2 rounded-full ${
                      isConnected ? "bg-blue-500" : "bg-emerald-500"
                    } mr-2`}
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                  <span>
                    {getStatusText()}
                  </span>
                </>
              ) : (
                <>
                  <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground mr-2"></span>
                  <span className="text-muted-foreground">Waiting for input</span>
                </>
              )}
            </div>
            
            {(audioSource || sessionState === "speaking") && (
              <Badge variant="outline" className="font-mono">
                {Math.round(audioLevel * 100)}%
              </Badge>
            )}
          </div>
          
          {/* Error display */}
          {error && (
            <div className="w-full p-3 bg-red-500/10 border border-red-500/30 rounded-md">
              <p className="text-red-500 text-sm">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>
      
      <div className="mt-4 text-xs text-muted-foreground">
        Creek © 2025
      </div>
    </div>
  );
}