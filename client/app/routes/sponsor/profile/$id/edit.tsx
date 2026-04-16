import { useEffect, useState } from "react";
import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/edit";
import {
  Button,
  Input,
  ProfileEditLayout,
  getProfileEditFieldClass,
} from "~/components";
import { getApiBaseUrl } from "~/utils/api-url";
import { requireAuth } from "~/utils/session.server";

const API_URL = getApiBaseUrl();

type EditMode = "self" | "driver";

type NormalizedProfile = {
  userId: number;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phone: string;
  userType: string;
  activeStatus: number;
  performanceStatus: string;
  pointBalance: number;
  profilePicture: string;
  bio: string;
  lastLogin: string | null;
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = requireAuth(request, ["sponsor"]);
  const sponsorUserId = Number(user.UserID);
  const targetId = Number(params.id);

  if (!Number.isInteger(targetId)) {
    throw new Response("Invalid profile id", { status: 400 });
  }

  const companyRes = await fetch(`${API_URL}/api/sponsors/user/${sponsorUserId}`);
  if (!companyRes.ok) {
    throw new Response("Could not determine sponsor company", { status: 500 });
  }

  const company = await companyRes.json();
  const isSelfProfile = targetId === sponsorUserId;

  if (isSelfProfile) {
    const profileRes = await fetch(`${API_URL}/api/user/profile/${targetId}`);
    if (!profileRes.ok) {
      throw new Response("Sponsor profile not found", { status: 404 });
    }

    const profile = await profileRes.json();
    return {
      mode: "self" as EditMode,
      sponsorUserId,
      targetId,
      companyName: String(company.companyName ?? ""),
      profile,
    };
  }

  const driverRes = await fetch(`${API_URL}/api/sponsors/${sponsorUserId}/drivers/${targetId}`);
  if (!driverRes.ok) {
    throw new Response("Driver not found", { status: 404 });
  }

  const profile = await driverRes.json();
  return {
    mode: "driver" as EditMode,
    sponsorUserId,
    targetId,
    companyName: String(company.companyName ?? ""),
    profile,
  };
}

export default function SponsorProfileEdit() {
  const data = useLoaderData<typeof loader>();

  const [profile, setProfile] = useState<NormalizedProfile | null>(
    normalizeProfile(data.profile)
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  useEffect(() => {
    setProfile(normalizeProfile(data.profile));
    setIsEditing(false);
    setSuccessMessage(null);
    setErrorMessage(null);
    setNewPassword("");
    setShowNewPassword(false);
  }, [data]);

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timeout = window.setTimeout(() => setSuccessMessage(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  if (!profile) {
    return null;
  }

  const title =
    data.mode === "self"
      ? `${profile.firstName} ${profile.lastName}`.trim() || profile.username
      : `Driver Profile: ${profile.firstName} ${profile.lastName}`;

  const subtitle =
    data.mode === "self"
      ? `Company: ${data.companyName}`
      : `Manage driver account for ${data.companyName}`;

  const profileMeta =
    data.mode === "self"
      ? `Last Login: ${profile.lastLogin || "Never"}`
      : `Status: ${profile.activeStatus === 1 ? "Active" : "Inactive"}`;

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const payload = {
      firstName: String(formData.get("FirstName") ?? "").trim(),
      lastName: String(formData.get("LastName") ?? "").trim(),
      email: String(formData.get("Email") ?? "").trim(),
      phone: String(formData.get("Phone") ?? "").trim(),
    };

    try {
      setErrorMessage(null);
      setSuccessMessage(null);

      const endpoint =
        data.mode === "self"
          ? `${API_URL}/api/user/profile/${data.targetId}`
          : `${API_URL}/api/sponsors/${data.sponsorUserId}/drivers/${data.targetId}`;

      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMessage(
          (body as { error?: string }).error ||
            (data.mode === "self" ? "Failed to update profile" : "Failed to update driver")
        );
        return;
      }

      const nextPassword = newPassword.trim();
      if (nextPassword) {
        const passwordResponse = await fetch(`${API_URL}/api/user/change-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: data.targetId, newPassword: nextPassword }),
        });

        const passwordResult = await passwordResponse.json().catch(() => ({}));
        if (!passwordResponse.ok) {
          setErrorMessage(
            (passwordResult as { message?: string; error?: string }).message ||
              (passwordResult as { message?: string; error?: string }).error ||
              "Failed to update password"
          );
          return;
        }
      }

      setProfile(normalizeProfile(body));
      setIsEditing(false);
      setNewPassword("");
      setShowNewPassword(false);
      setSuccessMessage(
        nextPassword
          ? data.mode === "self"
            ? "Sponsor profile and password updated successfully"
            : "Driver profile and password updated successfully"
          : data.mode === "self"
          ? "Sponsor profile updated successfully"
          : "Driver profile updated successfully"
      );
    } catch {
      setErrorMessage("Connection error. Please try again.");
    }
  };

  const handleEditSaveClick = () => {
    if (!isEditing) {
      setIsEditing(true);
      return;
    }

    const form = document.getElementById("sponsor-edit-form") as HTMLFormElement | null;
    form?.requestSubmit();
  };

  const handleDeactivateAccount = async () => {
    const currentPassword = window.prompt("Enter current password to deactivate your account:");
    if (!currentPassword) {
      return;
    }

    try {
      setIsDeactivating(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const response = await fetch(`${API_URL}/api/user/deactivate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: data.targetId,
          currentPassword,
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMessage((body as { error?: string }).error || "Failed to deactivate account");
        return;
      }

      await fetch("/logout", { method: "POST" });
      window.location.assign("/login");
    } catch {
      setErrorMessage("Connection error. Please try again.");
    } finally {
      setIsDeactivating(false);
    }
  };

  return (
    <ProfileEditLayout
      apiBaseUrl={API_URL}
      title={title}
      subtitle={subtitle}
      profilePicture={profile.profilePicture}
      initials={buildInitials(profile.firstName, profile.lastName)}
      profileMeta={profileMeta}
      successMessage={successMessage}
      errorMessage={errorMessage}
      onDismissSuccess={() => setSuccessMessage(null)}
      onDismissError={() => setErrorMessage(null)}
      actions={
        <>
          {isEditing && (
            <Button type="button" variant="secondary" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
          )}
          <Button type="button" variant="primary" onClick={handleEditSaveClick}>
            {isEditing ? "Save" : "Edit"}
          </Button>
        </>
      }
      auxiliaryContent={
        data.mode === "driver" ? (
          <div className="pt-6 border-t border-gray-100 dark:border-gray-800 text-left">
            <Link
              to={`/sponsor/profile/${profile.userId}/points`}
              className="text-indigo-600 hover:underline font-medium"
            >
              View Point Transactions
            </Link>
          </div>
        ) : null
      }
    >
      <form id="sponsor-edit-form" onSubmit={handleSave} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest text-left">Personal Info</h2>
            <Input
              label="First Name"
              name="FirstName"
              defaultValue={profile.firstName}
              disabled={!isEditing}
              className={getProfileEditFieldClass(isEditing)}
            />
            <Input
              label="Last Name"
              name="LastName"
              defaultValue={profile.lastName}
              disabled={!isEditing}
              className={getProfileEditFieldClass(isEditing)}
            />
            <Input
              label="Profile Picture URL"
              name="ProfilePicture"
              defaultValue={profile.profilePicture}
              disabled
              className={getProfileEditFieldClass(false)}
            />
          </div>

          <div className="space-y-4">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest text-left">Account and Security</h2>
            <Input
              label="Username"
              name="Username"
              defaultValue={profile.username}
              disabled
              className={getProfileEditFieldClass(false)}
            />
            <Input
              label="Email"
              name="Email"
              type="email"
              defaultValue={profile.email}
              disabled={!isEditing}
              className={getProfileEditFieldClass(isEditing)}
            />
            <Input
              label="Phone"
              name="Phone"
              defaultValue={profile.phone}
              disabled={!isEditing}
              className={getProfileEditFieldClass(isEditing)}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  disabled={!isEditing}
                  placeholder="Leave blank to keep current password"
                  className={`w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${getProfileEditFieldClass(isEditing)}`}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((previous) => !previous)}
                  disabled={!isEditing}
                  aria-label={showNewPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 px-3 text-gray-500 disabled:opacity-50"
                >
                  {showNewPassword ? (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 3l18 18" />
                      <path d="M10.58 10.58a2 2 0 102.83 2.83" />
                      <path d="M9.88 5.09A10.94 10.94 0 0112 5c7 0 10 7 10 7a17.17 17.17 0 01-4.43 5.94" />
                      <path d="M6.61 6.61A17.34 17.34 0 002 12s3 7 10 7a10.78 10.78 0 005.39-1.39" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-gray-100 dark:border-gray-800 flex flex-col md:flex-row gap-6 text-left">
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase mb-1">User Type</label>
            <div className="w-full p-2 border rounded h-10.5 bg-gray-100 dark:bg-gray-800 border-transparent text-gray-500 dark:text-gray-400 cursor-not-allowed capitalize">
              {profile.userType || (data.mode === "self" ? "sponsor" : "driver")}
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase mb-1">Status</label>
            {data.mode === "self" ? (
              <div className="flex items-center gap-3 h-10.5">
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                    profile.activeStatus === 1
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                  }`}
                >
                  Status: {profile.activeStatus === 1 ? "Active" : "Inactive"}
                </span>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={handleDeactivateAccount}
                  disabled={isDeactivating || profile.activeStatus !== 1}
                  isLoading={isDeactivating}
                >
                  Deactivate Account
                </Button>
              </div>
            ) : (
              <div className="w-full p-2 border rounded h-10.5 bg-gray-100 dark:bg-gray-800 border-transparent text-gray-500 dark:text-gray-400 cursor-not-allowed">
                {profile.activeStatus === 1 ? "Active" : "Inactive"}
              </div>
            )}
          </div>
          {data.mode === "driver" && (
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase mb-1">Performance</label>
              <div className="w-full p-2 border rounded h-10.5 bg-gray-100 dark:bg-gray-800 border-transparent text-gray-500 dark:text-gray-400 cursor-not-allowed capitalize">
                {profile.performanceStatus || "Unknown"}
              </div>
            </div>
          )}
        </div>
      </form>
    </ProfileEditLayout>
  );
}

function normalizeProfile(raw: unknown): NormalizedProfile | null {
  if (!raw || typeof raw !== "object") return null;

  const value = raw as Record<string, unknown>;
  return {
    userId: Number(value.userId ?? value.UserID ?? 0),
    firstName: String(value.firstName ?? value.FirstName ?? ""),
    lastName: String(value.lastName ?? value.LastName ?? ""),
    username: String(value.username ?? value.Username ?? ""),
    email: String(value.email ?? value.Email ?? ""),
    phone: String(value.phone ?? value.Phone ?? ""),
    userType: String(value.userType ?? value.UserType ?? ""),
    activeStatus: Number(value.activeStatus ?? value.ActiveStatus ?? 1),
    performanceStatus: String(value.performanceStatus ?? value.PerformanceStatus ?? ""),
    pointBalance: Number(value.pointBalance ?? value.PointBalance ?? 0),
    profilePicture: String(value.profilePicture ?? value.ProfilePicture ?? ""),
    bio: String(value.bio ?? value.Bio ?? ""),
    lastLogin:
      value.lastLogin === null || value.LastLogin === null
        ? null
        : String(value.lastLogin ?? value.LastLogin ?? ""),
  };
}

function buildInitials(firstName: string, lastName: string) {
  const first = firstName?.[0]?.toUpperCase() ?? "U";
  const last = lastName?.[0]?.toUpperCase() ?? "U";
  return `${first}${last}`;
}
