import type { Route } from "./+types/dashboard";
import { useEffect, useState } from "react";
import { Table, Input, Button, Badge, Modal } from "~/components";
import { useNavigate, useLoaderData, Form, useActionData, Link, redirect } from "react-router";
import {
  requireAuth,
  signToken,
  buildSetCookieHeader,
  buildAssumedSession,
  ROLE_HOME,
} from "~/utils/session.server";

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
    
    // Fetch sponsor companies for the dropdown
    let companies = [];
    try {
      const companiesRes = await fetch(`${API_URL}/api/sponsors`);
      if (companiesRes.ok) {
        companies = await companiesRes.json();
      }
    } catch {
      // Fallback to empty array if fetch fails
      companies = [];
    }
    
    return {
      users: Array.isArray(data.users) ? data.users : [],
      companies: Array.isArray(companies) ? companies : [],
      session,
      error: null as string | null,
    };
  } catch (error: any) {
    return { users: [] as any[], session, companies: [] as any[], error: error.message as string };
  }
}

// ---------------------------------------------------------------------------
// Action — create a new user via the Express API
// ---------------------------------------------------------------------------
export async function action({ request }: Route.ActionArgs) {
  const session = await requireAuth(request, ["admin"]);
  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "create-user");

  if (intent === "assume") {
    const targetUserId = Number(fd.get("targetUserId"));
    const targetRole = String(fd.get("targetRole") ?? "").toLowerCase();

    if (!Number.isInteger(targetUserId) || !["driver", "sponsor"].includes(targetRole)) {
      return { success: false, error: "Invalid assume target." };
    }

    const endpoint =
      targetRole === "driver"
        ? `${API_URL}/api/admin/assume-driver/${targetUserId}`
        : `${API_URL}/api/admin/assume-sponsor/${targetUserId}`;

    try {
      const assumeRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesterUserId: session.OriginalUser?.UserID ?? session.UserID,
        }),
      });

      const assumeResult = await assumeRes.json().catch(() => ({}));
      if (!assumeRes.ok || !assumeResult.success || !assumeResult.assumedUser) {
        return {
          success: false,
          error: assumeResult.error ?? "Failed to assume selected account.",
        };
      }

      const originalIdentity = session.OriginalUser ?? {
        UserID: session.UserID,
        UserType: session.UserType,
        Username: session.Username,
        FirstName: session.FirstName,
        LastName: session.LastName,
      };

      const nextSession = buildAssumedSession(originalIdentity, assumeResult.assumedUser);
      const token = signToken(nextSession);
      const assumedRole = String(assumeResult.assumedUser.UserType).toLowerCase() as "driver" | "sponsor" | "admin";

      return redirect(ROLE_HOME[assumedRole] ?? "/", {
        headers: {
          "Set-Cookie": buildSetCookieHeader(token),
        },
      });
    } catch (error: any) {
      return { success: false, error: error.message ?? "Failed to assume selected account." };
    }
  }

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
  const { users, companies, error, session } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const isAssumedMode = Boolean(session?.OriginalUser);

  const [searchQuery, setSearchQuery]     = useState("");
  const [typeFilter, setTypeFilter]       = useState("All");
  const [statusFilter, setStatusFilter]   = useState("All");
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen]     = useState(false);
  const [selectedType, setSelectedType]   = useState("driver");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");

  // Count stats
  const totalUsers   = users.length;
  const driverCount  = users.filter((u: any) => u.UserType?.toLowerCase() === "driver"  && u.ActiveStatus !== 0).length;
  const sponsorCount = users.filter((u: any) => u.UserType?.toLowerCase() === "sponsor" && u.ActiveStatus !== 0).length;
  const adminCount   = users.filter((u: any) => u.UserType?.toLowerCase() === "admin"   && u.ActiveStatus !== 0).length;
  const inactiveCount = users.filter((u: any) => u.ActiveStatus === 0).length;
  const totalPoints = users.filter((u: any) => u.UserType?.toLowerCase() === "driver").reduce((sum: number, u: any) => sum + (u.PointBalance ?? 0), 0);
  const currentAdmin = users.find((u: any) => u.UserID === session?.UserID);
  const adminFirstName = session?.FirstName ?? currentAdmin?.FirstName ?? "Admin";
  const adminLastName = session?.LastName ?? currentAdmin?.LastName ?? "User";
  const adminUsername = session?.Username ?? currentAdmin?.Username ?? "admin";
  const adminProfilePicture = currentAdmin?.ProfilePicture ?? "";

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

  const columns = [
    {
      key: "Avatar",
      header: "",
      render: (user: any) => {
        return (
          <AvatarOrInitials
            profilePicture={user.ProfilePicture}
            firstName={user.FirstName}
            lastName={user.LastName}
            className="w-10 h-10 rounded-full border border-gray-100 dark:border-gray-800"
            initialsClassName="text-[11px]"
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
              {user.PointBalance ?? 0}
            </span>
            <span className="text-[10px] uppercase tracking-tighter text-indigo-400 font-bold">
              Manage
            </span>
          </button>
        );
      },
    },
    {
      key: "assume",
      header: "Assume",
      render: (user: any) => {
        const role = String(user.UserType ?? "").toLowerCase();
        const canAssume = user.ActiveStatus !== 0 && ["driver", "sponsor"].includes(role);

        if (!canAssume || isAssumedMode) {
          return <span className="text-gray-300 pl-4">—</span>;
        }

        return (
          <Form method="post" className="pr-2">
            <input type="hidden" name="intent" value="assume" />
            <input type="hidden" name="targetUserId" value={user.UserID} />
            <input type="hidden" name="targetRole" value={role} />
            <Button type="submit" size="sm" variant="primary">
              Assume
            </Button>
          </Form>
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
            onClick={() => navigate(`/admin/profile/${user.UserID}/edit`)}
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
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
                  Admin Portal
                </h1>
                <p className="text-gray-500 text-sm mt-1 font-medium italic">
                  System administration and user oversight.
                </p>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                <span className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">{totalPoints.toLocaleString()}</span>
                <span className="text-xs uppercase tracking-tight text-indigo-600 dark:text-indigo-400 font-semibold">Total<br/>Points</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isAssumedMode && (
              <Form method="post" action="/exit-assumption">
                <Button variant="primary" size="sm" type="submit">
                  Exit Assumed View
                </Button>
              </Form>
            )}
            <button
              onClick={() => navigate(`/admin/settings/${session?.UserID || 1}`)}
              className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
              title="Settings"
            >
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <Form method="post" action="/logout">
              <Button variant="secondary" size="sm" type="submit">
                Sign out
              </Button>
            </Form>
            <button 
              onClick={() => {
                if (session?.UserID) {
                  window.location.href = `/admin/profile/${session.UserID}/edit`;
                }
              }}
              className="flex items-center gap-3 p-1.5 pr-5 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-indigo-400 transition-all group shadow-sm cursor-pointer"
            >
            <div className="relative">
              <AvatarOrInitials
                profilePicture={adminProfilePicture}
                firstName={adminFirstName}
                lastName={adminLastName}
                className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800"
                initialsClassName="text-xs"
              />
              <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-2 ring-white dark:ring-gray-900 bg-green-500"></span>
            </div>
            <div className="block text-left">
              <p className="text-xs font-bold text-gray-900 dark:text-white leading-none">{adminFirstName} {adminLastName}</p>
              <p className="text-[10px] text-gray-400 font-mono mt-0.5">{adminUsername}</p>
            </div>
            </button>
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
            <div className="text-left">
              <label className="text-sm font-medium mb-1 block">Sponsor Company</label>
              <select
                name="sponsorCompanyId"
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                required
                className="w-full rounded-md border border-gray-200 dark:border-gray-700 p-2 text-sm bg-white dark:bg-gray-800"
              >
                <option value="">Select a company...</option>
                {companies.map((company: any) => (
                  <option key={company.id} value={company.id}>
                    {company.companyName} (ID: {company.id})
                  </option>
                ))}
              </select>
            </div>
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

function resolveProfileImageUrl(profilePicture?: string) {
  if (!profilePicture) return null;

  const trimmed = profilePicture.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.hostname === "external-content.duckduckgo.com") {
      const wrapped = url.searchParams.get("u");
      return wrapped ? decodeURIComponent(wrapped) : trimmed;
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

function getProfileImageCandidates(profilePicture?: string) {
  const trimmed = profilePicture?.trim();
  if (!trimmed) return [] as string[];

  const candidates = [trimmed];
  try {
    const url = new URL(trimmed);
    if (url.hostname === "external-content.duckduckgo.com") {
      const wrapped = url.searchParams.get("u");
      if (wrapped) candidates.push(decodeURIComponent(wrapped));
    }
  } catch {
    return candidates;
  }

  return Array.from(new Set(candidates));
}

function toRenderableImageUrl(profilePicture?: string) {
  const resolved = resolveProfileImageUrl(profilePicture);
  if (!resolved) return null;
  if (resolved.startsWith('data:image')) return resolved;
  if (resolved.startsWith(`${API_URL}/api/images/proxy?url=`)) return resolved;
  return `${API_URL}/api/images/proxy?url=${encodeURIComponent(resolved)}`;
}

function AvatarOrInitials({
  profilePicture,
  firstName,
  lastName,
  className,
  initialsClassName,
}: {
  profilePicture?: string;
  firstName?: string;
  lastName?: string;
  className: string;
  initialsClassName: string;
}) {
  const [imageError, setImageError] = useState(false);
  const [sourceIndex, setSourceIndex] = useState(0);
  const sources = getProfileImageCandidates(profilePicture);
  const imgSrc = toRenderableImageUrl(sources[sourceIndex]);
  const initials = `${(firstName?.[0] ?? "U").toUpperCase()}${(lastName?.[0] ?? "U").toUpperCase()}`;

  useEffect(() => {
    setImageError(false);
    setSourceIndex(0);
  }, [profilePicture]);

  if (!imgSrc || imageError) {
    return (
      <div className={`${className} bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center justify-center font-bold ${initialsClassName}`}>
        {initials}
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      alt="avatar"
      className={`${className} object-cover`}
      referrerPolicy="no-referrer"
      onError={() => {
        if (sourceIndex < sources.length - 1) {
          setSourceIndex((idx) => idx + 1);
          return;
        }
        setImageError(true);
      }}
    />
  );
}
