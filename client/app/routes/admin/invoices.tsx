import { useLoaderData, useNavigate } from "react-router";
import type { Route } from "./+types/invoices";
import { Table, Button } from "~/components";
import { getAllPointTransactions } from "../../../../server/src/db.js";

export async function loader() {
  try {
    const transactions = await getAllPointTransactions();
    return { 
      transactions: Array.isArray(transactions) ? transactions : [] 
    };
  } catch (error) {
    return { transactions: [] };
  }
}

export default function InvoicesPage() {
  const { transactions } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  // Columns match your current Admin Portal style
  const columns = [
    { 
      key: "TimeChanged", 
      header: "Timestamp",
      render: (t: any) => <span className="text-gray-600">{t.TimeChanged}</span>
    },
    { 
      key: "Name", 
      header: "Driver", 
      render: (t: any) => (
        <div className="flex flex-col text-left">
          <span className="font-medium text-gray-900 dark:text-white">
            {t.FirstName} {t.LastName}
          </span>
          <span className="text-xs text-gray-500">ID: {t.DriverUserID}</span>
        </div>
      )
    },
    { 
      key: "PointChange", 
      header: "Amount", 
      render: (t: any) => (
        <span className={`font-bold ${t.PointChange >= 0 ? "text-green-600" : "text-red-600"}`}>
          {t.PointChange >= 0 ? `+${t.PointChange}` : t.PointChange}
        </span>
      ) 
    },
    { key: "ReasonForChange", header: "Reason" },
    { 
      key: "AdminUserID", 
      header: "Admin UserID",
      render: (t: any) => <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">{t.AdminUserID}</span>
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="container-padding section-spacing">
        <div className="mb-8 flex justify-between items-center">
          <div className="text-left">
            <h1 className="text-2xl font-bold mb-1">Point Invoices</h1>
            <p className="text-sm text-gray-500">Historical record of all point adjustments</p>
          </div>
          <Button variant="secondary" onClick={() => navigate("/admin-dashboard")}>
            Back to Portal
          </Button>
        </div>
        
        <div className="card overflow-hidden bg-white dark:bg-gray-900 shadow-sm border dark:border-gray-800 rounded-lg">
          <Table data={transactions} columns={columns} />
        </div>
      </div>
    </div>
  );
}