import { Sale, Product, Unit, Customer, Warranty, Return } from "../models/index.js";
import { bad, forbidden, num, r2, nextNo, Undo, addMonths, audit } from "../lib/util.js";
import { getSettings, resolveAccount, postTx, assertShift, moveParty } from "./money.js";
import { takeUnit, takeItem, logMove, putItem, restoreUnit } from "./stock.js";

/** Validates one requested line and returns normalized data (no side effects). */
async function prepareLine(it, perms, seen) {
  const product = await Product.findById(it.productId);
  if (!product || !product.active) throw bad("Product not found or inactive", "PRODUCT_NOT_FOUND");
  let unit = null; let qty = num(it.qty, 1);
  if (product.kind === "phone") {
    if (!it.unitId) throw bad(`Select the phone (IMEI) for ${product.name}`, "UNIT_REQUIRED");
    if (seen.has(String(it.unitId))) throw bad("The same phone is added twice", "IMEI_DUPLICATE");
    seen.add(String(it.unitId));
    unit = await Unit.findOne({ _id: it.unitId, product: product._id });
    if (!unit || unit.status !== "available") throw bad("This phone is not available for sale", "UNIT_UNAVAILABLE");
    qty = 1;
  } else if (!Number.isInteger(qty) || qty <= 0) throw bad("Invalid quantity", "INVALID_QTY");
  const base = unit?.sellPrice ?? product.sell;
  const price = it.price == null || it.price === "" ? base : r2(num(it.price, NaN));
  if (!Number.isFinite(price) || price < 0) throw bad("Invalid price", "INVALID_PRICE");
  if (price !== base && !perms.editPrice) throw forbidden("You cannot change the price", "FORBIDDEN");
  const discount = r2(num(it.discount));
  if (discount < 0 || discount > price * qty + 0.001) throw bad("Invalid discount", "INVALID_DISCOUNT");
  if (discount > 0 && !perms.discount) throw forbidden("You cannot give discounts", "FORBIDDEN");
  const costRaw = unit ? unit.buyPrice : product.buy;
  return { product, unit, qty, price, discount, cost: costRaw > 0 ? costRaw : null, months: it.warrantyMonths != null ? num(it.warrantyMonths) : (unit ? product.warrantyMonths : product.warrantyMonths) };
}

export async function createSale(input, user, perms = {}) {
  const settings = await getSettings();
  const raw = Array.isArray(input.items) ? input.items : [];
  if (!raw.length) throw bad("Add at least one item", "NO_ITEMS");
  const seen = new Set();
  const lines = [];
  for (const it of raw) lines.push(await prepareLine(it, perms, seen));

  const subtotal = r2(lines.reduce((a, l) => a + l.price * l.qty - l.discount, 0));
  const discount = r2(num(input.discount));
  if (discount < 0 || discount > subtotal + 0.001) throw bad("Invalid discount", "INVALID_DISCOUNT");
  if (discount > 0 && !perms.discount) throw forbidden("You cannot give discounts", "FORBIDDEN");
  const total = r2(subtotal - discount);
  const payType = ["cash", "credit", "partial"].includes(input.payType) ? input.payType : "cash";
  let paid = payType === "cash" ? total : payType === "credit" ? 0 : r2(num(input.paid));
  if (payType === "partial" && !(paid > 0 && paid < total)) throw bad("Partial payment must be more than 0 and less than the total", "INVALID_PAID");
  const due = r2(total - paid);
  let customer = null;
  if (input.customerId) { customer = await Customer.findById(input.customerId); if (!customer || !customer.active) throw bad("Customer not found", "CUSTOMER_NOT_FOUND"); }
  if (due > 0 && !customer) throw bad("Select a customer for credit or partial sales", "CUSTOMER_REQUIRED");
  const acc = paid > 0 ? await resolveAccount({ accountId: input.accountId, method: input.method }) : null;
  if (acc) await assertShift(user, acc, settings);

  const undo = new Undo();
  const date = new Date();
  try {
    const items = [];
    for (const l of lines) {
      let imei = "", serial = "";
      if (l.unit) { await takeUnit(l.unit._id, undo); imei = l.unit.imei1; serial = l.unit.serial; } else await takeItem(l.product, l.qty, undo);
      const gross = l.price * l.qty - l.discount;
      items.push({
        product: l.product._id, name: l.product.name, unit: l.unit?._id, imei, serial, qty: l.qty, price: l.price, discount: l.discount,
        net: r2(subtotal > 0 ? gross * (total / subtotal) : 0), cost: l.cost, warrantyMonths: l.months || 0, returnedQty: 0,
      });
    }
    const no = await nextNo("sale", settings.invoicePrefix || "INV");
    const sale = await Sale.create({
      no, customer: customer?._id, customerName: customer?.name || String(input.customerName || "").trim(), items, subtotal, discount, total, paid, due,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined, payType, method: input.method || "cash", account: acc?._id, user: user._id, date, note: input.note || "",
    });
    undo.add(() => Sale.deleteOne({ _id: sale._id }));
    for (const it of items) {
      if (it.unit) { await Unit.updateOne({ _id: it.unit }, { sale: sale._id }); undo.add(() => Unit.updateOne({ _id: it.unit }, { sale: null })); }
    }
    if (acc && paid > 0) await postTx({ account: acc._id, dir: "in", amount: paid, cat: "sale", ref: { kind: "sale", id: sale._id, no }, party: customer ? { kind: "customer", id: customer._id, name: customer.name } : undefined, user, at: date }, undo);
    if (due > 0) await moveParty("customer", customer._id, due, { type: "charge", ref: { kind: "sale", id: sale._id, no }, note: no, dueDate: sale.dueDate, user, at: date }, undo);

    for (const it of sale.items) {
      await logMove({ product: it.product, unit: it.unit, type: "sale", qty: -it.qty, reason: no, ref: { kind: "sale", id: sale._id, no }, user: user._id, at: date });
      if (it.warrantyMonths > 0) {
        await Warranty.create({
          sale: sale._id, saleNo: no, customer: customer?._id, customerName: sale.customerName, customerPhone: customer?.phone || "", product: it.product, name: it.name,
          imei: it.imei, serial: it.serial, unit: it.unit, months: it.warrantyMonths, startDate: date, endDate: addMonths(date, it.warrantyMonths), terms: settings.warrantyTerms || "",
        });
      }
    }
    return sale.toObject();
  } catch (e) { await undo.rollback(); throw e; }
}

export async function cancelSale(id, reason, user) {
  if (!String(reason || "").trim()) throw bad("A reason is required", "REASON_REQUIRED");
  const sale = await Sale.findById(id);
  if (!sale) throw bad("Invoice not found", "NOT_FOUND");
  if (sale.status === "cancelled") throw bad("Invoice is already cancelled", "ALREADY_CANCELLED");
  if (sale.returnedTotal > 0 || sale.items.some((i) => i.returnedQty > 0)) throw bad("This invoice has returns; it cannot be cancelled", "HAS_RETURNS");
  const settings = await getSettings();
  const undo = new Undo();
  try {
    if (sale.paid > 0) {
      const acc = await resolveAccount({ accountId: sale.account });
      await postTx({ account: acc._id, dir: "out", amount: sale.paid, cat: "refund", ref: { kind: "sale", id: sale._id, no: sale.no }, note: `Cancel ${sale.no}`, user, allowOverdraft: settings.rules.allowOverdraft }, undo);
    }
    if (sale.due > 0 && sale.customer) await moveParty("customer", sale.customer, -sale.due, { type: "adjust", ref: { kind: "sale", id: sale._id, no: sale.no }, note: `Cancel ${sale.no}`, user }, undo);
    for (const it of sale.items) {
      if (it.unit) await restoreUnit(it.unit, "sellable", { user, reason: `cancel ${sale.no}`, ref: { kind: "sale", id: sale._id, no: sale.no } });
      else { await putItem(it.product, it.qty, "sellable"); await logMove({ product: it.product, type: "cancel_sale", qty: it.qty, reason: sale.no, ref: { kind: "sale", id: sale._id, no: sale.no }, user: user._id }); }
    }
    await Warranty.updateMany({ sale: sale._id }, { status: "void" });
    const before = { status: sale.status, total: sale.total };
    Object.assign(sale, { status: "cancelled", cancelReason: reason, cancelledAt: new Date(), cancelledBy: user._id });
    await sale.save();
    await audit(user, "cancel", "sales", sale, { before, after: { status: "cancelled" }, reason });
    return sale.toObject();
  } catch (e) { await undo.rollback(); throw e; }
}

/* ───────── Return / exchange ───────── */
export async function buildReturn(input, user, perms) {
  const settings = await getSettings();
  const sale = await Sale.findById(input.saleId);
  if (!sale || sale.status !== "completed") throw bad("Invoice not found or cancelled", "NOT_FOUND");
  const win = settings.rules.returnWindowDays;
  if (win > 0 && user.role !== "admin" && (Date.now() - sale.date.getTime()) / 86400000 > win) throw bad(`Return window (${win} days) has passed`, "RETURN_WINDOW");
  if (!String(input.reason || "").trim()) throw bad("A reason is required", "REASON_REQUIRED");

  const items = [];
  for (const r of input.items || []) {
    const si = sale.items.id(r.saleItemId);
    if (!si) throw bad("Invoice line not found", "NOT_FOUND");
    const qty = si.unit ? 1 : num(r.qty, 1);
    if (!Number.isInteger(qty) || qty <= 0) throw bad("Invalid quantity", "INVALID_QTY");
    if (qty > si.qty - si.returnedQty) throw bad("Cannot return more than what was sold", "RETURN_EXCEEDS");
    if (items.some((x) => String(x.saleItem) === String(si._id))) throw bad("Line selected twice", "INVALID_QTY");
    const condition = ["sellable", "defective", "review"].includes(r.condition) ? r.condition : "review";
    items.push({ saleItem: si._id, product: si.product, name: si.name, unit: si.unit, imei: si.imei, qty, net: r2((si.net / si.qty) * qty), cost: si.cost, reason: r.reason || input.reason, condition });
  }
  const newItems = [];
  const seen = new Set();
  for (const n of input.newItems || []) {
    const l = await prepareLine(n, perms, seen);
    newItems.push({ product: l.product._id, name: l.product.name, unit: l.unit?._id, imei: l.unit?.imei1 || "", qty: l.qty, price: l.price, discount: l.discount, net: r2(l.price * l.qty - l.discount), cost: l.cost, warrantyMonths: l.months || 0 });
  }
  if (!items.length) throw bad("Select at least one item to return", "NO_ITEMS");
  const refundValue = r2(items.reduce((a, i) => a + i.net, 0));
  const newTotal = r2(newItems.reduce((a, i) => a + i.net, 0));
  const needApproval = settings.rules.returnNeedsApproval && !perms.approveReturn;
  const ret = await Return.create({
    no: await nextNo("ret", "RET"), sale: sale._id, customer: sale.customer, type: newItems.length ? "exchange" : "return", items, newItems, refundValue, newTotal,
    status: "pending", reason: input.reason, note: input.note || "", user: user._id,
    settle: { payType: input.payType || "cash", paid: num(input.paid), method: input.method || "cash", accountId: input.accountId || null },
  });
  if (needApproval) { await audit(user, "return-request", "returns", ret, { reason: input.reason }); return ret.toObject(); }
  try { return await applyReturn(ret._id, user); } catch (e) { await Return.deleteOne({ _id: ret._id }); throw e; }
}

export async function applyReturn(returnId, approver) {
  const ret = await Return.findById(returnId);
  if (!ret || ret.status === "rejected") throw bad("Return not found", "NOT_FOUND");
  if (ret.applied) throw bad("Already applied", "ALREADY_DONE");
  const sale = await Sale.findById(ret.sale);
  if (!sale || sale.status !== "completed") throw bad("Invoice not found or cancelled", "NOT_FOUND");
  const settings = await getSettings();
  const undo = new Undo();
  const refRet = { kind: "return", id: ret._id, no: ret.no };
  try {
    for (const it of ret.items) { // re-validate (stock of the invoice may have changed while pending)
      const si = sale.items.id(it.saleItem);
      if (!si || it.qty > si.qty - si.returnedQty) throw bad("Cannot return more than what was sold", "RETURN_EXCEEDS");
    }
    // 1) new items out of stock
    for (const n of ret.newItems) {
      if (n.unit) await takeUnit(n.unit, undo); else await takeItem({ _id: n.product, kind: (await Product.findById(n.product)).kind, name: n.name }, n.qty, undo);
    }
    // 2) money settlement
    let credit = ret.refundValue;
    const debtReduced = r2(Math.min(credit, sale.due));
    credit = r2(credit - debtReduced);
    if (debtReduced > 0 && sale.customer) await moveParty("customer", sale.customer, -debtReduced, { type: "adjust", ref: refRet, note: ret.no, user: approver }, undo);
    const toPay = r2(ret.newTotal - credit);
    const st = ret.settle || {};
    let cashReceived = 0, cashRefunded = 0, addedToDebt = 0;
    if (toPay > 0) {
      cashReceived = st.payType === "credit" ? 0 : st.payType === "partial" ? Math.min(toPay, Math.max(0, r2(num(st.paid)))) : toPay;
      addedToDebt = r2(toPay - cashReceived);
      if (addedToDebt > 0 && !sale.customer) throw bad("Customer is required to leave a balance", "CUSTOMER_REQUIRED");
      if (cashReceived > 0) { const acc = await resolveAccount({ accountId: st.accountId, method: st.method }); await postTx({ account: acc._id, dir: "in", amount: cashReceived, cat: "sale", ref: refRet, user: approver }, undo); ret.account = acc._id; }
      if (addedToDebt > 0) await moveParty("customer", sale.customer, addedToDebt, { type: "charge", ref: refRet, note: ret.no, user: approver }, undo);
    } else if (toPay < 0) {
      cashRefunded = r2(-toPay);
      const acc = await resolveAccount({ accountId: st.accountId || sale.account, method: st.method });
      await postTx({ account: acc._id, dir: "out", amount: cashRefunded, cat: "refund", ref: refRet, user: approver, allowOverdraft: settings.rules.allowOverdraft }, undo);
      ret.account = acc._id;
    }
    // 3) returned goods back into stock (by condition)
    for (const it of ret.items) {
      const si = sale.items.id(it.saleItem); si.returnedQty += it.qty;
      if (it.unit) await restoreUnit(it.unit, it.condition, { user: approver, ref: refRet, reason: `${ret.no} (${it.condition})` });
      else { await putItem(it.product, it.qty, it.condition); await logMove({ product: it.product, type: "return", qty: it.condition === "sellable" ? it.qty : 0, reason: `${ret.no} (${it.condition})`, ref: refRet, user: approver._id }); }
      if (si.returnedQty >= si.qty) await Warranty.updateMany({ sale: sale._id, ...(it.unit ? { unit: it.unit } : { product: it.product }) }, { status: "void" });
    }
    // 4) new items bookkeeping
    for (const n of ret.newItems) {
      if (n.unit) await Unit.updateOne({ _id: n.unit }, { sale: sale._id });
      await logMove({ product: n.product, unit: n.unit, type: "exchange_out", qty: -n.qty, reason: ret.no, ref: refRet, user: approver._id });
      if (n.warrantyMonths > 0) {
        const cust = sale.customer ? await Customer.findById(sale.customer) : null; const now = new Date();
        await Warranty.create({ sale: sale._id, saleNo: `${sale.no}/${ret.no}`, customer: sale.customer, customerName: sale.customerName, customerPhone: cust?.phone || "", product: n.product, name: n.name, imei: n.imei, unit: n.unit, months: n.warrantyMonths, startDate: now, endDate: addMonths(now, n.warrantyMonths), terms: settings.warrantyTerms || "" });
      }
    }
    sale.due = r2(sale.due - debtReduced); sale.returnedTotal = r2(sale.returnedTotal + ret.refundValue); sale.refunded = r2(sale.refunded + cashRefunded);
    await sale.save();
    Object.assign(ret, { status: "approved", approvedBy: approver._id, debtReduced, cashRefunded, cashReceived, addedToDebt, applied: true });
    await ret.save();
    await audit(approver, ret.type, "returns", ret, { after: { refundValue: ret.refundValue, newTotal: ret.newTotal }, reason: ret.reason });
    return ret.toObject();
  } catch (e) { await undo.rollback(); throw e; }
}
