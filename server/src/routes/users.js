import { Router } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/index.js";
import { ah, bad, notFound, isId, audit } from "../lib/util.js";
import { need } from "../lib/auth.js";
import { PERMS, ROLE_DEFAULTS, ALL_PERMS } from "../lib/perms.js";

const r = Router();
r.use(need("users.manage"));
r.get("/meta", (_q, res) => res.json({ groups: PERMS, roles: ROLE_DEFAULTS }));
r.get("/", ah(async (_q, res) => res.json(await User.find().sort({ createdAt: 1 }).lean())));

const clean = (b) => ({ name: String(b.name || "").trim(), phone: String(b.phone || ""), role: ["admin", "seller", "accountant"].includes(b.role) ? b.role : "seller", permissions: (b.permissions || ROLE_DEFAULTS[b.role] || []).filter((p) => ALL_PERMS.includes(p)) });

r.post("/", ah(async (req, res) => {
  const d = clean(req.body); const username = String(req.body.username || "").toLowerCase().trim();
  if (!d.name || !username) throw bad("Name and username are required", "NAME_REQUIRED");
  if (String(req.body.password || "").length < 6) throw bad("Password must be at least 6 characters", "WEAK_PASSWORD");
  if (await User.exists({ username })) throw bad("This username is taken", "USERNAME_TAKEN");
  const u = await User.create({ ...d, username, password: await bcrypt.hash(String(req.body.password), 10), mustChangePassword: true });
  await audit(req.user, "create", "users", u);
  res.status(201).json(u);
}));

r.put("/:id", ah(async (req, res) => {
  if (!isId(req.params.id)) throw notFound();
  const u = await User.findById(req.params.id); if (!u) throw notFound();
  const d = clean({ ...u.toObject(), ...req.body });
  if (String(u._id) === String(req.user._id) && (d.role !== "admin" || req.body.active === false)) throw bad("You cannot remove your own admin access", "SELF_LOCK");
  const before = { role: u.role, permissions: u.permissions, active: u.active };
  Object.assign(u, d);
  if (req.body.active !== undefined) u.active = !!req.body.active;
  if (req.body.password) { if (String(req.body.password).length < 6) throw bad("Password must be at least 6 characters", "WEAK_PASSWORD"); u.password = await bcrypt.hash(String(req.body.password), 10); u.mustChangePassword = true; }
  u.tokenVersion += 1; // force re-login so new permissions apply
  await u.save();
  await audit(req.user, "update", "users", u, { before, after: { role: u.role, permissions: u.permissions, active: u.active } });
  res.json(u);
}));
export default r;
