import React from "react";

const MIC_SVG = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93V21h2v-2.07A7 7 0 0 0 19 12h-2z" />
  </svg>
);

/**
 * MicButton — icon button that toggles speech recognition.
 * Shows a red pulsing ring while listening.
 */
export function MicButton({ isListening, disabled, onStart, onStop }) {
  const handleClick = () => {
    if (isListening) {
      onStop();
    } else {
      onStart();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label={isListening ? "Stop dictation" : "Start dictation"}
      title={isListening ? "Stop dictation" : "Dictate message"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        padding: 0,
        border: "none",
        borderRadius: "50%",
        cursor: disabled ? "not-allowed" : "pointer",
        background: isListening ? "#c0392b" : "transparent",
        color: isListening ? "#fff" : "var(--color-text-body-secondary, #8d9dab)",
        outline: isListening ? "2px solid rgba(192,57,43,0.4)" : "none",
        transition: "background 0.2s, color 0.2s, outline 0.2s",
        animation: isListening ? "mic-pulse 1.4s ease-in-out infinite" : "none",
        flexShrink: 0,
      }}
    >
      {MIC_SVG}
      <style>{`
        @keyframes mic-pulse {
          0%, 100% { outline-width: 2px; outline-color: rgba(192,57,43,0.4); }
          50%       { outline-width: 5px; outline-color: rgba(192,57,43,0.15); }
        }
      `}</style>
    </button>
  );
}
