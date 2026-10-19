import { themeOptions } from "../app/themes";
import { useSearchParams } from "react-router-dom";
import AdminProfileEditor from "./profiles/AdminProfileEditor";
import MapPosition from "./profiles/MapPosition";
import PhotoCrop from "../components/PhotoCrop";
import ProfileEditor from "./profiles/ProfileEditor";
import ProfileDetails from "./profiles/ProfileDetails";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  LockKeyhole,
  Save,
  Check,
  Mail,
  UserRound,
} from "lucide-react";
import { useAuth, useTheme } from "../app/providers";
import { client } from "../lib/supabase";
import { rpc, upload } from "../lib/api";
import { errorMessage } from "../lib/domain";
import { Avatar, PageHeader, Badge, useToast } from "../components/ui";
export default function Profile() {
  const [params] = useSearchParams();
  const employee = params.get("employee");
  return employee ? <AdminProfileEditor id={employee} /> : <OwnProfile />;
}
function OwnProfile() {
  const { profile, preview, refresh } = useAuth();
  const { theme, setTheme } = useTheme();
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  const details = useQuery({
    queryKey: ["private-profile", profile?.user_id],
    queryFn: async () => {
      if (preview) return { phone: "", address: "" };
      const { data, error } = await client()
        .from("employee_private_details")
        .select("*")
        .eq("user_id", profile!.user_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });
  if (!profile) return null;
  return (
    <>
      {cropFile && (
        <PhotoCrop
          file={cropFile}
          onClose={() => setCropFile(null)}
          onSave={async (file) => {
            if (preview) {
              toast("Preview: cropped photo is not saved.");
              return;
            }
            await upload(file, profile.user_id!, "avatar");
            await refresh();
            await Promise.all(
              [
                "directory-all",
                "people-directory",
                "extended-profile",
                "map-directory",
              ].map((key) => qc.invalidateQueries({ queryKey: [key] })),
            );
            toast("Profile photo updated.");
          }}
        />
      )}
      <PageHeader
        eyebrow="MAKE YOURSELF AT HOME"
        title="Your profile"
        description="A little about you. A better way to connect."
      />
      <div className="profile-layout">
        <aside className="panel profile-summary">
          <div className="profile-cover" />
          <div className="profile-summary-body">
            <Avatar person={profile} size="hero" />
            <h2>{profile.full_name}</h2>
            <p>
              {profile.title ||
                "Your title will be assigned by your administrator"}
            </p>
            <Badge tone="purple">
              {profile.departments?.name || "Team member"}
            </Badge>
            <div className="profile-detail">
              <Mail size={16} />
              {profile.email}
            </div>
            <label className="button secondary upload-button">
              <Camera size={16} />
              {busy ? "Uploading…" : "Change photo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  e.target.value = "";
                  if (
                    !["image/jpeg", "image/png", "image/webp"].includes(
                      file.type,
                    ) ||
                    file.size > 10485760
                  ) {
                    toast("Choose a JPG, PNG or WebP under 10 MB.", "error");
                    return;
                  }
                  setCropFile(file);
                }}
              />
            </label>
            <small>JPG, PNG or WebP. Up to 2 MB.</small>
          </div>
          <div className="profile-security">
            <LockKeyhole size={18} />
            <p>
              Your email is your sign-in identity.
              <br />
              Your employee code is a profile detail.
            </p>
          </div>
        </aside>
        <div>
          <section className="panel" id="private-details">
            <div className="panel-heading">
              <div>
                <h2>Personal information</h2>
                <p>Complete your details whenever you’re ready.</p>
              </div>
              <UserRound size={20} />
            </div>
            <form
              key={profile.id + String(details.data?.updated_at)}
              className="panel-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (preview) {
                  toast(
                    "Preview only. No personal information has been saved.",
                  );
                  return;
                }
                setBusy(true);
                const f = new FormData(e.currentTarget);
                try {
                  await rpc("update_my_profile", {
                    p_name: f.get("name"),
                    p_code: f.get("code"),
                    p_location: f.get("location"),
                    p_bio: f.get("bio"),
                    p_phone: f.get("phone"),
                    p_address: f.get("address"),
                  });
                  await refresh();
                  await Promise.all(
                    [
                      "directory-all",
                      "people-directory",
                      "extended-profile",
                      "private-profile",
                    ].map((key) => qc.invalidateQueries({ queryKey: [key] })),
                  );
                  let message = "Your profile is up to date.";
                  if (
                    String(f.get("address") || "") !==
                    String(details.data?.address || "")
                  ) {
                    await qc.invalidateQueries({ queryKey: ["map-directory"] });
                    await qc.invalidateQueries({ queryKey: ["my-map-pin"] });
                    if (String(f.get("address") || "").trim()) {
                      const mapped =
                        await client().functions.invoke("geocode-profile");
                      if (mapped.error)
                        message =
                          "Profile saved. Set your map position manually while automatic lookup is unavailable.";
                      else {
                        await qc.invalidateQueries({
                          queryKey: ["map-directory"],
                        });
                        await qc.invalidateQueries({
                          queryKey: ["my-map-pin"],
                        });
                      }
                    }
                  }
                  toast(message);
                } catch (e) {
                  toast(errorMessage(e), "error");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="form-grid">
                <label>
                  Full name
                  <input
                    name="name"
                    defaultValue={profile.full_name}
                    required
                    maxLength={120}
                  />
                </label>
                <label>
                  Employee code <span className="optional">Optional</span>
                  <input
                    name="code"
                    defaultValue={profile.employee_code || ""}
                    maxLength={32}
                    placeholder="Add your employee code"
                  />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Work email
                  <input type="email" value={profile.email} disabled readOnly />
                </label>
                <label>
                  Location
                  <input
                    name="location"
                    defaultValue={profile.location}
                    maxLength={160}
                    placeholder="City, country or Remote"
                  />
                </label>
              </div>
              <input type="hidden" name="bio" value={profile.bio || ""} />
              <div className="private-heading">
                <LockKeyhole size={16} />
                <strong>Private details</strong>
                <span>Visible only to you</span>
              </div>
              <div className="form-grid">
                <label>
                  Phone
                  <input
                    name="phone"
                    type="tel"
                    defaultValue={details.data?.phone || ""}
                    maxLength={40}
                  />
                </label>
                <label>
                  Address
                  <input
                    name="address"
                    defaultValue={details.data?.address || ""}
                    maxLength={1000}
                  />
                </label>
              </div>
              {details.error && (
                <p role="alert" className="field-error">
                  Could not load your private details. Refresh before saving.
                </p>
              )}
              <div className="form-actions">
                <span className="muted">
                  Roles and departments are managed by your administrator.
                </span>
                <button
                  className="button"
                  disabled={busy || details.isPending || !!details.error}
                >
                  <Save size={16} />
                  {busy ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </section>
          <section className="panel spaced-panel">
            <MapPosition address={details.data?.address || ""} />
            <ProfileEditor employee={profile} />
          </section>
          <section className="panel spaced-panel">
            <ProfileDetails employee={profile} />
          </section>
          <section className="panel appearance-panel">
            <div className="panel-heading">
              <div>
                <h2>Make it feel like you</h2>
                <p>Choose a look that fits your day.</p>
              </div>
            </div>
            <div className="theme-options">
              {[...themeOptions.map(option => option.value), "system"].map((t) => (
                <button
                  key={t}
                  className={`theme-option ${theme === t ? "selected" : ""}`}
                  onClick={() => setTheme(t)}
                >
                  <span className={`theme-swatch swatch-${t}`}>
                    <i />
                    <b />
                    <b />
                    <b />
                  </span>
                  <span>
                    {themeOptions.find(option => option.value === t)?.label || "System"}
                    {theme === t && <Check size={16} />}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
