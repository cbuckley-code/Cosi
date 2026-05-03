import React from "react";
import Button from "@cloudscape-design/components/button";

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

export function MicButton({ isListening, disabled, onStart, onStop }) {
  return (
    <span
      className={isListening ? "mic-listening" : undefined}
      style={{ display: "inline-flex", flexShrink: 0 }}
    >
      <Button
        variant="icon"
        iconSvg={MIC_SVG}
        onClick={isListening ? onStop : onStart}
        disabled={disabled}
        ariaLabel={isListening ? "Stop dictation" : "Start dictation"}
      />
    </span>
  );
}
