import { spawnSync } from "node:child_process";
const result = spawnSync(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "build",
    "--configLoader",
    "native",
    "--outDir",
    "dist-preview",
  ],
  { stdio: "inherit", env: { ...process.env, VITE_ENABLE_PREVIEW: "true" } },
);
process.exit(result.status ?? 1);
