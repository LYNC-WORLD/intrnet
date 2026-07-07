import React from "react";

/**
 * ResponsiveTable
 * --------------------------------------------------------------------------
 * On small screens: scrolls horizontally inside its own box instead of
 * squeezing columns or letting the page scroll.
 * On screens >= 768px: behaves like a normal full-width table.
 *
 * The overflow/min-width behavior is implemented with plain CSS (scoped via
 * a unique class name) instead of Tailwind's overflow-x-auto / min-w-[640px]
 * utilities. This sidesteps two common causes of "it just doesn't scroll":
 *   1. The file's path not being covered by tailwind.config content globs,
 *      so arbitrary-value classes never get generated.
 *   2. A parent element with overflow-hidden clipping the table before it
 *      gets a chance to create its own scroll container.
 * Plain CSS with !important on the two properties that matter guards
 * against both. Everything else (colors, spacing, hover states) still uses
 * Tailwind classes as normal.
 *
 * Usage:
 *   <ResponsiveTable
 *     columns={[
 *       { key: "name", header: "Name" },
 *       { key: "email", header: "Email" },
 *       { key: "role", header: "Role" },
 *     ]}
 *     data={[
 *       { name: "Asha", email: "asha@x.com", role: "Admin" },
 *       { name: "Ravi", email: "ravi@x.com", role: "Member" },
 *     ]}
 *   />
 */

export interface Column<T> {
  key: keyof T;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface ResponsiveTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey?: (row: T, index: number) => string | number;
  emptyMessage?: string;
  className?: string;
  /** px width the table forces below the md breakpoint. Default 640. */
  minWidth?: number;
}

export function ResponsiveTable<T extends Record<string, unknown>>({
  columns,
  data,
  rowKey,
  emptyMessage = "No data to show.",
  className = "",
  minWidth = 640,
}: ResponsiveTableProps<T>) {
  return (
    <div
      className={`rt-wrap rounded-lg border border-gray-200 dark:border-gray-800 ${className}`}
    >
      <style>{`
        .rt-wrap {
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch;
        }
        .rt-table {
          width: 100%;
          min-width: ${minWidth}px !important;
          border-collapse: collapse;
        }
        @media (min-width: 768px) {
          .rt-wrap {
            overflow-x: visible !important;
          }
          .rt-table {
            min-width: 0 !important;
          }
          .rt-table td {
            white-space: normal !important;
          }
        }
      `}</style>

      <table className="rt-table text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-900">
            {columns.map((col) => (
              <th
                key={String(col.key)}
                scope="col"
                className={`whitespace-nowrap px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300 ${
                  col.className ?? ""
                }`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-6 text-center text-gray-400"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr
                key={rowKey ? rowKey(row, i) : i}
                className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
              >
                {columns.map((col) => (
                  <td
                    key={String(col.key)}
                    className={`whitespace-nowrap px-4 py-3 text-gray-700 dark:text-gray-200 ${
                      col.className ?? ""
                    }`}
                  >
                    {col.render ? col.render(row) : String(row[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default ResponsiveTable;
