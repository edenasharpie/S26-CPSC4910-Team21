import type { Route } from "./+types/admin";
import { useState } from "react";
import { Table, Input, Button, Badge, Modal } from "~/components";
import { useNavigate, useLoaderData } from "react-router";
// Import your DB functions - Ensure this path correctly points to your db.js
import { getAllUsers } from "../../../../server/src/db.js"; 

/**
 * SERVER-SIDE: Loader
 * This runs only on the server to fetch data before the page loads.
 */
export async function loader() {
  try {
    const users = await getAllUsers();
    console.log("DB Result:", users[0]); 
    return { 
      users: Array.isArray(users) ? users : [],
      error: null 
    };
  } catch (error: any) {
    return { users: [], error: `DB Error: ${error.message}` };
  }
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Admin Portal | FleetScore" },
    { name: "description", content: "Manage users in the FleetScore system" },
  ];
}

export default function AdminPortal() {
  const { users, error } = useLoaderData<typeof loader>();
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  // Map SQL 'UserType' to Badge variants
  const getAccountTypeBadge = (userType: string) => {
    const type = userType?.toLowerCase() || "";
    switch (type) {
      case "admin":
        return <Badge variant="danger">Admin</Badge>;
      case "sponsor":
        return <Badge variant="info">Sponsor</Badge>;
      case "driver":
        return <Badge variant="success">Driver</Badge>;
      default:
        return <Badge variant="default">{userType || "N/A"}</Badge>;
    }
  };

  // Setup Table columns to match your SQL Column Names
  const columns = [
    {
      key: "Avatar",
      header: "Avatar",
      render: (user: any) => (
        <img
          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.Username}`}
          alt="avatar"
          className="w-10 h-10 rounded-full"
        />
      ),
    },
    {
      key: "Name",
      header: "User",
      render: (user: any) => (
        <div className="flex flex-col">
          <span className="font-medium text-gray-900 dark:text-white">
            {user.FirstName} {user.LastName}
          </span>
          <span className="text-xs text-gray-500">{user.Email || "No Email"}</span>
        </div>
      ),
    },
    {
      key: "Username",
      header: "Username",
    },
    {
      key: "UserType",
      header: "Account Type",
      render: (user: any) => getAccountTypeBadge(user.UserType),
    },
    {
      key: "actions",
      header: "Actions",
      render: (user: any) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => navigate(`/admin/profile/${user.UserID}`)}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              if (confirm(`Delete ${user.Username}?`)) {
                // Future: Add form submission to a React Router 'action'
                console.log("Delete ID:", user.UserID);
              }
            }}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  // State for user creation modal
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    username: "",
    firstName: "",
    lastName: "",
    accountType: "Driver",
  });

  async function handleCreateUser() {
    if (!form.username || !form.firstName || !form.lastName) {
      alert("All fields are required");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!response.ok) throw new Error("Failed to create user");

      setIsAddUserOpen(false);
      setForm({ username: "", firstName: "", lastName: "", accountType: "Driver" });
      navigate(".", { replace: true }); // Refresh data
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="container-padding section-spacing">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="mb-8">
          <h1 className="mb-2 text-2xl font-bold">Admin Portal</h1>
        </div>

        {/* Search & Actions */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="w-full sm:w-96">
            <Input
              type="search"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              helperText="Searching local database records"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => setIsAddUserOpen(true)}>
              Add User
            </Button>
          </div>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard title="Total Users" value={users.length} color="text-gray-900" />
          <StatCard 
            title="Drivers" 
            value={users.filter((u: any) => u.UserType === "Driver").length} 
            color="text-green-600" 
          />
          <StatCard 
            title="Sponsors" 
            value={users.filter((u: any) => u.UserType === "Sponsor").length} 
            color="text-blue-600" 
          />
          <StatCard 
            title="Admins" 
            value={users.filter((u: any) => u.UserType === "Admin").length} 
            color="text-red-600" 
          />
        </div>

        {/* Real Data Table */}
        <div className="card overflow-hidden">
          <Table data={users} columns={columns} />
        </div>

        {/* Add User Modal */}
        <Modal
          isOpen={isAddUserOpen}
          onClose={() => setIsAddUserOpen(false)}
          title="Add New User"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setIsAddUserOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleCreateUser} isLoading={isSubmitting}>
                Create User
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <Input
              label="Username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="First Name"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
              <Input
                label="Last Name"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Account Type</label>
              <select
                className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 p-2"
                value={form.accountType}
                onChange={(e) => setForm({ ...form, accountType: e.target.value })}
              >
                <option value="Driver">Driver</option>
                <option value="Sponsor">Sponsor</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}

// Simple Helper Component for Stats
function StatCard({ title, value, color }: { title: string; value: number; color: string }) {
  return (
    <div className="card p-6 border dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm rounded-lg">
      <div className="text-sm text-gray-500 mb-1">{title}</div>
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
    </div>
  );
}