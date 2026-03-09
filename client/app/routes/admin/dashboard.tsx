import type { Route } from "./+types/dashboard";
import { useState } from "react";
import { Table, Input, Button, Badge, Modal } from "~/components";
import { useNavigate, useLoaderData, Form, useActionData, Link } from "react-router";
import { requireAuth } from "~/utils/session.server";

const API_URL = process.env.API_URL ?? "http://localhost:5000";

// ---------------------------------------------------------------------------
// Loader — fetch all users from the Express API
// ---------------------------------------------------------------------------
export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireAuth(request, ["admin"]);
  try {
    const res = await fetch(`${API_URL}/api/admin/users?activeStatus=all`);
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const data = await res.json();
    return {
      users: Array.isArray(data.users) ? data.users : [],
      session,
      error: null as string | null,
    };
  } catch (error: any) {
    return { users: [] as any[], session, error: error.message as string };
  }
}

// ---------------------------------------------------------------------------
// Action — create a new user via the Express API
// ---------------------------------------------------------------------------
export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request, ["admin"]);
  const fd = await request.formData();

  const userType = (fd.get("accountType") as string)?.toLowerCase();
  const payload: Record<string, any> = {
    username:   fd.get("username"),
    email:      fd.get("email"),
    firstName:  fd.get("firstName"),
    lastName:   fd.get("lastName"),
    userType,
    activeStatus: 1,
  };
  if (userType === "driver") {
    payload.licenseNumber    = fd.get("licenseNumber");
    payload.performanceStatus = fd.get("performanceStatus") ?? "good";
  }
  if (userType === "sponsor") {
    const cid = fd.get("sponsorCompanyId");
    if (cid) payload.sponsorCompanyId = parseInt(cid as string);
  }

  try {
    const res = await fetch(`${API_URL}/api/admin/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err.error ?? "Failed to create user" };
    }
    return { success: true, error: null };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "Admin Portal | FleetScore" }];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AdminPortal() {
  const { users, error } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery]     = useState("");
  const [typeFilter, setTypeFilter]       = useState("All");
  const [statusFilter, setStatusFilter]   = useState("All");
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen]     = useState(false);
  const [selectedType, setSelectedType]   = useState("driver");

  // Count stats
  const totalUsers   = users.length;
  const driverCount  = users.filter((u: any) => u.UserType?.toLowerCase() === "driver"  && u.ActiveStatus !== 0).length;
  const sponsorCount = users.filter((u: any) => u.UserType?.toLowerCase() === "sponsor" && u.ActiveStatus !== 0).length;
  const adminCount   = users.filter((u: any) => u.UserType?.toLowerCase() === "admin"   && u.ActiveStatus !== 0).length;
  const inactiveCount = users.filter((u: any) => u.ActiveStatus === 0).length;

  // Client-side filtering
  const filteredUsers = users.filter((u: any) => {
    const matchesSearch =
      u.Username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.FirstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.LastName?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType =
      typeFilter === "All" || u.UserType?.toLowerCase() === typeFilter.toLowerCase();
    const matchesStatus =
      statusFilter === "All" ||
      (statusFilter === "Active"   && u.ActiveStatus !== 0) ||
      (statusFilter === "Inactive" && u.ActiveStatus === 0);
    return matchesSearch && matchesType && matchesStatus;
  });

  // Close add-user modal on successful action
  const addUserSuccess = (actionData as any)?.success === true;

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      const payload: any = {
        username: formData.username,
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        userType: selectedType,
        activeStatus: 1
      };

      // Add driver-specific fields
      if (selectedType === 'driver') {
        payload.licenseNumber = formData.licenseNumber;
        payload.performanceStatus = formData.performanceStatus;
      }

      // Add sponsor-specific fields
      if (selectedType === 'sponsor' && formData.sponsorCompanyId) {
        payload.sponsorCompanyId = parseInt(formData.sponsorCompanyId);
      }

      const response = await fetch(`${BASE_URL}/api/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setIsAddUserOpen(false);
        setFormData({
          username: '',
          email: '',
          firstName: '',
          lastName: '',
          licenseNumber: '',
          performanceStatus: 'good',
          sponsorCompanyId: ''
        });
        setSelectedType('driver');
        fetchUsers();
      } else {
        const errData = await response.json();
        setError(errData.error || 'Failed to create user');
      }
    } catch (error: any) {
      console.error('Error creating user:', error);
      setError('Failed to create user. Please try again.');
    }
  };

  //Searching for users via name or username
  const filteredUsers = users.filter((u: any) => {
    const matchesSearch = 
      u.Username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.FirstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.LastName.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = typeFilter === "All" || u.UserType?.toLowerCase() === typeFilter.toLowerCase();
    
    const matchesStatus = 
      statusFilter === "All" || 
      (statusFilter === "Active" && u.ActiveStatus !== 0) || 
      (statusFilter === "Inactive" && u.ActiveStatus === 0);

    return matchesSearch && matchesType && matchesStatus;
  });

  const columns = [
    {
      key: "Avatar",
      header: "",
      render: (user: any) => {
        const src =
          user.ProfilePicture && user.ProfilePicture.includes("base64")
            ? user.ProfilePicture
            : `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.Username}`;
        return (
          <img
            src={src}
            alt="avatar"
            className="w-10 h-10 rounded-full object-cover border border-gray-100 dark:border-gray-800"
          />
        );
      },
    },
    {
      key: "Name",
      header: "User",
      render: (user: any) => (
        <div className="flex flex-col text-left">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-white">
              {user.FirstName} {user.LastName}
            </span>
            {user.ActiveStatus === 0 && (
              <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-bold uppercase border border-red-100">
                Inactive
              </span>
            )}
          </div>
          <span className="text-xs text-gray-400 font-mono">{user.Username}</span>
        </div>
      ),
    },
    {
      key: "UserType",
      header: "Account Type",
      render: (user: any) => (
        <Badge
          variant={
            user.UserType?.toLowerCase() === "admin"
              ? "danger"
              : user.UserType?.toLowerCase() === "sponsor"
              ? "info"
              : "success"
          }
        >
          {user.UserType}
        </Badge>
      ),
    },
    {
      key: "Points",
      header: "Points",
      render: (user: any) => {
        if (user.UserType?.toLowerCase() !== "driver")
          return <span className="text-gray-300 pl-4">—</span>;
        return (
          <button
            onClick={() => navigate(`/admin/profile/${user.UserID}/points`)}
            className="group flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 hover:border-indigo-400 transition-all"
          >
            <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
              {user.TotalPoints ?? 0}
            </span>
            <span className="text-[10px] uppercase tracking-tighter text-indigo-400 font-bold">
              Manage
            </span>
          </button>
        );
      },
    },
    {
      key: "edit",
      header: "",
      render: (user: any) => (
        <div className="flex justify-end pr-4">
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="mb-8 border-b pb-6 dark:border-gray-800 flex justify-between items-end">
          <div className="text-left">
            <Link
              to="/"
              className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline mb-2 block"
            >
              ← Home
            </Link>
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
              Admin Portal
            </h1>
            <p className="text-gray-500 text-sm mt-1 font-medium italic">
              System administration and user oversight.
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}
        {(actionData as any)?.error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            {(actionData as any).error}
          </div>
        )}

        {/* Main Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* Sidebar */}
          <aside className="lg:col-span-3 space-y-6">
            <div className="space-y-4">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1 text-left">
                Overview
              </h2>
              <div className="grid grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2">
                <StatCard title="Total"    value={totalUsers}    color="text-gray-900 dark:text-white" />
                <StatCard title="Drivers"  value={driverCount}   color="text-green-600" />
                <StatCard title="Sponsors" value={sponsorCount}  color="text-blue-600" />
                <StatCard title="Admins"   value={adminCount}    color="text-red-600" />
                <StatCard title="Inactive" value={inactiveCount} color="text-gray-400" />
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t dark:border-gray-800">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1 text-left">
                Analytics
              </h2>
              <Button
                variant="secondary"
                onClick={() => setIsAuditOpen(true)}
                className="w-full py-6 text-lg font-bold bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 transition-all shadow-sm"
              >
                Audit Reports
              </Button>
              <Button
                variant="secondary"
                onClick={() => navigate("/admin/invoices")}
                className="w-full py-6 text-lg font-bold bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 transition-all shadow-sm"
              >
                Invoices
              </Button>
            </div>
          </aside>

          {/* Main Content */}
          <main className="lg:col-span-9 space-y-6">
            {/* Filters row */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-4">
                <Input
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="md:col-span-3">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="All">All Types</option>
                  <option value="driver">Drivers</option>
                  <option value="sponsor">Sponsors</option>
                  <option value="admin">Admins</option>
                </select>
              </div>
              <div className="md:col-span-3">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="All">All Statuses</option>
                  <option value="Active">Active Only</option>
                  <option value="Inactive">Inactive Only</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <Button
                  variant="primary"
                  className="w-full h-10"
                  onClick={() => setIsAddUserOpen(true)}
                >
                  Add User
                </Button>
              </div>
            </div>

            {/* Users table */}
            <div className="bg-white dark:bg-gray-900 shadow-md rounded-xl border dark:border-gray-800 overflow-hidden text-left">
              <Table data={filteredUsers} columns={columns} />
              {filteredUsers.length === 0 && (
                <div className="p-8 text-center text-gray-500 italic">
                  No users found matching your criteria.
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Audit Report Modal */}
      <Modal
        isOpen={isAuditOpen}
        onClose={() => setIsAuditOpen(false)}
        title="Audit Report Configuration"
      >
        <Form method="get" action="/admin/audit-logs" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1 text-left">
              <label className="text-xs font-bold text-gray-400 uppercase">Start Date</label>
              <input
                type="date"
                name="startDate"
                className="w-full p-2 border rounded-md dark:bg-gray-800 dark:border-gray-700 text-sm"
              />
            </div>
            <div className="space-y-1 text-left">
              <label className="text-xs font-bold text-gray-400 uppercase">End Date</label>
              <input
                type="date"
                name="endDate"
                className="w-full p-2 border rounded-md dark:bg-gray-800 dark:border-gray-700 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1 text-left">
            <label className="text-xs font-bold text-gray-400 uppercase">
              Specific User (Optional)
            </label>
            <select
              name="targetUserId"
              className="w-full p-2 border rounded-md dark:bg-gray-800 dark:border-gray-700 text-sm"
            >
              <option value="">All Users</option>
              {users.map((u: any) => (
                <option key={u.UserID} value={u.UserID}>
                  {u.FirstName} {u.LastName} ({u.Username})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-400 uppercase text-left">
              Log Categories
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <AuditOption label="Login Attempts"         name="filter" value="LoginAttempt" />
              <AuditOption label="Password Changes"       name="filter" value="PasswordChange" />
              <AuditOption label="Account Updates"        name="filter" value="AccountUpdate" />
              <AuditOption label="Account Status Changes" name="filter" value="AccountStatusChange" />
              <AuditOption label="Application Updates"    name="filter" value="ApplicationStatusUpdate" />
              <AuditOption label="Point Transactions"     name="filter" value="PointTransaction" />
              <AuditOption label="Review Moderation"      name="filter" value="ReviewModerationEvent" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-6 border-t dark:border-gray-800">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsAuditOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              onClick={() => setIsAuditOpen(false)}
            >
              Generate
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Add User Modal */}
      <Modal
        isOpen={isAddUserOpen && !addUserSuccess}
        onClose={() => setIsAddUserOpen(false)}
        title="Add New User"
      >
        <Form method="post" className="space-y-4">
          <Input label="Username" name="username" required />
          <Input label="Email" name="email" type="email" required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="First Name" name="firstName" required />
            <Input label="Last Name"  name="lastName"  required />
          </div>
          <div className="text-left">
            <label className="text-sm font-medium mb-1 block">Account Type</label>
            <select
              name="accountType"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full rounded-md border border-gray-200 dark:border-gray-700 p-2 text-sm bg-white dark:bg-gray-800"
            >
              <option value="driver">Driver</option>
              <option value="sponsor">Sponsor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {selectedType === "driver" && (
            <>
              <Input label="License Number" name="licenseNumber" required />
              <div className="text-left">
                <label className="text-sm font-medium mb-1 block">Performance Status</label>
                <select
                  name="performanceStatus"
                  className="w-full rounded-md border border-gray-200 dark:border-gray-700 p-2 text-sm bg-white dark:bg-gray-800"
                >
                  <option value="excellent">Excellent</option>
                  <option value="good">Good</option>
                  <option value="average">Average</option>
                  <option value="poor">Poor</option>
                </select>
              </div>
            </>
          )}
          {selectedType === "sponsor" && (
            <Input
              label="Sponsor Company ID"
              name="sponsorCompanyId"
              type="number"
              required
            />
          )}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsAddUserOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create User
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    <div className="aspect-square flex flex-col justify-center items-center p-1 border dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm rounded-lg text-center">
      <div className="text-[10px] font-black text-gray-400 uppercase tracking-tight mb-0.5 truncate w-full">
        {title}
      </div>
      <div className={`text-2xl sm:text-3xl lg:text-4xl font-black leading-none tracking-tighter ${color}`}>
        {value}
      </div>
    </div>
  );
}

function AuditOption({
  label,
  name,
  value,
}: {
  label: string;
  name: string;
  value: string;
}) {
  return (
    <label className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg border dark:border-gray-800 cursor-pointer transition-colors text-left">
      <input
        type="checkbox"
        name={name}
        value={value}
        className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
      />
      <span className="text-xs font-semibold">{label}</span>
    </label>
  );
}
