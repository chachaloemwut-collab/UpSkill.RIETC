import Link from "next/link";
import { getCurrentUser } from "@/server/auth/session";
import { LogoutButton } from "./LogoutButton";

export async function Header() {
  const user = await getCurrentUser();
  return (
    <header className="border-b border-stone-200 bg-white">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
        <Link href="/" className="mr-auto text-lg font-bold text-green-800">
          UpSkill
        </Link>
        {user ? (
          <>
            {(user.role === "instructor" || user.role === "admin") && (
              <Link href="/instructor" className="text-stone-700 hover:text-stone-900">
                สอน
              </Link>
            )}
            {user.role === "admin" && (
              <Link href="/admin" className="text-stone-700 hover:text-stone-900">
                ผู้ดูแล
              </Link>
            )}
            <Link href="/me" className="text-stone-700 hover:text-stone-900">
              บัญชีของฉัน
            </Link>
            <LogoutButton />
          </>
        ) : (
          <>
            <Link href="/login" className="text-stone-700 hover:text-stone-900">
              เข้าสู่ระบบ
            </Link>
            <Link href="/register" className="rounded-lg bg-green-700 px-3 py-1.5 font-medium text-white hover:bg-green-800">
              สมัครสมาชิก
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
