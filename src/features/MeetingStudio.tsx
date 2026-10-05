import { useCallback, useEffect, useRef, useState } from "react";
import { Captions, Check, Circle, Download, Mic, MonitorUp, Pause, Play, Square, Video } from "lucide-react";
import { elapsedLabel, recordingMime, recordingName, stopStream } from "../lib/studioMedia";

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type Recognition = {
  continuous: boolean; interimResults: boolean; lang: string;
  onstart: (() => void) | null;
  onresult: ((event: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; abort: () => void;
};
type RecognitionConstructor = new () => Recognition;
type Recording = { url: string; name: string; duration: number; size: number; downloaded: boolean };
type Caption = { at: string; text: string };
type Phase = "idle" | "preparing" | "recording" | "paused" | "finishing";

function recognizerType(): RecognitionConstructor | undefined {
  const browser = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}

function mediaError(error: unknown, source: "screen" | "recording"): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return source === "screen" ? "Screen capture was cancelled or blocked. Choose a screen, window, or tab to try again." : "Microphone access was blocked. Allow it, or turn off Include microphone to record the screen only.";
  }
  if (error instanceof DOMException && error.name === "NotReadableError") return "The selected screen or microphone could not be opened. Check whether another app or your device settings are blocking it.";
  return source === "screen" ? "Screen capture is unavailable here. Try the portal in a desktop browser that supports screen capture." : "Recording could not start in this browser. Try a supported desktop browser.";
}

export default function MeetingStudio({ active }: { active: boolean }) {
  const [capture, setCapture] = useState<MediaStream | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [includeMic, setIncludeMic] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [error, setError] = useState("");
  const [captionError, setCaptionError] = useState("");
  const [captionPhase, setCaptionPhase] = useState<"off" | "starting" | "listening">("off");
  const [language, setLanguage] = useState("en-IN");
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [interim, setInterim] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const captureRef = useRef<MediaStream | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const mixedRef = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const captionsWanted = useRef(false);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urls = useRef<string[]>([]);
  const mounted = useRef(false);
  const activeRef = useRef(active);
  const epoch = useRef(0);
  const accumulated = useRef(0);
  const lastResume = useRef(0);
  const supportedCapture = window.isSecureContext && !!navigator.mediaDevices?.getDisplayMedia;
  const supportedRecording = typeof MediaRecorder !== "undefined";
  const supportedCaptions = !!recognizerType();
  activeRef.current = active;

  const duration = useCallback(() => accumulated.current + (lastResume.current ? performance.now() - lastResume.current : 0), []);
  const releaseAudio = useCallback(() => {
    stopStream(micRef.current);
    stopStream(mixedRef.current);
    micRef.current = null;
    mixedRef.current = null;
    const context = audioContext.current;
    audioContext.current = null;
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
  }, []);
  const stopCaptions = useCallback(() => {
    captionsWanted.current = false;
    if (restartTimer.current) clearTimeout(restartTimer.current);
    restartTimer.current = null;
    const current = recognition.current;
    recognition.current = null;
    if (current) {
      current.onend = null;
      current.onresult = null;
      current.onstart = null;
      current.onerror = null;
      try { current.abort(); } catch { /* Recognition may already have ended. */ }
    }
    if (mounted.current) { setCaptionPhase("off"); setInterim(""); }
  }, []);
  const stopRecording = useCallback(() => {
    const current = recorder.current;
    if (current && current.state !== "inactive") {
      accumulated.current = duration();
      lastResume.current = 0;
      if (mounted.current) { setElapsed(accumulated.current); setPhase("finishing"); }
      current.stop();
    }
  }, [duration]);
  const stopCapture = useCallback(() => {
    epoch.current += 1;
    stopRecording();
    stopCaptions();
    stopStream(captureRef.current);
    captureRef.current = null;
    if (video.current) video.current.srcObject = null;
    if (!recorder.current) releaseAudio();
    if (mounted.current) { setCapture(null); setChoosing(false); }
  }, [releaseAudio, stopCaptions, stopRecording]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopCapture();
      releaseAudio();
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current = [];
    };
  }, [releaseAudio, stopCapture]);
  useEffect(() => { if (!active) stopCapture(); }, [active, stopCapture]);
  useEffect(() => {
    if (video.current) {
      video.current.srcObject = capture;
      if (capture) void video.current.play().catch(() => undefined);
    }
  }, [capture]);
  useEffect(() => {
    if (phase !== "recording") return;
    const timer = setInterval(() => setElapsed(duration()), 250);
    return () => clearInterval(timer);
  }, [duration, phase]);
  useEffect(() => {
    if (!capture && !recordings.some(item => !item.downloaded)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [capture, recordings]);

  async function startCapture() {
    if (!supportedCapture || captureRef.current || choosing) return;
    setError(""); setChoosing(true);
    const request = ++epoch.current;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 30 } }, audio: true });
      if (!mounted.current || !activeRef.current || epoch.current !== request) { stopStream(stream); return; }
      captureRef.current = stream;
      setCapture(stream);
      stream.getVideoTracks()[0]?.addEventListener("ended", stopCapture, { once: true });
    } catch (failure) {
      if (mounted.current && epoch.current === request) setError(mediaError(failure, "screen"));
    } finally {
      if (mounted.current && epoch.current === request) setChoosing(false);
    }
  }

  async function startRecording() {
    const display = captureRef.current;
    if (!display || recorder.current || phase !== "idle") return;
    const request = epoch.current;
    setError(""); setPhase("preparing");
    let current: MediaRecorder | null = null;
    try {
      let stream = new MediaStream(display.getTracks());
      if (includeMic) {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
        if (!mounted.current || !activeRef.current || epoch.current !== request || display.getVideoTracks()[0]?.readyState !== "live") { stopStream(mic); if (mounted.current) setPhase("idle"); return; }
        micRef.current = mic;
        const context = new AudioContext();
        audioContext.current = context;
        await context.resume();
        if (!mounted.current || epoch.current !== request) { releaseAudio(); if (mounted.current) setPhase("idle"); return; }
        const destination = context.createMediaStreamDestination();
        if (display.getAudioTracks().length) context.createMediaStreamSource(new MediaStream(display.getAudioTracks())).connect(destination);
        context.createMediaStreamSource(mic).connect(destination);
        mixedRef.current = destination.stream;
        stream = new MediaStream([...display.getVideoTracks(), ...destination.stream.getAudioTracks()]);
      }
      if (display.getVideoTracks()[0]?.readyState !== "live") throw new Error("Screen capture ended.");
      const mime = recordingMime(type => MediaRecorder.isTypeSupported(type));
      current = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const instance = current;
      instance.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      instance.onerror = () => { if (mounted.current) setError("The browser interrupted recording. Any captured video will appear below when available."); stopRecording(); };
      instance.onstop = () => {
        const recordedDuration = duration();
        accumulated.current = recordedDuration;
        lastResume.current = 0;
        releaseAudio();
        if (recorder.current === instance) recorder.current = null;
        if (!mounted.current) return;
        const blob = new Blob(chunks, { type: instance.mimeType || chunks[0]?.type || "video/webm" });
        if (blob.size) {
          const url = URL.createObjectURL(blob);
          urls.current.push(url);
          setRecordings(items => [...items, { url, name: recordingName(blob.type), duration: recordedDuration, size: blob.size, downloaded: false }]);
        } else setError("No video was captured. Start screen capture and try recording again.");
        setElapsed(recordedDuration); setPhase("idle");
      };
      recorder.current = instance;
      accumulated.current = 0;
      lastResume.current = performance.now();
      setElapsed(0);
      instance.start(1000);
      setPhase("recording");
    } catch (failure) {
      if (recorder.current === current) recorder.current = null;
      releaseAudio();
      if (mounted.current) { setPhase("idle"); setError(mediaError(failure, "recording")); }
    }
  }

  function togglePause() {
    const current = recorder.current;
    if (current?.state === "recording") {
      current.pause(); accumulated.current = duration(); lastResume.current = 0;
      setElapsed(accumulated.current); setPhase("paused");
    } else if (current?.state === "paused") {
      current.resume(); lastResume.current = performance.now(); setPhase("recording");
    }
  }

  function startCaptions() {
    const Constructor = recognizerType();
    if (!Constructor || recognition.current) return;
    const current = new Constructor();
    recognition.current = current;
    captionsWanted.current = true;
    current.continuous = true; current.interimResults = true; current.lang = language;
    let restarts = 0;
    setCaptionError(""); setCaptionPhase("starting");
    current.onstart = () => { if (mounted.current) setCaptionPhase("listening"); };
    current.onresult = event => {
      if (!mounted.current || !captionsWanted.current) return;
      restarts = 0;
      let draft = "";
      const final: Caption[] = [];
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index];
        const text = result[0].transcript.trim();
        if (!text) continue;
        if (result.isFinal) final.push({ at: new Date().toLocaleTimeString(), text });
        else draft += `${text} `;
      }
      if (final.length) setCaptions(items => [...items, ...final]);
      setInterim(draft.trim());
    };
    current.onerror = event => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      const message = event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "Microphone or speech recognition access was blocked. Allow microphone access in your browser to enable captions."
        : event.error === "network" ? "The browser speech service is unavailable. Check your connection and try enabling captions again."
        : "Your browser could not transcribe microphone audio. Try enabling captions in a supported desktop browser.";
      if (mounted.current) setCaptionError(message);
      stopCaptions();
    };
    current.onend = () => {
      if (!mounted.current || !captionsWanted.current || !activeRef.current) return;
      if (++restarts > 3) { setCaptionError("Captions stopped after repeated interruptions. Enable them again when you are ready to speak."); stopCaptions(); return; }
      setCaptionPhase("starting");
      restartTimer.current = setTimeout(() => {
        if (!captionsWanted.current || !mounted.current || !activeRef.current) return;
        try { current.start(); } catch { setCaptionError("Captions could not restart. Enable them again to retry."); stopCaptions(); }
      }, 1000);
    };
    try { current.start(); } catch { setCaptionError("The browser speech service could not start. Try a supported desktop browser."); stopCaptions(); }
  }

  function downloadTranscript() {
    const text = `Tekzenit — microphone captions\n\n${captions.map(item => `[${item.at}] ${item.text}`).join("\n")}`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `tekzenit-captions-${Date.now()}.txt`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const recordingBusy = phase !== "idle";
  const captionOn = captionPhase !== "off";
  const latestCaption = interim || captions.at(-1)?.text || "Listening to your microphone…";

  return <section className="meeting-studio" aria-labelledby="studio-title">
    <header className="studio-heading"><div><span className="teams-eyebrow">SCREEN STUDIO</span><h2 id="studio-title">Share what you’re working on.</h2><p>Preview your screen, record a walkthrough, and caption your voice.</p></div><span className="studio-local-badge">Local preview · No participants connected</span></header>
    <div className="studio-grid">
      <div className="studio-main">
        <div className="studio-screen">
          <video ref={video} muted autoPlay playsInline aria-label="Your selected screen preview" hidden={!capture} />
          {!capture && <div className="studio-screen-placeholder"><span><MonitorUp size={30} /></span><h3>Your ideas, on screen.</h3><p>Choose a tab, window, or screen to preview here.<br />You control exactly what the browser captures.</p><button type="button" className="button" disabled={!supportedCapture || choosing} onClick={() => void startCapture()}><MonitorUp size={16} />{choosing ? "Choose in your browser…" : "Choose screen"}</button></div>}
          {capture && <span className="studio-preview-label"><span />Screen preview · Only you can see this</span>}
          {capture && captionOn && <div className="studio-subtitles" aria-live="polite"><small>You · Microphone</small><span>{latestCaption}</span></div>}
        </div>
        <div className="studio-controls"><div className="studio-capture-controls"><button type="button" className="button secondary" disabled={!capture} onClick={stopCapture}><Square size={14} />Stop capture</button><span>{capture ? `${capture.getAudioTracks().length ? "Shared audio included" : "No shared audio"}` : "Capture is off"}</span></div><div className="studio-record-controls"><span className={`studio-timer${phase === "recording" ? " studio-timer--recording" : ""}`}><Circle size={9} />{elapsedLabel(elapsed)}</span>{phase === "recording" || phase === "paused" ? <><button type="button" className="button secondary" onClick={togglePause}>{phase === "paused" ? <Play size={14} /> : <Pause size={14} />}{phase === "paused" ? "Resume" : "Pause"}</button><button type="button" className="button studio-stop-recording" onClick={stopRecording}><Square size={14} />Stop recording</button></> : <button type="button" className="button" disabled={!capture || !supportedRecording || recordingBusy} onClick={() => void startRecording()}><Circle size={14} />{phase === "preparing" ? "Starting…" : phase === "finishing" ? "Saving…" : "Record"}</button>}</div></div>
        {error && <p className="studio-error" role="alert">{error}</p>}
        {!supportedCapture && <p className="studio-error">Screen capture is not supported in this browser. Open the portal over HTTPS or localhost in a supported desktop browser.</p>}
        {!supportedRecording && <p className="studio-error">This browser does not support screen recording.</p>}
        <div className="studio-meeting-note"><Video size={18} /><div><strong>Microsoft Teams meetings are awaiting access</strong><p>This studio previews and records your selected screen locally. Broadcasting to colleagues and captions for meeting participants require a connected Microsoft meeting service.</p></div></div>
        {recordings.length > 0 && <section className="studio-recordings" aria-label="Your recordings"><div className="studio-section-heading"><h3>Your recordings</h3><span>Download before leaving this page</span></div>{recordings.map(item => <div className="studio-recording" key={item.url}><span className="studio-file-icon"><Video size={18} /></span><div><strong>{item.name}</strong><small>{elapsedLabel(item.duration)} · {(item.size / 1024 / 1024).toFixed(1)} MB · {item.downloaded ? "Downloaded" : "Stored in this page"}</small></div><a className="button secondary" href={item.url} download={item.name} onClick={() => setRecordings(items => items.map(recording => recording.url === item.url ? { ...recording, downloaded: true } : recording))}>{item.downloaded ? <Check size={15} /> : <Download size={15} />}Download</a></div>)}</section>}
      </div>
      <aside className="studio-options" aria-label="Recording and captions settings">
        <section><div className="studio-option-title"><Mic size={17} /><h3>Recording audio</h3></div><label className="studio-checkbox"><input type="checkbox" checked={includeMic} disabled={recordingBusy} onChange={event => setIncludeMic(event.target.checked)} /><span>Include my microphone</span></label><p>The browser asks for microphone access when recording starts. Shared tab or system audio is included only when you select it in the browser’s screen chooser.</p></section>
        <section><div className="studio-option-title"><Captions size={18} /><h3>Live captions</h3><span className={`studio-caption-status${captionOn ? " studio-caption-status--on" : ""}`}>{captionPhase === "listening" ? "Listening" : captionPhase === "starting" ? "Starting" : "Off"}</span></div><p>Automatically transcribe your voice while enabled. Captions listen to your microphone, not other meeting participants.</p><label className="studio-language">Spoken language<select value={language} disabled={captionOn} onChange={event => setLanguage(event.target.value)}><option value="en-IN">English (India)</option><option value="en-US">English (US)</option><option value="en-GB">English (UK)</option><option value="hi-IN">Hindi (India)</option></select></label><p id="studio-caption-privacy" className="studio-privacy-note">Your browser may send microphone audio to its speech recognition service. Enable captions only if you agree to that processing.</p><button type="button" className="button secondary studio-caption-toggle" aria-pressed={captionOn} aria-describedby="studio-caption-privacy" disabled={!supportedCaptions} onClick={() => captionOn ? stopCaptions() : startCaptions()}><Captions size={16} />{captionOn ? "Turn captions off" : "Enable microphone captions"}</button>{!supportedCaptions && <p className="studio-error">Live captions are unavailable in this browser.</p>}{captionError && <p className="studio-error" role="alert">{captionError}</p>}
          {(captionOn || captions.length > 0) && <div className="studio-caption-transcript"><div className="studio-section-heading"><strong>Your captions</strong><button type="button" className="text-button" disabled={!captions.length} onClick={downloadTranscript}><Download size={13} />Save text</button></div><div className="studio-caption-lines">{captions.map((item, index) => <p key={index}><small>{item.at}</small>{item.text}</p>)}{captionOn && <p className="studio-interim">{interim || "Listening…"}</p>}</div><small className="studio-caption-footnote">Captions are separate from the recorded video.</small></div>}
        </section>
        <div className="studio-storage-note"><Download size={17} /><p>Recordings stay in this page until you download them. The portal does not upload video, audio, or caption text.</p></div>
      </aside>
    </div>
  </section>;
}
