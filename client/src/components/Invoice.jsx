import { useApp } from "../lib/app";
import { Smartphone } from "lucide-react";

/** Printable invoice. Paper width comes from settings (58mm / 80mm thermal or A4). */
export default function Invoice({ sale, returns = [], warranties = [], title }) {
  const { t, fmt, settings: s, lang } = useApp();
  const paper = s?.receiptWidth || "80mm"; const wide = paper === "A4";
  const sellerName = sale.user?.name; const cust = sale.customer?.name || sale.customerName;
  const wm = warranties.filter((w) => w.status === "active");
  const row = (k, v, strong) => <div className={`flex justify-between gap-3 ${strong ? "text-[1.15em] font-extrabold" : ""}`}><span>{k}</span><span className="num">{v}</span></div>;
  const [d1] = fmt.dates(sale.date, true); const [, d2] = fmt.dates(sale.date, false);
  return (
    <div id="print-area" className="receipt mx-auto rounded-xl border border-line bg-white p-4 text-[#111] shadow-sm" data-paper={paper} dir={lang === "en" ? "ltr" : "rtl"}>
      <div className="text-center">
        {s?.logo ? <img src={s.logo} alt="" className="mx-auto mb-1 h-12 object-contain" /> : <Smartphone className="mx-auto mb-1" size={22} />}
        <div className="text-[1.25em] font-extrabold">{s?.shopName}</div>
        {s?.address && <div>{s.address}</div>}{s?.phone && <div className="num ltr text-center">{s.phone}</div>}
      </div>
      <div className="my-2 border-y border-dashed border-black/50 py-1.5">
        {title && <div className="mb-1 text-center font-extrabold">{title}</div>}
        {row(t("inv.no"), <span className="ltr">{sale.no}</span>)}
        {row(t("date"), <>{d1}{d2 && <> · {d2}</>}</>)}
        {sellerName && row(t("inv.seller"), sellerName)}
        {cust && row(t("customer"), cust)}
        {sale.status === "cancelled" && <div className="mt-1 text-center font-extrabold text-red-700">{t("status.cancelled")}</div>}
      </div>
      <table className="w-full">
        <thead><tr className="border-b border-black/40 text-start"><th className="py-1 text-start">{t("item")}</th><th className="text-center">{t("qty")}</th><th className="text-end">{t("total")}</th></tr></thead>
        <tbody>{sale.items.map((i, k) => (
          <tr key={k} className="align-top"><td className="py-1 pe-2"><div className="ltr font-semibold">{i.name}</div>{i.imei && <div className="num ltr text-[.85em]">IMEI {i.imei}</div>}{i.serial && <div className="num ltr text-[.85em]">SN {i.serial}</div>}{i.discount > 0 && <div className="text-[.85em]">{t("discount")}: {fmt.num(i.discount)}</div>}{i.returnedQty > 0 && <div className="text-[.85em] text-red-700">{t("inv.returned")}: {fmt.num(i.returnedQty)}</div>}</td><td className="num text-center">{fmt.num(i.qty)} × {fmt.num(i.price)}</td><td className="num text-end font-semibold">{fmt.num(i.price * i.qty - i.discount)}</td></tr>))}</tbody>
      </table>
      <div className="mt-2 grid gap-0.5 border-t border-dashed border-black/50 pt-2">
        {sale.discount > 0 && row(t("discount"), `− ${fmt.num(sale.discount)}`)}
        {row(t("total"), fmt.money(sale.total), true)}
        {row(t("paid"), fmt.money(sale.paid))}
        {sale.due > 0 && row(t("due"), fmt.money(sale.due), true)}
        {row(t("pay.method"), `${t(`paytype.${sale.payType}`)} · ${t(`method.${sale.method}`)}`)}
        {sale.returnedTotal > 0 && row(t("inv.returnedTotal"), fmt.money(sale.returnedTotal))}
      </div>
      {returns.filter((r) => r.status === "approved").map((r) => (
        <div key={r._id} className="mt-2 border-t border-dashed border-black/50 pt-1.5 text-[.9em]"><div className="font-bold">{t(r.type === "exchange" ? "ret.exchange" : "ret.return")} {r.no}</div>{r.items.map((i, k) => <div key={k} className="ltr">↩ {i.name} {i.imei && <span className="num">({i.imei})</span>}</div>)}{r.newItems.map((i, k) => <div key={k} className="ltr">↪ {i.name} {i.imei && <span className="num">({i.imei})</span>}</div>)}</div>
      ))}
      {wm.length > 0 && <div className="mt-2 border-t border-dashed border-black/50 pt-1.5 text-[.9em]"><div className="font-bold">{t("nav.warranty")}</div>{wm.map((w) => <div key={w._id} className="flex justify-between gap-2"><span className="ltr">{w.name}</span><span className="num whitespace-nowrap">{fmt.num(w.months)} {t("months")} · {fmt.date(w.endDate)}</span></div>)}{s?.warrantyTerms && <div className="mt-1 whitespace-pre-line text-[.9em]">{s.warrantyTerms}</div>}</div>}
      {s?.receiptNote && <div className="mt-2 border-t border-dashed border-black/50 pt-2 text-center">{s.receiptNote}</div>}
    </div>
  );
}
