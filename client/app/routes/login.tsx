import { useEffect, useState } from "react";
import { data, redirect, Form, useActionData, useNavigation, Link } from "react-router";
import type { Route } from "./+types/login";
import { Button } from "~/components/Button";
import { Input } from "~/components/Input";
import { Alert } from "~/components/Alert";
import { Modal } from "~/components/Modal";
import {
  getSession,
  signToken,
  buildSetCookieHeader,
  ROLE_HOME,
} from "~/utils/session.server";

const API_URL = process.env.API_URL ?? 'http://localhost:5000';

type LoginActionData = {
  error?: string;
  successMessage?: string;
  showReactivation?: boolean;
  reactivationUsername?: string;
};

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Sign In — FleetScore" },
    { name: "description", content: "Sign in to your FleetScore account" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = getSession(request);
  if (user) {
    throw redirect(ROLE_HOME[user.UserType as keyof typeof ROLE_HOME] ?? "/");
  }
  return {};
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "login");

  if (intent === "reactivate") {
    const username = String(formData.get("reactivationUsername") ?? "").trim();
    const password = String(formData.get("reactivationPassword") ?? "");

    if (!username || !password) {
      return data(
        {
          error: "Username and password are required to reactivate your account.",
          showReactivation: true,
          reactivationUsername: username,
        },
        { status: 400 }
      );
    }

    try {
      const response = await fetch(`${API_URL}/api/auth/reactivate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        return data(
          {
            error: result.error ?? "Failed to reactivate account.",
            showReactivation: true,
            reactivationUsername: username,
          },
          { status: response.status || 400 }
        );
      }

      return data({ successMessage: result.message ?? "Account reactivated. Please sign in." }, { status: 200 });
    } catch {
      return data(
        {
          error: "Could not reach the server. Please try again.",
          showReactivation: true,
          reactivationUsername: username,
        },
        { status: 503 }
      );
    }
  }

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return data({ error: "Username and password are required." }, { status: 400 });
  }

  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const result = await response.json();

    if (!response.ok || !result.success) {
      if (
        response.status === 403 &&
        result?.errorCode === "ACCOUNT_DEACTIVATED" &&
        result?.canSelfReactivate
      ) {
        return data(
          {
            error: result.error ?? "This account is deactivated.",
            showReactivation: true,
            reactivationUsername: username,
          },
          { status: 403 }
        );
      }

      return data({ error: result.error ?? "Login failed." }, { status: response.status || 401 });
    }

    const token = signToken({
      UserID: result.userID!,
      UserType: result.userType! as any,
      Username: result.username!,
    });

    const destination = ROLE_HOME[result.userType as keyof typeof ROLE_HOME] ?? "/";

    return redirect(destination, {
      headers: { "Set-Cookie": buildSetCookieHeader(token) },
    });
  } catch {
    return data({ error: "Could not reach the server. Please try again." }, { status: 503 });
  }
}

export default function LoginPage() {
  const actionData = useActionData<typeof action>() as LoginActionData | undefined;
  const navigation = useNavigation();
  const error = actionData?.error;
  const successMessage = actionData?.successMessage;
  const isSubmitting =
    navigation.state !== "idle" && navigation.formData?.get("intent") !== "reactivate";
  const isReactivating =
    navigation.state !== "idle" && navigation.formData?.get("intent") === "reactivate";
  const [isReactivationOpen, setIsReactivationOpen] = useState(false);

  useEffect(() => {
    setIsReactivationOpen(Boolean(actionData?.showReactivation));
  }, [actionData?.showReactivation]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-linear-to-b from-blue-50 to-blue-100/50 dark:from-slate-950 dark:to-slate-900 px-4 py-12">
      <div className="w-full max-w-96 mx-auto">
        
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            FleetScore
          </h1>
          <p className="text-slate-500 dark:text-slate-300 text-sm mt-2 font-medium">
            Sign in to your account
          </p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl shadow-blue-200/50 dark:shadow-black/30 p-8 space-y-5 border border-white dark:border-slate-800">
          {/* Error banner */}
          {error && (
            <Alert variant="error" message={error} dismissible={false} />
          )}
          {successMessage && (
            <Alert variant="success" message={successMessage} dismissible={false} />
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
                placeholder="••••••••"
                className="w-full px-5 py-4 rounded-2xl border border-gray-200 bg-gray-50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
              />
              <div className="text-right pt-0.5">
                <Link
                  to="/change-password"
                  className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full mt-1 font-bold py-4 shadow-lg shadow-blue-100"
              isLoading={isSubmitting}
              disabled={isSubmitting}
            >
              Sign in
            </Button>
          </Form>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-slate-500 dark:text-slate-300 mt-8 font-medium">
          New driver?{" "}
          <Link
            to="/register"
            className="text-blue-600 dark:text-blue-400 font-bold hover:text-blue-700 dark:hover:text-blue-300 underline underline-offset-4"
          >
            Create an account
          </Link>
        </p>
      </div>

      <Modal
        isOpen={isReactivationOpen}
        onClose={() => setIsReactivationOpen(false)}
        title="Reactivate Driver Account"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Your driver account is currently deactivated. Confirm your password to reactivate it, then sign in.
          </p>

          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="reactivate" />
            <input
              type="hidden"
              name="reactivationUsername"
              value={actionData?.reactivationUsername ?? ""}
            />

            <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">Username</p>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {actionData?.reactivationUsername}
              </p>
            </div>

            <Input
              id="reactivationPassword"
              name="reactivationPassword"
              type="password"
              label="Password"
              autoComplete="current-password"
              required
              placeholder="Enter your password"
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setIsReactivationOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={isReactivating} disabled={isReactivating}>
                Reactivate Account
              </Button>
            </div>
          </Form>
        </div>
      </Modal>
    </div>
  );
}