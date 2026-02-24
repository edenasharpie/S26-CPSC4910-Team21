import type { Route } from "./+types/audit-logs";
import { useState } from "react";
import { Table, Input, Button, Badge } from "~/components";

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
        {/* header */}
        <div className="mb-8">
          <h1 className="mb-2">Audit Logs</h1>
        </div>

        {/* stats cards */}
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

        {/* table */}
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