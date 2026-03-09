import { data, redirect, Form, useActionData } from "react-router";
import type { Route } from "./+types/login";
import { Button } from "~/components/Button";
import { Input } from "~/components/Input";
import { Card } from "~/components/Card";
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
  const error = actionData?.error;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Branding */}
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            FleetScore
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Sign in to your account
          </p>
        </div>

        {/* Card */}
        <Card className="p-6 shadow-md">
          <Form method="post" className="space-y-4">
            {/* Error banner */}
            {error && (
              <Alert variant="error">
                {error}
              </Alert>
            )}

            <div className="space-y-1">
              <label
                htmlFor="username"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Username
              </label>
              <Input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                placeholder="Enter your username"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Password
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="Enter your password"
              />
            </div>

            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </Form>
        </Card>
      </div>
    </div>
  );
}
