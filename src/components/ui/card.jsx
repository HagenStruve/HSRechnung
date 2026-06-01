import React from "react";

export function Card({ className = "", ...props }) {
  return <div className={`min-w-0 max-w-full border bg-white ${className}`} {...props} />;
}

export function CardHeader({ className = "", ...props }) {
  return <div className={`min-w-0 p-6 ${className}`} {...props} />;
}

export function CardTitle({ className = "", ...props }) {
  return <h3 className={`text-lg font-semibold leading-none tracking-tight ${className}`} {...props} />;
}

export function CardContent({ className = "", ...props }) {
  return <div className={`min-w-0 p-6 pt-0 ${className}`} {...props} />;
}
