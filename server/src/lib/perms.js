export const PERMS = {
  dashboard: ["dashboard.view", "dashboard.finance"],
  products: ["products.view", "products.edit", "products.viewCost"],
  inventory: ["inventory.view", "inventory.adjust"],
  sales: ["sales.view", "sales.viewAll", "sales.create", "sales.discount", "sales.editPrice", "sales.cancel", "sales.return", "sales.approveReturn"],
  purchases: ["purchases.view", "purchases.create", "purchases.cancel"],
  parties: ["suppliers.manage", "customers.view", "customers.manage", "debts.manage"],
  money: ["cashbox.view", "cashbox.manual", "accounts.manage", "expenses.manage"],
  staff: ["employees.manage", "salaries.manage"],
  service: ["warranty.manage", "repairs.manage"],
  admin: ["reports.view", "reports.profit", "users.manage", "settings.manage", "backup.manage", "audit.view"],
};
export const ALL_PERMS = Object.values(PERMS).flat();

export const ROLE_DEFAULTS = {
  admin: ALL_PERMS,
  seller: ["dashboard.view", "products.view", "inventory.view", "sales.view", "sales.create", "customers.view", "customers.manage", "warranty.manage", "repairs.manage", "cashbox.view"],
  accountant: ["dashboard.view", "dashboard.finance", "products.view", "products.viewCost", "inventory.view", "sales.view", "sales.viewAll", "purchases.view", "customers.view", "debts.manage", "suppliers.manage", "cashbox.view", "cashbox.manual", "expenses.manage", "employees.manage", "salaries.manage", "reports.view", "reports.profit"],
};
export const can = (user, perm) => user?.role === "admin" || (user?.permissions || []).includes(perm);
