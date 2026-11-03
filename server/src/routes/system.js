import express, { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { Settings, Audit, BackupLog, User } from "../models/index.js";
import { ah, bad, paginate, rx, range, audit } from "../lib/util.js";
import { need, adminOnly } from "../lib/auth.js";
import { createBackup, inspectBackup, restoreBackup, backupDir, safePath } from "../services/backup.js";

/* ── settings ── */
export const settings = Router();
const KEYS = ["shopName", "address", "phone", "logo", "currency", "currencySymbol", "calendar", "receiptWidth", "receiptNote", "warrantyTerms", "invoicePrefix", "modules", "rules", "expenseCategories", "autoBackup"];
settings.get("/", ah(async (_req, res) => res.json((await Settings.findOne({ key: "main" }).lean()) || (await Settings.create({ key: "main" })).toObject())));
settings.put("/", need("settings.manage"), ah(async (req, res) => {
  const s = (await Settings.findOne({ key: "main" })) || new Settings({ key: "main" });
  if (req.body.logo && String(req.body.logo).length > 600000) throw bad("Logo is too large (max ~400 KB)", "FILE_TOO_LARGE");
  const before = s.toObject();
  for (const k of KEYS) if (req.body[k] !== undefined) { s[k] = req.body[k]; s.markModified(k); }
  await s.save();
  await audit(req.user, "update", "settings", { _id: s._id, no: "settings" }, { before: { rules: before.rules, modules: before.modules }, after: { rules: s.rules, modules: s.modules } });
  res.json(s);
}));

/* ── audit log ── */
export const auditRouter = Router();
auditRouter.get("/", need("audit.view"), ah(async (req, res) => {
  const f = {}; for (const k of ["module", "action", "user"]) if (req.query[k]) f[k] = req.query[k];
  if (req.query.from) { const { from, to } = range(req.query); f.at = { $gte: from, $lt: to }; }
  if (req.query.q) f.$or = [{ refNo: rx(req.query.q) }, { reason: rx(req.query.q) }, { userName: rx(req.query.q) }];
  res.json(await paginate(Audit.find(f), req, { sortable: ["at"], defaultSort: "-at" }));
}));

/* ── backup ── */
export const backup = Router();
backup.use(need("backup.manage"));
backup.get("/", ah(async (req, res) => {
  const logs = await BackupLog.find().sort({ at: -1 }).limit(100).populate("user", "name").lean();
  const files = fs.readdirSync(backupDir()).filter((f) => f.endsWith(".json.gz")).map((f) => ({ file: f, size: fs.statSync(path.join(backupDir(), f)).size, at: fs.statSync(path.join(backupDir(), f)).mtime })).sort((a, b) => b.at - a.at);
  res.json({ logs, files });
}));
backup.post("/create", ah(async (req, res) => { const b = await createBackup(req.user, { note: req.body.note || "manual" }); await audit(req.user, "backup", "backup", { _id: b._id, no: b.file }); res.status(201).json(b); }));
backup.get("/download/:file", ah(async (req, res) => { const p = safePath(req.params.file); res.download(p, req.params.file); }));
backup.post("/upload", express.raw({ type: "*/*", limit: "200mb" }), ah(async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw bad("Empty file", "INVALID_FILE");
  const name = `uploaded-${Date.now()}.json.gz`;
  fs.writeFileSync(path.join(backupDir(), name), req.body, { mode: 0o600 });
  try { res.status(201).json({ file: name, ...(await inspectBackup(name)) }); } catch (e) { fs.unlinkSync(path.join(backupDir(), name)); throw e; }
}));
backup.get("/inspect/:file", ah(async (req, res) => res.json(await inspectBackup(req.params.file))));
backup.post("/restore", adminOnly, ah(async (req, res) => {
  const u = await User.findById(req.user._id).select("+password");
  if (!(await bcrypt.compare(String(req.body.password || ""), u.password))) throw bad("Wrong password", "BAD_PASSWORD");
  if (req.body.confirm !== "RESTORE") throw bad("Confirmation is required", "CONFIRM_REQUIRED");
  const out = await restoreBackup(req.body.file, req.user);
  res.json(out);
}));
