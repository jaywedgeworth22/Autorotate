import { cn } from "@/lib/cn";

export function SpinMark({
  className,
  spinning = false,
}: {
  className?: string;
  spinning?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("text-foreground", className)}
      aria-hidden="true"
    >
      <circle
        cx="16"
        cy="16"
        r="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        className={spinning ? "spin-ring" : undefined}
      />
      <circle
        cx="16"
        cy="16"
        r="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.55"
      />
      <circle cx="16" cy="6.2" r="2.1" fill="currentColor" />
    </svg>
  );
}
