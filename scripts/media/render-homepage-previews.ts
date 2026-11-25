/** Local frame receiver for the original WebGL renderer. Run with the dev server. */
import { createServer } from "node:http";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import type { HomepageData } from "../../src/visualization/homepage-data";

const readme = process.argv.includes("--readme");
const root = path.resolve(readme ? ".publication/readme-preview-frames" : ".publication/homepage-preview-frames");
const output = path.resolve(readme ? ".publication/readme-preview-output" : ".publication/homepage-preview-output");
const data: HomepageData = JSON.parse(await fs.readFile("public/homepage-data.json", "utf8"));
const ids = new Set(data.clips.map(clip => clip.id));
await fs.mkdir(output, { recursive: true });
// Vite transforms HTML entry points from the project root, not public/.
const recorderPage = path.resolve(readme ? "_record-readme-previews.html" : "_record-home-previews.html");
await fs.copyFile(new URL("./homepage-preview-recorder.html", import.meta.url), recorderPage);
const run = (args: string[]) => new Promise<void>((resolve, reject) => {
  const child = spawn("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
  child.on("error", reject);
  child.on("exit", code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
});
let completed = 0;
const server = createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", process.env.PREVIEW_ORIGIN ?? "http://127.0.0.1:5173");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (request.method === "OPTIONS") { response.end(); return; }
  try {
    if (readme && request.url === "/readme-plan.json") {
      response.setHeader("Content-Type", "application/json");
      response.end(await fs.readFile(process.argv.includes("--variant2") ? ".publication/homepage-preview-input/variant-2-readme-plan.json" : ".publication/readme-preview-plan.json")); return;
    }
    if (request.url === "/variant-2.json") {
      response.setHeader("Content-Type", "application/json");
      response.end(await fs.readFile(".publication/homepage-preview-input/variant-2.json")); return;
    }
    if (request.url === "/variant-2-flock.json") {
      response.setHeader("Content-Type", "application/json");
      response.end(await fs.readFile(".publication/homepage-preview-input/variant-2-flock.json")); return;
    }
    if (request.url === "/flock.json") {
      response.setHeader("Content-Type", "application/json");
      response.end(await fs.readFile(".publication/homepage-preview-input/flock.json")); return;
    }
    const icon = /^\/icon\/(blue-car-left|chicken|population-formation)$/.exec(request.url ?? "");
    if(request.method === "POST" && icon) {
      const chunks: Buffer[]=[]; let size=0;
      for await (const chunk of request) {
        size+=chunk.length; if(size>2_000_000) throw new Error("Icon exceeds limit"); chunks.push(chunk);
      }
      const directory=path.join(output,"icons"); await fs.mkdir(directory,{recursive:true});
      await fs.writeFile(path.join(directory,`${icon[1]}.png`),Buffer.concat(chunks));
      response.end("ok"); return;
    }
    const match = /^\/(frame|finish)\/([a-z0-9-]+)(?:\/(\d{5}))?$/.exec(request.url ?? "");
    if (request.method !== "POST" || !match || !ids.has(match[2])) { response.writeHead(404).end(); return; }
    const [, operation, id, frame] = match;
    const directory = path.join(root, id);
    if (operation === "frame" && frame) {
      // A fresh recording must never leave stale frames from a longer old clip.
      if (frame === "00000") await fs.rm(directory, { recursive: true, force: true });
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 2_000_000) throw new Error("Frame exceeds limit");
        chunks.push(chunk);
      }
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, `${frame}.jpg`), Buffer.concat(chunks));
    } else if (operation === "finish") {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk);
      const timing = JSON.parse(Buffer.concat(chunks).toString());
      if (timing.fps !== 15 || (readme && timing.speed !== 1)) throw new Error("Invalid recording timing");
      if (timing.speed === "auto" && !timing.completed) throw new Error("Auto recording must include the complete replay");
      await fs.writeFile(`${output}/${id}.json`, JSON.stringify(timing, null, 2) + "\n");
      await run(["-framerate", "15", "-i", `${directory}/%05d.jpg`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "25", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${output}/${id}.mp4`]);
      const files = await fs.readdir(directory);
      const posterFrame = id.endsWith("-main") ? 0 : Math.min(files.length - 1,
        id === "binary-road-progress" ? 75 : id === "initial-population" || id === "early-five-generations" ? 35 : 180);
      await run(["-i", `${directory}/${String(posterFrame).padStart(5, "0")}.jpg`, "-frames:v", "1", "-q:v", "3", `${output}/${id}.jpg`]);
      console.log(`${id}: ${files.length} frames encoded (${++completed}/${ids.size})`);
    }
    response.end("ok");
  } catch (error) { console.error(error); response.writeHead(500).end(String(error)); }
});
server.listen(8883, "127.0.0.1", () => console.log(`${readme ? "README" : "Homepage"} frame receiver: http://127.0.0.1:8883`));
const stop = async () => {
  await fs.rm(recorderPage, { force: true });
  server.close(() => process.exit(0));
};
process.on("SIGINT", () => { void stop(); });
process.on("SIGTERM", () => { void stop(); });
