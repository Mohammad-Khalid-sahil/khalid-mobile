import mongoose from "mongoose";
const { Schema, model } = mongoose;
const ref = (to) => ({ type: Schema.Types.ObjectId, ref: to });
const money = { type: Number, default: 0 };
const T = { timestamps: true };

/* ───────── Users & settings ───────── */
export const User = model("User", new Schema({
  name: { type: String, required: true, trim: true },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ["admin", "seller", "accountant"], default: "seller" },
  permissions: [String],
  phone: { type: String, default: "" },
  lang: { type: String, default: "fa" },
  active: { type: Boolean, default: true },
  mustChangePassword: { type: Boolean, default: false },
  tokenVersion: { type: Number, default: 0 },
  lastLogin: Date,
}, T));

export const Settings = model("Settings", new Schema({
  key: { type: String, default: "main", unique: true },
  shopName: { type: String, default: "موبایل خالد" },
  address: { type: String, default: "" },
  phone: { type: String, default: "" },
  logo: { type: String, default: "" },
  currency: { type: String, default: "AFN" },
  currencySymbol: { type: String, default: "؋" },
  calendar: { type: String, enum: ["persian", "gregory", "both"], default: "both" },
  receiptWidth: { type: String, enum: ["58mm", "80mm", "A4"], default: "80mm" },
  receiptNote: { type: String, default: "" },
  warrantyTerms: { type: String, default: "" },
  invoicePrefix: { type: String, default: "INV" },
  modules: { repairs: { type: Boolean, default: true } },
  rules: {
    requireShift: { type: Boolean, default: false },
    returnNeedsApproval: { type: Boolean, default: false },
    allowOverdraft: { type: Boolean, default: false },
    lowStockDefault: { type: Number, default: 3 },
    warrantyAlertDays: { type: Number, default: 30 },
    returnWindowDays: { type: Number, default: 0 },
  },
  expenseCategories: { type: [String], default: ["کرایه دکان", "برق", "انترنت", "ترانسپورت", "سایر"] },
  autoBackup: { type: Boolean, default: true },
}, T));

/* ───────── Catalog ───────── */
export const Brand = model("Brand", new Schema({ name: { type: String, required: true, unique: true, trim: true }, active: { type: Boolean, default: true } }, T));
export const Category = model("Category", new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  kind: { type: String, enum: ["phone", "item", "service"], default: "item" },
  active: { type: Boolean, default: true },
}, T));

const productSchema = new Schema({
  name: { type: String, required: true, trim: true },
  brand: ref("Brand"),
  category: ref("Category"),
  kind: { type: String, enum: ["phone", "item", "service"], default: "item" },
  barcode: { type: String, default: "", trim: true },
  color: { type: String, default: "" },
  storage: { type: String, default: "" },
  ram: { type: String, default: "" },
  condition: { type: String, enum: ["new", "used", "refurbished", "defective"], default: "new" },
  buy: money,
  sell: money,
  qty: { type: Number, default: 0, min: 0 },
  defectiveQty: { type: Number, default: 0, min: 0 },
  minStock: { type: Number, default: 3 },
  supplier: ref("Supplier"),
  warrantyMonths: { type: Number, default: 0 },
  description: { type: String, default: "" },
  image: { type: String, default: "" },
  active: { type: Boolean, default: true },
}, T);
productSchema.index({ barcode: 1 });
productSchema.index({ name: 1 });
export const Product = model("Product", productSchema);

const unitSchema = new Schema({
  product: { ...ref("Product"), required: true, index: true },
  imei1: { type: String, default: "", index: true },
  imei2: { type: String, default: "", index: true },
  serial: { type: String, default: "", index: true },
  color: { type: String, default: "" },
  storage: { type: String, default: "" },
  ram: { type: String, default: "" },
  condition: { type: String, enum: ["new", "used", "refurbished", "defective"], default: "new" },
  buyPrice: money,
  sellPrice: { type: Number, default: null },
  status: { type: String, enum: ["available", "sold", "defective", "review", "lost", "cancelled"], default: "available", index: true },
  supplier: ref("Supplier"),
  purchase: ref("Purchase"),
  sale: ref("Sale"),
  purchasedAt: Date,
  flagged: { type: Boolean, default: false },
  note: { type: String, default: "" },
}, T);
export const Unit = model("Unit", unitSchema);

export const StockMovement = model("StockMovement", new Schema({
  product: { ...ref("Product"), index: true },
  unit: ref("Unit"),
  type: { type: String, required: true },
  qty: { type: Number, required: true },
  reason: { type: String, default: "" },
  ref: { kind: String, id: Schema.Types.ObjectId, no: String },
  user: ref("User"),
  at: { type: Date, default: Date.now, index: true },
}));

/* ───────── Parties ───────── */
export const Supplier = model("Supplier", new Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, default: "" }, address: { type: String, default: "" }, note: { type: String, default: "" },
  balance: money, // آنچه فروشگاه به او بدهکار است
  active: { type: Boolean, default: true },
}, T));
export const Customer = model("Customer", new Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, default: "" }, address: { type: String, default: "" },
  idNumber: { type: String, default: "" }, note: { type: String, default: "" },
  balance: money, // آنچه مشتری به فروشگاه بدهکار است
  active: { type: Boolean, default: true },
}, T));

export const Ledger = model("Ledger", new Schema({
  party: { type: String, enum: ["customer", "supplier"], required: true },
  partyId: { type: Schema.Types.ObjectId, required: true, index: true },
  type: { type: String, enum: ["charge", "payment", "adjust"], required: true },
  delta: { type: Number, required: true }, // تغییر باقی‌مانده؛ مثبت = افزایش بدهی، منفی = کاهش
  balanceAfter: Number,
  ref: { kind: String, id: Schema.Types.ObjectId, no: String },
  note: { type: String, default: "" },
  dueDate: Date,
  user: ref("User"),
  at: { type: Date, default: Date.now, index: true },
}));

/* ───────── Money ───────── */
export const Account = model("Account", new Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ["cash", "bank", "digital"], default: "cash" },
  balance: money,
  isDefault: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  note: { type: String, default: "" },
}, T));
export const Transaction = model("Transaction", new Schema({
  account: { ...ref("Account"), required: true, index: true },
  dir: { type: String, enum: ["in", "out"], required: true },
  amount: { type: Number, required: true, min: 0 },
  cat: { type: String, required: true }, // sale, customer_payment, supplier_payment, purchase, expense, salary, refund, repair, manual, transfer, opening
  ref: { kind: String, id: Schema.Types.ObjectId, no: String },
  party: { kind: String, id: Schema.Types.ObjectId, name: String },
  transferId: Schema.Types.ObjectId,
  shift: ref("Shift"),
  note: { type: String, default: "" },
  user: ref("User"),
  at: { type: Date, default: Date.now, index: true },
}));
export const Shift = model("Shift", new Schema({
  account: ref("Account"), user: ref("User"),
  openedAt: { type: Date, default: Date.now }, closedAt: Date,
  openingBalance: money, closingBalance: Number, expected: Number, difference: Number,
  status: { type: String, enum: ["open", "closed"], default: "open" },
  note: { type: String, default: "" },
}, T));

/* ───────── Documents ───────── */
const saleItem = new Schema({
  product: ref("Product"), name: String, unit: ref("Unit"), imei: { type: String, default: "" }, serial: { type: String, default: "" },
  qty: Number, price: Number, discount: money, net: Number, cost: { type: Number, default: null },
  warrantyMonths: money, returnedQty: money,
});
const docBase = {
  no: { type: String, index: true },
  status: { type: String, enum: ["completed", "cancelled"], default: "completed" },
  cancelReason: String, cancelledAt: Date, cancelledBy: ref("User"),
  user: ref("User"), date: { type: Date, default: Date.now, index: true }, note: { type: String, default: "" },
};
export const Sale = model("Sale", new Schema({
  ...docBase,
  customer: ref("Customer"), customerName: { type: String, default: "" },
  items: [saleItem],
  subtotal: money, discount: money, total: money, paid: money, due: money, dueDate: Date,
  payType: { type: String, enum: ["cash", "credit", "partial"], default: "cash" },
  method: { type: String, default: "cash" }, account: ref("Account"),
  returnedTotal: money, refunded: money,
}, T));

export const Purchase = model("Purchase", new Schema({
  ...docBase,
  supplier: ref("Supplier"), sellerName: { type: String, default: "" }, sellerPhone: { type: String, default: "" }, billNo: { type: String, default: "" },
  items: [{ product: ref("Product"), name: String, qty: Number, unitPrice: Number, discount: money, total: Number, units: [ref("Unit")] }],
  subtotal: money, discount: money, total: money, paid: money, due: money,
  payType: { type: String, enum: ["cash", "credit", "partial"], default: "cash" },
  method: { type: String, default: "cash" }, account: ref("Account"),
}, T));

export const Return = model("Return", new Schema({
  no: { type: String, index: true },
  sale: { ...ref("Sale"), index: true }, customer: ref("Customer"),
  type: { type: String, enum: ["return", "exchange"], default: "return" },
  items: [{ saleItem: Schema.Types.ObjectId, product: ref("Product"), name: String, unit: ref("Unit"), imei: String, qty: Number, net: Number, cost: { type: Number, default: null }, reason: String, condition: { type: String, enum: ["sellable", "defective", "review"], default: "sellable" } }],
  newItems: [{ product: ref("Product"), name: String, unit: ref("Unit"), imei: String, qty: Number, price: Number, discount: money, net: Number, cost: { type: Number, default: null }, warrantyMonths: money }],
  refundValue: money, newTotal: money, debtReduced: money, cashRefunded: money, cashReceived: money, addedToDebt: money,
  method: String, account: ref("Account"),
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "approved" },
  approvedBy: ref("User"), reason: String, note: String, settle: Schema.Types.Mixed, applied: { type: Boolean, default: false },
  user: ref("User"), date: { type: Date, default: Date.now, index: true },
}, T));

export const Warranty = model("Warranty", new Schema({
  sale: ref("Sale"), saleNo: String, customer: ref("Customer"), customerName: String, customerPhone: String,
  product: ref("Product"), name: String, imei: String, serial: String, unit: ref("Unit"),
  months: Number, startDate: Date, endDate: { type: Date, index: true },
  status: { type: String, enum: ["active", "void"], default: "active" },
  terms: { type: String, default: "" },
  history: [{ at: Date, user: ref("User"), field: String, from: String, to: String, reason: String }],
}, T));
export const WarrantyClaim = model("WarrantyClaim", new Schema({
  no: String, warranty: { ...ref("Warranty"), index: true },
  issue: String, receivedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ["received", "inspecting", "sent", "repaired", "replaced", "rejected", "delivered"], default: "received" },
  sentTo: { type: String, default: "" }, cost: money, result: { type: String, default: "" },
  history: [{ at: Date, user: ref("User"), status: String, note: String }],
  user: ref("User"),
}, T));

export const Expense = model("Expense", new Schema({
  title: { type: String, required: true }, category: { type: String, default: "سایر" },
  amount: { type: Number, required: true, min: 0.01 }, date: { type: Date, default: Date.now, index: true },
  account: ref("Account"), method: { type: String, default: "cash" }, note: { type: String, default: "" },
  status: { type: String, enum: ["active", "cancelled"], default: "active" }, cancelReason: String,
  user: ref("User"),
}, T));

export const Employee = model("Employee", new Schema({
  name: { type: String, required: true, trim: true }, phone: { type: String, default: "" }, position: { type: String, default: "" },
  address: { type: String, default: "" }, startDate: Date, salary: money, advanceBalance: money, note: { type: String, default: "" },
  user: ref("User"), active: { type: Boolean, default: true },
}, T));
export const SalaryPayment = model("SalaryPayment", new Schema({
  employee: { ...ref("Employee"), index: true }, kind: { type: String, enum: ["salary", "advance"], default: "salary" },
  amount: money, deduction: money, period: String, date: { type: Date, default: Date.now },
  account: ref("Account"), note: { type: String, default: "" }, user: ref("User"),
}, T));

export const Repair = model("Repair", new Schema({
  no: String, customerName: { type: String, required: true }, phone: { type: String, default: "" },
  device: { type: String, required: true }, imei: { type: String, default: "" },
  problem: { type: String, default: "" }, accessories: { type: String, default: "" }, condition: { type: String, default: "" },
  receivedAt: { type: Date, default: Date.now }, eta: Date, deliveredAt: Date,
  checkFee: money, laborFee: money,
  parts: [{ product: ref("Product"), name: String, qty: Number, price: Number, cost: money }],
  total: money, paid: money,
  status: { type: String, enum: ["received", "inspecting", "repairing", "ready", "delivered", "cancelled"], default: "received" },
  technician: { type: String, default: "" },
  history: [{ at: Date, user: ref("User"), status: String, note: String }],
  user: ref("User"),
}, T));

/* ───────── System ───────── */
export const Counter = model("Counter", new Schema({ _id: String, seq: { type: Number, default: 0 } }));
export const Audit = model("Audit", new Schema({
  user: ref("User"), userName: String, action: String, module: String, refId: Schema.Types.ObjectId, refNo: String,
  before: Schema.Types.Mixed, after: Schema.Types.Mixed, reason: String, at: { type: Date, default: Date.now, index: true },
}));
export const BackupLog = model("BackupLog", new Schema({
  type: { type: String, enum: ["backup", "restore"] }, file: String, size: Number, ok: Boolean, note: String,
  counts: Schema.Types.Mixed, user: ref("User"), at: { type: Date, default: Date.now },
}));

export const ALL_MODELS = mongoose.models;
