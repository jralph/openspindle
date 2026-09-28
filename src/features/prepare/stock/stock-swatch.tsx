import { cva } from "class-variance-authority"
import type { VariantProps } from "class-variance-authority"
import { cn } from "cn"

const swatchVariants = cva("shrink-0 bg-muted", {
  variants: {
    size: { sm: "size-7 rounded-sm", md: "size-9 rounded-md" },
  },
  defaultVariants: { size: "sm" },
})

/** The stock's display colour; a muted square when there is no stock. */
export function StockSwatch({
  color,
  size,
  className,
}: { color?: string; className?: string } & VariantProps<
  typeof swatchVariants
>) {
  return (
    <span
      aria-hidden
      className={cn(swatchVariants({ size }), className)}
      // The colour is data (the stock's own), not theme styling.
      style={color ? { background: color } : undefined}
    />
  )
}
