import type { Route } from "./+types/admin";
import { useState } from "react";
import { Table, Input, Button, Badge } from "~/components";

// mock user data
// TODO: replace with real data
const mockUsers = [
  {
    id: 1,
    username: "johndoe",
    profilePicture: "https://api.dicebear.com/7.x/avataaars/svg?seed=johndoe",
    firstName: "John",
    lastName: "Doe",
    accountType: "Driver",
  },
  {
    id: 2,
    username: "janesmith",
    profilePicture: "https://api.dicebear.com/7.x/avataaars/svg?seed=janesmith",
    firstName: "Jane",
    lastName: "Smith",
    accountType: "Sponsor",
  },
  {
    id: 3,
    username: "bobwilson",
    profilePicture: "https://api.dicebear.com/7.x/avataaars/svg?seed=bobwilson",
    firstName: "Bob",
    lastName: "Wilson",
    accountType: "Admin",
  },
  {
    id: 4,
    username: "alicejones",
    profilePicture: "https://api.dicebear.com/7.x/avataaars/svg?seed=alicejones",
    firstName: "Alice",
    lastName: "Jones",
    accountType: "Driver",
  },
  {
    id: 5,
    username: "charliebrwn",
    profilePicture: "https://api.dicebear.com/7.x/avataaars/svg?seed=charliebrwn",
    firstName: "Charlie",
    lastName: "Brown",
    accountType: "Sponsor",
  },
];

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Admin Portal" },
    { name: "description", content: "Manage users in the FleetScore system" },
  ];
}

export default function AdminPortal() {
  const [searchQuery, setSearchQuery] = useState("");

  // map badge variants to account types
  const getAccountTypeBadge = (accountType: string) => {
    switch (accountType) {
      case "Admin":
        return <Badge variant="danger">{accountType}</Badge>;
      case "Sponsor":
        return <Badge variant="info">{accountType}</Badge>;
      case "Driver":
        return <Badge variant="success">{accountType}</Badge>;
      default:
        return <Badge variant="default">{accountType}</Badge>;
    }
  };

  // table columns setup
  const columns = [
    {
      key: "profilePicture",
      header: "Avatar",
      render: (user: typeof mockUsers[0]) => (
        <img
          src={user.profilePicture}
          alt={`${user.username}'s avatar`}
          className="w-10 h-10 rounded-full"
        />
      ),
    },
    {
      key: "name",
      header: "User",
      render: (user: any) => (
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-white">
              {user.firstName} {user.lastName}
            </span>
            {user.accountType === "sponsor" && (
              <Badge
                variant="info"
                size="sm"
                className="px-2 py-0.5 font-bold uppercase tracking-widest text-[10px]"
              >
                Sponsor
              </Badge>
            )}
          </div>
          <span className="text-xs text-gray-500">{user.email}</span>
        </div>
      ),
    },
    {
      key: "username",
      header: "Username",
      render: (user: typeof mockUsers[0]) => (
        <span className="font-medium">{user.username}</span>
      ),
    },
    {
      key: "firstName",
      header: "First Name",
    },
    {
      key: "lastName",
      header: "Last Name",
    },
    {
      key: "accountType",
      header: "Account Type",
      render: (user: typeof mockUsers[0]) => getAccountTypeBadge(user.accountType),
    },
    {
      key: "actions",
      header: "Actions",
      render: (user: typeof mockUsers[0]) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              alert(`View details for ${user.username}`);
            }}
          >
            View
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              alert(`Edit user ${user.username}`);
            }}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Are you sure you want to delete ${user.username}?`)) {
                alert(`Delete user ${user.username}`);
              }
            }}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="container-padding section-spacing">
        {/* Header */}
        <div className="mb-8">
          <h1 className="mb-2">Admin Portal</h1>
        </div>

        {/* search */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="w-full sm:w-96">
            <Input
              type="search"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled
              helperText="Search functionality will be implemented in a future update"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="primary">Add User</Button>
            <Button variant="secondary">Export</Button>
          </div>
        </div>

        {/* stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="card p-6">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Users</div>
            <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {mockUsers.length}
            </div>
          </div>
          <div className="card p-6">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Drivers</div>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {mockUsers.filter((u) => u.accountType === "Driver").length}
            </div>
          </div>
          <div className="card p-6">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Sponsors</div>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {mockUsers.filter((u) => u.accountType === "Sponsor").length}
            </div>
          </div>
          <div className="card p-6">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Admins</div>
            <div className="text-3xl font-bold text-red-600 dark:text-red-400">
              {mockUsers.filter((u) => u.accountType === "Admin").length}
            </div>
          </div>
        </div>

        {/* users table */}
        <Table
          data={mockUsers}
          columns={columns}
          onRowClick={(user) => {
            console.log("Row clicked:", user);
          }}
        />
      </div>
    </div>
  );
}