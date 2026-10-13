import JiraTaskPanel from "./JiraTaskPanel";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, ArrowUp, ShieldCheck, Check, Clock3 } from "lucide-react";
import { useAuth } from "../app/providers";
import { client } from "../lib/supabase";
import { rpc } from "../lib/api";
import { minutesLabel, errorMessage } from "../lib/domain";
import { Modal, Badge, useToast } from "../components/ui";
type Proposal = {
  id: string;
  date: string;
  project_name: string;
  description: string;
  minutes: number;
};
export default function Assistant({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { preview } = useAuth();
  const [mode, setMode] = useState<"time" | "jira">("time");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  async function ask() {
    if (!text.trim() || busy) return;
    if (proposal) {
      toast("Confirm or cancel the current proposal before starting another.");
      return;
    }
    setBusy(true);
    setAnswer("");
    try {
      if (preview) {
        setAnswer(
          "This is a design preview, not a live AI response. In the connected workspace, Jarvis can prepare one draft time entry from a project, date, description, and duration you provide. You review every detail before it is saved.",
        );
      } else {
        const { data, error } = await client().functions.invoke("assistant", {
          body: { message: text },
        });
        if (error)
          throw new Error(
            "Jarvis is unavailable. Check that the Supabase assistant function and model secret are configured.",
          );
        if (data.error) throw new Error(data.error);
        setAnswer(data.message);
        setProposal(data.proposal ?? null);
      }
      setText("");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="A little help from Jarvis"
      description="Your thoughtful work assistant. You stay in control."
    >
      <div className="assistant-suggestions">
        <button disabled={busy || !!proposal} onClick={() => setMode("time")}>Time entry</button>
        <button disabled={busy || !!proposal || preview} onClick={() => setMode("jira")}>Update Jira ticket</button>
      </div>
      {mode === "jira" ? <JiraTaskPanel /> : <>
      <div className="assistant-intro">
        <span className="assistant-orb">
          <Sparkles size={26} />
        </span>
        <h3>Less admin. More room to think.</h3>
        <p>
          Tell me the project, date, work, and duration. I’ll prepare a draft
          entry for your review.
        </p>
      </div>
      <div className="assistant-suggestions">
        <button
          onClick={() =>
            setText("What do you need to help me draft a time entry?")
          }
        >
          What can you help with?
        </button>
        <button onClick={() => setText("Prepare a time entry for ")}>
          Draft a time entry <Clock3 size={14} />
        </button>
      </div>
      {answer && (
        <div className="assistant-answer" role="status">
          {answer}
        </div>
      )}
      {proposal && (
        <div className="action-preview">
          <Badge tone="purple">Awaiting your approval</Badge>
          <h3>{proposal.project_name}</h3>
          <p>{proposal.description}</p>
          <dl>
            <div>
              <dt>Date</dt>
              <dd>{proposal.date}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{minutesLabel(proposal.minutes)}</dd>
            </div>
            <div>
              <dt>Action</dt>
              <dd>Save one draft entry</dd>
            </div>
          </dl>
          <small>This does not submit your timesheet or update Jira.</small>
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await rpc("cancel_agent_action", { p_id: proposal.id });
                  setProposal(null);
                  toast("Proposal cancelled.");
                } catch (e) {
                  toast(errorMessage(e), "error");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Cancel
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await rpc("confirm_agent_action", { p_id: proposal.id });
                  setProposal(null);
                  setAnswer(
                    "Your draft entry was saved. Review and submit your timesheet when you’re ready.",
                  );
                  void qc.invalidateQueries({ queryKey: ["entries"] });
                  void qc.invalidateQueries({ queryKey: ["sheet"] });
                } catch (e) {
                  toast(errorMessage(e), "error");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Check size={16} />
              Confirm & save
            </button>
          </div>
        </div>
      )}
      <form
        className="assistant-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <textarea
          aria-label="Message Jarvis"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          placeholder="What would you like a hand with?"
          rows={3}
          disabled={!!proposal}
        />
        <button
          className="button"
          aria-label="Send message to Jarvis"
          disabled={busy || !text.trim() || !!proposal}
        >
          <ArrowUp size={18} />
        </button>
      </form>
      <div className="assistant-policy">
        <ShieldCheck size={14} />
        No silent changes. No invented hours. No access beyond yours.
      </div>
      </>}
    </Modal>
  );
}
