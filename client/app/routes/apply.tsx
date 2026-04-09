import { data, redirect, Form, Link, useActionData, useNavigation } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Alert, Button, Input } from "~/components";
import { getApiBaseUrl } from "~/utils/api-url";
import { getSession, ROLE_HOME } from "~/utils/session.server";

const API_URL = getApiBaseUrl();

export async function loader({ request }: LoaderFunctionArgs) {
  const user = getSession(request);
  if (user) {
    throw redirect(ROLE_HOME[user.UserType as keyof typeof ROLE_HOME] ?? "/");
  }
  return {};
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();

  const payload = {
    username: String(formData.get("username") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    firstName: String(formData.get("firstName") ?? "").trim(),
    lastName: String(formData.get("lastName") ?? "").trim(),
    companyName: String(formData.get("companyName") ?? "").trim(),
    reason: String(formData.get("reason") ?? "").trim(),
    // The backend should handle setting UserType to 'sponsor' and IsActive to 0
  };

  if (!payload.username || !payload.email || !payload.password || !payload.companyName) {
    return data({ error: "Please fill in all required fields." }, { status: 400 });
  }

  try {
    const response = await fetch(`${API_URL}/api/user/apply-sponsor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return data({ error: result.error ?? "Could not submit application." }, { status: response.status });
    }

    return data({ success: "Your application has been submitted for review. An admin will contact you shortly." });
  } catch {
    return data({ error: "Could not reach the server. Please try again." }, { status: 503 });
  }
}

export default function SponsorApplyPage() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";
  
  // Type-safe access to action data
  const errorMessage = actionData && "error" in actionData ? actionData.error : undefined;
  const successMessage = actionData && "success" in actionData ? actionData.success : undefined;

  return (
    <div className="min-h-screen w-full px-4 sm:px-6 py-12 bg-linear-to-b from-blue-50 to-blue-100/50 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center">
      <div className="w-full max-w-3xl">
        <div className="w-full bg-white dark:bg-slate-900 rounded-3xl shadow-xl shadow-blue-200/50 dark:shadow-black/30 p-6 sm:p-8 md:p-10 space-y-6 border border-white dark:border-slate-800">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight">Sponsor Application</h1>
            <p className="text-sm text-slate-500 dark:text-slate-300 font-medium">
              Apply to join the FleetScore network. Applications are typically reviewed within 2-3 business days.
            </p>
          </div>

          {errorMessage && <Alert variant="error" message={errorMessage} dismissible={false} />}
          {successMessage && <Alert variant="success" message={successMessage} dismissible={false} />}

          {!successMessage ? (
            <Form method="post" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input name="firstName" label="Contact First Name" required />
                <Input name="lastName" label="Contact Last Name" required />
              </div>

              <div className="space-y-4">
                <Input name="companyName" label="Company / Organization Name" required placeholder="e.g. Acme Logistics" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input name="username" label="Desired Username" required autoComplete="username" />
                  <Input name="email" label="Business Email" type="email" required autoComplete="email" />
                </div>
              </div>

              <Input
                name="password"
                label="Account Password"
                type="password"
                required
                autoComplete="new-password"
                placeholder="Min 10 chars, upper/lower/special"
              />

              <div className="space-y-1">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">
                  Why do you want to join? (Optional)
                </label>
                <textarea 
                  name="reason" 
                  className="w-full p-4 rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all min-h-[100px] text-sm"
                  placeholder="Tell us a bit about your organization..."
                />
              </div>

              <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting} className="w-full py-4 font-bold text-lg">
                Submit Application
              </Button>
            </Form>
          ) : (
            <div className="pt-4">
              <Button variant="secondary" className="w-full" onClick={() => window.location.href = "/login"}>
                Back to Login
              </Button>
            </div>
          )}

          <p className="text-sm text-center text-slate-500 dark:text-slate-300">
            Changed your mind?{" "}
            <Link to="/login" className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}