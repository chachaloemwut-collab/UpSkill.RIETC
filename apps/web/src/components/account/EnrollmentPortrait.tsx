"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function EnrollmentPortrait({ id }: {id:string}) {
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const router=useRouter();
  return <label className="grid gap-1 text-sm print:hidden">แนบรูปถ่ายหน้าตรง (JPG หรือ PNG ไม่เกิน 1 MB)
    <input type="file" accept="image/jpeg,image/png" disabled={busy} onChange={async e=>{
      const file=e.target.files?.[0]; if(!file)return;
      if(file.size>1048576){setMessage("รูปใหญ่เกิน 1 MB");return;}
      setBusy(true);
      try {const res=await fetch(`/api/enrollments/${id}/portrait`,{method:"POST",body:file});
        setMessage(res.ok?"บันทึกรูปแล้ว":"บันทึกรูปไม่สำเร็จ กรุณาตรวจรูปแบบไฟล์");if(res.ok||res.status===409)router.refresh();
      }catch{setMessage("เชื่อมต่อระบบไม่สำเร็จ");}finally{setBusy(false);}
    }}/><span role="status">{message}</span></label>;
}
