import { clsx } from "clsx";
import { Loader2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: React.ReactNode;
}

const VARIANTS = {
  primary: "bg-brand-red text-white hover:bg-red-700 font-600",
  secondary: "bg-brand-black text-white hover:bg-gray-800 font-600",
  ghost: "bg-transparent border border-gray-300 text-brand-black hover:bg-gray-50 font-500",
  danger: "bg-red-600 text-white hover:bg-red-700 font-600",
};

const SIZES = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  disabled,
  children,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center gap-2 rounded-none transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}
