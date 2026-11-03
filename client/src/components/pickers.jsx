import { useEffect, useRef, useState } from "react";
import { Plus, X, UserPlus, Search } from "lucide-react";
import { useApp } from "../lib/app";
import { get, post } from "../lib/api";
import { Btn, Field, Input, Modal, Badge, Spinner, useDebounced, Empty } from "./ui";

/** Search-as-you-type picker for customers / suppliers with inline "new" form. */
export function EntityPicker({ endpoint, value, onChange, placeholder, label, canCreate = true, showBalance }) {
  const { t, toast, fmt } = useApp();
  const [q, setQ] = useState(""); const dq = useDebounced(q, 250); const [rows, setRows] = useState([]); const [open, setOpen] = useState(false); const [adding, setAdding] = useState(false);
  const box = useRef();
  useEffect(() => { if (!open) return; get(endpoint, { q: dq, limit: 8, active: "true" }).then((r) => setRows(r.rows)).catch(() => {}); }, [dq, open, endpoint]);
  useEffect(() => { const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  if (value) return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-soft px-3 py-2"><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{value.name}</div><div className="num text-xs text-mute">{value.phone}{showBalance && value.balance > 0 ? ` · ${t("balance")}: ${fmt.money(value.balance)}` : ""}</div></div><button type="button" onClick={() => onChange(null)} aria-label={t("clear")} className="rounded-lg p-1 text-mute hover:bg-card"><X size={16} /></button></div>
  );
  return (
    <div ref={box} className="relative">
      <div className="flex gap-2">
        <label className="relative flex-1"><Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-mute" /><input className="field ps-9" value={q} placeholder={placeholder || label} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} aria-label={label} /></label>
        {canCreate && <Btn variant="soft" icon={UserPlus} onClick={() => setAdding(true)} aria-label={t("new")} />}
      </div>
      {open && <div className="pop card absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto p-1">
        {rows.length ? rows.map((r) => <button key={r._id} type="button" onClick={() => { onChange(r); setOpen(false); setQ(""); }} className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-start hover:bg-soft"><span className="font-semibold">{r.name}</span><span className="num text-xs text-mute">{r.phone}{r.balance > 0 ? ` · ${fmt.num(r.balance)}` : ""}</span></button>) : <p className="p-3 text-center text-sm text-mute">{t("empty")}</p>}
      </div>}
      {adding && <QuickAdd endpoint={endpoint} initial={q} onClose={() => setAdding(false)} onDone={(r) => { setAdding(false); onChange(r); }} />}
    </div>
  );
}
function QuickAdd({ endpoint, initial, onClose, onDone }) {
  const { t, toast } = useApp(); const [name, setName] = useState(initial || ""); const [phone, setPhone] = useState(""); const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { onDone(await post(endpoint, { name, phone })); } catch (e) { toast.err(e); setBusy(false); } };
  return <Modal size="sm" title={t("quickadd")} onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn loading={busy} disabled={!name.trim()} onClick={save}>{t("save")}</Btn></>}>
    <div className="grid gap-4"><Field label={t("name")}><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label={t("phone")}><Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field></div></Modal>;
}

/** Lists the available units (IMEI) of one phone model and lets the cashier pick one. */
export function UnitPicker({ product, onPick, onClose, showCost }) {
  const { t, fmt } = useApp(); const [rows, setRows] = useState(null); const [q, setQ] = useState("");
  useEffect(() => { get("/units", { product: product._id, status: "available", limit: 100 }).then((r) => setRows(r.rows)).catch(() => setRows([])); }, [product._id]);
  const list = (rows || []).filter((u) => !q || `${u.imei1} ${u.imei2} ${u.serial}`.includes(q));
  return (
    <Modal size="md" title={`${product.name} — ${t("unit.pick")}`} onClose={onClose}>
      <input autoFocus className="field mb-4" placeholder={t("unit.search")} value={q} onChange={(e) => setQ(e.target.value)} dir="ltr" />
      {!rows ? <Spinner /> : !list.length ? <Empty title={t("unit.none")} /> : <div className="grid gap-2">{list.map((u) => (
        <button key={u._id} onClick={() => onPick(u)} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-4 py-3 text-start transition hover:border-pri hover:bg-pri-soft">
          <div className="ltr"><div className="num font-bold">{u.imei1 || u.serial}</div><div className="num text-xs text-mute">{[u.imei2, u.serial && u.imei1 ? `SN ${u.serial}` : "", u.color, u.storage].filter(Boolean).join(" · ")}</div></div>
          <div className="flex items-center gap-2">{u.condition !== "new" && <Badge tone="warn">{t(`cond.${u.condition}`)}</Badge>}{u.flagged && <Badge tone="bad">{t("unit.flagged")}</Badge>}<span className="num font-bold">{fmt.money(u.sellPrice ?? product.sell)}</span></div>
        </button>))}</div>}
    </Modal>
  );
}
