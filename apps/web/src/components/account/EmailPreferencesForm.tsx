"use client";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { Button, Card, Checkbox, Field, Select, useToast } from "@/components/ui";

export function EmailPreferencesForm({ defaults }: { defaults: { courseUpdatesEnabled: boolean; learningRemindersEnabled: boolean; weeklySummaryEnabled: boolean; preferredLocale: "th" | "en" } }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const result = await api("/api/user/email-preferences", {
      method: "PATCH",
      body: {
        course_updates_enabled: form.has("course_updates"),
        learning_reminders_enabled: form.has("learning_reminders"),
        weekly_summary_enabled: form.has("weekly_summary"),
        preferred_locale: form.get("preferred_locale"),
      },
    });
    setBusy(false);
    toast(result.ok ? { title: "บันทึกการตั้งค่าอีเมลแล้ว", variant: "success" } : { title: "บันทึกไม่สำเร็จ", description: result.message, variant: "destructive" });
  }
  return (
    <Card className="p-5">
      <form onSubmit={submit} className="grid gap-4">
        <Checkbox name="course_updates" defaultChecked={defaults.courseUpdatesEnabled} label="การเปลี่ยนแปลงสถานะหลักสูตร" />
        <Checkbox name="learning_reminders" defaultChecked={defaults.learningRemindersEnabled} label="การแจ้งเตือนกำหนดเวลาการเรียน" />
        <Checkbox name="weekly_summary" defaultChecked={defaults.weeklySummaryEnabled} label="สรุปสถานะการเรียนรายสัปดาห์" />
        <Field label="ภาษาของอีเมล"><Select name="preferred_locale" defaultValue={defaults.preferredLocale}><option value="th">ภาษาไทย</option><option value="en">English</option></Select></Field>
        <p className="text-xs text-muted-foreground">อีเมลยืนยันบัญชี ความปลอดภัย รายการลงทะเบียน ผลการประเมิน และสถานะเอกสารรับรองเป็นอีเมลตามรายการ จึงไม่ปิดจากหน้านี้</p>
        <Button type="submit" loadingState="saving" loading={busy} className="justify-self-start">บันทึก</Button>
      </form>
    </Card>
  );
}
