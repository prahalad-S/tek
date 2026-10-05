import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../app/providers";
import { client } from "../../lib/supabase";
import { rpc, signedUrl } from "../../lib/api";
import { errorMessage } from "../../lib/domain";
import type { Employee } from "../../lib/types";
import { Badge, Modal, useToast } from "../../components/ui";
const categories = [
  ["personal", "Personal document"],
  ["offer_letter", "Offer letter"],
  ["resume", "Resume"],
  ["id_card", "ID card"],
  ["business_card", "Business card"],
  ["certificate", "Certificate"],
];
export default function ProfileFiles({
  employee,
  documents,
}: {
  employee: Employee;
  documents: any[];
}) {
  const { profile, member, preview } = useAuth();
  const edit =
    member?.role === "admin" || profile?.user_id === employee.user_id;
  const [category, setCategory] = useState("personal");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<any>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["extended-profile", employee.id] });
    void qc.invalidateQueries({ queryKey: ["documents"] });
  };
  return (
    <section className="profile-section">
      <h3>Uploaded documents</h3>
      {edit && (
        <>
          <label>
            Document category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            {["personal", "offer_letter"].includes(category)
              ? "Private: only this employee and administrators can open it."
              : "Shared: active coworkers can open this professional document. Do not include personal phone numbers or sensitive personal details."}
          </p>
          <label className="button secondary upload-button">
            {busy ? "Uploading…" : "Upload document"}
            <input
              aria-label="Upload profile document"
              type="file"
              disabled={busy || (!employee.user_id && !preview)}
              accept="application/pdf,image/jpeg,image/png,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (preview) {
                  toast("Preview only. No document uploaded.");
                  return;
                }
                if (file.size > 10485760) {
                  toast("Choose a file smaller than 10 MB.", "error");
                  return;
                }
                const ext: Record<string, string> = {
                  "application/pdf": "pdf",
                  "image/jpeg": "jpg",
                  "image/png": "png",
                  "image/webp": "webp",
                  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
                    "docx",
                };
                if (!ext[file.type]) {
                  toast("Choose PDF, Word, JPG, PNG or WebP.", "error");
                  return;
                }
                setBusy(true);
                const path = `${employee.user_id}/${crypto.randomUUID()}.${ext[file.type]}`;
                try {
                  const { error } = await client()
                    .storage.from("employee-documents")
                    .upload(path, file, {
                      contentType: file.type,
                      upsert: false,
                    });
                  if (error) throw error;
                  try {
                    await rpc("register_profile_document", {
                      p_user: employee.user_id,
                      p_name: file.name,
                      p_path: path,
                      p_mime: file.type,
                      p_size: file.size,
                      p_category: category,
                    });
                  } catch (error) {
                    await client()
                      .storage.from("employee-documents")
                      .remove([path]);
                    throw error;
                  }
                  refresh();
                  toast("Document uploaded.");
                } catch (error) {
                  toast(errorMessage(error), "error");
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          <small className="muted"> PDF, Word or image · up to 10 MB</small>
          {!documents.some((d) => d.category === "offer_letter") && (
            <p className="muted">
              No offer letter uploaded. Upload the issued document; this portal
              does not invent employment terms.
            </p>
          )}
        </>
      )}
      {documents.map((doc) => (
        <article className="career-row" key={doc.id}>
          <strong>{doc.name}</strong>
          <Badge>{doc.category.replaceAll("_", " ")}</Badge>
          <div className="row-actions">
            <button
              className="button secondary small"
              onClick={async () => {
                try {
                  const url = await signedUrl(
                    "employee-documents",
                    doc.object_path,
                  );
                  window.open(url, "_blank", "noopener,noreferrer");
                } catch (e) {
                  toast(errorMessage(e), "error");
                }
              }}
            >
              Open / download
            </button>
            {edit && (
              <button
                className="button secondary small"
                onClick={() => setDeleting(doc)}
              >
                Delete
              </button>
            )}
          </div>
        </article>
      ))}
      {!documents.length && (
        <p className="muted">No visible uploaded documents.</p>
      )}
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete this document?"
        description="The file and its profile record will be removed."
      >
        <p>{deleting?.name}</p>
        <div className="form-actions">
          <button
            className="button secondary"
            onClick={() => setDeleting(null)}
          >
            Keep file
          </button>
          <button
            className="button danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const { error } = await client()
                  .storage.from("employee-documents")
                  .remove([deleting.object_path]);
                if (error) throw error;
                await rpc("delete_profile_document", { p_id: deleting.id });
                refresh();
                setDeleting(null);
                toast("Document deleted.");
              } catch (error) {
                toast(errorMessage(error), "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            Delete file
          </button>
        </div>
      </Modal>
    </section>
  );
}
