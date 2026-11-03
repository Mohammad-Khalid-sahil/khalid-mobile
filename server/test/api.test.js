// End-to-end business-rule tests. Needs a running MongoDB (MONGO_URI, default 127.0.0.1:27017) — uses its own database.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import fs from "node:fs";
process.env.NODE_ENV = "test";
process.env.BACKUP_DIR = "./backups-test";
process.env.ADMIN_PASSWORD = "admin123";
const { buildApp } = await import("../src/index.js");
const { ensureDefaults } = await import("../src/bootstrap.js");

let server, base, T = {}; const ids = {};
const call = async (method, url, body, token = T.admin) => {
  const r = await fetch(base + "/api" + url, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({})); return { status: r.status, body: j, ok: r.ok };
};
const ok = async (...a) => { const r = await call(...a); assert.ok(r.ok, `${a[0]} ${a[1]} → ${r.status} ${JSON.stringify(r.body)}`); return r.body; };
const fail = async (code, ...a) => { const r = await call(...a); assert.ok(!r.ok, `${a[0]} ${a[1]} should fail`); assert.equal(r.body.code, code, JSON.stringify(r.body)); return r; };

before(async () => {
  await mongoose.connect((process.env.MONGO_URI || "mongodb://127.0.0.1:27017") + "/khalid_test");
  await mongoose.connection.dropDatabase();
  await ensureDefaults();
  server = buildApp().listen(0); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await mongoose.connection.dropDatabase(); await mongoose.disconnect(); fs.rmSync("./backups-test", { recursive: true, force: true }); });

test("login, forced password change, permissions", async () => {
  await fail("BAD_LOGIN", "POST", "/auth/login", { username: "admin", password: "nope" }, null);
  const l = await ok("POST", "/auth/login", { username: "admin", password: "admin123" }, null);
  assert.equal(l.user.mustChangePassword, true);
  const c = await ok("POST", "/auth/change-password", { current: "admin123", password: "secret99" }, l.token);
  T.admin = c.token;
  await fail("AUTH_EXPIRED", "GET", "/products", null, l.token); // old token invalidated
  await ok("POST", "/users", { name: "Ali", username: "ali", password: "ali12345", role: "seller" });
  await ok("POST", "/users", { name: "Sara", username: "sara", password: "sara1234", role: "accountant" });
  T.seller = (await ok("POST", "/auth/login", { username: "ali", password: "ali12345" }, null)).token;
  T.acct = (await ok("POST", "/auth/login", { username: "sara", password: "sara1234" }, null)).token;
  await fail("FORBIDDEN", "GET", "/users", null, T.seller);
  await fail("FORBIDDEN", "POST", "/products", { name: "x" }, T.seller);
});

test("catalog, products, funding", async () => {
  const cats = (await ok("GET", "/categories?limit=50")).rows; ids.phoneCat = cats.find((c) => c.kind === "phone")._id; ids.itemCat = cats.find((c) => c.name === "لوازم جانبی")._id;
  ids.samsung = (await ok("GET", "/brands?q=Samsung")).rows[0]._id;
  const ph = await ok("POST", "/products", { name: "Galaxy A55", kind: "phone", brand: ids.samsung, category: ids.phoneCat, sell: 26500, warrantyMonths: 12, minStock: 1 }); ids.phone = ph._id;
  const ch = await ok("POST", "/products", { name: "Charger 20W", kind: "item", category: ids.itemCat, sell: 1300, buy: 0, barcode: "6001", qty: 0, minStock: 3 }); ids.charger = ch._id;
  const openingItem = await ok("POST", "/products", { name: "Opening cable stock", kind: "item", sell: 50, qty: 5 });
  assert.equal(openingItem.qty, 5);
  const openingPhone = await ok("POST", "/products", { name: "Opening phone stock", kind: "phone", sell: 500, qty: 2, openingUnits: [{ imei1: "351000000000001" }, { serial: "OPEN-SERIAL-2" }] });
  assert.equal(openingPhone.qty, 2);
  const openingPhoneDetails = await ok("GET", `/products/${openingPhone._id}`); assert.equal(openingPhoneDetails.unitCounts.available, 2);
  await fail("OPENING_UNITS_REQUIRED", "POST", "/products", { name: "Missing phone IDs", kind: "phone", qty: 1 });
  await fail("BARCODE_DUPLICATE", "POST", "/products", { name: "Dup", barcode: "6001" });
  ids.sup = (await ok("POST", "/suppliers", { name: "Kabul Wholesale", phone: "0700" }))._id;
  ids.cus = (await ok("POST", "/customers", { name: "Ahmad Zia", phone: "0799" }))._id;
  const acc = (await ok("GET", "/accounts")); ids.cash = acc.find((a) => a.type === "cash")._id; ids.bank = acc.find((a) => a.type === "bank")._id;
  await ok("POST", "/accounts/manual", { account: ids.cash, dir: "in", amount: 1000000, note: "owner capital" });
  await fail("REASON_REQUIRED", "POST", "/accounts/manual", { account: ids.cash, dir: "in", amount: 5 });
});

test("purchase: IMEI tracking, weighted cost, stock, money, duplicates", async () => {
  const p = await ok("POST", "/purchases", { supplierId: ids.sup, payType: "partial", paid: 30000, items: [
    { productId: ids.phone, unitPrice: 23000, units: [{ imei1: "350000000000001" }, { imei1: "350000000000002", imei2: "350000000000003" }] },
    { productId: ids.charger, qty: 10, unitPrice: 900 }] });
  assert.equal(p.total, 55000); assert.equal(p.due, 25000);
  const prod = await ok("GET", `/products/${ids.phone}`); assert.equal(prod.qty, 2); assert.equal(prod.unitCounts.available, 2);
  assert.equal((await ok("GET", `/products/${ids.charger}`)).qty, 10);
  assert.equal((await ok("GET", `/suppliers/${ids.sup}`)).balance, 25000);
  assert.equal((await ok("GET", "/accounts")).find((a) => a._id === ids.cash).balance, 970000);
  await fail("IMEI_DUPLICATE", "POST", "/purchases", { supplierId: ids.sup, items: [{ productId: ids.phone, unitPrice: 1, units: [{ imei1: "350000000000003" }] }] });
  await fail("IMEI_DUPLICATE", "POST", "/purchases", { supplierId: ids.sup, items: [{ productId: ids.phone, unitPrice: 1, units: [{ imei1: "7" }, { imei1: "7" }] }] });
  assert.equal((await ok("GET", `/products/${ids.phone}`)).qty, 2, "failed purchase must not change stock");
  await fail("SUPPLIER_REQUIRED", "POST", "/purchases", { payType: "credit", sellerName: "x", items: [{ productId: ids.charger, qty: 1, unitPrice: 1 }] });
  // supplier payment is allocated to the purchase and cannot exceed the debt
  await fail("OVER_BALANCE", "POST", `/suppliers/${ids.sup}/payments`, { amount: 99999 });
  const pay = await ok("POST", `/suppliers/${ids.sup}/payments`, { amount: 10000 }); assert.equal(pay.balance, 15000);
  assert.equal((await ok("GET", `/purchases/${p._id}`)).due, 15000);
  ids.purchase = p._id;
});

test("sales: cash, partial, credit, stock guards, hidden cost", async () => {
  const u = (await ok("GET", `/units?product=${ids.phone}&status=available`)).rows; ids.unitA = u.find((x) => x.imei1 === "350000000000001")._id; ids.unitB = u.find((x) => x.imei1 === "350000000000002")._id;
  const s1 = await ok("POST", "/sales", { payType: "cash", items: [{ productId: ids.phone, unitId: ids.unitA }, { productId: ids.charger, qty: 2 }], discount: 100 }, T.admin);
  assert.equal(s1.total, 26500 + 2600 - 100); assert.equal(s1.paid, s1.total); assert.ok(s1.no.startsWith("INV-"));
  assert.equal(s1.items[0].imei, "350000000000001"); assert.equal(s1.items[0].cost, 23000);
  await fail("UNIT_UNAVAILABLE", "POST", "/sales", { items: [{ productId: ids.phone, unitId: ids.unitA }] });
  await fail("STOCK_INSUFFICIENT", "POST", "/sales", { items: [{ productId: ids.charger, qty: 9 }] });
  await fail("CUSTOMER_REQUIRED", "POST", "/sales", { payType: "credit", items: [{ productId: ids.charger, qty: 1 }] });
  assert.equal((await ok("GET", `/products/${ids.charger}`)).qty, 8, "stock unchanged after failed sales");
  const s2 = await ok("POST", "/sales", { payType: "partial", paid: 1000, customerId: ids.cus, items: [{ productId: ids.charger, qty: 5 }] }); // 6500, due 5500
  assert.equal(s2.due, 5500); assert.equal((await ok("GET", `/customers/${ids.cus}`)).balance, 5500);
  ids.s1 = s1._id; ids.s2 = s2._id;
  // seller: no discount / price edit, sees no cost
  await fail("FORBIDDEN", "POST", "/sales", { items: [{ productId: ids.charger, qty: 1, discount: 10 }] }, T.seller);
  await fail("FORBIDDEN", "POST", "/sales", { items: [{ productId: ids.charger, qty: 1, price: 1 }] }, T.seller);
  const mine = await ok("POST", "/sales", { items: [{ productId: ids.charger, qty: 1 }] }, T.seller);
  assert.equal(mine.items[0].cost, undefined);
  assert.equal((await ok("GET", "/sales", null, T.seller)).total, 1, "seller sees only own sales");
  await fail("FORBIDDEN", "POST", `/sales/${mine._id}/cancel`, { reason: "x" }, T.seller);
  const p = await ok("GET", `/products?q=Charger`, null, T.seller); assert.equal(p.rows[0].buy, undefined);
});

test("customer payments: FIFO allocation, no double counting, over-payment blocked", async () => {
  await fail("OVER_BALANCE", "POST", `/customers/${ids.cus}/payments`, { amount: 6000 });
  const r = await ok("POST", `/customers/${ids.cus}/payments`, { amount: 2000, method: "cash" });
  assert.equal(r.balance, 3500); assert.equal(r.allocated[0].amount, 2000);
  const inv = await ok("GET", `/sales/${ids.s2}`); assert.equal(inv.paid, 3000); assert.equal(inv.due, 3500);
  const led = await ok("GET", `/customers/${ids.cus}/ledger`); assert.equal(led.total, 2); // charge + payment
});

test("return → stock + refund; exchange; limits", async () => {
  const inv = await ok("GET", `/sales/${ids.s1}`); const phoneLine = inv.items.find((i) => i.imei); const chLine = inv.items.find((i) => !i.imei);
  const cashBefore = (await ok("GET", "/accounts")).find((a) => a._id === ids.cash).balance;
  await fail("REASON_REQUIRED", "POST", "/sales/returns", { saleId: ids.s1, items: [{ saleItemId: chLine._id, qty: 1 }] });
  await fail("RETURN_EXCEEDS", "POST", "/sales/returns", { saleId: ids.s1, reason: "x", items: [{ saleItemId: chLine._id, qty: 3 }] });
  const ret = await ok("POST", "/sales/returns", { saleId: ids.s1, reason: "changed mind", items: [{ saleItemId: chLine._id, qty: 1, condition: "defective" }] });
  assert.equal(ret.refundValue, r2n(chLine.net / 2)); assert.equal(ret.cashRefunded, ret.refundValue);
  const ch = await ok("GET", `/products/${ids.charger}`); assert.equal(ch.defectiveQty, 1); assert.equal(ch.qty, 2 + 0, "defective return must not become sellable stock");
  assert.equal((await ok("GET", "/accounts")).find((a) => a._id === ids.cash).balance, cashBefore - ret.refundValue);
  // exchange the phone for the other unit
  const ex = await ok("POST", "/sales/returns", { saleId: ids.s1, reason: "swap", items: [{ saleItemId: phoneLine._id, condition: "sellable" }], newItems: [{ productId: ids.phone, unitId: ids.unitB }], payType: "cash" });
  assert.equal(ex.type, "exchange"); assert.ok(ex.cashReceived > 0 || ex.cashRefunded > 0 || ex.refundValue === ex.newTotal);
  const units = (await ok("GET", `/units?product=${ids.phone}`)).rows; assert.equal(units.find((x) => x._id === ids.unitA).status, "available"); assert.equal(units.find((x) => x._id === ids.unitB).status, "sold");
  await fail("RETURN_EXCEEDS", "POST", "/sales/returns", { saleId: ids.s1, reason: "again", items: [{ saleItemId: phoneLine._id }] });
  await fail("HAS_RETURNS", "POST", `/sales/${ids.s1}/cancel`, { reason: "x" });
});
const r2n = (n) => Math.round(n * 100) / 100;

test("cancel sale restores stock, money and debt", async () => {
  const before = await ok("GET", `/products/${ids.charger}`); const cust = await ok("GET", `/customers/${ids.cus}`);
  await fail("REASON_REQUIRED", "POST", `/sales/${ids.s2}/cancel`, {});
  await ok("POST", `/sales/${ids.s2}/cancel`, { reason: "customer cancelled" });
  assert.equal((await ok("GET", `/products/${ids.charger}`)).qty, before.qty + 5);
  assert.equal((await ok("GET", `/customers/${ids.cus}`)).balance, cust.balance - 3500);
  await fail("ALREADY_CANCELLED", "POST", `/sales/${ids.s2}/cancel`, { reason: "again" });
  const w = await ok("GET", "/warranty?status=void"); assert.ok(Array.isArray(w.rows));
  const warrantyStats = await ok("GET", "/warranty/stats"); assert.ok(Number.isInteger(warrantyStats.active)); assert.ok(warrantyStats.claimsByStatus);
});

test("accounts: transfer is not income/expense, overdraft blocked, shifts", async () => {
  const f0 = await ok("GET", "/reports/finance?from=2000-01-01&to=2100-01-01");
  await ok("POST", "/accounts/transfer", { from: ids.cash, to: ids.bank, amount: 1000, note: "deposit" });
  const f1 = await ok("GET", "/reports/finance?from=2000-01-01&to=2100-01-01");
  assert.equal(f1.receiptsTotal, f0.receiptsTotal); assert.equal(f1.paymentsTotal, f0.paymentsTotal);
  await fail("INSUFFICIENT_FUNDS", "POST", "/accounts/transfer", { from: ids.bank, to: ids.cash, amount: 999999 });
  await fail("SAME_ACCOUNT", "POST", "/accounts/transfer", { from: ids.bank, to: ids.bank, amount: 1 });
  const sh = await ok("POST", "/accounts/shifts/open", { account: ids.cash, openingBalance: 1000 });
  await ok("POST", "/sales", { items: [{ productId: ids.charger, qty: 1 }] });
  const cur = await ok("GET", "/accounts/shifts/current"); assert.equal(cur[0].expected, 1000 + 1300);
  const closed = await ok("POST", `/accounts/shifts/${sh._id}/close`, { closingBalance: 2200 }); assert.equal(closed.difference, -100);
});

test("expenses, employees, salaries (no double payment)", async () => {
  const e = await ok("POST", "/expenses", { title: "Shop rent", category: "کرایه دکان", amount: 5000 });
  const expSummary = await ok("GET", "/expenses?from=2000-01-01&to=2100-01-01&status=active&limit=1"); assert.equal(expSummary.byCategory["کرایه دکان"], 5000);
  const emp = await ok("POST", "/employees", { name: "Wahid", salary: 10000 });
  await ok("POST", "/salaries", { employeeId: emp._id, kind: "advance", amount: 2000 });
  await ok("POST", "/salaries", { employeeId: emp._id, kind: "salary", amount: 7000, deduction: 2000, period: "2026-10" });
  await fail("SALARY_EXCEEDED", "POST", "/salaries", { employeeId: emp._id, kind: "salary", amount: 1500, period: "2026-10" });
  const sum = await ok("GET", `/employees/${emp._id}/summary?period=2026-10`); assert.equal(sum.remaining, 1000); assert.equal(sum.advanceBalance, 0);
  await ok("POST", `/expenses/${e._id}/cancel`, { reason: "entered twice" });
  const f = await ok("GET", "/reports/finance?from=2000-01-01&to=2100-01-01"); assert.equal(f.expenses, 0); assert.equal(f.salaries, 9000);
  await fail("FORBIDDEN", "GET", "/reports/finance", null, T.seller);
});

test("repair status summary for status charts", async () => {
  const repair = await ok("POST", "/repairs", { customerName: "Chart customer", device: "Phone", checkFee: 300 });
  const stats = await ok("GET", "/repairs/stats"); assert.ok(stats.counts.received >= 1); assert.ok(typeof stats.revenue === "number");
  await ok("PUT", `/repairs/${repair._id}`, { status: "ready" });
  const updated = await ok("GET", "/repairs/stats"); assert.ok(updated.counts.ready >= 1);
});

test("profit uses real cost; unknown cost is flagged, never faked", async () => {
  const noCost = await ok("POST", "/products", { name: "Mystery cable", kind: "item", sell: 500, qty: 5 });
  await ok("POST", "/sales", { items: [{ productId: noCost._id, qty: 2 }] });
  const rep = await ok("GET", "/reports/sales?from=2000-01-01&to=2100-01-01&group=year");
  assert.ok(rep.totals.unknownCost >= 1); assert.ok(typeof rep.totals.profit === "number");
  const dash = await ok("GET", "/reports/dashboard"); assert.ok(dash.today.count >= 1); assert.ok(dash.series.length >= 1);
  const accDash = await ok("GET", "/reports/dashboard", null, T.seller); assert.equal(accDash.netProfit, undefined);
});

test("cancel purchase blocked when goods were used; audit trail exists", async () => {
  await fail("PURCHASE_USED", "POST", `/purchases/${ids.purchase}/cancel`, { reason: "mistake" });
  const a = await ok("GET", "/audit?limit=100"); assert.ok(a.total > 5);
  assert.ok(a.rows.some((x) => x.action === "cancel" && x.reason));
});

test("backup → wipe → restore round-trip", async () => {
  const b = await ok("POST", "/backup/create", {}); assert.ok(b.file);
  const info = await ok("GET", `/backup/inspect/${b.file}`); assert.ok(info.counts.Sale >= 3);
  await fail("BAD_PASSWORD", "POST", "/backup/restore", { file: b.file, password: "wrong", confirm: "RESTORE" });
  await fail("CONFIRM_REQUIRED", "POST", "/backup/restore", { file: b.file, password: "secret99" });
  const salesBefore = (await ok("GET", "/sales?limit=1")).total;
  await mongoose.model("Sale").deleteMany({});
  await ok("POST", "/backup/restore", { file: b.file, password: "secret99", confirm: "RESTORE" });
  assert.equal((await ok("GET", "/sales?limit=1")).total, salesBefore);
  await fail("FORBIDDEN", "GET", "/backup", null, T.seller);
});
