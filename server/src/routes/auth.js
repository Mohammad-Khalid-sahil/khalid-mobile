import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { User, Settings } from "../models/index.js";
import { ah, bad, HttpError, audit } from "../lib/util.js";
import { authenticate, sign } from "../lib/auth.js";
import { ROLE_DEFAULTS, ALL_PERMS } from "../lib/perms.js";

const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { message: "Too many attempts. Try again later.", code: "RATE_LIMIT" } });

export const publicUser = (u) => ({
  id: u._id, name: u.name, username: u.username, role: u.role, phone: u.phone, lang: u.lang, mustChangePassword: u.mustChangePassword,
  permissions: u.role === "admin" ? ALL_PERMS : u.permissions,
});

r.get("/public", ah(async (_req, res) => {
  const s = await Settings.findOne({ key: "main" }).lean();
  res.json({ shopName: s?.shopName || "Khalid Mobile", logo: s?.logo || "" });
}));

r.post("/login", limiter, ah(async (req, res) => {
  const username = String(req.body.username || "").toLowerCase().trim();
  const u = await User.findOne({ username }).select("+password");
  const ok = u && (await bcrypt.compare(String(req.body.password || ""), u.password));
  if (!ok) throw new HttpError(401, "Wrong username or password", "BAD_LOGIN");
  if (!u.active) throw new HttpError(403, "This account is disabled", "ACCOUNT_DISABLED");
  u.lastLogin = new Date(); await u.save();
  await audit(u, "login", "auth", u);
  res.json({ token: sign(u), user: publicUser(u) });
}));

r.get("/me", authenticate, (req, res) => res.json(publicUser(req.user)));

r.put("/me", authenticate, ah(async (req, res) => {
  const { name, phone, lang } = req.body;
  if (name !== undefined) { if (!String(name).trim()) throw bad("Name is required", "NAME_REQUIRED"); req.user.name = String(name).trim(); }
  if (phone !== undefined) req.user.phone = String(phone);
  if (["fa", "ps", "en"].includes(lang)) req.user.lang = lang;
  await req.user.save(); res.json(publicUser(req.user));
}));

r.post("/change-password", authenticate, ah(async (req, res) => {
  const u = await User.findById(req.user._id).select("+password");
  if (!(await bcrypt.compare(String(req.body.current || ""), u.password))) throw bad("Current password is wrong", "BAD_PASSWORD");
  const np = String(req.body.password || "");
  if (np.length < 6) throw bad("Password must be at least 6 characters", "WEAK_PASSWORD");
  u.password = await bcrypt.hash(np, 10); u.mustChangePassword = false; u.tokenVersion += 1; await u.save();
  await audit(u, "change-password", "auth", u);
  res.json({ token: sign(u), user: publicUser(u) });
}));

r.post("/logout", authenticate, ah(async (req, res) => { req.user.tokenVersion += 1; await req.user.save(); res.json({ ok: true }); }));

export default r;
