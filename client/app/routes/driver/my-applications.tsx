import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { toApiUrl } from "~/utils/api-url";
import { requireAuth } from "~/utils/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // 1. Get the authenticated user session
  // requireAuth likely returns the user object stored in the cookie
  const user = await requireAuth(request, ["driver"]);
  
  // 2. Use the authenticated user id; server resolves it to LicenseNumber.
  const driverId = user.UserID;

  const res = await fetch(toApiUrl(`/api/user/my-applications/${driverId}`));
  if (!res.ok) throw new Error("Could not load applications");
  
  return await res.json();
}

export default function MyApplications() {
  const applications = useLoaderData() as any[];

  const statusColors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700 border-amber-200",
    accepted: "bg-green-100 text-green-700 border-green-200",
    rejected: "bg-red-100 text-red-700 border-red-200",
    cancelled: "bg-slate-100 text-slate-700 border-slate-200",
  };

  return (
    <div className="p-8 max-w-5xl mx-auto min-h-screen">
      <header className="mb-10">
        <Link to="/" className="inline-flex items-center text-sm font-medium text-blue-600 hover:underline mb-3">
          &larr; Home
        </Link>
        <h1 className="text-3xl font-bold text-slate-900">Your Applications</h1>
        <p className="text-slate-500">Track your status with sponsor companies.</p>
      </header>
      
      <div className="space-y-4">
        {applications.map((app) => (
          <div key={app.ApplicationID} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1">
              <h3 className="text-xl font-bold text-slate-800">{app.SponsorName}</h3>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs font-medium text-slate-400">ID: {app.SponsorCompanyID}</span>
                <span className="text-slate-300">•</span>
                <span className="text-xs font-medium text-slate-400">
                  Sent {new Date(app.TimeSubmitted).toLocaleDateString()}
                </span>
              </div>
            </div>

            <div className="bg-slate-50 px-4 py-2 rounded-xl flex-1 max-w-xs">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Sponsor Feedback</p>
              <p className="text-sm text-slate-600 truncate">
                {app.DecisionExplanation || "Awaiting review..."}
              </p>
            </div>

            <div className={`px-4 py-2 rounded-full text-xs font-bold uppercase text-center min-w-[120px] border ${statusColors[app.ApplicationStatus]}`}>
              {app.ApplicationStatus}
            </div>
          </div>
        ))}

        {applications.length === 0 && (
          <div className="text-center py-20 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
            <p className="text-slate-400 font-medium">No applications found. Ready to join a team?</p>
          </div>
        )}
      </div>
    </div>
  );
}