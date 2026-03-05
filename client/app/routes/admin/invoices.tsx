import { useLoaderData, useNavigate, Link } from "react-router";
import type { Route } from "./+types/invoices";
import { Table, Button, Badge } from "~/components";
import { getAllPointTransactions } from "../../../../server/src/db.js";

const API_URL = process.env.API_URL ?? 'http://localhost:5000';

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
  const navigate = useNavigate();

  // Stats calculation for the Grid
  const totalPoints = transactions.reduce((acc: number, curr: any) => acc + (curr.PointChange || 0), 0);
  const positiveTrans = transactions.filter((t: any) => t.PointChange > 0).length;

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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* Navigation Link - Matches Audit Style */}
        <div className="mb-4 text-left">
          <Link 
            to="/admin/dashboard" 
            className="text-sm font-medium text-blue-600 hover:underline mb-2 block"
          >
            ← Return to Admin Dashboard
          </Link>
        </div>

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
          </div>
        </div>

        {error && <div className="bg-red-100 p-4 text-red-700 rounded mb-4 text-left">{error}</div>}

        {/* Stats Grid - Added to match Audit Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard title="Total Transactions" value={transactions.length} color="text-gray-900" />
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
  return (
    <div className="bg-white dark:bg-gray-900 p-6 rounded-xl border dark:border-gray-800 shadow-sm text-left">
      <div className="text-sm text-gray-500 font-medium">{title}</div>
      <div className={`text-3xl font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}