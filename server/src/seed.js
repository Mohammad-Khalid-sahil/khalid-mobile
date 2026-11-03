// Demo data, created through the real services so every rule (stock, money, IMEI, warranty) is exercised.
import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import * as M from "./models/index.js";
import { ensureDefaults } from "./bootstrap.js";
import { ROLE_DEFAULTS } from "./lib/perms.js";
import { createPurchase } from "./services/purchases.js";
import { createSale } from "./services/sales.js";
import { receivePayment, postTx } from "./services/money.js";

await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/khalid_mobile");
await mongoose.connection.dropDatabase();
await ensureDefaults();

const admin = await M.User.findOne({ username: "admin" });
await M.User.create({ name: "علی احمدی", username: "ali", password: await bcrypt.hash("ali12345", 10), role: "seller", permissions: ROLE_DEFAULTS.seller });
await M.User.create({ name: "سارا نوری", username: "sara", password: await bcrypt.hash("sara1234", 10), role: "accountant", permissions: ROLE_DEFAULTS.accountant });
const seller = await M.User.findOne({ username: "ali" });

const brand = async (n) => (await M.Brand.findOne({ name: n }))._id;
const cat = async (n) => (await M.Category.findOne({ name: n }))._id;
const cash = await M.Account.findOne({ type: "cash" });
await postTx({ account: cash._id, dir: "in", amount: 2000000, cat: "opening", note: "Opening balance", user: admin });

const sup = await M.Supplier.insertMany([{ name: "دبی موبایل تریدینگ", phone: "+971 50 123 4567" }, { name: "عمده‌فروشی کابل تک", phone: "0700 111 222" }, { name: "هرات موبایل سنتر", phone: "0799 333 444" }]);
const cus = await M.Customer.insertMany([{ name: "احمد ضیا", phone: "0788 100 200" }, { name: "فرهاد نوری", phone: "0777 300 400" }, { name: "مریم سادات", phone: "0799 500 600" }]);

const P = async (name, b, c, kind, o) => (await M.Product.create({ name, brand: await brand(b), category: await cat(c), kind, ...o }))._id;
const PH = "گوشی مبایل", AC = "لوازم جانبی", SV = "سیم‌کارت و خدمات";
const s24 = await P("Galaxy S24 Ultra", "Samsung", PH, "phone", { sell: 90500, warrantyMonths: 12, storage: "256GB", ram: "12GB", color: "Titanium Black", minStock: 1 });
const ip15 = await P("iPhone 15", "Apple", PH, "phone", { sell: 68000, warrantyMonths: 12, storage: "128GB", color: "Blue", minStock: 1 });
const a55 = await P("Galaxy A55", "Samsung", PH, "phone", { sell: 26500, warrantyMonths: 12, storage: "128GB", ram: "8GB", color: "Awesome Navy", minStock: 2 });
const rn13 = await P("Redmi Note 13", "Xiaomi", PH, "phone", { sell: 16800, warrantyMonths: 6, storage: "256GB", color: "Ocean Teal", minStock: 2 });
const nova = await P("Nova 12i", "Huawei", PH, "phone", { sell: 17900, warrantyMonths: 6, storage: "128GB", color: "Green" });
const ip13 = await P("iPhone 13 (دست‌دوم)", "Apple", PH, "phone", { sell: 39500, condition: "used", storage: "128GB", color: "Midnight" });
const buds = await P("Galaxy Buds2", "Samsung", AC, "item", { sell: 5300, warrantyMonths: 6, minStock: 3, barcode: "8806095" });
const chg = await P("شارژر Anker 20W", "Anker", AC, "item", { sell: 1300, minStock: 5, barcode: "194644" });
const cbl = await P("کیبل Type-C", "Anker", AC, "item", { sell: 350, minStock: 10, barcode: "194645" });
const cse = await P("قاب سیلیکونی iPhone 15", "سایر", AC, "item", { sell: 450, minStock: 5 });
const scr = await P("محافظ صفحه شیشه‌ای", "سایر", AC, "item", { sell: 200, minStock: 10, barcode: "100200" });
await P("سیم‌کارت AWCC", "سایر", SV, "service", { sell: 100 });
await P("شارژ کارت ۱۰۰ افغانی", "سایر", SV, "service", { sell: 105 });
const part = await P("LCD Redmi Note 13", "Xiaomi", "قطعات", "item", { sell: 4500, minStock: 2 });

const imei = (n) => String(350000000000000 + n * 7919);
let n = 1; const units = (k, extra = {}) => Array.from({ length: k }, () => ({ imei1: imei(n++), imei2: imei(n++ + 5000), ...extra }));
const buy = (supplierId, items, extra = {}) => createPurchase({ supplierId, payType: "cash", ...extra, items }, admin, { allowDuplicate: true });
await buy(sup[0]._id, [{ productId: s24, unitPrice: 82000, units: units(4) }, { productId: ip15, unitPrice: 62000, units: units(3) }, { productId: buds, qty: 7, unitPrice: 4200 }]);
await buy(sup[2]._id, [{ productId: a55, unitPrice: 23000, units: units(9) }, { productId: rn13, unitPrice: 14500, units: units(8) }, { productId: nova, unitPrice: 15500, units: units(5) }], { payType: "partial", paid: 300000 });
await buy(sup[1]._id, [{ productId: chg, qty: 30, unitPrice: 900 }, { productId: cbl, qty: 60, unitPrice: 220 }, { productId: cse, qty: 20, unitPrice: 250 }, { productId: scr, qty: 40, unitPrice: 90 }, { productId: part, qty: 4, unitPrice: 2800 }]);
await buy(sup[0]._id, [{ productId: ip13, unitPrice: 35000, units: units(2, { condition: "used" }) }], { payType: "credit" });

const avail = async (p) => (await M.Unit.find({ product: p, status: "available" }).sort({ _id: 1 }).lean()).map((u) => u._id);
const backdate = async (sale, d) => {
  await M.Sale.updateOne({ _id: sale._id }, { date: d });
  await M.Transaction.updateMany({ "ref.id": sale._id }, { at: d });
  await M.StockMovement.updateMany({ "ref.id": sale._id }, { at: d });
  await M.Warranty.updateMany({ sale: sale._id }, { startDate: d, endDate: new Date(d.getTime() + 365 * 86400000 * 0.5) });
};
const daysAgo = (d, h = 11) => { const t = new Date(); t.setDate(t.getDate() - d); t.setHours(h, 20, 0, 0); return t; };
const sell = async (d, items, extra = {}, user = seller) => {
  const s = await createSale({ payType: "cash", ...extra, items }, user, { discount: true, editPrice: true });
  if (d > 0) await backdate(s, daysAgo(d)); return s;
};
const u = async (p, i = 0) => (await avail(p))[i];
for (let d = 12; d >= 0; d -= 1) {
  if (d % 2 === 0) await sell(d, [{ productId: a55, unitId: await u(a55) }, { productId: chg, qty: 2 }]);
  if (d % 3 === 0) await sell(d, [{ productId: rn13, unitId: await u(rn13) }]);
  await sell(d, [{ productId: cbl, qty: 3 }, { productId: scr, qty: 2 }]);
  if (d % 4 === 1) await sell(d, [{ productId: ip15, unitId: await u(ip15) }], {}, admin);
  if (d % 5 === 2) await sell(d, [{ productId: nova, unitId: await u(nova) }, { productId: cse, qty: 1 }], { discount: 200 }, admin);
}
const credit = await sell(3, [{ productId: s24, unitId: await u(s24) }], { payType: "partial", paid: 50000, customerId: cus[1]._id, dueDate: new Date(Date.now() + 10 * 86400000) }, admin);
await sell(1, [{ productId: buds, qty: 2 }], { payType: "credit", customerId: cus[0]._id, dueDate: new Date(Date.now() - 2 * 86400000) });
await receivePayment("customer", { partyId: cus[1]._id, amount: 10000 }, admin);
await sell(0, [{ productId: a55, unitId: await u(a55) }, { productId: chg, qty: 1 }], { customerId: cus[2]._id });

// expenses, staff, repair, warranty claim
const post = (title, category, amount) => fetchless(title, category, amount);
async function fetchless(title, category, amount) { const e = await M.Expense.create({ title, category, amount, account: cash._id, user: admin._id }); await postTx({ account: cash._id, dir: "out", amount, cat: "expense", ref: { kind: "expense", id: e._id, no: title }, note: title, user: admin }); }
await post("کرایه دکان", "کرایه دکان", 15000); await post("برق", "برق", 2400); await post("انترنت", "انترنت", 1800);
const emp = await M.Employee.create({ name: "وحید خان", position: "فروشنده", phone: "0788 900 100", salary: 12000, startDate: new Date("2025-03-01") });
await M.Employee.create({ name: "نیک‌محمد", position: "تکنیشن", salary: 15000 });
await M.SalaryPayment.create({ employee: emp._id, kind: "salary", amount: 6000, period: new Date().toISOString().slice(0, 7), account: cash._id, user: admin._id });
await postTx({ account: cash._id, dir: "out", amount: 6000, cat: "salary", note: "salary", user: admin });
const w = await M.Warranty.findOne({ customer: cus[1]._id });
if (w) await M.WarrantyClaim.create({ no: "CLM-000001", warranty: w._id, issue: "صفحه نمایش لرزش دارد", status: "inspecting", history: [{ at: new Date(), user: admin._id, status: "received" }], user: admin._id });
await M.Counter.updateOne({ _id: "claim" }, { $set: { seq: 1 } }, { upsert: true });
await M.Repair.create({ no: "REP-000001", customerName: "حمید رحیمی", phone: "0799 777 888", device: "Samsung A12", problem: "تعویض LCD", checkFee: 200, laborFee: 800, total: 1000, status: "repairing", technician: "نیک‌محمد", history: [{ at: new Date(), user: admin._id, status: "received" }], user: admin._id });
await M.Counter.updateOne({ _id: "repair" }, { $set: { seq: 1 } }, { upsert: true });

console.log("Seeded ✅  logins → admin/admin123 (must change), ali/ali12345 (seller), sara/sara1234 (accountant)");
await mongoose.disconnect();
