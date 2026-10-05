import { useState } from "react";
import { Plus, X, Code2, Palette, Cloud, PenTool } from "lucide-react";
import { Modal } from "../../components/ui";
const groups: Record<string, string[]> = {
  "UI / UX": [
    "Figma",
    "Adobe XD",
    "Sketch",
    "Prototyping",
    "User Research",
    "Wireframing",
  ],
  "Design tools": [
    "Photoshop",
    "Illustrator",
    "InDesign",
    "Canva",
    "CorelDraw",
  ],
  Development: [
    "JavaScript",
    "TypeScript",
    "React",
    "Python",
    "Java",
    "SQL",
    "Git",
  ],
  "Cloud & data": [
    "Supabase",
    "PostgreSQL",
    "AWS",
    "Azure",
    "Google Cloud",
    "Vercel",
  ],
  "Editing tools": [
    "Premiere Pro",
    "After Effects",
    "Final Cut Pro",
    "DaVinci Resolve",
  ],
  Marketing: ["Google Ads", "SEO", "Google Analytics", "HubSpot", "Mailchimp"],
};
export default function SkillsEditor({ initial }: { initial: string[] }) {
  const [text, setText] = useState(initial.join(", ")),
    [open, setOpen] = useState(false),
    [draft, setDraft] = useState<string[]>([]),
    [manual, setManual] = useState("");
  const values = Array.from(
    new Set(
      text
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
  const add = (value: string) => {
    const v = value.trim().slice(0, 80);
    if (v && !draft.some((s) => s.toLowerCase() === v.toLowerCase()))
      setDraft([...draft, v]);
    setManual("");
  };
  return (
    <>
      <label>
        Skills <span className="muted">Separate with commas</span>
        <textarea
          name="skills"
          maxLength={8000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className="skill-chips">
        {values.map((s, i) => (
          <span className="skill-chip" key={s}>
            {i % 3 === 0 ? (
              <Code2 size={14} />
            ) : i % 3 === 1 ? (
              <Palette size={14} />
            ) : (
              <Cloud size={14} />
            )}
            <span>{s}</span>
            <button
              type="button"
              aria-label={`Remove ${s}`}
              onClick={() => setText(values.filter((v) => v !== s).join(", "))}
            >
              <X size={13} />
            </button>
          </span>
        ))}
        <button
          type="button"
          className="skill-add"
          onClick={() => {
            setDraft(values);
            setOpen(true);
          }}
        >
          <Plus size={14} />
          Add skill
        </button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add skills"
        description="Choose your strengths or add a skill of your own."
        wide
      >
        <label>
          Manual entry
          <div className="skill-manual">
            <input
              value={manual}
              maxLength={80}
              placeholder="Type a skill and press Enter"
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  add(manual);
                }
              }}
            />
            <button
              className="button"
              type="button"
              onClick={() => add(manual)}
            >
              Add
            </button>
          </div>
        </label>
        {Object.entries(groups).map(([name, skills]) => (
          <section className="skill-group" key={name}>
            <h3>{name}</h3>
            <div className="skill-chips">
              {skills.map((skill) => (
                <button
                  type="button"
                  className="skill-chip"
                  aria-pressed={draft.includes(skill)}
                  key={skill}
                  onClick={() =>
                    draft.includes(skill)
                      ? setDraft(draft.filter((s) => s !== skill))
                      : add(skill)
                  }
                >
                  {skill}
                </button>
              ))}
            </div>
          </section>
        ))}
        <section className="skill-group">
          <h3>Selected skills</h3>
          <div className="skill-chips">
            {draft.map((s) => (
              <button
                type="button"
                className="skill-chip"
                key={s}
                onClick={() => setDraft(draft.filter((x) => x !== s))}
              >
                {s}
                <X size={13} />
              </button>
            ))}
          </div>
        </section>
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              setText(draft.join(", "));
              setOpen(false);
            }}
          >
            Apply skills
          </button>
        </div>
      </Modal>
    </>
  );
}
