import { Router } from "express";
import { Customer, Supplier, Ledger, Sale, Purchase } from "../models/index.js";
import { crud } from "../lib/crud.js";
import { need } from "../lib/auth.js";
import { ah, bad, notFound, isId, paginate, num, r2, audit, Undo } from "../lib/util.js";
import { moveParty, receivePayment } from "../services/money.js";

/** Adds ledger / payment / manual-charge endpoints to a party router. */
const partyExtras = (party, permManage, permView) => (r) => {
  r.get("/:id/ledger", need(...permView), ah(async (req, res) => {
    if (!isId(req.params.id)) throw notFound();
    const q = Ledger.find({ party, partyId: req.params.id }).populate("user", "name");
    res.json(await paginate(q, req, { sortable: ["at"], defaultSort: "-at" }));
  }));
  r.post("/:id/payments", need(...permManage), ah(async (req, res) => {
    const out = await receivePayment(party, { ...req.body, partyId: req.params.id }, req.user);
    await audit(req.user, "payment", party + "s", out.party, { after: { amount: out.amount } });
    res.status(201).json(out);
  }));
  /** Manual charge: opening balance / standalone debt (no invoice). */
  r.post("/:id/charges", need(...permManage), ah(async (req, res) => {
    const amount = r2(num(req.body.amount));
    if (!(amount > 0)) throw bad("Enter an amount greater than zero", "INVALID_AMOUNT");
    if (!String(req.body.note || "").trim()) throw bad("A note is required", "REASON_REQUIRED");
    const { doc, entry } = await moveParty(party, req.params.id, amount, { type: "charge", note: String(req.body.note).trim(), dueDate: req.body.dueDate || undefined, user: req.user });
    await audit(req.user, "manual-charge", party + "s", doc, { after: { amount }, reason: req.body.note });
    res.status(201).json({ party: doc, entry });
  }));
};

export const customers = crud(Customer, {
  read: ["customers.view", "sales.create", "debts.manage"], write: ["customers.manage"], fields: ["name", "phone", "address", "idNumber", "note", "active"],
  search: ["name", "phone"], filters: ["active"], sortable: ["balance"], defaultSort: "name", module: "customers",
  used: async (d) => !!(await Sale.exists({ customer: d._id })) || d.balance !== 0 || !!(await Ledger.exists({ party: "customer", partyId: d._id })),
  extra: partyExtras("customer", ["debts.manage"], ["customers.view", "debts.manage"]),
});
export const suppliers = crud(Supplier, {
  read: ["suppliers.manage", "purchases.view", "purchases.create"], write: ["suppliers.manage"], fields: ["name", "phone", "address", "note", "active"],
  search: ["name", "phone"], filters: ["active"], sortable: ["balance"], defaultSort: "name", module: "suppliers",
  used: async (d) => !!(await Purchase.exists({ supplier: d._id })) || d.balance !== 0,
  extra: partyExtras("supplier", ["suppliers.manage"], ["suppliers.manage", "purchases.view"]),
});

/** Totals shown on the party card. */
export const partyStats = Router();
partyStats.get("/customers/:id/stats", need("customers.view", "debts.manage"), ah(async (req, res) => {
  const sales = await Sale.find({ customer: req.params.id, status: "completed" }).select("total paid due returnedTotal").lean();
  res.json({ count: sales.length, total: r2(sales.reduce((a, s) => a + s.total, 0)), paid: r2(sales.reduce((a, s) => a + s.paid, 0)), returned: r2(sales.reduce((a, s) => a + s.returnedTotal, 0)) });
}));
partyStats.get("/suppliers/:id/stats", need("suppliers.manage", "purchases.view"), ah(async (req, res) => {
  const ps = await Purchase.find({ supplier: req.params.id, status: "completed" }).select("total paid due").lean();
  res.json({ count: ps.length, total: r2(ps.reduce((a, s) => a + s.total, 0)), paid: r2(ps.reduce((a, s) => a + s.paid, 0)) });
}));
