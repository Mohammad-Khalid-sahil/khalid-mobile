import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, Loader2, Printer, Search, X, Inbox, ArrowUpDown } from "lucide-react";
import { get, fetchAll } from "../lib/api";
import { useApp } from "../lib/app";
import { exportCsv, exportXlsx, printNow } from "../lib/export";

/* ───── primitives ───── */
const VARIANTS = {
  primary: "action-gradient shadow-[0_8px_22px_-10px_var(--glow)] hover:brightness-105",
  accent: "action-gradient hover:brightness-105 shadow-[0_8px_22px_-8px_var(--glow)]",
  soft: "border border-line bg-soft text-ink hover:border-[var(--pri)]/50 hover:bg-pri-soft",
  ghost: "text-mute hover:bg-soft hover:text-ink",
  danger: "bg-bad-soft text-bad hover:brightness-95",
  dangerSolid: "bg-bad text-black hover:brightness-110",
};
export function Btn({ variant = "primary", size = "md", icon: Icon, loading, children, className = "", ...p }) {
  const sz = size === "sm" ? "px-3 py-1.5 text-[13px] gap-1.5" : size === "lg" ? "px-6 py-3.5 text-base gap-2" : "px-4 py-2.5 text-[13px] gap-2";
  return (
    <button type="button" {...p} disabled={p.disabled || loading} className={`inline-flex items-center justify-center rounded-xl font-extrabold transition disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${sz} ${className}`}>
      {loading ? <Loader2 size={16} className="animate-spin" /> : Icon && <Icon size={size === "sm" ? 15 : 17} />}{children}
    </button>
  );
}
export const IconBtn = ({ icon: Icon, label, tone = "ghost", ...p }) => (
  <button type="button" aria-label={label} title={label} {...p} className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition disabled:opacity-40 ${VARIANTS[tone]} ${p.className || ""}`}><Icon size={17} /></button>
);

export function Field({ label, hint, wide, children, error }) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1.5 block text-sm font-bold text-mute">{label}</span>{children}
      {hint && <span className="mt-1 block text-[13px] text-mute">{hint}</span>}
      {error && <span className="mt-1 block text-[13px] font-semibold text-bad">{error}</span>}
    </label>
  );
}
export const Input = ({ className = "", ...p }) => <input {...p} className={`field ${className}`} />;
export const Select = ({ children, className = "", ...p }) => <select {...p} className={`field ${className}`}>{children}</select>;
export const Textarea = ({ className = "", ...p }) => <textarea rows={2} {...p} className={`field ${className}`} />;

const TONES = { neutral: "bg-soft text-mute", ok: "bg-ok-soft text-ok", bad: "bg-bad-soft text-bad", warn: "bg-warn-soft text-warn", pri: "bg-pri-soft text-pri", acc: "bg-acc-soft text-acc-ink", blue: "bg-blue-soft text-blue" };
export const Badge = ({ tone = "neutral", children, dot }) => (
  <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-current/15 px-2.5 py-0.5 text-xs font-bold ${TONES[tone]}`}>{dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}{children}</span>
);

export function PageHead({ title, sub, actions, icon: Icon }) {
  return (
    <header className="page-banner mb-5 flex flex-wrap items-center justify-between gap-4 rounded-[1.5rem] px-5 py-5 sm:px-7 sm:py-6">
      <div className="relative z-10 flex min-w-0 items-center gap-3.5 sm:gap-4">
        {Icon && <span className="page-banner-icon grid h-12 w-12 shrink-0 place-items-center rounded-2xl"><Icon size={21} /></span>}
        <div className="min-w-0"><h1 className="truncate text-[21px] font-extrabold leading-tight tracking-tight sm:text-[24px]">{title}</h1>{sub && <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-white/70 sm:text-sm">{sub}</p>}</div>
      </div>
      {actions && <div className="page-banner-actions relative z-10 flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Round-square avatar with initials, colour derived from the name (customer / supplier / employee lists). */
export function Avatar({ name = "", size = 36, className = "" }) {
  const [c1, c2] = brandColors(name || "?"); const words = String(name).trim().split(/\s+/).filter(Boolean);
  const ini = ((words[0]?.[0] || "?") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
  return <span className={`grid shrink-0 place-items-center rounded-[11px] text-[12px] font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.25)] ${className}`} style={{ width: size, height: size, background: `linear-gradient(145deg, ${c2}, ${c1})` }}>{ini}</span>;
}
/** Avatar + name (+ optional second line) cell for lists. */
export const NameCell = ({ name, sub, ltr }) => <div className="flex items-center gap-3"><Avatar name={name} /><div className="min-w-0"><div className={`truncate font-bold ${ltr ? "ltr" : ""}`}>{name}</div>{sub && <div className="truncate text-[11.5px] text-mute">{sub}</div>}</div></div>;

export function Stat({ label, value, sub, icon: Icon, tone = "pri" }) {
  const c = { pri: "bg-pri-soft text-pri border-[var(--pri)]/25", acc: "bg-acc-soft text-acc-ink border-[var(--acc)]/25", ok: "bg-ok-soft text-ok border-[var(--ok)]/25", bad: "bg-bad-soft text-bad border-[var(--bad)]/25", warn: "bg-warn-soft text-warn border-[var(--warn)]/25", blue: "bg-blue-soft text-blue border-[var(--blue)]/25" }[tone];
  return (
    <div className="card flex items-center gap-3.5 p-4">
      {Icon && <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${c}`}><Icon size={19} /></span>}
      <div className="min-w-0"><div className="text-[12px] font-semibold text-mute">{label}</div><div className="num mt-0.5 truncate text-[22px] font-extrabold leading-tight">{value}</div>{sub && <div className="mt-0.5 truncate text-[11.5px] text-mute">{sub}</div>}</div>
    </div>
  );
}

export const Spinner = () => <div className="grid place-items-center py-16 text-mute"><Loader2 className="animate-spin" size={26} /></div>;
export function Empty({ title, text, action, icon: Icon = Inbox }) {
  return <div className="grid place-items-center gap-2 px-4 py-14 text-center"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-soft text-mute"><Icon size={26} /></span><div className="font-bold">{title}</div>{text && <p className="max-w-sm text-sm text-mute">{text}</p>}{action}</div>;
}

/** Date cell: primary calendar plus the other one in small text when settings.calendar === "both". */
export function Dt({ v, time }) {
  const { fmt } = useApp(); if (!v) return <span className="text-mute">—</span>;
  const [p, g] = fmt.dates(v, time);
  return <span className="num whitespace-nowrap">{p}{g && <span className="block text-[11px] text-mute">{g}</span>}</span>;
}

export function DateField({ value, onChange, ...p }) {
  const { fmt } = useApp();
  return <><input type="date" className="field num" value={value || ""} onChange={(e) => onChange(e.target.value)} {...p} />{value && <span className="mt-1 block text-xs text-mute num">{fmt.date(value + "T12:00:00")}</span>}</>;
}

export function Modal({ title, onClose, children, size = "md", footer }) {
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); const o = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { window.removeEventListener("keydown", k); document.body.style.overflow = o; }; }, [onClose]);
  const w = { sm: "max-w-md", md: "max-w-2xl", lg: "max-w-4xl", xl: "max-w-6xl" }[size];
  return (
    <div className="no-print fixed inset-0 z-50 grid place-items-center bg-[#02040d]/70 p-3 backdrop-blur-md sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`pop card flex max-h-[92vh] w-full flex-col ${w}`}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6"><h2 className="text-lg font-extrabold">{title}</h2><IconBtn icon={X} label="close" onClick={onClose} /></div>
        <div className="scroll-thin overflow-y-auto p-5 sm:p-6">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-4 sm:px-6">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="scroll-thin mb-5 flex w-fit max-w-full gap-1 overflow-x-auto rounded-2xl border border-line bg-soft p-1" role="tablist">
      {tabs.map((x) => <button key={x.key} role="tab" aria-selected={value === x.key} onClick={() => onChange(x.key)} className={`whitespace-nowrap rounded-xl px-4 py-1.5 text-[13px] font-bold transition ${value === x.key ? "action-gradient shadow-[0_6px_16px_-8px_var(--glow)]" : "text-mute hover:text-ink"}`}>{x.label}{x.count != null && <span className="ms-1.5 text-xs opacity-70">{x.count}</span>}</button>)}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder, autoFocus }) {
  return <label className="relative min-w-[200px] flex-1"><Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-mute" /><input autoFocus={autoFocus} className="field !rounded-xl ps-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></label>;
}

export function Pagination({ page, pages, total, onPage }) {
  const { t, fmt, L } = useApp(); const Prev = L.dir === "rtl" ? ChevronRight : ChevronLeft; const Next = L.dir === "rtl" ? ChevronLeft : ChevronRight;
  if (!total) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-mute">
      <span className="num">{fmt.num(total)} {t("records")}</span>
      <div className="flex items-center gap-1"><IconBtn icon={Prev} label={t("prev")} disabled={page <= 1} onClick={() => onPage(page - 1)} /><span className="num min-w-[4.5rem] text-center font-semibold text-ink">{fmt.num(page)} / {fmt.num(pages)}</span><IconBtn icon={Next} label={t("next")} disabled={page >= pages} onClick={() => onPage(page + 1)} /></div>
    </div>
  );
}

export function useFetch(path, params, deps = []) {
  const [state, set] = useState({ data: null, loading: true, error: null });
  const key = JSON.stringify([path, params, ...deps]);
  const load = useCallback(() => {
    if (!path) return; set((s) => ({ ...s, loading: true }));
    get(path, params).then((data) => set({ data, loading: false, error: null })).catch((error) => set((s) => ({ ...s, loading: false, error })));
    // eslint-disable-next-line
  }, [key]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

export function ExportMenu({ name, cols, getRows, print }) {
  const { t, toast } = useApp(); const [busy, setBusy] = useState(false);
  const go = (fn) => async () => { setBusy(true); try { fn(name, cols, await getRows()); } catch (e) { toast.err(e); } finally { setBusy(false); } };
  return (
    <div className="no-print flex items-center gap-1">
      <Btn variant="soft" size="sm" icon={FileSpreadsheet} loading={busy} onClick={go(exportXlsx)}>Excel</Btn>
      <Btn variant="soft" size="sm" icon={Download} onClick={go(exportCsv)}>CSV</Btn>
      {print !== false && <Btn variant="soft" size="sm" icon={Printer} onClick={printNow}>{t("print")} / PDF</Btn>}
    </div>
  );
}

/** Server-paginated table with search, sort, filters slot and export. */
export function DataTable({ endpoint, params, columns, search = true, searchPlaceholder, filters, refreshKey, exportName, pageSize = 25, onRow, emptyTitle, emptyAction, toolbar, rowClass, initialQ = "" }) {
  const { t, fmt } = useApp();
  const [q, setQ] = useState(initialQ); const [dq, setDq] = useState(""); const [page, setPage] = useState(1); const [sort, setSort] = useState(null);
  const [res, setRes] = useState({ rows: [], total: 0, pages: 1 }); const [loading, setLoading] = useState(true); const [err, setErr] = useState(null);
  const pk = JSON.stringify(params);
  useEffect(() => { const x = setTimeout(() => { setDq(q); setPage(1); }, 300); return () => clearTimeout(x); }, [q]);
  useEffect(() => { setPage(1); }, [pk]);
  const seq = useRef(0);
  useEffect(() => {
    const my = ++seq.current; setLoading(true);
    get(endpoint, { ...params, q: dq, page, limit: pageSize, sort }).then((r) => { if (my === seq.current) { setRes(r); setErr(null); } }).catch((e) => my === seq.current && setErr(e)).finally(() => my === seq.current && setLoading(false));
    // eslint-disable-next-line
  }, [endpoint, pk, dq, page, sort, refreshKey, pageSize]);
  const exportCols = columns.filter((c) => c.label && c.export !== false).map((c) => ({ label: c.label, value: (r) => (c.text ? c.text(r) : r[c.key]) }));
  const toggle = (k) => setSort((s) => (s === k ? `-${k}` : k === s?.replace("-", "") ? null : k));
  return (
    <div className="card overflow-hidden">
      {(search || filters || toolbar) && (
        <div className="no-print flex flex-wrap items-center gap-2 border-b border-line p-3">
          {search && <SearchBox value={q} onChange={setQ} placeholder={searchPlaceholder || t("search")} />}
          {filters}{toolbar}
          {exportName && <ExportMenu name={exportName} cols={exportCols} getRows={() => fetchAll(endpoint, { ...params, q: dq, sort })} />}
        </div>
      )}
      <div className="scroll-thin max-h-[65vh] overflow-auto">
        <table className="w-full min-w-[640px] text-[13.5px]">
          <thead className="sticky top-0 z-10"><tr className="border-b border-line bg-[color-mix(in_srgb,var(--soft)_70%,transparent)] text-[11.5px] uppercase tracking-wide text-mute rtl:normal-case rtl:tracking-normal">
            {columns.map((c, i) => (
              <th key={i} className={`px-4 py-3 font-bold ${c.align === "end" ? "text-end" : "text-start"} ${c.cls || ""}`}>
                {c.sort ? <button className="inline-flex items-center gap-1 hover:text-ink" onClick={() => toggle(c.sort)}>{c.label}<ArrowUpDown size={12} className={sort?.replace("-", "") === c.sort ? "text-pri" : "opacity-40"} /></button> : c.label}
              </th>
            ))}
          </tr></thead>
          <tbody>
            {res.rows.map((r) => (
              <tr key={r._id || r.id} onClick={onRow ? () => onRow(r) : undefined} className={`row-hover border-t border-line first:border-t-0 ${onRow ? "cursor-pointer" : ""} ${rowClass ? rowClass(r) : ""}`}>
                {columns.map((c, i) => <td key={i} className={`px-4 py-3 align-middle ${c.align === "end" ? "text-end" : ""} ${c.cls || ""}`}>{c.render ? c.render(r, fmt) : r[c.key] ?? "—"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loading && !res.rows.length && <Spinner />}
      {err && <div className="p-6 text-center text-sm font-semibold text-bad">{err.message}</div>}
      {!loading && !err && !res.rows.length && <Empty title={emptyTitle || t("empty")} text={dq ? t("empty.search") : undefined} action={emptyAction} />}
      <Pagination page={page} pages={res.pages} total={res.total} onPage={setPage} />
    </div>
  );
}

/** Small static table (reports). cols: [{label, render|key, align}] */
export function SimpleTable({ cols, rows, footer, rowKey, pageSize = 25 }) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize)); const currentPage = Math.min(page, pages);
  const visibleRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  return (
    <><div className="scroll-thin max-h-[65vh] overflow-auto"><table className="w-full min-w-[560px] text-sm">
      <thead className="sticky top-0 z-10"><tr className="border-b border-line bg-[color-mix(in_srgb,var(--soft)_70%,transparent)] text-[11.5px] uppercase tracking-wide text-mute rtl:normal-case rtl:tracking-normal">{cols.map((c, i) => <th key={i} className={`bg-card px-4 py-3 font-bold ${c.align === "end" ? "text-end" : "text-start"}`}>{c.label}</th>)}</tr></thead>
      <tbody>{visibleRows.map((r, ri) => <tr key={rowKey ? rowKey(r) : ri} className="row-hover border-t border-line first:border-t-0">{cols.map((c, i) => <td key={i} className={`px-4 py-2.5 ${c.align === "end" ? "num text-end" : ""}`}>{c.render ? c.render(r) : r[c.key]}</td>)}</tr>)}</tbody>
      {footer && <tfoot><tr className="border-t border-line bg-soft font-extrabold">{footer.map((f, i) => <td key={i} className={`px-4 py-3 ${cols[i]?.align === "end" ? "num text-end" : ""}`}>{f}</td>)}</tr></tfoot>}
    </table></div><Pagination page={currentPage} pages={pages} total={rows.length} onPage={setPage} /></>
  );
}

/* ───── brand colours for the "vitrine" phone cards ───── */
const BRAND = { samsung: ["#1d4497", "#5773c0"], apple: ["#2b2f3a", "#6d7487"], xiaomi: ["#c8570d", "#f0a25a"], huawei: ["#b83326", "#dd7867"], oppo: ["#2f8f80", "#8cc8bc"], vivo: ["#4a63c4", "#7da7ea"], nokia: ["#3d6bb3", "#7da7ea"], tecno: ["#1d7fa3", "#6fc3dc"], infinix: ["#17745d", "#5fd3b3"], anker: ["#33415f", "#7d8aab"] };
export const brandColors = (name = "") => { const k = String(name).toLowerCase(); if (BRAND[k]) return BRAND[k]; let h = 0; for (const c of k) h = (h * 31 + c.charCodeAt(0)) % 360; return [`hsl(${h} 45% 32%)`, `hsl(${h} 55% 62%)`]; };

export function stockTone(p) { return p.kind === "service" ? "neutral" : p.qty <= 0 ? "bad" : p.qty <= p.minStock ? "warn" : "ok"; }
export function StockBadge({ p }) {
  const { t, fmt } = useApp(); if (p.kind === "service") return <Badge>{t("kind.service")}</Badge>;
  return <Badge tone={stockTone(p)} dot>{p.qty <= 0 ? t("stock.out") : p.qty <= p.minStock ? t("stock.low") : t("stock.in")} · {fmt.num(p.qty)}</Badge>;
}

export function PhoneCard({ p, onClick, actions }) {
  const { fmt } = useApp(); const [c1, c2] = brandColors(p.brand?.name);
  return (
    <article className="group w-full max-w-[190px]">
      <button type="button" onClick={onClick} className="block w-full rounded-[1.7rem] p-[6px] text-start shadow-[0_18px_36px_-18px_rgba(0,0,0,.55)] transition-transform duration-300 hover:-translate-y-1.5" style={{ background: `linear-gradient(160deg, ${c1}, #0b0f1c)`, aspectRatio: p.kind === "phone" ? "9/16" : "1/1.1" }}>
        <div className="relative h-full overflow-hidden rounded-[1.35rem] p-3.5 text-white" style={{ background: `radial-gradient(120% 80% at 80% 10%, ${c2}, ${c1} 55%, #0b0f1c)` }}>
          <div className="sheen pointer-events-none absolute inset-0" />
          {p.kind === "phone" && <div className="mx-auto mb-3 h-4 w-14 rounded-full bg-black/75" />}
          <div className="ltr relative text-xs font-semibold opacity-80">{p.brand?.name || p.category?.name}</div>
          <div className="ltr relative mt-0.5 text-[15px] font-extrabold leading-tight">{p.name}</div>
          <div className="ltr relative mt-1 text-xs opacity-75">{[p.storage, p.color].filter(Boolean).join(" · ")}</div>
        </div>
      </button>
      <div className="mt-3 px-1"><div className="num text-base font-extrabold">{fmt.money(p.sell)}</div><div className="mt-1"><StockBadge p={p} /></div>{actions}</div>
    </article>
  );
}

export function useDebounced(v, ms = 250) { const [d, setD] = useState(v); useEffect(() => { const x = setTimeout(() => setD(v), ms); return () => clearTimeout(x); }, [v, ms]); return d; }
