import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import mongoose from "mongoose";
import { EJSON } from "bson";
import { BackupLog } from "../models/index.js";
import { bad } from "../lib/util.js";

export const backupDir = () => { const d = path.resolve(process.env.BACKUP_DIR || "./backups"); fs.mkdirSync(d, { recursive: true, mode: 0o700 }); return d; };
const SAFE = /^[\w.-]+\.json\.gz$/;
export const safePath = (file) => { if (!SAFE.test(file || "")) throw bad("Invalid file name", "INVALID_FILE"); const p = path.join(backupDir(), file); if (!fs.existsSync(p)) throw bad("Backup file not found", "NOT_FOUND"); return p; };
const stamp = () => new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
const MODELS = () => Object.entries(mongoose.models).filter(([n]) => n !== "BackupLog");

export async function createBackup(user, { prefix = "backup", note = "" } = {}) {
  const data = {}, counts = {};
  for (const [name, M] of MODELS()) {
    const q = M.find(); if (name === "User") q.select("+password");
    const docs = await q.lean(); data[name] = docs; counts[name] = docs.length;
  }
  const json = EJSON.stringify({ app: "khalid-mobile", version: 2, createdAt: new Date(), counts, data }, { relaxed: false });
  const gz = zlib.gzipSync(Buffer.from(json));
  const file = `${prefix}-${stamp()}.json.gz`;
  fs.writeFileSync(path.join(backupDir(), file), gz, { mode: 0o600 });
  const log = await BackupLog.create({ type: "backup", file, size: gz.length, ok: true, note, counts, user: user?._id });
  return log.toObject();
}

export function readBackup(file) {
  const raw = fs.readFileSync(safePath(file));
  let doc;
  try { doc = EJSON.parse(zlib.gunzipSync(raw).toString("utf8"), { relaxed: false }); } catch { throw bad("This file is not a valid backup", "INVALID_BACKUP"); }
  if (doc?.app !== "khalid-mobile" || !doc.data || typeof doc.data !== "object") throw bad("This file is not a valid backup", "INVALID_BACKUP");
  return doc;
}

export async function inspectBackup(file) {
  const doc = readBackup(file);
  const current = {}; for (const [name, M] of MODELS()) current[name] = await M.estimatedDocumentCount();
  const unknown = Object.keys(doc.data).filter((k) => !mongoose.models[k]);
  if (!doc.data.User?.length) throw bad("Backup has no users; restoring it would lock everyone out", "INVALID_BACKUP");
  return { createdAt: doc.createdAt, version: doc.version, counts: doc.counts, current, unknown };
}

/** Replaces ALL data with the backup. A safety backup of the current data is taken first. */
export async function restoreBackup(file, user) {
  const doc = readBackup(file);
  await inspectBackup(file);
  const safety = await createBackup(user, { prefix: "pre-restore", note: `before restoring ${file}` });
  try {
    for (const [name, M] of MODELS()) {
      const docs = doc.data[name] || [];
      await M.collection.deleteMany({});
      if (docs.length) await M.collection.insertMany(docs, { ordered: false });
    }
  } catch (e) {
    await BackupLog.create({ type: "restore", file, ok: false, note: e.message, user: user?._id });
    throw bad(`Restore failed (${e.message}). Your previous data is saved in ${safety.file}`, "RESTORE_FAILED");
  }
  const counts = {}; for (const [name] of MODELS()) counts[name] = (doc.data[name] || []).length;
  const log = await BackupLog.create({ type: "restore", file, ok: true, note: `safety backup: ${safety.file}`, counts, user: user?._id });
  return { ...log.toObject(), safety: safety.file };
}

export async function autoBackupTick() {
  const last = await BackupLog.findOne({ type: "backup", ok: true }).sort({ at: -1 });
  if (last && Date.now() - last.at.getTime() < 24 * 3600 * 1000) return;
  await createBackup(null, { prefix: "auto", note: "scheduled" });
  const files = fs.readdirSync(backupDir()).filter((f) => f.startsWith("auto-")).sort();
  for (const f of files.slice(0, Math.max(0, files.length - 30))) fs.unlinkSync(path.join(backupDir(), f));
}
