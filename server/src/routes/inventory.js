import { Router } from "express";
import { Product, Unit, StockMovement } from "../models/index.js";
import { ah, bad, num, isId, paginate, range, audit, rx } from "../lib/util.js";
import { need } from "../lib/auth.js";
import { logMove, setUnitStatus } from "../services/stock.js";

const r = Router();

r.get("/movements", need("inventory.view"), ah(async (req, res) => {
  const f = {};
  if (req.query.product) f.product = req.query.product; if (req.query.type) f.type = req.query.type; if (req.query.unit) f.unit = req.query.unit;
  if (req.query.from) { const { from, to } = range(req.query); f.at = { $gte: from, $lt: to }; }
  const q = StockMovement.find(f).populate("product", "name").populate("unit", "imei1 serial").populate("user", "name");
  res.json(await paginate(q, req, { sortable: ["at", "qty", "type"], defaultSort: "-at" }));
}));

const needReason = (b) => { if (!String(b.reason || "").trim()) throw bad("A reason is required", "REASON_REQUIRED"); return String(b.reason).trim(); };

/** Manual adjustment for quantity items: either `delta` or `newQty`. */
r.post("/adjust", need("inventory.adjust"), ah(async (req, res) => {
  const reason = needReason(req.body);
  const p = await Product.findById(req.body.productId); if (!p) throw bad("Product not found", "PRODUCT_NOT_FOUND");
  if (p.kind !== "item") throw bad("Phones are adjusted by changing the status of each IMEI", "INVALID_PRODUCT");
  const delta = req.body.newQty !== undefined && req.body.newQty !== "" ? Math.floor(num(req.body.newQty)) - p.qty : Math.floor(num(req.body.delta));
  if (!delta) throw bad("No change", "NO_CHANGE");
  const u = await Product.findOneAndUpdate({ _id: p._id, ...(delta < 0 ? { qty: { $gte: -delta } } : {}) }, { $inc: { qty: delta } }, { new: true });
  if (!u) throw bad("Stock cannot become negative", "STOCK_INSUFFICIENT");
  await logMove({ product: p._id, type: "adjust", qty: delta, reason, user: req.user._id });
  await audit(req.user, "adjust", "inventory", p, { before: { qty: p.qty }, after: { qty: u.qty }, reason });
  res.json(u);
}));

/** Physical count: [{productId, counted}] → differences are posted as adjustments. */
r.post("/count", need("inventory.adjust"), ah(async (req, res) => {
  const reason = needReason(req.body); const apply = req.body.apply !== false;
  const out = [];
  for (const row of req.body.items || []) {
    const p = await Product.findById(row.productId); if (!p || p.kind !== "item" || row.counted === "" || row.counted == null) continue;
    const counted = Math.max(0, Math.floor(num(row.counted))); const diff = counted - p.qty;
    out.push({ productId: p._id, name: p.name, system: p.qty, counted, diff });
    if (apply && diff) { await Product.updateOne({ _id: p._id }, { $set: { qty: counted } }); await logMove({ product: p._id, type: "count", qty: diff, reason: `Physical count: ${reason}`, user: req.user._id }); await audit(req.user, "count", "inventory", p, { before: { qty: p.qty }, after: { qty: counted }, reason }); }
  }
  res.json({ applied: apply, rows: out });
}));

/** Scan-based count for phones: which available IMEIs were not scanned / which scanned ones are unknown. */
r.post("/imei-count", need("inventory.view"), ah(async (req, res) => {
  const codes = [...new Set((req.body.codes || []).map((s) => String(s).trim()).filter(Boolean))];
  const f = { status: "available" }; if (req.body.productId) f.product = req.body.productId;
  const avail = await Unit.find(f).populate("product", "name").lean();
  const hit = (u) => codes.includes(u.imei1) || codes.includes(u.imei2) || (u.serial && codes.includes(u.serial));
  const missing = avail.filter((u) => !hit(u));
  const known = new Set(avail.flatMap((u) => [u.imei1, u.imei2, u.serial]).filter(Boolean));
  const unknown = codes.filter((c) => !known.has(c));
  res.json({ expected: avail.length, scanned: codes.length, missing, unknown });
}));

r.post("/unit-status", need("inventory.adjust"), ah(async (req, res) => {
  const reason = needReason(req.body);
  if (!["available", "defective", "review", "lost"].includes(req.body.status)) throw bad("Invalid status", "INVALID_STATUS");
  const before = await Unit.findById(req.body.unitId).lean();
  const u = await setUnitStatus(req.body.unitId, req.body.status, { user: req.user, reason });
  await audit(req.user, "unit-status", "inventory", u, { before: { status: before?.status }, after: { status: u.status }, reason });
  res.json(u);
}));

/** Move quantity items between sellable and defective buckets. */
r.post("/defect", need("inventory.adjust"), ah(async (req, res) => {
  const reason = needReason(req.body); const n = Math.floor(num(req.body.qty));
  if (n <= 0) throw bad("Invalid quantity", "INVALID_QTY");
  const toDefective = req.body.to !== "sellable";
  const f = toDefective ? { _id: req.body.productId, qty: { $gte: n } } : { _id: req.body.productId, defectiveQty: { $gte: n } };
  const p = await Product.findOneAndUpdate(f, { $inc: toDefective ? { qty: -n, defectiveQty: n } : { qty: n, defectiveQty: -n } }, { new: true });
  if (!p) throw bad("Not enough quantity", "STOCK_INSUFFICIENT");
  await logMove({ product: p._id, type: toDefective ? "defect" : "restore", qty: toDefective ? -n : n, reason, user: req.user._id });
  res.json(p);
}));
export default r;
