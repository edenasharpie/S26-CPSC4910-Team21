import type { Route } from "./+types/points";
import { useState, useMemo } from "react";
import { useLoaderData, Form, useActionData, Link } from "react-router";
import { Input, Button } from "~/components";
import { requireAuth } from "~/utils/session.server";
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart } from "recharts";

const API_URL = process.env.API_URL ?? "http://localhost:5000";

export async function loader({ request, params }: Route.LoaderArgs) {
  const sessionUser = await requireAuth(request, ["admin"]);
  const userId = params.id;
  const [driverRes, historyRes] = await Promise.all([
    fetch(`${API_URL}/api/admin/drivers/${userId}/points`),
    fetch(`${API_URL}/api/admin/drivers/${userId}/point-history`),
  ]);
  const [driver, history] = await Promise.all([
    driverRes.json(),
    historyRes.ok ? historyRes.json() : [],
  ]);
  return { driver, history: Array.isArray(history) ? history : [], adminUserId: sessionUser.UserID };
}

// Handle adding or editing point transactions
export async function action({ request, params }: Route.ActionArgs) {
  const sessionUser = await requireAuth(request, ["admin"]);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const driverUserId = params.id;
  const adminUserId = sessionUser.UserID;

  try {
    if (intent === "edit") {
      const tId = formData.get("transactionId") as string;
      const p = Number(formData.get("editPoints"));
      const r = formData.get("editReason") as string;
      const res = await fetch(`${API_URL}/api/admin/point-transactions/${tId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPoints: p, newReason: r, adminUserId }),
      });
      if (!res.ok) {
        const body = await res.json();
        return { error: body.error ?? "Update failed" };
      }
    } else {
      const p = Number(formData.get("pointChange"));
      const r = formData.get("reason") as string;
      const res = await fetch(`${API_URL}/api/admin/drivers/${driverUserId}/point-transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pointChange: p, reason: r, adminUserId }),
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

  // Compute chart data and linear regression trendline
  const chartData = useMemo(() => {

    let currentBalance = 0;
    const sortedHistory = [...history].sort((a: any, b: any) =>
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
      <Link
        to="/admin/dashboard"
        className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
      >
        ← Back to Admin Dashboard
      </Link>

      {/* Profile Header */}
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
        {/* Adjustment Column */}
        <div className="lg:col-span-3">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-5 sticky top-8">
            <h2 className="font-bold text-lg text-gray-800 text-left">Adjust Points</h2>
            <Form method="post" className="space-y-4">
              <Input
                label="Point Adjustment"
                name="pointChange"
                type="number"
                placeholder="e.g. 50 or -20"
                required
              />
              <Input
                label="Reasoning"
                name="reason"
                placeholder="Event name..."
                required
              />
              <Button
                type="submit"
                variant="primary"
                className="w-full py-4 rounded-l font-bold shadow-lg shadow-indigo-100"
              >
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

        {/* History Column */}
        <div className="lg:col-span-6 space-y-4">
          <h2 className="font-bold text-xl text-gray-800 px-2 text-left">
            Transaction History
          </h2>
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-left">
                    Date
                  </th>
                  <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-left">
                    Change
                  </th>
                  <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-left">
                    Reason
                  </th>
                  <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">
                    Edit
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {history.map((row: any) => (
                  <tr
                    key={row.TransactionID}
                    className="hover:bg-indigo-50/20 transition-colors group"
                  >
                    <td className="p-4 text-xs text-gray-500 font-medium text-left">
                      {new Date(row.TimeChanged).toLocaleString([], {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="p-4 text-left">
                      {editingId === row.TransactionID ? (
                        <input
                          name="editPoints"
                          form={`form-${row.TransactionID}`}
                          type="number"
                          defaultValue={row.PointChange}
                          className="border rounded-lg px-2 py-1 w-20 outline-none text-sm"
                        />
                      ) : (
                        <span
                          className={`font-bold text-sm ${
                            row.PointChange >= 0 ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          {row.PointChange > 0 ? `+${row.PointChange}` : row.PointChange}
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-left">
                      {editingId === row.TransactionID ? (
                        <input
                          name="editReason"
                          form={`form-${row.TransactionID}`}
                          defaultValue={row.ReasonForChange}
                          className="border rounded-lg px-2 py-1 w-full outline-none text-sm"
                        />
                      ) : (
                        <span className="text-sm text-gray-700">{row.ReasonForChange}</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <Form
                        method="post"
                        id={`form-${row.TransactionID}`}
                        className="inline"
                      >
                        <input type="hidden" name="intent" value="edit" />
                        <input
                          type="hidden"
                          name="transactionId"
                          value={row.TransactionID}
                        />
                        {editingId === row.TransactionID ? (
                          <Button
                            size="sm"
                            type="submit"
                            onClick={() => setTimeout(() => setEditingId(null), 100)}
                          >
                            Save
                          </Button>
                        ) : (
                          <button
                            type="button"
                            className="text-gray-300 hover:text-indigo-600"
                            onClick={() => setEditingId(row.TransactionID)}
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                              />
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

        {/* Performance Chart Column */}
        <div className="lg:col-span-3">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6 sticky top-8">
            <div className="space-y-3">
              <h2 className="font-bold text-lg text-gray-800 text-left">Performance</h2>
              <div className="grid grid-cols-2 gap-2 p-2 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 w-2 h-2 rounded-full bg-indigo-600"></span>
                  <span className="text-[10px] font-bold text-gray-500 uppercase truncate">
                    Actual
                  </span>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 w-3 h-0.5 bg-amber-400 border-t border-dashed border-amber-600"></span>
                  <span className="text-[10px] font-bold text-gray-500 uppercase truncate">
                    Trend
                  </span>
                </div>
              </div>
            </div>
            <div className="h-64 w-full">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 5, right: 5, left: -30, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#f8fafc"
                    />
                    <XAxis dataKey="date" hide />
                    <YAxis
                      stroke="#cbd5e1"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "12px",
                        border: "none",
                        boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
                        fontSize: "11px",
                      }}
                    />
                    <Line
                      type="stepAfter"
                      dataKey="balance"
                      stroke="#4f46e5"
                      strokeWidth={4}
                      dot={false}
                      activeDot={{ r: 6, strokeWidth: 0, fill: "#4338ca" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="trend"
                      stroke="#fbbf24"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center border-2 border-dashed border-gray-100 rounded-2xl text-gray-300 text-[10px] text-center p-4">
                  No data points yet
                </div>
              )}
            </div>
            <p className="text-[10px] text-gray-400 text-center uppercase tracking-[0.15em] font-bold">
              Balance History
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
