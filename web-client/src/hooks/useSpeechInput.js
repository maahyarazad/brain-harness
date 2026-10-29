import { useCallback, useEffect, useRef, useState } from "react";

function getRecognitionClass() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

const MESSAGES = {
  "not-allowed": "Microphone permission denied. You can still type.",
  "service-not-allowed": "Microphone permission denied. You can still type.",
  "no-speech": "Didn't catch that. Try again.",
  "audio-capture": "No microphone found.",
  network: "Speech recognition needs an internet connection in this browser.",
};

/**
 * Speech-to-text with the browser's built-in Web Speech API.
 * Calls `onTranscript(text)` as words are recognised; never sends anything.
 */
export function useSpeechInput({ onTranscript }) {
  const Recognition = getRecognitionClass();
  const supported = Boolean(Recognition);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState(null);
  const recognizerRef = useRef(null);
  const heardRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const start = useCallback(() => {
    if (!Recognition || recognizerRef.current) return;
    const recognizer = new Recognition();
    recognizer.lang = navigator.language || "en-US";
    recognizer.interimResults = true;
    recognizer.continuous = false;
    heardRef.current = false;

    recognizer.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join("");
      if (transcript.trim()) heardRef.current = true;
      onTranscriptRef.current(transcript);
    };
    recognizer.onerror = (event) => {
      setError(MESSAGES[event.error] ?? "Voice input stopped unexpectedly.");
      if (event.error === "no-speech") heardRef.current = true; // message already set
    };
    recognizer.onend = () => {
      recognizerRef.current = null;
      setListening(false);
      if (!heardRef.current) setError((current) => current ?? MESSAGES["no-speech"]);
    };

    setError(null);
    recognizerRef.current = recognizer;
    setListening(true);
    recognizer.start();
  }, [Recognition]);

  const stop = useCallback(() => {
    recognizerRef.current?.stop();
  }, []);

  // Stop listening if the component unmounts
  useEffect(() => () => recognizerRef.current?.abort?.(), []);

  return { supported, listening, error, start, stop };
}
