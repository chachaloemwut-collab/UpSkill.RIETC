"use client";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-stone-500 hover:text-stone-900"
      onClick={async () => {
        await api("/api/auth/logout", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
    >
      ออกจากระบบ
    </button>
  );
}
