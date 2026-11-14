"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { validateProfile, type ProfileErrors } from "@upskill/core/profile";
import { api } from "@/lib/api";
import { Alert, Button, useToast } from "@/components/ui";
import { PdpaNotice, ProfileFields, readProfile, type ProfileDefaults } from "./ProfileFields";

/** Create (first time, with PDPA consent) or update the member profile */
export function ProfileForm({ defaults, exists, namesLocked }: { defaults: ProfileDefaults; exists: boolean; namesLocked: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [consentError, setConsentError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const profile = readProfile(f);
    const errs = { ...validateProfile(profile).errors };
    // An existing profile keeps its stored national ID (the field is not shown); the server checks it again
    if (exists) delete errs.nationalId;
    const consent = f.get("pdpaConsent") === "on";
    setErrors(errs);
    setConsentError(exists || consent ? undefined : "ต้องยอมรับประกาศความเป็นส่วนตัวก่อนบันทึก");
    if (Object.keys(errs).length || (!exists && !consent)) return setError("กรุณาตรวจสอบข้อมูลที่ไฮไลต์");
    setBusy(true);
    setError(null);
    const r = await api("/api/user/profile", { method: "PUT", body: { ...profile, ...(exists ? {} : { pdpaConsent: consent }) } });
    setBusy(false);
    if (r.ok) {
      toast({ title: "บันทึกข้อมูลแล้ว", variant: "success" });
      router.push("/me");
      router.refresh();
    } else setError(r.message);
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {error && <Alert variant="destructive" title={error} />}
      <ProfileFields defaults={defaults} errors={errors} namesLocked={namesLocked} />
      {!exists && <PdpaNotice error={consentError} />}
      <div><Button type="submit" loading={busy}><Save className="h-4 w-4" /> บันทึกข้อมูล</Button></div>
    </form>
  );
}
