import { isJarvisStopCommand } from "../lib/jarvisControls";
import { configureJarvisVoice } from "../lib/jarvisVoice";
import { useEffect, useRef, useState } from "react";
type Recognition = {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((e: { resultIndex?: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onspeechstart: (() => void) | null; onspeechend: (() => void) | null;
  onstart: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
  start(): void; abort(): void;
};
export function useJarvisSpeech(onCommand: (text: string) => void, onStop: (clear: boolean, phrase?: string) => void, normalizeTranscript: (text: string) => string = text => text, immediateCommand: (text: string) => boolean = () => false) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [error, setError] = useState("");
  const wanted = useRef(false), active = useRef(true), speakingNow = useRef(false);
  const lastReply = useRef("");
  const replyEchoUntil = useRef(0);
  const protectedNarration = useRef(false);
  const speechDelay = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechWatchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voicesReady = useRef<(() => void) | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restart = useRef<ReturnType<typeof setTimeout> | null>(null);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const epoch = useRef(0);
  const recovery = useRef({ startedAt: 0, attempts: 0 });
  const consumeSpeech = useRef<() => void>(() => {});
  const callbacks = useRef({ onCommand, onStop, normalizeTranscript, immediateCommand }); callbacks.current = { onCommand, onStop, normalizeTranscript, immediateCommand };
  function clearTimer() { if (timer.current) clearTimeout(timer.current); timer.current = null; }
  function silence() {
    if(speechWatchdog.current) { clearTimeout(speechWatchdog.current); speechWatchdog.current=null; }
    protectedNarration.current = false;
    if (speechDelay.current) { clearTimeout(speechDelay.current); speechDelay.current = null; }
    if (voicesReady.current && "speechSynthesis" in window) { window.speechSynthesis.removeEventListener("voiceschanged", voicesReady.current); voicesReady.current = null; }
    if (speakingNow.current) replyEchoUntil.current = Date.now() + 1800;
    speakingNow.current = false; setSpeaking(false);
    if ("speechSynthesis" in window) { utterance.current = null; window.speechSynthesis.cancel(); }
  }
  function say(message: string, protectOpening = false, onComplete?: () => void) {
    silence(); setText("");
    if (!("speechSynthesis" in window)) { onComplete?.(); return; }
    // Keep the microphone session alive during replies; repeated abort/start cycles lose speech.
    if (wanted.current && !recognition.current) startListening();
    try {
      const u = new SpeechSynthesisUtterance(message);
      configureJarvisVoice(u);
      lastReply.current = message.toLowerCase(); replyEchoUntil.current = Number.POSITIVE_INFINITY;
      utterance.current = u; protectedNarration.current = protectOpening; speakingNow.current = true; setSpeaking(true);
      const finish = () => {
        if(utterance.current!==u) return;
        if(speechWatchdog.current) { clearTimeout(speechWatchdog.current); speechWatchdog.current=null; }
        utterance.current=null; replyEchoUntil.current=Date.now()+1800;
        protectedNarration.current=false; speakingNow.current=false;
        if(active.current) { setSpeaking(false); onComplete?.(); if(wanted.current) startListening(); }
      };
      u.onend=u.onerror=finish;
      // Some browser speech engines never deliver end/error. Bound the reply
      // so a stalled utterance cannot suppress microphone commands indefinitely.
      speechWatchdog.current=setTimeout(()=>{
        if(utterance.current!==u) return;
        finish(); window.speechSynthesis.cancel();
      },Math.max(7000,message.split(/\s+/).length*550+3000));
      let started = false;
      const speak = () => {
        if (started || !active.current || utterance.current !== u) return;
        started = true;
        if (speechDelay.current) { clearTimeout(speechDelay.current); speechDelay.current = null; }
        if (voicesReady.current) { window.speechSynthesis.removeEventListener("voiceschanged", voicesReady.current); voicesReady.current = null; }
        configureJarvisVoice(u);
        window.speechSynthesis.resume();
        window.speechSynthesis.speak(u);
      };
      if (window.speechSynthesis.getVoices().length) speak();
      else { voicesReady.current = speak; window.speechSynthesis.addEventListener("voiceschanged", speak); speechDelay.current = setTimeout(speak, 1000); }
    } catch { silence(); onComplete?.(); if(wanted.current) startListening(); }
  }
  function stopListening() {
    wanted.current = false; epoch.current++; clearTimer();
    if (restart.current) clearTimeout(restart.current);
    const previous = recognition.current;
    recognition.current = null;
    if (previous) { previous.onstart = previous.onresult = previous.onend = null; previous.onerror = null; previous.abort(); }
    setListening(false); setUserSpeaking(false);
  }
  function startListening() {
    if (!active.current || recognition.current) return;
    if (restart.current) { clearTimeout(restart.current); restart.current = null; }
    const browser = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Constructor = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Constructor) { setError("Voice recognition is unavailable. Type your request below, or use Chrome or Edge."); return; }
    wanted.current = true; setError("");
    const r = new Constructor(); recognition.current = r;
    r.continuous = true; r.interimResults = true; r.lang = "en-IN";
    let consumed = 0, count = 0;
    consumeSpeech.current = () => { consumed = count; };
    let transcript = "";
    function reconnect(reason: string) {
      if (recognition.current !== r || !active.current) return;
      clearTimer(); recognition.current = null; setListening(false); setUserSpeaking(false);
      r.onstart = r.onresult = r.onend = null; r.onspeechstart = r.onspeechend = null; r.onerror = null;
      try { r.abort(); } catch { /* Already ended. */ }
      if (!wanted.current) return;
      const now = Date.now();
      if (["speech service ended", "no-speech"].includes(reason)) { restart.current = setTimeout(startListening, 150); return; }
      if (now - recovery.current.startedAt > 30000) recovery.current = { startedAt: now, attempts: 0 };
      if (++recovery.current.attempts > 6) {
        wanted.current = false;
        setError(`The microphone service is not responding (${reason}). Click the microphone to reconnect, or type your request.`);
        return;
      }
      restart.current = setTimeout(startListening, Math.min(2000, recovery.current.attempts * 250));
    }
    function watch(milliseconds: number) {
      clearTimer(); timer.current = setTimeout(() => reconnect("connection timeout"), milliseconds);
    }
    r.onstart = () => {
      if (recognition.current !== r || !wanted.current || !active.current) return;
      setListening(true); setError(""); watch(30000);
    };
    r.onspeechstart = () => { if (recognition.current === r && active.current) { setUserSpeaking(true); watch(10000); } };
    r.onspeechend = () => { if (recognition.current === r && active.current) { setUserSpeaking(false); watch(8000); } };
    r.onresult = e => {
      if (recognition.current !== r || !wanted.current || !active.current) return;
      recovery.current = { startedAt: Date.now(), attempts: 0 };
      watch(30000);
      const rows = Array.from(e.results); count = rows.length;
      transcript = rows.slice(consumed).map(v => v[0].transcript).join(" ").trim();
      const latestWords = rows[rows.length - 1]?.[0].transcript ?? "";
      const changedWords = rows.slice(e.resultIndex ?? Math.max(0, consumed - 1)).map(row => row[0].transcript).join(" ");
      const clean = transcript.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
      const normalizedReply = lastReply.current.replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
      const controlText = transcript || latestWords;
      const taskPhrase = /^(?:let[’']?s\s+)?clear the issues[.!?]*$/i.test(latestWords.trim());
      const clearReady = rows[rows.length - 1]?.isFinal || !/\b(?:clear|no)\b/i.test(controlText);
      // A speaker and microphone cannot reliably identify who produced a
      // transcript. During synthesis accept explicit interruption controls only;
      // never show or execute the assistant's audible narration as a command.
      if (speakingNow.current) {
        const explicitControl = /^(?:(?:please|jarvis)\s+)*(?:(?:stop(?:\s+reading)?|skip|no|cancel|delete(?:\s+all)?|clear(?:\s+all)?|remove(?:\s+(?:all|suggestions|all suggestions))?|listen(?:\s+again)?)\s*)+[.!?]*$/i.test(latestWords.trim());
        const trailingStop = /\b(?:stop(?:\s+reading)?|skip)[.!?]*\s*$/i.test(latestWords) && !/\b(?:stop(?: reading)?|skip)$/.test(normalizedReply);
        if (!explicitControl && !trailingStop) {
          consumed = rows.length; setText(""); return;
        }
      }
      const interrupt = !taskPhrase && clearReady && (/\b(?:stop(?:\s+reading)?|skip|cancel|delete(?:\s+all)?|clear(?:\s+all)?)\b/i.test(changedWords)
        || (rows[rows.length - 1]?.isFinal && /^(?:no\s*)+[.!?]*$/i.test(latestWords.trim())));
      const removeSuggestions = /^(?:please\s+)?remove(?:\s+(?:all|suggestions|the suggestions|all suggestions))?[.!?]*$/i.test(controlText.trim());
      if (interrupt || (removeSuggestions && rows[rows.length - 1]?.isFinal)) {
        silence(); consumed = rows.length; epoch.current++; setText("");
        callbacks.current.onStop(true, changedWords || controlText); return;
      }
      if (/^(?:jarvis\s+)?(?:please\s+)?listen(?:\s+(?:again|to me))?[.!?]*$/i.test(controlText.trim())) {
        setText(""); silence(); callbacks.current.onCommand("listen"); return;
      }
      const standaloneControl = /^(?:(?:stop(?: reading)?|no|cancel|delete(?: all)?|clear(?: all)?)\s*)+[.!?]*$/i.test(controlText.trim());
      // Explicit interruptions take priority over echo filtering, including an
      // interruption appended to an interim result that was already consumed.
      const words = clean.split(" ").filter(Boolean);
      const replyWords = new Set(normalizedReply.split(" "));
      const echoWindow = speakingNow.current || Date.now() < replyEchoUntil.current;
      const echo = echoWindow && clean.length >= 2 && ((speakingNow.current && words.length === 1 && replyWords.has(clean)) || (words.length >= 2 && normalizedReply.includes(clean)) || /^(?:hi|hello)$/.test(clean) ||
        (words.length >= 3 && words.filter(word => replyWords.has(word)).length / words.length >= 0.65));
      if (!taskPhrase && clearReady && isJarvisStopCommand(controlText) && (standaloneControl || !echo)) {
        silence(); consumed = rows.length; epoch.current++; setText("");
        callbacks.current.onStop(true, changedWords || controlText); return;
      }
      if (!transcript) return;
      if (echo) { consumed = rows.length; setText(""); return; }
      // A new user command can interrupt the reply without restarting the microphone.
      if (speakingNow.current && rows.slice(consumed).some(row => row.isFinal)) silence();
      const displayText = callbacks.current.normalizeTranscript(transcript);
      setText(displayText);
      // Source selection is reversible. Accept its isolated keyword immediately
      // instead of waiting for the browser to finalize an otherwise idle result.
      if (callbacks.current.immediateCommand(displayText)) {
        consumed = rows.length; setText(""); silence(); callbacks.current.onCommand(displayText); return;
      }
      // Show interim words immediately, but execute finalized speech exactly once.
      // There is no application delay after the browser marks a phrase final.
      let finalEnd = consumed;
      while (finalEnd < rows.length && rows[finalEnd].isFinal) finalEnd++;
      const finalRows = rows.slice(consumed, finalEnd);
      if (finalRows.length) {
        const command = finalRows.map(row => row[0].transcript).join(" ").trim();
        let next = consumed;
        while (next < rows.length && rows[next].isFinal) next++;
        consumed = next;
        if (command) callbacks.current.onCommand(callbacks.current.normalizeTranscript(command));
      }
    };
    r.onend = () => reconnect("speech service ended");
    r.onerror = e => {
      if (recognition.current !== r || !active.current) return;
      if (["no-speech", "aborted", "network"].includes(e.error)) { reconnect(e.error); return; }
      wanted.current = false; clearTimer(); setListening(false);
      recognition.current = null; r.onstart = r.onresult = r.onend = null; r.onerror = null;
      try { r.abort(); } catch { /* Already stopped. */ }
      setError(e.error === "not-allowed" ? "Allow microphone access for this portal, then click the microphone. You can also type." : `Speech recognition stopped (${e.error}). Click the microphone to retry or type below.`);
    };
    try { r.start(); watch(5000); } catch { reconnect("microphone could not start"); }
  }

  function resetListening() {
    // Discard the cancelled interim result as well as its result index. Some
    // browsers append the next utterance to that same interim result otherwise.
    silence();
    stopListening();
    recovery.current = { startedAt: Date.now(), attempts: 0 };
    consumeSpeech.current = () => {};
    if (active.current) {
      wanted.current = true;
      restart.current = setTimeout(startListening, 0);
    }
  }
  function discardCommand() { epoch.current++; consumeSpeech.current(); silence(); }
  function submit() {
    epoch.current++; consumeSpeech.current(); silence();
    const clean = text.toLowerCase();
    if (isJarvisStopCommand(clean)) { setText(""); callbacks.current.onStop(true); }
    else if (text.trim()) callbacks.current.onCommand(text.trim());
  }
  useEffect(() => { active.current = true; return () => { active.current = false; wanted.current = false; if(speechWatchdog.current) clearTimeout(speechWatchdog.current); epoch.current++; if (speechDelay.current) clearTimeout(speechDelay.current); if (voicesReady.current && "speechSynthesis" in window) window.speechSynthesis.removeEventListener("voiceschanged", voicesReady.current); clearTimer(); if (restart.current) clearTimeout(restart.current); if (recognition.current) { recognition.current.onstart = null; recognition.current.onend = null; recognition.current.onresult = null; recognition.current.onerror = null; recognition.current.abort(); recognition.current = null; } if (utterance.current && "speechSynthesis" in window) window.speechSynthesis.cancel(); }; }, []);
  return { text, setText, listening, speaking, userSpeaking, error, say, silence, startListening, stopListening, submit, discardCommand, resetListening };
}
