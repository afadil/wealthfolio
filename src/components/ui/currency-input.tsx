import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const CurrencyInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    const { onChange } = props

    /**
     * Override onChange to handle currency formatting
     * 
     * - If the value begins with $, remove it
     * - If the value contains a comma, remove it
     * 
     * @param e - React.ChangeEvent<HTMLInputElement>
     */
    const customOnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value
        if (val.startsWith("$")) {
            val = val.slice(1)
        }
        if (val.includes(",")) {
            val = val.replace(/,/g, "")
        }

        // call the original onChange
        e.target.value = val
        onChange && onChange(e)
    }

    return (
      <input
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
        onChange={customOnChange}
      />
    )
  }
)
CurrencyInput.displayName = "CurrencyInput"

export { CurrencyInput }
