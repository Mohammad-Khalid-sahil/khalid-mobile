import { useState } from "react";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApp } from "../lib/app";
import { del, post, put } from "../lib/api";
import { Btn, Empty, Field, Input, Modal, PageHead, Spinner, brandColors, useFetch } from "../components/ui";

/** Brand cards: coloured lattice header, letter tile, three mini stats, revenue + share bar. */
function BrandCard({ b, s, max, canEdit, onEdit, onDelete }) {
  const { t, fmt } = useApp(); const [c1, c2] = brandColors(b.name); const share = max ? Math.max(3, Math.round((s.revenue / max) * 100)) : 0;
  return (
    <article className={`card group overflow-hidden transition duration-300 hover:-translate-y-1 hover:border-[var(--pri)]/40 ${b.active ? "" : "opacity-55"}`}>
      <div className="relative h-[70px]" style={{ background: `linear-gradient(135deg, ${c1}, ${c2}99)` }}>
        <div className="lattice absolute inset-0 opacity-40 mix-blend-overlay" />
        <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[var(--card)] to-transparent" />
        {canEdit && <div className="absolute end-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          <button aria-label={t("edit")} onClick={onEdit} className="grid h-7 w-7 place-items-center rounded-lg bg-black/35 text-white backdrop-blur hover:bg-black/55"><Pencil size={13} /></button>
          <button aria-label={t("delete")} onClick={onDelete} className="grid h-7 w-7 place-items-center rounded-lg bg-black/35 text-white backdrop-blur hover:bg-bad hover:text-black"><Trash2 size={13} /></button>
        </div>}
      </div>
      <div className="-mt-7 px-4 pb-4">
        <div className="relative flex items-end gap-3">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-line bg-[#0b1129] text-2xl font-extrabold shadow-lg" style={{ color: c2 }}>{b.name.slice(0, 1).toUpperCase()}</span>
          <h3 className="ltr mb-1 min-w-0 truncate text-[16px] font-extrabold">{b.name}</h3>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[["brand.models", s.models], ["brand.inStock", s.inStock], ["brand.sold", s.sold]].map(([k, v]) => <div key={k} className="mini"><div className="truncate text-[10.5px] font-semibold text-mute">{t(k)}</div><div className="num text-[15px] font-extrabold">{fmt.num(v)}</div></div>)}
        </div>
        <div className="mt-3.5 text-[11px] font-semibold text-mute">{t("brand.revenue")}</div>
        <div className="num text-[19px] font-extrabold">{fmt.money(s.revenue)}</div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-soft"><div className="h-full rounded-full" style={{ width: `${share}%`, background: `linear-gradient(90deg, ${c1}, ${c2})` }} /></div>
      </div>
    </article>
  );
}

export default function Brands() {
  const { t, fmt, can, toast, confirm } = useApp(); const canEdit = can("products.edit");
  const [tick, setTick] = useState(0); const [edit, setEdit] = useState(null);
  const list = useFetch("/brands", { limit: 200, sort: "name" }, [tick]); const stats = useFetch("/brands/stats", {}, [tick]);
  const rows = list.data?.rows || []; const st = stats.data || {}; const zero = { models: 0, inStock: 0, sold: 0, revenue: 0 };
  const max = Math.max(0, ...rows.map((b) => st[b._id]?.revenue || 0));
  const sorted = [...rows].sort((a, b) => (st[b._id]?.revenue || 0) - (st[a._id]?.revenue || 0) || a.name.localeCompare(b.name));
  const remove = async (b) => {
    const c = await confirm({ title: t("brand.delete"), message: t("brand.delete.msg"), danger: true }); if (!c.ok) return;
    try { const r = await del(`/brands/${b._id}`); toast.ok(r.deactivated ? t("party.deactivated") : t("deleted")); setTick((x) => x + 1); } catch (e) { toast.err(e); }
  };
  return (
    <>
      <PageHead icon={Tags} title={t("nav.brands")} sub={t("brands.sub")} actions={canEdit && <Btn variant="accent" icon={Plus} onClick={() => setEdit({ name: "", active: true })}>{t("brand.add")}</Btn>} />
      {list.loading && !list.data ? <Spinner /> : !rows.length ? <div className="card"><Empty icon={Tags} title={t("empty")} action={canEdit && <Btn variant="accent" icon={Plus} onClick={() => setEdit({ name: "", active: true })}>{t("brand.add")}</Btn>} /></div> : (
        <>
        {sorted.some((b) => (st[b._id]?.revenue || 0) > 0) && <section className="card mb-5 overflow-hidden"><h2 className="border-b border-line px-5 py-3.5 font-extrabold">{t("brand.salesChart")}</h2><div className="h-[270px] p-4" dir="ltr"><ResponsiveContainer width="100%" height="100%"><BarChart data={sorted.filter((b) => (st[b._id]?.revenue || 0) > 0).slice(0, 8).reverse().map((b) => ({ name: b.name, revenue: st[b._id]?.revenue || 0 }))} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 4 }}><CartesianGrid horizontal={false} stroke="var(--line)" /><XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: "var(--mute)", fontSize: 11 }} tickFormatter={(v) => fmt.num(v)} /><YAxis type="category" dataKey="name" width={100} tickLine={false} axisLine={false} tick={{ fill: "var(--mute)", fontSize: 11 }} /><Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--ink)" }} formatter={(v) => fmt.money(v)} /><Bar dataKey="revenue" fill="var(--chart-start)" radius={[0, 8, 8, 0]} maxBarSize={24} /></BarChart></ResponsiveContainer></div></section>}
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
          {sorted.map((b) => <BrandCard key={b._id} b={b} s={st[b._id] || zero} max={max} canEdit={canEdit} onEdit={() => setEdit(b)} onDelete={() => remove(b)} />)}
        </div>
        </>
      )}
      {edit && <BrandForm initial={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); setTick((x) => x + 1); }} />}
    </>
  );
}

function BrandForm({ initial, onClose, onSaved }) {
  const { t, toast } = useApp(); const [b, setB] = useState(initial); const [busy, setBusy] = useState(false); const isNew = !initial._id;
  const save = async (e) => { e.preventDefault(); setBusy(true); try { await (isNew ? post("/brands", b) : put(`/brands/${b._id}`, b)); toast.ok(t("saved")); onSaved(); } catch (er) { toast.err(er); setBusy(false); } };
  return (
    <Modal size="sm" title={t(isNew ? "brand.add" : "brand.edit")} onClose={onClose}>
      <form onSubmit={save} className="grid gap-4">
        <Field label={t("name")}><Input required autoFocus dir="ltr" value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} /></Field>
        {!isNew && <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-4 w-4 accent-[var(--pri)]" checked={b.active} onChange={(e) => setB({ ...b, active: e.target.checked })} />{t("active")}</label>}
        <div className="flex items-center gap-2"><Btn variant="ghost" className="ms-auto" onClick={onClose}>{t("cancel")}</Btn><Btn type="submit" loading={busy}>{t("save")}</Btn></div>
      </form>
    </Modal>
  );
}
