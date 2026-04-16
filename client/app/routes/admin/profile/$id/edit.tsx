import { useEffect, useState } from "react";
import { useLoaderData, useNavigate, useParams } from "react-router";
import type { Route } from "./+types/edit";
import {
  Button,
  Input,
  ProfileEditLayout,
  getProfileEditFieldClass,
} from "~/components";
import { requireAuth } from "~/utils/session.server";
import { getApiBaseUrl } from "~/utils/api-url";

const BASE_URL = getApiBaseUrl();

type NormalizedUser = {
  userId: number;
  username: string;
  email: string;
  phone: string;
  firstName: string;
  middleName: string;
  lastName: string;
  pronouns: string;
  profilePicture: string;
  bio: string;
  userType: string;
  accountType: string;
  activeStatus: number;
  lastLogin: string | null;
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const session = await requireAuth(request, ["admin"]);
  const res = await fetch(`${BASE_URL}/api/admin/users/${params.id}`);
  if (!res.ok) {
    throw new Response("User not found", { status: 404 });
  }

  const user = await res.json();
  return { user, sessionUserId: Number(session.UserID) };
}

export default function EditUserProfile() {
  const { id } = useParams();
  const { user: loaderUser, sessionUserId } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const [user, setUser] = useState<NormalizedUser | null>(normalizeUser(loaderUser));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  useEffect(() => {
    setUser(normalizeUser(loaderUser));
    setLoading(false);
    setError(null);
    setNewPassword("");
    setShowNewPassword(false);
  }, [loaderUser]);

  const fetchUser = async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${BASE_URL}/api/admin/users/${id}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("User not found");
        }
        throw new Error(`HTTP error: ${response.status}`);
      }
      const data = await response.json();
      setUser(normalizeUser(data));
    } catch (fetchError: unknown) {
      if (fetchError instanceof Error) {
        setError(fetchError.message || "Failed to fetch user");
      } else {
        setError("Failed to fetch user");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!id) return;

    try {
      setError(null);
      setSuccessMessage(null);

      const formData = new FormData(event.currentTarget);
      const updates = {
        username: String(formData.get("Username") ?? ""),
        email: String(formData.get("Email") ?? ""),
        phone: String(formData.get("Phone") ?? ""),
        firstName: String(formData.get("FirstName") ?? ""),
        middleName: String(formData.get("MiddleName") ?? ""),
        lastName: String(formData.get("LastName") ?? ""),
        pronouns: String(formData.get("Pronouns") ?? ""),
        profilePicture: String(formData.get("ProfilePicture") ?? ""),
        bio: String(formData.get("Bio") ?? ""),
        activeStatus: formData.get("ActiveStatus") === "1" ? 1 : 0,
        ...(newPassword.trim() ? { password: newPassword.trim() } : {}),
      };

      const response = await fetch(`${BASE_URL}/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        setError((errData as { error?: string }).error || "Failed to update user");
        return;
      }

      setSuccessMessage("Profile updated successfully");
      setIsEditing(false);
      setNewPassword("");
      setShowNewPassword(false);
      await fetchUser();
    } catch {
      setError("Failed to update user. Please try again.");
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    if (!confirm("Permanently delete this user?")) return;

    try {
      setError(null);
      const response = await fetch(`${BASE_URL}/api/admin/users/${id}`, {
        method: "DELETE",
      });

      if (response.ok || response.status === 204) {
        navigate("/admin/dashboard");
        return;
      }

      const errData = await response.json().catch(() => ({}));
      setError((errData as { error?: string }).error || "Failed to delete user");
    } catch {
      setError("Failed to delete user. Please try again.");
    }
  };

  const handleEditSaveClick = () => {
    if (!isEditing) {
      setIsEditing(true);
      return;
    }

    const form = document.getElementById("admin-edit-form") as HTMLFormElement | null;
    form?.requestSubmit();
  };

  if (loading) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <div className="text-center text-gray-500">Loading user data...</div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      </div>
    );
  }

  if (!user) return null;

  const isOwnProfile = Number(user.userId) === Number(sessionUserId);

  const handleDeactivateAccount = async () => {
    const currentPassword = window.prompt("Enter current password to deactivate your account:");
    if (!currentPassword) {
      return;
    }

    try {
      setIsDeactivating(true);
      setError(null);
      setSuccessMessage(null);

      const response = await fetch(`${BASE_URL}/api/user/deactivate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.userId,
          currentPassword,
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError((body as { error?: string }).error || "Failed to deactivate account");
        return;
      }

      await fetch("/logout", { method: "POST" });
      window.location.assign("/login");
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setIsDeactivating(false);
    }
  };

  return (
    <ProfileEditLayout
      apiBaseUrl={BASE_URL}
      title={`${user.firstName} ${user.lastName}`.trim() || user.username}
      subtitle={`@${user.username}`}
      profilePicture={user.profilePicture}
      initials={buildInitials(user.firstName, user.lastName)}
      profileMeta={`Last Login: ${user.lastLogin || "Never"}`}
      successMessage={successMessage}
      errorMessage={error}
      onDismissSuccess={() => setSuccessMessage(null)}
      onDismissError={() => setError(null)}
      actions={
        <>
          {isEditing && !isOwnProfile && (
            <Button
              type="button"
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete User
            </Button>
          )}
          {isEditing && (
            <Button type="button" variant="secondary" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
          )}
          <Button type="button" onClick={handleEditSaveClick} variant="primary">
            {isEditing ? "Save" : "Edit"}
          </Button>
        </>
      }
    >
      <form id="admin-edit-form" onSubmit={handleUpdate} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest text-left">Personal Info</h2>
            <div className="flex gap-2">
              <Input
                label="First Name"
                name="FirstName"
                defaultValue={user.firstName}
                disabled={!isEditing}
                className={getProfileEditFieldClass(isEditing)}
              />
              <Input
                label="Middle"
                name="MiddleName"
                defaultValue={user.middleName}
                disabled={!isEditing}
                className={getProfileEditFieldClass(isEditing)}
              />
              <Input
                label="Last Name"
                name="LastName"
                defaultValue={user.lastName}
                disabled={!isEditing}
                className={getProfileEditFieldClass(isEditing)}
              />
            </div>
            <Input
              label="Pronouns"
              name="Pronouns"
              defaultValue={user.pronouns}
              disabled={!isEditing}
              className={getProfileEditFieldClass(isEditing)}
            />
            <Input
              label="Bio"
              name="Bio"
              defaultValue={user.bio}
              disabled={!isEditing}
              className={getProfileEditFieldClass(isEditing)}
            />
            <Input
              label="Profile Picture URL"
              name="ProfilePicture"
              defaultValue={user.profilePicture}
              disabled={!isEditing}
              className={getProfileEditFieldClass(isEditing)}
            />
          </div>

          <div className="space-y-4">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest text-left">Account and Security</h2>
            <Input
              label="Username"
              name="Username"
              defaultValue={user.username}
              disabled={!isEditing}
              className={getProfileEditFieldClass(isEditing)}
            />
            <Input
              label="Email"
              name="Email"
              defaultValue={user.email}
              disabled={!isEditing}
              className={getProfileEditFieldClass(isEditing)}
            />
            <Input
              label="Phone"
              name="Phone"
              defaultValue={user.phone}
              disabled={!isEditing}
              className={getProfileEditFieldClass(isEditing)}
            />
            {['driver', 'sponsor'].includes(String(user.userType ?? '').toLowerCase()) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
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
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
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
            )}
          </div>
        </div>

        <div className="pt-6 border-t border-gray-100 dark:border-gray-800 flex flex-col md:flex-row gap-6 text-left">
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase mb-1">User Type</label>
            <div className="w-full p-2 border rounded h-10.5 bg-gray-100 dark:bg-gray-800 border-transparent text-gray-500 dark:text-gray-400 cursor-not-allowed">
              {user.accountType}
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase mb-1">Status</label>
            {isOwnProfile ? (
              <div className="flex items-center gap-3 h-10.5">
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                    user.activeStatus === 1
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                  }`}
                >
                  Status: {user.activeStatus === 1 ? "Active" : "Inactive"}
                </span>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={handleDeactivateAccount}
                  disabled={isDeactivating || user.activeStatus !== 1}
                  isLoading={isDeactivating}
                >
                  Deactivate Account
                </Button>
              </div>
            ) : (
              <select
                name="ActiveStatus"
                defaultValue={String(user.activeStatus)}
                disabled={!isEditing}
                className={`w-full p-2 border rounded h-10.5 outline-none ${getProfileEditFieldClass(isEditing)}`}
              >
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            )}
          </div>
        </div>
      </form>
    </ProfileEditLayout>
  );
}

function normalizeUser(raw: unknown): NormalizedUser | null {
  if (!raw || typeof raw !== "object") return null;

  const user = raw as Record<string, unknown>;

  return {
    userId: Number(user.userId ?? user.UserID ?? 0),
    username: String(user.username ?? user.Username ?? ""),
    email: String(user.email ?? user.Email ?? ""),
    phone: String(user.phone ?? user.Phone ?? ""),
    firstName: String(user.firstName ?? user.FirstName ?? ""),
    middleName: String(user.middleName ?? user.MiddleName ?? ""),
    lastName: String(user.lastName ?? user.LastName ?? ""),
    pronouns: String(user.pronouns ?? user.Pronouns ?? ""),
    profilePicture: String(user.profilePicture ?? user.ProfilePicture ?? ""),
    bio: String(user.bio ?? user.Bio ?? ""),
    userType: String(user.userType ?? user.UserType ?? ""),
    accountType: String(user.accountType ?? user.userType ?? user.UserType ?? ""),
    activeStatus: Number(user.activeStatus ?? user.ActiveStatus ?? 1),
    lastLogin:
      user.lastLogin === null || user.LastLogin === null
        ? null
        : String(user.lastLogin ?? user.LastLogin ?? ""),
  };
}

function buildInitials(firstName: string, lastName: string) {
  const first = firstName?.[0]?.toUpperCase() ?? "U";
  const last = lastName?.[0]?.toUpperCase() ?? "U";
  return `${first}${last}`;
}
