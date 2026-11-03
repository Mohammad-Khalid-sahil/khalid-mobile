import { Router } from "express";
import { Purchase } from "../models/index.js";
import { ah, notFound, isId, paginate, rx, range, audit, bad } from "../lib/util.js";
import { need } from "../lib/auth.js";
import { can } from "../lib/perms.js";
import { createPurchase, cancelPurchase } from "../services/purchases.js";

const r = Router();
r.get("/", need("purchases.view"), ah(async (req, res) => {
  const f = {}; for (const k of ["status", "supplier", "payType"]) if (req.query[k]) f[k] = req.query[k];
  if (req.query.due === "1") f.due = { $gt: 0 };
  if (req.query.from) { const { from, to } = range(req.query); f.date = { $gte: from, $lt: to }; }
  if (req.query.q) f.$or = [{ no: rx(req.query.q) }, { billNo: rx(req.query.q) }, { sellerName: rx(req.query.q) }, { "items.name": rx(req.query.q) }];
  const q = Purchase.find(f).populate("supplier", "name").populate("user", "name");
  res.json(await paginate(q, req, { sortable: ["date", "total", "no", "due"], defaultSort: "-date" }));
}));
r.get("/:id", need("purchases.view"), ah(async (req, res) => {
  if (!isId(req.params.id)) throw notFound();
  const p = await Purchase.findById(req.params.id).populate("supplier", "name phone").populate("user", "name").populate("items.units", "imei1 imei2 serial status").lean();
  if (!p) throw notFound("Purchase"); res.json(p);
}));
r.post("/", need("purchases.create"), ah(async (req, res) => res.status(201).json(await createPurchase(req.body, req.user, { allowDuplicate: req.user.role === "admin" }))));
/** Only metadata can be edited; item/price changes require cancel + re-entry so stock and money stay consistent. */
r.patch("/:id", need("purchases.create"), ah(async (req, res) => {
  const p = await Purchase.findById(req.params.id); if (!p || p.status === "cancelled") throw notFound("Purchase");
  if (!String(req.body.reason || "").trim()) throw bad("A reason is required", "REASON_REQUIRED");
  const before = { billNo: p.billNo, note: p.note }; if (req.body.billNo !== undefined) p.billNo = req.body.billNo; if (req.body.note !== undefined) p.note = req.body.note;
  await p.save(); await audit(req.user, "edit", "purchases", p, { before, after: { billNo: p.billNo, note: p.note }, reason: req.body.reason }); res.json(p);
}));
r.post("/:id/cancel", need("purchases.cancel"), ah(async (req, res) => res.json(await cancelPurchase(req.params.id, req.body.reason, req.user))));
export default r;
