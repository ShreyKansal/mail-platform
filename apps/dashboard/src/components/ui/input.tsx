// Adapted from shadcn/ui new-york registry (MIT). See docs/design/SHADCN.md.
import * as React from "react"

import { cn } from "../../lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "frappe-input flex h-7 w-full rounded-lg border px-2 py-1 font-sans text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:cursor-not-allowed",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
