const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  accepted: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-100 text-rose-700 border-rose-200",
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