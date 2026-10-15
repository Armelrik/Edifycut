import { spawn } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, chmodSync, renameSync } from "node:fs";
import { join } from "node:path";
const directory = process.argv[2], ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
let client, sdk, encoder, encoderClosed, finishing = false, paused = true, merging = false;
let baseSeconds = 0, baseBytes = 0, received = 0, run = 0, connectionTimer;
const notify = message => { if (process.connected) process.send(message); };
const progress = () => ({ seconds: baseSeconds + received / 64000, bytes: baseBytes + received });
const fragments = () => readdirSync(directory).filter(name => /^run-\d+\.txt$/.test(name)).sort().flatMap(name => readFileSync(join(directory, name), "utf8").split(/\r?\n/).filter(name => /^run-\d+-\d+\.wav$/.test(name)));
function encode() {
  run++;
  const prefix = "run-" + String(run).padStart(6, "0");
  const child = spawn(ffmpeg, ["-hide_banner", "-loglevel", "error", "-f", "s16le", "-ar", "32000", "-ac", "1", "-i", "pipe:0", "-c:a", "pcm_s16le", "-f", "segment", "-segment_time", "30", "-segment_list_type", "flat", "-segment_list", prefix + ".txt", prefix + "-%06d.wav"], { cwd: directory, stdio: ["pipe", "ignore", "pipe"] });
  encoder = child;
  child.stdin.on("error", () => { if (!paused && !finishing) void fail("Le flux vers FFmpeg a été interrompu."); });
  child.stderr.resume();
  encoderClosed = new Promise(resolve => {
    child.once("error", () => { resolve(); if (!finishing) void fail("FFmpeg n’est pas disponible sur le serveur."); });
    child.once("close", code => { resolve(); if (code && !paused && !finishing) void fail("L’encodage audio a été interrompu."); });
  });
}
async function closeEncoder() {
  const child = encoder; encoder = null;
  if (!child) return;
  child.stdin.end();
  const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
  await encoderClosed; clearTimeout(timer);
}
async function merge() {
  const files = fragments();
  if (!files.length) return false;
  notify({ status: "merging", ...progress() });
  writeFileSync(join(directory, "concat.txt"), files.map(name => "file '" + name + "'").join("\n"), { mode: 0o600 });
  await new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "1", "-i", "concat.txt", "-vn", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "audio-next.m4a"], { cwd: directory, stdio: "ignore" });
    const timer = setTimeout(() => child.kill("SIGKILL"), 180_000);
    child.once("error", () => { clearTimeout(timer); reject(new Error("FFmpeg ne peut pas assembler les fragments.")); });
    child.once("close", code => { clearTimeout(timer); if (code) reject(new Error("L’assemblage audio a échoué ; les fragments restent disponibles.")); else resolve(); });
  });
  chmodSync(join(directory, "audio-next.m4a"), 0o600);
  renameSync(join(directory, "audio-next.m4a"), join(directory, "audio.m4a"));
  notify({ output: true }); return true;
}
async function fail(error) {
  if (finishing) return;
  finishing = true; paused = true; clearTimeout(connectionTimer);
  try { client?.leave(); } catch { /* A disconnected SDK can already be released. */ }
  await closeEncoder(); notify({ status: "error", error, ...progress() }); process.exit(1);
}
async function stop() {
  if (finishing) return;
  finishing = true; paused = true; clearTimeout(connectionTimer);
  try { client?.leave(); } catch { /* Preserve already received audio on disconnection. */ }
  await closeEncoder();
  try { await merge(); notify({ status: "completed", ready: true, ...progress() }); process.exit(0); }
  catch (error) { notify({ status: "error", error: error.message, ...progress() }); process.exit(1); }
}
async function joinMeeting(payload) {
  sdk = (await import("@zoom/rtms")).default;
  client = new sdk.Client();
  if (!client.setAudioParams({ contentType: sdk.AudioContentType.RAW_AUDIO, codec: sdk.AudioCodec.L16, sampleRate: sdk.AudioSampleRate.SR_32K, channel: sdk.AudioChannel.MONO, dataOpt: sdk.AudioDataOption.AUDIO_MIXED_STREAM, duration: 20, frameSize: 640 })) throw new Error("Le SDK Zoom a refusé les paramètres audio PCM.");
  client.onAudioData((data, size) => {
    if (paused || finishing || !encoder) return;
    if (received === 0) { clearTimeout(connectionTimer); notify({ status: "recording", ready: true }); }
    if (encoder.stdin.writableLength > 8 * 1024 ** 2) { void fail("Le disque ne suit pas le débit audio. Les fragments finalisés sont conservés."); return; }
    const packet = Buffer.from(data.subarray(0, size));
    received += packet.length; encoder.stdin.write(packet);
    if (baseBytes + received >= 1024 ** 3) void stop();
  });
  client.onJoinConfirm(reason => { if (reason !== sdk.RTMS_SDK_OK) void fail("Zoom a refusé la connexion RTMS. Vérifiez les autorisations de l’application."); });
  client.onLeave(() => { if (!finishing) void stop(); });
  paused = false; encode();
  if (!client.join(payload)) throw new Error("Impossible de rejoindre le flux autorisé Zoom.");
  connectionTimer = setTimeout(() => void fail("Aucun audio reçu de Zoom depuis 60 secondes."), 60_000);
}
let queue = Promise.resolve();
process.on("message", message => {
  queue = queue.then(async () => {
    if (message.action === "join" || message.action === "prepare") {
      baseSeconds = message.seconds || 0; baseBytes = message.bytes || 0;
      run = Math.max(0, ...readdirSync(directory).map(name => Number(/^run-(\d+)\.txt$/.exec(name)?.[1]) || 0));
      if (message.action === "join") await joinMeeting(message.payload);
      return;
    }
    if (finishing) return;
    if (message.action === "stop") { await stop(); return; }
    if (message.action === "pause" || message.action === "merge") {
      clearTimeout(connectionTimer);
      paused = true; await closeEncoder();
      if (message.action === "merge") { merging = true; await merge(); merging = false; }
      if (!client) { finishing = true; notify({ status: "completed", ready: true, ...progress() }); process.exit(0); }
      notify({ status: "paused", ready: true, ...progress() }); return;
    }
    if (message.action === "resume") {
      if (!client) throw new Error("Le flux Zoom n’est plus connecté.");
      encode(); paused = false; notify({ status: "recording", ready: true, ...progress() });
      if (!received) connectionTimer = setTimeout(() => void fail("Aucun audio reçu de Zoom depuis 60 secondes."), 60_000);
    }
  }).catch(error => void fail(error.message || "Le récepteur Zoom est indisponible."));
});
setInterval(() => { if (!finishing && !merging) notify(progress()); }, 5000);
process.on("disconnect", () => void stop());
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
