import type { Route } from "./+types/admin";
import { useState, useEffect } from "react";
import { Table, Input, Button, Badge, Modal, Alert } from "~/components";
import { useNavigate, useLoaderData, Form, useActionData, Link } from "react-router";
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

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  try {
    await createUser({ 
      Username: formData.get("username") as string, 
      FirstName: formData.get("firstName") as string, 
      LastName: formData.get("lastName") as string, 
      UserType: formData.get("accountType") as string,
      ActiveStatus: 1,
      LicenseNumber: formData.get("licenseNumber") as string
    });
    return { success: true };
  } catch (error: any) {
    return { error: error.message };
  }
}

export default function AdminPortal() {
  const { users, error } = useLoaderData<typeof loader>();
  const actionData = useActionData(); 
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [selectedType, setSelectedType] = useState("Driver");
  const navigate = useNavigate();

  useEffect(() => {
    if (actionData?.success) setIsAddUserOpen(false);
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
          <span className="text-xs text-gray-500">{user.Username}</span>
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
          {user.UserType?.toLowerCase() === "driver" && (
            <Button size="sm" variant="primary" className="bg-indigo-600" onClick={() => navigate(`/admin/profile/${user.UserID}/points`)}>Points</Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => navigate(`/admin/profile/${user.UserID}`)}>Edit</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="container-padding section-spacing">
        {(error || actionData?.error) && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-left">{error || actionData?.error}</div>
        )}

        <div className="mb-4">
          <Link to="/" className="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">← Home</Link>
        </div>
        <div className="mb-8 text-left">
          <h1 className="mb-2 text-2xl font-bold">Admin Portal</h1>
        </div>

        <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="w-full sm:w-96">
            <Input type="search" placeholder="Search users..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate("/admin/invoices")}>View Invoices</Button>
            <Button variant="primary" onClick={() => setIsAddUserOpen(true)}>Add User</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard title="Total Users" value={users.length} color="text-gray-900" />
          <StatCard title="Drivers" value={users.filter((u: any) => u.UserType?.toLowerCase() === "driver").length} color="text-green-600" />
          <StatCard title="Sponsors" value={users.filter((u: any) => u.UserType?.toLowerCase() === "sponsor").length} color="text-blue-600" />
          <StatCard title="Admins" value={users.filter((u: any) => u.UserType?.toLowerCase() === "admin").length} color="text-red-600" />
        </div>

        <div className="card overflow-hidden">
          <Table data={users.filter((u: any) => u.Username.toLowerCase().includes(searchQuery.toLowerCase()))} columns={columns} />
        </div>

        <Modal isOpen={isAddUserOpen} onClose={() => setIsAddUserOpen(false)} title="Add New User">
          <Form method="post" className="space-y-4">
            <Input label="Username" name="username" required />
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" name="firstName" required />
              <Input label="Last Name" name="lastName" required />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block text-left">Account Type</label>
              <select name="accountType" value={selectedType} onChange={(e) => setSelectedType(e.target.value)} className="w-full rounded-md border p-2 text-sm bg-white dark:bg-gray-800">
                <option value="Driver">Driver</option>
                <option value="Sponsor">Sponsor</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
            {selectedType === "Driver" && <Input label="License Number" name="licenseNumber" required />}
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