"use client";
import { ServiceStatus } from "@/components/brand/ServiceStatus";
import { BrandActivityProvider } from "@/components/brand/BrandActivity";
import { ThemeProvider, ToastProvider } from "@/components/ui";
import { ConfirmProvider } from "@/components/common/ConfirmProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <BrandActivityProvider>
      <ThemeProvider>
        <ToastProvider>
          <ServiceStatus />
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrandActivityProvider>
  );
}
