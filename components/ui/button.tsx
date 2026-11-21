import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ComponentProps } from "react";

export const cn = (...classes: Parameters<typeof clsx>) => twMerge(clsx(classes));

export const buttonVariants = cva("button", {
  variants: {
    variant: { primary: "button-primary", secondary: "button-secondary", ghost: "button-ghost", danger: "button-danger" },
    size: { default: "", small: "button-small" },
  },
  defaultVariants: { variant: "primary", size: "default" },
});

export function Button({ className, variant, size, type = "button", asChild = false, ...props }:
  ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : "button";
  return <Component data-slot="button" className={cn(buttonVariants({ variant, size }), className)}
    type={asChild ? undefined : type} {...props} />;
}
