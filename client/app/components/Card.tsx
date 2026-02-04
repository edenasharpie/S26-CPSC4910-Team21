import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  footer?: ReactNode;
  variant?: "default" | "bordered" | "elevated";
}

export function Card({
  title,
  subtitle,
  footer,
  variant = "default",
  className = "",
  children,
  ...props
}: CardProps) {
  const variantStyles = {
    default: "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700",
    bordered: "bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600",
    elevated: "bg-white dark:bg-gray-800 shadow-lg border border-gray-100 dark:border-gray-700",
  };

  return (
    <div
      className={`rounded-lg overflow-hidden ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {(title || subtitle) && (
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          {title && (
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {subtitle}
            </p>
          )}
        </div>
      )}
      <div className="px-6 py-4">{children}</div>
      {footer && (
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
          {footer}
        </div>
      )}
    </div>
  );
}
