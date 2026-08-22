import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-[opacity,transform,background-color,color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:not-disabled:scale-[0.96]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:opacity-90",
        steel: "bg-steel text-primary-foreground hover:opacity-90",
        secondary:
          "bg-card-elevated text-foreground shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]",
        ghost: "text-foreground hover:bg-card-elevated",
        outline:
          "text-foreground shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]",
        danger: "bg-danger text-primary-foreground hover:opacity-90",
      },
      size: {
        default: "h-11 rounded-md px-4",
        sm: "h-9 rounded-sm px-3 text-xs",
        lg: "h-12 rounded-lg px-5",
        icon: "size-11 rounded-md",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
