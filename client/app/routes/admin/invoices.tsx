import { useLoaderData } from "react-router";
import type { Route } from "./+types/invoices";
import { Table, Button, Badge } from "~/components";
import { requireAuth } from "~/utils/session.server";
import { getApiBaseUrl } from "~/utils/api-url";

const API_URL = getApiBaseUrl();

export async function loader({ request }: Route.LoaderArgs) {
  requireAuth(request, ["admin"]);
  try {
    const res = await fetch(`${API_URL}/api/admin/point-transactions`);
    const transactions = await res.json();
    return {
      transactions: Array.isArray(transactions) ? transactions : []
    };
  } catch (error) {
    return { transactions: [], error: "Failed to load transactions" };
  }
}

export default function InvoicesPage() {
  const { transactions, error } = useLoaderData<typeof loader>();

  // Stats calculation for the Grid
  const totalPoints = transactions.reduce((acc: number, curr: any) => acc + (curr.PointChange || 0), 0);
  const positiveTrans = transactions.filter((t: any) => t.PointChange > 0).length;

  const handleExportCSV = () => {
    const rows = [
      ["Timestamp", "Driver", "Amount", "Reason", "Admin ID"],
      ...transactions.map((transaction: any) => [
        transaction.TimeChanged ? new Date(transaction.TimeChanged).toLocaleString() : "",
        `${transaction.FirstName ?? ""} ${transaction.LastName ?? ""}`.trim(),
        transaction.PointChange ?? "",
        transaction.ReasonForChange ?? "",
        transaction.AdminUserID ?? "",
      ]),
    ];

    const csvContent = rows
      .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `admin-point-invoices-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const columns = [
    { 
      key: "TimeChanged", 
      header: "Timestamp",
      render: (t: any) => <span className="text-sm font-mono">{new Date(t.TimeChanged).toLocaleString()}</span>
    },
    { 
      key: "Name", 
      header: "Driver", 
      render: (t: any) => (
        <div className="flex flex-col text-left">
          <span className="font-medium text-gray-900 dark:text-white">
            {t.FirstName} {t.LastName}
          </span>
          <span className="text-xs text-gray-400 font-mono">ID: {t.DriverUserID}</span>
        </div>
      )
    },
    { 
      key: "PointChange", 
      header: "Amount", 
      render: (t: any) => (
        <Badge variant={t.PointChange >= 0 ? "success" : "danger"}>
          {t.PointChange >= 0 ? `+${t.PointChange}` : t.PointChange}
        </Badge>
      ) 
    },
    { key: "ReasonForChange", header: "Reason" },
    { 
      key: "AdminUserID", 
      header: "Admin ID",
      render: (t: any) => <span className="text-xs font-mono text-gray-500">{t.AdminUserID}</span>
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100 p-8 dark:from-blue-950 dark:via-gray-950 dark:to-blue-900">
      <div className="mx-auto max-w-7xl">
        {/* Header Section - Matches Audit Style */}
        <div className="flex justify-between items-end mb-8 text-left border-b pb-6 dark:border-gray-800">
          <div>
            <h1 className="text-3xl font-bold">Point Invoices</h1>
            <p className="text-gray-500">Historical record of all point adjustments</p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => window.print()}>
              Print Report
            </Button>
            <Button variant="secondary" onClick={handleExportCSV}>
              Export to CSV
            </Button>
          </div>
        </div>

        {error && <div className="bg-red-100 p-4 text-red-700 rounded mb-4 text-left">{error}</div>}

        {/* Stats Grid - Added to match Audit Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard title="Total Transactions" value={transactions.length} color="text-gray-900 dark:text-white" />
          <StatCard title="Points Awarded" value={positiveTrans} color="text-green-600" />
          <StatCard title="Net Point Flow" value={totalPoints} color="text-blue-600" />
        </div>

        {/* Table Container - Matches Audit Style */}
        <div className="card shadow-sm overflow-hidden bg-white dark:bg-gray-900 border dark:border-gray-800 rounded-xl">
          <Table data={transactions} columns={columns} />
          {transactions.length === 0 && (
            <div className="p-12 text-center text-gray-500 italic">
              No point transactions found in the database.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Stats Helper to match Audit page consistency
function StatCard({ title, value, color }: { title: string; value: number | string; color: string }) {
  
  const textColor = color || "text-gray-900 dark:text-white";
  return (
    <div className="bg-white dark:bg-gray-900 p-6 rounded-xl border dark:border-gray-800 shadow-sm text-left">
      <div className="text-sm text-gray-500 font-medium">{title}</div>
      <div className={`text-3xl font-bold mt-1 ${textColor}`}>{value}</div>
    </div>
  );
}