import React from "react";

export function Button({ className = "", variant = "default", size = "default", ...props }) {
  const variants = {
    default: "bg-slate-900 text-white hover:bg-slate-800",
    outline: "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50",
    ghost: "bg-transparent hover:bg-slate-100 text-slate-900",
  };
  const sizes = {
    default: "h-10 px-4 py-2",
    icon: "h-10 w-10",
  };
  return (
    <button
      className={`inline-flex max-w-full min-w-0 items-center justify-center rounded-md text-center text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0 ${variants[variant] || variants.default} ${sizes[size] || sizes.default} ${className}`}
      {...props}
    />
  );
}
