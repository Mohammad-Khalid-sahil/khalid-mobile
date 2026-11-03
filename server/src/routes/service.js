import { Router } from "express";
import { Warranty, WarrantyClaim, Repair, Product } from "../models/index.js";
import { ah, bad, notFound, isId, paginate, rx, num, r2, audit, Undo, nextNo, addMonths } from "../lib/util.js";
import { need } from "../lib/auth.js";
import { postTx, resolveAccount, getSettings } from "../services/money.js";
import { takeItem, logMove, putItem } from "../services/stock.js";

/* ───────── Warranty ───────── */
export const warranty = Router();
const W = ["warranty.manage", "sales.view"];
warranty.get("/stats", need(...W), ah(async (req, res) => {
  const settings = await getSettings(); const now = new Date(); const soon = new Date(Date.now() + settings.rules.warrantyAlertDays * 86400000);
  const [active, expiring, expired, voided, claims] = await Promise.all([
    Warranty.countDocuments({ status: "active", endDate: { $gte: now } }), Warranty.countDocuments({ status: "active", endDate: { $gte: now, $lte: soon } }),
    Warranty.countDocuments({ status: "active", endDate: { $lt: now } }), Warranty.countDocuments({ status: "void" }), WarrantyClaim.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);
  res.json({ active, expiring, expired, void: voided, claimsByStatus: Object.fromEntries(claims.map((x) => [x._id, x.count])) });
}));
warranty.get("/", need(...W), ah(async (req, res) => {
  const settings = await getSettings(); const now = new Date(); const soon = new Date(Date.now() + settings.rules.warrantyAlertDays * 86400000);
  const f = {};
  switch (req.query.status) {
    case "active": f.status = "active"; f.endDate = { $gte: now }; break;
    case "expiring": f.status = "active"; f.endDate = { $gte: now, $lte: soon }; break;
    case "expired": f.status = "active"; f.endDate = { $lt: now }; break;
    case "void": f.status = "void"; break;
  }
  if (req.query.customer) f.customer = req.query.customer;
  if (req.query.q) f.$or = [{ imei: rx(req.query.q) }, { serial: rx(req.query.q) }, { name: rx(req.query.q) }, { saleNo: rx(req.query.q) }, { customerName: rx(req.query.q) }, { customerPhone: rx(req.query.q) }];
  res.json(await paginate(Warranty.find(f), req, { sortable: ["endDate", "startDate"], defaultSort: "endDate" }));
}));
warranty.get("/claims", need(...W), ah(async (req, res) => {
  const f = {}; if (req.query.status) f.status = req.query.status; if (req.query.warranty) f.warranty = req.query.warranty;
  res.json(await paginate(WarrantyClaim.find(f).populate("warranty", "name imei saleNo customerName customerPhone endDate"), req, { sortable: ["receivedAt"], defaultSort: "-receivedAt" }));
}));
warranty.get("/:id", need(...W), ah(async (req, res) => {
  if (!isId(req.params.id)) throw notFound();
  const w = await Warranty.findById(req.params.id).lean(); if (!w) throw notFound();
  res.json({ ...w, claims: await WarrantyClaim.find({ warranty: w._id }).sort({ receivedAt: -1 }).lean() });
}));
/** Warranty is never edited silently: every change is stored in history + audit with a reason. */
warranty.put("/:id", need("warranty.manage"), ah(async (req, res) => {
  const w = await Warranty.findById(req.params.id); if (!w) throw notFound();
  if (!String(req.body.reason || "").trim()) throw bad("A reason is required", "REASON_REQUIRED");
  const before = { months: w.months, endDate: w.endDate };
  if (req.body.months !== undefined) { w.history.push({ at: new Date(), user: req.user._id, field: "months", from: String(w.months), to: String(req.body.months), reason: req.body.reason }); w.months = num(req.body.months); w.endDate = addMonths(w.startDate, w.months); }
  if (req.body.endDate) { w.history.push({ at: new Date(), user: req.user._id, field: "endDate", from: w.endDate.toISOString(), to: new Date(req.body.endDate).toISOString(), reason: req.body.reason }); w.endDate = new Date(req.body.endDate); }
  if (req.body.terms !== undefined) w.terms = req.body.terms;
  await w.save(); await audit(req.user, "edit", "warranty", { _id: w._id, no: w.saleNo }, { before, after: { months: w.months, endDate: w.endDate }, reason: req.body.reason });
  res.json(w);
}));
warranty.post("/:id/claims", need("warranty.manage"), ah(async (req, res) => {
  const w = await Warranty.findById(req.params.id); if (!w) throw notFound();
  if (!String(req.body.issue || "").trim()) throw bad("Describe the problem", "NAME_REQUIRED");
  const expired = w.endDate < new Date() || w.status === "void";
  const c = await WarrantyClaim.create({ no: await nextNo("claim", "CLM"), warranty: w._id, issue: req.body.issue, user: req.user._id, history: [{ at: new Date(), user: req.user._id, status: "received", note: expired ? "Warranty expired/void at time of claim" : "" }] });
  res.status(201).json({ ...c.toObject(), expired });
}));
warranty.put("/claims/:id", need("warranty.manage"), ah(async (req, res) => {
  const c = await WarrantyClaim.findById(req.params.id); if (!c) throw notFound();
  const st = req.body.status;
  if (st && st !== c.status) { if (!["received", "inspecting", "sent", "repaired", "replaced", "rejected", "delivered"].includes(st)) throw bad("Invalid status", "INVALID_STATUS"); c.status = st; c.history.push({ at: new Date(), user: req.user._id, status: st, note: req.body.note || "" }); }
  for (const k of ["sentTo", "result"]) if (req.body[k] !== undefined) c[k] = req.body[k];
  if (req.body.cost !== undefined) c.cost = r2(num(req.body.cost));
  await c.save(); res.json(c);
}));

/* ───────── Repairs (module can be switched off in settings) ───────── */
export const repairs = Router();
repairs.use(ah(async (_req, _res, next) => { if (!(await getSettings()).modules.repairs) throw bad("The repairs module is turned off", "MODULE_OFF"); next(); }));
repairs.use(need("repairs.manage"));
const recalc = (r) => { r.total = r2(r.checkFee + r.laborFee + r.parts.reduce((a, p) => a + p.price * p.qty, 0)); };
const note = (r, user, status, text = "") => r.history.push({ at: new Date(), user: user._id, status, note: text });

repairs.get("/stats", ah(async (_req, res) => {
  const rows = await Repair.aggregate([{ $group: { _id: "$status", count: { $sum: 1 }, revenue: { $sum: "$paid" } } }]);
  res.json({ counts: Object.fromEntries(rows.map((x) => [x._id, x.count])), revenue: r2(rows.reduce((a, x) => a + x.revenue, 0)) });
}));
repairs.get("/", ah(async (req, res) => {
  const f = {}; if (req.query.status === "open") f.status = { $in: ["received", "inspecting", "repairing", "ready"] }; else if (req.query.status) f.status = req.query.status;
  if (req.query.q) f.$or = [{ no: rx(req.query.q) }, { customerName: rx(req.query.q) }, { phone: rx(req.query.q) }, { imei: rx(req.query.q) }, { device: rx(req.query.q) }];
  res.json(await paginate(Repair.find(f), req, { sortable: ["receivedAt", "total", "status"], defaultSort: "-receivedAt" }));
}));
repairs.get("/:id", ah(async (req, res) => { if (!isId(req.params.id)) throw notFound(); const r = await Repair.findById(req.params.id).populate("history.user", "name").lean(); if (!r) throw notFound(); res.json(r); }));
repairs.post("/", ah(async (req, res) => {
  const b = req.body; if (!String(b.customerName || "").trim() || !String(b.device || "").trim()) throw bad("Customer and device are required", "NAME_REQUIRED");
  const r = new Repair({ no: await nextNo("repair", "REP"), customerName: b.customerName.trim(), phone: b.phone || "", device: b.device.trim(), imei: b.imei || "", problem: b.problem || "", accessories: b.accessories || "", condition: b.condition || "", eta: b.eta || undefined, checkFee: r2(num(b.checkFee)), laborFee: r2(num(b.laborFee)), technician: b.technician || "", user: req.user._id });
  recalc(r); note(r, req.user, "received"); await r.save(); await audit(req.user, "create", "repairs", r); res.status(201).json(r);
}));
repairs.put("/:id", ah(async (req, res) => {
  const r = await Repair.findById(req.params.id); if (!r) throw notFound();
  if (["delivered", "cancelled"].includes(r.status)) throw bad("This job is closed", "REPAIR_CLOSED");
  const b = req.body;
  for (const k of ["customerName", "phone", "device", "imei", "problem", "accessories", "condition", "technician", "eta"]) if (b[k] !== undefined) r[k] = b[k];
  if (b.checkFee !== undefined) r.checkFee = r2(num(b.checkFee)); if (b.laborFee !== undefined) r.laborFee = r2(num(b.laborFee));
  recalc(r);
  if (b.status && b.status !== r.status) {
    if (!["received", "inspecting", "repairing", "ready", "delivered", "cancelled"].includes(b.status)) throw bad("Invalid status", "INVALID_STATUS");
    if (b.status === "cancelled") { if (r.paid > 0) throw bad("Refund the customer first (manual cash-out), then cancel", "REPAIR_PAID"); for (const p of r.parts) { await putItem(p.product, p.qty, "sellable"); await logMove({ product: p.product, type: "repair_part_back", qty: p.qty, reason: r.no, user: req.user._id }); } }
    if (b.status === "delivered") r.deliveredAt = new Date();
    r.status = b.status; note(r, req.user, b.status, b.note);
  }
  await r.save(); res.json(r);
}));
repairs.post("/:id/parts", ah(async (req, res) => {
  const r = await Repair.findById(req.params.id); if (!r || ["delivered", "cancelled"].includes(r.status)) throw bad("This job is closed", "REPAIR_CLOSED");
  const p = await Product.findById(req.body.productId); if (!p || p.kind !== "item") throw bad("Choose a spare part from stock", "PRODUCT_NOT_FOUND");
  const qty = Math.floor(num(req.body.qty, 1)); if (qty <= 0) throw bad("Invalid quantity", "INVALID_QTY");
  await takeItem(p, qty);
  r.parts.push({ product: p._id, name: p.name, qty, price: r2(num(req.body.price, p.sell)), cost: p.buy }); recalc(r); note(r, req.user, "part", `${p.name} ×${qty}`);
  await r.save(); await logMove({ product: p._id, type: "repair_part", qty: -qty, reason: r.no, ref: { kind: "repair", id: r._id, no: r.no }, user: req.user._id }); res.json(r);
}));
repairs.delete("/:id/parts/:partId", ah(async (req, res) => {
  const r = await Repair.findById(req.params.id); if (!r || ["delivered", "cancelled"].includes(r.status)) throw bad("This job is closed", "REPAIR_CLOSED");
  const part = r.parts.id(req.params.partId); if (!part) throw notFound();
  await putItem(part.product, part.qty, "sellable"); await logMove({ product: part.product, type: "repair_part_back", qty: part.qty, reason: r.no, user: req.user._id });
  part.deleteOne(); recalc(r); await r.save(); res.json(r);
}));
repairs.post("/:id/payments", ah(async (req, res) => {
  const r = await Repair.findById(req.params.id); if (!r || r.status === "cancelled") throw notFound();
  const amount = r2(num(req.body.amount)); if (!(amount > 0)) throw bad("Enter an amount greater than zero", "INVALID_AMOUNT");
  if (amount > r2(r.total - r.paid) + 0.005) throw bad("Amount is more than the remaining balance", "OVER_BALANCE");
  const acc = await resolveAccount({ accountId: req.body.accountId, method: req.body.method });
  await postTx({ account: acc._id, dir: "in", amount, cat: "repair", ref: { kind: "repair", id: r._id, no: r.no }, party: { kind: "customer", name: r.customerName }, user: req.user });
  r.paid = r2(r.paid + amount); note(r, req.user, "payment", String(amount)); await r.save(); res.json(r);
}));
