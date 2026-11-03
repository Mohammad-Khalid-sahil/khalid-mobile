import jwt from "jsonwebtoken";
import { User } from "../models/index.js";
import { HttpError, ah, forbidden } from "./util.js";
import { can } from "./perms.js";

export const secret = () => process.env.JWT_SECRET || "dev-only-secret-change-me";
export const sign = (u) => jwt.sign({ id: u._id, v: u.tokenVersion }, secret(), { expiresIn: process.env.JWT_EXPIRES || "12h" });

export const authenticate = ah(async (req, _res, next) => {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) throw new HttpError(401, "Login required", "AUTH_REQUIRED");
  let p; try { p = jwt.verify(token, secret()); } catch { throw new HttpError(401, "Session expired", "AUTH_EXPIRED"); }
  const user = await User.findById(p.id);
  if (!user || !user.active || user.tokenVersion !== p.v) throw new HttpError(401, "Session invalid", "AUTH_EXPIRED");
  req.user = user; next();
});

/** require ANY of the listed permissions */
export const need = (...perms) => (req, _res, next) => {
  if (perms.some((p) => can(req.user, p))) return next();
  next(forbidden("You do not have permission for this action", "FORBIDDEN"));
};
export const adminOnly = (req, _res, next) => (req.user.role === "admin" ? next() : next(forbidden("Admin only", "FORBIDDEN")));
