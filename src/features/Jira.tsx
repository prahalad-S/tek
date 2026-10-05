import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowUpRight,
  CircleCheck,
  CircleDot,
  RefreshCw,
} from "lucide-react";
import { Modal, EmptyState, ErrorState, Loading } from "../components/ui";
import { client } from "../lib/supabase";

type JiraIssue = {
  key: string;
  summary: string;
  status: string;
  issueType: string;
  priority: string | null;
  project: string;
  updated: string | null;
  url: string;
};

type JiraSync = {
  connected: boolean;
  account: { accountId: string; displayName: string };
  issues: JiraIssue[];
  syncedAt: string;
};

export default function JiraPanel({
  open,
  onClose,
  preview,
}: {
  open: boolean;
  onClose: () => void;
  preview: boolean;
}) {
  const query = useQuery({
    queryKey: ["jira-assigned-issues"],
    queryFn: async () => {
      const { data, error } = await client().functions.invoke<JiraSync>("jira");
      if (error) {
        const response = (error as { context?: unknown }).context;
        if (response instanceof Response) {
          let body: { error?: unknown } | null = null;
          try {
            body = await response.clone().json();
          } catch {
            body = null;
          }
          if (typeof body?.error === "string") throw new Error(body.error);
        }        throw error;
      }
      if (!data) throw new Error("Jira returned no sync data. Please retry.");
      return data;
    },
    enabled: open && !preview,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const title = "My Jira issues";
  const accountName = query.data?.account?.displayName;
  const description = preview
    ? "Jira sync is available in the connected workspace."
    : accountName
      ? `Assigned to ${accountName} in Jira.`
      : "Sync the issues assigned to your connected Jira account.";

  return (
    <Modal open={open} onClose={onClose} title={title} description={description} wide>
      {preview ? (
        <EmptyState
          title="Connect your live workspace"
          description="Jira issues are not available in the design preview."
        />
      ) : (
        <section className="jira-panel" aria-live="polite">
          <div className="jira-panel-toolbar">
            <div className="jira-sync-label">
              {query.isFetching ? (
                <CircleDot size={16} className="jira-sync-pulse" />
              ) : query.isSuccess ? (
                <CircleCheck size={16} />
              ) : (
                <AlertCircle size={16} />
              )}
              <span>
                {query.isFetching
                  ? "Syncing Jira issues…"
                  : query.data
                    ? `Synced ${new Date(query.data.syncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                    : "Ready to sync"}
              </span>
            </div>
            <button
              type="button"
              className="button secondary jira-refresh"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshCw size={15} className={query.isFetching ? "jira-spin" : ""} />
              Refresh
            </button>
          </div>

          {query.isFetching && !query.data ? (
            <Loading />
          ) : query.error ? (
            <ErrorState error={query.error} retry={() => void query.refetch()} />
          ) : query.data?.issues.length ? (
            <>
              <div className="jira-issue-list">
                {query.data.issues.map((issue) => (
                  <article className="jira-issue" key={issue.key}>
                    <div className="jira-issue-main">
                      <div className="jira-issue-meta">
                        <span className="jira-issue-key">{issue.key}</span>
                        <span>{issue.project}</span>
                        <span>{issue.issueType}</span>
                      </div>
                      <a
                        className="jira-issue-title"
                        href={issue.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {issue.summary}
                        <ArrowUpRight size={14} />
                      </a>
                      <div className="jira-issue-meta jira-issue-updated">
                        <span>Status: {issue.status}</span>
                        {issue.priority && <span>Priority: {issue.priority}</span>}
                        {issue.updated && (
                          <span>
                            Updated {new Date(issue.updated).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <p className="jira-list-note">
                Showing the 50 most recently updated issues assigned to this Jira account.
              </p>
            </>
          ) : query.data ? (
            <EmptyState
              title="No assigned issues"
              description={`Jira is connected as ${query.data.account.displayName}, and no visible issues are currently assigned to that account.`}
            />
          ) : null}
        </section>
      )}
    </Modal>
  );
}
