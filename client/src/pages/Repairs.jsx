import { useEffect, useState } from "react";
import { Plus, Printer, Trash2, Wrench } from "lucide-react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useApp } from "../lib/app";
import { del, get, post, put } from "../lib/api";
import { Badge, Btn, DataTable, DateField, Dt, Field, IconBtn, Input, Modal, PageHead, Select, Spinner, Tabs, Textarea, useDebounced, useFetch } from "../components/ui";
import { printNow } from "../lib/export";

const ST = ["received", "inspecting", "repairing", "ready", "delivered", "cancelled"];
const tone = (s) => ({ ready: "ok", delivered: "neutral", cancelled: "bad", repairing: "pri", inspecting: "warn", received: "acc" }[s]);

export default function Repairs() {
  const { t, fmt } = useApp(); const [tab, setTab] = useState("open"); const [tick, setTick] = useState(0); const [open, setOpen] = useState(null); const [add, setAdd] = useState(false);
  const { data: stats } = useFetch("/repairs/stats", {}, [tick]);
  const statusData = ST.map((s) => ({ name: s, value: stats?.counts?.[s] || 0 })).filter((x) => x.value > 0);
  return (
    <>
      <PageHead icon={Wrench} title={t("nav.repairs")} sub={t("repairs.sub")} actions={<Btn variant="accent" icon={Plus} onClick={() => setAdd(true)}>{t("repair.new")}</Btn>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "open", label: t("repair.open") }, { key: "ready", label: t("repair.status.ready") }, { key: "delivered", label: t("repair.status.delivered") }, { key: "", label: t("all") }]} />
      {!!statusData.length && <section className="card mb-5 overflow-hidden"><h2 className="border-b border-line px-5 py-3.5 font-extrabold">{t("repairs.statusChart")}</h2><div className="h-[285px] p-4" dir="ltr"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={statusData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={94} paddingAngle={4} stroke="var(--card)">{statusData.map((x, i) => <Cell key={x.name} fill={["var(--chart-start)", "var(--pri)", "var(--blue)", "var(--ok)", "var(--mute)", "var(--bad)"][i % 6]} />)}</Pie><Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--ink)" }} formatter={(v, key) => [fmt.num(v), t(`repair.status.${key}`)]} /><Legend formatter={(key) => <span style={{ color: "var(--ink)" }}>{t(`repair.status.${key}`)}</span>} /></PieChart></ResponsiveContainer></div></section>}
      <DataTable endpoint="/repairs" exportName="repairs" params={{ status: tab }} refreshKey={tick} searchPlaceholder={t("repairs.search")} onRow={(r) => setOpen(r._id)} columns={[
        { key: "no", label: "#", sort: "no", render: (r) => <span className="num ltr font-bold">{r.no}</span> }, { key: "customerName", label: t("customer"), render: (r) => <div>{r.customerName}<div className="num ltr text-xs text-mute">{r.phone}</div></div>, text: (r) => r.customerName }, { key: "device", label: t("repair.device"), render: (r) => <span className="ltr">{r.device}</span> },
        { key: "problem", label: t("repair.problem"), render: (r) => <span className="block max-w-[200px] truncate text-mute">{r.problem}</span> }, { key: "receivedAt", label: t("warranty.received"), sort: "receivedAt", render: (r) => <Dt v={r.receivedAt} />, text: (r) => fmt.date(r.receivedAt) }, { key: "eta", label: t("repair.eta"), render: (r) => <Dt v={r.eta} />, text: (r) => fmt.date(r.eta) },
        { key: "total", label: t("total"), align: "end", render: (r) => <span className="num">{fmt.num(r.total)}</span> }, { key: "due", label: t("due"), align: "end", render: (r) => (r.total - r.paid > 0 ? <b className="num text-warn">{fmt.num(r.total - r.paid)}</b> : "—"), text: (r) => r.total - r.paid },
        { key: "status", label: t("status"), sort: "status", render: (r) => <Badge tone={tone(r.status)} dot>{t(`repair.status.${r.status}`)}</Badge>, text: (r) => t(`repair.status.${r.status}`) }]} />
      {add && <Form onClose={() => setAdd(false)} onDone={(r) => { setAdd(false); setTick((x) => x + 1); setOpen(r._id); }} />}
      {open && <Detail id={open} onClose={() => setOpen(null)} onChanged={() => setTick((x) => x + 1)} />}
    </>
  );
}
function Form({ onClose, onDone }) {
  const { t, toast } = useApp(); const [r, setR] = useState({ customerName: "", phone: "", device: "", imei: "", problem: "", accessories: "", condition: "", eta: "", checkFee: "", laborFee: "", technician: "" }); const set = (k) => (e) => setR({ ...r, [k]: e.target.value });
  const run = async () => { try { onDone(await post("/repairs", { ...r, checkFee: Number(r.checkFee) || 0, laborFee: Number(r.laborFee) || 0, eta: r.eta || undefined })); toast.ok(t("saved")); } catch (e) { toast.err(e); } };
  return <Modal size="md" title={t("repair.new")} onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn disabled={!r.customerName.trim() || !r.device.trim()} onClick={run}>{t("save")}</Btn></>}><div className="grid gap-4 sm:grid-cols-2">
    <Field label={t("customer")}><Input autoFocus value={r.customerName} onChange={set("customerName")} /></Field><Field label={t("phone")}><Input dir="ltr" value={r.phone} onChange={set("phone")} /></Field><Field label={t("repair.device")}><Input dir="ltr" value={r.device} onChange={set("device")} /></Field><Field label="IMEI / SN"><Input dir="ltr" className="num" value={r.imei} onChange={set("imei")} /></Field>
    <Field label={t("repair.problem")} wide><Textarea value={r.problem} onChange={set("problem")} /></Field><Field label={t("repair.accessories")}><Input value={r.accessories} onChange={set("accessories")} /></Field><Field label={t("repair.condition")}><Input value={r.condition} onChange={set("condition")} /></Field>
    <Field label={t("repair.checkFee")}><Input type="number" min="0" className="num" value={r.checkFee} onChange={set("checkFee")} /></Field><Field label={t("repair.laborFee")}><Input type="number" min="0" className="num" value={r.laborFee} onChange={set("laborFee")} /></Field><Field label={t("repair.eta")}><DateField value={r.eta} onChange={(v) => setR({ ...r, eta: v })} /></Field><Field label={t("repair.technician")}><Input value={r.technician} onChange={set("technician")} /></Field></div></Modal>;
}
function Detail({ id, onClose, onChanged }) {
  const { t, fmt, toast, settings, confirm } = useApp(); const { data: r, reload } = useFetch(`/repairs/${id}`, {}, []); const [term, setTerm] = useState(""); const dq = useDebounced(term); const [found, setFound] = useState([]); const [amount, setAmount] = useState(""); const [method, setMethod] = useState("cash"); const [fees, setFees] = useState(null);
  useEffect(() => { if (!dq) return setFound([]); get("/products", { q: dq, kind: "item", status: "in", limit: 6 }).then((x) => setFound(x.rows)).catch(() => {}); }, [dq]);
  useEffect(() => { if (r && !fees) setFees({ checkFee: r.checkFee, laborFee: r.laborFee }); }, [r]);
  const act = (fn) => async () => { try { await fn(); reload(); onChanged(); } catch (e) { toast.err(e); } };
  const closed = r && ["delivered", "cancelled"].includes(r.status);
  const setStatus = async (status) => { if (status === "delivered" && r.total - r.paid > 0) { const c = await confirm({ title: t("repair.deliver.unpaid"), message: `${t("due")}: ${fmt.money(r.total - r.paid)}` }); if (!c.ok) return; } act(() => put(`/repairs/${id}`, { status }))(); };
  return (
    <Modal size="lg" title={r ? `${r.no} — ${r.device}` : "…"} onClose={onClose} footer={r && <Btn icon={Printer} onClick={printNow}>{t("print")}</Btn>}>
      {!r ? <Spinner /> : <div className="grid gap-5">
        <div className="no-print flex flex-wrap items-center gap-2"><Badge tone={tone(r.status)} dot>{t(`repair.status.${r.status}`)}</Badge>{!closed && <Select className="!w-auto" value={r.status} onChange={(e) => setStatus(e.target.value)}>{ST.map((s) => <option key={s} value={s}>{t(`repair.status.${s}`)}</option>)}</Select>}</div>
        <div id="print-area" className="receipt rounded-xl border border-line bg-white p-4 text-[#111]" data-paper={settings.receiptWidth} style={{ maxWidth: "100%" }}>
          <div className="text-center font-extrabold">{settings.shopName}</div><div className="text-center text-xs">{t("repair.receipt")} · <span className="num ltr">{r.no}</span></div>
          <div className="my-2 grid gap-0.5 border-y border-dashed border-black/40 py-2 text-sm"><div>{t("customer")}: <b>{r.customerName}</b> <span className="num ltr">{r.phone}</span></div><div>{t("repair.device")}: <b className="ltr">{r.device}</b> {r.imei && <span className="num ltr">({r.imei})</span>}</div><div>{t("repair.problem")}: {r.problem}</div>{r.accessories && <div>{t("repair.accessories")}: {r.accessories}</div>}{r.condition && <div>{t("repair.condition")}: {r.condition}</div>}<div>{t("warranty.received")}: <span className="num">{fmt.date(r.receivedAt)}</span> {r.eta && <>· {t("repair.eta")}: <span className="num">{fmt.date(r.eta)}</span></>}</div></div>
          {r.parts.map((p) => <div key={p._id} className="flex justify-between text-sm"><span className="ltr">{p.name} ×{fmt.num(p.qty)}</span><span className="num">{fmt.num(p.price * p.qty)}</span></div>)}
          {r.checkFee > 0 && <div className="flex justify-between text-sm"><span>{t("repair.checkFee")}</span><span className="num">{fmt.num(r.checkFee)}</span></div>}{r.laborFee > 0 && <div className="flex justify-between text-sm"><span>{t("repair.laborFee")}</span><span className="num">{fmt.num(r.laborFee)}</span></div>}
          <div className="mt-1 flex justify-between border-t border-black/40 pt-1 font-extrabold"><span>{t("total")}</span><span className="num">{fmt.money(r.total)}</span></div><div className="flex justify-between text-sm"><span>{t("paid")}</span><span className="num">{fmt.money(r.paid)}</span></div><div className="flex justify-between text-sm font-bold"><span>{t("due")}</span><span className="num">{fmt.money(r.total - r.paid)}</span></div>
        </div>
        {!closed && <div className="no-print grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-line p-4"><h3 className="mb-2 font-extrabold">{t("repair.parts")}</h3><div className="relative"><Input placeholder={t("repair.parts.search")} value={term} onChange={(e) => setTerm(e.target.value)} />{found.length > 0 && <div className="pop card absolute inset-x-0 top-full z-20 mt-1 p-1">{found.map((p) => <button key={p._id} onClick={act(async () => { await post(`/repairs/${id}/parts`, { productId: p._id, qty: 1 }); setTerm(""); setFound([]); })} className="flex w-full justify-between rounded-lg px-3 py-2 text-start hover:bg-soft"><span className="ltr font-semibold">{p.name}</span><span className="num text-sm text-mute">{fmt.num(p.sell)} · {fmt.num(p.qty)}</span></button>)}</div>}</div>
            {r.parts.map((p) => <div key={p._id} className="mt-2 flex items-center gap-2 text-sm"><span className="ltr flex-1">{p.name} ×{fmt.num(p.qty)}</span><span className="num">{fmt.num(p.price * p.qty)}</span><IconBtn icon={Trash2} tone="danger" label={t("delete")} onClick={act(() => del(`/repairs/${id}/parts/${p._id}`))} /></div>)}
            {fees && <div className="mt-3 grid grid-cols-2 gap-2"><Field label={t("repair.checkFee")}><Input type="number" min="0" className="num" value={fees.checkFee} onChange={(e) => setFees({ ...fees, checkFee: Number(e.target.value) })} /></Field><Field label={t("repair.laborFee")}><Input type="number" min="0" className="num" value={fees.laborFee} onChange={(e) => setFees({ ...fees, laborFee: Number(e.target.value) })} /></Field><Btn size="sm" variant="soft" className="col-span-2" onClick={act(() => put(`/repairs/${id}`, fees))}>{t("save")}</Btn></div>}</div>
          <div className="rounded-2xl border border-line p-4"><h3 className="mb-2 font-extrabold">{t("repair.payment")}</h3><div className="grid gap-3"><Field label={t("amount")}><Input type="number" min="0" className="num" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field><Select value={method} onChange={(e) => setMethod(e.target.value)}>{["cash", "bank", "digital"].map((m) => <option key={m} value={m}>{t(`method.${m}`)}</option>)}</Select><Btn disabled={!(Number(amount) > 0)} onClick={act(async () => { await post(`/repairs/${id}/payments`, { amount: Number(amount), method }); setAmount(""); toast.ok(t("saved")); })}>{t("repair.receivePay")}</Btn></div></div></div>}
        <div className="no-print"><h3 className="mb-2 font-extrabold">{t("repair.history")}</h3><ul className="grid gap-1 text-sm">{[...r.history].reverse().map((h, i) => <li key={i} className="flex flex-wrap gap-2 rounded-lg bg-soft px-3 py-2"><Dt v={h.at} time /><b>{["part", "payment"].includes(h.status) ? t(`repair.h.${h.status}`) : t(`repair.status.${h.status}`)}</b><span className="text-mute">{h.note}</span><span className="ms-auto text-mute">{h.user?.name}</span></li>)}</ul></div>
      </div>}
    </Modal>
  );
}
