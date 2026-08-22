import { Link, useRouterState } from "@tanstack/react-router";
import {
  Clock3,
  HardDrive,
  KeyRound,
  LayoutGrid,
  MoreHorizontal,
  RefreshCw,
  Settings,
  Smartphone,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { SpinMark } from "@/components/mark";
import { cn } from "@/lib/cn";
import { useVault } from "@/lib/vault";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutGrid },
  { to: "/vault", label: "Vault", icon: KeyRound },
  { to: "/rotate", label: "Spin", icon: RefreshCw },
  { to: "/platforms", label: "Platforms", icon: HardDrive },
  { to: "/destinations", label: "Destinations", icon: HardDrive },
  { to: "/history", label: "History", icon: Clock3 },
  { to: "/devices", label: "Devices", icon: Smartphone },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

const MOBILE = [
  { to: "/", label: "Home", icon: LayoutGrid },
  { to: "/vault", label: "Vault", icon: KeyRound },
  { to: "/rotate", label: "Spin", icon: RefreshCw },
  { to: "/destinations", label: "Write", icon: HardDrive },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const load = useVault((s) => s.load);
  const [more, setMore] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r border-border px-3 py-5 md:flex">
        <Link to="/" className="mb-8 flex items-center gap-2.5 px-2">
          <SpinMark className="size-7" spinning />
          <span className="text-sm font-semibold tracking-tight">TopSpin</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex h-11 items-center gap-2.5 rounded-md px-2.5 text-sm",
                  active
                    ? "bg-card-elevated text-foreground"
                    : "text-muted hover:bg-card hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <p className="px-2 text-[11px] leading-relaxed text-subtle">
          Encrypted on this device. Infisical is the sync plane.
        </p>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/90 px-4 backdrop-blur md:hidden">
        <SpinMark className="size-6" spinning />
        <span className="text-sm font-semibold">TopSpin</span>
        <button
          type="button"
          className="ml-auto flex size-11 items-center justify-center text-muted"
          onClick={() => setMore((v) => !v)}
          aria-label="More"
        >
          <MoreHorizontal className="size-5" />
        </button>
      </header>

      {more ? (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMore(false)}>
          <div
            className="absolute inset-x-3 top-16 rounded-xl bg-card p-2 shadow-[var(--shadow-border)]"
            onClick={(e) => e.stopPropagation()}
          >
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMore(false)}
                className="flex h-12 items-center gap-3 rounded-md px-3 text-sm hover:bg-card-elevated"
              >
                <item.icon className="size-4 text-muted" />
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <main className="md:pl-56">
        <div className="mx-auto max-w-5xl px-4 pt-5 pb-24 md:px-8 md:pt-8 md:pb-12">{children}</div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] md:hidden">
        {MOBILE.map((item) => {
          const active = pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex h-14 flex-col items-center justify-center gap-1 text-[11px]",
                active ? "text-foreground" : "text-muted",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
