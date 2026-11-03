import { useMemo, useState } from "react";
import { Factory, HandCoins, Pencil, Plus, Users, Wallet, ReceiptText } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApp } from "../lib/app";
import { del, post, put } from "../lib/api";
import { Badge, Btn, DataTable, NameCell, DateField, Dt, Field, Input, Modal, PageHead, Spinner, Stat, Tabs, Textarea, useFetch } from "./ui";
import PaymentModal from "./PaymentModal";

/** Shared page for customers and suppliers: list, balance, ledger, payments, manual debt, deactivate. */
export default function PartyPage({ kind }) {
  const { t, fmt, can } = useApp(); const isC = kind === "customer"; const ep = `/${kind}s`;
  const canEdit = isC ? can("customers.manage") : can("suppliers.manage"); const canPay = isC ? can("debts.manage") : can("suppliers.manage");
  const [tab, setTab] = useState("all"); const [tick, setTick] = useState(0); const [edit, setEdit] = useState(null); const [open, setOpen] = useState(null);
  const Icon = isC ? Users : Factory;
  const cols = [
    { key: "name", label: t("name"), sort: "name", render: (p) => <NameCell name={p.name} /> , text: (p) => p.name }, { key: "phone", label: t("phone"), render: (p) => <span className="num ltr text-mute">{p.phone || "—"}</span> }, { key: "address", label: t("address"), render: (p) => <span className="block max-w-[200px] truncate text-mute">{p.address || "—"}</span> },
    { key: "balance", label: t(isC ? "balance.owes" : "balance.owed"), sort: "balance", align: "end", render: (p) => (p.balance > 0 ? <b className={`num ${isC ? "text-warn" : "text-bad"}`}>{fmt.money(p.balance)}</b> : <span className="text-mute">—</span>), text: (p) => p.balance },
    { key: "active", label: t("status"), render: (p) => <Badge tone={p.active ? "ok" : "neutral"}>{t(p.active ? "active" : "inactive")}</Badge>, text: (p) => (p.active ? "active" : "inactive") },
  ];
  return (
    <>
      <PageHead icon={Icon} title={t(isC ? "nav.customers" : "nav.suppliers")} sub={t(isC ? "customers.sub" : "suppliers.sub")} actions={canEdit && <Btn variant="accent" icon={Plus} onClick={() => setEdit({ name: "", phone: "", address: "", idNumber: "", note: "", active: true })}>{t(isC ? "customer.add" : "supplier.add")}</Btn>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "all", label: t("all") }, { key: "debt", label: t(isC ? "customers.debtors" : "suppliers.creditors") }, { key: "inactive", label: t("inactive") }]} />
      <DataTable endpoint={ep} exportName={`${kind}s`} params={{ debt: tab === "debt" ? "1" : "", active: tab === "inactive" ? "false" : tab === "all" ? "" : "true" }} refreshKey={tick} sort={tab === "debt" ? "-balance" : undefined} columns={cols} onRow={(p) => setOpen(p._id)} searchPlaceholder={t("party.search")} rowClass={(p) => (p.active ? "" : "opacity-60")} />
      {edit && <PartyForm kind={kind} initial={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); setTick((x) => x + 1); }} />}
      {open && <PartyDetail kind={kind} id={open} canEdit={canEdit} canPay={canPay} onClose={() => setOpen(null)} onEdit={(p) => { setOpen(null); setEdit(p); }} onChanged={() => setTick((x) => x + 1)} />}
    </>
  );
}

function PartyForm({ kind, initial, onClose, onSaved }) {
  const { t, toast, confirm } = useApp(); const isC = kind === "customer"; const [p, setP] = useState(initial); const [busy, setBusy] = useState(false); const isNew = !initial._id; const set = (k) => (e) => setP({ ...p, [k]: e.target.value });
  const save = async (e) => { e.preventDefault(); setBusy(true); try { await (isNew ? post(`/${kind}s`, p) : put(`/${kind}s/${p._id}`, p)); toast.ok(t("saved")); onSaved(); } catch (er) { toast.err(er); setBusy(false); } };
  const remove = async () => { const c = await confirm({ title: t("party.delete"), message: t("party.delete.msg"), danger: true }); if (!c.ok) return; try { const r = await del(`/${kind}s/${p._id}`); toast.ok(r.deactivated ? t("party.deactivated") : t("deleted")); onSaved(); } catch (er) { toast.err(er); } };
  return (
    <Modal size="md" title={t(isNew ? (isC ? "customer.add" : "supplier.add") : "edit")} onClose={onClose}>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Field label={t("name")}><Input required autoFocus value={p.name} onChange={set("name")} /></Field><Field label={t("phone")}><Input dir="ltr" value={p.phone} onChange={set("phone")} /></Field>
        <Field label={t("address")} wide><Input value={p.address} onChange={set("address")} /></Field>
        {isC && <Field label={t("customer.idNumber")} hint={t("customer.idHint")} wide><Input dir="ltr" value={p.idNumber} onChange={set("idNumber")} /></Field>}
        <Field label={t("note")} wide><Textarea value={p.note} onChange={set("note")} /></Field>
        {!isNew && <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-[var(--pri)]" checked={p.active} onChange={(e) => setP({ ...p, active: e.target.checked })} />{t("active")}</label>}
        <div className="flex items-center gap-2 sm:col-span-2">{!isNew && <Btn variant="danger" onClick={remove}>{t("delete")}</Btn>}<Btn variant="ghost" className="ms-auto" onClick={onClose}>{t("cancel")}</Btn><Btn type="submit" loading={busy}>{t("save")}</Btn></div>
      </form>
    </Modal>
  );
}

function PartyDetail({ kind, id, canEdit, canPay, onClose, onEdit, onChanged }) {
  const { t, fmt, toast } = useApp(); const isC = kind === "customer"; const [tick, setTick] = useState(0); const { data: p, reload } = useFetch(`/${kind}s/${id}`, {}, []); const { data: st } = useFetch(`/${kind}s/${id}/stats`, {}, []); const { data: ledger } = useFetch(`/${kind}s/${id}/ledger`, { limit: 200, sort: "at" }, [tick]);
  const [pay, setPay] = useState(false); const [charge, setCharge] = useState(false);
  const balanceHistory = useMemo(() => (ledger?.rows || ledger?.data || ledger || []).filter((e) => e.at && Number.isFinite(Number(e.balanceAfter))).sort((a, b) => new Date(a.at) - new Date(b.at)).map((e) => ({ date: e.at, balance: Number(e.balanceAfter) })), [ledger]);
  const done = () => { reload(); setTick((x) => x + 1); onChanged(); };
  return (
    <Modal size="lg" title={p?.name || "…"} onClose={onClose} footer={p && <>
      {canEdit && <Btn variant="ghost" icon={Pencil} onClick={() => onEdit(p)}>{t("edit")}</Btn>}
      {canPay && <Btn variant="soft" icon={ReceiptText} onClick={() => setCharge(true)}>{t("party.addDebt")}</Btn>}
      {canPay && p.balance > 0 && <Btn variant="accent" icon={isC ? HandCoins : Wallet} onClick={() => setPay(true)}>{t(isC ? "pay.receive" : "pay.pay")}</Btn>}</>}>
      {!p ? <Spinner /> : <>
        <p className="num ltr mb-4 text-sm text-mute">{p.phone} {p.address && <span className="ms-2">· {p.address}</span>}</p>
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat tone={p.balance > 0 ? (isC ? "warn" : "bad") : "ok"} label={t(isC ? "balance.owes" : "balance.owed")} value={fmt.money(p.balance)} />
          {st && <><Stat label={t(isC ? "party.totalSales" : "party.totalPurchases")} value={fmt.money(st.total)} sub={`${fmt.num(st.count)} ${t("party.docs")}`} /><Stat tone="ok" label={t("paid")} value={fmt.money(st.paid)} />{isC && <Stat tone="acc" label={t("status.returned")} value={fmt.money(st.returned)} />}</>}
        </div>
        {balanceHistory.length > 1 && <section className="card mb-5 overflow-hidden"><h3 className="border-b border-line px-5 py-3.5 font-extrabold">{t("party.balanceTrend")}</h3><div className="h-[230px] p-4" dir="ltr"><ResponsiveContainer width="100%" height="100%"><LineChart data={balanceHistory} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--line)" /><XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: "var(--mute)", fontSize: 11 }} tickFormatter={(v) => fmt.date(v)} interval="preserveStartEnd" minTickGap={28} /><YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--mute)", fontSize: 11 }} width={70} tickFormatter={(v) => fmt.num(v)} /><Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--ink)" }} labelFormatter={(v) => fmt.date(v)} formatter={(v) => fmt.money(v)} /><Line type="monotone" dataKey="balance" stroke="var(--chart-start)" strokeWidth={3} dot={false} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer></div></section>}
        <h3 className="mb-2 font-extrabold">{t("party.ledger")}</h3>
        <DataTable endpoint={`/${kind}s/${id}/ledger`} refreshKey={tick} search={false} pageSize={8} columns={[
          { key: "at", label: t("date"), render: (e) => <Dt v={e.at} time /> }, { key: "type", label: t("type"), render: (e) => <Badge tone={e.delta > 0 ? "warn" : "ok"}>{t(`ledger.${e.type}`)}</Badge> },
          { key: "ref", label: t("reference"), render: (e) => <span className="num ltr">{e.ref?.no || "—"}</span> }, { key: "note", label: t("note"), render: (e) => <span className="block max-w-[180px] truncate text-mute">{e.note}</span> },
          { key: "delta", label: t("amount"), align: "end", render: (e) => <b className={`num ${e.delta > 0 ? "text-warn" : "text-ok"}`}>{e.delta > 0 ? "+" : "−"}{fmt.num(Math.abs(e.delta))}</b> }, { key: "balanceAfter", label: t("balance"), align: "end", render: (e) => <span className="num">{fmt.num(e.balanceAfter)}</span> }]} />
      </>}
      {pay && <PaymentModal party={kind} entity={p} onClose={() => setPay(false)} onDone={done} />}
      {charge && <ChargeModal kind={kind} p={p} onClose={() => setCharge(false)} onDone={() => { setCharge(false); done(); }} />}
    </Modal>
  );
}

function ChargeModal({ kind, p, onClose, onDone }) {
  const { t, toast } = useApp(); const [amount, setAmount] = useState(""); const [note, setNote] = useState(""); const [due, setDue] = useState("");
  const run = async () => { try { await post(`/${kind}s/${p._id}/charges`, { amount: Number(amount), note, dueDate: due || undefined }); toast.ok(t("saved")); onDone(); } catch (e) { toast.err(e); } };
  return <Modal size="sm" title={t("party.addDebt")} onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn disabled={!(Number(amount) > 0) || !note.trim()} onClick={run}>{t("save")}</Btn></>}>
    <div className="grid gap-4"><p className="text-sm text-mute">{t("party.addDebt.hint")}</p><Field label={t("amount")}><Input type="number" min="0" autoFocus className="num" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field><Field label={t("note")}><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field><Field label={t("duedate")}><DateField value={due} onChange={setDue} /></Field></div></Modal>;
}
