const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  accepted: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
  cancelled: "bg-slate-100 text-slate-700 border-slate-200",
};

export function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase() || "pending";
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${statusStyles[s]}`}>
      {status}
    </span>
  );
}