import { useState, useEffect } from "react";
import { useParams, Link } from "react-router"; 
import { Input, Button } from "~/components";

const BASE_URL = process.env.API_URL ?? 'http://localhost:5000';

export async function loader({ request, params }: Route.LoaderArgs) {
  const sessionUser = requireAuth(request, ["admin"]);
  const userId = params.id;
  const [driverRes, historyRes] = await Promise.all([
    fetch(`${BASE_URL}/api/admin/drivers/${userId}/points`),
    fetch(`${BASE_URL}/api/admin/drivers/${userId}/point-history`),
  ]);
  if (!driverRes.ok) throw new Response("Driver not found", { status: 404 });
  const [driver, history] = await Promise.all([driverRes.json(), historyRes.json()]);
  return { driver, history, adminUserId: sessionUser.UserID };
}

export async function action({ request, params }: Route.ActionArgs) {
  const sessionUser = requireAuth(request, ["admin"]);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const driverUserId = params.id;
  const adminUserId = sessionUser.UserID;

  try {
    if (intent === "edit") {
      const tId = formData.get("transactionId") as string;
      const p = Number(formData.get("editPoints"));
      const r = formData.get("editReason") as string;
      const res = await fetch(`${BASE_URL}/api/admin/point-transactions/${tId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPoints: p, newReason: r, adminUserId }),
      });
      if (!res.ok) {
        const body = await res.json();
        return { error: body.error ?? 'Update failed' };
      }
    } else {
      const p = Number(formData.get("pointChange"));
      const r = formData.get("reason") as string;
      const res = await fetch(`${BASE_URL}/api/admin/drivers/${driverUserId}/point-transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pointChange: p, reason: r, adminUserId }),
      });
      if (!res.ok) {
        const body = await res.json();
        return { error: body.error ?? 'Transaction failed' };
      }
    }
    return { success: true };
  } catch (error: any) {
    return { error: error.message };
  }
}

export default function PointsPage() {
  const { id } = useParams();
  const [driver, setDriver] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ pointChange: '', reason: '' });
  const [editFormData, setEditFormData] = useState<{[key: number]: {pointChange: number, reason: string}}>({});

  useEffect(() => {
    fetchPoints();
  }, [id]);

  const fetchPoints = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${BASE_URL}/api/admin/users/${id}/points`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Driver not found');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setDriver(data.driver);
      setHistory(data.history || []);
      
      // Initialize edit form data for all transactions
      const editData: {[key: number]: {pointChange: number, reason: string}} = {};
      (data.history || []).forEach((row: any) => {
        editData[row.TransactionID] = {
          pointChange: row.PointChange,
          reason: row.ReasonForChange
        };
      });
      setEditFormData(editData);
    } catch (error: any) {
      console.error('Error fetching points:', error);
      setError(error.message || 'Failed to fetch driver points');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      const response = await fetch(`${BASE_URL}/api/admin/users/${id}/points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pointChange: parseInt(formData.pointChange),
          reason: formData.reason,
          adminUserId: 1 // TODO: get from auth
        })
      });

      if (response.ok) {
        setFormData({ pointChange: '', reason: '' });
        fetchPoints(); // Refresh data
      } else {
        const errData = await response.json();
        setError(errData.error || 'Failed to add transaction');
      }
    } catch (error: any) {
      console.error('Error adding transaction:', error);
      setError('Failed to add transaction. Please try again.');
    }
  };

  const handleUpdateTransaction = async (transactionId: number) => {
    try {
      setError(null);
      const editData = editFormData[transactionId];
      const response = await fetch(`${BASE_URL}/api/admin/users/${id}/points/${transactionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pointChange: editData.pointChange,
          reason: editData.reason,
          adminUserId: 1 // TODO: get from auth
        })
      });

      if (response.ok) {
        setEditingId(null);
        fetchPoints(); // Refresh data
      } else {
        const errData = await response.json();
        setError(errData.error || 'Failed to update transaction');
      }
    } catch (error: any) {
      console.error('Error updating transaction:', error);
      setError('Failed to update transaction. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="p-8 max-w-6xl mx-auto text-left">
        <div className="text-center text-gray-500">Loading driver data...</div>
      </div>
    );
  }

  if (error && !driver) {
    return (
      <div className="p-8 max-w-6xl mx-auto text-left">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
        <Link to="/admin/dashboard" className="text-blue-600 hover:underline">← Back to Dashboard</Link>
      </div>
    );
  }

  if (!driver) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
    <div className="p-8 max-w-6xl mx-auto space-y-10 text-left">
      <div className="flex items-center gap-4">
        <Link to="/admin/dashboard" className="text-sm font-medium text-blue-600">← Back</Link>
        <Link to="/" className="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">Home</Link>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{driver.FirstName} {driver.LastName}</h1>
          <p className="text-gray-400 dark:text-gray-500 text-xs font-mono uppercase">User ID: {id}</p>
        </div>
        <div className="bg-indigo-50 dark:bg-indigo-900/20 px-8 py-3 rounded-2xl border border-indigo-100 dark:border-indigo-800 text-center">
          <span className="text-xs font-bold text-indigo-400 dark:text-indigo-400 uppercase tracking-widest">Total Balance</span>
          <div className="text-5xl font-black text-indigo-700 dark:text-indigo-400">{driver.PointBalance}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* New Transaction Form */}
        <form onSubmit={handleAddTransaction} className="lg:col-span-1 bg-white dark:bg-gray-900 p-6 rounded-2xl border dark:border-gray-800 shadow-sm space-y-4 h-fit">
          <h2 className="font-bold text-lg text-gray-900 dark:text-gray-100">Add Points</h2>
          <Input 
            label="Change (+/-)" 
            name="pointChange" 
            type="number" 
            value={formData.pointChange}
            onChange={(e) => setFormData({...formData, pointChange: e.target.value})}
            required 
          />
          <Input 
            label="Reason" 
            name="reason" 
            value={formData.reason}
            onChange={(e) => setFormData({...formData, reason: e.target.value})}
            required 
          />
          <Button type="submit" variant="primary" className="w-full">Save New</Button>
        </form>

        {/* Audit Log Table */}
        <div className="lg:col-span-3 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <table className="w-full text-left">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
              <tr>
                <th className="p-4 text-xs font-bold text-gray-400 dark:text-gray-500">Date</th>
                <th className="p-4 text-xs font-bold text-gray-400 dark:text-gray-500">Points</th>
                <th className="p-4 text-xs font-bold text-gray-400 dark:text-gray-500">Reason</th>
                <th className="p-4 text-xs font-bold text-gray-400 dark:text-gray-500">Admin</th>
                <th className="p-4 text-xs font-bold text-gray-400 dark:text-gray-500 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {history.map((row: any) => (
                <tr key={row.TransactionID}>
                  <td className="p-4 text-xs text-gray-500 dark:text-gray-400">{new Date(row.TimeChanged).toLocaleString()}</td>
                  <td className="p-4">
                    {editingId === row.TransactionID ? (
                      <input 
                        type="number" 
                        value={editFormData[row.TransactionID]?.pointChange || row.PointChange}
                        onChange={(e) => setEditFormData({
                          ...editFormData,
                          [row.TransactionID]: {
                            ...editFormData[row.TransactionID],
                            pointChange: parseInt(e.target.value)
                          }
                        })}
                        className="border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded px-2 w-20" 
                      />
                    ) : (
                      <span className={`font-bold ${row.PointChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {row.PointChange > 0 ? `+${row.PointChange}` : row.PointChange}
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    {editingId === row.TransactionID ? (
                      <input 
                        value={editFormData[row.TransactionID]?.reason || row.ReasonForChange}
                        onChange={(e) => setEditFormData({
                          ...editFormData,
                          [row.TransactionID]: {
                            ...editFormData[row.TransactionID],
                            reason: e.target.value
                          }
                        })}
                        className="border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded px-2 w-full" 
                      />
                    ) : (
                      <span className="text-sm text-gray-900 dark:text-gray-100">{row.ReasonForChange}</span>
                    )}
                  </td>
                  <td className="p-4 text-xs text-gray-400 dark:text-gray-500">{row.UserChanged}</td>
                  <td className="p-4 text-right">
                    {editingId === row.TransactionID ? (
                      <div className="flex gap-2 justify-end">
                        <Button 
                          size="sm" 
                          type="button" 
                          onClick={() => handleUpdateTransaction(row.TransactionID)}
                        >
                          Save
                        </Button>
                        <Button 
                          size="sm" 
                          variant="secondary"
                          type="button" 
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button 
                        size="sm" 
                        variant="secondary" 
                        type="button" 
                        onClick={() => setEditingId(row.TransactionID)}
                      >
                        Edit
                      </Button>
                    )}
                  </td>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {history.map((row: any) => (
                  <tr key={row.TransactionID} className="hover:bg-indigo-50/20 transition-colors group">
                    <td className="p-4 text-xs text-gray-500 font-medium text-left">
                      {new Date(row.TimeChanged).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="p-4 text-left">
                      {editingId === row.TransactionID ? (
                        <input name="editPoints" form={`form-${row.TransactionID}`} type="number" defaultValue={row.PointChange} className="border rounded-lg px-2 py-1 w-20 outline-none text-sm" />
                      ) : (
                        <span className={`font-bold text-sm ${row.PointChange >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {row.PointChange > 0 ? `+${row.PointChange}` : row.PointChange}
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-left">
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
                          <Button size="sm" type="submit" onClick={() => setTimeout(() => setEditingId(null), 100)}>Save</Button>
                        ) : (
                          <button type="button" className="text-gray-300 hover:text-indigo-600" onClick={() => setEditingId(row.TransactionID)}>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
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
              
              {/* LEGEND: Optimized for Sidebar Fit */}
              <div className="grid grid-cols-2 gap-2 p-2 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 w-2 h-2 rounded-full bg-indigo-600"></span>
                  <span className="text-[10px] font-bold text-gray-500 uppercase truncate">Actual</span>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 w-3 h-0.5 bg-amber-400 border-t border-dashed border-amber-600"></span>
                  <span className="text-[10px] font-bold text-gray-500 uppercase truncate">Trend</span>
                </div>
              </div>
            </div>

            <div className="h-64 w-full">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f8fafc" />
                    <XAxis dataKey="date" hide />
                    <YAxis stroke="#cbd5e1" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '11px' }}
                    />
                    <Line 
                      type="stepAfter" 
                      dataKey="balance" 
                      stroke="#4f46e5" 
                      strokeWidth={4} 
                      dot={false}
                      activeDot={{ r: 6, strokeWidth: 0, fill: '#4338ca' }}
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
    </div>
  );
}