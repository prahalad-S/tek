export function uploadWithProgress(
  file: Blob,
  url: string,
  token: string,
  publishableKey: string,
  mime: string,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", publishableKey);
    xhr.setRequestHeader("Content-Type", mime);
    xhr.timeout = 180000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    const done = (error?: Error) => {
      signal.removeEventListener("abort", abort);
      error ? reject(error) : resolve();
    };
    xhr.onload = () =>
      done(
        xhr.status >= 200 && xhr.status < 300
          ? undefined
          : new Error(
              `Upload failed (${xhr.status}). Check your connection and workspace access.`,
            ),
      );
    xhr.onerror = () =>
      done(new Error("Upload connection failed. Please retry."));
    xhr.ontimeout = () => done(new Error("Upload timed out. Please retry."));
    xhr.onabort = () => done(new Error("Upload cancelled."));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      done(new Error("Upload cancelled."));
      return;
    }
    xhr.send(file);
  });
}
