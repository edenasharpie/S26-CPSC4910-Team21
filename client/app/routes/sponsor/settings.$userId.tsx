import type { Route } from "./+types/settings.$userId";
import { useState } from "react";
import { Button, Card, Input } from "~/components";
import { useNavigate, useLoaderData, Form, useActionData, Link } from "react-router";
import { requireAuth } from "~/utils/session.server";

const API_URL = process.env.API_URL ?? "http://localhost:5000";

// --- LOADER ---
export async function loader({ request, params }: Route.LoaderArgs) {
  const user = requireAuth(request, ["sponsor"]);
  const userId = params.userId ?? String(user.UserID);

  try {
    // Get sponsor company info
    const companyRes = await fetch(`${API_URL}/api/sponsors/user/${userId}`);
    if (!companyRes.ok) throw new Error("Could not load company info");
    const company = await companyRes.json();

    // Get retention settings
    const settingsRes = await fetch(
      `${API_URL}/api/sponsors/${company.sponsorCompanyId}/settings`
    );
    const settings = settingsRes.ok
      ? await settingsRes.json()
      : { dataRetentionDays: 90 };

    return {
      user,
      company,
      settings,
      error: null as string | null,
    };
  } catch (error: any) {
    return {
      user,
      company: { sponsorCompanyId: null, companyName: "Unknown" },
      settings: { dataRetentionDays: 90 },
      error: error.message,
    };
  }
}

// --- ACTION ---
export async function action({ request, params }: Route.ActionArgs) {
  const user = requireAuth(request, ["sponsor"]);
  const userId = params.userId ?? String(user.UserID);
  const formData = await request.formData();

  if (request.method !== "POST") {
    return { success: false, error: "Invalid request method" };
  }

  const dataRetentionDays = parseInt(
    formData.get("dataRetentionDays") as string
  ) || 90;

  try {
    // Get sponsor company first
    const companyRes = await fetch(`${API_URL}/api/sponsors/user/${userId}`);
    if (!companyRes.ok) {
      return { success: false, error: "Could not determine your company" };
    }
    const company = await companyRes.json();

    // Save settings
    const res = await fetch(
      `${API_URL}/api/sponsors/${company.sponsorCompanyId}/settings`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataRetentionDays }),
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
export default function SponsorSettings() {
  const { user, company, settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const [dataRetentionDays, setDataRetentionDays] = useState(
    settings.dataRetentionDays || 90
  );

  const retentionOptions = [
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
            to="/sponsor/dashboard"
            className="text-sm font-medium text-blue-600 hover:underline mb-2 block"
          >
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Sponsor Settings
          </h1>
          <p className="text-gray-500 text-sm mt-1 font-medium">
            Manage data retention and company preferences
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

        <div className="space-y-6">
          {/* Data Retention Card */}
          <Card>
            <div className="p-6 border-b dark:border-gray-800">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Data Retention Policy
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Choose how long to retain data for inactive users and historical
                records
              </p>
            </div>

            <Form method="post" className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-3">
                  Retention Duration
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {retentionOptions.map((option) => (
                    <label
                      key={option.value}
                      className="flex items-center p-3 rounded-lg border border-gray-200 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 transition-all"
                    >
                      <input
                        type="radio"
                        name="dataRetentionDays"
                        value={option.value}
                        checked={dataRetentionDays === option.value}
                        onChange={(e) =>
                          setDataRetentionDays(parseInt(e.target.value))
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
                  <strong>How this works:</strong> Data for inactive users and
                  old records will be archived after the selected duration. You
                  can still access archived data, but it won't be shown in
                  active lists.
                </p>
              </div>

              <div className="flex gap-3 pt-4 border-t dark:border-gray-800">
                <Button variant="primary" type="submit">
                  Save Settings
                </Button>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => navigate("/sponsor/dashboard")}
                >
                  Cancel
                </Button>
              </div>
            </Form>
          </Card>
        </div>
      </div>
    </div>
  );
}
