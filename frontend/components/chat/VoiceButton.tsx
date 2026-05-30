'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';

/* Minimal typings for the Web Speech API (not in standard TS lib). */
interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SRConstructor = new () => SpeechRecognitionLike;

function getSR(): SRConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/**
 * ChatGPT-style dictation button. Uses the browser's built-in Web Speech
 * API (no server / API key). While listening, partial text is streamed into
 * the composer live via `onText`; final phrases are committed. Click again
 * (or it auto-stops on silence) to finish.
 *
 * `baseTextRef` lets us append dictation onto whatever was already typed
 * without re-reading stale props inside the recognition callbacks.
 */
export function VoiceButton({
  lang,
  disabled,
  getBaseText,
  onText,
}: {
  lang: 'en' | 'ar';
  disabled?: boolean;
  getBaseText: () => string;
  onText: (text: string) => void;
}) {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const baseRef = useRef('');

  useEffect(() => {
    setSupported(!!getSR());
    return () => { recRef.current?.abort?.(); };
  }, []);

  const stop = useCallback(() => {
    recRef.current?.stop?.();
  }, []);

  const start = useCallback(() => {
    const SR = getSR();
    if (!SR) {
      toast.error('Voice input not supported in this browser', {
        description: 'Try Chrome or Edge for dictation.',
      });
      return;
    }
    const rec = new SR();
    rec.lang = lang === 'ar' ? 'ar-SA' : 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    // Snapshot whatever's already in the composer so we append, not replace.
    baseRef.current = getBaseText();

    rec.onresult = (e) => {
      let interim = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (final) {
        baseRef.current = (baseRef.current + final).replace(/\s+$/, '') + ' ';
      }
      const combined = (baseRef.current + interim).replace(/\s+/g, ' ').trimStart();
      onText(combined);
    };
    rec.onerror = (ev) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        toast.error('Microphone blocked', { description: 'Allow mic access in your browser settings.' });
      } else if (ev.error !== 'aborted' && ev.error !== 'no-speech') {
        toast.error('Voice error', { description: ev.error });
      }
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
    };

    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      // start() throws if already running — ignore.
    }
  }, [lang, getBaseText, onText]);

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={listening ? stop : start}
      disabled={disabled}
      aria-label={listening ? 'Stop dictation' : 'Dictate'}
      title={listening ? 'Stop' : 'Dictate'}
      className={cn(
        'relative grid h-9 w-9 place-items-center rounded-full transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        listening
          ? 'bg-destructive/10 text-destructive'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        disabled && 'opacity-40',
      )}
    >
      {listening && (
        <span className="absolute inset-0 animate-ping rounded-full bg-destructive/20" />
      )}
      {listening
        ? <Square className="relative h-3.5 w-3.5 fill-current" />
        : <Mic className="relative h-[18px] w-[18px]" />}
    </button>
  );
}
