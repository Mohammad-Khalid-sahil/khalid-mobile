import { Counter, Audit } from "../models/index.js";

export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
export const bad = (message, code) => new HttpError(400, message, code);
export const notFound = (what = "Record") => new HttpError(404, `${what} not found`, "NOT_FOUND");
export const forbidden = (message = "Forbidden", code = "FORBIDDEN") => new HttpError(403, message, code);
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
export const str = (v) => (v == null ? "" : String(v).trim());
export const isId = (v) => /^[a-f\d]{24}$/i.test(String(v || ""));

export async function nextNo(key, prefix, pad = 6) {
  const c = await Counter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return `${prefix}-${String(c.seq).padStart(pad, "0")}`;
}

/** Collects compensating actions so a multi-step operation can be rolled back (no replica-set needed). */
export class Undo {
  constructor() { this.fns = []; }
  add(fn) { this.fns.push(fn); }
  async rollback() { const f = this.fns.reverse(); this.fns = []; for (const fn of f) { try { await fn(); } catch (e) { console.error("rollback step failed", e.message); } } }
}

export async function audit(user, action, module, doc, { before, after, reason } = {}) {
  try {
    await Audit.create({ user: user?._id, userName: user?.name || "system", action, module, refId: doc?._id, refNo: doc?.no || doc?.name || doc?.title, before, after, reason });
  } catch (e) { console.error("audit failed", e.message); }
}

export const addMonths = (d, m) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };

/* Kabul is UTC+4:30. Client sends local calendar days (YYYY-MM-DD). */
const TZ_MIN = 270;
export function dayStart(s) { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d) - TZ_MIN * 60000); }
export const localDay = (d) => new Date(new Date(d).getTime() + TZ_MIN * 60000).toISOString().slice(0, 10);
export function range(q) {
  const today = localDay(new Date());
  const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
  const from = dayStart(ok(q.from) ? q.from : today);
  const to = new Date(dayStart(ok(q.to) ? q.to : (ok(q.from) ? q.from : today)).getTime() + 86400000);
  return { from, to };
}
export function bucketKey(d, group) {
  const k = localDay(d);
  if (group === "year") return k.slice(0, 4);
  if (group === "month") return k.slice(0, 7);
  if (group === "week") { const dt = new Date(k + "T00:00:00Z"); const day = (dt.getUTCDay() + 1) % 7; dt.setUTCDate(dt.getUTCDate() - day); return dt.toISOString().slice(0, 10); } // weeks start Saturday
  return k;
}

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const rx = (s) => new RegExp(esc(String(s).trim()), "i");

/** Generic pagination → {rows,total,page,pages,limit}. `sortable` whitelists sort fields. */
export async function paginate(query, req, { sortable = [], defaultSort = "-createdAt", max = 200 } = {}) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(max, Math.max(1, parseInt(req.query.limit) || 25));
  let s = String(req.query.sort || "");
  const field = s.replace(/^-/, "");
  if (!s || !sortable.includes(field)) s = defaultSort;
  const sortObj = { [s.replace(/^-/, "")]: s.startsWith("-") ? -1 : 1 };
  const total = await query.model.countDocuments(query.getFilter());
  const rows = await query.sort(sortObj).skip((page - 1) * limit).limit(limit).lean();
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / limit)), limit };
}
