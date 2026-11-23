"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {api} from "@/lib/api";
import {formatDateTimeTh} from "@/lib/format";
import {Button,Textarea} from "@/components/ui";
type Message={id:string;author_id:string;body:string;created_at:string};
export function SupportConversation({member,initial}:{member:string;initial:Message[]}){
  const [rows,setRows]=useState(initial), [draft,setDraft]=useState(""), [error,setError]=useState(""),[sending,setSending]=useState(false),[older,setOlder]=useState(initial.length===50);
  const latest=useRef(initial.at(-1)?.id),request=useRef(""),busy=useRef(false);
  const url="/api/support/"+member;
  const merge=useCallback((items:Message[])=>setRows(old=>Array.from(new Map([...old,...items].map(m=>[m.id,m])).values()).sort((a,b)=>a.id.localeCompare(b.id))),[]);
  const refresh=useCallback(async()=>{
    if(busy.current)return;
    busy.current=true;
    try{const res=await api<{messages:Message[]}>(url+(latest.current?"?after="+latest.current:""));
      if(!res.ok){setError(res.message);return;}
      const list=res.data.messages;
      if(list.length){latest.current=list.at(-1)!.id;merge(list);}
    }finally{busy.current=false;}
  },[url,merge]);
  useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden)void refresh();},5000);return ()=>clearInterval(timer);},[refresh]);
  return <section className="grid gap-4 rounded-lg border bg-card p-4">
    {older&&<Button variant="outline" onClick={async()=>{const r=await api<{messages:Message[]}>(url+"?before="+rows[0]!.id);if(r.ok){merge(r.data.messages);setOlder(r.data.messages.length===50);}else setError(r.message);}}>ข้อความก่อนหน้า</Button>}
    <ul aria-label="ข้อความสนทนา" aria-live="polite" className="grid max-h-[60vh] gap-2 overflow-auto">{rows.map(m=><li key={m.id} className="rounded-md bg-muted p-3"><strong>{m.author_id===member?"ผู้แจ้ง":"ผู้ดูแลระบบ"}</strong> <time className="text-xs">{formatDateTimeTh(m.created_at)}</time><p className="whitespace-pre-wrap break-words">{m.body}</p></li>)}</ul>
    {!rows.length&&<p>ยังไม่มีข้อความในบทสนทนานี้</p>}
    <form className="grid gap-2" onSubmit={async e=>{e.preventDefault();if(sending||!draft.trim())return;setSending(true);setError("");
      request.current ||= crypto.randomUUID();
      try{const r=await api(url,{method:"POST",body:{body:draft.trim(),requestId:request.current}});
        if(!r.ok){setError(r.message);return;}request.current="";setDraft("");await refresh();
      }finally{setSending(false);}
    }}><label>ข้อความ<Textarea required maxLength={2000} disabled={sending} value={draft} onChange={e=>{setDraft(e.target.value);request.current="";}}/></label>
    <Button type="submit" loading={sending}>ส่งข้อความ</Button></form>{error&&<p role="alert">{error}</p>}
  </section>;
}
