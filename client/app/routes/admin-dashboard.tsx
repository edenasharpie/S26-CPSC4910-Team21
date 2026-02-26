import type { Route } from "./+types/admin-dashboard";
import { useState } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { Table, Input, Button, Badge, Modal, Card } from "~/components";

// 1. DATA TYPES
interface Invoice {
  InvoiceID: number;
  Amount: string;
  Status: string;
  DueDate: string;
  CreatedAt: string;
  SponsorName: string;
  OrganizationName: string;
}

interface User {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  accountType: string;
  profilePicture?: string;
}

const mockUsers: User[] = [
  { id: 1, username: "johndoe", firstName: "John", lastName: "Doe", accountType: "Driver" },
  { id: 2, username: "janesmith", firstName: "Jane", lastName: "Smith", accountType: "Sponsor" },
  { id: 3, username: "bobwilson", firstName: "Bob", lastName: "Wilson", accountType: "Admin" },
];

// 3. LOADER (Fetches invoice data from Express server)
export async function loader() {
  try {
    const response = await fetch("http://localhost:5001/api/admins/invoices");
    if (!response.ok) throw new Error("Failed to fetch invoices");
    const invoices = await response.json();
    return { invoices: invoices as Invoice[] };
  } catch (error) {
    console.error("Loader error:", error);
    return { invoices: [] };
  }
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "Admin Portal | FleetScore" }];
}

export default function AdminPortal() {
  const { invoices } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [form, setForm] = useState({
    username: "",
    firstName: "",
    lastName: "",
    accountType: "Driver" as "Admin" | "Driver" | "Sponsor",
  });

  const invoiceColumns = [
    {
      key: "SponsorName",
      header: "Sponsor",
      render: (inv: Invoice) => (
        <div>
          <div className="font-bold">{inv.SponsorName}</div>
          <div className="text-xs text-gray-500">{inv.OrganizationName}</div>
        </div>
      ),
    },
    {
      key: "Amount",
      header: "Amount",
      render: (inv: Invoice) => <span>${parseFloat(inv.Amount).toFixed(2)}</span>,
    },
    {
      key: "Status",
      header: "Status",
      render: (inv: Invoice) => (
        <Badge variant={inv.Status === "PAID" ? "success" : "warning"}>{inv.Status}</Badge>
      ),
    },
    {
      key: "CreatedAt",
      header: "Date Issued",
      render: (inv: Invoice) => new Date(inv.CreatedAt).toLocaleDateString(),
    },
  ];

  const userColumns = [
    { key: "username", header: "Username" },
    { key: "firstName", header: "First Name" },
    { key: "lastName", header: "Last Name" },
    {
      key: "accountType",
      header: "Role",
      render: (user: User) => (
        <Badge variant={user.accountType === "Admin" ? "danger" : "info"}>{user.accountType}</Badge>
      ),
    },
  ];

  const totalPaid = invoices.filter(i => i.Status === "PAID").reduce((a, b) => a + parseFloat(b.Amount), 0);
  const totalOwed = invoices.filter(i => i.Status !== "PAID").reduce((a, b) => a + parseFloat(b.Amount), 0);

  return (
    <div className="min-h-screen bg-gray-50 p-8 dark:bg-gray-950">
      <h1 className="text-4xl font-bold mb-8">Admin Dashboard</h1>

      {/* SECTION: INVOICES */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">Global Invoice Oversight</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card className="p-6 border-l-4 border-green-500">
            <div className="text-gray-500 text-sm">TOTAL REVENUE (PAID)</div>
            <div className="text-3xl font-bold text-green-600">${totalPaid.toFixed(2)}</div>
          </Card>
          <Card className="p-6 border-l-4 border-amber-500">
            <div className="text-gray-500 text-sm">TOTAL OUTSTANDING</div>
            <div className="text-3xl font-bold text-amber-600">${totalOwed.toFixed(2)}</div>
          </Card>
        </div>
        <Table data={invoices} columns={invoiceColumns} />
      </section>

      <hr className="my-10" />

      {/* SECTION: USERS */}
      <section>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold">User Management</h2>
          <Button onClick={() => setIsAddUserOpen(true)}>Add New User</Button>
        </div>
        <Table data={mockUsers} columns={userColumns} />
      </section>

      {/* MODAL */}
      <Modal 
        isOpen={isAddUserOpen} 
        onClose={() => setIsAddUserOpen(false)} 
        title="Create User"
      >
        <div className="space-y-4 p-4">
          <Input label="Username" value={form.username} onChange={(e) => setForm({...form, username: e.target.value})} />
          <Input label="First Name" value={form.firstName} onChange={(e) => setForm({...form, firstName: e.target.value})} />
          <Input label="Last Name" value={form.lastName} onChange={(e) => setForm({...form, lastName: e.target.value})} />
          <Button className="w-full" onClick={() => alert("Saving user...")}>Save User</Button>
        </div>
      </Modal>
    </div>
  );
}


// mock user data
// TODO: replace with real data

/*
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
  const navigate = useNavigate();

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
              navigate(`/admin/profile/${user.id}`);
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

  // state for user creation
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState({
    username: "",
    firstName: "",
    lastName: "",
    accountType: "Driver" as "Admin" | "Driver" | "Sponsor",
  });

  type CreateUserPayload = {
    username: string;
    firstName: string;
    lastName: string;
    accountType: "Admin" | "Driver" | "Sponsor";
  };
  // backend call for creating a new user, and dialogue completetion trigger
  async function createUser(payload: CreateUserPayload) {
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message ?? "Failed to create user");
    }

    return response.json();
  }

  async function handleCreateUser() {
    if (!form.username || !form.firstName || !form.lastName) {
      alert("All fields are required");
      return;
    }

    try {
      setIsSubmitting(true);

      await createUser({
        username: form.username,
        firstName: form.firstName,
        lastName: form.lastName,
        accountType: form.accountType,
      });

      setIsAddUserOpen(false);
      setForm({
        username: "",
        firstName: "",
        lastName: "",
        accountType: "Driver",
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="container-padding section-spacing">
        {/* Header */ /*}
        <div className="mb-8">
          <h1 className="mb-2">Admin Portal</h1>
        </div>

        {/* search */ /*}
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
            <Button variant="primary" onClick={() => setIsAddUserOpen(true)}>
              Add User
            </Button>
            <Button variant="secondary">Export</Button>
          </div>
        </div>

        {/* stats cards *//*}
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

        {/* users table */ /*}
        <Table
          data={mockUsers}
          columns={columns}
          onRowClick={(user) => {
            console.log("Row clicked:", user);
          }}
        />

        {/* create-new-user dialogue */ /*}
        <Modal
          isOpen={isAddUserOpen}
          onClose={() => setIsAddUserOpen(false)}
          title="Add User"
          size="md"
          footer={
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setIsAddUserOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreateUser}
                isLoading={isSubmitting}
              >
                Create User
              </Button>
            </div>
          }
        >
          <div>
            <Input
              label="Username"
              value={form.username}
              onChange={(e) =>
                setForm({ ...form, username: e.target.value })
              }
            />
            <div className="w-full">
              <Input
                label="First Name"
                value={form.firstName}
                onChange={(e) =>
                  setForm({ ...form, firstName: e.target.value })
                }
              />
            </div>
            <div className="w-full">
            <Input
              label="Last Name"
              value={form.lastName}
              onChange={(e) =>
                setForm({ ...form, lastName: e.target.value })
              }
            />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Account Type
              </label>
              <select
                className="mt-1 w-full rounded-md border bg-transparent p-2"
                value={form.accountType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    accountType: e.target.value as
                      | "Admin"
                      | "Driver"
                      | "Sponsor",
                  })
                }
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
} */