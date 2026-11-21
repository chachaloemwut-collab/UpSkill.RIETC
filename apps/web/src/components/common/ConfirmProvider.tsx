"use client";
import * as React from "react";
import { AlertDialog } from "@/components/ui";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for destructive or hard-to-undo actions */
  destructive?: boolean;
}

type Ask = (o: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = React.createContext<Ask | null>(null);

/**
 * In-app confirmation dialog for the whole app. Replaces window.confirm(), which some iPad/in-app browsers
 * suppress (the action then silently does nothing) and which cannot explain consequences or be styled.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const ask = React.useCallback<Ask>((o) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <AlertDialog
        open={!!state}
        onOpenChange={(open) => !open && close(false)}
        title={state?.title ?? ""}
        {...(state?.description ? { description: state.description } : {})}
        confirmLabel={state?.confirmLabel ?? "ยืนยัน"}
        cancelLabel={state?.cancelLabel ?? "ยกเลิก"}
        destructive={state?.destructive ?? false}
        onConfirm={() => close(true)}
      />
    </ConfirmContext.Provider>
  );
}

/** `if (!(await confirm({ title: "…" }))) return;` */
export function useConfirm(): Ask {
  const ask = React.useContext(ConfirmContext);
  if (!ask) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ask;
}
