import type { HTMLAttributes, ReactNode } from "react";
import { useState } from "react";

// declare some attributes for the error component
interface ErrorProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  message?: string | ReactNode;
  error?: any; // Can accept error objects from server
  variant?: "error" | "warning" | "info";
  dismissible?: boolean;
  onDismiss?: () => void;
}

export function Error({
  title,
  message,
  error,
  variant = "error",
  dismissible = true,
  onDismiss,
  className = "",
  children,
  ...props
}: ErrorProps) {
  const [isVisible, setIsVisible] = useState(true);

  // Extract error message from various error formats
  const getErrorMessage = () => {
    if (message) return message;
    if (error) {
      // Handle different error object structures
      if (typeof error === "string") return error;
      if (error.message) return error.message;
      if (error.error) return error.error;
      if (error.statusText) return error.statusText;
      return "An unexpected error occurred";
    }
    return children;
  };

  const handleDismiss = () => {
    setIsVisible(false);
    if (onDismiss) onDismiss();
  };

  if (!isVisible) return null;

  // define variants we declared before
  const variantStyles = {
    error: "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800",
    warning: "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800",
    info: "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800",
  };

  const iconColors = {
    error: "text-red-600 dark:text-red-400",
    warning: "text-yellow-600 dark:text-yellow-400",
    info: "text-blue-600 dark:text-blue-400",
  };

  const textColors = {
    error: "text-red-800 dark:text-red-300",
    warning: "text-yellow-800 dark:text-yellow-300",
    info: "text-blue-800 dark:text-blue-300",
  };

  const icons = {
    error: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
    ),
    warning: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    ),
    info: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
      </svg>
    ),
  };

  const errorMessage = getErrorMessage();

  return (
    <div
      className={`rounded-lg border p-4 ${variantStyles[variant]} ${className}`}
      role="alert"
      {...props}
    >
      <div className="flex">
        <div className={`flex-shrink-0 ${iconColors[variant]}`}>
          {icons[variant]}
        </div>
        <div className="ml-3 flex-1">
          {title && (
            <h3 className={`text-sm font-medium ${textColors[variant]}`}>
              {title}
            </h3>
          )}
          {errorMessage && (
            <div className={`text-sm ${title ? "mt-2" : ""} ${textColors[variant]}`}>
              {errorMessage}
            </div>
          )}
          {/* Show additional error details in development */}
          {error?.status && (
            <div className={`text-xs mt-2 opacity-75 ${textColors[variant]}`}>
              Status: {error.status}
            </div>
          )}
        </div>
        {dismissible && (
          <div className="ml-auto pl-3">
            <button
              type="button"
              onClick={handleDismiss}
              className={`inline-flex rounded-md p-1.5 focus:outline-none focus:ring-2 focus:ring-offset-2 ${iconColors[variant]} hover:opacity-75`}
            >
              <span className="sr-only">Dismiss</span>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
