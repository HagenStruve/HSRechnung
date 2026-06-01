import React from "react";

export function Label({ className = "", ...props }) {
  return <label className={`text-sm font-medium text-slate-700 ${className}`} {...props} />;
}
