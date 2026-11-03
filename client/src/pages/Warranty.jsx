import { useState } from "react";
import { PenLine, Plus, ShieldCheck } from "lucide-react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useApp } from "../lib/app";
import { post, put } from "../lib/api";
import { Badge, Btn, DataTable, DateField, Dt, Field, Input, Modal, PageHead, Select, Spinner, Tabs, Textarea, useFetch } from "../components/ui";

const CLAIM = ["received", "inspecting", "sent", "repaired", "replaced", "rejected", "delivered"];
const tone = (w) => (w.status === "void" ? "neutral" : new Date(w.endDate) < new Date() ? "bad" : (new Date(w.endDate) - new Date()) / 86400000 <= 30 ? "warn" : "ok");

export default function Warranty() {
  const { t, fmt } = useApp(); const [tab, setTab] = useState("list"); const [status, setStatus] = useState("active"); const [open, setOpen] = useState(null); const [tick, setTick] = useState(0);
  const { data: stats } = useFetch("/warranty/stats", {}, [tick]);
  const warrantyStats = stats ? [{ name: "active", value: Math.max(0, stats.active - stats.expiring) }, { name: "expiring", value: stats.expiring }, { name: "expired", value: stats.expired }, { name: "void", value: stats.void }].filter((x) => x.value > 0) : [];
  const claimStats = Object.entries(stats?.claimsByStatus || {}).map(([name, value]) => ({ name, value }));
  return (
    <>
      <PageHead icon={ShieldCheck} title={t("nav.warranty")} sub={t("warranty.sub")} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "list", label: t("warranty.list") }, { key: "claims", label: t("warranty.claims") }]} />
      {(tab === "list" ? warrantyStats : claimStats).length > 0 && <section className="card mb-5 overflow-hidden"><h2 className="border-b border-line px-5 py-3.5 font-extrabold">{t(tab === "list" ? "warranty.statusChart" : "warranty.claimStatusChart")}</h2><div className="h-[285px] p-4" dir="ltr"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={tab === "list" ? warrantyStats : claimStats} dataKey="value" nameKey="name" innerRadius={60} outerRadius={94} paddingAngle={4} stroke="var(--card)">{(tab === "list" ? warrantyStats : claimStats).map((x, i) => <Cell key={x.name} fill={["var(--ok)", "var(--warn)", "var(--bad)", "var(--mute)", "var(--chart-start)", "var(--pri)"][i % 6]} />)}</Pie><Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--ink)" }} formatter={(v, key) => [fmt.num(v), t(tab === "list" ? `warranty.st.${key}` : `claim.${key}`)]} /><Legend formatter={(key) => <span style={{ color: "var(--ink)" }}>{t(tab === "list" ? `warranty.st.${key}` : `claim.${key}`)}</span>} /></PieChart></ResponsiveContainer></div></section>}
      {tab === "list" ? <DataTable endpoint="/warranty" exportName="warranty" params={{ status }} refreshKey={tick} searchPlaceholder={t("warranty.search")} onRow={(w) => setOpen(w._id)}
        filters={<Select className="!w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>{["", "active", "expiring", "expired", "void"].map((k) => <option key={k} value={k}>{k ? t(`warranty.st.${k}`) : t("all")}</option>)}</Select>}
        columns={[{ key: "name", label: t("product"), render: (w) => <span className="ltr font-bold">{w.name}</span> }, { key: "imei", label: "IMEI / SN", render: (w) => <span className="num ltr">{w.imei || w.serial || "—"}</span>, text: (w) => w.imei || w.serial }, { key: "customerName", label: t("customer"), render: (w) => <div>{w.customerName || "—"}<div className="num ltr text-xs text-mute">{w.customerPhone}</div></div>, text: (w) => w.customerName },
          { key: "saleNo", label: t("inv.no"), render: (w) => <span className="num ltr">{w.saleNo}</span> }, { key: "startDate", label: t("warranty.start"), render: (w) => <Dt v={w.startDate} />, text: (w) => fmt.date(w.startDate) }, { key: "endDate", label: t("warranty.end"), sort: "endDate", render: (w) => <Dt v={w.endDate} />, text: (w) => fmt.date(w.endDate) },
          { key: "s", label: t("status"), render: (w) => <Badge tone={tone(w)} dot>{w.status === "void" ? t("warranty.st.void") : new Date(w.endDate) < new Date() ? t("warranty.st.expired") : tone(w) === "warn" ? t("warranty.st.expiring") : t("warranty.st.active")}</Badge>, text: (w) => w.status }]} />
        : <DataTable endpoint="/warranty/claims" refreshKey={tick} search={false} columns={[{ key: "no", label: "#", render: (c) => <span className="num ltr font-bold">{c.no}</span> }, { key: "w", label: t("product"), render: (c) => <span className="ltr">{c.warranty?.name} <span className="num text-xs text-mute">{c.warranty?.imei}</span></span> }, { key: "cust", label: t("customer"), render: (c) => c.warranty?.customerName },
          { key: "issue", label: t("warranty.issue"), render: (c) => <span className="block max-w-[240px] truncate">{c.issue}</span> }, { key: "receivedAt", label: t("warranty.received"), render: (c) => <Dt v={c.receivedAt} /> }, { key: "status", label: t("status"), render: (c) => <Badge tone={["repaired", "replaced", "delivered"].includes(c.status) ? "ok" : c.status === "rejected" ? "bad" : "warn"}>{t(`claim.${c.status}`)}</Badge> }]}
          onRow={(c) => setOpen(c.warranty?._id)} />}
      {open && <Detail id={open} onClose={() => setOpen(null)} onChanged={() => setTick((x) => x + 1)} />}
    </>
  );
}

function Detail({ id, onClose, onChanged }) {
  const { t, fmt, can, toast } = useApp(); const { data: w, reload } = useFetch(`/warranty/${id}`, {}, []); const [claim, setClaim] = useState(false); const [ext, setExt] = useState(false); const [upd, setUpd] = useState(null);
  const done = () => { reload(); onChanged(); };
  return (
    <Modal size="lg" title={w?.name || "…"} onClose={onClose} footer={w && can("warranty.manage") && <>{w.status === "active" && <Btn variant="ghost" icon={PenLine} onClick={() => setExt(true)}>{t("warranty.edit")}</Btn>}<Btn variant="accent" icon={Plus} onClick={() => setClaim(true)}>{t("warranty.newClaim")}</Btn></>}>
      {!w ? <Spinner /> : <div className="grid gap-5">
        <div className="grid gap-3 rounded-xl bg-soft p-4 text-sm sm:grid-cols-2"><div><span className="text-mute">IMEI/SN: </span><b className="num ltr">{w.imei || w.serial || "—"}</b></div><div><span className="text-mute">{t("customer")}: </span><b>{w.customerName || "—"}</b> <span className="num ltr text-mute">{w.customerPhone}</span></div><div><span className="text-mute">{t("inv.no")}: </span><b className="num ltr">{w.saleNo}</b></div><div><span className="text-mute">{t("warranty.period")}: </span><b className="num">{fmt.num(w.months)} {t("months")} · {fmt.date(w.startDate)} → {fmt.date(w.endDate)}</b></div></div>
        {w.terms && <p className="whitespace-pre-line rounded-xl border border-line p-3 text-sm text-mute">{w.terms}</p>}
        <div><h3 className="mb-2 font-extrabold">{t("warranty.claims")}</h3>{!w.claims.length ? <p className="text-sm text-mute">{t("empty")}</p> : <div className="grid gap-2">{w.claims.map((c) => <div key={c._id} className="rounded-xl border border-line p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><b className="num ltr">{c.no}</b> <span className="text-sm text-mute">{c.issue}</span></div><div className="flex items-center gap-2"><Badge tone={["repaired", "replaced", "delivered"].includes(c.status) ? "ok" : c.status === "rejected" ? "bad" : "warn"}>{t(`claim.${c.status}`)}</Badge>{can("warranty.manage") && <Btn size="sm" variant="soft" onClick={() => setUpd(c)}>{t("warranty.update")}</Btn>}</div></div>{(c.sentTo || c.cost > 0 || c.result) && <p className="mt-1 text-sm text-mute">{c.sentTo && `${t("warranty.sentTo")}: ${c.sentTo} · `}{c.cost > 0 && `${t("warranty.cost")}: ${fmt.num(c.cost)} · `}{c.result}</p>}</div>)}</div>}</div>
        {w.history?.length > 0 && <div><h3 className="mb-2 font-extrabold">{t("warranty.history")}</h3><ul className="grid gap-1 text-sm text-mute">{w.history.map((h, i) => <li key={i} className="rounded-lg bg-soft px-3 py-2"><Dt v={h.at} time /> — {h.field}: <span className="num">{h.from} → {h.to}</span> · {h.reason}</li>)}</ul></div>}
      </div>}
      {claim && <ClaimForm w={w} onClose={() => setClaim(false)} onDone={() => { setClaim(false); done(); }} />}
      {ext && <ExtendForm w={w} onClose={() => setExt(false)} onDone={() => { setExt(false); done(); }} />}
      {upd && <ClaimUpdate c={upd} onClose={() => setUpd(null)} onDone={() => { setUpd(null); done(); }} />}
    </Modal>
  );
}
function ClaimForm({ w, onClose, onDone }) {
  const { t, toast } = useApp(); const [issue, setIssue] = useState(""); const expired = w.status === "void" || new Date(w.endDate) < new Date();
  const run = async () => { try { await post(`/warranty/${w._id}/claims`, { issue }); toast.ok(t("saved")); onDone(); } catch (e) { toast.err(e); } };
  return <Modal size="sm" title={t("warranty.newClaim")} onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn disabled={!issue.trim()} onClick={run}>{t("save")}</Btn></>}>{expired && <p className="mb-3 rounded-xl bg-warn-soft p-3 text-sm font-semibold text-warn">{t("warranty.expiredWarn")}</p>}<Field label={t("warranty.issue")}><Textarea autoFocus rows={4} value={issue} onChange={(e) => setIssue(e.target.value)} /></Field></Modal>;
}
function ClaimUpdate({ c, onClose, onDone }) {
  const { t, toast } = useApp(); const [f, setF] = useState({ status: c.status, sentTo: c.sentTo, cost: c.cost || "", result: c.result, note: "" });
  const run = async () => { try { await put(`/warranty/claims/${c._id}`, f); toast.ok(t("saved")); onDone(); } catch (e) { toast.err(e); } };
  return <Modal size="sm" title={`${t("warranty.update")} ${c.no}`} onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn onClick={run}>{t("save")}</Btn></>}><div className="grid gap-4"><Field label={t("status")}><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{CLAIM.map((k) => <option key={k} value={k}>{t(`claim.${k}`)}</option>)}</Select></Field><Field label={t("warranty.sentTo")}><Input value={f.sentTo} onChange={(e) => setF({ ...f, sentTo: e.target.value })} /></Field><Field label={t("warranty.cost")}><Input type="number" min="0" className="num" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field><Field label={t("warranty.result")}><Textarea value={f.result} onChange={(e) => setF({ ...f, result: e.target.value })} /></Field></div></Modal>;
}
function ExtendForm({ w, onClose, onDone }) {
  const { t, toast } = useApp(); const [months, setMonths] = useState(String(w.months)); const [reason, setReason] = useState("");
  const run = async () => { try { await put(`/warranty/${w._id}`, { months: Number(months), reason }); toast.ok(t("saved")); onDone(); } catch (e) { toast.err(e); } };
  return <Modal size="sm" title={t("warranty.edit")} onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn disabled={!reason.trim()} onClick={run}>{t("save")}</Btn></>}><div className="grid gap-4"><p className="text-sm text-mute">{t("warranty.edit.hint")}</p><Field label={`${t("warranty.period")} (${t("months")})`}><Input type="number" min="0" className="num" value={months} onChange={(e) => setMonths(e.target.value)} /></Field><Field label={t("reason")}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div></Modal>;
}
