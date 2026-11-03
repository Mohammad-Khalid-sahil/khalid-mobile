import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import { LayoutDashboard, ShoppingCart, Receipt, Smartphone, Boxes, Truck, Factory, Users, ShieldCheck, Wrench, Wallet, BadgeDollarSign, UserCog, BarChart3, Settings as Cog, DatabaseBackup, ScrollText, Bell, Menu, Sun, Moon, LogOut, UserRound, X, KeyRound, Tags, Plus, Search, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useApp } from "../lib/app";
import { LANGS } from "../lib/i18n";
import { get } from "../lib/api";

const NAV = [
  { g: "nav.main", items: [
    { to: "/", icon: LayoutDashboard, l: "nav.dashboard", p: ["dashboard.view"], end: true },
    { to: "/pos", icon: ShoppingCart, l: "nav.pos", p: ["sales.create"] },
    { to: "/sales", icon: Receipt, l: "nav.sales", p: ["sales.view"] },
  ] },
  { g: "nav.stock", items: [
    { to: "/products", icon: Smartphone, l: "nav.products", p: ["products.view"] },
    { to: "/brands", icon: Tags, l: "nav.brands", p: ["products.view"] },
    { to: "/inventory", icon: Boxes, l: "nav.inventory", p: ["inventory.view"] },
    { to: "/purchases", icon: Truck, l: "nav.purchases", p: ["purchases.view"] },
    { to: "/suppliers", icon: Factory, l: "nav.suppliers", p: ["suppliers.manage"] },
  ] },
  { g: "nav.service", items: [
    { to: "/customers", icon: Users, l: "nav.customers", p: ["customers.view", "debts.manage"] },
    { to: "/warranty", icon: ShieldCheck, l: "nav.warranty", p: ["warranty.manage"] },
    { to: "/repairs", icon: Wrench, l: "nav.repairs", p: ["repairs.manage"], module: "repairs" },
  ] },
  { g: "nav.money", items: [
    { to: "/cashbox", icon: Wallet, l: "nav.cashbox", p: ["cashbox.view", "accounts.manage"] },
    { to: "/expenses", icon: BadgeDollarSign, l: "nav.expenses", p: ["expenses.manage"] },
    { to: "/employees", icon: UserCog, l: "nav.employees", p: ["employees.manage", "salaries.manage"] },
    { to: "/reports", icon: BarChart3, l: "nav.reports", p: ["reports.view"] },
  ] },
  { g: "nav.admin", items: [
    { to: "/users", icon: UserRound, l: "nav.users", p: ["users.manage"] },
    { to: "/settings", icon: Cog, l: "nav.settings", p: ["settings.manage"] },
    { to: "/backup", icon: DatabaseBackup, l: "nav.backup", p: ["backup.manage"] },
    { to: "/audit", icon: ScrollText, l: "nav.audit", p: ["audit.view"] },
  ] },
];

export default function Layout() {
  const { t, lang, setLang, dark, setDark, user, can, logout, pub, settings, fmt } = useApp();
  const [open, setOpen] = useState(false); const [collapsed, setCollapsed] = useState(false); const [menu, setMenu] = useState(false); const [alerts, setAlerts] = useState(0);
  const loc = useLocation(); const nav = useNavigate();
  useEffect(() => { setOpen(false); setMenu(false); }, [loc.pathname]);
  useEffect(() => { let on = true; const f = () => get("/reports/alerts").then((a) => on && setAlerts(a.count)).catch(() => {}); f(); const i = setInterval(f, 90000); return () => { on = false; clearInterval(i); }; }, [loc.pathname]);

  const side = (
    <div className="side-panel side-edge flex h-full flex-col text-side-ink">
      <div className={`flex items-center gap-3 px-4 pb-3 pt-5 ${collapsed ? "lg:flex-col lg:gap-2 lg:px-1" : ""}`}>
        {pub.logo ? <img src={pub.logo} alt="" className="h-10 w-10 shrink-0 rounded-xl bg-white object-contain p-1" /> : <span className="action-gradient grid h-10 w-10 shrink-0 place-items-center rounded-xl shadow-[0_6px_20px_var(--glow)]"><Smartphone size={20} /></span>}
        <div className={`min-w-0 ${collapsed ? "lg:hidden" : ""}`}><div className="truncate text-[15px] font-extrabold leading-tight text-ink dark:text-white">{pub.shopName}</div><div className="mt-0.5 truncate text-[11px] opacity-60">{t("app.tag")}</div></div>
        <button className={`ms-auto hidden rounded-lg p-1.5 text-mute hover:bg-soft dark:text-white/70 dark:hover:bg-white/10 lg:grid ${collapsed ? "lg:ms-0" : ""}`} onClick={() => setCollapsed(!collapsed)} aria-label={t(collapsed ? "nav.expand" : "nav.collapse")} aria-expanded={!collapsed} title={t(collapsed ? "nav.expand" : "nav.collapse")}><span className="rtl:rotate-180">{collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</span></button>
        <button className="ms-auto rounded-lg p-1.5 text-mute hover:bg-soft dark:text-white/70 dark:hover:bg-white/10 lg:hidden" onClick={() => setOpen(false)} aria-label="close"><X size={18} /></button>
      </div>
      <nav className={`scroll-thin flex-1 overflow-y-auto pb-4 ${collapsed ? "lg:px-2" : "px-3"}`}>
        {NAV.map((grp) => {
          const items = grp.items.filter((i) => can(...i.p) && (!i.module || settings?.modules?.[i.module] !== false));
          if (!items.length) return null;
          return (
            <div key={grp.g} className="mt-4">
              <div className={`eyebrow mb-1.5 px-3 !text-xs opacity-70 ${collapsed ? "lg:hidden" : ""}`}>{t(grp.g)}</div>
              {items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.end} title={collapsed ? t(i.l) : undefined} className={({ isActive }) => `relative mb-0.5 flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-semibold transition ${collapsed ? "lg:justify-center lg:px-0" : ""} ${isActive ? "side-link-active text-ink dark:text-white before:absolute before:inset-y-2 before:start-0 before:w-[3px] before:rounded-full before:bg-[var(--pri)] before:shadow-[0_0_10px_var(--glow)]" : "hover:bg-black/5 hover:text-ink dark:hover:bg-white/5 dark:hover:text-white"}`}>
                  {({ isActive }) => <><i.icon size={17} className={`shrink-0 ${isActive ? "text-[var(--pri)]" : "opacity-80"}`} /><span className={`truncate ${collapsed ? "lg:hidden" : ""}`}>{t(i.l)}</span>{i.to === "/alerts" && alerts > 0 && <span className={`num ms-auto rounded-full bg-[var(--pri)] px-1.5 text-[10px] font-extrabold text-white dark:text-black ${collapsed ? "lg:hidden" : ""}`}>{fmt.num(alerts)}</span>}</>}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
      <div className={`p-3 ${collapsed ? "lg:hidden" : ""}`}>
        <div className="flex rounded-xl border border-line bg-soft p-1" role="group" aria-label="language">
          {LANGS.map((l) => <button key={l.code} aria-pressed={lang === l.code} onClick={() => setLang(l.code)} className={`flex-1 rounded-lg px-2 py-1.5 text-[12.5px] font-bold transition ${lang === l.code ? "bg-pri text-on-pri shadow" : "text-side-ink hover:text-ink dark:hover:text-white"}`}>{l.label}</button>)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="stars flex h-full">
      <aside className={`no-print hidden shrink-0 transition-[width] duration-200 lg:block ${collapsed ? "w-[76px]" : "w-60"}`}>{side}</aside>
      {open && <div className="no-print fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-black/55" onClick={() => setOpen(false)} /><aside className="absolute inset-y-0 start-0 w-72 max-w-[85vw]">{side}</aside></div>}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] px-4 py-2.5 backdrop-blur-xl sm:px-6">
          <button className="grid h-10 w-10 place-items-center rounded-xl hover:bg-soft lg:hidden" onClick={() => setOpen(true)} aria-label="menu"><Menu size={20} /></button>
          <div className="ms-auto flex items-center gap-2">
            <label className="relative hidden w-72 md:block"><Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-mute" /><input className="field !rounded-xl !py-2 ps-9 text-[13px]" placeholder={t("search")} onKeyDown={(e) => { if (e.key === "Enter" && e.currentTarget.value.trim()) nav(`/products?q=${encodeURIComponent(e.currentTarget.value.trim())}`); }} /></label>
            <button onClick={() => setDark(!dark)} aria-label={dark ? t("theme.light") : t("theme.dark")} title={dark ? t("theme.light") : t("theme.dark")} className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-soft text-acc hover:brightness-125">{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
            <Link to="/alerts" className="relative grid h-10 w-10 place-items-center rounded-xl border border-line bg-soft text-mute hover:text-ink" aria-label={t("nav.alerts")}><Bell size={17} />{alerts > 0 && <span className="num absolute -end-1 -top-1 grid min-w-[18px] place-items-center rounded-full bg-bad px-1 text-[10px] font-extrabold text-black">{fmt.num(alerts)}</span>}</Link>
            {can("sales.create") && <Link to="/pos" className="action-gradient hidden items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-extrabold shadow-[0_8px_22px_-8px_var(--glow)] transition hover:brightness-105 sm:inline-flex"><Plus size={15} />{t("nav.pos")}</Link>}
            <div className="relative">
              <button onClick={() => setMenu(!menu)} className="flex items-center gap-2 rounded-xl py-1 pe-2 ps-1 hover:bg-soft" aria-expanded={menu}>
                <span className="action-gradient grid h-9 w-9 place-items-center rounded-xl text-sm font-extrabold">{user.name.slice(0, 1)}</span>
                <span className="hidden text-start sm:block"><span className="block text-[13px] font-bold leading-tight">{user.name}</span><span className="block text-[11px] text-mute">{t(`role.${user.role}`)}</span></span>
              </button>
              {menu && <div className="pop card absolute end-0 top-12 z-50 w-52 p-1.5">
                <Link to="/profile" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-soft"><KeyRound size={16} />{t("nav.profile")}</Link>
                <button onClick={() => logout()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-bad hover:bg-bad-soft"><LogOut size={16} />{t("logout")}</button>
              </div>}
            </div>
          </div>
        </header>
        <main className="scroll-thin min-h-0 flex-1 overflow-y-auto"><div className="mx-auto max-w-[1400px] p-4 pb-24 sm:px-8 sm:py-6 sm:pb-24"><Outlet /><div className="page-bottom-line mt-10" aria-hidden="true" /></div></main>
      </div>
    </div>
  );
}
