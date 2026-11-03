import { useEffect, useState } from "react";
import { CheckCircle2, Printer } from "lucide-react";
import { useApp } from "../lib/app";
import { get, post } from "../lib/api";
import { Btn, Field, Input, Modal, Select, Textarea } from "./ui";
import { printNow } from "../lib/export";

/** Receive money from a customer / pay a supplier. Payment is spread FIFO over unpaid invoices by the server. */
export default function PaymentModal({ party, entity, onClose, onDone }) {
  const { t, fmt, toast, settings } = useApp();
  const isC = party === "customer";
  const [amount, setAmount] = useState(String(entity.balance || "")); const [method, setMethod] = useState("cash"); const [accounts, setAccounts] = useState([]); const [accountId, setAccountId] = useState(""); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState(null);
  useEffect(() => { get("/accounts").then(setAccounts).catch(() => {}); }, []);
  useEffect(() => { const a = accounts.filter((x) => x.type === method); setAccountId((a.find((x) => x.isDefault) || a[0])?._id || ""); }, [method, accounts]);
  const n = Number(amount) || 0; const bad = n <= 0 || n > entity.balance + 0.005;
  const run = async () => { setBusy(true); try { const r = await post(`/${party}s/${entity._id}/payments`, { amount: n, method, accountId, note }); setDone(r); onDone?.(); } catch (e) { toast.err(e); } finally { setBusy(false); } };
  if (done) return (
    <Modal size="sm" title={t("pay.receipt")} onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>{t("close")}</Btn><Btn icon={Printer} onClick={printNow}>{t("print")}</Btn></>}>
      <div id="print-area" className="receipt mx-auto text-center" data-paper={settings?.receiptWidth || "80mm"}>
        <CheckCircle2 className="mx-auto mb-2 text-ok no-print" size={36} />
        <div className="text-lg font-extrabold">{settings?.shopName}</div><div className="num ltr text-center">{done.no}</div>
        <div className="my-3 border-y border-dashed border-black/40 py-3 text-start"><div className="flex justify-between"><span>{isC ? t("customer") : t("supplier")}</span><b>{entity.name}</b></div><div className="flex justify-between"><span>{t("amount")}</span><b className="num">{fmt.money(done.amount)}</b></div><div className="flex justify-between"><span>{t("balance.after")}</span><b className="num">{fmt.money(done.balance)}</b></div><div className="flex justify-between"><span>{t("date")}</span><span className="num">{fmt.date(new Date(), true)}</span></div></div>
      </div>
    </Modal>
  );
  return (
    <Modal size="sm" title={`${t(isC ? "pay.receive" : "pay.pay")} — ${entity.name}`} onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn loading={busy} disabled={bad} onClick={run}>{t("confirm")}</Btn></>}>
      <div className="grid gap-4">
        <div className="rounded-xl bg-warn-soft p-3 text-sm font-bold text-warn">{t("balance")}: <span className="num">{fmt.money(entity.balance)}</span></div>
        <Field label={t("amount")} error={n > entity.balance + 0.005 ? t("err.OVER_BALANCE") : null}><Input type="number" min="0" className="num" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label={t("pay.method")}><Select value={method} onChange={(e) => setMethod(e.target.value)}>{["cash", "bank", "digital"].map((m) => <option key={m} value={m}>{t(`method.${m}`)}</option>)}</Select></Field><Field label={t("account")}><Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.filter((a) => a.type === method).map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}</Select></Field></div>
        <Field label={t("note")}><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
