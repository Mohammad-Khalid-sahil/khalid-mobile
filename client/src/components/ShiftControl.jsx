import { useState } from "react";
import { Lock, Unlock } from "lucide-react";
import { useApp } from "../lib/app";
import { get, post } from "../lib/api";
import { Btn, Dt, Field, Input, Modal, Select, useFetch } from "./ui";

/** Cash-drawer shift: open with counted cash, close with counted cash → difference is recorded. */
export default function ShiftControl({ onChange }) {
  const { t, fmt, toast, can, settings } = useApp();
  const { data: shifts, reload } = useFetch("/accounts/shifts/current", {}, []);
  const [dlg, setDlg] = useState(null); const [amount, setAmount] = useState(""); const [accounts, setAccounts] = useState([]); const [acc, setAcc] = useState(""); const [busy, setBusy] = useState(false); const [note, setNote] = useState("");
  const open = shifts?.[0];
  const start = async (kind) => { setDlg(kind); setAmount(kind === "close" && open ? String(open.expected) : ""); if (kind === "open") get("/accounts").then((a) => { const c = a.filter((x) => x.type === "cash"); setAccounts(c); setAcc(c[0]?._id || ""); }); };
  const run = async () => {
    setBusy(true);
    try {
      if (dlg === "open") await post("/accounts/shifts/open", { account: acc, openingBalance: Number(amount) || 0 });
      else { const r = await post(`/accounts/shifts/${open._id}/close`, { closingBalance: Number(amount), note }); toast.ok(`${t("shift.diff")}: ${fmt.money(r.difference)}`); }
      setDlg(null); reload(); onChange?.();
    } catch (e) { toast.err(e); } finally { setBusy(false); }
  };
  if (!shifts) return null;
  return (
    <>
      {open ? (
        <div className="flex items-center gap-2 rounded-xl bg-ok-soft px-3 py-2 text-sm text-ok"><Unlock size={16} /><span className="font-bold">{t("shift.open")}</span><span className="text-xs opacity-80"><Dt v={open.openedAt} time /></span><Btn size="sm" variant="soft" onClick={() => start("close")}>{t("shift.close")}</Btn></div>
      ) : (
        <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${settings?.rules?.requireShift ? "bg-warn-soft text-warn" : "bg-soft text-mute"}`}><Lock size={16} /><span className="font-semibold">{settings?.rules?.requireShift ? t("shift.required") : t("shift.none")}</span><Btn size="sm" variant="soft" onClick={() => start("open")}>{t("shift.start")}</Btn></div>
      )}
      {dlg && <Modal size="sm" title={t(dlg === "open" ? "shift.start" : "shift.close")} onClose={() => setDlg(null)} footer={<><Btn variant="ghost" onClick={() => setDlg(null)}>{t("cancel")}</Btn><Btn loading={busy} disabled={amount === ""} onClick={run}>{t("confirm")}</Btn></>}>
        <div className="grid gap-4">
          {dlg === "open" && <Field label={t("account")}><Select value={acc} onChange={(e) => setAcc(e.target.value)}>{accounts.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}</Select></Field>}
          {dlg === "close" && <div className="rounded-xl bg-soft p-3 text-sm"><div className="flex justify-between"><span>{t("shift.opening")}</span><b className="num">{fmt.money(open.openingBalance)}</b></div><div className="flex justify-between"><span>{t("shift.expected")}</span><b className="num">{fmt.money(open.expected)}</b></div></div>}
          <Field label={t(dlg === "open" ? "shift.opening" : "shift.counted")}><Input type="number" min="0" className="num" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          {dlg === "close" && amount !== "" && <div className={`rounded-xl p-3 text-sm font-bold ${Number(amount) === open.expected ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}>{t("shift.diff")}: <span className="num">{fmt.money(Number(amount) - open.expected)}</span></div>}
          {dlg === "close" && <Field label={t("note")}><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>}
        </div>
      </Modal>}
    </>
  );
}
