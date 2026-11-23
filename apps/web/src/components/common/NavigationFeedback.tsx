"use client";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { activityScreen } from "@/lib/activity-path";
import { LoadingSkeleton } from "./LoadingSkeleton";

export function NavigationFeedback() {
  const path = usePathname();
  useEffect(() => {
    const report = (event: "view" | "print") => {
      void fetch("/api/user/activity", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({screen:activityScreen(path),event}), keepalive:true }).catch(()=>undefined);
    };
    report("view");
    const print = () => report("print");
    window.addEventListener("beforeprint",print);
    return () => window.removeEventListener("beforeprint",print);
  }, [path]);
  const search = useSearchParams().toString();
  useEffect(() => {
    const clear = () => { delete document.documentElement.dataset.routePending; };
    clear();
    window.addEventListener("pageshow", clear);
    const navigation = window.navigation;
    navigation?.addEventListener("navigateerror", clear);
    navigation?.addEventListener("navigatesuccess", clear);
    return () => {
      window.removeEventListener("pageshow", clear);
      navigation?.removeEventListener("navigateerror", clear);
      navigation?.removeEventListener("navigatesuccess", clear);
    };
  }, [path, search]);
  return <aside className="navigation-feedback"><LoadingSkeleton label="กำลังเปิดหน้า" rows={2} /></aside>;
}
