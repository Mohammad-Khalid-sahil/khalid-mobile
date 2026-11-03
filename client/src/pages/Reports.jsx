import { useState } from "react";
import { BarChart3, Info } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApp } from "../lib/app";
import { Badge, Empty, ExportMenu, Select, SimpleTable, Spinner, Stat, Tabs, PageHead, useFetch } from "../components/ui";
import RangePicker from "../components/RangePicker";
import { preset } from "../lib/dates";

export default function Reports() {
  const { t, can } = useApp(); const [tab, setTab] = useState("sales"); const [r, setR] = useState({ ...preset("30d"), key: "30d" });
  const tabs = [{ key: "sales", label: t("rep.sales") }, { key: "salesBy", label: t("rep.salesBy") }, { key: "purchases", label: t("rep.purchases") }, { key: "finance", label: t("rep.finance") }, { key: "service", label: t("rep.service") }];
  return (
    <>
      <PageHead icon={BarChart3} title={t("nav.reports")} sub={t("reports.sub")} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="no-print mb-5"><RangePicker value={r} onChange={setR} /></div>
      <div id="print-area" className="grid gap-5">
        <div className="hidden print:block"><h1 className="text-xl font-extrabold">{tabs.find((x) => x.key === tab).label}</h1><p className="num">{r.from} → {r.to}</p></div>
        {tab === "sales" && <SalesRep r={r} />}{tab === "salesBy" && <SalesBy r={r} />}{tab === "purchases" && <PurchasesRep r={r} />}{tab === "finance" && <Finance r={r} />}{tab === "service" && <Service r={r} />}
      </div>
    </>
  );
}

const Card = ({ title, actions, children }) => <section className="card overflow-hidden">{(title || actions) && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5"><h2 className="font-extrabold">{title}</h2>{actions}</div>}{children}</section>;
const useRep = (path, r, extra = {}) => useFetch(path, { from: r.from, to: r.to, ...extra }, []);
const CHART_COLORS = ["var(--chart-start)", "var(--pri)", "var(--ok)", "var(--warn)", "var(--blue)", "var(--bad)"];
const chartTip = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--ink)", fontSize: 12 };
const chartAxis = { fill: "var(--mute)", fontSize: 11 };

function RankChart({ title, rows, nameKey = "name", valueKey = "value", fmt }) {
  const { t } = useApp();
  const data = rows.slice(0, 8).slice().reverse();
  if (!data.length) return <Card title={title}><div className="grid h-48 place-items-center"><Empty title={t("empty")} /></div></Card>;
  return <Card title={title}><div className="h-[260px] p-4" dir="ltr"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ top: 2, right: 10, left: 8, bottom: 2 }}>
    <CartesianGrid horizontal={false} stroke="var(--line)" /><XAxis type="number" tickLine={false} axisLine={false} tick={chartAxis} tickFormatter={(v) => fmt.num(v)} /><YAxis type="category" dataKey={nameKey} width={105} tickLine={false} axisLine={false} tick={chartAxis} /><Tooltip contentStyle={chartTip} formatter={(v) => fmt.money(v)} /><Bar dataKey={valueKey} fill="var(--chart-start)" radius={[0, 7, 7, 0]} maxBarSize={22} />
  </BarChart></ResponsiveContainer></div></Card>;
}

function SalesRep({ r }) {
  const { t, fmt } = useApp(); const [group, setGroup] = useState("day"); const { data: d } = useRep("/reports/sales", r, { group });
  if (!d) return <Spinner />; const p = d.totals.profit !== undefined;
  const cols = [{ label: t("rep.period"), render: (x) => <b className="num">{x.key}</b>, key: "key" }, { label: t("rep.count"), key: "count", align: "end" }, { label: t("rep.gross"), key: "gross", align: "end" }, { label: t("discount"), key: "discount", align: "end" }, { label: t("total"), key: "total", align: "end" }, { label: t("rep.returns"), key: "returns", align: "end" }, { label: t("rep.exchanges"), key: "exchanges", align: "end" }, { label: t("rep.net"), key: "net", align: "end" }, ...(p ? [{ label: t("rep.profit"), key: "profit", align: "end" }] : []), { label: t("paytype.cash"), key: "cash", align: "end" }, { label: t("paytype.credit"), key: "credit", align: "end" }, { label: t("paytype.partial"), key: "partial", align: "end" }];
  const fm = (c) => (x) => <span className={c === "profit" ? (x[c] >= 0 ? "text-ok" : "text-bad") : ""}>{["count", "cash", "credit", "partial"].includes(c) ? fmt.num(x[c]) : fmt.num(x[c])}</span>;
  const showCols = cols.map((c) => (c.render ? c : { ...c, render: fm(c.key) }));
  const chartRows = d.rows.slice().reverse();
  return (<>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label={t("rep.net")} value={fmt.money(d.totals.net)} /><Stat label={t("rep.count")} value={fmt.num(d.totals.count)} tone="acc" />{p && <Stat tone="ok" label={t("rep.profit")} value={fmt.money(d.totals.profit)} sub={d.totals.unknownCost ? `${fmt.num(d.totals.unknownCost)} ${t("dash.nocost")}` : undefined} />}<Stat label={t("discount")} value={fmt.money(d.totals.discount)} tone="warn" /></div>
    <Card title={t("rep.salesTrend")}>{chartRows.length ? <div className="h-[280px] p-4" dir="ltr"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}><defs><linearGradient id="reportSalesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-start)" stopOpacity={.32} /><stop offset="95%" stopColor="var(--chart-start)" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="var(--line)" /><XAxis dataKey="key" tickLine={false} axisLine={false} tick={chartAxis} interval="preserveStartEnd" minTickGap={24} /><YAxis tickLine={false} axisLine={false} tick={chartAxis} width={64} tickFormatter={(v) => fmt.num(v)} /><Tooltip contentStyle={chartTip} formatter={(v, name) => [fmt.money(v), name === "net" ? t("rep.net") : t("rep.gross")]} /><Area type="monotone" dataKey="net" stroke="var(--chart-start)" strokeWidth={3} fill="url(#reportSalesFill)" /><Line type="monotone" dataKey="total" stroke="var(--pri)" strokeWidth={2} dot={false} /></AreaChart></ResponsiveContainer></div> : <div className="grid h-48 place-items-center"><Empty title={t("empty")} /></div>}</Card>
    <Card title={t("rep.sales")} actions={<div className="no-print flex items-center gap-2"><Select className="!w-auto" value={group} onChange={(e) => setGroup(e.target.value)}>{["day", "week", "month", "year"].map((g) => <option key={g} value={g}>{t(`group.${g}`)}</option>)}</Select><ExportMenu name="sales-report" cols={cols.map((c) => ({ label: c.label, key: c.key }))} getRows={async () => d.rows} /></div>}>
      <SimpleTable cols={showCols} rows={d.rows} rowKey={(x) => x.key} footer={[t("total"), fmt.num(d.totals.count), fmt.num(d.totals.gross), fmt.num(d.totals.discount), fmt.num(d.totals.total), fmt.num(d.totals.returns), fmt.num(d.totals.exchanges), fmt.num(d.totals.net), ...(p ? [fmt.num(d.totals.profit)] : []), fmt.num(d.totals.cash), fmt.num(d.totals.credit), fmt.num(d.totals.partial)]} />
    </Card>
    {p && <Note text={t("rep.profit.def")} />}
  </>);
}
const Note = ({ text }) => <p className="flex items-start gap-2 rounded-xl bg-pri-soft p-3 text-sm text-pri"><Info size={16} className="mt-0.5 shrink-0" />{text}</p>;

function SalesBy({ r }) {
  const { t, fmt } = useApp(); const [dim, setDim] = useState("product"); const { data: d } = useRep("/reports/sales-by", r, { dim });
  if (!d) return <Spinner />; const p = d.rows[0]?.profit !== undefined;
  const cols = [{ label: t(`dim.${dim}`), key: "name", render: (x) => <b>{dim === "payType" ? t(`paytype.${x.name}`) : x.name}</b> }, { label: t("qty"), key: "qty", align: "end", render: (x) => fmt.num(x.qty) }, { label: t("rep.revenue"), key: "revenue", align: "end", render: (x) => fmt.num(x.revenue) }, { label: t("discount"), key: "discount", align: "end", render: (x) => fmt.num(x.discount) }, ...(p ? [{ label: t("rep.profit"), key: "profit", align: "end", render: (x) => <span className={x.profit >= 0 ? "text-ok" : "text-bad"}>{fmt.num(x.profit)}{x.unknownCost > 0 && <Badge tone="warn">{t("dash.nocost")}</Badge>}</span> }] : [])];
  return <><RankChart title={t("rep.salesByChart")} rows={d.rows} valueKey="revenue" fmt={fmt} /><Card title={t("rep.salesBy")} actions={<div className="no-print flex items-center gap-2"><Select className="!w-auto" value={dim} onChange={(e) => setDim(e.target.value)}>{["product", "brand", "category", "customer", "seller", "payType"].map((k) => <option key={k} value={k}>{t(`dim.${k}`)}</option>)}</Select><ExportMenu name={`sales-by-${dim}`} cols={cols.map((c) => ({ label: c.label, key: c.key }))} getRows={async () => d.rows} /></div>}><SimpleTable cols={cols} rows={d.rows} rowKey={(x) => x.name} /></Card></>;
}

function PurchasesRep({ r }) {
  const { t, fmt } = useApp(); const [dim, setDim] = useState("period"); const [group, setGroup] = useState("month"); const { data: d } = useRep("/reports/purchases", r, { dim, group });
  if (!d) return <Spinner />;
  const cols = [{ label: t(`dim.${dim}`), key: "name", render: (x) => <b className="ltr">{x.name}</b> }, ...(dim === "period" || dim === "supplier" ? [{ label: t("rep.count"), key: "count", align: "end", render: (x) => fmt.num(x.count) }] : []), { label: t("qty"), key: "qty", align: "end", render: (x) => fmt.num(x.qty) }, { label: t("total"), key: "total", align: "end", render: (x) => fmt.num(x.total) }, ...(dim === "period" || dim === "supplier" ? [{ label: t("paid"), key: "paid", align: "end", render: (x) => fmt.num(x.paid) }, { label: t("due"), key: "due", align: "end", render: (x) => (x.due ? <b className="text-warn">{fmt.num(x.due)}</b> : "—") }] : [])];
  return (<><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label={t("total")} value={fmt.money(d.totals.total)} /><Stat tone="ok" label={t("paid")} value={fmt.money(d.totals.paid)} /><Stat tone="warn" label={t("due")} value={fmt.money(d.totals.due)} /><Stat tone="acc" label={t("qty")} value={fmt.num(d.totals.qty)} /></div>
    <RankChart title={t("rep.purchaseChart")} rows={d.rows} valueKey="total" fmt={fmt} />
    <Card title={t("rep.purchases")} actions={<div className="no-print flex items-center gap-2"><Select className="!w-auto" value={dim} onChange={(e) => setDim(e.target.value)}>{["period", "supplier", "product", "brand"].map((k) => <option key={k} value={k}>{t(`dim.${k}`)}</option>)}</Select>{dim === "period" && <Select className="!w-auto" value={group} onChange={(e) => setGroup(e.target.value)}>{["day", "week", "month", "year"].map((g) => <option key={g} value={g}>{t(`group.${g}`)}</option>)}</Select>}<ExportMenu name="purchases-report" cols={cols.map((c) => ({ label: c.label, key: c.key }))} getRows={async () => d.rows} /></div>}><SimpleTable cols={cols} rows={d.rows} rowKey={(x) => x.name} /></Card></>);
}

function Finance({ r }) {
  const { t, fmt } = useApp(); const { data: d } = useRep("/reports/finance", r);
  if (!d) return <Spinner />;
  const rowsOf = (o, pre) => Object.entries(o).map(([k, v]) => ({ name: pre ? t(`${pre}${k}`) : k, v }));
  const T = ({ title, rows, total }) => <Card title={title}><SimpleTable cols={[{ label: t("category"), key: "name" }, { label: t("amount"), key: "v", align: "end", render: (x) => fmt.num(x.v) }]} rows={rows} rowKey={(x) => x.name} footer={total != null ? [t("total"), fmt.num(total)] : undefined} /></Card>;
  return (<>
    {d.netProfit !== undefined && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label={t("rep.revenue")} value={fmt.money(d.revenue)} /><Stat tone="ok" label={t("dash.gross")} value={fmt.money(d.grossProfit)} sub={d.unknownCost ? `${fmt.num(d.unknownCost)} ${t("dash.nocost")}` : undefined} /><Stat tone="bad" label={t("rep.opex")} value={fmt.money(d.expenses + d.salaries)} sub={`${t("dash.expenses")} ${fmt.num(d.expenses)} · ${t("dash.salaries")} ${fmt.num(d.salaries)}`} /><Stat tone={d.netProfit >= 0 ? "ok" : "bad"} label={t("dash.net")} value={fmt.money(d.netProfit)} /></div>}
    <div className="grid gap-5 lg:grid-cols-2"><RankChart title={t("cash.in")} rows={rowsOf(d.receipts, "cat.")} valueKey="v" fmt={fmt} /><RankChart title={t("cash.out")} rows={rowsOf(d.payments, "cat.")} valueKey="v" fmt={fmt} /></div>
    <div className="grid gap-5 lg:grid-cols-2"><T title={`${t("cash.in")} (${fmt.money(d.receiptsTotal)})`} rows={rowsOf(d.receipts, "cat.")} /><T title={`${t("cash.out")} (${fmt.money(d.paymentsTotal)})`} rows={rowsOf(d.payments, "cat.")} /></div>
    <div className="grid gap-5 lg:grid-cols-2"><T title={t("rep.accounts")} rows={d.accounts.map((a) => ({ name: a.name, v: a.balance }))} total={d.cashTotal} /><T title={t("dash.expenses")} rows={rowsOf(d.expensesByCategory)} total={d.expenses} /></div>
    <div className="grid gap-3 sm:grid-cols-2"><Stat tone="warn" label={t("dash.custDebt")} value={fmt.money(d.customerDebt)} sub={`${fmt.num(d.debtors)} ${t("customers.debtors")}`} /><Stat tone="bad" label={t("dash.supDebt")} value={fmt.money(d.supplierDebt)} sub={`${fmt.num(d.creditors)} ${t("suppliers.creditors")}`} /></div>
    <Note text={t("rep.finance.def")} />
  </>);
}

function Service({ r }) {
  const { t, fmt, settings } = useApp(); const { data: d } = useRep("/reports/warranty", r);
  if (!d) return <Spinner />;
  const claims = Object.entries(d.claimsByStatus).map(([name, value]) => ({ name, value }));
  return (<><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat tone="ok" label={t("warranty.st.active")} value={fmt.num(d.active)} /><Stat tone="warn" label={t("warranty.st.expiring")} value={fmt.num(d.expiring)} /><Stat tone="bad" label={t("warranty.st.expired")} value={fmt.num(d.expired)} /><Stat label={t("warranty.st.void")} value={fmt.num(d.void)} /></div>
    {!!claims.length && <Card title={t("rep.claimsChart")}><div className="h-[290px] p-4" dir="ltr"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={claims} dataKey="value" nameKey="name" innerRadius={62} outerRadius={96} paddingAngle={4} stroke="var(--card)">{claims.map((x, i) => <Cell key={x.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Pie><Tooltip contentStyle={chartTip} formatter={(v, key) => [fmt.num(v), t(`claim.${key}`)]} /><Legend formatter={(key) => <span style={{ color: "var(--ink)" }}>{t(`claim.${key}`)}</span>} /></PieChart></ResponsiveContainer></div></Card>}
    <Card title={t("warranty.claims")}><SimpleTable cols={[{ label: t("status"), key: "k", render: (x) => t(`claim.${x.k}`) }, { label: t("rep.count"), key: "n", align: "end", render: (x) => fmt.num(x.n) }]} rows={Object.entries(d.claimsByStatus).map(([k, n]) => ({ k, n }))} rowKey={(x) => x.k} footer={[t("warranty.cost"), fmt.num(d.claimCost)]} /></Card>
    {settings.modules.repairs && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat icon={BarChart3} label={t("nav.repairs")} value={fmt.num(d.repairs.total)} /><Stat tone="warn" label={t("repair.open")} value={fmt.num(d.repairs.open)} /><Stat tone="ok" label={t("repair.status.delivered")} value={fmt.num(d.repairs.done)} /><Stat tone="acc" label={t("rep.revenue")} value={fmt.money(d.repairs.income)} /></div>}</>);
}
