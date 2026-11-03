import { useState } from "react";
import { ArrowLeftRight, Landmark, Minus, Plus, Wallet, CreditCard, Banknote } from "lucide-react";
import { Bar, BarChart, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApp } from "../lib/app";
import { post, put } from "../lib/api";
import { Badge, Btn, DataTable, Dt, Field, Input, Modal, PageHead, Select, Spinner, Stat, Tabs, Textarea, useFetch } from "../components/ui";
import ShiftControl from "../components/ShiftControl";
import RangePicker from "../components/RangePicker";
import { preset } from "../lib/dates";

const ICON = { cash: Banknote, bank: Landmark, digital: CreditCard };
const CATS = ["sale", "customer_payment", "supplier_payment", "purchase", "expense", "salary", "refund", "repair", "manual", "transfer", "opening"];

export default function Cashbox() {
  const { t, fmt, can } = useApp(); const [tab, setTab] = useState("overview"); const [tick, setTick] = useState(0); const [dlg, setDlg] = useState(null);
  const [r, setR] = useState({ ...preset("today"), key: "today" });
  const { data: sum } = useFetch("/accounts/summary", { from: r.from, to: r.to }, [tick]); const accounts = sum?.accounts || [];
  const refresh = () => setTick((x) => x + 1);
  const [f, setF] = useState({ account: "", dir: "", cat: "" });
  return (
    <>
      <PageHead icon={Wallet} title={t("nav.cashbox")} sub={t("cashbox.sub")} actions={<>
        {can("cashbox.manual") && <><Btn variant="soft" icon={Plus} onClick={() => setDlg("in")}>{t("cash.deposit")}</Btn><Btn variant="soft" icon={Minus} onClick={() => setDlg("out")}>{t("cash.withdraw")}</Btn><Btn variant="primary" icon={ArrowLeftRight} onClick={() => setDlg("transfer")}>{t("cash.transfer")}</Btn></>}
        {can("accounts.manage") && <Btn variant="ghost" icon={Plus} onClick={() => setDlg("account")}>{t("account.add")}</Btn>}</>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "overview", label: t("cash.overview") }, { key: "tx", label: t("cash.transactions") }, { key: "shifts", label: t("cash.shifts") }]} />
      {tab === "overview" && (!sum ? <Spinner /> : <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><ShiftControl onChange={refresh} /><RangePicker value={r} onChange={setR} /></div>
        <div className="mb-5 grid gap-3 sm:grid-cols-3"><Stat icon={Wallet} label={t("cash.total")} value={fmt.money(sum.total)} /><Stat tone="ok" icon={Plus} label={t("cash.in")} value={fmt.money(sum.in)} sub={t("cash.excl")} /><Stat tone="bad" icon={Minus} label={t("cash.out")} value={fmt.money(sum.out)} sub={t("cash.excl")} /></div>
        <div className="mb-5 grid gap-5 lg:grid-cols-2">
          <section className="card overflow-hidden"><h2 className="border-b border-line px-5 py-3.5 font-extrabold">{t("cash.cashFlowChart")}</h2><div className="h-[240px] p-4" dir="ltr"><ResponsiveContainer width="100%" height="100%"><BarChart data={[{ name: t("cash.in"), amount: sum.in }, { name: t("cash.out"), amount: sum.out }]} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}><CartesianGrid vertical={false} stroke="var(--line)" /><XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "var(--mute)", fontSize: 12 }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--mute)", fontSize: 11 }} tickFormatter={(v) => fmt.num(v)} width={60} /><Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--ink)" }} formatter={(v) => fmt.money(v)} /><Bar dataKey="amount" radius={[8, 8, 2, 2]} maxBarSize={58}>{["var(--ok)", "var(--bad)"].map((color) => <Cell key={color} fill={color} />)}</Bar></BarChart></ResponsiveContainer></div></section>
          <section className="card overflow-hidden"><h2 className="border-b border-line px-5 py-3.5 font-extrabold">{t("cash.accountBalanceChart")}</h2><div className="h-[240px] p-4" dir="ltr"><ResponsiveContainer width="100%" height="100%"><BarChart data={accounts.map((a) => ({ name: a.name, balance: a.balance }))} layout="vertical" margin={{ top: 4, right: 10, left: 8, bottom: 4 }}><CartesianGrid horizontal={false} stroke="var(--line)" /><XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: "var(--mute)", fontSize: 11 }} tickFormatter={(v) => fmt.num(v)} /><YAxis type="category" dataKey="name" width={100} tickLine={false} axisLine={false} tick={{ fill: "var(--mute)", fontSize: 11 }} /><Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--ink)" }} formatter={(v) => fmt.money(v)} /><Bar dataKey="balance" fill="var(--chart-start)" radius={[0, 8, 8, 0]} maxBarSize={24} /></BarChart></ResponsiveContainer></div></section>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{accounts.map((a) => { const I = ICON[a.type] || Wallet; return (
          <div key={a._id} className="card relative overflow-hidden p-5"><div className="flex items-center justify-between"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-pri-soft text-pri"><I size={22} /></span><div className="flex gap-1.5">{a.isDefault && <Badge tone="acc">{t("default")}</Badge>}<Badge>{t(`method.${a.type}`)}</Badge></div></div><div className="mt-4 text-sm font-semibold text-mute">{a.name}</div><div className={`num mt-1 text-3xl font-extrabold ${a.balance < 0 ? "text-bad" : ""}`}>{fmt.money(a.balance)}</div>
            {can("accounts.manage") && <button className="mt-3 text-sm font-bold text-pri" onClick={() => setDlg({ edit: a })}>{t("edit")}</button>}</div>); })}</div></>)}
      {tab === "tx" && <DataTable endpoint="/accounts/transactions" exportName="transactions" refreshKey={tick} params={f} searchPlaceholder={t("cash.search")}
        filters={<><Select className="!w-auto" value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })}><option value="">{t("account")}: {t("all")}</option>{accounts.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}</Select><Select className="!w-auto" value={f.dir} onChange={(e) => setF({ ...f, dir: e.target.value })}><option value="">{t("all")}</option><option value="in">{t("cash.in")}</option><option value="out">{t("cash.out")}</option></Select><Select className="!w-auto" value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}><option value="">{t("category")}: {t("all")}</option>{CATS.map((c) => <option key={c} value={c}>{t(`cat.${c}`)}</option>)}</Select></>}
        columns={[{ key: "at", label: t("date"), sort: "at", render: (x) => <Dt v={x.at} time />, text: (x) => fmt.date(x.at, true) }, { key: "account", label: t("account"), render: (x) => x.account?.name, text: (x) => x.account?.name }, { key: "cat", label: t("category"), render: (x) => <Badge tone={x.cat === "transfer" ? "pri" : x.dir === "in" ? "ok" : "bad"}>{t(`cat.${x.cat}`)}</Badge>, text: (x) => t(`cat.${x.cat}`) },
          { key: "ref", label: t("reference"), render: (x) => <span className="num ltr">{x.ref?.no || "—"}</span>, text: (x) => x.ref?.no }, { key: "note", label: t("note"), render: (x) => <span className="block max-w-[220px] truncate text-mute">{x.party?.name ? `${x.party.name} · ` : ""}{x.note}</span>, text: (x) => x.note },
          { key: "amount", label: t("amount"), sort: "amount", align: "end", render: (x) => <b className={`num ${x.dir === "in" ? "text-ok" : "text-bad"}`}>{x.dir === "in" ? "+" : "−"}{fmt.num(x.amount)}</b>, text: (x) => (x.dir === "in" ? x.amount : -x.amount) }, { key: "u", label: t("user"), render: (x) => x.user?.name, text: (x) => x.user?.name }]} />}
      {tab === "shifts" && <DataTable endpoint="/accounts/shifts" refreshKey={tick} search={false} columns={[{ key: "user", label: t("user"), render: (s) => s.user?.name }, { key: "account", label: t("account"), render: (s) => s.account?.name }, { key: "openedAt", label: t("shift.opened"), render: (s) => <Dt v={s.openedAt} time /> }, { key: "closedAt", label: t("shift.closed"), render: (s) => (s.closedAt ? <Dt v={s.closedAt} time /> : <Badge tone="ok" dot>{t("shift.open")}</Badge>) },
        { key: "openingBalance", label: t("shift.opening"), align: "end", render: (s) => <span className="num">{fmt.num(s.openingBalance)}</span> }, { key: "expected", label: t("shift.expected"), align: "end", render: (s) => <span className="num">{fmt.num(s.expected)}</span> }, { key: "closingBalance", label: t("shift.counted"), align: "end", render: (s) => <span className="num">{s.closingBalance != null ? fmt.num(s.closingBalance) : "—"}</span> },
        { key: "difference", label: t("shift.diff"), align: "end", render: (s) => (s.difference != null ? <b className={`num ${s.difference === 0 ? "text-ok" : "text-bad"}`}>{fmt.num(s.difference)}</b> : "—") }]} />}
      {dlg && (dlg === "in" || dlg === "out") && <Manual dir={dlg} accounts={accounts} onClose={() => setDlg(null)} onDone={() => { setDlg(null); refresh(); }} />}
      {dlg === "transfer" && <Transfer accounts={accounts} onClose={() => setDlg(null)} onDone={() => { setDlg(null); refresh(); }} />}
      {(dlg === "account" || dlg?.edit) && <AccountForm initial={dlg.edit} onClose={() => setDlg(null)} onDone={() => { setDlg(null); refresh(); }} />}
    </>
  );
}

function Manual({ dir, accounts, onClose, onDone }) {
  const { t, toast, user } = useApp(); const [acc, setAcc] = useState(accounts[0]?._id || ""); const [amount, setAmount] = useState(""); const [note, setNote] = useState(""); const [over, setOver] = useState(false);
  const run = async () => { try { await post("/accounts/manual", { account: acc, dir, amount: Number(amount), note, override: over }); toast.ok(t("saved")); onDone(); } catch (e) { toast.err(e); } };
  return <Modal size="sm" title={t(dir === "in" ? "cash.deposit" : "cash.withdraw")} onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn disabled={!(Number(amount) > 0) || !note.trim()} onClick={run}>{t("confirm")}</Btn></>}>
    <div className="grid gap-4"><Field label={t("account")}><Select value={acc} onChange={(e) => setAcc(e.target.value)}>{accounts.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}</Select></Field><Field label={t("amount")}><Input type="number" min="0" autoFocus className="num" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field><Field label={t("note")} hint={t("cash.note.hint")}><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {dir === "out" && user.role === "admin" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--pri)]" checked={over} onChange={(e) => setOver(e.target.checked)} />{t("cash.override")}</label>}</div></Modal>;
}
function Transfer({ accounts, onClose, onDone }) {
  const { t, toast, user, fmt } = useApp(); const [from, setFrom] = useState(accounts[0]?._id || ""); const [to, setTo] = useState(accounts[1]?._id || ""); const [amount, setAmount] = useState(""); const [note, setNote] = useState(""); const [over, setOver] = useState(false);
  const src = accounts.find((a) => a._id === from);
  const run = async () => { try { await post("/accounts/transfer", { from, to, amount: Number(amount), note, override: over }); toast.ok(t("saved")); onDone(); } catch (e) { toast.err(e); } };
  return <Modal size="sm" title={t("cash.transfer")} onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn disabled={!(Number(amount) > 0) || from === to || (over && !note.trim())} onClick={run}>{t("confirm")}</Btn></>}>
    <div className="grid gap-4"><p className="rounded-xl bg-pri-soft p-3 text-sm text-pri">{t("cash.transfer.hint")}</p><Field label={t("cash.from")}><Select value={from} onChange={(e) => setFrom(e.target.value)}>{accounts.map((a) => <option key={a._id} value={a._id}>{a.name} — {fmt.num(a.balance)}</option>)}</Select></Field><Field label={t("cash.to")}><Select value={to} onChange={(e) => setTo(e.target.value)}>{accounts.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}</Select></Field>
      <Field label={t("amount")} error={src && Number(amount) > src.balance && !over ? t("err.INSUFFICIENT_FUNDS") : null}><Input type="number" min="0" className="num" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field><Field label={t("note")}><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {user.role === "admin" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--pri)]" checked={over} onChange={(e) => setOver(e.target.checked)} />{t("cash.override")}</label>}</div></Modal>;
}
function AccountForm({ initial, onClose, onDone }) {
  const { t, toast } = useApp(); const [a, setA] = useState(initial || { name: "", type: "cash", openingBalance: "", isDefault: false, active: true });
  const run = async () => { try { await (initial ? put(`/accounts/${a._id}`, a) : post("/accounts", a)); toast.ok(t("saved")); onDone(); } catch (e) { toast.err(e); } };
  return <Modal size="sm" title={t(initial ? "edit" : "account.add")} onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn disabled={!a.name.trim()} onClick={run}>{t("save")}</Btn></>}>
    <div className="grid gap-4"><Field label={t("name")}><Input autoFocus value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} /></Field><Field label={t("type")}><Select value={a.type} onChange={(e) => setA({ ...a, type: e.target.value })}>{["cash", "bank", "digital"].map((k) => <option key={k} value={k}>{t(`method.${k}`)}</option>)}</Select></Field>
      {!initial && <Field label={t("account.opening")}><Input type="number" min="0" className="num" value={a.openingBalance} onChange={(e) => setA({ ...a, openingBalance: e.target.value })} /></Field>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--pri)]" checked={a.isDefault} onChange={(e) => setA({ ...a, isDefault: e.target.checked })} />{t("default")}</label>
      {initial && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--pri)]" checked={a.active} onChange={(e) => setA({ ...a, active: e.target.checked })} />{t("active")}</label>}</div></Modal>;
}
