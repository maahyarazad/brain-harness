import { useCallback, useMemo, useRef, useState } from "react";
import Header from "./components/Header.jsx";
import ExchangeList from "./components/ExchangeList.jsx";
import Composer from "./components/Composer.jsx";
import CapabilityPanel from "./components/CapabilityPanel.jsx";
import { useConversation } from "./hooks/useConversation.js";
import { useServerStatus } from "./hooks/useServerStatus.js";
import { useSpeechInput } from "./hooks/useSpeechInput.js";
import { useSpeechOutput } from "./hooks/useSpeechOutput.js";

export default function App() {
  const [draft, setDraft] = useState("");
  const [source, setSource] = useState("text"); // "voice" while the draft came from the mic
  const [readAloud, setReadAloud] = useState(false);
  const { online } = useServerStatus();

  const speechOutput = useSpeechOutput();
  const readAloudRef = useRef(readAloud);
  readAloudRef.current = readAloud;
  const handleAnswer = useCallback(
    (text) => {
      if (readAloudRef.current) speechOutput.speak(text);
    },
    [speechOutput.speak]
  );

  const conversation = useConversation({ onAnswer: handleAnswer });

  const onTranscript = useCallback((text) => {
    setDraft(text);
    setSource("voice");
  }, []);
  const speechInput = useSpeechInput({ onTranscript });

  // Typing changes `draft` on every keystroke, so everything that does not show the draft must keep its
  // identity here: the header, the tools panel and the whole conversation then skip the redraw.
  const handleDraftChange = useCallback((text) => {
    setDraft(text);
    setSource("text");
  }, []);

  const { stop: stopListening, start: startListening, listening } = speechInput;
  const { stop: stopSpeaking } = speechOutput;
  const { sendPrompt, clear: clearConversation, pending, isFull } = conversation;

  const handleSend = useCallback(() => {
    if (!draft.trim() || pending || isFull) return;
    stopListening();
    sendPrompt(draft, source);
    setDraft("");
    setSource("text");
  }, [draft, source, pending, isFull, stopListening, sendPrompt]);

  const toggleMic = useCallback(() => {
    if (listening) {
      stopListening();
    } else {
      stopSpeaking(); // don't let Claude talk over the tester
      startListening();
    }
  }, [listening, stopListening, startListening, stopSpeaking]);

  const handleClear = useCallback(() => {
    stopSpeaking();
    clearConversation();
  }, [stopSpeaking, clearConversation]);

  const handleReadAloud = useCallback(
    (e) => {
      setReadAloud(e.target.checked);
      if (!e.target.checked) stopSpeaking();
    },
    [stopSpeaking]
  );

  const micButton = useMemo(
    () => (
      <button
        type="button"
        className="btn mic"
        onClick={toggleMic}
        disabled={!speechInput.supported}
        aria-pressed={speechInput.listening}
        aria-label={speechInput.listening ? "Stop listening" : "Speak a prompt"}
        title={
          speechInput.supported
            ? "Speak a prompt"
            : "Voice input isn't supported in this browser. Try Chrome or Edge."
        }
      >
        🎤
      </button>
    ),
    [toggleMic, speechInput.supported, speechInput.listening]
  );

  const meta = useMemo(
    () => (
      <>
        {!speechInput.supported && (
          <span>Voice input isn't supported in this browser. Try Chrome or Edge.</span>
        )}
        {speechInput.listening && <span>Listening…</span>}
        {speechInput.error && !speechInput.listening && <span>{speechInput.error}</span>}
        {speechOutput.supported && (
          <label>
            <input type="checkbox" checked={readAloud} onChange={handleReadAloud} />
            Read answers aloud
          </label>
        )}
        {speechOutput.speaking && (
          <button type="button" className="btn" onClick={stopSpeaking}>
            Stop
          </button>
        )}
      </>
    ),
    [speechInput.supported, speechInput.listening, speechInput.error, speechOutput.supported, speechOutput.speaking, readAloud, handleReadAloud, stopSpeaking]
  );

  return (
    <div className="app">
      <Header online={online} canClear={conversation.exchanges.length > 0} onClear={handleClear} />
      <CapabilityPanel onRun={conversation.runCapability} disabled={pending} />
      <ExchangeList exchanges={conversation.exchanges} />
      <Composer
        value={draft}
        onChange={handleDraftChange}
        onSend={handleSend}
        pending={pending}
        isFull={isFull}
        leftSlot={micButton}
        meta={meta}
      />
    </div>
  );
}
