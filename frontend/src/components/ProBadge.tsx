import { Lock } from "lucide-react";

interface ProBadgeProps {
  className?: string;
  size?: "sm" | "md";
}

export default function ProBadge({ className = "", size = "sm" }: ProBadgeProps) {
  const sizeClasses = size === "sm"
    ? "px-1.5 py-0.5 text-[9px] gap-0.5"
    : "px-2 py-0.5 text-[10px] gap-1";
  const iconSize = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";

  return (
    <span className={`inline-flex items-center rounded-full bg-accent/20 text-accent-foreground font-bold ${sizeClasses} ${className}`}>
      <Lock className={iconSize} />
      PRO
    </span>
  );
}
