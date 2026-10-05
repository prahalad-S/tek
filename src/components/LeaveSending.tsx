import { Send, UserRound } from "lucide-react";
export default function LeaveSending() {
  return (
    <div className="leave-sending" role="status" aria-live="polite">
      <UserRound size={30} />
      <span className="send-flight">
        <Send size={30} />
      </span>
      <UserRound size={30} />
      <strong>Sending your request to your team lead…</strong>
    </div>
  );
}
