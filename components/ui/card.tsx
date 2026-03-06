import { clsx } from "clsx";

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div className={clsx("rounded-sm bg-white p-5 shadow-sm", className)}>{children}</div>
  );
}

export function CardHeader({ children, className }: CardProps) {
  return (
    <div className={clsx("mb-4 flex items-center justify-between", className)}>{children}</div>
  );
}

export function CardTitle({ children, className }: CardProps) {
  return (
    <h2 className={clsx("text-sm font-700 uppercase tracking-wider text-brand-dark-gray", className)}>
      {children}
    </h2>
  );
}
