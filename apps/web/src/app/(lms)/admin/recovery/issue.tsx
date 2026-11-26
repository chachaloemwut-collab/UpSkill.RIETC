"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui";
import { issue } from "./review-actions";
export function IssueLink({id}:{id:string}) {
  const [result,action,pending] = useActionState(issue,"");
  return <form action={action}><input type="hidden" name="id" value={id}/>
    <Button type="submit" disabled={pending || !!result}>ออกลิงก์ใช้ครั้งเดียว</Button>
    {result && <p className="break-all" role="status">{result}</p>}</form>;
}
