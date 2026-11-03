const BASE = import.meta.env.VITE_API_URL || "/api";
let token = (() => { try { return localStorage.getItem("km-token"); } catch { return null; } })();
let onUnauth = () => {};
export const setToken = (t) => { token = t; try { t ? localStorage.setItem("km-token", t) : localStorage.removeItem("km-token"); } catch {} };
export const getToken = () => token;
export const onUnauthorized = (fn) => { onUnauth = fn; };

export class ApiError extends Error { constructor(message, code, status) { super(message); this.code = code; this.status = status; } }

const clean = (o = {}) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));
export const qs = (o) => { const s = new URLSearchParams(clean(o)).toString(); return s ? `?${s}` : ""; };

export async function api(path, { method = "GET", body, params } = {}) {
  let res;
  try {
    res = await fetch(BASE + path + qs(params), { method, headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch { throw new ApiError("Cannot reach the server", "NETWORK", 0); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== "/auth/login") onUnauth();
    throw new ApiError(data.message || `HTTP ${res.status}`, data.code, res.status);
  }
  return data;
}
export const get = (p, params) => api(p, { params });
export const post = (p, body = {}) => api(p, { method: "POST", body });
export const put = (p, body = {}) => api(p, { method: "PUT", body });
export const patch = (p, body = {}) => api(p, { method: "PATCH", body });
export const del = (p) => api(p, { method: "DELETE" });

export async function download(path, filename) {
  const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new ApiError("Download failed", "DOWNLOAD", res.status);
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: filename }); document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
export async function uploadRaw(path, file) {
  const res = await fetch(BASE + path, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" }, body: file });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.message || "Upload failed", data.code, res.status);
  return data;
}
/** Fetch every page of a paginated endpoint (used by exports). */
export async function fetchAll(path, params, max = 5000) {
  let page = 1, rows = [];
  for (;;) { const r = await get(path, { ...params, page, limit: 200 }); rows = rows.concat(r.rows); if (page >= r.pages || rows.length >= max) break; page++; }
  return rows;
}
