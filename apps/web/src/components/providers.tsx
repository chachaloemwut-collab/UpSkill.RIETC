"use client";
import { ThemeProvider, ToastProvider } from "@/components/ui";
import { ConfirmProvider } from "@/components/common/ConfirmProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
