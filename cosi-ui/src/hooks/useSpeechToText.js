import { useState, useRef, useCallback, useEffect } from "react";

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

/**
 * useSpeechToText — wraps the Web Speech API.
 *
 * @param {function} onTranscript  Called with (text, isFinal) as words arrive.
 *                                 Use to append/replace text in the input field.
 */
export function useSpeechToText(onTranscript) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const isSupported = Boolean(SpeechRecognition);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    if (!isSupported) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }
    setError(null);

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    // Track the last interim text so we can replace it with the final result.
    let interimText = "";

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      if (final) {
        // Replace any pending interim text with the confirmed final text.
        onTranscriptRef.current(interimText, final);
        interimText = "";
      } else {
        onTranscriptRef.current(interimText, null, interim);
        interimText = interim;
      }
    };

    recognition.onerror = (event) => {
      const msg =
        event.error === "not-allowed"
          ? "Microphone access denied. Allow microphone permission and try again."
          : `Speech recognition error: ${event.error}`;
      setError(msg);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      interimText = "";
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isSupported]);

  // Clean up if the component unmounts while listening.
  useEffect(() => {
    return () => recognitionRef.current?.abort();
  }, []);

  return { isListening, isSupported, error, start, stop };
}
