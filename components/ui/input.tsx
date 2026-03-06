import { clsx } from "clsx";
import { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, className, id, ...props },
  ref
) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-xs font-600 uppercase tracking-wide text-brand-dark-gray">
          {label}
        </label>
      )}
      <input
        id={id}
        ref={ref}
        className={clsx(
          "rounded-none border border-gray-300 bg-white px-3 py-2 text-sm text-brand-black placeholder-gray-400 transition-colors focus:border-brand-red focus:outline-none",
          error && "border-red-500",
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="text-xs text-brand-dark-gray">{hint}</p>}
    </div>
  );
});
