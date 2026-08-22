import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl bg-card p-4 shadow-[var(--shadow-border)]",
        className,
      )}
      {...props}
    />
  );
}
