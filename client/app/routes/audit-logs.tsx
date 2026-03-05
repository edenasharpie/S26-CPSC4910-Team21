import type { Route } from "./+types/audit-logs";
import { useState } from "react";
import { useLoaderData, Form, Link, useNavigate } from "react-router"; // Added Link and useNavigate
import { Table, Button, Badge, Input, Modal } from "~/components";
import { pool } from "../../../server/src/db.js";

// --- Server-Side Loader ---
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const filters = url.searchParams.getAll("filter");
  const sponsorId = url.searchParams.get("sponsorId");

  let queryParts: string[] = [];
  let params: any[] = [];

  if (filters.includes("password_changes")) {
    queryParts.push(`
      SELECT UserID, Username, 'Password Change' as eventType, 
             LastPasswordChange as timestamp, 'Success' as status 
      FROM USERS WHERE LastPasswordChange IS NOT NULL`);
  }

  if (filters.includes("login_attempts")) {
    queryParts.push(`
      SELECT UserID, Username, 'Login Attempt' as eventType, 
             LastLogin as timestamp, 'Success' as status 
      FROM USERS WHERE LastLogin IS NOT NULL`);
  }

  if (filters.includes("driver_apps")) {
    queryParts.push(`
      SELECT UserID, 'System' as Username, 'Driver Application' as eventType, 
             NOW() as timestamp, 'Pending' as status 
      FROM DRIVER_APPLICATIONS`); 
  }

  const finalQuery = queryParts.length > 0 
    ? queryParts.join(" UNION ALL ") + " ORDER BY timestamp DESC"
    : "SELECT UserID, Username, 'General Log' as eventType, NOW() as timestamp, 'Success' as status FROM USERS LIMIT 50";

  try {
    const [rows] = await pool.execute(finalQuery, params);
    return { logs: rows as any[] };
  } catch (error: any) {
    console.error("Audit Query Error:", error);
    return { logs: [], error: error.message };
  }
}

// --- Client-Side Component ---
export default function AuditDashboard() {
  const { logs, error } = useLoaderData<typeof loader>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate(); // Hook for programmatic navigation

  const downloadCSV = () => {
    const headers = ["Timestamp", "Event Type", "User", "Status"].join(",");
    const rows = logs.map(log => 
      `"${log.timestamp}","${log.eventType}","${log.Username}","${log.status}"`
    ).join("\n");
    
    const blob = new Blob([headers + "\n" + rows], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const columns = [
    {
      key: "timestamp",
      header: "Timestamp",
      render: (log: any) => <span className="text-sm font-mono">{new Date(log.timestamp).toLocaleString()}</span>,
    },
    {
      key: "eventType",
      header: "Event",
      render: (log: any) => <Badge variant="info">{log.eventType}</Badge>,
    },
    { key: "Username", header: "User" },
    {
      key: "status",
      header: "Status",
      render: (log: any) => (
        <Badge variant={log.status === "Success" ? "success" : "danger"}>{log.status}</Badge>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Navigation Row */}
        <div className="mb-4">
          <Button variant="ghost" onClick={() => navigate("/admin/dashboard")} className="flex items-center gap-2">
            ← Back to Dashboard
          </Button>
        </div>

        <div className="flex justify-between items-center mb-8 text-left">
          <div>
            <h1 className="text-3xl font-bold">Audit & Compliance</h1>
            <p className="text-gray-500">Monitor system changes and user activity</p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setIsModalOpen(true)}>
              Filter Report
            </Button>
            <Button variant="primary" onClick={downloadCSV} disabled={logs.length === 0}>
              Download CSV
            </Button>
          </div>
        </div>

        {error && <div className="bg-red-100 p-4 text-red-700 rounded mb-4">{error}</div>}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard title="Total Records" value={logs.length} color="text-gray-900" />
          <StatCard title="Security Events" value={logs.filter(l => l.eventType.includes('Password')).length} color="text-orange-600" />
          <StatCard title="App Submissions" value={logs.filter(l => l.eventType.includes('Application')).length} color="text-blue-600" />
        </div>

        <div className="card shadow-sm overflow-hidden bg-white dark:bg-gray-900 border dark:border-gray-800">
          <Table data={logs} columns={columns} />
        </div>

        {/* Filter Modal */}
        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Generate Audit Report">
          <Form method="get" className="space-y-4 text-left">
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Include Data For:</p>
              <Checkbox label="Password Changes" name="filter" value="password_changes" />
              <Checkbox label="Login Attempts" name="filter" value="login_attempts" />
              <Checkbox label="Driver Applications" name="filter" value="driver_apps" />
            </div>

            <div className="pt-4 border-t">
              <label className="block text-sm font-medium mb-2">Sponsor Filter</label>
              <select name="sponsorId" className="w-full p-2 rounded border dark:bg-gray-800 dark:border-gray-700">
                <option value="all">All Sponsors</option>
                <option value="1">Sponsor Alpha</option>
                <option value="2">Sponsor Beta</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-6">
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary" onClick={() => setIsModalOpen(false)}>Apply Filters</Button>
            </div>
          </Form>
        </Modal>
      </div>
    </div>
  );
}

// --- Helper Components (Stay the same) ---
function StatCard({ title, value, color }: { title: string; value: number; color: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 p-6 rounded-xl border dark:border-gray-800 shadow-sm text-left">
      <div className="text-sm text-gray-500 font-medium">{title}</div>
      <div className={`text-3xl font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function Checkbox({ label, name, value }: { label: string, name: string, value: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <input type="checkbox" name={name} value={value} className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
      <span className="text-sm text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200">{label}</span>
    </label>
  );
}