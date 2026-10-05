import { useState } from "react";
import {
  Phone,
  MapPin,
  CalendarDays,
  UserRound,
  Heart,
  Droplet,
  ShieldCheck,
  Eye,
  EyeOff,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../app/providers";
export default function PrivateInformation({
  details,
  owner,
}: {
  details: Record<string, string>;
  owner: boolean;
}) {
  const { preview } = useAuth();
  const [reveal, setReveal] = useState(false);
  const birthday =
    details.birth_month && details.birth_day
      ? new Date(
          2000,
          Number(details.birth_month) - 1,
          Number(details.birth_day),
        ).toLocaleDateString("en-US", { month: "long", day: "numeric" }) +
        " (year not supplied)"
      : "";
  details = { ...details, dob: details.dob || birthday };
  const fields = [
    ["phone", "Primary phone", Phone],
    ["work_phone", "Work phone", Phone],
    ["phone_extension", "Extension", Phone],
    ["address", "Residential address", MapPin],
    ["dob", "Date of birth", CalendarDays],
    ["gender", "Gender", UserRound],
    ["marital_status", "Marital status", Heart],
    ["blood_group", "Blood group", Droplet],
    ["home_number", "Home / alternate phone", Phone],
    ["pan", "PAN number", ShieldCheck],
    ["aadhaar", "Aadhaar number", ShieldCheck],
  ] as const;
  const complete = fields.filter(([key]) => details[key]?.trim()).length;
  return (
    <section className="profile-section private-profile">
      <h3>
        <ShieldCheck size={18} />
        Private information
      </h3>
      <p className="muted">
        This employee, administrators and assigned location editors can view
        these details.
      </p>
      <div className="private-completeness">
        <span>
          Record completeness:{" "}
          <strong>{Math.round((complete / fields.length) * 100)}%</strong> (
          {complete} of {fields.length})
        </span>
        <progress max={fields.length} value={complete} />
        {owner && (
          <Link to={(preview ? "/preview" : "") + "/profile#private-details"}>
            Complete {fields.length - complete} pending
          </Link>
        )}
      </div>
      <div className="private-grid">
        {fields.map(([key, label, Icon]) => (
          <article className="private-detail-card" key={key}>
            <div>
              <Icon size={16} />
              <span>{label}</span>
              {["pan", "aadhaar"].includes(key) && (
                <button
                  className="icon-button"
                  aria-label={
                    reveal
                      ? "Hide personal identifiers"
                      : "Reveal personal identifiers"
                  }
                  onClick={() => setReveal(!reveal)}
                >
                  {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              )}
            </div>
            <div>
              <strong>
                {details[key]
                  ? ["pan", "aadhaar"].includes(key) && !reveal
                    ? "•••• " + details[key].slice(-4)
                    : details[key]
                  : "Not added"}
              </strong>
              {owner && !details[key] && (
                <Link
                  className="button secondary small"
                  to={(preview ? "/preview" : "") + "/profile#private-details"}
                >
                  + Add
                </Link>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
