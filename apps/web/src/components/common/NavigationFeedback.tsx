"use client";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LoadingSkeleton } from "./LoadingSkeleton";

export function NavigationFeedback() {
  const path = usePathname();
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
