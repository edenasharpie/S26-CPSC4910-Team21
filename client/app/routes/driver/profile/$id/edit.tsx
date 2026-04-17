import { useEffect, useState } from "react";
import { useLoaderData } from "react-router";
import {
  Table,
  Input,
  Button,
  Badge,
  Modal,
  ProfileEditLayout,
  getProfileEditFieldClass,
} from "~/components";
import { requireAuth } from "~/utils/session.server";
import { getApiBaseUrl } from "~/utils/api-url";

const API_URL = getApiBaseUrl();

type SessionUser = {
  UserID: number;
  UserType: string;
  OriginalUser?: unknown;
};

type ProfileUser = {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  middle_name: string;
  pronouns: string;
  email: string;
  phone_number: string;
  point_to_dollar_ratio: number;
  profile_picture_url: string;
  bio: string;
  license_number: string;
  account_type: string;
  active_status: boolean;
  created_at: string;
  last_password_change: string;
  alert_points: boolean;
  alert_orders: boolean;
  alert_application_status_change: boolean;
  alert_application_entry: boolean;
  alert_profile_changes_by_admin: boolean;
};

export async function loader({ request, params }: { request: Request; params: { id?: string } }) {
  const session = (await requireAuth(request)) as SessionUser;
  const targetId = Number(params.id);

  if (!Number.isInteger(targetId)) {
    throw new Response("Invalid profile id", { status: 400 });
  }

  if (String(session.UserType).toLowerCase() !== "driver") {
    throw new Response("Forbidden", { status: 403 });
  }

  if (targetId !== Number(session.UserID)) {
    throw new Response("Access forbidden", { status: 403 });
  }

  const response = await fetch(`${API_URL}/api/user/profile/${targetId}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Response("User Not Found", { status: 404 });
  }

  const user = await response.json();
  const accountType = user.UserType
    ? `${user.UserType.charAt(0).toUpperCase()}${user.UserType.slice(1)}`
    : "User";

  let performanceStatus: string | undefined;
  const statusRes = await fetch(`${API_URL}/api/drivers/performance/${targetId}`);
  if (statusRes.ok) {
    const status = await statusRes.json();
    performanceStatus = status.performanceStatus;
  }

  const profile: ProfileUser = {
    id: user.UserID,
    username: user.Username || "",
    first_name: user.FirstName || "",
    last_name: user.LastName || "",
    middle_name: user.MiddleName || "",
    pronouns: user.Pronouns || "",
    email: user.Email,
    phone_number: user.Phone || "",
    point_to_dollar_ratio: 0,
    profile_picture_url: user.ProfilePicture || "",
    bio: user.Bio || "",
    license_number: user.LicenseNumber ?? user.licenseNumber ?? "",
    account_type: accountType,
    active_status: Boolean(user.ActiveStatus),
    created_at: user.LastLogin || new Date().toISOString(),
    last_password_change:
      user.LastPasswordChange || user.LastLogin || new Date().toISOString(),
    alert_points: Boolean(user.AlertPoints ?? true),
    alert_orders: Boolean(user.AlertOrders ?? true),
    alert_application_status_change: Boolean(user.AlertApplicationStatusChange ?? true),
    alert_application_entry: Boolean(user.AlertApplicationEntry ?? true),
    alert_profile_changes_by_admin: Boolean(user.AlertProfileChangesByAdmin ?? true),
  };

  return { user: profile, performanceStatus, session };
}

export default function DriverProfileEditPage() {
  const { user, performanceStatus } = useLoaderData<typeof loader>();
  const normalizedPerformanceStatus = (performanceStatus ?? "").toLowerCase();
  const performanceBadgeVariant =
    normalizedPerformanceStatus === "excellent"
      ? "success"
      : normalizedPerformanceStatus === "good"
      ? "info"
      : normalizedPerformanceStatus === "average"
      ? "warning"
      : normalizedPerformanceStatus === "poor"
      ? "danger"
      : "default";

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [username, setUsername] = useState(user.username || "");
  const [firstName, setFirstName] = useState(user.first_name || "");
  const [lastName, setLastName] = useState(user.last_name || "");
  const [middleName, setMiddleName] = useState(user.middle_name || "");
  const [pronouns, setPronouns] = useState(user.pronouns || "");
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone_number || "");
  const [profilePicture, setProfilePicture] = useState(
    user.profile_picture_url || ""
  );
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [bio, setBio] = useState(user.bio || "");
  const [licenseNumber, setLicenseNumber] = useState(user.license_number || "");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [deactivationPassword, setDeactivationPassword] = useState("");
  const [showDeactivationPassword, setShowDeactivationPassword] = useState(false);
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [alertPoints, setAlertPoints] = useState(Boolean(user.alert_points));
  const [alertOrders, setAlertOrders] = useState(Boolean(user.alert_orders));
  const [alertApplicationStatusChange, setAlertApplicationStatusChange] = useState(
    Boolean(user.alert_application_status_change)
  );
  const [alertApplicationEntry, setAlertApplicationEntry] = useState(
    Boolean(user.alert_application_entry)
  );
  const [alertProfileChangesByAdmin, setAlertProfileChangesByAdmin] = useState(
    Boolean(user.alert_profile_changes_by_admin)
  );

  useEffect(() => {
    setUsername(user.username || "");
    setFirstName(user.first_name || "");
    setLastName(user.last_name || "");
    setMiddleName(user.middle_name || "");
    setPronouns(user.pronouns || "");
    setEmail(user.email || "");
    setPhone(user.phone_number || "");
    setProfilePicture(user.profile_picture_url || "");
    setProfileImageFile(null);
    setBio(user.bio || "");
    setLicenseNumber(user.license_number || "");
    setAlertPoints(Boolean(user.alert_points));
    setAlertOrders(Boolean(user.alert_orders));
    setAlertApplicationStatusChange(Boolean(user.alert_application_status_change));
    setAlertApplicationEntry(Boolean(user.alert_application_entry));
    setAlertProfileChangesByAdmin(Boolean(user.alert_profile_changes_by_admin));
  }, [user]);

  const handleSaveProfile = async () => {
    setSuccessMessage(null);
    setErrorMessage(null);

    const trimmedUsername = username.trim();
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();

    if (!trimmedUsername || !trimmedFirstName || !trimmedLastName) {
      setErrorMessage("Please provide username, first name, and last name.");
      return;
    }

    try {
      setIsSavingProfile(true);
      const payload = new FormData();
      payload.set("username", trimmedUsername);
      payload.set("firstName", trimmedFirstName);
      payload.set("middleName", middleName.trim());
      payload.set("lastName", trimmedLastName);
      payload.set("pronouns", pronouns.trim());
      payload.set("email", email.trim());
      payload.set("phone", phone.trim());
      payload.set("bio", bio.trim());
      payload.set("licenseNumber", licenseNumber.trim());
      payload.set("alertPoints", String(alertPoints));
      payload.set("alertOrders", String(alertOrders));
      payload.set("alertApplicationStatusChange", String(alertApplicationStatusChange));
      payload.set("alertApplicationEntry", String(alertApplicationEntry));
      payload.set("alertProfileChangesByAdmin", String(alertProfileChangesByAdmin));

      if (profileImageFile) {
        payload.set("profileImage", profileImageFile);
      }

      const response = await fetch(`${API_URL}/api/user/profile/${user.id}`, {
        method: "PATCH",
        body: payload,
      });

      const result = await response
        .json()
        .catch(() => ({} as Record<string, string | undefined>));

      if (!response.ok) {
        setErrorMessage(result.error || "Failed to update profile");
        return;
      }

      if (typeof result.LicenseNumber === "string") {
        setLicenseNumber(result.LicenseNumber);
      } else {
        setLicenseNumber(licenseNumber.trim());
      }

      if (typeof result.ProfilePicture === "string") {
        setProfilePicture(result.ProfilePicture);
      }

      setProfileImageFile(null);

      setSuccessMessage("Profile updated successfully.");
      setIsEditingProfile(false);
      window.setTimeout(() => setSuccessMessage(null), 5000);
    } catch (_err) {
      setErrorMessage("Connection error. Please try again.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordChange = async () => {
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          currentPassword,
          newPassword,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setSuccessMessage("Password updated successfully.");
        setCurrentPassword("");
        setNewPassword("");
        setIsEditingPassword(false);
        window.setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        setErrorMessage(result.error || "Failed to update password");
      }
    } catch (_err) {
      setErrorMessage("Connection error. Please try again.");
    }
  };

  const openDeactivateModal = () => {
    setDeactivationPassword("");
    setErrorMessage(null);
    setIsDeactivateModalOpen(true);
  };

  const handleDeactivateAccount = async () => {
    if (!deactivationPassword) {
      setErrorMessage("Please enter your password to deactivate your account.");
      return;
    }

    setIsDeactivating(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`${API_URL}/api/drivers/deactivate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          currentPassword: deactivationPassword,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setErrorMessage(result.error || "Failed to deactivate account.");
        setIsDeactivating(false);
        return;
      }

      await fetch("/logout", { method: "POST" });
      window.location.assign("/login");
    } catch (_err) {
      setErrorMessage("Connection error. Please try again.");
      setIsDeactivating(false);
    }
  };

  const handleEditSaveClick = () => {
    if (!isEditingProfile) {
      setIsEditingProfile(true);
      return;
    }

    const form = document.getElementById("driver-edit-form") as HTMLFormElement | null;
    form?.requestSubmit();
  };

  const lastPasswordChange = user.last_password_change
    ? new Date(user.last_password_change).toLocaleString()
    : "Unknown";

  const profileMeta = performanceStatus
    ? `Performance: ${performanceStatus} • Last Password Change: ${lastPasswordChange}`
    : `Last Password Change: ${lastPasswordChange}`;

  return (
    <>
      <ProfileEditLayout
        apiBaseUrl={API_URL}
        title={`${firstName} ${lastName}`.trim() || username || "Driver"}
        subtitle={`@${username || "unknown"}`}
        profilePicture={profilePicture}
        initials={buildInitials(firstName, lastName)}
        profileMeta={profileMeta}
        successMessage={successMessage}
        errorMessage={errorMessage}
        onDismissSuccess={() => setSuccessMessage(null)}
        onDismissError={() => setErrorMessage(null)}
        actions={
          <>
            {isEditingProfile && (
              <Button type="button" variant="secondary" onClick={() => setIsEditingProfile(false)}>
                Cancel
              </Button>
            )}
            <Button
              type="button"
              variant="primary"
              onClick={handleEditSaveClick}
              isLoading={isSavingProfile}
              disabled={isSavingProfile}
            >
              {isEditingProfile ? "Save" : "Edit"}
            </Button>
          </>
        }
      >
        <form
          id="driver-edit-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSaveProfile();
          }}
          className="space-y-8"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
            <div className="space-y-4">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest text-left">
                Personal Info
              </h2>
              <div className="flex gap-2">
                <Input
                  label="First Name"
                  value={firstName}
                  disabled={!isEditingProfile}
                  className={getProfileEditFieldClass(isEditingProfile)}
                  onChange={(e) => setFirstName(e.target.value)}
                />
                <Input
                  label="Middle Name"
                  value={middleName}
                  disabled={!isEditingProfile}
                  className={getProfileEditFieldClass(isEditingProfile)}
                  onChange={(e) => setMiddleName(e.target.value)}
                />
              </div>
              <Input
                label="Last Name"
                value={lastName}
                disabled={!isEditingProfile}
                className={getProfileEditFieldClass(isEditingProfile)}
                onChange={(e) => setLastName(e.target.value)}
              />
              <Input
                label="Pronouns"
                value={pronouns}
                disabled={!isEditingProfile}
                className={getProfileEditFieldClass(isEditingProfile)}
                onChange={(e) => setPronouns(e.target.value)}
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Bio
                </label>
                <textarea
                  value={bio}
                  disabled={!isEditingProfile}
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                  className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${getProfileEditFieldClass(
                    isEditingProfile
                  )}`}
                  placeholder="Tell sponsors a bit about yourself"
                />
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest text-left">
                Account & Profile
              </h2>
              <Input
                label="Username"
                value={username}
                disabled={!isEditingProfile}
                className={getProfileEditFieldClass(isEditingProfile)}
                onChange={(e) => setUsername(e.target.value)}
              />
              <Input
                label="Email Address"
                value={email}
                disabled={!isEditingProfile}
                className={getProfileEditFieldClass(isEditingProfile)}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input
                label="Phone Number"
                value={phone}
                disabled={!isEditingProfile}
                className={getProfileEditFieldClass(isEditingProfile)}
                onChange={(e) => setPhone(e.target.value)}
              />
              <Input
                label="License Number"
                value={licenseNumber}
                disabled={!isEditingProfile}
                className={getProfileEditFieldClass(isEditingProfile)}
                onChange={(e) => setLicenseNumber(e.target.value)}
              />
              <Input
                label="Profile Picture Upload"
                name="profileImage"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={!isEditingProfile}
                className={getProfileEditFieldClass(isEditingProfile)}
                onChange={(e) => setProfileImageFile(e.target.files?.[0] ?? null)}
                helperText="Upload PNG, JPG, WEBP, or GIF (max 5MB)."
              />

              <div className="pt-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-600 dark:text-gray-300">Account Type</span>
                  <Badge variant="info">{user.account_type}</Badge>
                </div>
                {performanceStatus && (
                  <div className="flex items-center justify-between text-sm mt-2">
                    <span className="font-medium text-gray-600 dark:text-gray-300">
                      Performance
                    </span>
                    <Badge variant={performanceBadgeVariant} size="md" className="capitalize">
                      {performanceStatus}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Security</h3>
              {!isEditingPassword ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setIsEditingPassword(true)}
                >
                  Change Password
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingPassword(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handlePasswordChange}
                  >
                    Update Password
                  </Button>
                </div>
              )}
            </div>

            {isEditingPassword && (
              <div className="space-y-4 mt-4 bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                <div className="space-y-1">
                  <div className="relative flex flex-col">
                    <Input
                      type={showCurrentPassword ? "text" : "password"}
                      label="Current Password"
                      placeholder="••••••••"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                    <div className="absolute top-0 bottom-0 right-3 flex items-center">
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors mt-6"
                        aria-label={
                          showCurrentPassword
                            ? "Hide current password"
                            : "Show current password"
                        }
                      >
                        {showCurrentPassword ? (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="w-5 h-5"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                          </svg>
                        ) : (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="w-5 h-5"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="relative flex flex-col">
                    <Input
                      type={showNewPassword ? "text" : "password"}
                      label="New Password"
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <div className="absolute top-0 bottom-0 right-3 flex items-center">
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors mt-6"
                        aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                      >
                        {showNewPassword ? (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="w-5 h-5"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                          </svg>
                        ) : (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="w-5 h-5"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-red-200 dark:border-red-900 p-6 bg-red-50/40 dark:bg-red-950/20">
            <h3 className="text-xl font-bold text-red-600 dark:text-red-400">
              Danger Zone
            </h3>
            <p className="text-sm text-gray-500 mt-2 mb-4">
              Deactivating your account will disable your access immediately.
            </p>
            <Button type="button" variant="danger" onClick={openDeactivateModal}>
              Deactivate Account
            </Button>
          </div>

          <div className="card p-6">
            <h3 className="text-xl font-bold mb-4">Notification Preferences</h3>
            <div className="space-y-3">
              <ToggleRow label="Points" checked={alertPoints} disabled={!isEditingProfile} onChange={setAlertPoints} />
              <ToggleRow label="Orders" checked={alertOrders} disabled={!isEditingProfile} onChange={setAlertOrders} />
              <ToggleRow
                label="Change In Application Status"
                checked={alertApplicationStatusChange}
                disabled={!isEditingProfile}
                onChange={setAlertApplicationStatusChange}
              />
              <ToggleRow
                label="Application Entry"
                checked={alertApplicationEntry}
                disabled={!isEditingProfile}
                onChange={setAlertApplicationEntry}
              />
              <ToggleRow
                label="Changes To Profile By Admin"
                checked={alertProfileChangesByAdmin}
                disabled={!isEditingProfile}
                onChange={setAlertProfileChangesByAdmin}
              />
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-xl font-bold mb-4">Recent Activity</h3>
            <Table
              data={[]}
              columns={[
                { key: "event", header: "Event" },
                { key: "date", header: "Date" },
                { key: "status", header: "Status" },
              ]}
              emptyMessage="No recent activity to display"
            />
          </div>
        </form>
      </ProfileEditLayout>

      <Modal
        isOpen={isDeactivateModalOpen}
        onClose={() => setIsDeactivateModalOpen(false)}
        title="Deactivate Account"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Enter your current password to confirm account deactivation.
          </p>
          <div className="relative flex flex-col">
            <Input
              type={showDeactivationPassword ? "text" : "password"}
              label="Current Password"
              placeholder="••••••••"
              value={deactivationPassword}
              onChange={(e) => setDeactivationPassword(e.target.value)}
            />
            <div className="absolute top-0 bottom-0 right-3 flex items-center">
              <button
                type="button"
                onClick={() => setShowDeactivationPassword(!showDeactivationPassword)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors mt-6"
                aria-label={showDeactivationPassword ? "Hide password" : "Show password"}
              >
                {showDeactivationPassword ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-5 h-5"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-5 h-5"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsDeactivateModalOpen(false)}
              disabled={isDeactivating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleDeactivateAccount}
              isLoading={isDeactivating}
            >
              Confirm Deactivate
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function ToggleRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-md border border-gray-200 dark:border-gray-800 px-3 py-2">
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
          checked ? "bg-indigo-600" : "bg-gray-300 dark:bg-gray-700"
        } disabled:opacity-50`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </label>
  );
}

function buildInitials(firstName: string, lastName: string) {
  const first = firstName.trim().charAt(0);
  const last = lastName.trim().charAt(0);
  const initials = `${first}${last}`.toUpperCase();
  return initials || "DR";
}