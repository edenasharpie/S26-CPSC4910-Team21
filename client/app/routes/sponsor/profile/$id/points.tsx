import type { Route } from "./+types/points";
import { useState, useMemo } from "react";
import { useLoaderData, Form, useActionData, Link } from "react-router";
import { Input, Button } from "~/components";
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart } from "recharts";

const API_URL = process.env.API_URL ?? "http://localhost:5000";

// TEMP: Hardcoded sponsor user ID for testing (auth not yet implemented)
// Using sponsor user 123456915 (Sam Sponsor) who manages company 78
const TEMP_SPONSOR_USER_ID = 123456915;

export async function loader({ request, params }: Route.LoaderArgs) {
  console.log("LOADER IS RUNNING FOR ID:", params.id);
  const driverId = params.id;

  try {
    const pointsUrl = `${API_URL}/api/sponsors/${TEMP_SPONSOR_USER_ID}/drivers/${driverId}/points`;
    const historyUrl = `${API_URL}/api/sponsors/${TEMP_SPONSOR_USER_ID}/drivers/${driverId}/point-history`;
    
    console.log("Fetching:", pointsUrl);
    console.log("Fetching:", historyUrl);

    const [driverRes, historyRes] = await Promise.all([
      fetch(pointsUrl),
      fetch(historyUrl),
    ]);

    console.log("Driver response status:", driverRes.status);
    console.log("History response status:", historyRes.status);

    if (!driverRes.ok) {
      const errorText = await driverRes.text();
      console.error("Driver response error:", errorText);
      throw new Response(`Driver not found for this sponsor. Status: ${driverRes.status}`, { status: 404 });
    }

    const driver = await driverRes.json();
    const historyData = historyRes.ok ? await historyRes.json() : [];

    return { 
      driver, 
      history: Array.isArray(historyData) ? historyData : [], 
      sponsorUserId: TEMP_SPONSOR_USER_ID 
    };
  } catch (err) {
    console.error("Loader error:", err);
    throw err;
  }
}

export async function action({ request, params }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");
  const driverUserId = params.id;
  const sponsorUserId = TEMP_SPONSOR_USER_ID;

  try {
    if (intent === "edit") {
      const tId = formData.get("transactionId") as string;
      const p = Number(formData.get("editPoints"));
      const r = formData.get("editReason") as string;
      
      // Updated to match backend plural 'sponsors' and nested structure
      const res = await fetch(`${API_URL}/api/sponsors/${sponsorUserId}/point-transactions/${tId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPoints: p, newReason: r, sponsorUserId }),
      });
      
      if (!res.ok) {
        const body = await res.json();
        return { error: body.error ?? "Update failed" };
      }
    } else {
      const p = Number(formData.get("pointChange"));
      const r = formData.get("reason") as string;

      // Updated to match backend plural 'sponsors' and nested structure
      // Note: Backend likely expects /api/sponsors/:sponsorId/drivers/:driverId/point-transactions
      const res = await fetch(`${API_URL}/api/sponsors/${sponsorUserId}/drivers/${driverUserId}/point-transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pointChange: p, reason: r, sponsorUserId }),
      });

      if (!res.ok) {
        const body = await res.json();
        return { error: body.error ?? "Transaction failed" };
      }
    }
    return { success: true };
  } catch (error: any) {
    return { error: error.message };
  }
}

export default function PointsPage() {
  const { driver, history } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [editingId, setEditingId] = useState<number | null>(null);

  const chartData = useMemo(() => {
    let currentBalance = 0;
    // Ensure we are working with a valid array
    const safeHistory = Array.isArray(history) ? history : [];
    
    const sortedHistory = [...safeHistory].sort((a: any, b: any) =>
      new Date(a.TimeChanged).getTime() - new Date(b.TimeChanged).getTime()
    );

    const points = sortedHistory.map((item: any, index: number) => {
      currentBalance += Number(item.PointChange);
      return {
        x: index,
        date: new Date(item.TimeChanged).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        balance: currentBalance,
      };
    });

    const n = points.length;
    if (n < 2) return points;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (const p of points) {
      sumX += p.x;
      sumY += p.balance;
      sumXY += p.x * p.balance;
      sumX2 += p.x * p.x;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return points.map((p: any) => ({
      ...p,
      trend: parseFloat((slope * p.x + intercept).toFixed(2)),
    }));
  }, [history]);

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-10 text-left">
      <div className="flex items-center space-x-4">
        <Link to="/" className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
          ← Home
        </Link>
        <Link
          to="/sponsor/dashboard"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          ← Back to Sponsor Dashboard
        </Link>
      </div>

      <div className="flex justify-between items-end border-b pb-8 border-gray-100">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight">
            {driver.FirstName} {driver.LastName}
          </h1>
          <p className="text-gray-400 text-sm font-mono mt-2 bg-gray-50 px-3 py-1 rounded-md inline-block border text-left">
            License: {driver.LicenseNumber}
          </p>
        </div>
        <div className="bg-white px-10 py-4 rounded-3xl border-2 border-indigo-600 text-center shadow-lg shadow-indigo-50">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400">
            Current Balance
          </span>
          <div className="text-5xl font-black text-indigo-700">{driver.PointBalance}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Adjustment Form */}
        <div className="lg:col-span-3">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-5 sticky top-8">
            <h2 className="font-bold text-lg text-gray-800 text-left">Adjust Points</h2>
            <Form method="post" className="space-y-4">
              <Input label="Point Adjustment" name="pointChange" type="number" placeholder="e.g. 50 or -20" required />
              <Input label="Reasoning" name="reason" placeholder="Event name..." required />
              <Button type="submit" variant="primary" className="w-full py-4 rounded-l font-bold shadow-lg shadow-indigo-100">
                Publish
              </Button>
              {actionData?.error && (
                <p className="text-red-500 text-xs font-bold text-center bg-red-50 p-2 rounded">
                  {actionData.error}
                </p>
              )}
            </Form>
          </div>
        </div>

        {/* Table */}
        <div className="lg:col-span-6 space-y-4">
          <h2 className="font-bold text-xl text-gray-800 px-2 text-left">Transaction History</h2>
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date</th>
                  <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Change</th>
                  <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Reason</th>
                  <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {history.map((row: any) => (
                  <tr key={row.TransactionID} className="hover:bg-indigo-50/20 transition-colors group">
                    <td className="p-4 text-xs text-gray-500 font-medium">
                      {new Date(row.TimeChanged).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="p-4">
                      {editingId === row.TransactionID ? (
                        <input name="editPoints" form={`form-${row.TransactionID}`} type="number" defaultValue={row.PointChange} className="border rounded-lg px-2 py-1 w-20 outline-none text-sm" />
                      ) : (
                        <span className={`font-bold text-sm ${row.PointChange >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {row.PointChange > 0 ? `+${row.PointChange}` : row.PointChange}
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      {editingId === row.TransactionID ? (
                        <input name="editReason" form={`form-${row.TransactionID}`} defaultValue={row.ReasonForChange} className="border rounded-lg px-2 py-1 w-full outline-none text-sm" />
                      ) : (
                        <span className="text-sm text-gray-700">{row.ReasonForChange}</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <Form method="post" id={`form-${row.TransactionID}`} className="inline">
                        <input type="hidden" name="intent" value="edit" />
                        <input type="hidden" name="transactionId" value={row.TransactionID} />
                        {editingId === row.TransactionID ? (
                          <Button size="sm" type="submit" onClick={() => setTimeout(() => setEditingId(null), 100)}>
                            Save
                          </Button>
                        ) : (
                          <button type="button" className="text-gray-300 hover:text-indigo-600" onClick={() => setEditingId(row.TransactionID)}>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                        )}
                      </Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Chart */}
        <div className="lg:col-span-3">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6 sticky top-8">
            <h2 className="font-bold text-lg text-gray-800">Performance</h2>
            <div className="h-64 w-full">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f8fafc" />
                    <XAxis dataKey="date" hide />
                    <YAxis stroke="#cbd5e1" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)", fontSize: "11px" }} />
                    <Line type="stepAfter" dataKey="balance" stroke="#4f46e5" strokeWidth={4} dot={false} />
                    <Line type="monotone" dataKey="trend" stroke="#fbbf24" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center border-2 border-dashed border-gray-100 rounded-2xl text-gray-300 text-[10px] text-center p-4">
                  No data points yet
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}