"use client";
import { useRef, useState } from "react";
import { findGrantTarget } from "./actions";

function Lookup({kind, name, label}: {kind:"user"|"course"|"cohort"; name:string; label:string}) {
  const [term, setTerm] = useState("");
  const [chosen, setChosen] = useState("");
  const [options, setOptions] = useState<{id:string;label:string}[]>([]);
  const [message, setMessage] = useState("");
  const generation = useRef(0);

  function change(value:string) {
    generation.current++;
    setTerm(value);
    setChosen("");
    setOptions([]);
    setMessage("");
  }
  async function lookup() {
    const request = ++generation.current;
    setMessage("กำลังค้นหา");
    try {
      const rows = await findGrantTarget(kind,term.trim());
      if (request !== generation.current) return;
      setOptions(rows);
      setMessage(rows.length ? "กรุณาเลือกรายการที่ต้องการ" : "ไม่พบรายการ กรุณาตรวจชื่อที่ค้นหา");
    } catch {
      if (request === generation.current) setMessage("ค้นหาไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองอีกครั้ง");
    }
  }
  return <div className="grid gap-1">
    <label>{label} <input name={chosen ? undefined : name} maxLength={100} required value={term}
      onChange={e=>change(e.target.value)} placeholder="กรอกชื่อเพื่อค้นหา หรือกรอกรหัส UUID"/></label>
    <button className="justify-self-start underline" type="button" disabled={term.trim().length<2} onClick={lookup}>ค้นหา{label}</button>
    {message && <p role="status">{message}</p>}
    {options.length>0 && <label>ผลการค้นหา <select value={chosen} required onChange={e=>setChosen(e.target.value)}>
      <option value="">เลือกรายการ</option>{options.map(row=><option key={row.id} value={row.id}>{row.label} · {row.id.slice(-8)}</option>)}</select></label>}
    {chosen && <input type="hidden" name={name} value={chosen}/>}
  </div>;
}

export function GrantFields() {
  const [scope,setScope] = useState<"course"|"cohort"|"global">("course");
  return <>
    <Lookup kind="user" name="user" label="สมาชิก"/>
    <label>ขอบเขต <select name="kind" value={scope} onChange={e=>setScope(e.target.value as typeof scope)}>
      <option value="course">รายวิชา</option><option value="cohort">รอบอบรม</option><option value="global">ทุกข้อมูลในหน้าที่นี้</option>
    </select></label>
    {scope!=="global" && <Lookup key={scope} kind={scope} name="scope" label={scope==="course"?"รายวิชา":"รอบอบรม"}/>}
  </>;
}
