import { Form, Link, useActionData, useNavigation } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Button, Card } from "~/components";
import { requireAuth } from "~/utils/session.server";
import { getApiBaseUrl } from "~/utils/api-url";

const API_URL = getApiBaseUrl();

interface BulkErrorLine {
  lineNumber: number;
  line: string;
  message: string;
}

interface BulkSummary {
  processed: number;
  succeeded: number;
  failed: number;
  createdUsers: number;
  createdDrivers: number;
  createdSponsors: number;
  updatedUsers: number;
  createdOrganizations: number;
  pointsApplied: number;
}

interface BulkReport {
  summary: BulkSummary;
  errors: BulkErrorLine[];
}

interface ActionData {
  error?: string;
  report?: BulkReport;
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAuth(request, ["admin"]);
  return null;
}

export async function action({ request }: ActionFunctionArgs): Promise<ActionData> {
  const session = await requireAuth(request, ["admin"]);
  const formData = await request.formData();
  const file = formData.get("bulkFile");

  if (!(file instanceof File)) {
    return { error: "Please choose a file before uploading." };
  }

  const content = await file.text();
  if (!content.trim()) {
    return { error: "The uploaded file is empty." };
  }

  try {
    const response = await fetch(`${API_URL}/api/admin/users/bulk-load`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        requesterUserId: session.OriginalUser?.UserID ?? session.UserID,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | (BulkReport & { error?: string })
      | null;

    if (!response.ok) {
      return { error: payload?.error ?? "Bulk upload failed." };
    }

    if (!payload || !payload.summary) {
      return { error: "Bulk upload response was invalid." };
    }

    return { report: payload };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Bulk upload failed.",
    };
  }
}

export default function AdminBulkUploadPage() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";
  const report = actionData?.report;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6 md:p-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="text-left">
          <Link to="/admin/dashboard" className="text-sm font-medium text-blue-600 hover:underline">
            &larr; Back to Admin Dashboard
          </Link>
        </div>

        <Card className="p-6 md:p-8 border border-gray-200 dark:border-gray-800 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Bulk Upload</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 text-left">
            Upload a pipe-delimited text file to create organizations, drivers, and sponsors.
            Invalid lines are reported and skipped while valid lines continue processing.
          </p>

          <Form method="post" encType="multipart/form-data" className="mt-6 space-y-4 text-left">
            <div>
              <label className="block text-xs font-bold tracking-wide uppercase text-gray-500 mb-2" htmlFor="bulkFile">
                Upload File
              </label>
              <input
                id="bulkFile"
                name="bulkFile"
                type="file"
                accept=".txt,text/plain"
                required
                className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-white hover:file:bg-indigo-700"
              />
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-4 text-xs text-gray-600 dark:text-gray-300">
              Format: type|organization|first|last|email|points|reason
            </div>

            <div className="flex justify-end">
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? "Uploading..." : "Process Upload"}
              </Button>
            </div>
          </Form>
        </Card>

        {actionData?.error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 text-left">
            {actionData.error}
          </div>
        )}

        {report && (
          <Card className="p-6 md:p-8 border border-gray-200 dark:border-gray-800 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white text-left">Upload Result</h2>

            <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-left">
              <Stat title="Processed" value={report.summary.processed} />
              <Stat title="Succeeded" value={report.summary.succeeded} />
              <Stat title="Failed" value={report.summary.failed} />
              <Stat title="Created Users" value={report.summary.createdUsers} />
              <Stat title="Updated Users" value={report.summary.updatedUsers} />
            </div>

            {report.errors.length > 0 && (
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full text-left border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden">
                  <thead className="bg-gray-100 dark:bg-gray-900">
                    <tr>
                      <th className="px-3 py-2 text-xs font-bold uppercase text-gray-500">Line</th>
                      <th className="px-3 py-2 text-xs font-bold uppercase text-gray-500">Error</th>
                      <th className="px-3 py-2 text-xs font-bold uppercase text-gray-500">Content</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.errors.map((entry) => (
                      <tr key={`${entry.lineNumber}-${entry.message}`} className="border-t border-gray-200 dark:border-gray-800">
                        <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-200">{entry.lineNumber}</td>
                        <td className="px-3 py-2 text-sm text-red-700 dark:text-red-300">{entry.message}</td>
                        <td className="px-3 py-2 text-xs font-mono text-gray-600 dark:text-gray-300 break-all">{entry.line}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

function Stat({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
      <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500">{title}</div>
      <div className="mt-1 text-2xl font-black text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}