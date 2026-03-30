// app/routes/profile.tsx
import { useState, useEffect } from "react";
import { useLoaderData, useActionData, Form, useSubmit, Link } from "react-router";
import type { Route } from "./+types/profile";
import { Table, Input, Button, Badge, Alert, Modal } from "~/components";
import { requireAuth } from "~/utils/session.server";
//import { getUserById } from "../../../server/database/db";

const API_URL = process.env.API_URL ?? "http://localhost:5000";

// 1. THE LOADER: This pulls real data from the DB before the page renders
export async function loader({ request }: Route.LoaderArgs) {
  const session = requireAuth(request);
  const userId = session.UserID;

  const response = await fetch(`${API_URL}/api/user/profile/${userId}`);
  if (!response.ok) {
    throw new Response("User Not Found", { status: 404 });
  }

  const user = await response.json();
  const displayName = `${user.FirstName ?? ""} ${user.LastName ?? ""}`.trim();
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
    displayName: displayName || user.Username || "User",
    email: user.Email,
    phone_number: user.Phone || "",
    point_to_dollar_ratio: 0,
    profile_picture_url: user.ProfilePicture,
    account_type: accountType,
    active_status: Boolean(user.ActiveStatus),
    created_at: user.LastLogin || new Date().toISOString(),
    last_password_change: user.LastPasswordChange || user.LastLogin || new Date().toISOString(),
  };

  return { user: profile, performanceStatus };
}

export default function ProfilePage() {
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
  
  // UI States
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [isEditingOrg, setIsEditingOrg] = useState(false);
  
  // Success/Error Message States
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Form Field States (initialized with DB data)
  const [displayName, setDisplayName] = useState(user.displayName);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone_number || "");
  const [pointToDollarRatio, setPointToDollarRatio] = useState(user.point_to_dollar_ratio);
  
  // Password States
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deactivationPassword, setDeactivationPassword] = useState("");
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);

  const handlePasswordChange = async () => {
    setSuccessMessage("");
    setErrorMessage("");

    try {
      // Note: URL matches the filename "change-password.tsx" in your routes
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
        // --- WHAT YOU SEE ON SUCCESS ---
        setSuccessMessage("✅ Password updated successfully!");
        setCurrentPassword(""); 
        setNewPassword("");     
        setIsEditingPassword(false);
        
        // Auto-hide success message after 5 seconds
        setTimeout(() => setSuccessMessage(""), 5000);
      } else {
        setErrorMessage(result.error || "Failed to update password");
      }
    } catch (err) {
      setErrorMessage("Connection error. Please try again.");
    }
  };

  const isDriverAccount = user.account_type === "Driver";

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
      <h1 className="text-3xl font-bold mb-8 text-gray-800 dark:text-white">
        My Profile & Settings
      </h1>

      {/* SUCCESS NOTIFICATION */}
      {successMessage && (
        <Alert 
          variant="success" 
          message={successMessage}
          onDismiss={() => setSuccessMessage("")} 
          className="mb-6"
        />
      )}

      {/* ERROR NOTIFICATION */}
      {errorMessage && (
        <Alert 
          message={errorMessage}
          onDismiss={() => setErrorMessage("")} 
          className="mb-6"
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* LEFT COLUMN: PROFILE INFO */}
        <div className="lg:col-span-1 space-y-6">
          <div className="card p-6 flex flex-col items-center text-center">
            <img
              src={user.profile_picture_url || "https://via.placeholder.com/150"}
              alt="Profile"
              className="w-32 h-32 rounded-full mb-4 border-4 border-blue-500"
            />
            <h2 className="text-2xl font-bold">{displayName}</h2>
            <Badge variant="info" className="mt-2">
              {user.account_type}
            </Badge>
            <p className="text-gray-500 mt-2 text-sm italic">
              Member since: {new Date(user.created_at).toLocaleDateString()}
            </p>
          </div>

          <div className="card p-6">
            <h3 className="font-bold mb-4 border-b pb-2">Account Statistics</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Last Password Change:</span>
                <span className="font-medium text-xs">
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

        {/* RIGHT COLUMN: SETTINGS */}
        <div className="lg:col-span-2 space-y-8">
          {/* PERSONAL INFO SECTION */}
          <div className="card p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Personal Information</h3>
              <Button type="button" size="sm" onClick={() => setIsEditingProfile(!isEditingProfile)}>
                {isEditingProfile ? "Cancel" : "Edit"}
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Display Name" value={displayName} disabled={!isEditingProfile} 
                     onChange={(e) => setDisplayName(e.target.value)} />
              <Input label="Email Address" value={email} disabled={!isEditingProfile} 
                     onChange={(e) => setEmail(e.target.value)} />
              <Input label="Phone Number" value={phone} disabled={!isEditingProfile} 
                     onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          {/* PASSWORD SECTION */}
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

          {/* POINT RATIO SECTION (Admin/Sponsor Only) */}
          {(user.account_type === 'Admin' || user.account_type === 'Sponsor') && (
            <div className="card p-6">
              <h3 className="text-xl font-bold mb-4">Point Conversion Settings</h3>
              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <Input
                    type="number"
                    label="Points per $1.00"
                    value={pointToDollarRatio}
                    onChange={(e) => setPointToDollarRatio(Number(e.target.value))}
                  />
                </div>
                <Button type="button" variant="secondary">Update Ratio</Button>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                Currently: {pointToDollarRatio} points = $1.00 USD
              </p>
            </div>
          )}

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
              <p className="text-sm text-gray-500 mt-4">
                Deactivation signs you out immediately. You can reactivate from the login page by confirming your password.
              </p>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isDeactivateModalOpen}
        onClose={() => {
          if (!isDeactivating) {
            setIsDeactivateModalOpen(false);
          }
        }}
        title="Deactivate Account"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            This will deactivate your driver account and sign you out. Enter your current password to confirm.
          </p>
          <Input
            id="deactivationPassword"
            name="deactivationPassword"
            type="password"
            label="Current Password"
            placeholder="Enter your current password"
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