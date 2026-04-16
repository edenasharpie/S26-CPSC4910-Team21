import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { requireAuth } from "~/utils/session.server";
import { getApiBaseUrl } from "~/utils/api-url";

const API_URL = getApiBaseUrl();

interface User {
  UserID: string;
  FirstName: string;
  LastName: string;
  Email: string;
  Username?: string;
  ActiveStatus?: number;
}

export async function loader({ request }: { request: Request }) {
  const user = await requireAuth(request, ["sponsor"]);
  const cookieHeader = request.headers.get("Cookie") ?? "";
  try {
    // TODO: clarify if this should list drivers or sponsor users within the company.
    const res = await fetch(`${API_URL}/api/sponsors/${user.UserID}/my-drivers`, {
      headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
    });
    
    if (!res.ok) {
      throw new Error(`Server responded with ${res.status}`);
    }

    const data = await res.json();

    return {
      sponsorUserId: Number(user.UserID),
      users: Array.isArray(data) ? data : [],
    };

  } catch (error) {
    console.error("Loader Error:", error);
    return {
      sponsorUserId: Number(user.UserID),
      users: [],
    };
  }
}

export async function action({ request }: { request: Request }) {
  const user = await requireAuth(request, ["sponsor"]);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const driverUserId = Number(formData.get("driverUserId"));
  const cookieHeader = request.headers.get("Cookie") ?? "";

  if (intent !== "remove-driver") {
    return { success: false, error: "Unsupported action." };
  }

  if (!Number.isInteger(driverUserId)) {
    return { success: false, error: "Invalid driver selected for removal." };
  }

  try {
    const response = await fetch(
      `${API_URL}/api/sponsors/${user.UserID}/drivers/${driverUserId}/company`,
      {
        method: "DELETE",
        headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
      }
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: String((payload as any).error ?? "Failed to remove driver."),
      };
    }

    return {
      success: true,
      message: String((payload as any).message ?? "Driver removed from sponsor company."),
    };
  } catch (error: any) {
    return { success: false, error: String(error?.message ?? "Failed to remove driver.") };
  }
}

export default function UserDirectory() {
  const { users } = useLoaderData() as { users: User[] };
  const actionData = useActionData() as { success?: boolean; message?: string; error?: string } | undefined;
  const navigation = useNavigation();
  const isRemovingDriver =
    navigation.state === "submitting" && navigation.formData?.get("intent") === "remove-driver";

  return (
    <div className="min-h-screen bg-[#0f172a] p-12">
      <div className="max-w-5xl mx-auto">
        <Link to="/" className="inline-flex items-center text-sm font-medium text-blue-300 hover:underline mb-6">
          &larr; Home
        </Link>
        
        {/* Header (Text must be white to match screenshot/dark theme) */}
        <h1 className="text-4xl font-extrabold text-white mb-10 tracking-tight">
          Affiliated Users
        </h1>

        {actionData && (
          <div
            className={`mb-6 rounded-md border px-4 py-3 text-sm ${
              actionData.success
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {actionData.success ? actionData.message : actionData.error}
          </div>
        )}

        <div className="grid gap-6">
          {users.map((u: User) => (
            // This is the white "card" container
            <div 
              key={u.UserID} 
              className="bg-white p-8 rounded-2xl flex justify-between items-center shadow-xl border border-slate-200 transition-shadow hover:shadow-2xl"
            >
              {/*User Details*/}
              <div className="flex flex-col gap-1">
                {/* Name*/}
                <span className="text-2xl font-bold text-slate-900 tracking-tight">
                  {u.FirstName} {u.LastName}
                </span>
                
                {/*Email*/}
                <span className="text-base font-medium text-slate-600">
                  {u.Email}
                </span>

                {u.Username && (
                  <span className="text-xs font-mono text-slate-500 mt-1 uppercase tracking-wider">
                    Username: {u.Username}
                  </span>
                )}
                
                {/*ID*/}
                <span className="text-xs font-mono text-slate-400 mt-1 uppercase tracking-wider">
                  ID: {u.UserID}
                </span>
              </div>
              
              <div className="flex items-center gap-3">
                <Link
                  to={`/sponsor/manage-users/${u.UserID}`}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-7 py-3 rounded-xl font-bold text-lg shadow-md transition-all whitespace-nowrap"
                >
                  Edit Info
                </Link>
                <Form
                  method="post"
                  onSubmit={(event) => {
                    const confirmed = window.confirm(
                      `Remove ${u.FirstName} ${u.LastName} from your sponsor company?`
                    );
                    if (!confirmed) {
                      event.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="intent" value="remove-driver" />
                  <input type="hidden" name="driverUserId" value={u.UserID} />
                  <button
                    type="submit"
                    disabled={isRemovingDriver}
                    className="bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white px-6 py-3 rounded-xl font-bold text-lg shadow-md transition-all whitespace-nowrap"
                  >
                    {isRemovingDriver ? "Removing..." : "Remove"}
                  </button>
                </Form>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}