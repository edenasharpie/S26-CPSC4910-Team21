import type { ReactNode } from "react";

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
  className?: string;
}

interface TableProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  isLoading?: boolean;
}

export function Table<T extends Record<string, any>>({
  data,
  columns,
  onRowClick,
  emptyMessage = "No data available",
  isLoading = false,
}: TableProps<T>) {
  if (isLoading) {
    return (
      <div className="w-full border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="p-8 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400" />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="w-full border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider ${
                    column.className || ""
                  }`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {data.map((item, index) => (
              <tr
                key={index}
                onClick={() => onRowClick?.(item)}
                className={`${
                  onRowClick
                    ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    : ""
                }`}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 ${
                      column.className || ""
                    }`}
                  >
                    {column.render
                      ? column.render(item)
                      : item[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
