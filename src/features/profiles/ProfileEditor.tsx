import { personalChoices } from "../../lib/employeeDetails";
import SkillsEditor from "./SkillsEditor";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Save } from "lucide-react";
import { useAuth } from "../../app/providers";
import {
  extendedProfile,
  previewExtended,
  type ExtendedProfile,
  type CareerItem,
  type EducationItem,
  type Achievement,
} from "../../lib/profiles";
import { rpc } from "../../lib/api";
import { errorMessage } from "../../lib/domain";
import type { Employee } from "../../lib/types";
import { Loading, ErrorState, useToast } from "../../components/ui";
export default function ProfileEditor({ employee }: { employee: Employee }) {
  const { preview } = useAuth();
  const q = useQuery({
    queryKey: ["extended-profile", employee.id, preview, true],
    queryFn: () =>
      preview
        ? Promise.resolve(previewExtended(employee))
        : extendedProfile(employee, true),
  });
  return q.isPending ? (
    <Loading />
  ) : q.error ? (
    <ErrorState error={q.error} />
  ) : (
    <Editor
      key={employee.id + q.dataUpdatedAt}
      employee={employee}
      data={q.data}
      preview={preview}
    />
  );
}
function Editor({
  employee,
  data,
  preview,
}: {
  employee: Employee;
  data: ExtendedProfile;
  preview: boolean;
}) {
  const [career, setCareer] = useState(data.experience);
  const [education, setEducation] = useState(data.education);
  const [achievements, setAchievements] = useState(data.achievements);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  const changeCareer = (i: number, key: keyof CareerItem, value: string) =>
    setCareer((rows) =>
      rows.map((r, n) => (n === i ? { ...r, [key]: value } : r)),
    );
  const changeEducation = (
    i: number,
    key: keyof EducationItem,
    value: string,
  ) =>
    setEducation((rows) =>
      rows.map((r, n) => (n === i ? { ...r, [key]: value } : r)),
    );
  const changeAchievement = (
    i: number,
    key: keyof Achievement,
    value: string,
  ) =>
    setAchievements((rows) =>
      rows.map((r, n) => (n === i ? { ...r, [key]: value } : r)),
    );
  return (
    <form
      className="panel-form extended-profile-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        if (preview) {
          toast("Design preview: profile changes are not saved.");
          return;
        }
        const f = new FormData(event.currentTarget);
        setBusy(true);
        try {
          await rpc("save_extended_profile", {
            p_employee: employee.id,
            p_profile: {
              joined_on: f.get("joined_on"),
              employment_status: f.get("employment_status"),
              languages: String(f.get("languages"))
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean),
              summary: f.get("summary"),
              website: f.get("website"),
            },
            p_experience: career,
            p_education: education,
            p_achievements: achievements,
            p_skills: String(f.get("skills"))
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
            p_private: Object.fromEntries(
              [
                "dob",
                "gender",
                "marital_status",
                "blood_group",
                "home_number",
                "pan",
                "aadhaar",
              ].map((k) => [k, f.get(k)]),
            ),
          });
          await qc.invalidateQueries({
            queryKey: ["extended-profile", employee.id],
          });
          await Promise.all(
            ["people-directory", "directory-all"].map((key) =>
              qc.invalidateQueries({ queryKey: [key] }),
            ),
          );
          toast("Your complete profile is saved.");
        } catch (error) {
          toast(errorMessage(error), "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Your professional story</h2>
      <label>
        Professional summary
        <textarea
          name="summary"
          defaultValue={data.profile.summary}
          maxLength={8000}
          rows={4}
        />
      </label>
      <SkillsEditor initial={data.skills} />
      <div className="form-grid">
        <label>
          Joined on
          <input
            name="joined_on"
            type="date"
            defaultValue={data.profile.joined_on || ""}
          />
        </label>
        <label>
          Employment status
          <input
            name="employment_status"
            defaultValue={data.profile.employment_status}
          />
        </label>
        <label>
          Languages
          <input
            name="languages"
            defaultValue={data.profile.languages.join(", ")}
            placeholder="English, Telugu…"
          />
        </label>
        <label>
          Website
          <input
            name="website"
            type="url"
            defaultValue={data.profile.website}
          />
        </label>
      </div>
      <div className="editor-section-title">
        <h3>Experience</h3>
        <button
          type="button"
          className="button secondary small"
          onClick={() =>
            setCareer([
              ...career,
              {
                company: "",
                role: "",
                start_date: "",
                end_date: "",
                description: "",
              },
            ])
          }
        >
          <Plus size={14} />
          Add experience
        </button>
      </div>
      {career.map((r, i) => (
        <fieldset key={i}>
          <legend>Experience {i + 1}</legend>
          <div className="form-grid">
            {(["company", "role", "start_date", "end_date"] as const).map(
              (key) => (
                <label key={key}>
                  {key.replaceAll("_", " ")}
                  <input
                    type={key.includes("date") ? "date" : "text"}
                    value={r[key] || ""}
                    required={key === "company" || key === "role"}
                    onChange={(e) => changeCareer(i, key, e.target.value)}
                  />
                </label>
              ),
            )}
          </div>
          <label>
            Description
            <textarea
              value={r.description}
              onChange={(e) => changeCareer(i, "description", e.target.value)}
            />
          </label>
          <button
            type="button"
            className="button secondary small"
            onClick={() => setCareer(career.filter((_, n) => n !== i))}
          >
            <Trash2 size={14} />
            Remove experience
          </button>
        </fieldset>
      ))}
      <div className="editor-section-title">
        <h3>Education</h3>
        <button
          type="button"
          className="button secondary small"
          onClick={() =>
            setEducation([
              ...education,
              {
                institution: "",
                qualification: "",
                start_year: "",
                end_year: "",
              },
            ])
          }
        >
          <Plus size={14} />
          Add education
        </button>
      </div>
      {education.map((r, i) => (
        <fieldset key={i}>
          <legend>Education {i + 1}</legend>
          <div className="form-grid">
            {(
              [
                "institution",
                "qualification",
                "start_year",
                "end_year",
              ] as const
            ).map((key) => (
              <label key={key}>
                {key.replaceAll("_", " ")}
                <input
                  type={key.includes("year") ? "number" : "text"}
                  value={r[key] || ""}
                  required={!key.includes("year")}
                  onChange={(e) => changeEducation(i, key, e.target.value)}
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            className="button secondary small"
            onClick={() => setEducation(education.filter((_, n) => n !== i))}
          >
            Remove education
          </button>
        </fieldset>
      ))}
      <div className="editor-section-title">
        <h3>Projects, awards & certifications</h3>
        <button
          type="button"
          className="button secondary small"
          onClick={() =>
            setAchievements([
              ...achievements,
              { kind: "project", title: "", description: "", url: "" },
            ])
          }
        >
          <Plus size={14} />
          Add item
        </button>
      </div>
      {achievements.map((r, i) => (
        <fieldset key={i}>
          <legend>Item {i + 1}</legend>
          <label>
            Type
            <select
              value={r.kind}
              onChange={(e) => changeAchievement(i, "kind", e.target.value)}
            >
              <option value="project">Project</option>
              <option value="award">Award</option>
              <option value="certification">Certification</option>
            </select>
          </label>
          <label>
            Title
            <input
              value={r.title}
              required
              onChange={(e) => changeAchievement(i, "title", e.target.value)}
            />
          </label>
          <label>
            Description
            <textarea
              value={r.description}
              onChange={(e) =>
                changeAchievement(i, "description", e.target.value)
              }
            />
          </label>
          <label>
            Link
            <input
              type="url"
              value={r.url}
              onChange={(e) => changeAchievement(i, "url", e.target.value)}
            />
          </label>
          <button
            type="button"
            className="button secondary small"
            onClick={() =>
              setAchievements(achievements.filter((_, n) => n !== i))
            }
          >
            Remove item
          </button>
        </fieldset>
      ))}
      <h3>Private personal details</h3>
      <p className="muted">
        You, administrators and your assigned location editors can read these
        fields. They are excluded from shared profile exports.
      </p>
      <div className="form-grid">
        {[
          "dob",
          "gender",
          "marital_status",
          "blood_group",
          "home_number",
          "pan",
          "aadhaar",
        ].map((key) => (
          <label key={key}>
            {key === "dob" ? "Date of birth" : key.replaceAll("_", " ")}
            {personalChoices[key] ? (
              <select
                name={key}
                defaultValue={data.privateDetails?.[key] || ""}
              >
                <option value="">Not specified</option>
                {data.privateDetails?.[key] &&
                  !personalChoices[key].includes(data.privateDetails[key]) && (
                    <option>{data.privateDetails[key]}</option>
                  )}
                {personalChoices[key].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            ) : (
              <input
                name={key}
                type={key === "dob" ? "date" : "text"}
                defaultValue={data.privateDetails?.[key] || ""}
                maxLength={80}
              />
            )}
          </label>
        ))}
      </div>
      <div className="form-actions">
        <button className="button" disabled={busy}>
          <Save size={16} />
          {busy ? "Saving…" : "Save complete profile"}
        </button>
      </div>
    </form>
  );
}
