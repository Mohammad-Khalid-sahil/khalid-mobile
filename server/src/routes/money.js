import { Router } from "express";
import mongoose from "mongoose";
import { Account, Transaction, Shift, Expense, Settings } from "../models/index.js";
import { ah, bad, notFound, isId, paginate, rx, range, num, r2, audit, Undo, nextNo } from "../lib/util.js";
import { need } from "../lib/auth.js";
import { can } from "../lib/perms.js";
import { postTx, resolveAccount, getSettings } from "../services/money.js";

const r = Router();
const CASH = ["cashbox.view", "accounts.manage", "expenses.manage"];

/* ── accounts ── */
r.get("/", need(...CASH, "sales.create", "purchases.create", "debts.manage"), ah(async (req, res) => {
  const f = req.query.all === "1" ? {} : { active: true };
  res.json(await Account.find(f).sort({ isDefault: -1, createdAt: 1 }).lean());
}));
r.post("/", need("accounts.manage"), ah(async (req, res) => {
  const { name, type = "cash", note = "", isDefault = false } = req.body;
  if (!String(name || "").trim()) throw bad("Name is required", "NAME_REQUIRED");
  const opening = r2(num(req.body.openingBalance));
  if (opening < 0) throw bad("Invalid amount", "INVALID_AMOUNT");
  if (isDefault) await Account.updateMany({ type }, { isDefault: false });
  const a = await Account.create({ name: String(name).trim(), type, note, isDefault: !!isDefault, balance: 0 });
  if (opening > 0) await postTx({ account: a._id, dir: "in", amount: opening, cat: "opening", note: "Opening balance", user: req.user });
  await audit(req.user, "create", "accounts", a);
  res.status(201).json(await Account.findById(a._id));
}));
r.put("/:id", need("accounts.manage"), ah(async (req, res) => {
  const a = await Account.findById(req.params.id); if (!a) throw notFound();
  for (const k of ["name", "type", "note", "active"]) if (req.body[k] !== undefined) a[k] = req.body[k];
  if (req.body.isDefault) { await Account.updateMany({ type: a.type, _id: { $ne: a._id } }, { isDefault: false }); a.isDefault = true; }
  await a.save(); await audit(req.user, "update", "accounts", a); res.json(a);
}));

/* ── transactions ── */
r.get("/transactions", need("cashbox.view", "accounts.manage"), ah(async (req, res) => {
  const f = {}; for (const k of ["account", "cat", "dir", "shift"]) if (req.query[k]) f[k] = req.query[k];
  if (req.query.from) { const { from, to } = range(req.query); f.at = { $gte: from, $lt: to }; }
  if (req.query.q) f.$or = [{ note: rx(req.query.q) }, { "ref.no": rx(req.query.q) }, { "party.name": rx(req.query.q) }];
  const q = Transaction.find(f).populate("account", "name").populate("user", "name");
  res.json(await paginate(q, req, { sortable: ["at", "amount"], defaultSort: "-at" }));
}));

r.get("/summary", need("cashbox.view", "accounts.manage"), ah(async (req, res) => {
  const { from, to } = range(req.query);
  const tx = await Transaction.find({ at: { $gte: from, $lt: to }, cat: { $nin: ["transfer", "opening"] } }).lean();
  const acc = await Account.find({ active: true }).lean();
  res.json({ accounts: acc, total: r2(acc.reduce((a, x) => a + x.balance, 0)), in: r2(tx.filter((t) => t.dir === "in").reduce((a, t) => a + t.amount, 0)), out: r2(tx.filter((t) => t.dir === "out").reduce((a, t) => a + t.amount, 0)) });
}));

r.post("/manual", need("cashbox.manual"), ah(async (req, res) => {
  const amount = r2(num(req.body.amount)); if (!(amount > 0)) throw bad("Enter an amount greater than zero", "INVALID_AMOUNT");
  if (!String(req.body.note || "").trim()) throw bad("A note is required", "REASON_REQUIRED");
  const dir = req.body.dir === "out" ? "out" : "in"; const acc = await resolveAccount({ accountId: req.body.account });
  const settings = await getSettings();
  const over = dir === "out" && req.body.override && req.user.role === "admin";
  const tx = await postTx({ account: acc._id, dir, amount, cat: "manual", note: String(req.body.note).trim(), user: req.user, allowOverdraft: over || settings.rules.allowOverdraft });
  await audit(req.user, `manual-${dir}`, "cashbox", { _id: tx._id, no: acc.name }, { after: { amount }, reason: req.body.note });
  res.status(201).json(tx);
}));

r.post("/transfer", need("cashbox.manual", "accounts.manage"), ah(async (req, res) => {
  const amount = r2(num(req.body.amount)); if (!(amount > 0)) throw bad("Enter an amount greater than zero", "INVALID_AMOUNT");
  const { from, to } = req.body; if (!from || !to || String(from) === String(to)) throw bad("Choose two different accounts", "SAME_ACCOUNT");
  const [a, b] = await Promise.all([Account.findOne({ _id: from, active: true }), Account.findOne({ _id: to, active: true })]);
  if (!a || !b) throw bad("Account not found", "ACCOUNT_NOT_FOUND");
  const over = !!req.body.override && req.user.role === "admin";
  if (over && !String(req.body.note || "").trim()) throw bad("A reason is required to overdraw an account", "REASON_REQUIRED");
  const undo = new Undo(); const transferId = new mongoose.Types.ObjectId();
  try {
    const no = await nextNo("transfer", "TRF");
    const ref = { kind: "transfer", id: transferId, no };
    const out = await postTx({ account: a._id, dir: "out", amount, cat: "transfer", ref, note: `→ ${b.name}. ${req.body.note || ""}`.trim(), user: req.user, allowOverdraft: over, transferId }, undo);
    const inn = await postTx({ account: b._id, dir: "in", amount, cat: "transfer", ref, note: `← ${a.name}. ${req.body.note || ""}`.trim(), user: req.user, transferId }, undo);
    await audit(req.user, "transfer", "cashbox", { _id: transferId, no }, { after: { from: a.name, to: b.name, amount }, reason: req.body.note });
    res.status(201).json({ no, out, in: inn });
  } catch (e) { await undo.rollback(); throw e; }
}));

/* ── shifts ── */
const expectedOf = async (s) => {
  const tx = await Transaction.find({ shift: s._id }).select("dir amount").lean();
  return r2(s.openingBalance + tx.reduce((a, t) => a + (t.dir === "in" ? t.amount : -t.amount), 0));
};
r.get("/shifts", need("cashbox.view"), ah(async (req, res) => {
  const f = {}; if (!can(req.user, "accounts.manage")) f.user = req.user._id; if (req.query.status) f.status = req.query.status;
  const out = await paginate(Shift.find(f).populate("account", "name").populate("user", "name"), req, { sortable: ["openedAt"], defaultSort: "-openedAt" });
  for (const s of out.rows) if (s.status === "open") s.expected = await expectedOf(s);
  res.json(out);
}));
r.get("/shifts/current", need("cashbox.view", "sales.create"), ah(async (req, res) => {
  const list = await Shift.find({ user: req.user._id, status: "open" }).populate("account", "name").lean();
  for (const s of list) s.expected = await expectedOf(s);
  res.json(list);
}));
r.post("/shifts/open", need("cashbox.view", "sales.create"), ah(async (req, res) => {
  const acc = await resolveAccount({ accountId: req.body.account, method: "cash" });
  if (await Shift.exists({ user: req.user._id, account: acc._id, status: "open" })) throw bad("You already have an open shift on this account", "SHIFT_OPEN");
  const s = await Shift.create({ account: acc._id, user: req.user._id, openingBalance: r2(num(req.body.openingBalance, acc.balance)) });
  await audit(req.user, "open-shift", "cashbox", { _id: s._id, no: acc.name }, { after: { openingBalance: s.openingBalance } });
  res.status(201).json(s);
}));
r.post("/shifts/:id/close", need("cashbox.view", "sales.create"), ah(async (req, res) => {
  const s = await Shift.findById(req.params.id); if (!s || s.status !== "open") throw bad("Shift is not open", "SHIFT_CLOSED");
  if (String(s.user) !== String(req.user._id) && req.user.role !== "admin") throw bad("This is not your shift", "FORBIDDEN");
  const closing = r2(num(req.body.closingBalance, NaN)); if (!Number.isFinite(closing) || closing < 0) throw bad("Enter the counted cash", "INVALID_AMOUNT");
  s.expected = await expectedOf(s); s.closingBalance = closing; s.difference = r2(closing - s.expected); s.closedAt = new Date(); s.status = "closed"; s.note = req.body.note || "";
  await s.save(); await audit(req.user, "close-shift", "cashbox", { _id: s._id, no: String(s._id).slice(-6) }, { after: { expected: s.expected, closing, difference: s.difference } });
  res.json(s);
}));

/* ── expenses ── */
export const expenses = Router();
expenses.get("/", need("expenses.manage", "reports.view"), ah(async (req, res) => {
  const f = {}; if (req.query.category) f.category = req.query.category; if (req.query.status) f.status = req.query.status;
  if (req.query.from) { const { from, to } = range(req.query); f.date = { $gte: from, $lt: to }; }
  if (req.query.q) f.$or = [{ title: rx(req.query.q) }, { note: rx(req.query.q) }];
  const out = await paginate(Expense.find(f).populate("user", "name").populate("account", "name"), req, { sortable: ["date", "amount"], defaultSort: "-date" });
  const all = await Expense.find({ ...f, status: "active" }).select("amount category").lean();
  const byCategory = {}; for (const e of all) byCategory[e.category] = r2((byCategory[e.category] || 0) + e.amount);
  res.json({ ...out, sum: r2(all.reduce((a, e) => a + e.amount, 0)), byCategory });
}));
expenses.post("/", need("expenses.manage"), ah(async (req, res) => {
  const amount = r2(num(req.body.amount)); if (!(amount > 0)) throw bad("Enter an amount greater than zero", "INVALID_AMOUNT");
  if (!String(req.body.title || "").trim()) throw bad("Title is required", "NAME_REQUIRED");
  const settings = await getSettings(); const acc = await resolveAccount({ accountId: req.body.accountId, method: req.body.method });
  const undo = new Undo();
  try {
    const e = await Expense.create({ title: String(req.body.title).trim(), category: req.body.category || "سایر", amount, date: req.body.date ? new Date(req.body.date) : new Date(), account: acc._id, method: req.body.method || "cash", note: req.body.note || "", user: req.user._id });
    undo.add(() => Expense.deleteOne({ _id: e._id }));
    await postTx({ account: acc._id, dir: "out", amount, cat: "expense", ref: { kind: "expense", id: e._id, no: e.title }, note: e.title, user: req.user, at: e.date, allowOverdraft: settings.rules.allowOverdraft }, undo);
    await audit(req.user, "create", "expenses", e); res.status(201).json(e);
  } catch (err) { await undo.rollback(); throw err; }
}));
expenses.patch("/:id", need("expenses.manage"), ah(async (req, res) => {
  const e = await Expense.findById(req.params.id); if (!e || e.status !== "active") throw notFound();
  if (!String(req.body.reason || "").trim()) throw bad("A reason is required", "REASON_REQUIRED");
  const before = { title: e.title, category: e.category, note: e.note };
  for (const k of ["title", "category", "note"]) if (req.body[k] !== undefined) e[k] = req.body[k];
  await e.save(); await audit(req.user, "edit", "expenses", e, { before, after: { title: e.title, category: e.category, note: e.note }, reason: req.body.reason }); res.json(e);
}));
expenses.post("/:id/cancel", need("expenses.manage"), ah(async (req, res) => {
  const e = await Expense.findById(req.params.id); if (!e || e.status !== "active") throw bad("Expense not found", "NOT_FOUND");
  if (!String(req.body.reason || "").trim()) throw bad("A reason is required", "REASON_REQUIRED");
  await postTx({ account: e.account, dir: "in", amount: e.amount, cat: "refund", ref: { kind: "expense", id: e._id, no: e.title }, note: `Cancel: ${e.title}`, user: req.user });
  Object.assign(e, { status: "cancelled", cancelReason: req.body.reason }); await e.save();
  await audit(req.user, "cancel", "expenses", e, { reason: req.body.reason }); res.json(e);
}));
export default r;
