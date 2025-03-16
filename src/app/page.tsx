/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useState, useEffect, useRef } from 'react';
import { Play, Mic, X, Volume2, Loader2, Music, Info } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/toggle';
import { UltravoxSession, UltravoxSessionStatus, Medium } from 'ultravox-client';

type TrackId = 'gardens' | 'kugelsicher' | 'spinningHead';
type AudioSourceType = 'microphone' | 'playback' | null;

export default function AudioVisualizer() {
  const [isListening, setIsListening] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioSource, setAudioSource] = useState<AudioSourceType>(null);
  const [selectedTrack, setSelectedTrack] = useState<TrackId>('gardens');
  const [isLoading, setIsLoading] = useState(false);
  
  // Ultravox state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<string>("idle");
  const [isConnected, setIsConnected] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  
  // Refs
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const prevLevelRef = useRef<number>(0);
  const uvSessionRef = useRef<UltravoxSession | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const SAMPLE_RATE = 16000; // Match with Ultravox requirements
  
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

  // Create Ultravox session
  const createUltravoxSession = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/create-ultravox-call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          systemPrompt: "You are a helpful AI assistant talking to a user. Keep your responses short, friendly and helpful.",
          voice: "Mark",
          temperature: 0.7
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to create Ultravox call: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.joinUrl) {
        throw new Error("Invalid response: missing joinUrl");
      }
      
      setJoinUrl(data.joinUrl);
      setSessionId(data.callId);
      
      return data.joinUrl;
    } catch (error) {
      console.error("Error creating Ultravox call:", error);
      setError(error instanceof Error ? error.message : "Failed to create Ultravox call");
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
        
        // Update audio source when agent is speaking
        if (session.status === UltravoxSessionStatus.SPEAKING) {
          setAudioSource('playback');
          analyzeAudio();
        } else if (session.status === UltravoxSessionStatus.DISCONNECTED) {
          setAudioSource(null);
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
            
            // Update current transcript
            setTranscript(latestTranscript.text);
            
            // When final, move to finalTranscript
            if (latestTranscript.isFinal) {
              setFinalTranscript(prev => {
                return prev ? `${prev}\n${latestTranscript.text}` : latestTranscript.text;
              });
              setTranscript("");
            }
          }
          
          // Find the most recent user transcript
          const userTranscripts = transcripts.filter(t => t.speaker === 'user');
          if (userTranscripts.length > 0) {
            const latestUserTranscript = userTranscripts[userTranscripts.length - 1];
            if (latestUserTranscript.isFinal) {
              setFinalTranscript(prev => {
                return prev ? `${prev}\nYou: ${latestUserTranscript.text}` : `You: ${latestUserTranscript.text}`;
              });
            }
          }
        }
      });
      
      // Set up debug message listener
      session.addEventListener('experimental_message', (event) => {
        console.log('Experimental message:', (event as any).message);
      });
      
      // Set up data message listener 
      session.addEventListener('data_message', (event) => {
        console.log('Data message:', (event as any).message);
      });

      // Store the session
      uvSessionRef.current = session;
      
      // Join the call
      session.joinCall(url);
      
      return true;
    } catch (error) {
      console.error("Error initializing Ultravox session:", error);
      setError(error instanceof Error ? error.message : "Failed to initialize Ultravox session");
      return false;
    }
  };

  const startMicrophone = async () => {
    try {
      // If playing sample audio, stop it
      if (isPlaying) {
        stopAudio();
      }
      
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
      setAudioSource('microphone');
      
      analyzeAudio();
    } catch (error) {
      console.error("Error accessing microphone:", error);
      setError(error instanceof Error ? error.message : "Failed to access microphone");
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
      setFinalTranscript("");
      setError(null);
      setAudioSource(null);
      setAudioLevel(0);
      
    } catch (error) {
      console.error("Error ending session:", error);
      setError(error instanceof Error ? error.message : "Failed to end session");
    }
  };

  const sendTextMessage = (text: string) => {
    if (uvSessionRef.current && isConnected) {
      uvSessionRef.current.sendText(text);
    }
  };

  const setOutputToText = () => {
    if (uvSessionRef.current && isConnected) {
      uvSessionRef.current.setOutputMedium(Medium.TEXT);
    }
  };

  const setOutputToVoice = () => {
    if (uvSessionRef.current && isConnected) {
      uvSessionRef.current.setOutputMedium(Medium.VOICE);
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
        return "Ready";
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
          
          {/* Transcript Display */}
          <div className="w-full bg-muted/30 p-3 rounded-md max-h-28 overflow-y-auto">
            {finalTranscript && (
              <div className="text-sm mb-2">
                {finalTranscript.split('\n').map((line, i) => (
                  <p key={i} className="mb-1">
                    {line.startsWith('You:') ? (
                      <span className="text-blue-500 font-medium">{line}</span>
                    ) : (
                      <span>{line}</span>
                    )}
                  </p>
                ))}
              </div>
            )}
            {transcript && (
              <div className="text-sm">
                <motion.p
                  initial={{ opacity: 0.5 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                  className="text-blue-600 dark:text-blue-400"
                >
                  {transcript}
                </motion.p>
              </div>
            )}
            {!transcript && !finalTranscript && (
              <p className="text-sm text-muted-foreground">
                {isConnected 
                  ? "Start speaking to begin a conversation..." 
                  : "Connect to start a conversation"}
              </p>
            )}
          </div>
          
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
              {isListening ? <X size={18} className="mr-2" /> : <Mic size={18} className="mr-2" />}
              {isListening ? "Stop Mic" : "Mic"}
            </Button>
            
            {!isConnected ? (
              <Button 
                onClick={handlePlayToggle} 
                variant={isPlaying ? "destructive" : "default"}
                className={`flex-1 ${isPlaying ? "" : audioTracks[selectedTrack].color}`}
                disabled={isConnected || isLoading}
              >
                {isPlaying ? <X size={18} className="mr-2" /> : <Play size={18} className="mr-2" />}
                {isPlaying ? "Stop" : "Play"}
              </Button>
            ) : null}
            
            {!isConnected ? (
              <Button 
                onClick={initializeUltravoxSession} 
                variant="outline"
                className="flex-1"
                disabled={isLoading}
              >
                <Info size={18} className="mr-2" />
                Connect AI
              </Button>
            ) : (
              <Button 
                onClick={endSession} 
                variant="outline"
                className="flex-1"
                disabled={isLoading}
              >
                <X size={18} className="mr-2" />
                Disconnect
              </Button>
            )}
          </div>
          
          {/* Output Mode Controls (when connected) */}
          {isConnected && (
            <div className="flex w-full gap-3">
              <Button 
                onClick={setOutputToVoice}
                variant="outline"
                className="flex-1"
                disabled={isLoading}
              >
                <Volume2 size={18} className="mr-2" />
                Voice Mode
              </Button>
              <Button 
                onClick={setOutputToText}
                variant="outline"
                className="flex-1"
                disabled={isLoading}
              >
                <Info size={18} className="mr-2" />
                Text Mode
              </Button>
            </div>
          )}
          
          {/* Status Text */}
          <div className="w-full text-center text-sm text-muted-foreground">
            {getStatusText()}
          </div>
          
          {/* Error Display */}
          {error && (
            <div className="w-full p-3 bg-red-500/20 text-red-600 dark:text-red-400 rounded-md">
              <p className="text-sm">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Audio elements for sample playback */}
      <audio ref={audioRef} className="hidden" />
    </div>
  );
} 