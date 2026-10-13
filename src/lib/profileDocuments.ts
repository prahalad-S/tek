import type { ResumeStyle } from "./resumeStyles";
import { personalExportRows } from "./profileExportDetails";
import type { Employee } from "./types";
import type { ExtendedProfile } from "./profiles";
import { signedUrl } from "./api";
import { initials } from "./domain";
type Kind = "id_card" | "business_card" | "resume";
function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function portrait(e: Employee, preview: boolean) {
  if (!e.avatar_path || preview) return null;
  const response = await fetch(await signedUrl("avatars", e.avatar_path));
  if (!response.ok)
    throw new Error("Your profile photo could not be loaded. Please retry.");
  const blob = await response.blob();
  return createImageBitmap(blob);
}
function sections(
  e: Employee,
  p: ExtendedProfile,
  kind: Kind,
  includePrivate = false,
) {
  const rows: [string, string][] = [
    ["Tekzenit", e.full_name],
    [e.title, e.departments?.name || ""],
    ["Contact", `${e.email}\n${e.location}`],
    ["Employee code", e.employee_code || "Not added"],
  ];
  if (kind !== "resume") return rows;
  if (p.profile.website?.trim())
    rows.push(["Website", p.profile.website.trim()]);
  rows.push(
    ["Professional summary", p.profile.summary || e.bio],
    ["Skills", p.skills.join(" · ")],
  );
  for (const r of p.experience)
    rows.push([
      `${r.role} · ${r.company}`,
      `${r.start_date || "Dates not provided"} — ${r.end_date || "Present"}\n${r.description}`,
    ]);
  for (const r of p.education)
    rows.push([
      r.qualification,
      `${r.institution}\n${[r.start_year, r.end_year].filter(Boolean).join(" – ")}`,
    ]);
  for (const r of p.achievements)
    rows.push([
      `${r.kind}: ${r.title}`,
      r.description + (r.url ? "\n" + r.url : ""),
    ]);
  rows.push(["Languages", p.profile.languages.join(", ")]);
  const personal = personalExportRows(p, includePrivate);
  if (personal.length)
    rows.push([
      "Personal information",
      personal.map(([label, value]) => `${label}: ${value}`).join("\n"),
    ]);
  return rows;
}
export async function downloadProfileDocument(
  e: Employee,
  p: ExtendedProfile,
  kind: Kind,
  format: "pdf" | "docx",
  preview = false,
  onBlob?: (blob: Blob) => void,
  includePrivate = false,
  resumeStyle?: ResumeStyle,
  onPreview?: (image:string)=>void,
) {
  await document.fonts.ready;
  const photo = await portrait(e, preview);
  const filename = `Tekzenit-${e.full_name.replace(/[^\p{L}\p{N}]+/gu, "-")}-${kind}.${format}`;
  const rows = sections(e, p, kind, includePrivate);
  const emit = (blob: Blob, name: string) =>
    onBlob ? onBlob(blob) : save(blob, name);
  if (format === "docx") {
    const { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel } =
      await import("docx");
    const children: any[] = [
      new Paragraph({
        children: [
          new TextRun({
            text: "TEKZENIT / PEOPLE",
            color: "7255BD",
            size: 18,
            characterSpacing: 30,
          }),
        ],
        spacing: { after: 260 },
      }),
      new Paragraph({
        text:
          kind === "resume"
            ? e.full_name
            : kind.replaceAll("_", " ").toUpperCase(),
        heading: HeadingLevel.TITLE,
      }),
    ];
    if (photo) {
      const c = document.createElement("canvas");
      c.width = 200;
      c.height = 200;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(photo, 0, 0, 200, 200);
      const blob = await new Promise<Blob>((resolve) =>
        c.toBlob((b) => resolve(b!), "image/png"),
      );
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              data: new Uint8Array(await blob.arrayBuffer()),
              type: "png",
              transformation: { width: 90, height: 90 },
            }),
          ],
        }),
      );
    }
    if (kind === "resume")
      children.push(
        new Paragraph({
          text: [e.title, e.departments?.name].filter(Boolean).join(" · "),
          spacing: { after: 360 },
        }),
      );
    for (const [title, body] of kind === "resume" ? rows.slice(2) : rows) {
      if (title)
        children.push(
          new Paragraph({
            text: title,
            heading: HeadingLevel.HEADING_2,
            keepNext: true,
            spacing: { before: 320, after: 140 },
          }),
        );
      for (const line of body.split("\n"))
        children.push(
          new Paragraph({
            children: [new TextRun({ text: line, color: "505968", size: 22 })],
            spacing: { after: 120 },
          }),
        );
    }
    if (preview)
      children.push(
        new Paragraph({
          text: "Fictional design preview — not an issued employee document.",
        }),
      );
    emit(
      await Packer.toBlob(
        new Document({
          styles: {
            default: {
              document: {
                run: { font: "Calibri", size: 22, color: "253044" },
                paragraph: { spacing: { line: 300, after: 140 } },
              },
              title: {
                run: { font: "Calibri", size: 44, bold: true, color: "202938" },
                paragraph: { spacing: { after: 160 } },
              },
            },
            paragraphStyles: [
              {
                id: "Heading2",
                name: "Heading 2",
                basedOn: "Normal",
                next: "Normal",
                quickFormat: true,
                run: { size: 22, bold: true, color: "7255BD" },
                paragraph: {
                  keepNext: true,
                  spacing: { before: 320, after: 140 },
                },
              },
            ],
          },
          sections: [
            {
              properties: {
                page: {
                  margin: { top: 1000, right: 1100, bottom: 1000, left: 1100 },
                },
              },
              children,
            },
          ],
        }),
      ),
      filename,
    );
    photo?.close();
    return;
  }
  if (kind === "resume") {
    if(resumeStyle) {
      const {styledResumePdf}=await import("./resumeStyles");
      emit(await styledResumePdf(e,p,photo,preview,resumeStyle,includePrivate,onPreview),filename.replace(".pdf",`-${resumeStyle}.pdf`));
    } else {
      const { resumePdf } = await import("./resumePdf");
      emit(await resumePdf(e, p, photo, preview, includePrivate), filename);
    }
    photo?.close();
    return;
  }
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${e.full_name} — ${kind.replaceAll("_", " ")}`);
  pdf.setAuthor("Tekzenit");
  const width =
    kind === "business_card" ? 1000 : kind === "id_card" ? 640 : 1240;
  const height =
    kind === "business_card" ? 572 : kind === "id_card" ? 1014 : 1754;
  const margin = 50;
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let y = 0;
  const pages: HTMLCanvasElement[] = [];
  function newPage() {
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#7154d6";
    ctx.fillRect(0, 0, width, 14);
    ctx.font = '700 38px "Inter Variable", sans-serif';
    ctx.fillStyle = "#252734";
    ctx.fillText("Tekzenit", margin, 75);
    ctx.font = '16px "Inter Variable", sans-serif';
    ctx.fillStyle = "#606879";
    ctx.fillText(kind.replaceAll("_", " ").toUpperCase(), margin, 108);
    y = 155;
    pages.push(canvas);
  }
  newPage();
  if (photo) {
    const size = kind === "business_card" ? 100 : 190;
    const crop = Math.min(photo.width, photo.height);
    ctx!.drawImage(
      photo,
      (photo.width - crop) / 2,
      (photo.height - crop) / 2,
      crop,
      crop,
      kind === "business_card" ? width - margin - size : margin,
      y,
      size,
      size,
    );
    if (kind !== "business_card") y += size + 30;
  } else if (kind === "id_card") {
    ctx!.fillStyle = "#f0ebfc";
    ctx!.fillRect(margin, y, 190, 190);
    ctx!.fillStyle = "#7154d6";
    ctx!.font = '600 65px "Inter Variable", sans-serif';
    ctx!.fillText(initials(e.full_name), margin + 35, y + 120);
    y += 220;
  }
  function line(text: string, bold = false) {
    const size = kind === "resume" ? (bold ? 28 : 23) : bold ? 30 : 24;
    ctx.font = `${bold ? "600" : "400"} ${size}px "Inter Variable", sans-serif`;
    const maxWidth =
      width - margin * 2 - (kind === "business_card" && photo ? 150 : 0);
    const words = text.split(/\s+/).flatMap((word) => {
      const parts: string[] = [];
      let chunk = "";
      for (const character of Array.from(word)) {
        if (chunk && ctx.measureText(chunk + character).width > maxWidth) {
          parts.push(chunk);
          chunk = character;
        } else chunk += character;
      }
      if (chunk) parts.push(chunk);
      return parts;
    });
    let current = "";
    const wrapped: string[] = [];
    for (const word of words) {
      if (ctx.measureText(current + " " + word).width > maxWidth && current) {
        wrapped.push(current);
        current = word;
      } else current += (current ? " " : "") + word;
    }
    if (current) wrapped.push(current);
    for (const textLine of wrapped) {
      if (y + size * 1.6 > height - 65) newPage();
      ctx.font = `${bold ? "600" : "400"} ${size}px "Inter Variable", sans-serif`;
      ctx.fillStyle = bold ? "#252734" : "#606879";
      ctx.fillText(textLine, margin, y);
      y += size * 1.5;
    }
  }

  line(e.full_name, true);
  line(e.title);
  line(e.departments?.name || "");
  y += 12;
  line(kind === "id_card" ? `ID · ${e.employee_code || "Pending"}` : e.email);
  if (kind === "id_card") line(e.email);
  line(e.location);
  if (preview) {
    ctx!.font = "16px sans-serif";
    ctx!.fillText(
      "DESIGN PREVIEW · NOT AN ISSUED DOCUMENT",
      margin,
      height - 30,
    );
  }
  for (const c of pages) {
    const png = await pdf.embedPng(c.toDataURL("image/png"));
    const dimensions: [number, number] =
      kind === "id_card" ? [153.07, 242.65] : [252, 144];
    const page = pdf.addPage(dimensions);
    page.drawImage(png, {
      x: 0,
      y: 0,
      width: dimensions[0],
      height: dimensions[1],
    });
  }
  const bytes = await pdf.save();
  emit(
    new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
    filename,
  );
  photo?.close();
}
