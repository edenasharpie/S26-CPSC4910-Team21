import type { Route } from "./+types/applications";
import { useEffect, useMemo, useState } from "react";
import { Link, useLoaderData, useRevalidator } from "react-router";
import { StatusBadge } from "~/components/status-badge";
import { toApiUrl } from "~/utils/api-url";
import { requireAuth } from "~/utils/session.server";

type ApplicationStatus = "pending" | "accepted" | "rejected";

interface DriverApplication {
  ApplicationID: number;
  DriverID: string;
  ApplicationStatus: ApplicationStatus;
  DriverExplanation?: string | null;
  TimeSubmitted?: string | null;
  UserID?: number | string | null;
  FirstName?: string | null;
  LastName?: string | null;
  LicenseNumber?: string | null;
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAuth(request, ["sponsor"]);
  const res = await fetch(toApiUrl(`/api/sponsors/${user.UserID}/driver-applications`), {
    headers: { Cookie: request.headers.get("Cookie") ?? "" },
  });
  if (!res.ok) throw new Error("Failed to load applications");
  const applications = await res.json();
  return { applications, userId: user.UserID };
}

export default function DriverApplications() {
  const { applications, userId } = useLoaderData() as { applications: DriverApplication[]; userId: number };
  const { revalidate } = useRevalidator();
  const [applicationRows, setApplicationRows] = useState<DriverApplication[]>(applications);

  useEffect(() => {
    setApplicationRows(applications);
  }, [applications]);

  const statusPriority: Record<string, number> = {
    accepted: 0,
    rejected: 0,
    pending: 1,
  };

  const acceptedCount = applicationRows.filter((app) => app.ApplicationStatus === "accepted").length;
  const rejectedCount = applicationRows.filter((app) => app.ApplicationStatus === "rejected").length;
  const pendingCount = applicationRows.filter((app) => app.ApplicationStatus === "pending").length;

  const sortedApplications = useMemo(() => {
    return [...applicationRows].sort((a, b) => {
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
  }, [applicationRows]);

  const getNotes = (app: DriverApplication) => {
    const raw = typeof app.DriverExplanation === "string" ? app.DriverExplanation.trim() : "";
    return raw || "No notes provided.";
  };

  const handleDecision = async (
    app: DriverApplication,
    status: ApplicationStatus,
  ) => {
    const defaultNotes = typeof app.DriverExplanation === "string" ? app.DriverExplanation : "";
    const notes = window.prompt(`Add notes for marking this application as ${status}:`, defaultNotes);

    // If user clicks "Cancel" on the prompt, stop the function
    if (notes === null) return;

    const changingDecision = app.ApplicationStatus !== status;
    if (changingDecision) {
      const confirmed = window.confirm(
        `Change status from ${app.ApplicationStatus} to ${status}?`,
      );
      if (!confirmed) return;
    }

    try {
      const res = await fetch(toApiUrl(`/api/sponsors/${userId}/process-application`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: app.ApplicationID,
          status,
          explanation:
            notes.trim().length > 0
              ? notes
              : `Status changed to ${status}`.slice(0, 45),
        }),
      });

      if (res.ok) {
        const payload = await res.json().catch(() => ({}));
        if (payload?.updateVerified !== true) {
          alert("Update was not verified by the server. Please try again.");
          return;
        }

        const updated = payload?.application;

        if (updated && updated.ApplicationID) {
          setApplicationRows((prev) =>
            prev.map((row) =>
              row.ApplicationID === Number(updated.ApplicationID)
                ? {
                    ...row,
                    ApplicationStatus: String(updated.ApplicationStatus ?? row.ApplicationStatus) as ApplicationStatus,
                    DriverExplanation:
                      typeof updated.DecisionExplanation === "string"
                        ? updated.DecisionExplanation
                        : row.DriverExplanation,
                  }
                : row,
            ),
          );
        }

        revalidate();
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
    <div className="min-h-screen bg-linear-to-b from-blue-50 to-blue-100/50 dark:from-[#1e4b8f] dark:to-[#163a6f] p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4">
          <Link
            to="/sponsor/dashboard"
            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline block mb-2"
          >
            ← Return to Sponsor Dashboard
          </Link>
        </div>

        <div className="mb-8 text-left border-b pb-6 dark:border-gray-800">
          <h1 className="text-3xl font-bold mb-1 text-gray-900 dark:text-gray-100">Review Driver Applications</h1>
          <p className="text-gray-500">Review pending applications and update prior decisions when needed.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4">
            <p className="text-xs uppercase text-gray-500 font-semibold">Total</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{applicationRows.length}</p>
          </div>
          <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4">
            <p className="text-xs uppercase text-gray-500 font-semibold">Pending</p>
            <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
          </div>
          <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4">
            <p className="text-xs uppercase text-gray-500 font-semibold">Accepted</p>
            <p className="text-2xl font-bold text-emerald-600">{acceptedCount}</p>
          </div>
          <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4">
            <p className="text-xs uppercase text-gray-500 font-semibold">Rejected</p>
            <p className="text-2xl font-bold text-rose-600">{rejectedCount}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm overflow-hidden border border-gray-200 dark:border-gray-800">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1240px]">
            <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
              <tr>
                <th className="w-[24%] p-4 text-xs font-black text-gray-500 dark:text-gray-300 uppercase tracking-widest">Driver</th>
                <th className="w-[18%] p-4 text-xs font-black text-gray-500 dark:text-gray-300 uppercase tracking-widest">Submitted</th>
                <th className="w-[12%] p-4 text-xs font-black text-gray-500 dark:text-gray-300 uppercase tracking-widest">Status</th>
                <th className="w-[20%] p-4 text-xs font-black text-gray-500 dark:text-gray-300 uppercase tracking-widest">Actions</th>
                <th className="w-[26%] min-w-[320px] p-4 text-xs font-black text-gray-500 dark:text-gray-300 uppercase tracking-widest">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {sortedApplications.map((app) => (
                <tr key={app.ApplicationID} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors align-top">
                  <td className="p-4">
                    <div className="font-semibold text-gray-900 dark:text-gray-100 leading-tight">
                      {app.FirstName} {app.LastName}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">User ID: {app.UserID ?? "N/A"}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1">License: {app.LicenseNumber || "N/A"}</div>
                  </td>

                  <td className="p-4 text-sm text-gray-700 dark:text-gray-300">
                    {app.TimeSubmitted
                      ? new Date(app.TimeSubmitted).toLocaleString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "N/A"}
                  </td>

                  <td className="p-4">
                    <StatusBadge status={app.ApplicationStatus} />
                  </td>

                  <td className="p-4">
                    <select
                      aria-label="Application action"
                      defaultValue=""
                      onChange={(event) => {
                        const nextStatus = event.target.value as ApplicationStatus | "";
                        event.target.value = "";
                        if (!nextStatus) return;
                        handleDecision(app, nextStatus);
                      }}
                      className="w-36 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-100 shadow-sm outline-none transition-colors hover:border-gray-300 dark:hover:border-gray-500"
                    >
                      <option value="" disabled>
                        Select action
                      </option>
                      <option value="accepted">Accept</option>
                      <option value="rejected">Reject</option>
                      <option value="pending">Reset Pending</option>
                    </select>
                  </td>

                  <td className="p-4 align-top min-w-[320px]">
                    <p className="text-sm text-gray-700 dark:text-gray-200 leading-6 whitespace-pre-line break-normal">
                      {getNotes(app)}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {sortedApplications.length === 0 && (
            <div className="p-12 text-center text-gray-500 italic">
              No applications available.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
