"use client";

import React from "react";

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
  sortable?: boolean;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string | number;
  onRowClick?: (item: T) => void;
  loading?: boolean;
  emptyMessage?: string;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  loading,
  emptyMessage = "No data",
}: TableProps<T>) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 skeleton rounded-lg" />
        ))}
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-600">
        <p className="text-[11px] font-bold uppercase tracking-widest">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table role="table" className="w-full border-collapse">
        <thead>
          <tr className="border-b border-white/5">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 ${col.className || ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr
              key={keyExtractor(item)}
              onClick={() => onRowClick?.(item)}
              className={`border-b border-white/[0.03] transition-colors
                ${onRowClick ? "cursor-pointer hover:bg-white/[0.02]" : ""}`}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-4 py-3 text-sm text-slate-300 ${col.className || ""}`}
                >
                  {col.render ? col.render(item) : (item as Record<string, unknown>)[col.key] as React.ReactNode}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
