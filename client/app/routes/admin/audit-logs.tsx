import type { Route } from "./+types/audit-logs";
import { useMemo, useState } from "react";
import { Link, useLoaderData, Form } from "react-router";
import { Table, Button, Badge, Modal } from "~/components";
import { requireAuth } from "~/utils/session.server";
import { getApiBaseUrl } from "~/utils/api-url";

const API_URL = getApiBaseUrl();

// Mirrors the EVENTS table joined with USERS.Username
interface AuditLogEntry {
  EventID: number;
  UserID: number;
  Username: string | null;
  Timestamp: string;
  EventType: string;
  Properties: Record<string, any>;
}

interface AdminUserOption {
  UserID: number;
  Username: string;
  FirstName?: string;
  LastName?: string;
  UserType: string;
}

type UserScopeFilter = "" | "admin" | "driver" | "sponsor";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request, ["admin"]);

  const url = new URL(request.url);
  const rawFilterParams = url.searchParams.getAll("filter");
  const filters = rawFilterParams
    .flatMap((value) => value.split(","))
    .map((f) => f.trim())
    .filter(Boolean);
  const startDate = url.searchParams.get("startDate")?.trim();
  const endDate = url.searchParams.get("endDate")?.trim();
  const targetUserId = url.searchParams.get("targetUserId")?.trim();
  const rawTargetUserType = url.searchParams.get("targetUserType")?.trim().toLowerCase();
  const targetUserType: UserScopeFilter =
    rawTargetUserType === "admin" || rawTargetUserType === "driver" || rawTargetUserType === "sponsor"
      ? rawTargetUserType
      : "";

  try {
    const params = new URLSearchParams();
    for (const filter of filters) {
      params.append("filter", filter);
    }
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (targetUserId) params.set("targetUserId", targetUserId);

    if (targetUserType) params.set("targetUserType", targetUserType);

    const cookieHeader = request.headers.get("Cookie") ?? "";
    const [logsRes, usersRes] = await Promise.all([
      fetch(`${API_URL}/api/admin/audit-logs?${params}`, {
        headers: { Cookie: cookieHeader },
      }),
      fetch(`${API_URL}/api/admin/users?limit=100&offset=0`, {
        headers: { Cookie: cookieHeader },
      }),
    ]);

    if (!logsRes.ok) throw new Error(`API returned ${logsRes.status}`);
    const logs: AuditLogEntry[] = await logsRes.json();

    let users: AdminUserOption[] = [];
    if (usersRes.ok) {
      const payload = await usersRes.json();
      const rawUsers = Array.isArray(payload?.users) ? payload.users : [];
      users = rawUsers.map((user: any) => ({
        UserID: Number(user.UserID),
        Username: String(user.Username ?? ""),
        FirstName: user.FirstName ?? "",
        LastName: user.LastName ?? "",
        UserType: String(user.UserType ?? "").toLowerCase(),
      }));
    }

    return {
      logs,
      users,
      selectedFilters: filters,
      selectedTargetUserId: targetUserId ?? "",
      selectedTargetUserType: targetUserType,
      error: null,
    };
  } catch (error: any) {
    console.error("Audit logs fetch error:", error);
    return {
      logs: [] as AuditLogEntry[],
      users: [] as AdminUserOption[],
      selectedFilters: filters,
      selectedTargetUserId: targetUserId ?? "",
      selectedTargetUserType: targetUserType,
      error: error.message as string,
    };
  }
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "Audit Logs | Admin" }];
}

/** Derive a human-readable status string from the Properties JSON blob. */
function deriveStatus(entry: AuditLogEntry): string {
  const p = entry.Properties ?? {};
  if (typeof p.success === "boolean") return p.success ? "Success" : "Failure";
  if (p.status) return String(p.status);
  return "—";
}

export default function AuditLogs() {
  const {
    logs,
    users,
    selectedFilters,
    selectedTargetUserId,
    selectedTargetUserType,
    error,
  } = useLoaderData<typeof loader>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userScope, setUserScope] = useState<UserScopeFilter>(selectedTargetUserType);
  const [specificUserId, setSpecificUserId] = useState<string>(selectedTargetUserId);

  const filteredLogs = useMemo(() => {
    const selectedUserIdNumber = Number.parseInt(selectedTargetUserId, 10);
    const hasSpecificUserFilter = Number.isInteger(selectedUserIdNumber) && selectedUserIdNumber > 0;
    const selectedEventTypes = new Set(selectedFilters);
    const hasEventTypeFilter = selectedEventTypes.size > 0;

    const userTypeById = new Map<number, string>();
    for (const user of users) {
      userTypeById.set(Number(user.UserID), String(user.UserType ?? "").toLowerCase());
    }

    return logs.filter((log) => {
      if (hasEventTypeFilter && !selectedEventTypes.has(log.EventType)) {
        return false;
      }

      if (hasSpecificUserFilter && Number(log.UserID) !== selectedUserIdNumber) {
        return false;
      }

      if (selectedTargetUserType) {
        const userType = userTypeById.get(Number(log.UserID));
        if (!userType || userType !== selectedTargetUserType) {
          return false;
        }
      }

      return true;
    });
  }, [logs, users, selectedFilters, selectedTargetUserId, selectedTargetUserType]);

  const usersForScope = users
    .filter((user) => !userScope || user.UserType === userScope)
    .sort((a, b) => {
      const aName = `${a.LastName ?? ""} ${a.FirstName ?? ""} ${a.Username}`.trim().toLowerCase();
      const bName = `${b.LastName ?? ""} ${b.FirstName ?? ""} ${b.Username}`.trim().toLowerCase();
      return aName.localeCompare(bName);
    });

  const formatTimestamp = (ts: string) =>
    new Date(ts).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "success":
        return <Badge variant="success">Success</Badge>;
      case "failure":
        return <Badge variant="danger">Failure</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  const getEventTypeBadge = (eventType: string) => {
    const map: Record<
      string,
      { label: string; variant: "info" | "warning" | "success" | "danger" | "default" }
    > = {
      LoginAttempt:            { label: "Login Attempt",          variant: "info" },
      PasswordChange:          { label: "Password Change",        variant: "warning" },
      AccountUpdate:           { label: "Account Update",         variant: "default" },
      AccountStatusChange:     { label: "Account Status Change",  variant: "warning" },
      ApplicationStatusUpdate: { label: "Application Update",     variant: "success" },
      ReviewModerationEvent:   { label: "Review Moderation",      variant: "danger" },
      Notification:            { label: "Notification",           variant: "default" },
      PointTransaction:        { label: "Point Transaction",      variant: "info" },
    };
    const entry = map[eventType];
    return entry
      ? <Badge variant={entry.variant}>{entry.label}</Badge>
      : <Badge variant="default">{eventType}</Badge>;
  };

  const downloadCSV = () => {
    const headers = ["Timestamp", "Event Type", "Username", "Status"].join(",");
    const rows = filteredLogs
      .map(
        (log) =>
          `"${log.Timestamp}","${log.EventType}","${log.Username ?? "Unknown"}","${deriveStatus(log)}"`
      )
      .join("\n");
    const blob = new Blob([headers + "\n" + rows], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-report-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const columns = [
    {
      key: "Timestamp",
      header: "Timestamp",
      render: (log: AuditLogEntry) => (
        <span className="text-sm font-mono">{formatTimestamp(log.Timestamp)}</span>
      ),
    },
    {
      key: "EventType",
      header: "Event Type",
      render: (log: AuditLogEntry) => getEventTypeBadge(log.EventType),
    },
    {
      key: "Username",
      header: "Username",
      render: (log: AuditLogEntry) => (
        <span className="font-medium text-gray-700 dark:text-gray-300">
          {log.Username ?? "Unknown"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (log: AuditLogEntry) => getStatusBadge(deriveStatus(log)),
    },
  ];

  const totalEvents = filteredLogs.length;
  const securityEvents = filteredLogs.filter((l) =>
    ["LoginAttempt", "PasswordChange", "AccountStatusChange"].includes(l.EventType)
  ).length;
  const appSubmissions = filteredLogs.filter(
    (l) => l.EventType === "ApplicationStatusUpdate"
  ).length;

  const EVENT_TYPE_FILTERS = [
    { label: "Login Attempts",          value: "LoginAttempt" },
    { label: "Password Changes",        value: "PasswordChange" },
    { label: "Account Updates",         value: "AccountUpdate" },
    { label: "Account Status Changes",  value: "AccountStatusChange" },
    { label: "Application Updates",     value: "ApplicationStatusUpdate" },
    { label: "Review Moderation",       value: "ReviewModerationEvent" },
    { label: "Point Transactions",      value: "PointTransaction" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Navigation */}
        <div className="mb-4">
          <Link
            to="/"
            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline block mb-2"
          >
            ← Home
          </Link>
          <Link
            to="/admin/dashboard"
            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline block mb-2"
          >
            ← Return to Admin Dashboard
          </Link>
        </div>

        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-1">Audit &amp; Compliance</h1>
            <p className="text-gray-500">Monitor system changes and user activity.</p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setIsModalOpen(true)}>
              Filter Report
            </Button>
            <Button
              variant="primary"
              onClick={downloadCSV}
              disabled={filteredLogs.length === 0}
            >
              Download CSV
            </Button>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 p-4 text-red-700 rounded mb-4">{error}</div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard
            title="Total Records"
            value={totalEvents}
            color="text-gray-900 dark:text-gray-100"
          />
          <StatCard
            title="Security Events"
            value={securityEvents}
            color="text-orange-600"
          />
          <StatCard
            title="App Submissions"
            value={appSubmissions}
            color="text-blue-600"
          />
        </div>

        {/* Table */}
        <div className="card shadow-sm overflow-hidden bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
          <Table
            data={filteredLogs}
            columns={columns}
            onRowClick={(log: AuditLogEntry) => console.log("Log entry clicked:", log)}
          />
          {filteredLogs.length === 0 && (
            <div className="p-12 text-center">
              <p className="text-gray-500 dark:text-gray-400 italic">
                No audit logs found. Trigger a login event or select different filters.
              </p>
            </div>
          )}
        </div>

        {/* Filter Modal */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Filter Audit Report"
        >
          <Form method="get" className="space-y-4 text-left">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Include event types:
            </p>
            {EVENT_TYPE_FILTERS.map((f) => (
              <Checkbox
                key={f.value}
                label={f.label}
                name="filter"
                value={f.value}
                defaultChecked={selectedFilters.includes(f.value)}
              />
            ))}

            <div className="pt-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Specify User Group
              </label>
              <select
                name="targetUserType"
                value={userScope}
                onChange={(event) => {
                  setUserScope(event.target.value as UserScopeFilter);
                  setSpecificUserId("");
                }}
                className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
              >
                <option value="">All Users</option>
                <option value="admin">All Admins</option>
                <option value="driver">All Drivers</option>
                <option value="sponsor">All Sponsors</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Specify Individual User
              </label>
              <select
                name="targetUserId"
                value={specificUserId}
                onChange={(event) => setSpecificUserId(event.target.value)}
                className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
              >
                <option value="">All Users in Selected Group</option>
                {usersForScope.map((user) => {
                  const fullName = `${user.FirstName ?? ""} ${user.LastName ?? ""}`.trim();
                  const label = fullName
                    ? `${fullName} (@${user.Username})`
                    : `@${user.Username}`;

                  return (
                    <option key={user.UserID} value={user.UserID}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-6 border-t">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                onClick={() => setIsModalOpen(false)}
              >
                Apply Filters
              </Button>
            </div>
          </Form>
        </Modal>
      </div>
    </div>
  );
}

// --- Helper Components ---

function StatCard({
  title,
  value,
  color,
}: {
  title: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 p-6 rounded-xl border dark:border-gray-800 shadow-sm">
      <div className="text-sm text-gray-500 font-medium">{title}</div>
      <div className={`text-3xl font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function Checkbox({
  label,
  name,
  value,
}: {
  label: string;
  name: string;
  value: string;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <input
        type="checkbox"
        name={name}
        value={value}
        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
      />
      <span className="text-sm text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200">
        {label}
      </span>
    </label>
  );
}
