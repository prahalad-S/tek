export const recordingMimeTypes = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
];

export function recordingMime(supports: (mime: string) => boolean): string | undefined {
  return recordingMimeTypes.find(supports);
}

export function recordingName(mime: string, date = new Date()): string {
  const extension = mime.startsWith("video/mp4") ? "mp4" : "webm";
  return `tekzenit-screen-${date.toISOString().replaceAll(":", "-").replace(/\.\d+Z$/, "Z")}.${extension}`;
}

export function elapsedLabel(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  return `${hours ? `${String(hours).padStart(2, "0")}:` : ""}${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function stopStream(stream: Pick<MediaStream, "getTracks"> | null): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
}
