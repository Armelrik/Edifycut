import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-stone-200 bg-white px-3 text-sm outline-none transition placeholder:text-stone-400 focus:border-amber-600 focus:ring-4 focus:ring-amber-100",
        className,
      )}
      {...props}
    />
  );
}
