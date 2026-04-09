import type { Route } from "./+types/applications";
import { useEffect, useState } from "react";
import { Link, useLoaderData, useNavigate } from "react-router";
import { Alert } from "~/components/Alert";
import { Modal } from "~/components/Modal";
import { StatusBadge } from "~/components/status-badge";
import { toApiUrl } from "~/utils/api-url";
import { requireAuth } from "~/utils/session.server";

type ApplicationStatus = "pending" | "accepted" | "rejected";

interface DriverApplication {
  ApplicationID: number;
  DriverID: string;
  ApplicationStatus: ApplicationStatus;
  DriverExplanation: string | null;
  TimeSubmitted: string | null;
  FirstName: string;
  LastName: string;
  LicenseNumber: string | null;
}

interface SponsorApplicationPermissions {
  canViewDriverApplications: boolean;
  canAcceptDriverApplications: boolean;
  canRejectDriverApplications: boolean;
}

interface ApplicationsLoaderData {
  applications: DriverApplication[];
  permissions: SponsorApplicationPermissions;
  userId: number;
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = requireAuth(request, ["sponsor"]);
  const res = await fetch(toApiUrl(`/api/sponsors/${user.UserID}/driver-applications`), {
    headers: { Cookie: request.headers.get("Cookie") ?? "" },
  });
  if (!res.ok) {
    let message = "Failed to load applications";
    try {
      const errorPayload = await res.json();
      if (typeof errorPayload?.error === "string" && errorPayload.error.trim()) {
        message = errorPayload.error;
      }
    } catch {
      // Fall back to default message if response is not JSON.
    }
    throw new Error(message);
  }

  const payload = await res.json();
  const applications = Array.isArray(payload?.applications) ? payload.applications : [];
  const permissions: SponsorApplicationPermissions = {
    canViewDriverApplications: Boolean(payload?.permissions?.canViewDriverApplications),
    canAcceptDriverApplications: Boolean(payload?.permissions?.canAcceptDriverApplications),
    canRejectDriverApplications: Boolean(payload?.permissions?.canRejectDriverApplications),
  };

  return { applications, permissions, userId: user.UserID };
}

export default function DriverApplications() {
  const { applications, permissions, userId } = useLoaderData() as ApplicationsLoaderData;
  const navigate = useNavigate();
  const [localApplications, setLocalApplications] = useState<DriverApplication[]>(applications);
  const [updatingAppId, setUpdatingAppId] = useState<number | null>(null);
  const [pendingDecision, setPendingDecision] = useState<{ appId: number; status: Exclude<ApplicationStatus, "pending">; driverName: string } | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setLocalApplications(applications);
  }, [applications]);

  useEffect(() => {
    if (!successMessage) return;
    const timeout = window.setTimeout(() => setSuccessMessage(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  const statusPriority: Record<string, number> = {
    pending: 0,
    accepted: 1,
    rejected: 1,
  };

  const sortedApplications = [...localApplications].sort((a, b) => {
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

  const beginDecision = (app: DriverApplication, status: Exclude<ApplicationStatus, "pending">) => {
    const canTakeAction = status === "accepted"
      ? permissions.canAcceptDriverApplications
      : permissions.canRejectDriverApplications;

    if (!canTakeAction || updatingAppId !== null) {
      return;
    }

    setDecisionNote("");
    setDecisionError(null);
    setBannerError(null);
    setPendingDecision({
      appId: app.ApplicationID,
      status,
      driverName: `${app.FirstName} ${app.LastName}`.trim(),
    });
  };

  const closeDecisionModal = () => {
    if (updatingAppId !== null) return;
    setPendingDecision(null);
    setDecisionNote("");
    setDecisionError(null);
  };

  const submitDecision = async () => {
    if (!pendingDecision) {
      return;
    }

    const reason = decisionNote.trim();
    if (!reason) {
      setDecisionError("A decision note is required.");
      return;
    }

    if (reason.length > 1000) {
      setDecisionError("Decision note must be 1000 characters or fewer.");
      return;
    }

    try {
      setUpdatingAppId(pendingDecision.appId);
      setDecisionError(null);
      setBannerError(null);

      const res = await fetch(toApiUrl(`/api/sponsors/${userId}/process-application`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: pendingDecision.appId,
          status: pendingDecision.status,
          explanation: reason
        }),
      });

      if (res.ok) {
        setLocalApplications((previous) =>
          previous.map((application) =>
            application.ApplicationID === pendingDecision.appId
              ? { ...application, ApplicationStatus: pendingDecision.status }
              : application
          )
        );

        setSuccessMessage(
          pendingDecision.status === "accepted"
            ? "Application accepted successfully."
            : "Application rejected successfully."
        );

        setPendingDecision(null);
        setDecisionNote("");
        navigate(".", { replace: true });
      } else {
        let message = "Failed to update application.";
        try {
          const errData = await res.json();
          if (typeof errData?.error === "string" && errData.error.trim()) {
            message = errData.error;
          }
        } catch {
          // Keep fallback message if response cannot be parsed.
        }

        setDecisionError(message);
      }
    } catch (err) {
      console.error("Connection error:", err);
      setBannerError("Could not connect to the server.");
    } finally {
      setUpdatingAppId(null);
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

        {bannerError && (
          <Alert
            variant="error"
            title="Unable to process request"
            message={bannerError}
            className="mb-4"
            onDismiss={() => setBannerError(null)}
          />
        )}

        {successMessage && (
          <Alert
            variant="success"
            title="Decision saved"
            message={successMessage}
            className="mb-4"
            onDismiss={() => setSuccessMessage(null)}
          />
        )}

        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-245">
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
                    <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed max-w-md wrap-break-word whitespace-pre-wrap">
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
                          {permissions.canAcceptDriverApplications && (
                            <button
                              onClick={() => beginDecision(app, 'accepted')}
                              disabled={updatingAppId !== null}
                              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-100 dark:shadow-black/30 transition-all active:scale-95"
                            >
                              Accept
                            </button>
                          )}
                          {permissions.canRejectDriverApplications && (
                            <button
                              onClick={() => beginDecision(app, 'rejected')}
                              disabled={updatingAppId !== null}
                              className="px-5 py-2 bg-rose-50 hover:bg-rose-100 disabled:opacity-60 disabled:cursor-not-allowed text-rose-600 text-sm font-bold rounded-xl transition-all active:scale-95 border border-rose-200 dark:bg-rose-900/20 dark:hover:bg-rose-900/40 dark:text-rose-200 dark:border-rose-800"
                            >
                              Reject
                            </button>
                          )}
                          {!permissions.canAcceptDriverApplications && !permissions.canRejectDriverApplications && (
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase">No decision permissions</p>
                          )}
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

      <Modal
        isOpen={Boolean(pendingDecision)}
        onClose={closeDecisionModal}
        title={pendingDecision?.status === 'accepted' ? 'Accept Application' : 'Reject Application'}
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={closeDecisionModal}
              disabled={updatingAppId !== null}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-60 disabled:cursor-not-allowed dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitDecision}
              disabled={updatingAppId !== null}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {updatingAppId !== null ? 'Saving...' : 'Submit Decision'}
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          {pendingDecision
            ? `Add a decision note for ${pendingDecision.driverName} before continuing.`
            : 'Add a decision note before continuing.'}
        </p>

        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2" htmlFor="decision-note">
          Decision Note
        </label>
        <textarea
          id="decision-note"
          value={decisionNote}
          onChange={(event) => setDecisionNote(event.target.value)}
          rows={5}
          maxLength={1000}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm text-slate-900 dark:text-slate-100"
          placeholder="Provide context for this decision"
        />
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{decisionNote.trim().length}/1000 characters</p>

        {decisionError && (
          <Alert
            variant="error"
            title="Decision failed"
            message={decisionError}
            className="mt-4"
            onDismiss={() => setDecisionError(null)}
          />
        )}
      </Modal>
    </div>
  );
}
