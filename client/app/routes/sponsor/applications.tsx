import type { Route } from "./+types/applications";
import { useEffect, useMemo, useState } from "react";
import { Link, useLoaderData } from "react-router";
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
  DriverExplanation?: string | null;
  TimeSubmitted?: string | null;
  UserID?: number | string | null;
  FirstName?: string | null;
  LastName?: string | null;
  LicenseNumber?: string | null;
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
  const user = await requireAuth(request, ["sponsor"]);
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
  const [localApplications, setLocalApplications] = useState<DriverApplication[]>(applications);
  const [updatingAppId, setUpdatingAppId] = useState<number | null>(null);
  const [pendingDecision, setPendingDecision] = useState<{
    appId: number;
    status: Exclude<ApplicationStatus, "pending">;
    driverName: string;
  } | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setLocalApplications(applications);
  }, [applications]);

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timeout = window.setTimeout(() => setSuccessMessage(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  const statusPriority: Record<string, number> = {
    pending: 0,
    accepted: 1,
    rejected: 1,
  };

  const acceptedCount = localApplications.filter((app) => app.ApplicationStatus === "accepted").length;
  const rejectedCount = localApplications.filter((app) => app.ApplicationStatus === "rejected").length;
  const pendingCount = localApplications.filter((app) => app.ApplicationStatus === "pending").length;

  const sortedApplications = useMemo(() => {
    return [...localApplications].sort((a, b) => {
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
  }, [localApplications]);

  const getNotes = (app: DriverApplication) => {
    const raw = typeof app.DriverExplanation === "string" ? app.DriverExplanation.trim() : "";
    return raw || "No notes provided.";
  };

  const formatSubmitted = (submitted: string | null | undefined) => {
    if (!submitted) {
      return "N/A";
    }

    return new Date(submitted).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const beginDecision = (app: DriverApplication, status: Exclude<ApplicationStatus, "pending">) => {
    const canTakeAction =
      status === "accepted"
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
      driverName: `${app.FirstName ?? ""} ${app.LastName ?? ""}`.trim() || "this driver",
    });
  };

  const closeDecisionModal = () => {
    if (updatingAppId !== null) {
      return;
    }
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
          explanation: reason,
        }),
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message =
          typeof payload?.error === "string" && payload.error.trim()
            ? payload.error
            : "Failed to update application.";
        setDecisionError(message);
        return;
      }

      if (payload?.updateVerified !== true) {
        setDecisionError("Update was not verified by the server. Please try again.");
        return;
      }

      const updated = payload?.application;
      const updatedId = Number(updated?.ApplicationID);
      if (!Number.isFinite(updatedId)) {
        setDecisionError("Server response was missing the updated application.");
        return;
      }

      setLocalApplications((previous) =>
        previous.map((application) => {
          if (application.ApplicationID !== updatedId) {
            return application;
          }

          const nextStatusRaw = String(updated?.ApplicationStatus ?? pendingDecision.status).toLowerCase();
          const nextStatus: ApplicationStatus =
            nextStatusRaw === "accepted" || nextStatusRaw === "rejected" || nextStatusRaw === "pending"
              ? (nextStatusRaw as ApplicationStatus)
              : pendingDecision.status;

          return {
            ...application,
            ApplicationStatus: nextStatus,
            DriverExplanation:
              typeof updated?.DecisionExplanation === "string"
                ? updated.DecisionExplanation
                : application.DriverExplanation,
          };
        }),
      );

      setSuccessMessage(
        payload?.noteTruncated
          ? "Decision saved. Note was truncated to fit the current database limit."
          : pendingDecision.status === "accepted"
            ? "Application accepted successfully."
            : "Application rejected successfully.",
      );

      setPendingDecision(null);
      setDecisionNote("");
    } catch (err) {
      console.error("Connection error:", err);
      setBannerError("Could not connect to the server.");
    } finally {
      setUpdatingAppId(null);
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

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4">
            <p className="text-xs uppercase text-gray-500 font-semibold">Total</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{localApplications.length}</p>
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

        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1240px]">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
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
                        {app.FirstName ?? "N/A"} {app.LastName ?? ""}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">User ID: {app.UserID ?? "N/A"}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1">License: {app.LicenseNumber || "N/A"}</div>
                    </td>

                    <td className="p-4 text-sm text-gray-700 dark:text-gray-300">
                      {formatSubmitted(app.TimeSubmitted)}
                    </td>

                    <td className="p-4">
                      <StatusBadge status={app.ApplicationStatus} />
                    </td>

                    <td className="p-4">
                      <div className="flex justify-end gap-3">
                        {app.ApplicationStatus === "pending" ? (
                          <>
                            {permissions.canAcceptDriverApplications && (
                              <button
                                type="button"
                                onClick={() => beginDecision(app, "accepted")}
                                disabled={updatingAppId !== null}
                                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-100 dark:shadow-black/30 transition-all active:scale-95"
                              >
                                Accept
                              </button>
                            )}
                            {permissions.canRejectDriverApplications && (
                              <button
                                type="button"
                                onClick={() => beginDecision(app, "rejected")}
                                disabled={updatingAppId !== null}
                                className="px-5 py-2 bg-rose-50 hover:bg-rose-100 disabled:opacity-60 disabled:cursor-not-allowed text-rose-600 text-sm font-bold rounded-xl transition-all active:scale-95 border border-rose-200 dark:bg-rose-900/20 dark:hover:bg-rose-900/40 dark:text-rose-200 dark:border-rose-800"
                              >
                                Reject
                              </button>
                            )}
                            {!permissions.canAcceptDriverApplications && !permissions.canRejectDriverApplications && (
                              <p className="text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase">
                                No decision permissions
                              </p>
                            )}
                          </>
                        ) : (
                          <div className="text-right">
                            <p className="text-xs font-bold text-slate-500 dark:text-slate-300 uppercase">Decision Logged</p>
                          </div>
                        )}
                      </div>
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
            <div className="p-12 text-center text-gray-500 italic">No applications available.</div>
          )}
        </div>
      </div>

      <Modal
        isOpen={Boolean(pendingDecision)}
        onClose={closeDecisionModal}
        title={pendingDecision?.status === "accepted" ? "Accept Application" : "Reject Application"}
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
              {updatingAppId !== null ? "Saving..." : "Submit Decision"}
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          {pendingDecision
            ? `Add a decision note for ${pendingDecision.driverName} before continuing.`
            : "Add a decision note before continuing."}
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