import type { Route } from "./+types/admin";
import { useState, useEffect } from "react";
import { Table, Input, Button, Badge, Modal } from "~/components";
// Added 'Form', 'redirect', and 'useActionData'
import { useNavigate, useLoaderData, Form, redirect, useActionData } from "react-router";
import { getAllUsers, createUser } from "../../../../server/src/db.js"; 

export async function loader() {
  try {
    const users = await getAllUsers();
    return { 
      users: Array.isArray(users) ? users : [],
      error: null 
    };
  } catch (error: any) {
    return { users: [], error: `DB Error: ${error.message}` };
  }
}

/**
 * SERVER-SIDE: Action
 * This handles the POST request from the "Add User" form.
 */
export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const username = formData.get("username") as string;
  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  const accountType = formData.get("accountType") as string;

  try {
    await createUser({ 
      Username: username, 
      FirstName: firstName, 
      LastName: lastName, 
      UserType: accountType,
      ActiveStatus: 1 // Default to active
    });
    // This triggers the loader to re-run, updating your totals automatically!
    return { success: true };
  } catch (error: any) {
    return { error: error.message };
  }
}

export default function AdminPortal() {
  const { users, error } = useLoaderData<typeof loader>();
  const actionData = useActionData(); // Catch errors or success from the action
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const navigate = useNavigate();

  // Close modal when user is successfully created
  useEffect(() => {
    if (actionData?.success) {
      setIsAddUserOpen(false);
    }
  }, [actionData]);

  const getAccountTypeBadge = (userType: string) => {
    const type = userType?.toLowerCase() || "";
    switch (type) {
      case "admin": return <Badge variant="danger">Admin</Badge>;
      case "sponsor": return <Badge variant="info">Sponsor</Badge>;
      case "driver": return <Badge variant="success">Driver</Badge>;
      default: return <Badge variant="default">{userType || "N/A"}</Badge>;
    }
  };

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
        <div className="flex flex-col text-left">
          <span className="font-medium text-gray-900 dark:text-white">
            {user.FirstName} {user.LastName}
          </span>
          <span className="text-xs text-gray-500">{user.Email || "No Email"}</span>
        </div>
      ),
    },
    { key: "Username", header: "Username" },
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
          {/* New Points Button */}
          <Button
            size="sm"
            variant="primary"
            className="bg-indigo-600 hover:bg-indigo-700"
            onClick={() => navigate(`/admin/profile/${user.UserID}/points`)}
          >
            Points
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => navigate(`/admin/profile/${user.UserID}`)}
          >
            Edit
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="container-padding section-spacing">
        {(error || actionData?.error) && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error || actionData?.error}
          </div>
        )}

        <div className="mb-8 text-left">
          <h1 className="mb-2 text-2xl font-bold">Admin Portal</h1>
        </div>

        <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="w-full sm:w-96">
            <Input
              type="search"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button variant="primary" onClick={() => setIsAddUserOpen(true)}>
            Add User
          </Button>
        </div>

        {/* Stats Section - Dynamically calculated from users array */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard title="Total Users" value={users.length} color="text-gray-900" />
          <StatCard 
            title="Drivers" 
            value={users.filter((u: any) => u.UserType?.toLowerCase() === "driver").length} 
            color="text-green-600" 
          />
          <StatCard 
            title="Sponsors" 
            value={users.filter((u: any) => u.UserType?.toLowerCase() === "sponsor").length} 
            color="text-blue-600" 
          />
          <StatCard 
            title="Admins" 
            value={users.filter((u: any) => u.UserType?.toLowerCase() === "admin").length} 
            color="text-red-600" 
          />
        </div>

        <div className="card overflow-hidden">
          <Table data={users} columns={columns} />
        </div>

        {/* Add User Modal */}
        <Modal
          isOpen={isAddUserOpen}
          onClose={() => setIsAddUserOpen(false)}
          title="Add New User"
        >
          {/* Using the React Router Form component */}
          <Form method="post" className="space-y-4">
            <Input label="Username" name="username" required />
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" name="firstName" required />
              <Input label="Last Name" name="lastName" required />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block text-left">Account Type</label>
              <select
                name="accountType"
                className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 p-2"
              >
                <option value="Driver">Driver</option>
                <option value="Sponsor">Sponsor</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsAddUserOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary">Create User</Button>
            </div>
          </Form>
        </Modal>
      </div>
    </div>
  );
}

function StatCard({ title, value, color }: { title: string; value: number; color: string }) {
  return (
    <div className="card p-6 border dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm rounded-lg text-left">
      <div className="text-sm text-gray-500 mb-1">{title}</div>
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
    </div>
  );
}