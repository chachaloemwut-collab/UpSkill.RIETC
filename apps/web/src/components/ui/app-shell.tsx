"use client";
import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Sheet } from "./feedback";
import { PanelLeftIcon } from "./icons";
import { MenuToggleIcon } from "./animated-icons";
import { Indicator, useIndicator } from "./motion";

export interface ShellNavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  /** Renders a real link (next/link) instead of a button; `onNavigate` still fires on click. */
  href?: string;
}
export interface ShellNavGroup {
  label?: string;
  items: ShellNavItem[];
}

interface AppShellProps {
  brand: React.ReactNode;
  /** Shown instead of `brand` when the sidebar is collapsed. */
  brandIcon: React.ReactNode;
  nav: ShellNavGroup[];
  active: string;
  onNavigate?: (id: string) => void;
  /** Top bar content to the right of the sidebar toggle (breadcrumb, search, actions). */
  header?: React.ReactNode;
  /** Pinned to the bottom of the sidebar (e.g. the signed-in user). */
  sidebarFooter?: (collapsed: boolean) => React.ReactNode;
  /** Fixed mobile bottom navigation or action bar. */
  bottomBar?: React.ReactNode;
  /** Controlled mobile drawer open state. */
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

const COLLAPSED_KEY = "vec-ui-sidebar-collapsed";
const subscribeCollapsed = () => () => {};
function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Admin console layout: collapsible sidebar on desktop, drawer on mobile, sticky top bar. */
export function AppShell({
  brand,
  brandIcon,
  nav,
  active,
  onNavigate,
  header,
  sidebarFooter,
  bottomBar,
  mobileOpen: controlledMobile,
  onMobileOpenChange: setControlledMobile,
  children,
}: AppShellProps) {
  const stored = React.useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const [override, setCollapsed] = React.useState<boolean | null>(null);
  const collapsed = override ?? stored;
  const [uncontrolledMobile, setUncontrolledMobile] = React.useState(false);
  const isMobile = controlledMobile !== undefined ? controlledMobile : uncontrolledMobile;
  const setMobile = setControlledMobile ?? setUncontrolledMobile;
  const toggle = () => {
    const next = !collapsed;
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      /* not persisted */
    }
    setCollapsed(next);
  };

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-background transition-[width] duration-500 ease-spring-smooth md:flex",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <div className="flex h-14 items-center border-b px-4">{collapsed ? brandIcon : brand}</div>
        <ShellNav nav={nav} active={active} onNavigate={onNavigate} collapsed={collapsed} className={cn("flex-1 p-3", collapsed ? "overflow-visible" : "overflow-y-auto")} />
        {sidebarFooter && <div className="border-t p-3">{sidebarFooter(collapsed)}</div>}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="เปิดเมนู" onClick={() => setMobile(true)}>
            <MenuToggleIcon open={isMobile} />
          </Button>
          <Button variant="ghost" size="icon" className="hidden md:inline-flex" aria-label={collapsed ? "ขยายแถบเมนู" : "ย่อแถบเมนู"} onClick={toggle}>
            <PanelLeftIcon />
          </Button>
          {header}
        </header>
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>

      <Sheet open={isMobile} onOpenChange={setMobile} side="left" title="เมนู">
        <ShellNav
          nav={nav}
          active={active}
          onNavigate={(id) => {
            onNavigate?.(id);
            setMobile(false);
          }}
        />
      </Sheet>
      {bottomBar}
    </div>
  );
}

function ShellNav({ nav, active, onNavigate, collapsed, className }: { nav: ShellNavGroup[]; active: string; onNavigate?: (id: string) => void; collapsed?: boolean; className?: string }) {
  const ref = React.useRef<HTMLElement>(null);
  const rect = useIndicator(ref, "[aria-current=page]", `${active}-${collapsed}`);
  return (
    <nav ref={ref} className={cn("relative grid content-start gap-5", className)}>
      <Indicator rect={rect} className="bg-accent" />
      {nav.map((g, gi) => (
        <div key={gi} className="grid gap-0.5">
          {g.label && (
            <p className={cn("mb-1 h-4 px-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground transition-opacity", collapsed && "opacity-0")}>{g.label}</p>
          )}
          {g.items.map((it) => (
            <NavItemTag
              key={it.id}
              href={it.href}
              aria-current={active === it.id ? "page" : undefined}
              aria-label={collapsed ? it.label : undefined}
              onClick={() => onNavigate?.(it.id)}
              className={cn(
                "group/nav relative z-10 flex h-9 items-center gap-3 rounded-md px-2.5 text-sm text-muted-foreground transition-[color,scale] hover:text-foreground active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active === it.id && "font-medium text-foreground"
              )}
            >
              <span className="flex shrink-0 transition-transform group-hover/nav:scale-110 [&>svg]:h-4 [&>svg]:w-4">{it.icon}</span>
              {collapsed ? (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-x-1 -translate-y-1/2 whitespace-nowrap rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground opacity-0 transition-[opacity,translate] group-hover/nav:translate-x-0 group-hover/nav:opacity-100 group-focus-visible/nav:translate-x-0 group-focus-visible/nav:opacity-100"
                >
                  {it.label}
                </span>
              ) : (
                <span className="flex-1 animate-fade-in truncate text-left">{it.label}</span>
              )}
              {it.badge !== undefined && (
                <span className={cn("rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground", collapsed && "absolute right-1 top-1 h-2 w-2 overflow-hidden p-0 text-transparent")}>
                  {it.badge}
                </span>
              )}
            </NavItemTag>
          ))}
        </div>
      ))}
    </nav>
  );
}

function NavItemTag({ href, children, ...props }: { href?: string | undefined; children: React.ReactNode; className?: string; onClick?: () => void; "aria-current"?: "page" | undefined; "aria-label"?: string | undefined }) {
  if (href) return <Link href={href} {...props}>{children}</Link>;
  return <button type="button" {...props}>{children}</button>;
}
