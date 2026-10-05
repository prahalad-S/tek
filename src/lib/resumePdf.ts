import { personalExportRows } from "./profileExportDetails";
import type { Employee } from "./types";
import type { ExtendedProfile } from "./profiles";
export async function resumePdf(
  e: Employee,
  p: ExtendedProfile,
  photo: ImageBitmap | null,
  preview: boolean,
  includePrivate = false,
) {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const pages: HTMLCanvasElement[] = [];
  let ctx: CanvasRenderingContext2D,
    y = 0;
  const width = 1240,
    height = 1754,
    left = 84,
    body = 104,
    right = 1156;
  function page(first = false) {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    pages.push(c);
    ctx.fillStyle = "#787686";
    ctx.font = '500 17px "Inter Variable",sans-serif';
    ctx.fillText(
      first ? "TEKZENIT / PROFESSIONAL PROFILE" : e.full_name + " / CONTINUED",
      left,
      70,
    );
    y = first ? 140 : 135;
  }
  function wrapped(
    value: string,
    size: number,
    x: number,
    max: number,
    bold = false,
    color = "#363945",
  ) {
    ctx.font = `${bold ? "600" : "400"} ${size}px "Inter Variable",sans-serif`;
    const lines: string[] = [];
    let current = "";
    for (const word of String(value || "").split(/\s+/)) {
      for (const chunk of word.match(
        new RegExp(
          ".{1," + Math.max(8, Math.floor(max / (size * 0.6))) + "}",
          "gu",
        ),
      ) || []) {
        if (current && ctx.measureText(current + " " + chunk).width > max) {
          lines.push(current);
          current = chunk;
        } else current += (current ? " " : "") + chunk;
      }
    }
    if (current) lines.push(current);
    for (const line of lines) {
      if (y + size * 1.6 > height - 105) page();
      ctx.font = `${bold ? "600" : "400"} ${size}px "Inter Variable",sans-serif`;
      ctx.fillStyle = color;
      ctx.fillText(line, x, y);
      y += size * 1.5;
    }
  }
  function section(label: string, render: () => void) {
    if (y > height - 220) page();
    ctx.strokeStyle = "#e9e8ef";
    ctx.beginPath();
    ctx.moveTo(left, y - 26);
    ctx.lineTo(right, y - 26);
    ctx.stroke();
    ctx.font = '600 16px "Inter Variable",sans-serif';
    ctx.fillStyle = "#7255bd";
    ctx.fillStyle = "#f5f3fb";
    ctx.fillRect(left, y - 22, right - left, 44);
    ctx.fillStyle = "#7255bd";
    ctx.fillText(label.toUpperCase(), left + 20, y + 5);
    y += 60;
    render();
    y += 62;
  }
  page(true);
  wrapped(e.full_name, 52, left, photo ? 850 : 1070, true, "#212330");
  wrapped(e.title || "Professional profile", 27, left, 900, false, "#686477");
  y += 7;
  wrapped(
    [e.departments?.name, e.location].filter(Boolean).join(" · "),
    20,
    left,
    900,
    false,
    "#777583",
  );
  wrapped(e.email, 20, left, 900, false, "#777583");
  if (p.profile.website?.trim())
    wrapped(p.profile.website.trim(), 20, left, 900, false, "#7255bd");
  if (photo) {
    const size = 126,
      crop = Math.min(photo.width, photo.height);
    ctx!.save();
    ctx!.beginPath();
    ctx!.arc(1080, 160, size / 2, 0, Math.PI * 2);
    ctx!.clip();
    ctx!.drawImage(
      photo,
      (photo.width - crop) / 2,
      (photo.height - crop) / 2,
      crop,
      crop,
      1017,
      97,
      size,
      size,
    );
    ctx!.restore();
  }
  y = Math.max(y + 65, 350);
  const summary = p.profile.summary || e.bio;
  if (summary)
    section("Profile", () => wrapped(summary, 23, body, right - body));
  if (p.skills.length)
    section("Expertise", () =>
      wrapped(p.skills.join("  ·  "), 22, body, right - body, false, "#555163"),
    );
  if (p.experience.length)
    section("Experience", () => {
      p.experience.forEach((r, i) => {
        if (i) y += 34;
        wrapped(r.role || "Role", 26, body, right - body, true);
        wrapped(
          [
            r.company,
            [r.start_date, r.end_date || "Present"].filter(Boolean).join(" — "),
          ]
            .filter(Boolean)
            .join("  ·  "),
          19,
          body,
          right - body,
          false,
          "#777583",
        );
        if (r.description) {
          y += 8;
          wrapped(r.description, 22, body, right - body);
        }
      });
    });
  if (p.education.length)
    section("Education", () => {
      p.education.forEach((r, i) => {
        if (i) y += 32;
        wrapped(r.qualification, 25, body, right - body, true);
        wrapped(
          [
            r.institution,
            [r.start_year, r.end_year].filter(Boolean).join(" — "),
          ]
            .filter(Boolean)
            .join(" · "),
          21,
          body,
          right - body,
          false,
          "#777583",
        );
      });
    });
  if (p.achievements.length)
    section("Selected work", () => {
      p.achievements.forEach((r, i) => {
        if (i) y += 34;
        wrapped(r.title, 24, body, right - body, true);
        if (r.description) wrapped(r.description, 22, body, right - body);
        if (r.url) wrapped(r.url, 18, body, right - body, false, "#7255bd");
      });
    });
  if (p.profile.languages.length)
    section("Languages", () =>
      wrapped(p.profile.languages.join(" · "), 22, body, right - body),
    );
  const personal = personalExportRows(p, includePrivate);
  if (personal.length)
    section("Personal information", () => {
      for (const [label, value] of personal) {
        if (y > height - 210) page();
        wrapped(label, 17, body, right - body, true, "#777583");
        wrapped(value, 22, body, right - body);
        y += 16;
      }
    });
  for (const [i, c] of pages.entries()) {
    const context = c.getContext("2d")!;
    context.font = '16px "Inter Variable",sans-serif';
    context.fillStyle = "#96929f";
    context.fillText(
      preview ? "FICTIONAL DESIGN PREVIEW" : e.full_name,
      left,
      height - 50,
    );
    context.fillText(`${i + 1} / ${pages.length}`, right - 55, height - 50);
    const png = await pdf.embedPng(c.toDataURL("image/png"));
    pdf
      .addPage([595.28, 841.89])
      .drawImage(png, { x: 0, y: 0, width: 595.28, height: 841.89 });
  }
  pdf.setTitle(e.full_name + " — Resume");
  return new Blob([new Uint8Array(await pdf.save())], {
    type: "application/pdf",
  });
}
