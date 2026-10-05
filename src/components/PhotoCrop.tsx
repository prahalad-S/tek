import { useEffect, useRef, useState } from "react";
import { Crop, ZoomIn, ZoomOut, RotateCcw, RotateCw } from "lucide-react";
import { Modal, useToast } from "./ui";
export default function PhotoCrop({
  file,
  onClose,
  onSave,
}: {
  file: File;
  onClose: () => void;
  onSave: (file: File) => Promise<void>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    preview = useRef<HTMLCanvasElement>(null),
    image = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false),
    [zoom, setZoom] = useState(1),
    [angle, setAngle] = useState(0),
    [square, setSquare] = useState(true),
    [box, setBox] = useState({ x: 70, y: 70, w: 260, h: 260 }),
    [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    const url = URL.createObjectURL(file),
      img = new Image();
    img.onload = () => {
      image.current = img;
      setLoaded(true);
    };
    img.onerror = () => toast("Unable to open this image.", "error");
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!loaded || !canvas.current || !image.current) return;
    const c = canvas.current,
      ctx = c.getContext("2d")!,
      img = image.current;
    ctx.clearRect(0, 0, 400, 400);
    ctx.fillStyle = "#e9e9ef";
    ctx.fillRect(0, 0, 400, 400);
    ctx.save();
    ctx.translate(200, 200);
    ctx.rotate((angle * Math.PI) / 180);
    const scale = Math.min(400 / img.width, 400 / img.height) * zoom;
    ctx.drawImage(
      img,
      (-img.width * scale) / 2,
      (-img.height * scale) / 2,
      img.width * scale,
      img.height * scale,
    );
    ctx.restore();
    const p = preview.current?.getContext("2d");
    p?.clearRect(0, 0, 160, 160);
    const side = Math.min(box.w, box.h);
    p?.drawImage(
      c,
      box.x + (box.w - side) / 2,
      box.y + (box.h - side) / 2,
      side,
      side,
      0,
      0,
      160,
      160,
    );
  }, [loaded, zoom, angle, box]);
  function drag(e: React.PointerEvent, resize = false) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const original = { ...box },
      x = e.clientX,
      y = e.clientY,
      scale = 400 / (canvas.current?.getBoundingClientRect().width || 400);
    const target = e.currentTarget;
    const move = (event: Event) => {
      const p = event as PointerEvent,
        dx = (p.clientX - x) * scale,
        dy = (p.clientY - y) * scale;
      if (resize) {
        const w = Math.max(60, Math.min(400 - original.x, original.w + dx));
        const h = square
          ? Math.min(w, 400 - original.y)
          : Math.max(60, Math.min(400 - original.y, original.h + dy));
        setBox({ ...original, w: square ? h : w, h });
      } else
        setBox({
          ...original,
          x: Math.max(0, Math.min(400 - original.w, original.x + dx)),
          y: Math.max(0, Math.min(400 - original.h, original.y + dy)),
        });
    };
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Crop profile photo"
      description="Drag the crop area or its corner. Adjust zoom, rotation and aspect ratio."
      wide
    >
      <div className="crop-layout">
        <div className="crop-stage">
          <canvas ref={canvas} width={400} height={400} />
          <div
            className="crop-box"
            style={{
              left: box.x / 4 + "%",
              top: box.y / 4 + "%",
              width: box.w / 4 + "%",
              height: box.h / 4 + "%",
            }}
            onPointerDown={(e) => drag(e)}
          >
            <span className="crop-grid" />
            <button
              type="button"
              aria-label="Resize crop area"
              onPointerDown={(e) => {
                e.stopPropagation();
                drag(e, true);
              }}
            />
          </div>
        </div>
        <div className="crop-controls">
          <h3>Crop preview</h3>
          <canvas
            className="crop-preview"
            ref={preview}
            width={160}
            height={160}
          />
          <div className="row-actions">
            <button
              className="icon-button"
              aria-label="Zoom in"
              onClick={() => setZoom(Math.min(4, zoom + 0.1))}
            >
              <ZoomIn />
            </button>
            <button
              className="icon-button"
              aria-label="Zoom out"
              onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
            >
              <ZoomOut />
            </button>
            <button
              className="icon-button"
              aria-label="Rotate left"
              onClick={() => setAngle(angle - 90)}
            >
              <RotateCcw />
            </button>
            <button
              className="icon-button"
              aria-label="Rotate right"
              onClick={() => setAngle(angle + 90)}
            >
              <RotateCw />
            </button>
          </div>
          <label>
            Zoom
            <input
              type="range"
              min="0.5"
              max="4"
              step="0.1"
              value={zoom}
              onChange={(e) => setZoom(+e.target.value)}
            />
          </label>
          <div className="row-actions">
            <button
              className="button secondary"
              aria-pressed={square}
              onClick={() => {
                setSquare(true);
                setBox((b) => ({
                  ...b,
                  w: Math.min(b.w, b.h),
                  h: Math.min(b.w, b.h),
                }));
              }}
            >
              1:1 Square
            </button>
            <button
              className="button secondary"
              aria-pressed={!square}
              onClick={() => setSquare(false)}
            >
              Free
            </button>
          </div>
          <label>
            Crop horizontal position
            <input
              type="range"
              min="0"
              max={400 - box.w}
              value={box.x}
              onChange={(e) => setBox({ ...box, x: +e.target.value })}
            />
          </label>
          <label>
            Crop vertical position
            <input
              type="range"
              min="0"
              max={400 - box.h}
              value={box.y}
              onChange={(e) => setBox({ ...box, y: +e.target.value })}
            />
          </label>
          <label>
            Crop size
            <input
              type="range"
              min="60"
              max={Math.min(400 - box.x, 400 - box.y)}
              value={Math.min(box.w, box.h)}
              onChange={(e) =>
                setBox({
                  ...box,
                  w: +e.target.value,
                  h: square ? +e.target.value : box.h,
                })
              }
            />
          </label>
        </div>
      </div>
      <div className="form-actions">
        <button className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button"
          disabled={!loaded || busy}
          onClick={async () => {
            setBusy(true);
            try {
              const output = document.createElement("canvas");
              output.width = 600;
              output.height = Math.round((600 * box.h) / box.w);
              output
                .getContext("2d")!
                .drawImage(
                  canvas.current!,
                  box.x,
                  box.y,
                  box.w,
                  box.h,
                  0,
                  0,
                  output.width,
                  output.height,
                );
              const blob = await new Promise<Blob>((resolve, reject) =>
                output.toBlob(
                  (b) =>
                    b ? resolve(b) : reject(Error("Image export failed")),
                  "image/jpeg",
                  0.92,
                ),
              );
              await onSave(
                new File([blob], "profile.jpg", { type: "image/jpeg" }),
              );
              onClose();
            } catch (e) {
              toast(
                e instanceof Error ? e.message : "Photo could not be saved.",
                "error",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <Crop size={16} />
          {busy ? "Saving…" : "Confirm & save"}
        </button>
      </div>
    </Modal>
  );
}
