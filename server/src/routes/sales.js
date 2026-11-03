import { Router } from "express";
import { Sale, Return, Warranty } from "../models/index.js";
import { ah, bad, notFound, isId, paginate, rx, range } from "../lib/util.js";
import { need } from "../lib/auth.js";
import { can } from "../lib/perms.js";
import { createSale, cancelSale, buildReturn, applyReturn } from "../services/sales.js";
import { audit } from "../lib/util.js";

const r = Router();
const permsOf = (u) => ({ discount: can(u, "sales.discount"), editPrice: can(u, "sales.editPrice"), approveReturn: can(u, "sales.approveReturn") });
const showCost = (u) => can(u, "products.viewCost") || can(u, "reports.profit");
const shape = (u) => (s) => { if (!showCost(u)) (s.items || []).forEach((i) => delete i.cost); return s; };

r.get("/", need("sales.view"), ah(async (req, res) => {
  const f = {};
  if (!can(req.user, "sales.viewAll")) f.user = req.user._id;
  else if (req.query.seller) f.user = req.query.seller;
  for (const k of ["status", "payType", "customer"]) if (req.query[k]) f[k] = req.query[k];
  if (req.query.due === "1") f.due = { $gt: 0 };
  if (req.query.from) { const { from, to } = range(req.query); f.date = { $gte: from, $lt: to }; }
  if (req.query.q) f.$or = [{ no: rx(req.query.q) }, { customerName: rx(req.query.q) }, { "items.imei": rx(req.query.q) }, { "items.name": rx(req.query.q) }];
  const q = Sale.find(f).populate("user", "name").populate("customer", "name phone");
  const out = await paginate(q, req, { sortable: ["date", "total", "no", "due"], defaultSort: "-date" });
  out.rows = out.rows.map(shape(req.user)); res.json(out);
}));

/* ── returns / exchanges (declared before /:id) ── */
r.get("/returns/list", need("sales.view", "sales.return"), ah(async (req, res) => {
  const f = {}; if (req.query.status) f.status = req.query.status; if (req.query.sale) f.sale = req.query.sale;
  const q = Return.find(f).populate("sale", "no").populate("user", "name").populate("customer", "name");
  res.json(await paginate(q, req, { sortable: ["date"], defaultSort: "-date" }));
}));
r.post("/returns", need("sales.return"), ah(async (req, res) => res.status(201).json(await buildReturn(req.body, req.user, permsOf(req.user)))));
r.post("/returns/:id/approve", need("sales.approveReturn"), ah(async (req, res) => {
  const ret = await Return.findById(req.params.id); if (!ret || ret.status !== "pending") throw bad("Return is not pending", "NOT_PENDING");
  res.json(await applyReturn(ret._id, req.user));
}));
r.post("/returns/:id/reject", need("sales.approveReturn"), ah(async (req, res) => {
  const ret = await Return.findById(req.params.id); if (!ret || ret.status !== "pending") throw bad("Return is not pending", "NOT_PENDING");
  ret.status = "rejected"; ret.approvedBy = req.user._id; ret.note = `${ret.note || ""} ${req.body.reason || ""}`.trim(); await ret.save();
  await audit(req.user, "reject-return", "returns", ret, { reason: req.body.reason });
  res.json(ret);
}));

r.get("/:id", need("sales.view"), ah(async (req, res) => {
  if (!isId(req.params.id)) throw notFound();
  const s = await Sale.findById(req.params.id).populate("user", "name").populate("customer", "name phone address").populate("account", "name").lean();
  if (!s) throw notFound("Invoice");
  if (!can(req.user, "sales.viewAll") && String(s.user._id) !== String(req.user._id)) throw notFound("Invoice");
  const returns = await Return.find({ sale: s._id }).sort({ date: 1 }).lean();
  const warranties = await Warranty.find({ sale: s._id }).lean();
  res.json({ ...shape(req.user)(s), returns, warranties });
}));

r.post("/", need("sales.create"), ah(async (req, res) => res.status(201).json(shape(req.user)(await createSale(req.body, req.user, permsOf(req.user))))));
r.post("/:id/cancel", need("sales.cancel"), ah(async (req, res) => res.json(await cancelSale(req.params.id, req.body.reason, req.user))));
export default r;
