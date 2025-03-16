/* eslint-disable @typescript-eslint/no-unused-vars */
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Loader2 } from 'lucide-react';

interface VoiceTabsProps {
  voices: Array<{
    id: string;
    name: string;
    description: string;
    color: string;
    icon: React.ReactNode;
  }>;
  selectedVoiceId: string;
  onSelectVoice: (voiceId: string) => void;
  disabled?: boolean;
  loading?: boolean;
}

export function VoiceTabs({ 
  voices = [], 
  selectedVoiceId, 
  onSelectVoice,
  disabled = false,
  loading = false
}: VoiceTabsProps) {
  // Filter for the specific voices we want to display
  // This will use the actual voices from the API
  const getDisplayVoices = () => {
    // Look for specific voices by name pattern
    const markVoice = voices.find(v => v.name?.toLowerCase().includes('mark')) || { 
      id: 'Mark', 
      name: 'Mark-Slow', 
      icon: <Bot className="h-5 w-5" />,
      description: 'Mark voice' 
    };
    
    const muyiwaVoice = voices.find(v => v.name?.toLowerCase().includes('muyiwa')) || { 
      id: 'Muyiwa', 
      name: 'Muyiwa-English', 
      icon: <Bot className="h-5 w-5" />,
      description: 'Muyiwa voice' 
    };
    
    const elihizVoice = voices.find(v => v.name?.toLowerCase().includes('elihiz') || v.name?.toLowerCase().includes('emily')) || { 
      id: 'Elihiz', 
      name: 'Elihiz-English', 
      icon: <Bot className="h-5 w-5" />,
      description: 'Elihiz voice' 
    };
    
    return [
      {
        id: markVoice.id || 'Mark',
        name: 'Mark-Slow',
        icon: <Bot className="h-5 w-5" />,
        voiceId: markVoice.id
      },
      {
        id: muyiwaVoice.id || 'Muyiwa',
        name: 'Muyiwa-English',
        icon: <Bot className="h-5 w-5" />,
        voiceId: muyiwaVoice.id
      },
      {
        id: elihizVoice.id || 'Elihiz',
        name: 'Elihiz-English',
        icon: <Bot className="h-5 w-5" />,
        voiceId: elihizVoice.id
      }
    ];
  };
  
  const displayVoices = getDisplayVoices();
  
  return (
    <div className="flex w-full justify-center gap-2 mb-4">
      {displayVoices.map((voice) => (
        <button
          key={voice.id}
          onClick={() => onSelectVoice(voice.voiceId || voice.id)}
          disabled={disabled}
          className={`relative flex flex-col items-center justify-center rounded-lg p-3 transition-all ${
            selectedVoiceId === (voice.voiceId || voice.id)
              ? `bg-red-600 text-white` 
              : 'bg-gray-900 text-gray-300 hover:bg-gray-800'
          } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
          style={{ minWidth: '100px' }}
        >
          <div className="flex justify-center mb-1 relative">
            {voice.icon}
          </div>
          <div className="text-sm font-medium">{voice.name}</div>
        </button>
      ))}
    </div>
  );
}