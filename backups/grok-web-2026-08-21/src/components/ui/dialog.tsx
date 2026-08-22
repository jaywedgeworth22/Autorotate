import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/80" />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-[min(560px,calc(100%-24px))] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-card p-5 shadow-[var(--shadow-border)]",
          "max-h-[min(88dvh,720px)] overflow-y-auto",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute top-3 right-3 size-11 text-muted hover:text-foreground">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("pr-8 text-lg font-medium tracking-tight", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("mt-1 text-sm text-muted", className)}
      {...props}
    />
  );
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="mt-4 flex flex-col gap-2">{children}</div>;
}
