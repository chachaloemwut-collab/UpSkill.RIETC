import { BrandSignal } from "./BrandActivity";
import type { BrandState, WordMotion } from "./states";

export function RouteLoading({ state = "page-loading", word, children }: { state?: BrandState; word?: WordMotion; children: string }) {
  return (
    <div role="status" className="grid min-h-40 place-content-center justify-items-center gap-3 p-6 text-sm text-muted-foreground">
      <BrandSignal state={state} {...(word ? { word } : {})} full />
      {children}
    </div>
  );
}
