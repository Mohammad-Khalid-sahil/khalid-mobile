import { useState } from "react";
import { useApp } from "../lib/app";
import { PRESETS, preset } from "../lib/dates";
import { DateField } from "./ui";

/** value: {from,to,key}; presets + custom dates */
export default function RangePicker({ value, onChange }) {
  const { t } = useApp(); const [custom, setCustom] = useState(value.key === "custom");
  return (
    <div className="no-print flex flex-wrap items-end gap-2">
      <div className="scroll-thin flex gap-1 overflow-x-auto rounded-xl bg-soft p-1">
        {PRESETS.map((k) => <button key={k} onClick={() => { setCustom(false); onChange({ ...preset(k), key: k }); }} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-bold ${value.key === k ? "bg-card text-pri shadow-sm" : "text-mute hover:text-ink"}`}>{t(`range.${k}`)}</button>)}
        <button onClick={() => { setCustom(true); onChange({ ...value, key: "custom" }); }} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-bold ${custom ? "bg-card text-pri shadow-sm" : "text-mute hover:text-ink"}`}>{t("range.custom")}</button>
      </div>
      {custom && <><div className="w-40"><DateField value={value.from} onChange={(v) => onChange({ ...value, from: v, key: "custom" })} aria-label={t("from")} /></div><div className="w-40"><DateField value={value.to} onChange={(v) => onChange({ ...value, to: v, key: "custom" })} aria-label={t("to")} /></div></>}
    </div>
  );
}
