"use client";
import {useActionState, type ReactNode} from "react";
import {Button} from "@/components/ui";
import {grantDuty,revokeDuty,reviewRecord} from "./actions";

export function DeskForm({kind,children,label}:{kind:"grant"|"revoke"|"review"; children:ReactNode;label:string}) {
  const [message,action,busy]=useActionState({grant:grantDuty,revoke:revokeDuty,review:reviewRecord}[kind],"");
  return <form action={action} className="grid gap-2 rounded border p-3 [&_input]:rounded [&_input]:border [&_input]:p-1 [&_select]:border">
    {children}<Button disabled={busy} type="submit">{label}</Button>{message && <p role="status">{message}</p>}
  </form>;
}
