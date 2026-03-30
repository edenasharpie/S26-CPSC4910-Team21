import type { Route } from "./+types/settings.$userId";
import { useState } from "react";
import { Button, Card } from "~/components";
import { useNavigate, useLoaderData, Form, useActionData, Link } from "react-router";
import { requireAuth } from "~/utils/session.server";

const API_URL = process.env.API_URL ?? "http://localhost:5000";

// --- LOADER ---
export async function loader({ request, params }: Route.LoaderArgs) {
  const user = requireAuth(request, ["admin"]);
  const { userId } = params;

  try {
    // Get admin settings
    const settingsRes = await fetch(
      `${API_URL}/api/admin/settings/${userId}`
    );
    const settings = settingsRes.ok
      ? await settingsRes.json()
      : { auditLogRetentionDays: 365, userDataRetentionDays: 90 };

    return {
      user,
      settings,
      error: null as string | null,
    };
  } catch (error: any) {
    return {
      user,
      settings: { auditLogRetentionDays: 365, userDataRetentionDays: 90 },
      error: error.message,
    };
  }
}

// --- ACTION ---
export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request, ["admin"]);
  const { userId } = params;
  const formData = await request.formData();

  if (request.method !== "POST") {
    return { success: false, error: "Invalid request method" };
  }

  const auditLogRetentionDays = parseInt(
    formData.get("auditLogRetentionDays") as string
  ) || 365;
  const userDataRetentionDays = parseInt(
    formData.get("userDataRetentionDays") as string
  ) || 90;

  try {
    // Save settings
    const res = await fetch(
      `${API_URL}/api/admin/settings/${userId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditLogRetentionDays, userDataRetentionDays }),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        success: false,
        error: (err as any).error ?? "Failed to save settings",
      };
    }

    return { success: true, error: null };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- MAIN COMPONENT ---
export default function AdminSettings() {
  const { user, settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const [auditLogRetentionDays, setAuditLogRetentionDays] = useState(
    settings.auditLogRetentionDays || 365
  );
  const [userDataRetentionDays, setUserDataRetentionDays] = useState(
    settings.userDataRetentionDays || 90
  );

  const auditRetentionOptions = [
    { label: "30 days", value: 30 },
    { label: "90 days", value: 90 },
    { label: "180 days", value: 180 },
    { label: "1 year", value: 365 },
    { label: "2 years", value: 730 },
    { label: "Never delete", value: 9999 },
  ];

  const userRetentionOptions = [
    { label: "30 days", value: 30 },
    { label: "60 days", value: 60 },
    { label: "90 days", value: 90 },
    { label: "180 days", value: 180 },
    { label: "1 year", value: 365 },
    { label: "2 years", value: 730 },
    { label: "Never delete", value: 9999 },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 border-b pb-6 dark:border-gray-800">
          <Link
            to="/"
            className="text-sm font-medium text-blue-600 hover:underline mb-2 block"
          >
            ← Home
          </Link>
          <Link
            to="/admin/dashboard"
            className="text-sm font-medium text-blue-600 hover:underline mb-2 block"
          >
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Admin Settings
          </h1>
          <p className="text-gray-500 text-sm mt-1 font-medium">
            Configure system-wide data retention and archival policies
          </p>
        </div>

        {/* Success/Error Messages */}
        {(actionData as any)?.success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
            Settings saved successfully!
          </div>
        )}
        {(actionData as any)?.error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {(actionData as any).error}
          </div>
        )}

        <Form method="post" className="space-y-6">
          {/* Audit Log Retention Card */}
          <Card>
            <div className="p-6 border-b dark:border-gray-800">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Audit Log Retention
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                How long to keep audit logs of user actions, logins, and system
                events
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-3">
                  Retention Duration
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {auditRetentionOptions.map((option) => (
                    <label
                      key={option.value}
                      className="flex items-center p-3 rounded-lg border border-gray-200 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 transition-all"
                    >
                      <input
                        type="radio"
                        name="auditLogRetentionDays"
                        value={option.value}
                        checked={auditLogRetentionDays === option.value}
                        onChange={(e) =>
                          setAuditLogRetentionDays(parseInt(e.target.value))
                        }
                        className="w-4 h-4 text-indigo-600 cursor-pointer"
                      />
                      <span className="ml-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                        {option.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <p className="text-sm text-amber-900 dark:text-amber-100">
                  <strong>Note:</strong> Longer retention periods ensure
                  comprehensive audit trails for compliance and investigation
                  purposes.
                </p>
              </div>
            </div>
          </Card>

          {/* User Data Retention Card */}
          <Card>
            <div className="p-6 border-b dark:border-gray-800">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Inactive User Data Retention
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                How long to keep data for deactivated or removed user accounts
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-3">
                  Retention Duration
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {userRetentionOptions.map((option) => (
                    <label
                      key={option.value}
                      className="flex items-center p-3 rounded-lg border border-gray-200 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 transition-all"
                    >
                      <input
                        type="radio"
                        name="userDataRetentionDays"
                        value={option.value}
                        checked={userDataRetentionDays === option.value}
                        onChange={(e) =>
                          setUserDataRetentionDays(parseInt(e.target.value))
                        }
                        className="w-4 h-4 text-indigo-600 cursor-pointer"
                      />
                      <span className="ml-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                        {option.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  <strong>How this works:</strong> Inactive user data will be
                  archived after the selected duration. You can still access
                  archived data for recovery or reference purposes.
                </p>
              </div>
            </div>
          </Card>

          <div className="flex gap-3 pt-4 border-t dark:border-gray-800">
            <Button variant="primary" type="submit">
              Save Settings
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={() => navigate("/admin/dashboard")}
            >
              Cancel
            </Button>
          </div>
        </Form>
      </div>
    </div>
  );
}
