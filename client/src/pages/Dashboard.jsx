import { useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowDownToLine, Banknote, Boxes, Coins, HandCoins, Landmark, Plus, ShieldCheck, ShoppingCart, TrendingUp, Wallet, Wrench, Receipt } from "lucide-react";
import { useApp } from "../lib/app";
import { preset } from "../lib/dates";
import { Badge, Btn, Empty, Spinner, Stat, useFetch } from "../components/ui";
import RangePicker from "../components/RangePicker";
import { brandColors } from "../components/ui";
import shop from "../assets/shop.jpg";

export default function Dashboard() {
  const { t, fmt, can, user, settings } = useApp();
  const [r, setR] = useState({ ...preset("30d"), key: "30d" });
  const { data: d, loading } = useFetch("/reports/dashboard", { from: r.from, to: r.to }, []);
  const hour = new Date().getHours();
  if (loading && !d) return <Spinner />;
  if (!d) return null;
  const tip = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--ink)", fontSize: 13 };
  const axis = { fill: "var(--mute)", fontSize: 12 };
  const series = d.series.map((x) => ({ ...x, label: fmt.date(x.day + "T12:00:00").slice(5) }));

  return (
    <>
      <section className="page-banner dashboard-banner relative mb-6 overflow-hidden rounded-[1.75rem] text-white">
        <img src={shop} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#192923]/95 via-[#263831]/75 to-transparent rtl:bg-gradient-to-l" />
        <div className="relative grid gap-6 p-6 sm:p-9 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div>
            <p className="text-sm font-semibold text-[#ffb36b]">{t(hour < 12 ? "greet.morning" : hour < 17 ? "greet.noon" : "greet.evening")}، {user.name}</p>
            <p className="mt-4 text-sm text-white/70">{t("dash.today")}</p>
            <div className="num text-5xl font-extrabold tracking-tight sm:text-6xl">{fmt.money(d.today.total)}</div>
            <p className="num mt-2 text-white/75">{fmt.num(d.today.count)} {t("dash.invoices")}</p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {can("sales.create") && <Link to="/pos"><Btn variant="accent" size="lg" icon={ShoppingCart}>{t("nav.pos")}</Btn></Link>}
            {can("purchases.create") && <Link to="/purchases?new=1"><Btn variant="soft" size="lg" icon={Plus} className="!bg-white/15 !text-white backdrop-blur hover:!bg-white/25">{t("purchase.new")}</Btn></Link>}
          </div>
        </div>
      </section>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-extrabold">{t("dash.overview")}</h2><RangePicker value={r} onChange={setR} /></div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat icon={Receipt} label={t("dash.sales")} value={fmt.money(d.period.total)} sub={`${fmt.num(d.period.count)} ${t("dash.invoices")}`} />
        {d.grossProfit !== undefined && <Stat icon={TrendingUp} tone="ok" label={t("dash.gross")} value={fmt.money(d.grossProfit)} sub={d.unknownCost ? `${fmt.num(d.unknownCost)} ${t("dash.nocost")}` : t("dash.gross.hint")} />}
        {d.netProfit !== undefined && <Stat icon={Coins} tone={d.netProfit >= 0 ? "ok" : "bad"} label={t("dash.net")} value={fmt.money(d.netProfit)} sub={t("dash.net.hint")} />}
        {d.purchases && <Stat icon={ArrowDownToLine} tone="acc" label={t("dash.purchases")} value={fmt.money(d.purchases.period)} sub={`${t("dash.today")}: ${fmt.money(d.purchases.today)}`} />}
        {d.stockValue !== undefined && <Stat icon={Boxes} tone="acc" label={t("dash.stockValue")} value={fmt.money(d.stockValue)} />}
        {d.cash && <Stat icon={Wallet} label={t("dash.cash")} value={fmt.money(d.cash.total)} />}
        {d.customerDebt !== undefined && <Stat icon={HandCoins} tone="warn" label={t("dash.custDebt")} value={fmt.money(d.customerDebt)} />}
        {d.supplierDebt !== undefined && <Stat icon={Landmark} tone="bad" label={t("dash.supDebt")} value={fmt.money(d.supplierDebt)} />}
        {d.expenses !== undefined && <Stat icon={Banknote} tone="bad" label={t("dash.expenses")} value={fmt.money(d.expenses)} sub={`${t("dash.salaries")}: ${fmt.money(d.salaries)}`} />}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-5">
        <div className="card p-5 lg:col-span-3">
          <h3 className="mb-3 font-extrabold">{t("dash.trend")}</h3>
          <div className="h-[280px]" dir="ltr" role="group" aria-label={t("dash.trend")}>
            <ResponsiveContainer width="100%" height="100%"><BarChart data={series} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={axis} interval="preserveStartEnd" minTickGap={22} /><YAxis tickLine={false} axisLine={false} tick={axis} tickCount={4} allowDecimals={false} width={66} tickFormatter={(v) => fmt.num(v)} />
              <Tooltip cursor={{ fill: "var(--soft)" }} contentStyle={tip} formatter={(v) => [fmt.money(v), t("dash.sales")]} />
              <defs><linearGradient id="dashboardSalesGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-start)" /><stop offset="100%" stopColor="var(--chart-end)" /></linearGradient></defs>
              <Bar dataKey="total" fill="url(#dashboardSalesGradient)" radius={[6, 6, 2, 2]} maxBarSize={28} />
            </BarChart></ResponsiveContainer>
          </div>
        </div>
        <div className="card p-5 lg:col-span-2">
          <h3 className="mb-3 font-extrabold">{t("dash.byBrand")}</h3>
          {d.byBrand.length ? <div className="grid gap-2.5">{d.byBrand.slice(0, 7).map((b) => { const [c] = brandColors(b.name); const max = d.byBrand[0].value || 1; return (
            <div key={b.name}><div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{b.name}</span><span className="num text-mute">{fmt.money(b.value)}</span></div><div className="h-2 overflow-hidden rounded-full bg-soft"><div className="h-full rounded-full" style={{ width: `${(b.value / max) * 100}%`, background: c }} /></div></div>); })}</div> : <Empty title={t("empty")} />}
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="card p-5">
          <h3 className="mb-3 font-extrabold">{t("dash.top")}</h3>
          {d.top.length ? <ol className="grid gap-1">{d.top.map((x, i) => <li key={x.name} className="flex items-center gap-3 rounded-lg px-1 py-2"><span className="num grid h-7 w-7 place-items-center rounded-lg bg-soft text-xs font-extrabold text-mute">{fmt.num(i + 1)}</span><span className="ltr min-w-0 flex-1 truncate font-semibold">{x.name}</span><span className="num text-sm text-mute">×{fmt.num(x.qty)}</span></li>)}</ol> : <Empty title={t("empty")} />}
        </div>
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between"><h3 className="font-extrabold">{t("dash.byCat")}</h3></div>
          {d.byCategory.length ? <div className="grid gap-2">{d.byCategory.map((c) => <div key={c.name} className="flex justify-between text-sm"><span className="font-semibold">{c.name}</span><span className="num text-mute">{fmt.money(c.value)}</span></div>)}</div> : <Empty title={t("empty")} />}
          <div className="mt-5 grid gap-2 border-t border-line pt-4">
            <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 font-semibold"><ShieldCheck size={16} className="text-ok" />{t("dash.warranty")}</span><span className="num">{fmt.num(d.warranty.active)} <span className="text-warn">({fmt.num(d.warranty.expiring)} {t("dash.expiring")})</span></span></div>
            {d.repairs && <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 font-semibold"><Wrench size={16} className="text-pri" />{t("nav.repairs")}</span><span className="num">{fmt.num(d.repairs.open)} <span className="text-ok">({fmt.num(d.repairs.ready)} {t("repair.status.ready")})</span></span></div>}
          </div>
        </div>
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between"><h3 className="flex items-center gap-2 font-extrabold"><AlertTriangle size={17} className="text-warn" />{t("dash.low")}</h3><Link to="/alerts" className="text-sm font-bold text-pri">{t("all")}</Link></div>
          <div className="mb-3 flex gap-2"><Badge tone="warn">{t("stock.low")}: {fmt.num(d.lowCount)}</Badge><Badge tone="bad">{t("stock.out")}: {fmt.num(d.outCount)}</Badge></div>
          {d.low.length ? <ul className="grid gap-1">{d.low.map((p) => <li key={p.id} className="flex items-center justify-between rounded-lg px-1 py-1.5 text-sm"><span className="ltr truncate font-semibold">{p.name}</span><span className="num font-extrabold text-warn">{fmt.num(p.qty)}</span></li>)}</ul> : <p className="py-6 text-center text-sm text-mute">{t("dash.low.none")}</p>}
        </div>
      </div>
    </>
  );
}
