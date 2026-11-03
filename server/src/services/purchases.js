import { Purchase, Product, Unit, Supplier } from "../models/index.js";
import { bad, num, r2, nextNo, Undo, audit } from "../lib/util.js";
import { getSettings, resolveAccount, postTx, moveParty } from "./money.js";
import { logMove, checkImeis } from "./stock.js";

export async function createPurchase(input, user, perms = {}) {
  const settings = await getSettings();
  const raw = Array.isArray(input.items) ? input.items : [];
  if (!raw.length) throw bad("Add at least one item", "NO_ITEMS");
  let supplier = null;
  if (input.supplierId) { supplier = await Supplier.findById(input.supplierId); if (!supplier || !supplier.active) throw bad("Supplier not found", "SUPPLIER_NOT_FOUND"); }
  if (!supplier && !String(input.sellerName || "").trim()) throw bad("Select a supplier or enter the seller's name", "SUPPLIER_REQUIRED");

  const lines = [];
  const allUnits = [];
  for (const it of raw) {
    const product = await Product.findById(it.productId);
    if (!product || !product.active) throw bad("Product not found or inactive", "PRODUCT_NOT_FOUND");
    if (product.kind === "service") throw bad("Services cannot be purchased into stock", "INVALID_PRODUCT");
    const unitPrice = r2(num(it.unitPrice, NaN));
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw bad("Invalid price", "INVALID_PRICE");
    let qty = num(it.qty, 1); const units = [];
    if (product.kind === "phone") {
      const list = Array.isArray(it.units) ? it.units : [];
      if (!list.length) throw bad(`Enter IMEI / serial for ${product.name}`, "UNIT_REQUIRED");
      for (const u of list) {
        if (!String(u.imei1 || "").trim() && !String(u.serial || "").trim()) throw bad("Each phone needs an IMEI or a serial number", "UNIT_REQUIRED");
        units.push({ imei1: String(u.imei1 || "").trim(), imei2: String(u.imei2 || "").trim(), serial: String(u.serial || "").trim(), color: u.color || product.color, storage: u.storage || product.storage, ram: u.ram || product.ram, condition: u.condition || product.condition, sellPrice: u.sellPrice === "" || u.sellPrice == null ? null : num(u.sellPrice) });
      }
      qty = units.length; allUnits.push(...units);
    } else if (!Number.isInteger(qty) || qty <= 0) throw bad("Invalid quantity", "INVALID_QTY");
    const discount = r2(num(it.discount));
    if (discount < 0 || discount > unitPrice * qty + 0.001) throw bad("Invalid discount", "INVALID_DISCOUNT");
    lines.push({ product, qty, unitPrice, discount, units, total: r2(unitPrice * qty - discount) });
  }
  const dup = await checkImeis(allUnits, { allowDuplicate: !!(input.allowDuplicateImei && perms.allowDuplicate) });

  const subtotal = r2(lines.reduce((a, l) => a + l.total, 0));
  const discount = r2(num(input.discount));
  if (discount < 0 || discount > subtotal + 0.001) throw bad("Invalid discount", "INVALID_DISCOUNT");
  const total = r2(subtotal - discount);
  const payType = ["cash", "credit", "partial"].includes(input.payType) ? input.payType : "cash";
  const paid = payType === "cash" ? total : payType === "credit" ? 0 : r2(num(input.paid));
  if (payType === "partial" && !(paid > 0 && paid < total)) throw bad("Partial payment must be more than 0 and less than the total", "INVALID_PAID");
  const due = r2(total - paid);
  if (due > 0 && !supplier) throw bad("A registered supplier is required for credit purchases", "SUPPLIER_REQUIRED");
  const acc = paid > 0 ? await resolveAccount({ accountId: input.accountId, method: input.method }) : null;

  const undo = new Undo();
  const date = input.date ? new Date(input.date) : new Date();
  try {
    const no = await nextNo("purchase", "PUR");
    const purchase = await Purchase.create({
      no, supplier: supplier?._id, sellerName: input.sellerName || "", sellerPhone: input.sellerPhone || "", billNo: input.billNo || "", subtotal, discount, total, paid, due, payType,
      method: input.method || "cash", account: acc?._id, user: user._id, date, note: input.note || "", items: [],
    });
    undo.add(() => Purchase.deleteOne({ _id: purchase._id }));
    if (acc && paid > 0) await postTx({ account: acc._id, dir: "out", amount: paid, cat: "purchase", ref: { kind: "purchase", id: purchase._id, no }, party: supplier ? { kind: "supplier", id: supplier._id, name: supplier.name } : undefined, user, at: date, allowOverdraft: settings.rules.allowOverdraft }, undo);
    if (due > 0) await moveParty("supplier", supplier._id, due, { type: "charge", ref: { kind: "purchase", id: purchase._id, no }, note: no, user, at: date }, undo);

    const docItems = [];
    for (const l of lines) {
      const unitIds = [];
      // effective unit cost after the line discount
      const eff = r2(l.total / l.qty);
      if (l.product.kind === "phone") {
        for (const u of l.units) {
          const reuse = dup.reuse[u.imei1] || dup.reuse[u.imei2];
          const data = { ...u, product: l.product._id, buyPrice: eff, supplier: supplier?._id, purchase: purchase._id, purchasedAt: date, status: "available", sale: null, flagged: dup.flagged.has(u.imei1) || dup.flagged.has(u.imei2) };
          let doc;
          if (reuse) { const prev = reuse.toObject(); doc = await Unit.findByIdAndUpdate(reuse._id, data, { new: true }); undo.add(() => Unit.findByIdAndUpdate(reuse._id, { status: prev.status, buyPrice: prev.buyPrice, purchase: prev.purchase, sale: prev.sale })); }
          else { doc = await Unit.create(data); undo.add(() => Unit.deleteOne({ _id: doc._id })); }
          unitIds.push(doc._id);
          await logMove({ product: l.product._id, unit: doc._id, type: "purchase", qty: 1, reason: no, ref: { kind: "purchase", id: purchase._id, no }, user: user._id, at: date });
        }
        await Product.updateOne({ _id: l.product._id }, { $inc: { qty: l.qty }, $set: { buy: eff, ...(supplier ? { supplier: supplier._id } : {}) } });
        undo.add(() => Product.updateOne({ _id: l.product._id }, { $inc: { qty: -l.qty }, $set: { buy: l.product.buy } }));
      } else {
        const fresh = await Product.findById(l.product._id);
        const newBuy = fresh.qty + l.qty > 0 ? r2((fresh.qty * fresh.buy + l.qty * eff) / (fresh.qty + l.qty)) : eff; // weighted average cost
        await Product.updateOne({ _id: l.product._id }, { $inc: { qty: l.qty }, $set: { buy: fresh.buy > 0 && fresh.qty > 0 ? newBuy : eff, ...(supplier ? { supplier: supplier._id } : {}) } });
        undo.add(() => Product.updateOne({ _id: l.product._id }, { $inc: { qty: -l.qty }, $set: { buy: fresh.buy } }));
        await logMove({ product: l.product._id, type: "purchase", qty: l.qty, reason: no, ref: { kind: "purchase", id: purchase._id, no }, user: user._id, at: date });
      }
      docItems.push({ product: l.product._id, name: l.product.name, qty: l.qty, unitPrice: l.unitPrice, discount: l.discount, total: l.total, units: unitIds });
    }
    purchase.items = docItems; await purchase.save();
    return purchase.toObject();
  } catch (e) { await undo.rollback(); throw e; }
}

export async function cancelPurchase(id, reason, user) {
  if (!String(reason || "").trim()) throw bad("A reason is required", "REASON_REQUIRED");
  const p = await Purchase.findById(id);
  if (!p) throw bad("Purchase not found", "NOT_FOUND");
  if (p.status === "cancelled") throw bad("Already cancelled", "ALREADY_CANCELLED");
  const settings = await getSettings();
  // goods must still be on the shelf
  for (const it of p.items) {
    const prod = await Product.findById(it.product);
    if (it.units?.length) {
      const n = await Unit.countDocuments({ _id: { $in: it.units }, status: "available" });
      if (n !== it.units.length) throw bad("Some phones of this purchase were already sold or changed", "PURCHASE_USED");
    } else if (!prod || prod.qty < it.qty) throw bad("Stock is no longer enough to cancel this purchase", "PURCHASE_USED");
  }
  const undo = new Undo();
  try {
    if (p.paid > 0) { const acc = await resolveAccount({ accountId: p.account }); await postTx({ account: acc._id, dir: "in", amount: p.paid, cat: "refund", ref: { kind: "purchase", id: p._id, no: p.no }, note: `Cancel ${p.no}`, user }, undo); }
    if (p.due > 0 && p.supplier) await moveParty("supplier", p.supplier, -p.due, { type: "adjust", ref: { kind: "purchase", id: p._id, no: p.no }, note: `Cancel ${p.no}`, user }, undo);
    for (const it of p.items) {
      if (it.units?.length) await Unit.updateMany({ _id: { $in: it.units } }, { status: "cancelled" });
      await Product.updateOne({ _id: it.product }, { $inc: { qty: -it.qty } });
      await logMove({ product: it.product, type: "cancel_purchase", qty: -it.qty, reason: p.no, ref: { kind: "purchase", id: p._id, no: p.no }, user: user._id });
    }
    Object.assign(p, { status: "cancelled", cancelReason: reason, cancelledAt: new Date(), cancelledBy: user._id });
    await p.save();
    await audit(user, "cancel", "purchases", p, { reason });
    return p.toObject();
  } catch (e) { await undo.rollback(); throw e; }
}
