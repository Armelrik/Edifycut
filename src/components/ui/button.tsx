import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" && "bg-amber-700 text-white shadow-sm hover:bg-amber-800",
        variant === "secondary" && "border border-stone-200 bg-white text-stone-900 hover:bg-stone-100",
        variant === "ghost" && "text-stone-700 hover:bg-stone-100",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-700",
        className,
      )}
      {...props}
    />
  );
}
