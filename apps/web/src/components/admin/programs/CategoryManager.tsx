"use client";
import { useState } from "react";
import { Pencil, Tag, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { Badge, Button, Dialog, Field, Input, useToast } from "@/components/ui";
import { useRouter } from "next/navigation";

export function CategoryManager({ initialCategories }: { initialCategories: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState(initialCategories);
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function rename(from: string, to: string) {
    if (!to.trim() || to === from) { setEditTarget(null); return; }
    setBusy(true);
    const r = await api<{ affected: number }>("/api/admin/categories", { method: "PATCH", body: { from, to: to.trim() } });
    setBusy(false);
    if (r.ok) {
      setCategories((cs) => cs.map((c) => (c === from ? to.trim() : c)).sort());
      setEditTarget(null);
      router.refresh();
      toast({ title: `เปลี่ยนชื่อเป็น "${to.trim()}" แล้ว (${r.data.affected} หลักสูตร)` });
    } else toast({ title: "เปลี่ยนชื่อไม่สำเร็จ", description: r.message, variant: "destructive" });
  }

  async function remove(name: string) {
    setBusy(true);
    const r = await api<{ affected: number }>(`/api/admin/categories?name=${encodeURIComponent(name)}`, { method: "DELETE" });
    setBusy(false);
    if (r.ok) {
      setCategories((cs) => cs.filter((c) => c !== name));
      router.refresh();
      toast({ title: `ลบหมวดหมู่ "${name}" แล้ว (${r.data.affected} หลักสูตร)` });
    } else toast({ title: "ลบไม่สำเร็จ", description: r.message, variant: "destructive" });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <Tag className="h-4 w-4" /> จัดการหมวดหมู่
      </Button>

      <Dialog open={open} onOpenChange={setOpen} title="จัดการหมวดหมู่" description="เปลี่ยนชื่อหรือลบหมวดหมู่จะมีผลกับทุกหลักสูตรในหมวดนั้น">
        <div className="grid gap-3">
          {categories.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีหมวดหมู่</p>}
          {categories.map((cat) => (
            <div key={cat} className="flex items-center gap-2">
              {editTarget === cat ? (
                <form
                  className="flex flex-1 items-center gap-2"
                  onSubmit={(e) => { e.preventDefault(); void rename(cat, editValue); }}
                >
                  <Input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    maxLength={60}
                    className="h-8 flex-1 text-sm"
                  />
                  <Button type="submit" size="sm" loading={busy} disabled={!editValue.trim()}>บันทึก</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditTarget(null)}><X className="h-4 w-4" /></Button>
                </form>
              ) : (
                <>
                  <Badge variant="secondary" className="flex-1 justify-start font-normal">{cat}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => { setEditTarget(cat); setEditValue(cat); }} title="เปลี่ยนชื่อ">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void remove(cat)} title="ลบหมวดหมู่" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          ))}
          <div className="pt-1 text-right">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>ปิด</Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
