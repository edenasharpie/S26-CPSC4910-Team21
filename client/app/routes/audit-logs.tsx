import type { Route } from "./+types/audit-logs";
import { useState } from "react";
import { useLoaderData } from "react-router";
import { Table, Button, Badge } from "~/components";

interface AuditLog {
  LogID: number;
  Username: string | null;
  ActionType: string;
  Status: string;
  IPAddress: string;
  CreatedAt: string;
}

export async function loader() {
  try {
    const response = await fetch("http://localhost:5001/api/sponsors/audit-logs");
    if (!response.ok) throw new Error("Failed to fetch");
    const logs = await response.json();
    return { logs };
  } catch (error) {
    console.error("Fetch error:", error);
    return { logs: [] };
  }
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "Audit Logs | Sponsor Dashboard" }];
}

export default function AuditLogs() {
  // Get the live data from the loader
  const { logs } = useLoaderData<typeof loader>();
  
  // Utility to format the RDS timestamp
  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status.toUpperCase()) {
      case "SUCCESS":
        return <Badge variant="success">Success</Badge>;
      case "FAILURE":
        return <Badge variant="danger">Failed</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  const getEventTypeBadge = (eventType: string) => {
    switch (eventType) {
      case "LOGIN_ATTEMPT":
        return <Badge variant="info">Login Attempt</Badge>;
      case "PASSWORD_CHANGE":
        return <Badge variant="warning">Password Change</Badge>;
      default:
        return <Badge variant="default">{eventType || "System Event"}</Badge>;
    }
  };

  const columns = [
    {
      key: "CreatedAt",
      header: "Timestamp",
      render: (log: AuditLog) => (
        <span className="text-sm font-mono">{formatTimestamp(log.CreatedAt)}</span>
      ),
    },
    {
      key: "ActionType",
      header: "Event Type",
      render: (log: AuditLog) => getEventTypeBadge(log.ActionType),
    },
    {
      key: "Username",
      header: "Username",
      render: (log: AuditLog) => (
        <span className="font-medium text-gray-700 dark:text-gray-300">
          {log.Username || "Unknown / Non-existent User"}
        </span>
      ),
    },
    {
      key: "Status",
      header: "Status",
      render: (log: AuditLog) => getStatusBadge(log.Status),
    },
    {
      key: "IPAddress",
      header: "IP Address",
      render: (log: AuditLog) => (
        <span className="text-xs text-gray-500 font-mono">{log.IPAddress}</span>
      ),
    },
  ];

  const totalEvents = logs.length;
  const successfulEvents = logs.filter((log: AuditLog) => log.Status?.toUpperCase() === "SUCCESS").length;
  const failedEvents = logs.filter((log: AuditLog) => log.Status?.toUpperCase() === "FAILURE").length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="container-padding section-spacing">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Security Audit Logs</h1>
          <p className="text-gray-500">Monitoring real-time authentication events from AWS RDS.</p>
        </div>

        {/* Dynamic Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <div className="card p-6 shadow-sm bg-white dark:bg-gray-900">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Logs</div>
            <div className="text-3xl font-bold">{totalEvents}</div>
          </div>
          <div className="card p-6 shadow-sm bg-white dark:bg-gray-900 border-l-4 border-green-500">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1 text-green-600">Successful Actions</div>
            <div className="text-3xl font-bold text-green-600">{successfulEvents}</div>
          </div>
          <div className="card p-6 shadow-sm bg-white dark:bg-gray-900 border-l-4 border-red-500">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1 text-red-600">Failed Attempts</div>
            <div className="text-3xl font-bold text-red-600">{failedEvents}</div>
          </div>
        </div>

        {/* table */}
        <div className="card shadow-sm overflow-hidden bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
          <Table
            data={logs} // Now using live data from loader
            columns={columns} // Using the updated column definitions
            onRowClick={(log: AuditLog) => {
              console.log("Log entry clicked:", log);
            }}
          />
          
          {/* Empty State */}
          {logs.length === 0 && (
            <div className="p-12 text-center">
              <p className="text-gray-500 dark:text-gray-400 italic">
                No audit logs found. Try triggering a login event via Postman or the login page.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}




/*
// TODO: replace with API calls
const mockData = [
  {
    id: 1,
    timestamp: "2026-02-05T14:32:15Z",
    eventType: "Login Attempt",
    username: "johndoe",
    status: "Success"
  },
  {
    id: 2,
    timestamp: "2026-02-05T14:28:42Z",
    eventType: "Password Change",
    username: "janesmith",
    status: "Success"
  },
  {
    id: 3,
    timestamp: "2026-02-05T14:15:03Z",
    eventType: "Login Attempt",
    username: "bobwilson",
    status: "Failed"
  },
  {
    id: 4,
    timestamp: "2026-02-05T14:10:27Z",
    eventType: "Notification Sent",
    username: "alicejones",
    status: "Success"
  },
  {
    id: 5,
    timestamp: "2026-02-05T14:05:18Z",
    eventType: "Account Update",
    username: "charliebrwn",
    status: "Success"
  },
  {
    id: 6,
    timestamp: "2026-02-05T13:58:44Z",
    eventType: "Login Attempt",
    username: "johndoe",
    status: "Failed"
  },
  {
    id: 7,
    timestamp: "2026-02-05T13:45:12Z",
    eventType: "Notification Sent",
    username: "janesmith",
    status: "Success"
  },
  {
    id: 8,
    timestamp: "2026-02-05T13:32:55Z",
    eventType: "Account Creation",
    username: "newuser123",
    status: "Success"
  },
  {
    id: 9,
    timestamp: "2026-02-05T13:20:08Z",
    eventType: "Password Reset",
    username: "bobwilson",
    status: "Success"
  },
  {
    id: 10,
    timestamp: "2026-02-05T13:15:33Z",
    eventType: "Login Attempt",
    username: "alicejones",
    status: "Success"
  },
  {
    id: 11,
    timestamp: "2026-02-05T13:05:21Z",
    eventType: "Notification Sent",
    username: "charliebrwn",
    status: "Failed"
  },
  {
    id: 12,
    timestamp: "2026-02-05T12:58:09Z",
    eventType: "Permission Change",
    username: "johndoe",
    status: "Success"
  },
];


export function meta({}: Route.MetaArgs) {
  return [
    { title: "Audit Logs" }
  ];
}

export default function AuditLogs() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterEventType, setFilterEventType] = useState("all");

  // utility to format timestamp to readable format
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // map status to badge variant
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Success":
        return <Badge variant="success">{status}</Badge>;
      case "Failed":
        return <Badge variant="danger">{status}</Badge>;
      case "Pending":
        return <Badge variant="warning">{status}</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  // map event type to badge variant
  const getEventTypeBadge = (eventType: string) => {
    switch (eventType) {
      case "Login Attempt":
        return <Badge variant="info">{eventType}</Badge>;
      case "Password Change":
      case "Password Reset":
        return <Badge variant="warning">{eventType}</Badge>;
      case "Notification Sent":
        return <Badge variant="default">{eventType}</Badge>;
      case "Account Creation":
      case "Account Update":
        return <Badge variant="success">{eventType}</Badge>;
      case "Permission Change":
        return <Badge variant="danger">{eventType}</Badge>;
      default:
        return <Badge variant="default">{eventType}</Badge>;
    }
  };

  // set up table columns
  const columns = [
    {
      key: "timestamp",
      header: "Timestamp",
      render: (log: typeof mockData[0]) => (
        <span className="text-sm font-mono">{formatTimestamp(log.timestamp)}</span>
      ),
    },
    {
      key: "eventType",
      header: "Event Type",
      render: (log: typeof mockData[0]) => getEventTypeBadge(log.eventType),
    },
    {
      key: "username",
      header: "Username",
      render: (log: typeof mockData[0]) => (
        <span className="font-medium">{log.username}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (log: typeof mockData[0]) => getStatusBadge(log.status),
    },
    {
      key: "actions",
      header: "Actions",
      render: (log: typeof mockData[0]) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            alert(`Full details for event ID: ${log.id}\n\n${JSON.stringify(log, null, 2)}`);
          }}
        >
          Details
        </Button>
      ),
    },
  ];

  // get event types for filtering
  const eventTypes = Array.from(new Set(mockData.map((log) => log.eventType)));

  // calculate stats
  const totalEvents = mockData.length;
  const successfulEvents = mockData.filter((log) => log.status === "Success").length;
  const failedEvents = mockData.filter((log) => log.status === "Failed").length;
  const loginAttempts = mockData.filter((log) => log.eventType === "Login Attempt").length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="container-padding section-spacing">
        {/* header */ /*}
        <div className="mb-8">
          <h1 className="mb-2">Audit Logs</h1>
        </div>

        {/* stats cards */ /*}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="card p-6">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Events</div>
            <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {totalEvents}
            </div>
          </div>
          <div className="card p-6">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Successful</div>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {successfulEvents}
            </div>
          </div>
          <div className="card p-6">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Failed</div>
            <div className="text-3xl font-bold text-red-600 dark:text-red-400">
              {failedEvents}
            </div>
          </div>
          <div className="card p-6">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Login Attempts</div>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {loginAttempts}
            </div>
          </div>
        </div>

        {/* table */ /*}
        <Table
          data={mockData}
          columns={columns}
          onRowClick={(log) => {
            console.log("Log entry clicked:", log);
          }}
        />
      </div>
    </div>
  );
}
*/