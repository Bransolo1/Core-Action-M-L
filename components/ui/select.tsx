import { clsx } from "clsx";
import { forwardRef } from "react";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, options, className, id, ...props },
  ref
) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-xs font-600 uppercase tracking-wide text-brand-dark-gray">
          {label}
        </label>
      )}
      <select
        id={id}
        ref={ref}
        className={clsx(
          "rounded-none border border-gray-300 bg-white px-3 py-2 text-sm text-brand-black transition-colors focus:border-brand-red focus:outline-none",
          error && "border-red-500",
          className
        )}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
});
