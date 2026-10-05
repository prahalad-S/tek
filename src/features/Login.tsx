import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Eye,
  EyeOff,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import { client, configured, previewEnabled } from "../lib/supabase";
import { Brand } from "../components/ui";
import { errorMessage } from "../lib/domain";
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "reset") {
        const { error } = await client().auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/password`,
        });
        if (error) throw error;
        setMessage(
          "If an account exists, a password reset link is on its way.",
        );
      } else if (mode === "signup") {
        const { data, error } = await client().auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: { emailRedirectTo: `${location.origin}/home` },
        });
        if (error) throw error;
        if (data.session) navigate("/home");
        else
          setMessage(
            "Check your work email to confirm your account, then sign in. Workspace access requires an administrator-provisioned email.",
          );
      } else {
        const { error } = await client().auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error) throw error;
        navigate("/home");
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <button
        className="icon-button auth-back"
        aria-label="Go back"
        onClick={() => {
          if (mode !== "login") setMode("login");
          else if (window.history.state?.idx > 0) navigate(-1);
          else navigate(previewEnabled ? "/preview/people" : "/login");
        }}
      >
        <ArrowLeft size={20} />
      </button>
      <section className="auth-story">
        <Brand />
        <div className="auth-story-content">
          <span className="eyebrow">ROOM FOR YOUR BEST WORK</span>
          <h1>
            Great work starts
            <br />
            with <em>great people.</em>
          </h1>
          <p>
            A little more clarity. A little less busywork.
            <br />
            One thoughtful space for your working day.
          </p>
          <div className="auth-art">
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="art-orbit orbit-three" />
            <div className="art-center">
              <Sparkles size={42} />
            </div>
            <span className="art-label art-label-one">People, connected.</span>
            <span className="art-label art-label-two">Work, in harmony.</span>
          </div>
        </div>
        <div className="auth-footer">
          TEKZENIT <span>Built around you.</span>
        </div>
      </section>
      <section className="auth-form-panel">
        <div className="auth-top">
          Your work, together <ArrowUpRight size={16} />
        </div>
        <div className="auth-form-wrap">
          <span className="small-logo">
            <ShieldCheck size={24} />
          </span>
          <h2>
            {mode === "login"
              ? "Welcome to your workspace"
              : mode === "signup"
                ? "Make yourself at home"
                : "Reset your password"}
          </h2>
          <p>
            {mode === "login"
              ? "Sign in with your work email and password."
              : mode === "signup"
                ? "Create an account with your provisioned work email."
                : "We’ll send a secure reset link to your email."}
          </p>
          {!configured && (
            <div className="setup-notice">
              Live sign-in will be available once your Supabase project is
              connected.
            </div>
          )}
          <form onSubmit={submit}>
            <label>
              Work email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
                maxLength={254}
              />
            </label>
            {mode !== "reset" && (
              <label>
                Password
                <span className="password-field">
                  <input
                    type={visible ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    minLength={mode === "signup" ? 12 : 1}
                    placeholder={
                      mode === "signup"
                        ? "At least 12 characters"
                        : "Enter your password"
                    }
                    required
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={visible ? "Hide password" : "Show password"}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
              </label>
            )}
            {mode === "login" && (
              <button
                className="text-button auth-forgot"
                type="button"
                onClick={() => {
                  setMode("reset");
                  setError("");
                  setMessage("");
                }}
              >
                Forgot password?
              </button>
            )}
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            {message && (
              <p className="success-message" role="status">
                {message}
              </p>
            )}
            <button disabled={busy || !configured} className="button full">
              {busy
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Create account"
                    : "Send reset link"}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="auth-switch">
            {mode === "login" ? "First time here?" : "Already have an account?"}{" "}
            <button
              className="text-button"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError("");
                setMessage("");
              }}
            >
              {mode === "login" ? "Activate your account" : "Sign in"}
            </button>
          </p>
          {previewEnabled && (
            <Link className="preview-link" to="/preview/people">
              Explore the design preview <ArrowUpRight size={15} />
            </Link>
          )}
          <div className="auth-assurance">
            <ShieldCheck size={15} />
            Protected by Supabase Auth. No employee-ID login.
          </div>
        </div>
        <div className="auth-bottom">A considered space for people & work.</div>
      </section>
    </div>
  );
}
export function PasswordPage() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="auth-password">
      <Link className="icon-button" to="/login" aria-label="Go back">
        <ArrowLeft size={20} />
      </Link>
      <Brand />
      <h1>Set a new password</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const { error } = await client().auth.updateUser({ password });
            if (error) throw error;
            setMessage("Password updated. You can return to your workspace.");
          } catch (e) {
            setMessage(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          New password
          <input
            type="password"
            minLength={12}
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="button" disabled={busy}>
          Update password
        </button>
        <p role="status">{message}</p>
        <Link to="/home">Return to workspace</Link>
      </form>
    </div>
  );
}
