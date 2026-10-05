import { useProfileManagement } from "../../lib/useProfileManagement";
import { showDocument } from "../../lib/employeeDetails";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  CreditCard,
  Upload,
  Eye,
  Download,
  Trash2,
} from "lucide-react";
import { useAuth } from "../../app/providers";
import { Modal, useToast } from "../../components/ui";
import { client } from "../../lib/supabase";
import { rpc, signedUrl } from "../../lib/api";
import { errorMessage } from "../../lib/domain";
import type { Employee } from "../../lib/types";
import type { ExtendedProfile } from "../../lib/profiles";
const categories = [
  ["resume", "Resume"],
  ["pan_card", "PAN card"],
  ["aadhaar_card", "Aadhaar card"],
  ["id_card", "ID card"],
  ["payslip", "Payslip"],
  ["business_card", "Business card"],
  ["offer_letter", "Offer letter"],
  ["joining_letter", "Joining letter"],
  ["relieving_letter", "Relieving letter"],
  ["certificate", "Certificate"],
  ["personal", "Other personal document"],
];
const generated = ["resume", "id_card", "business_card"];
const shared = [...generated, "certificate"];
export default function ProfileDocuments({
  employee,
  data,
}: {
  employee: Employee;
  data: ExtendedProfile;
}) {
  const { preview, profile, member } = useAuth();
  const management = useProfileManagement();
  const edit =
    management.canManage(employee) || profile?.user_id === employee.user_id;
  const toast = useToast(),
    qc = useQueryClient();
  const [busy, setBusy] = useState(false),
    [opened, setOpened] = useState<{
      kind: string;
      doc?: any;
      url: string;
      mime: string;
    } | null>(null);
  const [deleting, setDeleting] = useState<any>(null);
  useEffect(
    () => () => {
      if (opened?.url.startsWith("blob:")) URL.revokeObjectURL(opened.url);
    },
    [opened?.url],
  );
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["extended-profile", employee.id] });
    void qc.invalidateQueries({ queryKey: ["documents"] });
  };
  async function generate(kind: string, format: "pdf" | "docx", view = false) {
    setBusy(true);
    try {
      const { downloadProfileDocument } =
        await import("../../lib/profileDocuments");
      await downloadProfileDocument(
        employee,
        data,
        kind as any,
        format,
        preview,
        view
          ? (blob) =>
              setOpened({
                kind,
                url: URL.createObjectURL(blob),
                mime: "application/pdf",
              })
          : undefined,
      );
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File, kind: string) {
    if (preview) {
      toast("Preview: no file uploaded.");
      return;
    }
    const extensions: Record<string, string> = {
      "application/pdf": "pdf",
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        "docx",
    };
    if (!extensions[file.type] || file.size > 10485760) {
      toast("Choose PDF, Word, JPG, PNG or WebP under 10 MB.", "error");
      return;
    }
    setBusy(true);
    const path = `${employee.user_id}/${crypto.randomUUID()}.${extensions[file.type]}`;
    try {
      const r = await client()
        .storage.from("employee-documents")
        .upload(path, file, { contentType: file.type });
      if (r.error) throw r.error;
      try {
        await rpc("register_profile_document", {
          p_user: employee.user_id,
          p_name: file.name,
          p_path: path,
          p_mime: file.type,
          p_size: file.size,
          p_category: kind,
        });
      } catch (e) {
        await client().storage.from("employee-documents").remove([path]);
        throw e;
      }
      refresh();
      toast("Document uploaded.");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }
  async function view(kind: string, doc?: any) {
    if (!doc) {
      await generate(kind, "pdf", true);
      return;
    }
    setBusy(true);
    try {
      setOpened({
        kind,
        doc,
        url: await signedUrl("employee-documents", doc.object_path),
        mime: doc.mime_type,
      });
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="profile-section">
      <h3>Profile documents</h3>
      <p className="muted">
        Professional documents are shared. Personal documents are visible only
        to you, administrators and assigned location editors.
      </p>
      <div className="document-tiles">
        {categories
          .filter(
            ([kind]) =>
              (edit || shared.includes(kind)) &&
              showDocument(kind, employee.title, employee.location),
          )
          .map(([kind, label]) => {
            const docs = data.documents.filter((d: any) => d.category === kind);
            const available = docs.length > 0 || generated.includes(kind);
            return (
              <article className="document-tile" key={kind}>
                <span
                  className={
                    "document-symbol " + (available ? "available" : "")
                  }
                >
                  <CreditCard size={22} />
                </span>
                <div>
                  <strong>{label}</strong>
                  <small>
                    {docs.length
                      ? `${docs.length} file${docs.length > 1 ? "s" : ""}`
                      : generated.includes(kind)
                        ? "Generated from profile"
                        : "Not available"}
                  </small>
                </div>
                {available && (
                  <button
                    className="button secondary small"
                    disabled={busy}
                    aria-label={`View ${label}`}
                    onClick={() => void view(kind, docs[0])}
                  >
                    <Eye size={14} />
                    View
                  </button>
                )}
                {edit && (
                  <label
                    className="icon-button upload-button"
                    title={`Upload ${label}`}
                  >
                    <Upload size={17} />
                    <input
                      aria-label={`Upload ${label}`}
                      type="file"
                      disabled={busy || (!employee.user_id && !preview)}
                      accept="application/pdf,image/jpeg,image/png,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) void upload(f, kind);
                      }}
                    />
                  </label>
                )}
              </article>
            );
          })}
      </div>
      <Modal
        open={!!opened}
        onClose={() => setOpened(null)}
        title={categories.find((c) => c[0] === opened?.kind)?.[1] || "Document"}
        description={opened?.doc?.name || employee.full_name}
        wide
      >
        {opened && (
          <>
            <div className="document-view-actions">
              {!opened.doc ? (
                <>
                  {(["pdf", "docx"] as const).map((format) => (
                    <button
                      className="button secondary"
                      key={format}
                      disabled={busy}
                      onClick={() => void generate(opened.kind, format)}
                    >
                      <Download size={16} />
                      {format === "pdf" ? "PDF" : "Word"}
                    </button>
                  ))}
                </>
              ) : (
                <>
                  <a
                    className="button secondary"
                    href={opened.url}
                    download={opened.doc.name}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download size={16} />
                    Download{" "}
                    {opened.mime === "application/pdf"
                      ? "PDF"
                      : opened.mime.includes("wordprocessing")
                        ? "Word"
                        : "image"}
                  </a>
                  {edit && (
                    <button
                      className="button secondary"
                      onClick={() => {
                        setDeleting(opened.doc);
                        setOpened(null);
                      }}
                    >
                      <Trash2 size={16} />
                      Delete
                    </button>
                  )}
                </>
              )}
              {generated.includes(opened.kind) && opened.doc && (
                <button
                  className="button secondary"
                  onClick={() => void view(opened.kind)}
                >
                  View generated version
                </button>
              )}
            </div>
            {data.documents.filter((d: any) => d.category === opened.kind)
              .length > 1 && (
              <label>
                Uploaded version
                <select
                  value={opened.doc?.id || ""}
                  onChange={(e) =>
                    void view(
                      opened.kind,
                      data.documents.find((d: any) => d.id === e.target.value),
                    )
                  }
                >
                  <option value="" disabled>
                    Choose file
                  </option>
                  {data.documents
                    .filter((d: any) => d.category === opened.kind)
                    .map((d: any) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {opened.mime === "application/pdf" ? (
              <iframe
                className="document-preview"
                title="Document preview"
                src={opened.url}
              />
            ) : opened.mime.startsWith("image/") ? (
              <img
                className="document-preview-image"
                src={opened.url}
                alt={opened.doc?.name || "Document"}
              />
            ) : (
              <div className="document-word-preview">
                <FileText size={50} />
                <p>
                  Download this Word document to open it in your document
                  editor.
                </p>
              </div>
            )}
          </>
        )}
      </Modal>
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete this document?"
        description={deleting?.name}
      >
        <button
          className="button danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await client()
                .storage.from("employee-documents")
                .remove([deleting.object_path]);
              if (r.error) throw r.error;
              await rpc("delete_profile_document", { p_id: deleting.id });
              refresh();
              setDeleting(null);
            } catch (e) {
              toast(errorMessage(e), "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          Delete file
        </button>
      </Modal>
    </section>
  );
}
