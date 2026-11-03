import { useRef, useState } from "react";
import { DatabaseBackup, Download, History, ShieldAlert, Upload } from "lucide-react";
import { useApp } from "../lib/app";
import { download, get, post, uploadRaw } from "../lib/api";
import { Badge, Btn, Dt, Field, Input, Modal, PageHead, Spinner, useFetch } from "../components/ui";

const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export default function Backup() {
  const { t, fmt, toast, user } = useApp(); const [tick, setTick] = useState(0); const { data } = useFetch("/backup", {}, [tick]); const [busy, setBusy] = useState(false); const [restore, setRestore] = useState(null); const file = useRef();
  const create = async () => { setBusy(true); try { const b = await post("/backup/create", {}); toast.ok(`${t("backup.created")}: ${b.file}`); setTick((x) => x + 1); } catch (e) { toast.err(e); } finally { setBusy(false); } };
  const upload = async (e) => { const f = e.target.files[0]; e.target.value = ""; if (!f) return; try { const r = await uploadRaw("/backup/upload", f); setTick((x) => x + 1); setRestore({ file: r.file, info: r }); } catch (er) { toast.err(er); } };
  const inspect = async (name) => { try { setRestore({ file: name, info: await get(`/backup/inspect/${name}`) }); } catch (e) { toast.err(e); } };
  return (
    <>
      <PageHead icon={DatabaseBackup} title={t("nav.backup")} sub={t("backup.sub")} actions={<><input ref={file} type="file" accept=".gz,.json.gz" hidden onChange={upload} />{user.role === "admin" && <Btn variant="soft" icon={Upload} onClick={() => file.current.click()}>{t("backup.upload")}</Btn>}<Btn variant="accent" icon={DatabaseBackup} loading={busy} onClick={create}>{t("backup.create")}</Btn></>} />
      <p className="mb-5 rounded-xl bg-pri-soft p-4 text-sm text-pri">{t("backup.hint")}</p>
      {!data ? <Spinner /> : <div className="grid gap-5 xl:grid-cols-2">
        <section className="card overflow-hidden"><div className="border-b border-line px-5 py-3.5 font-extrabold">{t("backup.files")}</div>{!data.files.length ? <p className="p-8 text-center text-sm text-mute">{t("empty")}</p> : <ul className="divide-y divide-line">{data.files.map((f) => <li key={f.file} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm"><div className="min-w-0 flex-1"><div className="num ltr truncate font-bold">{f.file}</div><div className="text-xs text-mute"><Dt v={f.at} time /> · <span className="num">{kb(f.size)}</span></div></div><Btn size="sm" variant="soft" icon={Download} onClick={() => download(`/backup/download/${f.file}`, f.file).catch(toast.err)}>{t("download")}</Btn>{user.role === "admin" && <Btn size="sm" variant="danger" icon={ShieldAlert} onClick={() => inspect(f.file)}>{t("backup.restore")}</Btn>}</li>)}</ul>}</section>
        <section className="card overflow-hidden"><div className="flex items-center gap-2 border-b border-line px-5 py-3.5 font-extrabold"><History size={17} />{t("backup.history")}</div><ul className="divide-y divide-line">{data.logs.map((l) => <li key={l._id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm"><Badge tone={l.type === "restore" ? "warn" : "pri"}>{t(`backup.type.${l.type}`)}</Badge><Badge tone={l.ok ? "ok" : "bad"}>{l.ok ? t("ok") : t("failed")}</Badge><span className="num ltr min-w-0 flex-1 truncate text-mute">{l.file}</span><span className="text-mute">{l.user?.name || t("backup.auto")}</span><Dt v={l.at} time /></li>)}{!data.logs.length && <li className="p-8 text-center text-sm text-mute">{t("empty")}</li>}</ul></section>
      </div>}
      {restore && <Restore r={restore} onClose={() => setRestore(null)} />}
    </>
  );
}
function Restore({ r, onClose }) {
  const { t, fmt, toast, logout } = useApp(); const [pw, setPw] = useState(""); const [word, setWord] = useState(""); const [busy, setBusy] = useState(false);
  const names = Object.keys(r.info.counts || {}).filter((k) => r.info.counts[k] || r.info.current?.[k]);
  const run = async () => { setBusy(true); try { await post("/backup/restore", { file: r.file, password: pw, confirm: word }); toast.ok(t("backup.restored")); setTimeout(() => logout(true), 1200); } catch (e) { toast.err(e); setBusy(false); } };
  return <Modal size="lg" title={t("backup.restore")} onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn variant="dangerSolid" loading={busy} disabled={!pw || word !== "RESTORE"} onClick={run}>{t("backup.restore.go")}</Btn></>}>
    <div className="grid gap-4"><div className="rounded-xl bg-bad-soft p-4 text-sm font-semibold text-bad">{t("backup.restore.warn")}</div>
      <div className="text-sm"><span className="text-mute">{t("backup.file")}: </span><b className="num ltr">{r.file}</b> · <Dt v={r.info.createdAt} time /></div>
      <div className="scroll-thin max-h-60 overflow-y-auto rounded-xl border border-line"><table className="w-full text-sm"><thead><tr className="bg-soft text-mute"><th className="px-3 py-2 text-start">{t("backup.table")}</th><th className="px-3 py-2 text-end">{t("backup.inFile")}</th><th className="px-3 py-2 text-end">{t("backup.current")}</th></tr></thead><tbody>{names.map((k) => <tr key={k} className="border-t border-line"><td className="px-3 py-1.5 font-semibold">{k}</td><td className="num px-3 py-1.5 text-end">{fmt.num(r.info.counts[k])}</td><td className="num px-3 py-1.5 text-end text-mute">{fmt.num(r.info.current?.[k])}</td></tr>)}</tbody></table></div>
      <Field label={t("password")}><Input type="password" dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} /></Field><Field label={t("backup.typeRestore")}><Input dir="ltr" value={word} onChange={(e) => setWord(e.target.value)} placeholder="RESTORE" /></Field></div></Modal>;
}
