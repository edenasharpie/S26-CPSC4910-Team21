import type { Route } from "./+types/applications";
import { Link, useLoaderData, useNavigate } from "react-router";
import { StatusBadge } from "~/components/status-badge";
import { toApiUrl } from "~/utils/api-url";
import { requireAuth } from "~/utils/session.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = requireAuth(request, ["sponsor"]);
  const res = await fetch(toApiUrl(`/api/sponsors/${user.UserID}/driver-applications`), {
    headers: { Cookie: request.headers.get("Cookie") ?? "" },
  });
  if (!res.ok) throw new Error("Failed to load applications");
  const applications = await res.json();
  return { applications, userId: user.UserID };
}

export default function DriverApplications() {
  const { applications, userId } = useLoaderData() as { applications: any[]; userId: number };
  const navigate = useNavigate();

  const statusPriority: Record<string, number> = {
    accepted: 0,
    rejected: 0,
    pending: 1,
  };

  const sortedApplications = [...applications].sort((a, b) => {
    const aStatus = String(a?.ApplicationStatus ?? "pending").toLowerCase();
    const bStatus = String(b?.ApplicationStatus ?? "pending").toLowerCase();

    const aPriority = statusPriority[aStatus] ?? 2;
    const bPriority = statusPriority[bStatus] ?? 2;

    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    const aTime = new Date(a?.TimeSubmitted ?? 0).getTime();
    const bTime = new Date(b?.TimeSubmitted ?? 0).getTime();
    return bTime - aTime;
  });

  const getDriverReason = (app: any) => {
    const raw = typeof app.DriverExplanation === "string" ? app.DriverExplanation.trim() : "";
    return raw || "No reason provided.";
  };

  const handleDecision = async (appId: number, status: 'accepted' | 'rejected') => {
    const reason = window.prompt(`Provide a reason for being ${status}:`, "");

    // If user clicks "Cancel" on the prompt, stop the function
    if (reason === null) return;

    try {
      const res = await fetch(toApiUrl(`/api/sponsors/${userId}/process-application`), {
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
    <div className="min-h-screen w-full bg-linear-to-b from-blue-50 to-blue-100/50 dark:from-[#1e4b8f] dark:to-[#163a6f] px-4 py-8 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <Link
            to="/sponsor/dashboard"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur hover:bg-white dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:bg-slate-900"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.56l3.22 3.22a.75.75 0 1 1-1.06 1.06l-4.5-4.5a.75.75 0 0 1 0-1.06l4.5-4.5a.75.75 0 0 1 1.06 1.06L5.56 9.25h10.69A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
            </svg>
            Back to Sponsor Dashboard
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-6">Review Driver Applications</h1>

        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[980px]">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-6 text-xs font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest">Driver Details</th>
                <th className="p-6 text-xs font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest">Driver Reason</th>
                <th className="p-6 text-xs font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest">Submitted</th>
                <th className="p-6 text-xs font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest">Current Status</th>
                <th className="p-6 text-xs font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sortedApplications.map((app) => (
                <tr key={app.ApplicationID} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="p-6">
                    <div className="font-bold text-slate-900 dark:text-slate-100 text-lg leading-tight">
                      {app.FirstName} {app.LastName}
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400 font-medium">ID: {app.DriverID}</div>
                    <div className="text-xs text-indigo-600 font-mono mt-1">License: {app.LicenseNumber || "N/A"}</div>
                  </td>

                  <td className="p-6 align-top">
                    <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed max-w-md break-words whitespace-pre-wrap">
                      {getDriverReason(app)}
                    </p>
                  </td>

                  <td className="p-6 text-slate-600 dark:text-slate-300 text-sm font-medium">
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
                            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-100 dark:shadow-black/30 transition-all active:scale-95"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleDecision(app.ApplicationID, 'rejected')}
                            className="px-5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 text-sm font-bold rounded-xl transition-all active:scale-95 border border-rose-200 dark:bg-rose-900/20 dark:hover:bg-rose-900/40 dark:text-rose-200 dark:border-rose-800"
                          >
                            Reject
                          </button>
                        </>
                      ) : (
                        <div className="text-right">
                           <p className="text-xs font-bold text-slate-500 dark:text-slate-300 uppercase">Decision Logged</p>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {sortedApplications.length === 0 && (
            <div className="p-24 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-4 text-slate-400 text-2xl">

              </div>
              <p className="text-slate-500 dark:text-slate-300 font-medium">No applications waiting for review.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
