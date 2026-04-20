import type { Route } from "./+types/dashboard";
import { useEffect, useState } from "react";
import { Table, Input, Button, Badge, Modal } from "~/components";
import { useNavigate, useLoaderData, Form, useActionData, redirect } from "react-router";
import {
  requireAuth,
  signToken,
  buildSetCookieHeader,
  buildAssumedSession,
  ROLE_HOME,
} from "~/utils/session.server";
import { getApiBaseUrl } from "~/utils/api-url";

const API_URL = getApiBaseUrl();
const ADMIN_USERS_PAGE_SIZE = 25;
const DEFAULT_AUDIT_EVENT_FILTERS: string[] = [
  "LoginAttempt",
  "PasswordChange",
  "AccountUpdate",
  "AccountStatusChange",
  "ApplicationStatusUpdate",
  "PointTransaction",
  "ReviewModerationEvent",
];

function normalizeFilterValue(value: string | null, allowed: string[], fallback: string): string {
  const normalized = (value ?? fallback).trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function parsePage(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

// ---------------------------------------------------------------------------
// Loader — fetch all users from the Express API
// ---------------------------------------------------------------------------
export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireAuth(request, ["admin"]);
  const requestUrl = new URL(request.url);
  const page = parsePage(requestUrl.searchParams.get("page"));
  const search = (requestUrl.searchParams.get("search") ?? "").trim();
  const userType = normalizeFilterValue(requestUrl.searchParams.get("userType"), ["all", "driver", "sponsor", "admin"], "all");
  const activeStatus = normalizeFilterValue(requestUrl.searchParams.get("activeStatus"), ["all", "1", "0"], "all");

  const offset = (page - 1) * ADMIN_USERS_PAGE_SIZE;
  const userParams = new URLSearchParams({
    limit: String(ADMIN_USERS_PAGE_SIZE),
    offset: String(offset),
    activeStatus,
  });

  if (search) {
    userParams.set("search", search);
  }

  if (userType !== "all") {
    userParams.set("userType", userType);
  }

  try {
    const res = await fetch(`${API_URL}/api/admin/users?${userParams.toString()}`);
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
      totalCount: Number(data.totalCount ?? 0),
      page,
      pageSize: Number(data.limit ?? ADMIN_USERS_PAGE_SIZE),
      filters: {
        search,
        userType,
        activeStatus,
      },
      companies: Array.isArray(companies) ? companies : [],
      session,
      error: null as string | null,
    };
  } catch (error: any) {
    return {
      users: [] as any[],
      totalCount: 0,
      page,
      pageSize: ADMIN_USERS_PAGE_SIZE,
      filters: {
        search,
        userType,
        activeStatus,
      },
      session,
      companies: [] as any[],
      error: error.message as string,
    };
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
    password:   fd.get("password"),
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
  const { users, totalCount, page, pageSize, filters, companies, error, session } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const isAssumedMode = Boolean(session?.OriginalUser);

  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen]     = useState(false);
  const [selectedType, setSelectedType]   = useState("driver");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [auditUserType, setAuditUserType] = useState("all");
  const [auditTargetUserId, setAuditTargetUserId] = useState("");
  const [auditEventFilters, setAuditEventFilters] = useState<string[]>([...DEFAULT_AUDIT_EVENT_FILTERS]);
  const [auditLoginOutcome, setAuditLoginOutcome] = useState<"" | "success" | "failure">("");
  const [auditPointUserScope, setAuditPointUserScope] = useState<"any" | "changedBy" | "affected">("any");
  const [showAddUserPassword, setShowAddUserPassword] = useState(false);
  const [tableUsers, setTableUsers] = useState<any[]>(users);
  const [isSponsorRatioModalOpen, setIsSponsorRatioModalOpen] = useState(false);
  const [selectedSponsorForRatio, setSelectedSponsorForRatio] = useState<any | null>(null);
  const [sponsorRatioInput, setSponsorRatioInput] = useState("");
  const [isSavingSponsorRatio, setIsSavingSponsorRatio] = useState(false);
  const [sponsorRatioError, setSponsorRatioError] = useState<string | null>(null);

  useEffect(() => {
    setTableUsers(users);
  }, [users]);

  const isLoginAttemptsSelected = auditEventFilters.includes("LoginAttempt");
  const isPointTransactionsSelected = auditEventFilters.includes("PointTransaction");

  const totalPages = Math.max(1, Math.ceil(totalCount / Math.max(pageSize, 1)));
  const hasPrevPage = page > 1;
  const hasNextPage = page < totalPages;
  const pageStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = totalCount === 0 ? 0 : pageStart + tableUsers.length - 1;

  const navigateToPage = (nextPage: number) => {
    if (nextPage < 1 || nextPage > totalPages) return;

    const query = new URLSearchParams();
    query.set("page", String(nextPage));

    if (filters.search) {
      query.set("search", filters.search);
    }

    if (filters.userType !== "all") {
      query.set("userType", filters.userType);
    }

    if (filters.activeStatus !== "all") {
      query.set("activeStatus", filters.activeStatus);
    }

    navigate(`?${query.toString()}`);
  };

  // Count stats
  const totalUsers   = totalCount;
  const driverCount  = tableUsers.filter((u: any) => u.UserType?.toLowerCase() === "driver"  && u.ActiveStatus !== 0).length;
  const sponsorCount = tableUsers.filter((u: any) => u.UserType?.toLowerCase() === "sponsor" && u.ActiveStatus !== 0).length;
  const adminCount   = tableUsers.filter((u: any) => u.UserType?.toLowerCase() === "admin"   && u.ActiveStatus !== 0).length;
  const inactiveCount = tableUsers.filter((u: any) => u.ActiveStatus === 0).length;
  const totalPoints = tableUsers.filter((u: any) => u.UserType?.toLowerCase() === "driver").reduce((sum: number, u: any) => sum + (u.PointBalance ?? 0), 0);

  const auditUsersByType = tableUsers
    .filter((u: any) => {
      const type = String(u.UserType ?? "").toLowerCase();
      return auditUserType === "all" || type === auditUserType;
    })
    .sort((a: any, b: any) => {
      const aName = `${a.LastName ?? ""} ${a.FirstName ?? ""} ${a.Username ?? ""}`.trim().toLowerCase();
      const bName = `${b.LastName ?? ""} ${b.FirstName ?? ""} ${b.Username ?? ""}`.trim().toLowerCase();
      return aName.localeCompare(bName);
    });

  // Close add-user modal on successful action
  const addUserSuccess = (actionData as any)?.success === true;

  const openSponsorRatioModal = (user: any) => {
    setSponsorRatioError(null);
    setIsSponsorRatioModalOpen(true);

    const sponsorCompanyId = Number(user.SponsorCompanyID ?? user.sponsorCompanyId ?? 0);
    const currentRatio = Number(user.SponsorPointDollarValue ?? user.PointDollarValue ?? 0.01);

    setSelectedSponsorForRatio({
      ...user,
      SponsorCompanyID: Number.isInteger(sponsorCompanyId) ? sponsorCompanyId : null,
      SponsorPointDollarValue: Number.isFinite(currentRatio) ? currentRatio : 0.01,
    });
    setSponsorRatioInput(Number.isFinite(currentRatio) ? currentRatio.toFixed(2) : "0.01");
  };

  const handleSaveSponsorRatio = async () => {
    if (!selectedSponsorForRatio) {
      return;
    }

    const parsedRatio = Number.parseFloat(sponsorRatioInput);
    if (!Number.isFinite(parsedRatio) || parsedRatio <= 0) {
      setSponsorRatioError("Point-to-dollar ratio must be a positive number.");
      return;
    }

    const sponsorCompanyId = Number(selectedSponsorForRatio.SponsorCompanyID ?? selectedSponsorForRatio.sponsorCompanyId);
    if (!Number.isInteger(sponsorCompanyId)) {
      setSponsorRatioError("This sponsor is not linked to a valid company.");
      return;
    }

    try {
      setIsSavingSponsorRatio(true);
      setSponsorRatioError(null);

      const response = await fetch(`${API_URL}/api/sponsors/${sponsorCompanyId}/point-dollar-value`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pointDollarValue: parsedRatio }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSponsorRatioError((payload as { error?: string }).error || "Failed to update point-to-dollar ratio.");
        return;
      }

      const updatedRatio = Number((payload as { pointDollarValue?: number }).pointDollarValue ?? parsedRatio);
      setTableUsers((previous) =>
        previous.map((u) =>
          Number(u.UserID) === Number(selectedSponsorForRatio.UserID)
            ? { ...u, SponsorPointDollarValue: updatedRatio }
            : u
        )
      );

      setIsSponsorRatioModalOpen(false);
      setSelectedSponsorForRatio(null);
    } catch {
      setSponsorRatioError("Failed to update point-to-dollar ratio.");
    } finally {
      setIsSavingSponsorRatio(false);
    }
  };

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
        const userType = String(user.UserType ?? "").toLowerCase();

        if (userType === "sponsor") {
          return (
            <button
              type="button"
              onClick={() => openSponsorRatioModal(user)}
              className="group flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 hover:border-blue-400 transition-all"
            >
              <span className="text-sm font-bold text-blue-700 dark:text-blue-300">Edit</span>
              <span className="text-[10px] uppercase tracking-tighter text-blue-400 font-bold">
                Ratio
              </span>
            </button>
          );
        }

        if (userType !== "driver") {
          return <span className="text-gray-300 pl-4">—</span>;
        }

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
      header: "",
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
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
                  Admin Portal
                </h1>
                <p className="text-gray-500 text-sm mt-1 font-medium italic">
                  System administration and user oversight.
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
              <span className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">{totalPoints.toLocaleString()}</span>
              <span className="text-xs uppercase tracking-tight text-indigo-600 dark:text-indigo-400 font-semibold">Total<br/>Points</span>
            </div>
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
                onClick={() => {
                  setAuditEventFilters([...DEFAULT_AUDIT_EVENT_FILTERS]);
                  setIsAuditOpen(true);
                }}
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
              <Button
                variant="secondary"
                onClick={() => navigate("/admin/debug-navigation")}
                className="w-full py-4 text-sm font-bold bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 transition-all shadow-sm"
              >
                Internal Debug Routes
              </Button>
            </div>
          </aside>

          {/* Main Content */}
          <main className="lg:col-span-9 space-y-6">
            {/* Filters row */}
            <Form method="get" className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <input type="hidden" name="page" value="1" />
              <div className="md:col-span-4">
                <Input
                  name="search"
                  placeholder="Search users..."
                  defaultValue={filters.search}
                />
              </div>
              <div className="md:col-span-3">
                <select
                  name="userType"
                  defaultValue={filters.userType}
                  className="w-full h-10 px-3 rounded-md border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">All Types</option>
                  <option value="driver">Drivers</option>
                  <option value="sponsor">Sponsors</option>
                  <option value="admin">Admins</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <select
                  name="activeStatus"
                  defaultValue={filters.activeStatus}
                  className="w-full h-10 px-3 rounded-md border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="1">Active Only</option>
                  <option value="0">Inactive Only</option>
                </select>
              </div>
              <div className="md:col-span-1">
                <Button
                  type="submit"
                  variant="secondary"
                  className="w-full h-10"
                >
                  Apply
                </Button>
              </div>
              <div className="md:col-span-2">
                <Button
                  type="button"
                  variant="primary"
                  className="w-full h-10 whitespace-nowrap text-sm"
                  onClick={() => setIsAddUserOpen(true)}
                >
                  Add User
                </Button>
              </div>
            </Form>

            {/* Users table */}
            <div className="bg-white dark:bg-gray-900 shadow-md rounded-xl border dark:border-gray-800 overflow-hidden text-left">
              <Table data={tableUsers} columns={columns} />
              {tableUsers.length === 0 && (
                <div className="p-8 text-center text-gray-500 italic">
                  No users found matching your criteria.
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Showing {pageStart}-{pageEnd} of {totalCount}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!hasPrevPage}
                    onClick={() => navigateToPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-300 min-w-20 text-center">
                    Page {page} / {totalPages}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!hasNextPage}
                    onClick={() => navigateToPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
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
              User Group
            </label>
            <select
              name="targetUserType"
              value={auditUserType}
              onChange={(e) => {
                setAuditUserType(e.target.value);
                setAuditTargetUserId("");
              }}
              className="w-full p-2 border rounded-md dark:bg-gray-800 dark:border-gray-700 text-sm"
            >
              <option value="all">All Users</option>
              <option value="admin">All Admins</option>
              <option value="driver">All Drivers</option>
              <option value="sponsor">All Sponsors</option>
            </select>
          </div>

          <div className="space-y-1 text-left">
            <label className="text-xs font-bold text-gray-400 uppercase">
              Specific User (Optional)
            </label>
            <select
              name="targetUserId"
              value={auditTargetUserId}
              onChange={(e) => setAuditTargetUserId(e.target.value)}
              className="w-full p-2 border rounded-md dark:bg-gray-800 dark:border-gray-700 text-sm"
            >
              <option value="">All Users in Selected Group</option>
              {auditUsersByType.map((u: any) => (
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
              <AuditOption
                label="Login Attempts"
                name="filter"
                value="LoginAttempt"
                checked={auditEventFilters.includes("LoginAttempt")}
                onCheckedChange={(checked) => {
                  setAuditEventFilters((prev) => {
                    if (checked) return prev.includes("LoginAttempt") ? prev : [...prev, "LoginAttempt"];
                    return prev.filter((v) => v !== "LoginAttempt");
                  });
                  if (!checked) {
                    setAuditLoginOutcome("");
                  }
                }}
              />
              <AuditOption
                label="Password Changes"
                name="filter"
                value="PasswordChange"
                checked={auditEventFilters.includes("PasswordChange")}
                onCheckedChange={(checked) => {
                  setAuditEventFilters((prev) => {
                    if (checked) return prev.includes("PasswordChange") ? prev : [...prev, "PasswordChange"];
                    return prev.filter((v) => v !== "PasswordChange");
                  });
                }}
              />
              <AuditOption
                label="Account Updates"
                name="filter"
                value="AccountUpdate"
                checked={auditEventFilters.includes("AccountUpdate")}
                onCheckedChange={(checked) => {
                  setAuditEventFilters((prev) => {
                    if (checked) return prev.includes("AccountUpdate") ? prev : [...prev, "AccountUpdate"];
                    return prev.filter((v) => v !== "AccountUpdate");
                  });
                }}
              />
              <AuditOption
                label="Account Status Changes"
                name="filter"
                value="AccountStatusChange"
                checked={auditEventFilters.includes("AccountStatusChange")}
                onCheckedChange={(checked) => {
                  setAuditEventFilters((prev) => {
                    if (checked) return prev.includes("AccountStatusChange") ? prev : [...prev, "AccountStatusChange"];
                    return prev.filter((v) => v !== "AccountStatusChange");
                  });
                }}
              />
              <AuditOption
                label="Application Updates"
                name="filter"
                value="ApplicationStatusUpdate"
                checked={auditEventFilters.includes("ApplicationStatusUpdate")}
                onCheckedChange={(checked) => {
                  setAuditEventFilters((prev) => {
                    if (checked) return prev.includes("ApplicationStatusUpdate") ? prev : [...prev, "ApplicationStatusUpdate"];
                    return prev.filter((v) => v !== "ApplicationStatusUpdate");
                  });
                }}
              />
              <AuditOption
                label="Point Transactions"
                name="filter"
                value="PointTransaction"
                checked={auditEventFilters.includes("PointTransaction")}
                onCheckedChange={(checked) => {
                  setAuditEventFilters((prev) => {
                    if (checked) return prev.includes("PointTransaction") ? prev : [...prev, "PointTransaction"];
                    return prev.filter((v) => v !== "PointTransaction");
                  });
                  if (!checked) {
                    setAuditPointUserScope("any");
                  }
                }}
              />
              <AuditOption
                label="Review Moderation"
                name="filter"
                value="ReviewModerationEvent"
                checked={auditEventFilters.includes("ReviewModerationEvent")}
                onCheckedChange={(checked) => {
                  setAuditEventFilters((prev) => {
                    if (checked) return prev.includes("ReviewModerationEvent") ? prev : [...prev, "ReviewModerationEvent"];
                    return prev.filter((v) => v !== "ReviewModerationEvent");
                  });
                }}
              />
            </div>

            {isLoginAttemptsSelected && (
              <div className="ml-1 mt-3 rounded-md border border-gray-200 dark:border-gray-700 p-3 space-y-2 text-left">
                <p className="text-xs font-bold text-gray-500 uppercase">Login Attempt Result</p>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="loginOutcome"
                    value=""
                    checked={auditLoginOutcome === ""}
                    onChange={() => setAuditLoginOutcome("")}
                  />
                  All login attempts
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="loginOutcome"
                    value="success"
                    checked={auditLoginOutcome === "success"}
                    onChange={() => setAuditLoginOutcome("success")}
                  />
                  Successful only
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="loginOutcome"
                    value="failure"
                    checked={auditLoginOutcome === "failure"}
                    onChange={() => setAuditLoginOutcome("failure")}
                  />
                  Failed only
                </label>
              </div>
            )}

            {isPointTransactionsSelected && (
              <div className="ml-1 mt-3 rounded-md border border-gray-200 dark:border-gray-700 p-3 space-y-2 text-left">
                <p className="text-xs font-bold text-gray-500 uppercase">Point Transaction Filter Scope</p>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="pointUserScope"
                    value="any"
                    checked={auditPointUserScope === "any"}
                    onChange={() => setAuditPointUserScope("any")}
                  />
                  Either changed by or affected user
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="pointUserScope"
                    value="changedBy"
                    checked={auditPointUserScope === "changedBy"}
                    onChange={() => setAuditPointUserScope("changedBy")}
                  />
                  User who made the change
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="pointUserScope"
                    value="affected"
                    checked={auditPointUserScope === "affected"}
                    onChange={() => setAuditPointUserScope("affected")}
                  />
                  User affected by the change
                </label>
              </div>
            )}
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
            >
              Generate
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal
        isOpen={isSponsorRatioModalOpen}
        onClose={() => {
          if (isSavingSponsorRatio) {
            return;
          }
          setIsSponsorRatioModalOpen(false);
          setSelectedSponsorForRatio(null);
          setSponsorRatioError(null);
        }}
        title="Edit Sponsor Point-to-Dollar Ratio"
      >
        <div className="space-y-4 text-left">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {selectedSponsorForRatio
              ? `Update ratio for ${selectedSponsorForRatio.FirstName} ${selectedSponsorForRatio.LastName} (${selectedSponsorForRatio.Username}).`
              : "Update sponsor point-to-dollar ratio."}
          </p>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Point to Dollar Ratio</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={sponsorRatioInput}
              onChange={(e) => setSponsorRatioInput(e.target.value)}
              className="w-full rounded-md border border-gray-200 dark:border-gray-700 p-2 text-sm bg-white dark:bg-gray-800"
              disabled={isSavingSponsorRatio}
            />
          </div>

          {sponsorRatioError && <p className="text-sm text-red-600">{sponsorRatioError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setIsSponsorRatioModalOpen(false);
                setSelectedSponsorForRatio(null);
                setSponsorRatioError(null);
              }}
              disabled={isSavingSponsorRatio}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleSaveSponsorRatio}
              isLoading={isSavingSponsorRatio}
            >
              Save Ratio
            </Button>
          </div>
        </div>
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
          <div className="space-y-1">
            <div className="relative flex flex-col">
              <Input
                label="Password"
                name="password"
                type={showAddUserPassword ? "text" : "password"}
                required
                placeholder="At least 10 chars with upper/lower/special"
              />
              <div className="absolute top-0 bottom-0 right-3 flex items-center">
                <button
                  type="button"
                  onClick={() => setShowAddUserPassword(!showAddUserPassword)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors mt-6"
                  aria-label={showAddUserPassword ? "Hide password" : "Show password"}
                >
                  {showAddUserPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
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
  checked,
  onCheckedChange,
}: {
  label: string;
  name: string;
  value: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg border dark:border-gray-800 cursor-pointer transition-colors text-left">
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        onChange={(event) => onCheckedChange?.(event.target.checked)}
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
  if (resolved.startsWith('/api/images/u/')) return `${API_URL}${resolved}`;
  if (resolved.startsWith('api/images/u/')) return `${API_URL}/${resolved}`;
  if (resolved.startsWith(`${API_URL}/api/images/u/`)) return resolved;
  if (resolved.startsWith('/')) return `${API_URL}${resolved}`;
  if (resolved.startsWith(`${API_URL}/api/images/proxy?url=`)) return resolved;
  if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
    return `${API_URL}/api/images/proxy?url=${encodeURIComponent(resolved)}`;
  }
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
