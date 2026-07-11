import type { ReactNode } from "react";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

interface StatusPillProps {
  tone: StatusTone;
  children: ReactNode;
  pulse?: boolean;
  className?: string;
}

export function StatusPill({ tone, children, pulse = false, className = "" }: StatusPillProps) {
  return (
    <span className={`status-pill status-pill--${tone} ${className}`}>
      <span className={`status-dot ${pulse ? "status-dot--pulse" : ""}`} aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}
