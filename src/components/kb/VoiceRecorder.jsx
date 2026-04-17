import { useState, useRef, useCallback, useEffect } from 'react';

export default function VoiceRecorder({ onTranscript, language = 'en' }) {
  const [recording, setRecording] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(!!SR);
    return () => {
      recognitionRef.current?.stop?.();
    };
  }, []);

  const toggle = useCallback(() => {
    if (recording) {
      recognitionRef.current?.stop?.();
      setRecording(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language === 'he' ? 'he-IL' : 'en-US';

    recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) onTranscript(finalTranscript);
    };
    recognition.onerror = () => setRecording(false);
    recognition.onend = () => setRecording(false);

    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  }, [recording, onTranscript, language]);

  if (!supported) {
    return (
      <button
        type="button"
        disabled
        title="Speech recognition not supported in this browser"
        className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/20 cursor-not-allowed"
      >
        <MicIcon />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={recording ? 'Stop recording' : 'Start voice recording'}
      className={`relative w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
        recording
          ? 'bg-[#ef4444]/15 border border-[#ef4444]/40 text-[#ef4444]'
          : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 hover:text-white/80'
      }`}
    >
      {recording ? <MicOffIcon /> : <MicIcon />}
      {recording && (
        <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-[#ef4444] animate-pulse" />
      )}
    </button>
  );
}

function MicIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M3 3l18 18" />
    </svg>
  );
}
