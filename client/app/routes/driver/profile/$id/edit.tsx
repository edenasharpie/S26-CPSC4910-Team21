import { useEffect, useState } from "react";
import { useLoaderData } from "react-router";
import {
  Button,
  Input,
  ProfileEditLayout,
  getProfileEditFieldClass,
} from "~/components";
import { getApiBaseUrl } from "~/utils/api-url";
import { requireAuth } from "~/utils/session.server";

const API_URL = getApiBaseUrl();

type DriverProfile = {
  userId: number;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phone: string;
  userType: string;
  activeStatus: number;
  profilePicture: string;
  bio: string;
  lastLogin: string | null;
};

export async function loader({ request, params }: { request: Request; params: { id?: string } }) {
  const session = requireAuth(request, ["driver"]);
  const targetId = Number(params.id);
  const sessionUserId = Number(session.UserID);

  if (!Number.isInteger(targetId)) {
    throw new Response("Invalid profile id", { status: 400 });
  }

  if (targetId !== sessionUserId) {
    throw new Response("Access forbidden", { status: 403 });
  }

  const profileRes = await fetch(`${API_URL}/api/user/profile/${targetId}`);
  if (!profileRes.ok) {
    throw new Response("Driver profile not found", { status: 404 });
  }

  const profile = await profileRes.json();
  return { targetId, profile };
}

export default function DriverProfileEdit() {
  const data = useLoaderData<typeof loader>();

  const [profile, setProfile] = useState<DriverProfile | null>(normalizeProfile(data.profile));
  const [isEditing, setIsEditing] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setProfile(normalizeProfile(data.profile));
    setIsEditing(false);
    setSuccessMessage(null);
    setErrorMessage(null);
  }, [data]);

  if (!profile) {
    return null;
  }

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

      const response = await fetch(`${API_URL}/api/user/profile/${data.targetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMessage((body as { error?: string }).error || "Failed to update profile");
        return;
      }

      setProfile(normalizeProfile(body));
      setIsEditing(false);
      setSuccessMessage("Profile updated successfully");
    } catch {
      setErrorMessage("Connection error. Please try again.");
    }
  };

  const handleEditSaveClick = () => {
    if (!isEditing) {
      setIsEditing(true);
      return;
    }

    const form = document.getElementById("driver-edit-form") as HTMLFormElement | null;
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
      backTo="/driver/dashboard"
      backLabel="Back to Dashboard"
      title={`${profile.firstName} ${profile.lastName}`.trim() || profile.username}
      subtitle={`@${profile.username}`}
      profilePicture={profile.profilePicture}
      initials={buildInitials(profile.firstName, profile.lastName)}
      profileMeta={`Last Login: ${profile.lastLogin || "Never"}`}
      successMessage={successMessage}
      errorMessage={errorMessage}
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
    >
      <form id="driver-edit-form" onSubmit={handleSave} className="space-y-8">
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
          </div>
        </div>

        <div className="pt-6 border-t border-gray-100 dark:border-gray-800 flex flex-col md:flex-row gap-6 text-left">
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase mb-1">User Type</label>
            <div className="w-full p-2 border rounded h-10.5 bg-gray-100 dark:bg-gray-800 border-transparent text-gray-500 dark:text-gray-400 cursor-not-allowed capitalize">
              {profile.userType || "driver"}
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase mb-1">Status</label>
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
          </div>
        </div>
      </form>
    </ProfileEditLayout>
  );
}

function normalizeProfile(raw: unknown): DriverProfile | null {
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
