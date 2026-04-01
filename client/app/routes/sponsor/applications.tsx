import { useLoaderData, useNavigate } from "react-router";
import { StatusBadge } from "~/components/status-badge"; // Assuming you followed the shared component path
import { toApiUrl } from "~/utils/api-url";

export async function loader() {
  const res = await fetch(toApiUrl("/api/sponsors/driver-applications"));
  if (!res.ok) throw new Error("Failed to load applications");
  return await res.json();
}

export default function DriverApplications() {
  const applications = useLoaderData() as any[];
  const navigate = useNavigate();

  const handleDecision = async (appId: number, status: 'accepted' | 'rejected') => {
    const reason = window.prompt(`Provide a reason for being ${status}:`, "");
    
    // If user clicks "Cancel" on the prompt, stop the function
    if (reason === null) return;

    try {
      const res = await fetch(toApiUrl("/api/sponsors/process-application"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: appId,
          status: status,
          explanation: reason
        }),
      });

      if (res.ok) {
        // Refresh the loader data to show the new status
        navigate(".", { replace: true });
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to update application.");
      }
    } catch (err) {
      console.error("Connection error:", err);
      alert("Could not connect to the server.");
    }
  };

  return (
    <div className="p-8 bg-[#0f172a] min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">Review Driver Applications</h1>
        
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="p-6 text-xs font-black text-slate-400 uppercase tracking-widest">Driver Details</th>
                <th className="p-6 text-xs font-black text-slate-400 uppercase tracking-widest">Submitted</th>
                <th className="p-6 text-xs font-black text-slate-400 uppercase tracking-widest">Current Status</th>
                <th className="p-6 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {applications.map((app) => (
                <tr key={app.ApplicationID} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-6">
                    <div className="font-bold text-slate-900 text-lg leading-tight">
                      {app.FirstName} {app.LastName}
                    </div>
                    <div className="text-sm text-slate-400 font-medium">ID: {app.DriverID}</div>
                    <div className="text-xs text-indigo-600 font-mono mt-1">License: {app.LicenseNumber || "N/A"}</div>
                  </td>
                  
                  <td className="p-6 text-slate-500 text-sm font-medium">
                    {app.TimeSubmitted ? new Date(app.TimeSubmitted).toLocaleDateString() : "N/A"}
                  </td>

                  <td className="p-6">
                    <StatusBadge status={app.ApplicationStatus} />
                  </td>

                  <td className="p-6">
                    <div className="flex justify-end gap-3">
                      {app.ApplicationStatus === 'pending' ? (
                        <>
                          <button
                            onClick={() => handleDecision(app.ApplicationID, 'accepted')}
                            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-100 transition-all active:scale-95"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleDecision(app.ApplicationID, 'rejected')}
                            className="px-5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 text-sm font-bold rounded-xl transition-all active:scale-95 border border-rose-200"
                          >
                            Reject
                          </button>
                        </>
                      ) : (
                        <div className="text-right">
                           <p className="text-xs font-bold text-slate-300 uppercase italic">Decision Logged</p>
                           <p className="text-[10px] text-slate-400 max-w-[150px] truncate">{app.DecisionExplanation}</p>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {applications.length === 0 && (
            <div className="p-24 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4 text-slate-400 text-2xl">
                
              </div>
              <p className="text-slate-500 font-medium">No applications waiting for review.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}