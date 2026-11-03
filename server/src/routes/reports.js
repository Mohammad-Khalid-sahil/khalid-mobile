import { Router } from "express";
import { Sale, Return, Purchase, Product, Unit, Brand, Category, Transaction, Account, Customer, Supplier, Expense, SalaryPayment, Warranty, WarrantyClaim, Repair, User } from "../models/index.js";
import { ah, range, r2, bucketKey, localDay } from "../lib/util.js";
import { need } from "../lib/auth.js";
import { can } from "../lib/perms.js";
import { getSettings } from "../services/money.js";

const r = Router();
const sum = (a, f) => r2(a.reduce((x, y) => x + f(y), 0));
const lineProfit = (net, cost, qty) => (cost > 0 ? net - cost * qty : null);

async function loadSales(from, to, user) {
  const f = { status: "completed", date: { $gte: from, $lt: to } };
  if (user && !can(user, "sales.viewAll")) f.user = user._id;
  const sales = await Sale.find(f).lean();
  const ids = sales.map((s) => s._id);
  const returns = await Return.find({ status: "approved", date: { $gte: from, $lt: to }, ...(user && !can(user, "sales.viewAll") ? { sale: { $in: ids } } : {}) }).lean();
  return { sales, returns };
}

/** Profit of a set of sales/returns using only lines whose purchase cost is known. */
function profitOf(sales, returns) {
  let profit = 0, unknown = 0;
  for (const s of sales) for (const i of s.items) { const p = lineProfit(i.net, i.cost, i.qty); if (p == null) unknown++; else profit += p; }
  for (const x of returns) {
    for (const i of x.items) { const p = lineProfit(i.net, i.cost, i.qty); if (p != null) profit -= p; }
    for (const i of x.newItems) { const p = lineProfit(i.net, i.cost, i.qty); if (p == null) unknown++; else profit += p; }
  }
  return { profit: r2(profit), unknownCost: unknown };
}
const lineDiscount = (s) => r2(s.discount + s.items.reduce((a, i) => a + i.discount, 0));

/* ───────── Sales ───────── */
r.get("/sales", need("reports.view"), ah(async (req, res) => {
  const { from, to } = range(req.query); const group = ["day", "week", "month", "year"].includes(req.query.group) ? req.query.group : "day";
  const showProfit = can(req.user, "reports.profit");
  const { sales, returns } = await loadSales(from, to, req.user);
  const map = new Map(); const row = (k) => { if (!map.has(k)) map.set(k, { key: k, count: 0, gross: 0, discount: 0, total: 0, returns: 0, exchanges: 0, net: 0, cash: 0, credit: 0, partial: 0, _s: [], _r: [] }); return map.get(k); };
  for (const s of sales) { const x = row(bucketKey(s.date, group)); x.count++; x.gross += s.subtotal + s.items.reduce((a, i) => a + i.discount, 0); x.discount += lineDiscount(s); x.total += s.total; x[s.payType]++; x._s.push(s); }
  for (const t of returns) { const x = row(bucketKey(t.date, group)); x.returns += t.refundValue; x.exchanges += t.newTotal; x._r.push(t); }
  const rows = [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1)).map((x) => {
    const o = { key: x.key, count: x.count, gross: r2(x.gross), discount: r2(x.discount), total: r2(x.total), returns: r2(x.returns), exchanges: r2(x.exchanges), net: r2(x.total - x.returns + x.exchanges), cash: x.cash, credit: x.credit, partial: x.partial };
    if (showProfit) Object.assign(o, profitOf(x._s, x._r)); return o;
  });
  const totals = { count: sum(rows, (x) => x.count), gross: sum(rows, (x) => x.gross), discount: sum(rows, (x) => x.discount), total: sum(rows, (x) => x.total), returns: sum(rows, (x) => x.returns), exchanges: sum(rows, (x) => x.exchanges), net: sum(rows, (x) => x.net), cash: sum(rows, (x) => x.cash), credit: sum(rows, (x) => x.credit), partial: sum(rows, (x) => x.partial) };
  if (showProfit) Object.assign(totals, profitOf(sales, returns));
  res.json({ rows, totals, group });
}));

r.get("/sales-by", need("reports.view"), ah(async (req, res) => {
  const { from, to } = range(req.query); const dim = req.query.dim || "product"; const showProfit = can(req.user, "reports.profit");
  const { sales } = await loadSales(from, to, req.user);
  const [products, brands, cats, users] = await Promise.all([Product.find().select("brand category").lean(), Brand.find().lean(), Category.find().lean(), User.find().select("name").lean()]);
  const pm = new Map(products.map((p) => [String(p._id), p])); const bn = new Map(brands.map((b) => [String(b._id), b.name])); const cn = new Map(cats.map((c) => [String(c._id), c.name])); const un = new Map(users.map((u) => [String(u._id), u.name]));
  const map = new Map();
  for (const s of sales) for (const i of s.items) {
    const p = pm.get(String(i.product));
    const key = dim === "brand" ? bn.get(String(p?.brand)) || "—" : dim === "category" ? cn.get(String(p?.category)) || "—" : dim === "customer" ? s.customerName || "—" : dim === "seller" ? un.get(String(s.user)) || "—" : dim === "payType" ? s.payType : i.name;
    const x = map.get(key) || { name: key, qty: 0, revenue: 0, discount: 0, profit: 0, unknownCost: 0 };
    x.qty += i.qty; x.revenue += i.net; x.discount += i.discount; const pr = lineProfit(i.net, i.cost, i.qty); if (pr == null) x.unknownCost++; else x.profit += pr; map.set(key, x);
  }
  const rows = [...map.values()].map((x) => ({ name: x.name, qty: x.qty, revenue: r2(x.revenue), discount: r2(x.discount), ...(showProfit ? { profit: r2(x.profit), unknownCost: x.unknownCost } : {}) })).sort((a, b) => b.revenue - a.revenue);
  res.json({ rows, dim });
}));

/* ───────── Inventory ───────── */
r.get("/inventory", need("reports.view", "inventory.view"), ah(async (req, res) => {
  const f = { active: true, kind: { $ne: "service" } };
  const list = await Product.find(f).populate("brand", "name").populate("category", "name").sort({ name: 1 }).lean();
  const cost = can(req.user, "products.viewCost");
  let rows = list.map((p) => ({ id: p._id, name: p.name, kind: p.kind, brand: p.brand?.name || "", category: p.category?.name || "", qty: p.qty, defective: p.defectiveQty, minStock: p.minStock, sell: p.sell, ...(cost ? { buy: p.buy, value: r2(p.qty * p.buy) } : {}), retail: r2(p.qty * p.sell), status: p.qty <= 0 ? "out" : p.qty <= p.minStock ? "low" : "in" }));
  if (req.query.filter === "low") rows = rows.filter((x) => x.status === "low"); else if (req.query.filter === "out") rows = rows.filter((x) => x.status === "out");
  const flagged = await Unit.countDocuments({ flagged: true, status: { $ne: "cancelled" } });
  const unitStatus = await Unit.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]).catch(() => []);
  res.json({ rows, totals: { units: sum(rows, (x) => x.qty), defective: sum(rows, (x) => x.defective), ...(cost ? { value: sum(rows, (x) => x.value || 0) } : {}), retail: sum(rows, (x) => x.retail) }, flaggedImei: flagged, unitStatus: Object.fromEntries(unitStatus.map((s) => [s._id, s.n])) });
}));

/* ───────── Purchases ───────── */
r.get("/purchases", need("reports.view"), ah(async (req, res) => {
  const { from, to } = range(req.query); const dim = req.query.dim || "period"; const group = ["day", "week", "month", "year"].includes(req.query.group) ? req.query.group : "day";
  const list = await Purchase.find({ status: "completed", date: { $gte: from, $lt: to } }).populate("supplier", "name").lean();
  const [products, brands] = await Promise.all([Product.find().select("brand").lean(), Brand.find().lean()]);
  const pm = new Map(products.map((p) => [String(p._id), p])); const bn = new Map(brands.map((b) => [String(b._id), b.name]));
  const map = new Map(); const add = (k, v) => { const x = map.get(k) || { name: k, count: 0, qty: 0, total: 0, paid: 0, due: 0 }; for (const [a, b] of Object.entries(v)) x[a] += b; map.set(k, x); };
  for (const p of list) {
    if (dim === "period" || dim === "supplier") add(dim === "period" ? bucketKey(p.date, group) : p.supplier?.name || p.sellerName || "—", { count: 1, qty: p.items.reduce((a, i) => a + i.qty, 0), total: p.total, paid: p.paid, due: p.due });
    else for (const i of p.items) add(dim === "brand" ? bn.get(String(pm.get(String(i.product))?.brand)) || "—" : i.name, { count: 0, qty: i.qty, total: i.total, paid: 0, due: 0 });
  }
  const rows = [...map.values()].map((x) => ({ ...x, total: r2(x.total), paid: r2(x.paid), due: r2(x.due) })).sort((a, b) => (dim === "period" ? (a.name < b.name ? 1 : -1) : b.total - a.total));
  res.json({ rows, totals: { count: sum(rows, (x) => x.count), qty: sum(rows, (x) => x.qty), total: sum(rows, (x) => x.total), paid: sum(rows, (x) => x.paid), due: sum(rows, (x) => x.due) }, dim });
}));

/* ───────── Finance ───────── */
async function finance(from, to, withProfit) {
  const [tx, accounts, customers, suppliers, expenses, salaries, repairs] = await Promise.all([
    Transaction.find({ at: { $gte: from, $lt: to }, cat: { $nin: ["transfer", "opening"] } }).lean(),
    Account.find({ active: true }).lean(), Customer.find({ balance: { $gt: 0 } }).lean(), Supplier.find({ balance: { $gt: 0 } }).lean(),
    Expense.find({ status: "active", date: { $gte: from, $lt: to } }).lean(), SalaryPayment.find({ date: { $gte: from, $lt: to } }).lean(),
    Repair.find({ status: "delivered", deliveredAt: { $gte: from, $lt: to } }).lean(),
  ]);
  const by = (dir) => { const m = {}; for (const t of tx.filter((t) => t.dir === dir)) m[t.cat] = r2((m[t.cat] || 0) + t.amount); return m; };
  const receipts = by("in"), payments = by("out");
  const expByCat = {}; for (const e of expenses) expByCat[e.category] = r2((expByCat[e.category] || 0) + e.amount);
  const salaryExpense = sum(salaries.filter((s) => s.kind === "salary"), (s) => s.amount + s.deduction);
  const out = {
    receipts, payments, receiptsTotal: sum(tx.filter((t) => t.dir === "in"), (t) => t.amount), paymentsTotal: sum(tx.filter((t) => t.dir === "out"), (t) => t.amount),
    accounts: accounts.map((a) => ({ id: a._id, name: a.name, type: a.type, balance: a.balance })), cashTotal: sum(accounts, (a) => a.balance),
    customerDebt: sum(customers, (c) => c.balance), supplierDebt: sum(suppliers, (c) => c.balance), debtors: customers.length, creditors: suppliers.length,
    expenses: sum(expenses, (e) => e.amount), expensesByCategory: expByCat, salaries: salaryExpense, advances: sum(salaries.filter((s) => s.kind === "advance"), (s) => s.amount),
  };
  if (withProfit) {
    const { sales, returns } = await loadSales(from, to);
    const p = profitOf(sales, returns);
    const repairProfit = sum(repairs, (x) => x.checkFee + x.laborFee + x.parts.reduce((a, q) => a + (q.price - q.cost) * q.qty, 0));
    Object.assign(out, { revenue: r2(sum(sales, (s) => s.total) - sum(returns, (x) => x.refundValue) + sum(returns, (x) => x.newTotal)), grossProfit: p.profit, unknownCost: p.unknownCost, repairProfit, netProfit: r2(p.profit + repairProfit - out.expenses - salaryExpense) });
  }
  return out;
}
r.get("/finance", need("reports.view"), ah(async (req, res) => { const { from, to } = range(req.query); res.json(await finance(from, to, can(req.user, "reports.profit"))); }));

/* ───────── Warranty & service ───────── */
r.get("/warranty", need("reports.view", "warranty.manage"), ah(async (req, res) => {
  const s = await getSettings(); const now = new Date(); const soon = new Date(Date.now() + s.rules.warrantyAlertDays * 86400000);
  const [active, expiring, expired, voided, claims] = await Promise.all([
    Warranty.countDocuments({ status: "active", endDate: { $gte: now } }), Warranty.countDocuments({ status: "active", endDate: { $gte: now, $lte: soon } }),
    Warranty.countDocuments({ status: "active", endDate: { $lt: now } }), Warranty.countDocuments({ status: "void" }), WarrantyClaim.find().lean(),
  ]);
  const byStatus = {}; for (const c of claims) byStatus[c.status] = (byStatus[c.status] || 0) + 1;
  const { from, to } = range(req.query);
  const reps = s.modules.repairs ? await Repair.find({ receivedAt: { $gte: from, $lt: to } }).lean() : [];
  res.json({ active, expiring, expired, void: voided, claims: claims.length, claimsByStatus: byStatus, claimCost: sum(claims, (c) => c.cost), repairs: { total: reps.length, open: reps.filter((x) => !["delivered", "cancelled"].includes(x.status)).length, done: reps.filter((x) => x.status === "delivered").length, income: sum(reps, (x) => x.paid) } });
}));

/* ───────── Dashboard ───────── */
r.get("/dashboard", need("dashboard.view"), ah(async (req, res) => {
  const u = req.user; const fin = can(u, "dashboard.finance");
  const today = range({}); const per = range(req.query);
  const settings = await getSettings();
  const [{ sales: todaySales }, { sales: perSales, returns: perReturns }] = await Promise.all([loadSales(today.from, today.to, u), loadSales(per.from, per.to, u)]);
  const [products, brands, cats] = await Promise.all([Product.find({ active: true }).lean(), Brand.find().lean(), Category.find().lean()]);
  const pm = new Map(products.map((p) => [String(p._id), p])); const bn = new Map(brands.map((b) => [String(b._id), b.name])); const cn = new Map(cats.map((c) => [String(c._id), c.name]));
  const byBrand = {}, byCat = {}, top = {};
  for (const s of perSales) for (const i of s.items) {
    const p = pm.get(String(i.product)); const b = bn.get(String(p?.brand)) || "—", c = cn.get(String(p?.category)) || "—";
    byBrand[b] = r2((byBrand[b] || 0) + i.net); byCat[c] = r2((byCat[c] || 0) + i.net);
    const t = top[i.name] || { name: i.name, qty: 0, revenue: 0 }; t.qty += i.qty; t.revenue = r2(t.revenue + i.net); top[i.name] = t;
  }
  const stockable = products.filter((p) => p.kind !== "service");
  const low = stockable.filter((p) => p.qty > 0 && p.qty <= p.minStock).sort((a, b) => a.qty - b.qty);
  const out = stockable.filter((p) => p.qty <= 0);
  const series = {}; for (const s of perSales) { const k = localDay(s.date); series[k] = r2((series[k] || 0) + s.total); }
  // fill empty days (max 62) so charts have a continuous axis
  const days = []; for (let t = per.from.getTime(); t < per.to.getTime() && days.length < 62; t += 86400000) { const k = localDay(new Date(t + 60000)); days.push({ day: k, total: series[k] || 0 }); }
  const data = {
    today: { count: todaySales.length, total: sum(todaySales, (s) => s.total) },
    period: { count: perSales.length, total: sum(perSales, (s) => s.total), returns: sum(perReturns, (x) => x.refundValue) },
    series: days, byBrand: Object.entries(byBrand).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value), byCategory: Object.entries(byCat).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    top: Object.values(top).sort((a, b) => b.qty - a.qty).slice(0, 6), low: low.slice(0, 8).map((p) => ({ id: p._id, name: p.name, qty: p.qty, minStock: p.minStock })), lowCount: low.length, outCount: out.length,
  };
  if (can(u, "products.viewCost") || fin) data.stockValue = sum(stockable, (p) => p.qty * p.buy);
  if (fin) {
    const [tp, pp] = await Promise.all([Purchase.find({ status: "completed", date: { $gte: today.from, $lt: today.to } }).lean(), Purchase.find({ status: "completed", date: { $gte: per.from, $lt: per.to } }).lean()]);
    data.purchases = { today: sum(tp, (p) => p.total), period: sum(pp, (p) => p.total) };
    const f = await finance(per.from, per.to, true);
    Object.assign(data, { cash: { total: f.cashTotal, accounts: f.accounts }, customerDebt: f.customerDebt, supplierDebt: f.supplierDebt, expenses: f.expenses, salaries: f.salaries, grossProfit: f.grossProfit, netProfit: f.netProfit, unknownCost: f.unknownCost });
  }
  const now = new Date(); const soon = new Date(Date.now() + settings.rules.warrantyAlertDays * 86400000);
  data.warranty = { active: await Warranty.countDocuments({ status: "active", endDate: { $gte: now } }), expiring: await Warranty.countDocuments({ status: "active", endDate: { $gte: now, $lte: soon } }) };
  if (settings.modules.repairs) data.repairs = { open: await Repair.countDocuments({ status: { $in: ["received", "inspecting", "repairing"] } }), ready: await Repair.countDocuments({ status: "ready" }) };
  res.json(data);
}));

/* ───────── Alerts ───────── */
r.get("/alerts", ah(async (req, res) => {
  const u = req.user; const s = await getSettings(); const out = {};
  if (can(u, "inventory.view") || can(u, "products.view")) {
    const items = await Product.find({ active: true, kind: { $ne: "service" } }).select("name qty minStock").lean();
    out.low = items.filter((p) => p.qty > 0 && p.qty <= p.minStock).slice(0, 50); out.out = items.filter((p) => p.qty <= 0).slice(0, 50);
  }
  if (can(u, "warranty.manage")) { const now = new Date(); out.warranty = await Warranty.find({ status: "active", endDate: { $gte: now, $lte: new Date(Date.now() + s.rules.warrantyAlertDays * 86400000) } }).sort({ endDate: 1 }).limit(50).lean(); }
  if (s.modules.repairs && can(u, "repairs.manage")) out.repairs = await Repair.find({ status: "ready" }).select("no customerName phone device").limit(50).lean();
  if (can(u, "debts.manage") || can(u, "customers.view")) out.overdue = await Sale.find({ status: "completed", due: { $gt: 0 }, dueDate: { $lt: new Date() } }).select("no customerName due dueDate").sort({ dueDate: 1 }).limit(50).lean();
  out.count = Object.entries(out).reduce((a, [, v]) => a + (Array.isArray(v) ? v.length : 0), 0);
  res.json(out);
}));
export default r;
