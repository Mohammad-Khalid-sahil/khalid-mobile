import { Router } from "express";
import { Employee, SalaryPayment, User } from "../models/index.js";
import { crud } from "../lib/crud.js";
import { ah, bad, notFound, isId, paginate, num, r2, audit, Undo } from "../lib/util.js";
import { need } from "../lib/auth.js";
import { postTx, resolveAccount, getSettings } from "../services/money.js";

const period = (p) => (/^\d{4}-\d{2}$/.test(p || "") ? p : new Date().toISOString().slice(0, 7));

export const employees = crud(Employee, {
  read: ["employees.manage", "salaries.manage"], write: ["employees.manage"], fields: ["name", "phone", "position", "address", "startDate", "salary", "note", "user", "active"],
  search: ["name", "phone", "position"], filters: ["active"], defaultSort: "name", module: "employees", populate: { path: "user", select: "name username" },
  used: async (d) => !!(await SalaryPayment.exists({ employee: d._id })),
  extra: (r) => {
    r.get("/:id/summary", need("employees.manage", "salaries.manage"), ah(async (req, res) => {
      const e = await Employee.findById(req.params.id).lean(); if (!e) throw notFound();
      const p = period(req.query.period);
      const pays = await SalaryPayment.find({ employee: e._id, period: p, kind: "salary" }).lean();
      const credited = r2(pays.reduce((a, x) => a + x.amount + x.deduction, 0));
      res.json({ period: p, salary: e.salary, credited, paid: r2(pays.reduce((a, x) => a + x.amount, 0)), remaining: r2(Math.max(0, e.salary - credited)), advanceBalance: e.advanceBalance });
    }));
  },
});

export const salaries = Router();
salaries.get("/", need("salaries.manage", "employees.manage"), ah(async (req, res) => {
  const f = {}; if (req.query.employee) f.employee = req.query.employee; if (req.query.period) f.period = req.query.period; if (req.query.kind) f.kind = req.query.kind;
  res.json(await paginate(SalaryPayment.find(f).populate("employee", "name").populate("account", "name").populate("user", "name"), req, { sortable: ["date", "amount"], defaultSort: "-date" }));
}));
salaries.post("/", need("salaries.manage"), ah(async (req, res) => {
  const emp = await Employee.findById(req.body.employeeId); if (!emp || !emp.active) throw bad("Employee not found", "NOT_FOUND");
  const kind = req.body.kind === "advance" ? "advance" : "salary";
  const amount = r2(num(req.body.amount)); const deduction = kind === "salary" ? r2(num(req.body.deduction)) : 0;
  if (amount < 0 || deduction < 0 || amount + deduction <= 0) throw bad("Enter an amount greater than zero", "INVALID_AMOUNT");
  const p = period(req.body.period);
  if (kind === "salary") {
    const done = await SalaryPayment.find({ employee: emp._id, period: p, kind: "salary" }).lean();
    const credited = r2(done.reduce((a, x) => a + x.amount + x.deduction, 0));
    if (r2(credited + amount + deduction) > emp.salary + 0.005) throw bad(`Payment exceeds the remaining salary for ${p}`, "SALARY_EXCEEDED");
    if (deduction > emp.advanceBalance + 0.005) throw bad("Deduction is more than the employee's advance balance", "OVER_BALANCE");
  }
  const settings = await getSettings(); const undo = new Undo();
  try {
    const acc = await resolveAccount({ accountId: req.body.accountId, method: req.body.method });
    const pay = await SalaryPayment.create({ employee: emp._id, kind, amount, deduction, period: p, date: req.body.date ? new Date(req.body.date) : new Date(), account: acc._id, note: req.body.note || "", user: req.user._id });
    undo.add(() => SalaryPayment.deleteOne({ _id: pay._id }));
    await postTx({ account: acc._id, dir: "out", amount, cat: "salary", ref: { kind: kind === "salary" ? "salary" : "advance", id: pay._id, no: emp.name }, note: `${kind} ${p}`, user: req.user, allowOverdraft: settings.rules.allowOverdraft }, undo);
    const delta = kind === "advance" ? amount : -deduction;
    if (delta) { await Employee.updateOne({ _id: emp._id }, { $inc: { advanceBalance: delta } }); }
    await audit(req.user, kind, "salaries", emp, { after: { amount, deduction, period: p } });
    res.status(201).json(pay);
  } catch (e) { await undo.rollback(); throw e; }
}));
