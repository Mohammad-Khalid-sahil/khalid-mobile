import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, get, post, setToken, getToken, onUnauthorized } from "./api";
import { T, LANGS } from "./i18n";

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const useStored = (key, init) => {
  const [v, setV] = useState(() => { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : init; } catch { return init; } });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }, [key, v]);
  return [v, setV];
};

export function AppProvider({ children }) {
  const [lang, setLang] = useStored("km-lang", "fa");
  const [dark, setDark] = useStored("km-dark", true);
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(null);
  const [pub, setPub] = useState({ shopName: "Khalid Mobile", logo: "" });
  const [booting, setBooting] = useState(true);
  const [toasts, setToasts] = useState([]);
  const [dlg, setDlg] = useState(null);
  const L = LANGS.find((l) => l.code === lang) || LANGS[0];

  useEffect(() => { document.documentElement.dir = L.dir; document.documentElement.lang = lang; document.documentElement.classList.toggle("dark", !!dark); }, [lang, dark, L.dir]);

  const t = useCallback((key, vars) => {
    let s = T[lang]?.[key] ?? T.fa[key] ?? T.en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
    return s;
  }, [lang]);
  const errMsg = useCallback((e) => (e?.code && T[lang]?.[`err.${e.code}`]) || e?.message || String(e), [lang]);

  const toast = useMemo(() => {
    const push = (kind, text) => { const id = Math.random(); setToasts((x) => [...x, { id, kind, text }]); setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), kind === "err" ? 5500 : 2600); };
    return { ok: (m) => push("ok", m), err: (e) => push("err", errMsg(e)) };
  }, [errMsg]);

  const confirm = useCallback((opts) => new Promise((resolve) => setDlg({ ...opts, resolve })), []);

  const loadSettings = useCallback(() => get("/settings").then(setSettings), []);
  const logout = useCallback(async (silent) => { try { if (!silent) await post("/auth/logout"); } catch {} setToken(null); setUser(null); setSettings(null); }, []);
  useEffect(() => { onUnauthorized(() => logout(true)); }, [logout]);
  useEffect(() => { get("/auth/public").then(setPub).catch(() => {}); }, [user]);
  useEffect(() => {
    if (!getToken()) return setBooting(false);
    Promise.all([get("/auth/me"), get("/settings")]).then(([u, s]) => { setUser(u); setSettings(s); }).catch(() => setToken(null)).finally(() => setBooting(false));
  }, []);

  const login = async (username, password) => {
    const r = await api("/auth/login", { method: "POST", body: { username, password } });
    setToken(r.token); setUser(r.user); setSettings(await get("/settings"));
    if (r.user.lang && !localStorage.getItem("km-lang")) setLang(r.user.lang);
    return r.user;
  };
  const acceptSession = (r) => { setToken(r.token); setUser(r.user); };

  const can = useCallback((...perms) => !!user && (user.role === "admin" || perms.some((p) => user.permissions?.includes(p))), [user]);

  const fmt = useMemo(() => {
    const nu = lang === "en" ? "latn" : "arabext";
    const nf = new Intl.NumberFormat(`${L.locale}-u-nu-${nu}`, { maximumFractionDigits: 2 });
    const sym = settings?.currencySymbol || "؋";
    const cal = settings?.calendar || "both";
    const mk = (ca, time) => new Intl.DateTimeFormat(`${ca === "gregory" ? "en-CA" : L.locale}-u-ca-${ca}-nu-${nu}`, { year: "numeric", month: "2-digit", day: "2-digit", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) });
    const f = { persian: [mk("persian"), mk("persian", true)], gregory: [mk("gregory"), mk("gregory", true)] };
    const one = (v, time, which) => (v ? f[which][time ? 1 : 0].format(new Date(v)) : "—");
    const primary = cal === "gregory" ? "gregory" : "persian";
    return {
      num: (v) => nf.format(Number(v) || 0),
      money: (v) => `${nf.format(Number(v) || 0)} ${sym}`,
      sym,
      date: (v, time) => one(v, time, primary),
      /** [primary, secondary|null] — secondary is the other calendar when settings.calendar === "both" */
      dates: (v, time) => [one(v, time, primary), cal === "both" ? one(v, time, "gregory") : null],
      month: (v) => (v ? new Intl.DateTimeFormat(`${L.locale}-u-ca-${primary}-nu-${nu}`, { year: "numeric", month: "long" }).format(new Date(v)) : "—"),
    };
  }, [lang, L.locale, settings?.calendar, settings?.currencySymbol]);

  const value = { lang, setLang, L, dark, setDark, t, errMsg, toast, confirm, user, setUser, settings, setSettings, loadSettings, pub, login, logout, acceptSession, can, fmt, booting };
  return (
    <Ctx.Provider value={value}>
      {children}
      <Toasts items={toasts} />
      {dlg && <ConfirmDialog dlg={dlg} close={() => setDlg(null)} t={t} />}
    </Ctx.Provider>
  );
}

function Toasts({ items }) {
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {items.map((x) => (
        <div key={x.id} className={`pop pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm font-semibold shadow-xl ${x.kind === "err" ? "bg-bad text-white dark:text-black" : "bg-ink text-bg"}`} role={x.kind === "err" ? "alert" : "status"}>{x.text}</div>
      ))}
    </div>
  );
}

function ConfirmDialog({ dlg, close, t }) {
  const [reason, setReason] = useState("");
  const ref = useRef();
  useEffect(() => { ref.current?.focus(); }, []);
  const done = (ok) => { dlg.resolve(ok ? { ok: true, reason: reason.trim() } : { ok: false }); close(); };
  const blocked = dlg.reason && !reason.trim();
  return (
    <div className="no-print fixed inset-0 z-[70] grid place-items-center bg-black/55 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && done(false)}>
      <div role="alertdialog" aria-modal="true" className="pop card w-full max-w-md p-6" onKeyDown={(e) => e.key === "Escape" && done(false)}>
        <h2 className="text-lg font-extrabold">{dlg.title}</h2>
        {dlg.message && <p className="mt-2 text-sm leading-6 text-mute">{dlg.message}</p>}
        {dlg.reason && <label className="mt-4 block"><span className="mb-1 block text-sm font-bold text-mute">{t("reason")}</span><textarea ref={ref} rows={2} className="field" value={reason} onChange={(e) => setReason(e.target.value)} /></label>}
        <div className="mt-6 flex justify-end gap-2">
          <button className="rounded-xl px-4 py-2.5 text-sm font-bold text-mute hover:bg-soft" onClick={() => done(false)}>{t("cancel")}</button>
          <button disabled={blocked} className={`rounded-xl px-5 py-2.5 text-sm font-bold disabled:opacity-40 ${dlg.danger ? "bg-bad text-white dark:text-black" : "bg-pri text-on-pri"}`} onClick={() => done(true)}>{dlg.confirmLabel || t("confirm")}</button>
        </div>
      </div>
    </div>
  );
}
