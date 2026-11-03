import { Router } from "express";
import { need } from "./auth.js";
import { ah, bad, notFound, paginate, rx, isId, audit } from "./util.js";

/**
 * Small CRUD factory used by simple resources (customers, suppliers, brands…).
 * - `fields` whitelists writable properties (mass-assignment safe)
 * - DELETE removes only records that were never used; otherwise it deactivates them so history is kept.
 */
export function crud(Model, { read, write, fields, search = [], filters = [], sortable = [], defaultSort = "-createdAt", populate, used, module, extra } = {}) {
  const r = Router();
  const pick = (body) => Object.fromEntries(fields.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));

  r.get("/", need(...read), ah(async (req, res) => {
    const f = {};
    if (req.query.q && search.length) f.$or = search.map((k) => ({ [k]: rx(req.query.q) }));
    for (const k of filters) if (req.query[k] !== undefined && req.query[k] !== "") f[k] = req.query[k] === "true" ? true : req.query[k] === "false" ? false : req.query[k];
    if (req.query.debt === "1") f.balance = { $gt: 0 };
    let q = Model.find(f); if (populate) q = q.populate(populate);
    res.json(await paginate(q, req, { sortable: [...sortable, "name", "createdAt"], defaultSort }));
  }));

  r.get("/:id", need(...read), ah(async (req, res) => {
    if (!isId(req.params.id)) throw notFound();
    let q = Model.findById(req.params.id); if (populate) q = q.populate(populate);
    const d = await q.lean(); if (!d) throw notFound();
    res.json(d);
  }));

  r.post("/", need(...write), ah(async (req, res) => {
    const d = await Model.create(pick(req.body));
    await audit(req.user, "create", module || Model.modelName, d);
    res.status(201).json(d);
  }));

  r.put("/:id", need(...write), ah(async (req, res) => {
    if (!isId(req.params.id)) throw notFound();
    const d = await Model.findById(req.params.id); if (!d) throw notFound();
    const before = d.toObject(); Object.assign(d, pick(req.body)); await d.save();
    await audit(req.user, "update", module || Model.modelName, d, { before, after: d.toObject() });
    res.json(d);
  }));

  r.delete("/:id", need(...write), ah(async (req, res) => {
    if (!isId(req.params.id)) throw notFound();
    const d = await Model.findById(req.params.id); if (!d) throw notFound();
    if (used && (await used(d))) { d.active = false; await d.save(); await audit(req.user, "deactivate", module || Model.modelName, d); return res.json({ deactivated: true }); }
    await d.deleteOne(); await audit(req.user, "delete", module || Model.modelName, d);
    res.json({ deleted: true });
  }));
  extra?.(r);
  return r;
}
