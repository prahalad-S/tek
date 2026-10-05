import type { BackupSnapshot } from "../../lib/employeeBackup";
import { useEffect, useState } from "react";
import { Download, TriangleAlert, CheckCircle2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../app/providers";
import { client } from "../../lib/supabase";
import { rpc } from "../../lib/api";
import { previewEmployees } from "../../lib/preview";
import { errorMessage } from "../../lib/domain";
import { Modal, useToast } from "../../components/ui";
export default function DeleteEmployee({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { member, profile, preview } = useAuth();
  const [location, setLocation] = useState(""),
    [id, setId] = useState(""),
    [status, setStatus] = useState("Left"),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState(false),
    [downloaded, setDownloaded] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [progress, setProgress] = useState(""),
    [failure, setFailure] = useState("");
  const toast = useToast(),
    qc = useQueryClient();
  useEffect(() => {
    if (open) {
      setId("");
      setLocation("");
      setReview(false);
      setDownloaded(false);
      setConfirmed(false);
      setFailure("");
      setProgress("");
    }
  }, [open]);
  const q = useQuery({
    queryKey: ["deletable-employees", preview],
    enabled: open && member?.role === "admin",
    queryFn: async () => {
      if (preview) return previewEmployees;
      const r = await client()
        .from("employees")
        .select("id,user_id,full_name,email,location")
        .is("archived_at", null)
        .order("full_name");
      if (r.error) throw r.error;
      return r.data;
    },
  });
  const employee = q.data?.find((e) => e.id === id);
  async function backup() {
    if (!employee) return;
    setBusy(true);
    setFailure("");
    setDownloaded(false);
    setConfirmed(false);
    try {
      const { createEmployeeArchive, employeeBackupName } =
        await import("../../lib/employeeBackup");
      setProgress("Collecting employee records…");
      const snapshot = preview
        ? {
            schema_version: 1,
            exported_at: new Date().toISOString(),
            employee: { id: employee.id, full_name: employee.full_name },
            entries: [],
            profile_documents: [],
            preview: true,
          }
        : await rpc<BackupSnapshot>("export_employee_backup", {
            p_employee: id,
          });
      const bytes = await createEmployeeArchive(
        snapshot,
        async (bucket, path) => {
          const r = await client().storage.from(bucket).download(path);
          if (r.error)
            throw Error(
              `Could not back up ${path.split("/").pop()}: ${r.error.message}`,
            );
          return r.data.arrayBuffer();
        },
        setProgress,
      );
      const url = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: "application/zip" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = (preview ? "PREVIEW-" : "") + employeeBackupName(snapshot);
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setDownloaded(true);
      setProgress(
        "Backup download started. Check your Downloads folder before continuing.",
      );
    } catch (e) {
      setFailure(errorMessage(e));
      setProgress("");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!downloaded || !confirmed || !employee) return;
    setBusy(true);
    setFailure("");
    try {
      if (!preview) {
        await rpc("archive_employee", { p_employee: id, p_status: status });
        await Promise.allSettled(
          [
            "directory-all",
            "people-directory",
            "access",
            "former-employees",
            "deletable-employees",
            "home-people",
          ].map((key) => qc.invalidateQueries({ queryKey: [key] })),
        );
      }
      toast(
        preview
          ? "Preview: no employee was removed."
          : "Employee moved to former employees and access disabled.",
      );
      onClose();
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (member?.role !== "admin") return null;
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={review ? "Back up before removing access" : "Delete employee"}
      description={
        review
          ? `Review the backup for ${employee?.full_name || "this employee"} before continuing.`
          : "Choose the location and employee. Work history is retained when portal access is removed."
      }
    >
      {!review ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setReview(true);
            setDownloaded(false);
            setConfirmed(false);
            setFailure("");
          }}
        >
          <label>
            Location
            <select
              aria-label="Employee location"
              value={location}
              onChange={(e) => {
                setLocation(e.target.value);
                setId("");
              }}
            >
              <option value="">All locations</option>
              {[
                ...new Set(
                  (q.data || []).map((e) => e.location).filter(Boolean),
                ),
              ]
                .sort()
                .map((l) => (
                  <option key={l}>{l}</option>
                ))}
            </select>
          </label>
          <label>
            Employee
            <select required value={id} onChange={(e) => setId(e.target.value)}>
              <option value="">Select employee</option>
              {q.data
                ?.filter(
                  (e) =>
                    e.user_id !== profile?.user_id &&
                    (!location || e.location === location),
                )
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name} · {e.email}
                  </option>
                ))}
            </select>
          </label>
          <fieldset className="departure-options">
            <legend>Departure status</legend>
            {["Left", "Terminated"].map((value) => (
              <label className="inline-check" key={value}>
                <input
                  type="radio"
                  name="departure"
                  checked={status === value}
                  onChange={() => setStatus(value)}
                />
                {value}
              </label>
            ))}
          </fieldset>
          {q.error && <p role="alert">{errorMessage(q.error)}</p>}
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="button" disabled={!id || q.isPending}>
              Continue
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="backup-warning" role="alert">
            <TriangleAlert size={22} />
            <div>
              <strong>Download an employee backup first</strong>
              <p>
                Includes profile details and files, all timesheets and entries,
                revisions, activity history, leave requests, project links and
                audit records. Personal notes stay private.
              </p>
            </div>
          </div>
          <p>
            <strong>{employee?.full_name}</strong> will be marked{" "}
            <strong>{status}</strong> and lose portal access. Historical records
            remain available to administrators.
          </p>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void backup()}
          >
            <Download size={16} />
            {downloaded ? "Download backup again" : "Download backup ZIP"}
          </button>
          {progress && (
            <p role="status" className="backup-progress">
              {downloaded && <CheckCircle2 size={16} />} {progress}
            </p>
          )}
          {preview && (
            <p className="muted">
              Preview downloads contain fictional data only.
            </p>
          )}
          {downloaded && (
            <label className="inline-check backup-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                disabled={busy}
              />
              I have saved and checked the backup ZIP.
            </label>
          )}
          {failure && (
            <p role="alert" className="error-text">
              {failure} No employee was removed.
            </p>
          )}
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setReview(false)}
            >
              Back
            </button>
            <button
              className="button danger"
              disabled={busy || !downloaded || !confirmed}
              onClick={() => void remove()}
            >
              Delete employee
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
