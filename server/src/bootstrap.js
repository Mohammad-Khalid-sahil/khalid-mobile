import bcrypt from "bcryptjs";
import { User, Settings, Account, Category, Brand } from "./models/index.js";
import { ROLE_DEFAULTS } from "./lib/perms.js";

export const DEFAULT_CATEGORIES = [
  { name: "گوشی مبایل", kind: "phone" }, { name: "لوازم جانبی", kind: "item" }, { name: "قطعات", kind: "item" },
  { name: "سیم‌کارت و خدمات", kind: "service" }, { name: "سایر کالاها", kind: "item" },
];
export const DEFAULT_BRANDS = ["Samsung", "Apple", "Xiaomi", "Huawei", "Oppo", "Vivo", "Tecno", "Infinix", "Nokia", "Anker", "سایر"];

/** First-run data: settings, admin user, cash + bank account, categories and brands. Never overwrites anything. */
export async function ensureDefaults() {
  if (!(await Settings.exists({ key: "main" }))) await Settings.create({ key: "main" });
  if (!(await User.exists({}))) {
    const pw = process.env.ADMIN_PASSWORD || "admin123";
    await User.create({ name: "مدیر سیستم", username: "admin", password: await bcrypt.hash(pw, 10), role: "admin", permissions: ROLE_DEFAULTS.admin, mustChangePassword: true });
    console.log(`Created first admin → username: admin  password: ${pw}  (you will be asked to change it)`);
  }
  if (!(await Account.exists({}))) {
    await Account.create({ name: "صندوق نقدی", type: "cash", isDefault: true });
    await Account.create({ name: "حساب بانکی", type: "bank", isDefault: true });
  }
  if (!(await Category.exists({}))) await Category.insertMany(DEFAULT_CATEGORIES);
  if (!(await Brand.exists({}))) await Brand.insertMany(DEFAULT_BRANDS.map((name) => ({ name })));
}
