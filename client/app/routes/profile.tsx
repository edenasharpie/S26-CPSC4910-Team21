// app/routes/profile.tsx
import { useState, useEffect } from "react";
import { useLoaderData, useActionData, Form, useSubmit, Link } from "react-router";
import type { Route } from "./+types/profile";
import { Table, Input, Button, Badge, Alert, Modal } from "~/components";
import { requireAuth } from "~/utils/session.server";
import { getApiBaseUrl } from "~/utils/api-url";

const API_URL = getApiBaseUrl();

// 1. THE LOADER: This pulls real data from the DB before the page renders
export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireAuth(request);
  const userId = session.UserID;

  const response = await fetch(`${API_URL}/api/user/profile/${userId}`, {
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
  if (session.UserType === "driver") {
    const statusRes = await fetch(`${API_URL}/api/drivers/performance/${userId}`);
    if (statusRes.ok) {
      const status = await statusRes.json();
      performanceStatus = status.performanceStatus;
    }
  }

  const profile = {
    id: user.UserID,
    username: user.Username || "",
    first_name: user.FirstName || "",
    last_name: user.LastName || "",
    middle_name: user.MiddleName || "",
    pronouns: user.Pronouns || "",
    email: user.Email,
    phone_number: user.Phone || "",
    point_to_dollar_ratio: 0,
    profile_picture_url: user.ProfilePicture,
    bio: user.Bio || "",
    license_number: user.LicenseNumber ?? user.licenseNumber ?? "",
    account_type: accountType,
    active_status: Boolean(user.ActiveStatus),
    created_at: user.LastLogin || new Date().toISOString(),
    last_password_change: user.LastPasswordChange || user.LastLogin || new Date().toISOString(),
  };

  return { user: profile, performanceStatus, session };
}

export default function ProfilePage() {
  const { user, performanceStatus, session } = useLoaderData<typeof loader>();
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
  const [isEditingOrg, setIsEditingOrg] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [username, setUsername] = useState(user.username || "");
  const [firstName, setFirstName] = useState(user.first_name || "");
  const [lastName, setLastName] = useState(user.last_name || "");
  const [middleName, setMiddleName] = useState(user.middle_name || "");
  const [pronouns, setPronouns] = useState(user.pronouns || "");
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone_number || "");
  const [profilePictureUrl, setProfilePictureUrl] = useState(user.profile_picture_url || "");
  const [bio, setBio] = useState(user.bio || "");
  const [licenseNumber, setLicenseNumber] = useState(user.license_number || ""); // New State
  const [pointToDollarRatio, setPointToDollarRatio] = useState(user.point_to_dollar_ratio);
  
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deactivationPassword, setDeactivationPassword] = useState("");
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);

  useEffect(() => {
    setUsername(user.username || "");
    setFirstName(user.first_name || "");
    setLastName(user.last_name || "");
    setMiddleName(user.middle_name || "");
    setPronouns(user.pronouns || "");
    setEmail(user.email || "");
    setPhone(user.phone_number || "");
    setProfilePictureUrl(user.profile_picture_url || "");
    setBio(user.bio || "");
    setLicenseNumber(user.license_number || "");
    setPointToDollarRatio(user.point_to_dollar_ratio || 0);
  }, [user.id, user.license_number]);

  const handleSaveProfile = async () => {
    setSuccessMessage("");
    setErrorMessage("");

    const trimmedUsername = username.trim();
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();

    if (!trimmedUsername || !trimmedFirstName || !trimmedLastName) {
      setErrorMessage("Please provide username, first name, and last name.");
      return;
    }

    try {
      setIsSavingProfile(true);
      const response = await fetch(`${API_URL}/api/user/profile/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: trimmedUsername,
          firstName: trimmedFirstName,
          middleName: middleName.trim(),
          lastName: trimmedLastName,
          pronouns: pronouns.trim(),
          email: email.trim(),
          phone: phone.trim(),
          profilePicture: profilePictureUrl.trim(),
          bio: bio.trim(),
          licenseNumber: licenseNumber.trim(), // Included in API call
        }),
      });

      const result = await response.json().catch(() => ({} as Record<string, unknown>));

      if (!response.ok) {
        setErrorMessage(result.error || 'Failed to update profile');
        return;
      }

      if (typeof result.LicenseNumber === "string") {
        setLicenseNumber(result.LicenseNumber);
      } else {
        setLicenseNumber(licenseNumber.trim());
      }

      setSuccessMessage(`✅ Profile updated successfully.`);
      setIsEditingProfile(false);
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err) {
      setErrorMessage('Connection error. Please try again.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordChange = async () => {
    setSuccessMessage("");
    setErrorMessage("");

    try {
      const response = await fetch("/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          currentPassword,
          newPassword
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setSuccessMessage("✅ Password updated successfully!");
        setCurrentPassword(""); 
        setNewPassword("");     
        setIsEditingPassword(false);
        setTimeout(() => setSuccessMessage(""), 5000);
      } else {
        setErrorMessage(result.error || "Failed to update password");
      }
    } catch (err) {
      setErrorMessage("Connection error. Please try again.");
    }
  };

  const isDriverAccount = user.account_type === "Driver";
  
  const personalFieldClass = isEditingProfile
    ? "!rounded-lg !border-2 !border-gray-300 !bg-white !text-gray-900 !shadow-md !ring-2 !ring-gray-100 transition-all duration-200"
    : "!rounded-lg !border-2 !border-transparent !bg-gray-100/70 !text-gray-600 !cursor-not-allowed !shadow-none transition-all duration-200";

  const openDeactivateModal = () => {
    setDeactivationPassword("");
    setErrorMessage("");
    setIsDeactivateModalOpen(true);
  };

  const handleDeactivateAccount = async () => {
    if (!deactivationPassword) {
      setErrorMessage("Please enter your password to deactivate your account.");
      return;
    }

    setIsDeactivating(true);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      const response = await fetch(`${API_URL}/api/drivers/deactivate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, currentPassword: deactivationPassword }),
      });

      const result = await response.json();

      if (!response.ok) {
        setErrorMessage(result.error || "Failed to deactivate account.");
        setIsDeactivating(false);
        return;
      }

      await fetch("/logout", { method: "POST" });
      window.location.assign("/login");
    } catch (err) {
      setErrorMessage("Connection error. Please try again.");
      setIsDeactivating(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <Link
        to="/"
        className="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline mb-6"
      >
        ← Home
      </Link>
      {session?.OriginalUser && (
        <Form method="post" action="/exit-assumption" className="mb-4">
          <Button type="submit" variant="primary" size="sm">
            Exit Assumed View
          </Button>
        </Form>
      )}
      <h1 className="text-3xl font-bold mb-8 text-gray-800 dark:text-white">
        My Profile & Settings
      </h1>

      {successMessage && (
        <Alert 
          variant="success" 
          message={successMessage}
          onDismiss={() => setSuccessMessage("")} 
          className="mb-6"
        />
      )}

      {errorMessage && (
        <Alert 
          message={errorMessage}
          onDismiss={() => setErrorMessage("")} 
          className="mb-6"
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="card p-6 flex flex-col items-center text-center">
            <img
              src={profilePictureUrl || "https://via.placeholder.com/150"}
              alt="Profile"
              className="w-32 h-32 rounded-full mb-4 border-4 border-blue-500"
            />
            <h2 className="text-2xl font-bold">{`${firstName} ${lastName}`.trim() || username || "User"}</h2>
            <p className="text-sm text-gray-500 mt-1">@{username || "unknown"}</p>
            <p className="text-xs text-gray-500 mt-1">UserID: {user.id}</p>
            {(bio || pronouns) && (
              <p className="text-sm text-gray-500 mt-1">
                {bio || ""}
                {bio && pronouns ? " | " : ""}
                {pronouns ? pronouns : ""}
              </p>
            )}
            <Badge variant="info" className="mt-2">
              {user.account_type}
            </Badge>
          </div>

          <div className="card p-6">
            <h3 className="font-bold mb-4 border-b pb-2">Account Statistics</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Last Password Change:</span>
                <span className="font-medium">
                    {new Date(user.last_password_change).toLocaleString()}
                </span>
              </div>
              {performanceStatus && (
                <div className="flex justify-between items-center gap-3">
                  <span className="text-gray-500 text-sm">Performance Status:</span>
                  <Badge variant={performanceBadgeVariant} size="md" className="capitalize">
                    {performanceStatus}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-8">
          <div className={`card p-6 transition-all duration-300 ${isEditingProfile ? "ring-2 ring-gray-200 bg-gray-50/10" : ""}`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Personal Information</h3>
              {!isEditingProfile ? (
                <Button type="button" size="sm" onClick={() => setIsEditingProfile(true)}>
                  Edit Details
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditingProfile(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleSaveProfile}
                    isLoading={isSavingProfile}
                  >
                    Save Changes
                  </Button>
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input label="First Name" value={firstName} disabled={!isEditingProfile}
                className={personalFieldClass}
                onChange={(e) => setFirstName(e.target.value)} />
              <Input label="Middle Name" value={middleName} disabled={!isEditingProfile}
                className={personalFieldClass}
                onChange={(e) => setMiddleName(e.target.value)} />
              <Input label="Last Name" value={lastName} disabled={!isEditingProfile}
                className={personalFieldClass}
                onChange={(e) => setLastName(e.target.value)} />

              <Input label="Username" value={username} disabled={!isEditingProfile}
                className={personalFieldClass}
                onChange={(e) => setUsername(e.target.value)} />
              <Input label="Email Address" value={email} disabled={!isEditingProfile}
                className={personalFieldClass}
                onChange={(e) => setEmail(e.target.value)} />
              <Input label="Phone Number" value={phone} disabled={!isEditingProfile} 
                className={personalFieldClass}
                onChange={(e) => setPhone(e.target.value)} />

              <Input label="Pronouns" value={pronouns} disabled={!isEditingProfile}
                className={personalFieldClass}
                onChange={(e) => setPronouns(e.target.value)} />
              
              {/* License Number Input (Added after Pronouns) */}
              <Input label="License Number" value={licenseNumber} disabled={!isEditingProfile}
                className={personalFieldClass}
                onChange={(e) => setLicenseNumber(e.target.value)} />

              <Input label="Profile Picture URL" value={profilePictureUrl} disabled={!isEditingProfile}
                className={personalFieldClass}
                onChange={(e) => setProfilePictureUrl(e.target.value)} />
              
              <div className="md:col-span-3">
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">
                  Bio
                </label>
                <textarea
                  value={bio}
                  disabled={!isEditingProfile}
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                  className={`w-full p-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 transition-all ${personalFieldClass}`}
                  placeholder="Tell sponsors a bit about yourself"
                />
              </div>
            </div>
          </div>

          <div className="card p-6 border-l-4 border-yellow-500">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Security</h3>
              {!isEditingPassword ? (
                <Button type="button" size="sm" variant="secondary" onClick={() => setIsEditingPassword(true)}>
                  Change Password
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditingPassword(false)}>Cancel</Button>
                  <Button type="button" variant="primary" size="sm" onClick={handlePasswordChange}>Update Password</Button>
                </div>
              )}
            </div>

            {isEditingPassword && (
              <div className="space-y-4 mt-4 bg-gray-50 p-4 rounded-lg">
                <Input
                  type="password"
                  label="Current Password"
                  placeholder="••••••••"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
                <Input
                  type="password"
                  label="New Password"
                  placeholder="Minimum 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
            )}
          </div>

          {isDriverAccount && (
            <div className="card p-6 border-l-4 border-red-500">
              <h3 className="text-xl font-bold mb-2">Account Status</h3>
              <div className="flex items-center justify-between gap-4 mt-4">
                <div>
                  <p className="text-sm text-gray-500">Current status</p>
                  <Badge variant={user.active_status ? "success" : "danger"} className="mt-1">
                    {user.active_status ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={openDeactivateModal}
                >
                  Deactivate Account
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isDeactivateModalOpen}
        onClose={() => { if (!isDeactivating) setIsDeactivateModalOpen(false); }}
        title="Deactivate Account"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            This will deactivate your account and sign you out. Confirm with your password.
          </p>
          <Input
            id="deactivationPassword"
            name="deactivationPassword"
            type="password"
            label="Current Password"
            value={deactivationPassword}
            onChange={(e) => setDeactivationPassword(e.target.value)}
          />
          <div className="flex justify-end gap-2">
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
              disabled={isDeactivating}
            >
              Confirm Deactivation
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}