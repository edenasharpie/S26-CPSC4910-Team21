import type { Route } from "./+types/apply";
import { useState } from "react";
import { Link, useLoaderData, useRevalidator } from "react-router";
import { toApiUrl } from "~/utils/api-url";
import { requireAuth } from "~/utils/session.server";

type SponsorCompany = { id: string | number; companyName: string };
type DriverApplication = {
  ApplicationID: number;
  SponsorCompanyID: number;
  SponsorName?: string;
  ApplicationStatus: string;
  DecisionExplanation?: string;
  TimeSubmitted: string;
};

// 1. Updated loader with more flexible data extraction
export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireAuth(request, ["driver", "admin"]);

  try {
    const [sponsorsRes, applicationsRes] = await Promise.all([
      fetch(toApiUrl("/api/sponsors")),
      fetch(toApiUrl(`/api/user/my-applications/${session.UserID}`)),
    ]);

    const sponsorsData = await sponsorsRes.json();
    const applicationsData = applicationsRes.ok ? await applicationsRes.json() : [];
    
    // Check if data is directly an array, or nested under 'sponsors' or 'rows'
    const sponsors = Array.isArray(sponsorsData)
      ? sponsorsData
      : sponsorsData.sponsors || sponsorsData.rows || [];

    const sponsorCompanies: SponsorCompany[] = sponsors.map((sponsor: any) => ({
      id: sponsor.id ?? sponsor.SponsorCompanyID ?? sponsor.sponsorCompanyId,
      companyName: sponsor.companyName ?? sponsor.CompanyName ?? sponsor.company_name,
    }));

    const applications: DriverApplication[] = Array.isArray(applicationsData) ? applicationsData : [];

    return {
      userId: session.UserID,
      sponsors: sponsorCompanies,
      applications,
    };
  } catch (error) {
    console.error("Failed to fetch sponsors:", error);
    return { userId: session.UserID, sponsors: [], applications: [] };
  }
}

// 2. The form component
export function DriverApplicationForm({ 
  driverId, 
  sponsors,
  onSubmitted,
}: { 
  driverId: string; 
  sponsors: SponsorCompany[];
  onSubmitted?: () => void;
}) {
  const [sponsorId, setSponsorId] = useState("");
  const [explanation, setExplanation] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(toApiUrl("/api/user/submit-application"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverId: driverId,
          sponsorCompanyId: sponsorId,
          explanation: explanation,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage(`Success!  Application ID: ${data.applicationId}. Your application is now pending.`);
        setExplanation("");
        setSponsorId("");
        onSubmitted?.();
      } else {
        setMessage(data.error || "Submission failed.");
      }
    } catch (error) {
      console.error("Application submit error:", error);
      setMessage("Could not submit application. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl dark:shadow-slate-950/40 border border-slate-100 dark:border-slate-800 w-full">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-6">Apply to a Sponsor</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6 text-left">
        <div>
          <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 uppercase mb-2">Select Sponsor Company</label>
          <div className="relative">
            <select 
              required
              value={sponsorId}
              onChange={(e) => setSponsorId(e.target.value)}
              className="w-full p-4 pr-12 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-2 border-slate-100 dark:border-slate-700 rounded-2xl focus:border-blue-500 dark:focus:border-blue-400 outline-none appearance-none"
            >
              <option value="" disabled>Select a company...</option>
              {sponsors.length > 0 ? (
                sponsors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.companyName}
                  </option>
                ))
              ) : (
                <option disabled>No sponsors available</option>
              )}
            </select>
            <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-slate-500 dark:text-slate-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 uppercase mb-2">Why should we accept you?</label>
          <textarea
            required
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            className="w-full p-4 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-2 border-slate-100 dark:border-slate-700 rounded-2xl h-40 focus:border-blue-500 dark:focus:border-blue-400 outline-none"
            placeholder="Provide a brief explanation for your application..."
          />
        </div>

        <button 
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 text-white font-bold py-4 rounded-2xl transition-all disabled:opacity-50 shadow-lg shadow-blue-100 dark:shadow-blue-950/40"
        >
          {loading ? "Sending..." : "Submit Application"}
        </button>

        {message && (
          <p className={`text-center font-bold mt-4 ${message.includes("Success") ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
            {message}
          </p>
        )}
      </form>
    </div>
  );
}

function ApplicationsList({ applications }: { applications: DriverApplication[] }) {
  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-xl dark:shadow-slate-950/40 border border-slate-100 dark:border-slate-800 w-full">
      <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">Sponsor Applications</h3>

      {applications.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 px-5 py-10 text-center text-slate-500 dark:text-slate-400">
          No applications yet.
        </div>
      ) : (
        <div className="space-y-3 max-h-[560px] overflow-auto pr-1">
          {applications.map((app) => {
            const submittedAt = new Date(app.TimeSubmitted);
            return (
              <div
                key={app.ApplicationID}
                className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <p className="font-bold text-slate-900 dark:text-slate-100">
                    {app.SponsorName || `Company #${app.SponsorCompanyID}`}
                  </p>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {app.ApplicationStatus}
                  </span>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <div>
                    <p>
                      <span className="font-semibold">Date:</span> {submittedAt.toLocaleDateString()}
                    </p>
                    <p className="mt-1 text-slate-700 dark:text-slate-200">
                      <span className="font-semibold">Reason:</span> {app.DecisionExplanation || "No reason provided."}
                    </p>
                  </div>
                  <div>
                    <p>
                      <span className="font-semibold">Time:</span> {submittedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </p>
                    <p className="mt-1">
                      <span className="font-semibold">Application ID:</span> {app.ApplicationID}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ApplyPage() {
  const { userId, sponsors, applications } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  
  return (
    <div className="min-h-screen bg-linear-to-b from-blue-50 to-blue-100/50 dark:from-[#1e4b8f] dark:to-[#163a6f] p-4 md:p-6">
      <div className="max-w-7xl mx-auto pt-2">
        <Link
          to="/driver/dashboard"
          className="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          &larr; Back to Dashboard
        </Link>
      </div>

      <div className="max-w-7xl mx-auto mt-6 grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-5">
          <DriverApplicationForm
            driverId={String(userId)}
            sponsors={sponsors}
            onSubmitted={() => revalidator.revalidate()}
          />
        </div>
        <div className="xl:col-span-7">
          <ApplicationsList applications={applications} />
        </div>
      </div>
    </div>
  );
}