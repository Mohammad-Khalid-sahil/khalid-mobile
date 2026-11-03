import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import mongoose from "mongoose";
import { HttpError } from "./lib/util.js";
import { authenticate } from "./lib/auth.js";
import { ensureDefaults } from "./bootstrap.js";
import { autoBackupTick } from "./services/backup.js";
import { Settings } from "./models/index.js";
import auth from "./routes/auth.js";
import users from "./routes/users.js";
import catalog from "./routes/catalog.js";
import products, { unitsRouter } from "./routes/products.js";
import inventory from "./routes/inventory.js";
import { customers, suppliers, partyStats } from "./routes/parties.js";
import sales from "./routes/sales.js";
import purchases from "./routes/purchases.js";
import accounts, { expenses } from "./routes/money.js";
import { employees, salaries } from "./routes/staff.js";
import { warranty, repairs } from "./routes/service.js";
import reports from "./routes/reports.js";
import { settings, auditRouter, backup } from "./routes/system.js";

export function buildApp() {
  const app = express();
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], imgSrc: ["'self'", "data:", "blob:"], styleSrc: ["'self'", "'unsafe-inline'"], scriptSrc: ["'self'"], connectSrc: ["'self'"], fontSrc: ["'self'", "data:"], objectSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginEmbedderPolicy: false,
  }));
  if (process.env.CLIENT_URL) app.use(cors({ origin: process.env.CLIENT_URL.split(","), credentials: false }));
  if (process.env.NODE_ENV !== "test") app.use(morgan("dev"));
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_q, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));
  app.use("/api/auth", auth);
  const api = express.Router();
  api.use(authenticate);
  api.use("/users", users); api.use("/settings", settings); api.use("/audit", auditRouter); api.use("/backup", backup);
  api.use("/", catalog);
  api.use("/products", products); api.use("/units", unitsRouter); api.use("/inventory", inventory);
  api.use("/customers", customers); api.use("/suppliers", suppliers); api.use("/", partyStats);
  api.use("/sales", sales); api.use("/purchases", purchases);
  api.use("/accounts", accounts); api.use("/expenses", expenses);
  api.use("/employees", employees); api.use("/salaries", salaries);
  api.use("/warranty", warranty); api.use("/repairs", repairs);
  api.use("/reports", reports);
  app.use("/api", api);
  app.use("/api", (_q, _s, next) => next(new HttpError(404, "Route not found", "NOT_FOUND")));

  // production: serve the built client from the same port
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
  if (fs.existsSync(dist)) { app.use(express.static(dist)); app.get("*", (_q, res) => res.sendFile(path.join(dist, "index.html"))); }

  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ message: err.message, code: err.code });
    if (err.name === "ValidationError") return res.status(400).json({ message: Object.values(err.errors).map((e) => e.message).join("; "), code: "VALIDATION" });
    if (err.name === "CastError") return res.status(400).json({ message: "Invalid value", code: "VALIDATION" });
    if (err.type === "entity.too.large") return res.status(413).json({ message: "Request is too large", code: "FILE_TOO_LARGE" });
    console.error(err); res.status(500).json({ message: "Unexpected server error", code: "SERVER" });
  });
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.JWT_SECRET) console.warn("⚠ JWT_SECRET is not set — using an insecure development secret. Set it in server/.env");
  const PORT = process.env.PORT || 5000;
  mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/khalid_mobile")
    .then(async () => {
      await ensureDefaults();
      buildApp().listen(PORT, () => console.log(`API ready on http://localhost:${PORT}`));
      const tick = async () => { try { if ((await Settings.findOne({ key: "main" }))?.autoBackup) await autoBackupTick(); } catch (e) { console.error("auto-backup failed:", e.message); } };
      setTimeout(tick, 30_000); setInterval(tick, 3600_000);
    })
    .catch((e) => { console.error("MongoDB connection failed:", e.message); process.exit(1); });
}
