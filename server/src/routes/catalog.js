import { Router } from "express";
import { Brand, Category, Product, Sale } from "../models/index.js";
import { crud } from "../lib/crud.js";
import { need } from "../lib/auth.js";
import { ah } from "../lib/util.js";

const r = Router();
const used = (key) => async (d) => !!(await Product.exists({ [key]: d._id }));

/** Per-brand numbers for the Brands card grid: models, units in stock, units sold, net revenue (completed sales). */
r.get("/brands/stats", need("products.view"), ah(async (_req, res) => {
  const prods = await Product.find({}, "brand qty kind").lean();
  const byProd = new Map(prods.map((p) => [String(p._id), p]));
  const out = {};
  const row = (id) => (out[id] ||= { models: 0, inStock: 0, sold: 0, revenue: 0 });
  for (const p of prods) { if (!p.brand) continue; const o = row(String(p.brand)); o.models += 1; if (p.kind !== "service") o.inStock += Math.max(0, p.qty || 0); }
  const sales = await Sale.find({ status: "completed" }, "items").lean();
  for (const s of sales) for (const it of s.items || []) {
    const p = byProd.get(String(it.product)); if (!p?.brand) continue;
    const o = row(String(p.brand)); const q = Math.max(0, (it.qty || 0) - (it.returnedQty || 0));
    o.sold += q; o.revenue += (it.net || 0) * (it.qty ? q / it.qty : 0);
  }
  res.json(out);
}));
r.use("/brands", crud(Brand, { read: ["products.view", "sales.create", "purchases.view"], write: ["products.edit"], fields: ["name", "active"], search: ["name"], filters: ["active"], defaultSort: "name", module: "brands", used: used("brand") }));
r.use("/categories", crud(Category, { read: ["products.view", "sales.create", "purchases.view"], write: ["products.edit"], fields: ["name", "kind", "active"], search: ["name"], filters: ["active", "kind"], defaultSort: "name", module: "categories", used: used("category") }));
export default r;
