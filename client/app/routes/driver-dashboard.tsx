import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { Card, Table } from "~/components";
import { requireAuth } from "~/utils/session.server";

const API_URL = process.env.API_URL ?? "http://localhost:5000";

// 1. Define the Data Structure
interface PointTransaction {
  PointChange: number;
  ReasonForChange: string;
  TimeChanged: string;
}

interface PointData {
  balance: number;
  history: PointTransaction[];
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const session = await requireAuth(request, ["driver"]);
  const userId = params.id ?? session.UserID;

  try {
    const res = await fetch(`${API_URL}/api/drivers/my-points/${userId}`);
    
    if (!res.ok) {
        // Return a default object if the fetch fails
        return { balance: 0, history: [] };
    }
    
    const data: PointData = await res.json();
    return data;
  } catch (error) {
    console.error("Driver Loader Error:", error);
    return { balance: 0, history: [] };
  }
}

// 4. The Page Component
export default function DriverDashboard() {
  const data = useLoaderData<typeof loader>();
  
  const { balance = 0, history = [] } = data || {};

  const columns = [
    { 
      key: "PointChange", 
      header: "Change",
      render: (row: PointTransaction) => (
        <span className={`font-bold ${row.PointChange >= 0 ? "text-green-600" : "text-red-600"}`}>
          {row.PointChange >= 0 ? `+${row.PointChange}` : row.PointChange}
        </span>
      )
    },
    { key: "ReasonForChange", header: "Reason" },
    { 
      key: "TimeChanged", 
      header: "Date",
      render: (row: PointTransaction) => new Date(row.TimeChanged).toLocaleDateString() 
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8 dark:bg-gray-950">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Driver Rewards</h1>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <Card className="p-8 bg-indigo-600 text-white shadow-xl">
            <h2 className="text-indigo-100 text-sm font-semibold uppercase">Available Points</h2>
            <div className="text-6xl font-black mt-2">{balance.toLocaleString()}</div>
          </Card>
        </div>

        <section className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border p-6">
          <h2 className="text-xl font-semibold mb-6">Transaction History</h2>
          <Table data={history} columns={columns} />
        </section>
      </div>
    </div>
  );
}