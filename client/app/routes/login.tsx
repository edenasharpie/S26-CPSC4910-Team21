import { data, redirect, Form, useActionData, useNavigation, Link } from "react-router";
import type { Route } from "./+types/login";
import { Button } from "~/components/Button";
import { Input } from "~/components/Input";
import { Alert } from "~/components/Alert";
import {
  getSession,
  signToken,
  buildSetCookieHeader,
  ROLE_HOME,
} from "~/utils/session.server";
// session.server.ts is part of the React Router app (client/app/utils/) and
// does only JWT cookie operations — no Express server imports anywhere below.

const API_URL = process.env.API_URL ?? 'http://localhost:5000';

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Sign In — FleetScore" },
    { name: "description", content: "Sign in to your FleetScore account" },
  ];
}

// ---------------------------------------------------------------------------
// Loader — redirect authenticated users to their dashboard
// ---------------------------------------------------------------------------

export async function loader({ request }: Route.LoaderArgs) {
  const user = getSession(request);
  if (user) {
    throw redirect(ROLE_HOME[user.UserType] ?? "/");
  }
  return {};
}

// ---------------------------------------------------------------------------
// Action — handle login form submission
// ---------------------------------------------------------------------------

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return data({ error: "Username and password are required." }, { status: 400 });
  }

  // All credential verification runs on the Express API server
  let result: { success: boolean; userID?: number; userType?: string; username?: string; error?: string };
  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    result = await response.json();
  } catch {
    return data({ error: "Could not reach the server. Please try again." }, { status: 503 });
  }

  if (!result.success) {
    return data({ error: result.error ?? "Login failed." }, { status: 401 });
  }

  // Mint the JWT cookie in the React Router SSR response
  const token = signToken({
    UserID: result.userID!,
    UserType: result.userType! as any,
    Username: result.username!,
  });

  const destination = ROLE_HOME[result.userType as keyof typeof ROLE_HOME] ?? "/";

  return redirect(destination, {
    headers: { "Set-Cookie": buildSetCookieHeader(token) },
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LoginPage() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const error = actionData?.error;
  const isSubmitting = navigation.state !== "idle";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 px-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white tracking-tight">
            FleetScore
          </h1>
          <p className="text-white/70 text-sm mt-2">
            Sign in to your account
          </p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 space-y-5">
          {/* Error banner */}
          {error && (
            <Alert variant="error" message={error} dismissible={false} />
          )}

          <Form method="post" className="space-y-5">
            <Input
              id="username"
              name="username"
              type="text"
              label="Username"
              autoComplete="username"
              required
              placeholder="Enter your username"
            />

            <div className="space-y-1">
              <Input
                id="password"
                name="password"
                type="password"
                label="Password"
                autoComplete="current-password"
                required
                placeholder="Enter your password"
              />
              <div className="text-right pt-0.5">
                <Link
                  to="/change-password"
                  className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full mt-1"
              isLoading={isSubmitting}
              disabled={isSubmitting}
            >
              Sign in
            </Button>
          </Form>
        </div>
      </div>
    </div>
  );
}
