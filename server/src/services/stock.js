import { Product, Unit, StockMovement } from "../models/index.js";
import { bad } from "../lib/util.js";

export const logMove = (m) => StockMovement.create({ ...m, at: m.at || new Date() });

/** available → sold (atomic). Returns the unit as it was before. */
export async function takeUnit(unitId, undo) {
  const u = await Unit.findOneAndUpdate({ _id: unitId, status: "available" }, { status: "sold" });
  if (!u) throw bad("This phone is not available for sale", "UNIT_UNAVAILABLE");
  await Product.updateOne({ _id: u.product }, { $inc: { qty: -1 } });
  undo?.add(async () => { await Unit.updateOne({ _id: u._id }, { status: "available" }); await Product.updateOne({ _id: u.product }, { $inc: { qty: 1 } }); });
  return u;
}

/** Quantity items: decrement only if enough stock (never below zero). Services are not stock-tracked. */
export async function takeItem(product, qty, undo) {
  if (product.kind === "service") return product;
  const p = await Product.findOneAndUpdate({ _id: product._id, qty: { $gte: qty } }, { $inc: { qty: -qty } }, { new: true });
  if (!p) throw bad(`Not enough stock for ${product.name}`, "STOCK_INSUFFICIENT");
  undo?.add(() => Product.updateOne({ _id: product._id }, { $inc: { qty } }));
  return p;
}

/** Puts a returned item back: sellable → qty, otherwise → defective bucket. */
export async function putItem(productId, qty, condition) {
  await Product.updateOne({ _id: productId }, { $inc: condition === "sellable" ? { qty } : { defectiveQty: qty } });
}

/** Moves a phone unit between statuses keeping Product.qty (= count of available units) in sync. */
export async function setUnitStatus(unitId, to, { user, reason, ref, type = "status" } = {}) {
  const u = await Unit.findById(unitId);
  if (!u) throw bad("Phone not found", "NOT_FOUND");
  if (u.status === to) return u;
  if (to === "sold") throw bad("A phone becomes sold only through an invoice", "INVALID_STATUS");
  if (u.status === "sold" || u.status === "cancelled") throw bad("This phone is sold or cancelled", "INVALID_STATUS");
  const from = u.status;
  const delta = from === "available" ? -1 : to === "available" ? 1 : 0;
  u.status = to; await u.save();
  if (delta) await Product.updateOne({ _id: u.product }, { $inc: { qty: delta } });
  await logMove({ product: u.product, unit: u._id, type, qty: delta, reason: reason || `${from} → ${to}`, ref, user: user?._id });
  return u;
}

/** Sold phone comes back from a customer (return). */
export async function restoreUnit(unitId, condition, { user, ref, reason } = {}) {
  const to = condition === "sellable" ? "available" : condition;
  const u = await Unit.findOneAndUpdate({ _id: unitId, status: "sold" }, { status: to, sale: null });
  if (!u) return null;
  if (to === "available") await Product.updateOne({ _id: u.product }, { $inc: { qty: 1 } });
  await logMove({ product: u.product, unit: u._id, type: "return", qty: to === "available" ? 1 : 0, reason: reason || `return → ${to}`, ref, user: user?._id });
  return u;
}

export async function checkImeis(list, { allowDuplicate = false, ignoreSold = true } = {}) {
  const codes = list.flatMap((x) => [x.imei1, x.imei2]).map((s) => String(s || "").trim()).filter(Boolean);
  if (new Set(codes).size !== codes.length) throw bad("Duplicate IMEI inside this entry", "IMEI_DUPLICATE");
  if (!codes.length) return { reuse: {}, flagged: new Set() };
  const found = await Unit.find({ $or: [{ imei1: { $in: codes } }, { imei2: { $in: codes } }], status: { $ne: "cancelled" } });
  const reuse = {}; const flagged = new Set();
  for (const f of found) {
    const hit = codes.find((c) => c === f.imei1 || c === f.imei2);
    if (f.status === "sold" && ignoreSold) { reuse[hit] = f; continue; } // buy-back of a phone we sold earlier
    if (!allowDuplicate) throw bad(`IMEI ${hit} already exists in the system`, "IMEI_DUPLICATE");
    flagged.add(hit);
  }
  return { reuse, flagged };
}
