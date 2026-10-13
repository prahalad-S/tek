import { configureJarvisVoice } from "../lib/jarvisVoice";
import { rememberCompletedTask } from "../lib/jarvisTaskContext";
import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Mic,
  MicOff,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { GitHubWorkspace } from "../lib/githubConnection";
export type VoiceTaskResult = {
  summary: string;
  commitUrl?: string;
  commitSha?: string;
  actionUrl?: string;
};
type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<RecognitionResult>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionConstructor = new () => Recognition;
function recognizer() {
  const browser = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}
function waitingWindow(): Window | null {
  // Reserve the result window during the click, before async speech and GitHub requests.
  let result: Window | null = null;
  try {
    result = window.open(
      "about:blank",
      "_blank",
      "popup,width=1100,height=780",
    );
    if (result) {
      result.opener = null;
      result.document.title = "Jarvis · Waiting for your task";
      const message = result.document.createElement("p");
      message.textContent =
        "Jarvis is ready. After your task is pushed, this window will show the GitHub commit.";
      message.style.cssText =
        "font:16px/1.7 system-ui;padding:48px;color:#334155";
      result.document.body.append(message);
      window.focus();
    }
    return result;
  } catch {
    try {
      result?.close();
    } catch {
      /* The result link remains available in the editor. */
    }
    return null;
  }
}
const speechError = (code: string) =>
  (
    ({
      "not-allowed":
        "Microphone access was blocked. Allow microphone access for this site, then try again.",
      "service-not-allowed":
        "Speech recognition is unavailable in this browser. Open the portal in Chrome or Edge, or type your command below.",
      "audio-capture":
        "No microphone is available. Check your microphone connection and device settings.",
      "no-speech":
        "I did not hear a command. Click Speak to Jarvis and try again.",
      network:
        "The browser's speech service could not connect. Try again or type your command below.",
      aborted: "Listening cancelled. No task was started.",
    }) as Record<string, string>
  )[code] ??
  "Could not recognize your voice. Try again or type the command below.";
export default function EditorVoiceTask({
  workspace,
  kind = "github",
  disabled,
  onRun,
  onBusyChange,
}: {
  workspace: GitHubWorkspace | null;
  kind?: "github" | "jira";
  disabled: boolean;
  onRun: (
    instruction: string,
    progress: (message: string) => void,
  ) => Promise<VoiceTaskResult>;
  onBusyChange: (busy: boolean) => void;
}) {
  const [phase, setPhase] = useState<"idle" | "listening" | "working">("idle");
  const [command, setCommand] = useState("");
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);
  const [voiceReply, setVoiceReply] = useState(true);
  const replyEnabled = useRef(true);
  replyEnabled.current = voiceReply;
  const finishReply = useRef<(() => void) | null>(null);
  const spokenReply = useRef<SpeechSynthesisUtterance | null>(null);
  const [result, setResult] = useState<VoiceTaskResult | null>(null);
  const speech = useRef<Recognition | null>(null);
  const destination = useRef<Window | null>(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  const quietTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishSpeech = useRef<() => void>(() => {});
  const latest = useRef({ onRun, onBusyChange });
  latest.current = { onRun, onBusyChange };
  const supported = !!recognizer();
  const ready = kind === "jira" || !!workspace;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearSpeechTimers();
      stopReply();
      speech.current?.abort();
      if (!destination.current?.closed) destination.current?.close();
    };
  }, []);
  function stopReply() {
    if (spokenReply.current && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      spokenReply.current = null;
    }
    finishReply.current?.();
  }
  function speakReply(message: string): Promise<void> {
    if (!replyEnabled.current || !mounted.current || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return Promise.resolve();
    stopReply();
    return new Promise(resolve => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let utterance: SpeechSynthesisUtterance | null = null;
      const done = () => {
        if (timer) clearTimeout(timer);
        if (finishReply.current === done) finishReply.current = null;
        if (spokenReply.current === utterance) spokenReply.current = null;
        resolve();
      };
      finishReply.current = done;
      try {
        utterance = new SpeechSynthesisUtterance(message);
        configureJarvisVoice(utterance);
        utterance.onend = utterance.onerror = done;
        spokenReply.current = utterance;
        timer = setTimeout(() => { if (spokenReply.current === utterance) window.speechSynthesis.cancel(); done(); }, 45000);
        window.speechSynthesis.speak(utterance);
      } catch { done(); }
    });
  }
  function clearSpeechTimers() {
    if (quietTimer.current) clearTimeout(quietTimer.current);
    if (maxTimer.current) clearTimeout(maxTimer.current);
    quietTimer.current = null;
    maxTimer.current = null;
  }
  function release() {
    clearSpeechTimers();
    lock.current = false;
    setPhase("idle");
    latest.current.onBusyChange(false);
  }
  function closeWaiting() {
    if (!destination.current?.closed) destination.current?.close();
    destination.current = null;
  }
  async function execute(text: string) {
    if (!mounted.current) return;
    stopReply();
    setPhase("working");
    setCommand(text);
    setStatus("Understanding your task…");
    setFailed(false);
    try {
      const finished = await latest.current.onRun(text, (message) => {
        if (mounted.current) setStatus(message);
      });
      if (!mounted.current) return;
      if (kind === "github") await rememberCompletedTask(finished.summary, finished.commitUrl);
      if (!mounted.current) return;
      setResult(finished);
      setStatus(finished.summary);
      if (finished.actionUrl) {
        await speakReply(finished.summary);
        if (!mounted.current) return;
        const ticketWindow = window.open(finished.actionUrl, "_blank", "noopener,noreferrer");
        if (!ticketWindow) setStatus(`${finished.summary} If the ticket tab did not open, use View Jira ticket below or allow pop-ups for this portal.`);
      } else void speakReply(finished.summary);
      if (finished.commitUrl) {
        if (!destination.current || destination.current.closed) {
          window.open(finished.commitUrl, "_blank", "noopener,noreferrer");
        }
        if (destination.current && !destination.current.closed) {
          try {
            destination.current.location.replace(finished.commitUrl);
            destination.current = null;
          } catch {
            closeWaiting();
          }
        }
      } else closeWaiting();
    } catch (error) {
      if (!mounted.current) return;
      setFailed(true);
      setStatus(
        error instanceof Error
          ? error.message
          : "Task failed. Your editor files are preserved.",
      );
      closeWaiting();
    } finally {
      if (mounted.current) release();
    }
  }
  function listen() {
    if (lock.current || disabled || !ready) return;
    stopReply();
    const Constructor = recognizer();
    if (!Constructor) {
      setStatus(
        "Voice recognition is unavailable here. Type the same command below.",
      );
      setFailed(true);
      return;
    }
    lock.current = true;
    latest.current.onBusyChange(true);
    setPhase("listening");
    setResult(null);
    setFailed(false);
    setCommand("");
    setStatus(
      kind === "jira" ? "Listening… Say add comments, then move status to In Testing. Take your time." : "Listening... Describe your change. I will edit, commit and push when you finish speaking.",
    );
    // Keep focus on the portal while the microphone captures the command.
    let recognition: Recognition;
    try {
      recognition = new Constructor();
    } catch {
      setStatus("Could not start speech recognition. Type your command below.");
      setFailed(true);
      release();
      return;
    }
    speech.current = recognition;
    recognition.lang = "en-IN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    let delivered = false,
      ending = false,
      lastHeard = "";
    function deliver() {
      if (!mounted.current || delivered) return;
      delivered = true;
      clearSpeechTimers();
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        /* The recognizer may already have ended. */
      }
      speech.current = null;
      if (!lastHeard.trim()) {
        setStatus("No command was heard. Try again or type it below.");
        setFailed(true);
        release();
        return;
      }
      // Some browsers end with an interim result. Dispatch the captured transcript once.
      void execute(lastHeard.trim());
    }
    function finish() {
      if (!mounted.current || delivered || ending) return;
      ending = true;
      clearSpeechTimers();
      setStatus("Finishing your command…");
      try {
        recognition.stop();
      } catch {
        deliver();
        return;
      }
      // Do not wait forever if the speech service omits its final/end event.
      quietTimer.current = setTimeout(deliver, 1500);
    }
    finishSpeech.current = finish;
    recognition.onresult = (event) => {
      if (!mounted.current || delivered) return;
      const results = Array.from(event.results);
      lastHeard = results
        .map((item) => item[0].transcript)
        .join(" ")
        .trim();
      setCommand(lastHeard);
      setStatus("Command heard. Waiting for you to finish speaking…");
      if (ending) return;
      if (quietTimer.current) clearTimeout(quietTimer.current);
      quietTimer.current = setTimeout(
        finish,
        kind === "jira" ? 4500 : results.every((item) => item.isFinal) ? 2400 : 3500,
      );
    };
    recognition.onend = deliver;
    recognition.onerror = (event) => {
      if (!mounted.current || delivered) return;
      if (lastHeard.trim() && ["aborted", "no-speech"].includes(event.error)) {
        deliver();
        return;
      }
      delivered = true;
      clearSpeechTimers();
      speech.current = null;
      setFailed(true);
      setStatus(speechError(event.error));
      release();
    };
    try {
      recognition.start();
      maxTimer.current = setTimeout(finish, 30000);
    } catch {
      delivered = true;
      setStatus(
        "Could not start the microphone. Check site permissions or type your command.",
      );
      setFailed(true);
      speech.current = null;
      release();
    }
  }
  function cancel() {
    clearSpeechTimers();
    const recognition = speech.current;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        /* The recognizer may already have ended. */
      }
      speech.current = null;
    }
    setStatus("Listening cancelled. No task was started.");
    closeWaiting();
    release();
  }
  function submit() {
    if (lock.current || disabled || !ready || !command.trim()) return;
    lock.current = true;
    latest.current.onBusyChange(true);
    setResult(null);
    destination.current = kind === "github" ? waitingWindow() : null;
    void execute(command);
  }
  return (
    <section className="editor-voice-task" id={`${kind === "github" ? "editor" : "jira"}-voice-task`}>
      <header>
        <div>
          <span className="editor-voice-icon">
            <Sparkles size={21} />
          </span>
          <div>
            <h2>Speak to Jarvis</h2>
            <p>
              {kind === "jira" ? "Say: Add comments and move status to In Testing." : "Describe the change. Jarvis automatically edits, commits and pushes to the imported branch."}
            </p>
          </div>
        </div>
        <button
          id={`${kind === "github" ? "editor" : "jira"}-voice-microphone`}
          className={`button ${phase === "listening" ? "is-listening" : ""}`}
          disabled={
            phase === "working" ||
            (phase === "idle" && (disabled || !ready || !supported))
          }
          onClick={
            phase === "listening" ? () => finishSpeech.current() : listen
          }
        >
          {phase === "listening" ? <MicOff size={17} /> : <Mic size={17} />}
          {phase === "listening"
            ? "Finish command"
            : phase === "working"
              ? "Working…"
              : "Speak to Jarvis"}
        </button>
        {phase === "listening" && (
          <button className="button secondary" onClick={cancel}>
            Cancel
          </button>
        )}
      </header>
      <p className="editor-voice-destination">
        {kind === "jira" ? "One issue is selected automatically. With several issues, choose the ticket before Jarvis updates it." : workspace ? (
          <>
            Updates go to <strong>{workspace.repository}</strong> ·{" "}
            <strong>{workspace.branch}</strong>
          </>
        ) : (
          "Import your project through the secure GitHub connection first."
        )}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          aria-label="One-command task for Jarvis"
          placeholder={kind === "jira" ? 'Add comments and move status to In Testing' : "Change the background color to red and update the repo"}
          value={command}
          maxLength={500}
          disabled={phase !== "idle" || disabled}
          onChange={(event) => setCommand(event.target.value)}
        />
        <button
          className="button secondary"
          disabled={
            phase !== "idle" || disabled || !ready || !command.trim()
          }
        >
          Run command
        </button>
      </form>
      {"speechSynthesis" in window && <div className="form-actions">
        <button type="button" className="button secondary" aria-pressed={voiceReply} onClick={() => {
          if (voiceReply) stopReply();
          setVoiceReply(!voiceReply);
        }}>
          {voiceReply ? <Volume2 size={16} /> : <VolumeX size={16} />}
          Voice replies {voiceReply ? "on" : "off"}
        </button>
        {result && voiceReply && <button type="button" className="button secondary" disabled={phase !== "idle"} onClick={() => speakReply(result.summary)}>
          <Volume2 size={16} /> Hear reply again
        </button>}
      </div>}
      {!supported && (
        <p>
          Voice is unavailable in this browser. Type the same command above, or
          use Chrome or Edge.
        </p>
      )}
      <small>
        Commit and push are automatic. Add and preview only to skip publishing.
        Supports background colors, dark/light mode and headings. Microphone
        audio may be processed by your browser’s speech service. No OpenAI key
        is needed.
      </small>
      {status && (
        <p
          className={`editor-voice-status ${failed ? "is-error" : ""}`}
          role={failed ? "alert" : "status"}
        >
          {result && <CheckCircle2 size={16} />}
          {status}
        </p>
      )}
      {(result?.commitUrl || result?.actionUrl) && (
        <a
          className="editor-voice-commit"
          href={result?.actionUrl ?? result?.commitUrl}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={15} />
          {result?.actionUrl ? "View Jira ticket" : `View latest commit ${result?.commitSha?.slice(0, 7) ?? ""}`}
        </a>
      )}
    </section>
  );
}
