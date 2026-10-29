import { useCallback, useRef, useState } from "react";
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

  const speechInput = useSpeechInput({
    onTranscript: (text) => {
      setDraft(text);
      setSource("voice");
    },
  });

  function handleDraftChange(text) {
    setDraft(text);
    setSource("text");
  }

  function handleSend() {
    if (!draft.trim() || conversation.pending || conversation.isFull) return;
    speechInput.stop();
    conversation.sendPrompt(draft, source);
    setDraft("");
    setSource("text");
  }

  function toggleMic() {
    if (speechInput.listening) {
      speechInput.stop();
    } else {
      speechOutput.stop(); // don't let Claude talk over the tester
      speechInput.start();
    }
  }

  const micButton = (
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
  );

  const meta = (
    <>
      {!speechInput.supported && (
        <span>Voice input isn't supported in this browser. Try Chrome or Edge.</span>
      )}
      {speechInput.listening && <span>Listening…</span>}
      {speechInput.error && !speechInput.listening && <span>{speechInput.error}</span>}
      {speechOutput.supported && (
        <label>
          <input
            type="checkbox"
            checked={readAloud}
            onChange={(e) => {
              setReadAloud(e.target.checked);
              if (!e.target.checked) speechOutput.stop();
            }}
          />
          Read answers aloud
        </label>
      )}
      {speechOutput.speaking && (
        <button type="button" className="btn" onClick={speechOutput.stop}>
          Stop
        </button>
      )}
    </>
  );

  return (
    <div className="app">
      <Header
        online={online}
        canClear={conversation.exchanges.length > 0}
        onClear={() => {
          speechOutput.stop();
          conversation.clear();
        }}
      />
      <CapabilityPanel onRun={conversation.runCapability} disabled={conversation.pending} />
      <ExchangeList exchanges={conversation.exchanges} />
      <Composer
        value={draft}
        onChange={handleDraftChange}
        onSend={handleSend}
        pending={conversation.pending}
        isFull={conversation.isFull}
        leftSlot={micButton}
        meta={meta}
      />
    </div>
  );
}
