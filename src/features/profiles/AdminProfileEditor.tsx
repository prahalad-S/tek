import { useProfileManagement } from "../../lib/useProfileManagement";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../../app/providers";
import { client } from "../../lib/supabase";
import { rpc } from "../../lib/api";
import { extendedProfile, previewExtended } from "../../lib/profiles";
import { previewEmployees } from "../../lib/preview";
import type { Employee } from "../../lib/types";
import { errorMessage } from "../../lib/domain";
import {
  Avatar,
  PageHeader,
  Loading,
  ErrorState,
  EmptyState,
  useToast,
} from "../../components/ui";
import PhotoCrop from "../../components/PhotoCrop";
import ProfileEditor from "./ProfileEditor";
import MapPosition from "./MapPosition";
import ProfileDetails from "./ProfileDetails";
export default function AdminProfileEditor({ id }: { id: string }) {
  const { member, preview, refresh } = useAuth();
  const management = useProfileManagement();
  const qc = useQueryClient(),
    toast = useToast();
  const [busy, setBusy] = useState(false),
    [photo, setPhoto] = useState<File | null>(null);
  const base = preview ? "/preview" : "";
  const q = useQuery({
    queryKey: ["admin-profile", id, preview],
    enabled: management.hasScope,
    queryFn: async () => {
      const e = preview
        ? previewEmployees.find((e) => e.id === id)
        : await (async () => {
            const r = await client()
              .from("employees")
              .select("*,departments(name)")
              .eq("id", id)
              .single();
            if (r.error) throw r.error;
            return r.data as Employee;
          })();
      if (!e) throw Error("Employee not found.");
      if (!management.canManage(e))
        throw Error("This employee is outside your assigned location.");
      const data = preview
        ? previewExtended(e)
        : await extendedProfile(e, true);
      return { employee: e, data };
    },
  });
  const departments = useQuery({
    queryKey: ["admin-departments", preview],
    enabled: management.hasScope,
    queryFn: async () => {
      if (preview) return [];
      const r = await client()
        .from("departments")
        .select("id,name")
        .order("name");
      if (r.error) throw r.error;
      return r.data;
    },
  });
  async function reload() {
    await Promise.all(
      [
        "directory-all",
        "people-directory",
        "extended-profile",
        "private-profile",
        "admin-profile",
        "access",
        "map-directory",
      ].map((key) => qc.invalidateQueries({ queryKey: [key] })),
    );
    await refresh();
  }
  if (management.pending) return <Loading />;
  if (!management.hasScope)
    return (
      <EmptyState
        title="Profile editing unavailable"
        description="Only administrators or assigned location editors can edit this profile."
      />
    );
  if (q.isPending) return <Loading />;
  if (q.error)
    return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  const { employee: e, data } = q.data;
  return (
    <>
      <PageHeader
        eyebrow="EMPLOYEE ADMINISTRATION"
        title={`Edit ${e.full_name}`}
        description="Update employee details, professional history and documents."
        actions={
          <Link
            className="button secondary"
            to={`${base}/people?person=${e.id}`}
          >
            View profile
          </Link>
        }
      />
      {photo && (
        <PhotoCrop
          file={photo}
          onClose={() => setPhoto(null)}
          onSave={async (file) => {
            if (preview) {
              toast("Preview: photo is not saved.");
              return;
            }
            const path = `${e.user_id || e.id}/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
            const result = await client()
              .storage.from("avatars")
              .upload(path, file, { contentType: file.type });
            if (result.error) throw result.error;
            try {
              await rpc("admin_set_employee_avatar", {
                p_employee: e.id,
                p_path: path,
              });
            } catch (error) {
              await client().storage.from("avatars").remove([path]);
              throw error;
            }
            await reload();
            toast("Employee photo updated.");
          }}
        />
      )}
      <section className="panel">
        <form
          className="panel-form"
          key={e.id + q.dataUpdatedAt}
          onSubmit={async (event) => {
            event.preventDefault();
            if (preview) {
              toast("Preview: employee changes are not saved.");
              return;
            }
            const f = new FormData(event.currentTarget);
            setBusy(true);
            try {
              await rpc("admin_update_employee", {
                p_employee: e.id,
                p_name: f.get("name"),
                p_code: f.get("code"),
                p_title: f.get("title"),
                p_department: management.admin
                  ? f.get("department") || null
                  : e.department_id,
                p_location: f.get("location"),
                p_bio: e.bio || "",
                p_phone: f.get("phone") || "",
                p_address: f.get("address") || "",
              });
              await reload();
              toast("Employee profile updated.");
            } catch (error) {
              toast(errorMessage(error), "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="row-actions">
            <Avatar person={e} size="large" />
            <label className="button secondary upload-button">
              Change employee photo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) {
                    if (
                      file.size > 10485760 ||
                      !["image/jpeg", "image/png", "image/webp"].includes(
                        file.type,
                      )
                    ) {
                      toast("Choose a JPG, PNG or WebP under 10 MB.", "error");
                      return;
                    }
                    setPhoto(file);
                  }
                }}
              />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Full name
              <input
                name="name"
                defaultValue={e.full_name}
                required
                maxLength={120}
              />
            </label>
            <label>
              Employee code
              <input
                name="code"
                defaultValue={e.employee_code || ""}
                maxLength={32}
              />
            </label>
            <label>
              Work email
              <input value={e.email} disabled readOnly />
              <small>Sign-in identity is managed through Supabase Auth.</small>
            </label>
            <label>
              Title
              <input name="title" defaultValue={e.title} maxLength={120} />
            </label>
            <label>
              Department
              <select
                name="department"
                defaultValue={e.department_id || ""}
                disabled={
                  !management.admin ||
                  departments.isPending ||
                  !!departments.error
                }
              >
                <option value="">Not assigned</option>
                {preview && e.department_id && (
                  <option value={e.department_id}>{e.departments?.name}</option>
                )}
                {departments.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Location
              <input
                name="location"
                readOnly={!management.admin}
                defaultValue={e.location}
                maxLength={160}
              />
            </label>
            <label>
              Phone
              <input
                name="phone"
                defaultValue={data.privateDetails?.phone || ""}
                maxLength={40}
              />
            </label>
            <label>
              Address
              <textarea
                name="address"
                defaultValue={data.privateDetails?.address || ""}
                maxLength={2000}
              />
            </label>
          </div>
          {departments.error && (
            <ErrorState
              error={departments.error}
              retry={() => void departments.refetch()}
            />
          )}
          <div className="form-actions">
            <button
              className="button"
              disabled={busy || departments.isPending || !!departments.error}
            >
              Save employee details
            </button>
          </div>
        </form>
      </section>
      <section className="panel spaced-panel">
        <MapPosition
          employee={e}
          address={data.privateDetails?.address || ""}
        />
        <ProfileEditor employee={e} />
      </section>
      <section className="panel spaced-panel">
        <ProfileDetails employee={e} />
      </section>
    </>
  );
}
