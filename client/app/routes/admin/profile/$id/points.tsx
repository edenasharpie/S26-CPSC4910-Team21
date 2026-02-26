import { useState } from "react";
import { useLoaderData, Form, useActionData, Link } from "react-router"; 
import type { Route } from "./+types/points";
import { Input, Button } from "~/components";
import { getDriverPoints, getPointHistory, addPointTransaction, updatePointTransaction } from "../../../../../../server/src/db";

export async function loader({ params }: Route.LoaderArgs) {
  const userId = Number(params.id);
  const [driver, history] = await Promise.all([
    getDriverPoints(userId),
    getPointHistory(userId)
  ]);
  if (!driver) throw new Response("Driver not found", { status: 404 });
  return { driver, history };
}

export async function action({ request, params }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");
  const driverUserId = Number(params.id);
  const adminUserId = 1; // Replace with your actual logged-in UserID

  try {
    if (intent === "edit") {
      const tId = Number(formData.get("transactionId"));
      const p = Number(formData.get("editPoints"));
      const r = formData.get("editReason") as string;
      await updatePointTransaction(tId, p, r, adminUserId);
    } else {
      const p = Number(formData.get("pointChange"));
      const r = formData.get("reason") as string;
      await addPointTransaction(driverUserId, adminUserId, p, r);
    }
    return { success: true };
  } catch (error: any) {
    return { error: error.message };
  }
}

export default function PointsPage() {
  const { driver, history } = useLoaderData<typeof loader>();
  const actionData = useActionData();
  const [editingId, setEditingId] = useState<number | null>(null);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-10 text-left">
      <Link to="/admin-dashboard" className="text-sm font-medium text-blue-600">← Back</Link>

      <div className="flex justify-between items-center border-b pb-6">
        <div>
          <h1 className="text-3xl font-bold">{driver.FirstName} {driver.LastName}</h1>
          <p className="text-gray-400 text-xs font-mono uppercase">License: {driver.LicenseNumber}</p>
        </div>
        <div className="bg-indigo-50 px-8 py-3 rounded-2xl border border-indigo-100 text-center">
          <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Total Balance</span>
          <div className="text-5xl font-black text-indigo-700">{driver.PointBalance}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* New Transaction Form */}
        <Form method="post" className="lg:col-span-1 bg-white p-6 rounded-2xl border shadow-sm space-y-4 h-fit">
          <h2 className="font-bold text-lg">Add Points</h2>
          <Input label="Change (+/-)" name="pointChange" type="number" required />
          <Input label="Reason" name="reason" required />
          <Button type="submit" variant="primary" className="w-full">Save New</Button>
          {actionData?.error && <p className="text-red-500 text-xs font-bold">{actionData.error}</p>}
        </Form>

        {/* Audit Log Table */}
        <div className="lg:col-span-3 overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-4 text-xs font-bold text-gray-400">Date</th>
                <th className="p-4 text-xs font-bold text-gray-400">Points</th>
                <th className="p-4 text-xs font-bold text-gray-400">Reason</th>
                <th className="p-4 text-xs font-bold text-gray-400">Admin</th>
                <th className="p-4 text-xs font-bold text-gray-400 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {history.map((row: any) => (
                <tr key={row.TransactionID}>
                  <td className="p-4 text-xs text-gray-500">{new Date(row.TimeChanged).toLocaleString()}</td>
                  <td className="p-4">
                    {editingId === row.TransactionID ? (
                      <input name="editPoints" form={`form-${row.TransactionID}`} type="number" defaultValue={row.PointChange} className="border rounded px-2 w-20" />
                    ) : (
                      <span className={`font-bold ${row.PointChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {row.PointChange > 0 ? `+${row.PointChange}` : row.PointChange}
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    {editingId === row.TransactionID ? (
                      <input name="editReason" form={`form-${row.TransactionID}`} defaultValue={row.ReasonForChange} className="border rounded px-2 w-full" />
                    ) : (
                      <span className="text-sm">{row.ReasonForChange}</span>
                    )}
                  </td>
                  <td className="p-4 text-xs text-gray-400">{row.UserChanged}</td>
                  <td className="p-4 text-right">
                    <Form method="post" id={`form-${row.TransactionID}`} className="inline">
                      <input type="hidden" name="intent" value="edit" />
                      <input type="hidden" name="transactionId" value={row.TransactionID} />
                      {editingId === row.TransactionID ? (
                        <Button size="sm" type="submit" onClick={() => setTimeout(() => setEditingId(null), 100)}>Save</Button>
                      ) : (
                        <Button size="sm" variant="secondary" type="button" onClick={() => setEditingId(row.TransactionID)}>Edit</Button>
                      )}
                    </Form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}