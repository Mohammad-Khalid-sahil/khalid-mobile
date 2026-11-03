import { Link } from "react-router-dom";
import { AlertTriangle, Bell, CalendarClock, HandCoins, PackageX, ShieldAlert, Wrench } from "lucide-react";
import { useApp } from "../lib/app";
import { Badge, Empty, PageHead, Spinner, useFetch } from "../components/ui";

export default function Alerts() {
  const { t, fmt } = useApp(); const { data: a } = useFetch("/reports/alerts", {}, []);
  if (!a) return <Spinner />;
  const Sec = ({ icon: I, tone, title, rows, to, render }) => rows?.length > 0 && (
    <section className="card overflow-hidden"><div className="flex items-center justify-between border-b border-line px-5 py-3.5"><h2 className="flex items-center gap-2 font-extrabold"><I size={18} className={`text-${tone}`} />{title}<Badge tone={tone}>{fmt.num(rows.length)}</Badge></h2>{to && <Link to={to} className="text-sm font-bold text-pri">{t("all")}</Link>}</div><ul className="divide-y divide-line">{rows.map((r) => <li key={r._id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">{render(r)}</li>)}</ul></section>
  );
  return (
    <>
      <PageHead icon={Bell} title={t("nav.alerts")} sub={t("alerts.sub")} />
      {a.count === 0 ? <div className="card"><Empty icon={Bell} title={t("alerts.none")} /></div> : <div className="grid gap-5 lg:grid-cols-2">
        <Sec icon={PackageX} tone="bad" title={t("stock.out")} rows={a.out} to="/products" render={(p) => <><span className="ltr font-semibold">{p.name}</span><span className="num font-bold text-bad">0</span></>} />
        <Sec icon={AlertTriangle} tone="warn" title={t("stock.low")} rows={a.low} to="/products" render={(p) => <><span className="ltr font-semibold">{p.name}</span><span className="num text-sm"><b className="text-warn">{fmt.num(p.qty)}</b> / {fmt.num(p.minStock)}</span></>} />
        <Sec icon={HandCoins} tone="warn" title={t("alerts.overdue")} rows={a.overdue} to="/sales" render={(s) => <><span><b className="num ltr">{s.no}</b> {s.customerName}</span><span className="num font-bold text-warn">{fmt.num(s.due)} · {fmt.date(s.dueDate)}</span></>} />
        <Sec icon={ShieldAlert} tone="warn" title={t("alerts.warranty")} rows={a.warranty} to="/warranty" render={(w) => <><span><span className="ltr font-semibold">{w.name}</span> <span className="text-mute">{w.customerName}</span></span><span className="num font-bold">{fmt.date(w.endDate)}</span></>} />
        <Sec icon={Wrench} tone="ok" title={t("alerts.repairs")} rows={a.repairs} to="/repairs" render={(r) => <><span><b className="num ltr">{r.no}</b> {r.customerName}</span><span className="ltr text-mute">{r.device}</span></>} />
      </div>}
    </>
  );
}
