import { Router } from "express";
import { Product, Unit, StockMovement, Sale, Purchase } from "../models/index.js";
import { ah, bad, notFound, isId, paginate, rx, num, r2, audit } from "../lib/util.js";
import { need } from "../lib/auth.js";
import { can } from "../lib/perms.js";
import { checkImeis, logMove } from "../services/stock.js";

const r = Router();
const VIEW = ["products.view", "sales.create", "purchases.view", "inventory.view"];
const FIELDS = ["name", "brand", "category", "kind", "barcode", "color", "storage", "ram", "condition", "buy", "sell", "minStock", "supplier", "warrantyMonths", "description", "image", "active"];

export const hideCost = (user) => (p) => { if (!can(user, "products.viewCost")) { delete p.buy; delete p.buyPrice; } return p; };

r.get("/", need(...VIEW), ah(async (req, res) => {
  const { q, brand, category, kind, status, condition, min, max, active } = req.query;
  const f = {};
  if (active !== "all") f.active = active === "false" ? false : true;
  if (brand) f.brand = brand; if (category) f.category = category; if (kind) f.kind = kind; if (condition) f.condition = condition;
  if (min || max) f.sell = { ...(min ? { $gte: num(min) } : {}), ...(max ? { $lte: num(max) } : {}) };
  const and = [];
  if (q) {
    const ids = String(q).trim().length >= 3 ? await Unit.find({ $or: [{ imei1: rx(q) }, { imei2: rx(q) }, { serial: rx(q) }], status: { $ne: "cancelled" } }).distinct("product") : [];
    and.push({ $or: [{ name: rx(q) }, { barcode: rx(q) }, { color: rx(q) }, ...(ids.length ? [{ _id: { $in: ids } }] : [])] });
  }
  if (status === "out") { f.kind = { $ne: "service" }; f.qty = 0; }
  else if (status === "low") { f.kind = { $ne: "service" }; f.qty = { $gt: 0 }; and.push({ $expr: { $lte: ["$qty", "$minStock"] } }); }
  else if (status === "in") and.push({ $or: [{ kind: "service" }, { qty: { $gt: 0 } }] });
  if (and.length) f.$and = and;
  const query = Product.find(f).populate("brand", "name").populate("category", "name kind");
  const out = await paginate(query, req, { sortable: ["name", "sell", "buy", "qty", "createdAt"], defaultSort: "-createdAt" });
  out.rows = out.rows.map(hideCost(req.user));
  res.json(out);
}));

/** Exact scan lookup: barcode → product, IMEI/serial → product + unit. */
r.get("/lookup", need("sales.create", "products.view", "purchases.view", "inventory.view"), ah(async (req, res) => {
  const code = String(req.query.code || "").trim(); if (!code) throw bad("Code required");
  const unit = await Unit.findOne({ $or: [{ imei1: code }, { imei2: code }, { serial: code }], status: { $ne: "cancelled" } }).sort({ createdAt: -1 }).lean();
  if (unit) { const product = await Product.findById(unit.product).populate("brand", "name").lean(); return res.json({ product: hideCost(req.user)(product), unit: hideCost(req.user)(unit) }); }
  const product = await Product.findOne({ barcode: code, active: true }).populate("brand", "name").lean();
  if (!product) throw notFound("Product");
  res.json({ product: hideCost(req.user)(product) });
}));

r.get("/:id", need(...VIEW), ah(async (req, res) => {
  if (!isId(req.params.id)) throw notFound();
  const p = await Product.findById(req.params.id).populate("brand", "name").populate("category", "name kind").lean();
  if (!p) throw notFound();
  const counts = await Unit.aggregate([{ $match: { product: p._id } }, { $group: { _id: "$status", n: { $sum: 1 } } }]).catch(() => []);
  res.json({ ...hideCost(req.user)(p), unitCounts: Object.fromEntries(counts.map((c) => [c._id, c.n])) });
}));

const sanitize = (b) => {
  const d = {}; for (const k of FIELDS) if (b[k] !== undefined) d[k] = b[k];
  for (const k of ["buy", "sell", "minStock", "warrantyMonths"]) if (d[k] !== undefined) { d[k] = r2(num(d[k])); if (d[k] < 0) throw bad("Negative values are not allowed", "INVALID_PRICE"); }
  for (const k of ["brand", "category", "supplier"]) if (d[k] === "" || d[k] === null) d[k] = undefined;
  return d;
};

r.post("/", need("products.edit"), ah(async (req, res) => {
  const d = sanitize(req.body);
  if (!String(d.name || "").trim()) throw bad("Name is required", "NAME_REQUIRED");
  if (d.barcode && (await Product.exists({ barcode: d.barcode, active: true }))) throw bad("This barcode already belongs to another product", "BARCODE_DUPLICATE");
  const requestedQty = Math.floor(num(req.body.qty));
  if (requestedQty < 0) throw bad("Invalid quantity", "INVALID_QTY");
  const openingUnits = d.kind === "phone" ? (Array.isArray(req.body.openingUnits) ? req.body.openingUnits : []) : [];
  if (d.kind === "phone" && openingUnits.length !== requestedQty) throw bad("Add IMEI or serial for each phone", "OPENING_UNITS_REQUIRED");
  const normalizedUnits = openingUnits.map((u) => ({ imei1: String(u.imei1 || "").trim(), imei2: String(u.imei2 || "").trim(), serial: String(u.serial || "").trim(), color: d.color || "", storage: d.storage || "", ram: d.ram || "", condition: d.condition || "new", buyPrice: r2(num(d.buy)), sellPrice: null }));
  if (normalizedUnits.some((u) => !u.imei1 && !u.serial)) throw bad("Each phone needs an IMEI or serial number", "UNIT_REQUIRED");
  const dup = normalizedUnits.length ? await checkImeis(normalizedUnits) : { flagged: new Set() };
  const openingQty = d.kind === "phone" ? normalizedUnits.length : d.kind === "service" ? 0 : requestedQty;
  const p = await Product.create({ ...d, qty: 0 });
  if (d.kind === "phone") {
    for (const u of normalizedUnits) {
      const doc = await Unit.create({ ...u, product: p._id, status: "available", purchasedAt: new Date(), flagged: dup.flagged.has(u.imei1) || dup.flagged.has(u.imei2) });
      await logMove({ product: p._id, unit: doc._id, type: "opening", qty: 1, reason: "Opening stock", user: req.user._id });
    }
    if (openingQty) await Product.updateOne({ _id: p._id }, { $set: { qty: openingQty } });
  } else if (openingQty > 0) {
    await Product.updateOne({ _id: p._id }, { $set: { qty: openingQty } });
    await logMove({ product: p._id, type: "opening", qty: openingQty, reason: "Opening stock", user: req.user._id });
  }
  p.qty = openingQty;
  await audit(req.user, "create", "products", p);
  res.status(201).json(p);
}));

r.put("/:id", need("products.edit"), ah(async (req, res) => {
  if (!isId(req.params.id)) throw notFound();
  const p = await Product.findById(req.params.id); if (!p) throw notFound();
  const d = sanitize(req.body);
  if (d.barcode && d.barcode !== p.barcode && (await Product.exists({ barcode: d.barcode, active: true, _id: { $ne: p._id } }))) throw bad("This barcode already belongs to another product", "BARCODE_DUPLICATE");
  if (d.kind && d.kind !== p.kind && (await StockMovement.exists({ product: p._id }))) throw bad("The type of a product with history cannot change", "KIND_LOCKED");
  const before = { buy: p.buy, sell: p.sell, name: p.name, active: p.active };
  Object.assign(p, d); await p.save();
  await audit(req.user, "update", "products", p, { before, after: { buy: p.buy, sell: p.sell, name: p.name, active: p.active } });
  res.json(p);
}));

r.delete("/:id", need("products.edit"), ah(async (req, res) => {
  if (!isId(req.params.id)) throw notFound();
  const p = await Product.findById(req.params.id); if (!p) throw notFound();
  const usedIn = (await StockMovement.exists({ product: p._id })) || (await Sale.exists({ "items.product": p._id })) || (await Purchase.exists({ "items.product": p._id }));
  if (usedIn) { p.active = false; await p.save(); await audit(req.user, "deactivate", "products", p); return res.json({ deactivated: true }); }
  await p.deleteOne(); await audit(req.user, "delete", "products", p);
  res.json({ deleted: true });
}));

/** Opening stock for phones (normally phones enter through a purchase). */
r.post("/:id/units", need("products.edit", "inventory.adjust"), ah(async (req, res) => {
  const p = await Product.findById(req.params.id); if (!p || p.kind !== "phone") throw bad("Product is not a phone", "INVALID_PRODUCT");
  const list = (Array.isArray(req.body.units) ? req.body.units : [req.body]).map((u) => ({ imei1: String(u.imei1 || "").trim(), imei2: String(u.imei2 || "").trim(), serial: String(u.serial || "").trim(), color: u.color, storage: u.storage, ram: u.ram, condition: u.condition, buyPrice: r2(num(u.buyPrice, p.buy)), sellPrice: u.sellPrice === "" || u.sellPrice == null ? null : num(u.sellPrice) }));
  if (list.some((u) => !u.imei1 && !u.serial)) throw bad("Each phone needs an IMEI or a serial number", "UNIT_REQUIRED");
  const dup = await checkImeis(list, { allowDuplicate: req.user.role === "admin" && !!req.body.allowDuplicateImei });
  const out = [];
  for (const u of list) {
    const doc = await Unit.create({ ...u, product: p._id, status: "available", purchasedAt: new Date(), flagged: dup.flagged.has(u.imei1) || dup.flagged.has(u.imei2) });
    await Product.updateOne({ _id: p._id }, { $inc: { qty: 1 } });
    await logMove({ product: p._id, unit: doc._id, type: "opening", qty: 1, reason: "Opening stock", user: req.user._id });
    out.push(doc);
  }
  res.status(201).json(out);
}));

export const unitsRouter = Router();
unitsRouter.get("/", need(...VIEW), ah(async (req, res) => {
  const { product, status, q, flagged } = req.query; const f = {};
  if (product) f.product = product; if (status) f.status = status; if (flagged === "1") f.flagged = true;
  if (q) f.$or = [{ imei1: rx(q) }, { imei2: rx(q) }, { serial: rx(q) }];
  const query = Unit.find(f).populate("product", "name brand").populate("supplier", "name");
  const out = await paginate(query, req, { sortable: ["createdAt", "status", "buyPrice"], defaultSort: "-createdAt" });
  out.rows = out.rows.map(hideCost(req.user)); res.json(out);
}));
export default r;
