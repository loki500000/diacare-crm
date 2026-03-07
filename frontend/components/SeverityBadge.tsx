"use client";
import { type Severity } from "@/lib/api";

const config: Record<Severity, { label: string; className: string }> = {
  critical: { label: "Critical", className: "bg-red-100 text-red-700 border-red-200" },
  high:     { label: "High",     className: "bg-orange-100 text-orange-700 border-orange-200" },
  medium:   { label: "Medium",   className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  low:      { label: "Low",      className: "bg-green-100 text-green-700 border-green-200" },
};

export default function SeverityBadge({ severity }: { severity: Severity }) {
  const { label, className } = config[severity] ?? config.medium;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${className}`}>
      {label}
    </span>
  );
}
