import { Account, Transaction, Shift, Settings, Customer, Supplier, Ledger, Sale, Purchase } from "../models/index.js";
import { bad, r2, nextNo, Undo } from "../lib/util.js";

export async function getSettings() {
  return (await Settings.findOne({ key: "main" })) || (await Settings.create({ key: "main" }));
}

export async function resolveAccount({ accountId, method } = {}) {
  if (accountId) {
    const a = await Account.findOne({ _id: accountId, active: true });
    if (!a) throw bad("Account not found", "ACCOUNT_NOT_FOUND");
    return a;
  }
  const type = method === "bank" ? "bank" : method === "digital" ? "digital" : "cash";
  const a = (await Account.findOne({ type, active: true, isDefault: true })) || (await Account.findOne({ type, active: true })) ||
    (await Account.findOne({ active: true, isDefault: true })) || (await Account.findOne({ active: true }));
  if (!a) throw bad("No financial account configured", "ACCOUNT_NOT_FOUND");
  return a;
}

/** Atomically moves money in/out of an account and writes the transaction row. */
export async function postTx({ account, dir, amount, cat, ref, party, note, user, at, allowOverdraft, transferId }, undo) {
  amount = r2(amount);
  if (!(amount > 0)) return null;
  const filter = dir === "out" && !allowOverdraft ? { _id: account, balance: { $gte: amount - 0.001 } } : { _id: account };
  const acc = await Account.findOneAndUpdate(filter, { $inc: { balance: dir === "in" ? amount : -amount } }, { new: true });
  if (!acc) throw bad("Insufficient funds in this account", "INSUFFICIENT_FUNDS");
  const shift = user ? await Shift.findOne({ account, user: user._id, status: "open" }).select("_id") : null;
  const tx = await Transaction.create({ account, dir, amount, cat, ref, party, note, user: user?._id, at: at || new Date(), shift: shift?._id, transferId });
  undo?.add(async () => { await Transaction.deleteOne({ _id: tx._id }); await Account.updateOne({ _id: account }, { $inc: { balance: dir === "in" ? -amount : amount } }); });
  return tx;
}

export async function assertShift(user, account, settings) {
  if (!settings.rules.requireShift || account.type !== "cash") return;
  const open = await Shift.findOne({ account: account._id, user: user._id, status: "open" });
  if (!open) throw bad("Open your cash shift first", "SHIFT_REQUIRED");
}

/** Changes a customer's/supplier's outstanding balance and records the ledger row. */
export async function moveParty(party, id, delta, { type, ref, note, dueDate, user, at } = {}, undo, { guard = false } = {}) {
  const Model = party === "customer" ? Customer : Supplier;
  delta = r2(delta);
  const filter = { _id: id };
  if (guard && delta < 0) filter.balance = { $gte: -delta - 0.005 };
  const doc = await Model.findOneAndUpdate(filter, { $inc: { balance: delta } }, { new: true });
  if (!doc) throw bad(guard ? "Amount is more than the outstanding balance" : `${party} not found`, guard ? "OVER_BALANCE" : "NOT_FOUND");
  const entry = await Ledger.create({ party, partyId: id, type, delta, balanceAfter: r2(doc.balance), ref, note, dueDate, user: user?._id, at: at || new Date() });
  undo?.add(async () => { await Model.updateOne({ _id: id }, { $inc: { balance: -delta } }); await Ledger.deleteOne({ _id: entry._id }); });
  return { doc, entry };
}

/** Spreads a payment over the oldest unpaid documents (FIFO) so each invoice shows its true remaining due. */
export async function allocate(DocModel, filter, amount, undo) {
  let left = r2(amount);
  const docs = await DocModel.find({ ...filter, due: { $gt: 0 } }).sort({ date: 1 });
  const out = [];
  for (const d of docs) {
    if (left <= 0) break;
    const take = r2(Math.min(left, d.due));
    await DocModel.updateOne({ _id: d._id }, { $inc: { paid: take, due: -take } });
    undo?.add(() => DocModel.updateOne({ _id: d._id }, { $inc: { paid: -take, due: take } }));
    out.push({ id: d._id, no: d.no, amount: take });
    left = r2(left - take);
  }
  return out;
}

export async function receivePayment(party, input, user) {
  const Model = party === "customer" ? Customer : Supplier;
  const amount = r2(input.amount);
  if (!(amount > 0)) throw bad("Enter an amount greater than zero", "INVALID_AMOUNT");
  const p = await Model.findById(input.partyId);
  if (!p) throw bad(`${party} not found`, "NOT_FOUND");
  if (amount > p.balance + 0.005) throw bad("Amount is more than the outstanding balance", "OVER_BALANCE");
  const settings = await getSettings();
  const acc = await resolveAccount({ accountId: input.accountId, method: input.method });
  const undo = new Undo();
  try {
    const no = await nextNo(party === "customer" ? "rcp" : "pay", party === "customer" ? "RCP" : "PAY");
    const isC = party === "customer";
    const tx = await postTx({
      account: acc._id, dir: isC ? "in" : "out", amount, cat: isC ? "customer_payment" : "supplier_payment",
      ref: { kind: party, id: p._id, no }, party: { kind: party, id: p._id, name: p.name }, note: input.note || "", user,
      allowOverdraft: !isC && settings.rules.allowOverdraft,
    }, undo);
    await moveParty(party, p._id, -amount, { type: "payment", ref: { kind: "tx", id: tx._id, no }, note: input.note || "", user }, undo, { guard: true });
    const allocated = await allocate(isC ? Sale : Purchase, isC ? { customer: p._id, status: "completed" } : { supplier: p._id, status: "completed" }, amount, undo);
    const fresh = await Model.findById(p._id).lean();
    return { no, amount, balance: fresh.balance, party: fresh, tx, allocated, account: acc.name };
  } catch (e) { await undo.rollback(); throw e; }
}
