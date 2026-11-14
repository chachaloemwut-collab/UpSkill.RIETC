"use client";

import { useEffect, useState } from "react";
import { Copy, KeyRound, Trash2 } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { formatDateTh } from "@/lib/format";

type TokenRow = { id: string; name: string; last_used_at: string | null; created_at: string; revoked_at: string | null };

/** Personal API tokens for MCP clients (Cursor / Claude Desktop / scripts). */
export function ApiTokens() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

  async function reload() {
    const r = await fetch("/api/user/api-tokens");
    if (r.ok) setTokens(((await r.json()) as { tokens: TokenRow[] }).tokens);
  }
  useEffect(() => {
    let cancelled = false;
    fetch("/api/user/api-tokens")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && !cancelled) setTokens((j as { tokens: TokenRow[] }).tokens);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const r = await fetch("/api/user/api-tokens", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: f.get("name") }) });
      if (r.ok) {
        const j = (await r.json()) as { token: string };
        setNewToken(j.token);
        e.currentTarget.reset();
        await reload();
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    try {
      await fetch("/api/user/api-tokens", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      {newToken && (
        <div className="rounded-lg border border-success/40 bg-success/10 p-4">
          <p className="text-sm font-medium">สร้าง token แล้ว — แสดงครั้งเดียวเท่านั้น เก็บไว้เลย:</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-background px-3 py-2 font-mono text-xs">{newToken}</code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(newToken);
              }}
            >
              <Copy className="h-4 w-4" /> คัดลอก
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">ใช้กับ MCP: URL {typeof window !== "undefined" ? window.location.origin : ""}/api/mcp + header Authorization: Bearer &lt;token&gt;</p>
        </div>
      )}
      <form onSubmit={create} className="flex flex-wrap items-center gap-2">
        <Input name="name" required maxLength={120} placeholder="ชื่อ token (เช่น cursor-mcp)" className="min-w-0 flex-1" />
        <Button type="submit" loading={busy}>
          <KeyRound className="h-4 w-4" /> สร้าง token
        </Button>
      </form>
      {tokens.length === 0 ? (
        <p className="text-sm text-muted-foreground">ยังไม่มี token</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {tokens.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  สร้าง {formatDateTh(t.created_at)} · {t.revoked_at ? "ถูกยกเลิก" : t.last_used_at ? `ใช้ล่าสุด ${formatDateTh(t.last_used_at)}` : "ยังไม่เคยใช้"}
                </p>
              </div>
              {!t.revoked_at && (
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => void revoke(t.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" /> ยกเลิก
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        ใช้กับ Cursor: Settings → MCP → Add server → URL <span className="font-mono">{typeof window !== "undefined" ? `${window.location.origin}/api/mcp` : "/api/mcp"}</span> + header <span className="font-mono">Authorization: Bearer &lt;token&gt;</span>
      </p>
    </div>
  );
}
