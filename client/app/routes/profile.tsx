// app/routes/profile.tsx
import { useState, useEffect } from "react";
import { useLoaderData, useActionData, Form, useSubmit } from "react-router";
import type { Route } from "./+types/profile";
import { Table, Input, Button, Badge } from "~/components";
import { getUserById } from "../../../server/database/db";

// 1. THE LOADER: This pulls real data from the DB before the page renders
export async function loader({ params }: Route.LoaderArgs) {
  // In a real app, you'd get the ID from the session. 
  // For now, we are using ID 2 (Jane Smith) as per your mock.
  const user = getUserById(2); 
  
  if (!user) {
    throw new Response("User Not Found", { status: 404 });
  }

  return { user };
}

export default function ProfilePage() {
  const { user } = useLoaderData<typeof loader>();
  
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

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-8 text-gray-800 dark:text-white">
        My Profile & Settings
      </h1>

      {/* SUCCESS NOTIFICATION */}
      {successMessage && (
        <div className="mb-6 p-4 bg-green-100 border-l-4 border-green-500 text-green-700 animate-pulse">
          {successMessage}
        </div>
      )}

      {/* ERROR NOTIFICATION */}
      {errorMessage && (
        <div className="mb-6 p-4 bg-red-100 border-l-4 border-red-500 text-red-700">
          {errorMessage}
        </div>
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
            <Badge variant="outline" className="mt-2 text-blue-600 border-blue-600">
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
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: SETTINGS */}
        <div className="lg:col-span-2 space-y-8">
          {/* PERSONAL INFO SECTION */}
          <div className="card p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Personal Information</h3>
              <Button size="sm" onClick={() => setIsEditingProfile(!isEditingProfile)}>
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
                <Button size="sm" variant="secondary" onClick={() => setIsEditingPassword(true)}>
                  Change Password
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setIsEditingPassword(false)}>Cancel</Button>
                  <Button size="sm" color="blue" onClick={handlePasswordChange}>Update Password</Button>
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
                <Button variant="secondary">Update Ratio</Button>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                Currently: {pointToDollarRatio} points = $1.00 USD
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}