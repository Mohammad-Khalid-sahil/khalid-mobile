import { useState } from "react";
import { Moon, Sun, Smartphone, LogIn } from "lucide-react";
import { useApp } from "../lib/app";
import { LANGS } from "../lib/i18n";
import { Btn, Field, Input } from "../components/ui";
import shop from "../assets/shop.jpg";

export default function Login() {
  const { t, login, toast, lang, setLang, dark, setDark, pub } = useApp();
  const [u, setU] = useState(""); const [p, setP] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e) => { e.preventDefault(); setBusy(true); try { await login(u, p); } catch (er) { toast.err(er); } finally { setBusy(false); } };
  return (
    <div className="grid min-h-full lg:grid-cols-[minmax(420px,1fr)_1.2fr]">
      <div className="flex flex-col px-6 py-6 sm:px-14">
        <div className="flex items-center justify-between">
          <div className="flex rounded-xl bg-soft p-1">{LANGS.map((l) => <button key={l.code} aria-pressed={lang === l.code} onClick={() => setLang(l.code)} className={`rounded-lg px-3 py-1 text-[13px] font-bold ${lang === l.code ? "bg-pri text-on-pri" : "text-mute"}`}>{l.label}</button>)}</div>
          <button onClick={() => setDark(!dark)} aria-label="theme" className="grid h-10 w-10 place-items-center rounded-xl text-acc hover:bg-soft">{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
        </div>
        <form onSubmit={submit} className="m-auto w-full max-w-sm py-10">
          <div className="page-banner mb-7 rounded-[1.5rem] p-5 sm:p-6">
            {pub.logo ? <img src={pub.logo} alt="" className="mb-4 h-12 w-12 rounded-xl bg-white object-contain p-1" /> : <span className="page-banner-icon mb-4 grid h-12 w-12 place-items-center rounded-2xl"><Smartphone size={24} /></span>}
            <h1 className="text-2xl font-extrabold tracking-tight">{pub.shopName}</h1>
            <p className="mt-1 text-sm text-white/70">{t("login.sub")}</p>
          </div>
          <div className="grid gap-4">
            <Field label={t("username")}><Input autoFocus autoComplete="username" dir="ltr" value={u} onChange={(e) => setU(e.target.value)} required /></Field>
            <Field label={t("password")}><Input type="password" autoComplete="current-password" dir="ltr" value={p} onChange={(e) => setP(e.target.value)} required /></Field>
            <Btn type="submit" size="lg" icon={LogIn} loading={busy} className="mt-2">{t("login")}</Btn>
          </div>
        </form>
        <p className="text-center text-xs text-mute">Khalid Mobile · v2</p>
      </div>
      <div className="relative hidden overflow-hidden lg:block">
        <img src={shop} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="lattice absolute inset-0 opacity-[.82] mix-blend-multiply" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a1022] via-[#0a1022]/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-12 text-white"><p className="max-w-md text-4xl font-extrabold leading-[1.25]">{t("login.hero")}</p><p className="mt-3 max-w-md text-white/75">{t("login.hero2")}</p></div>
      </div>
    </div>
  );
}
