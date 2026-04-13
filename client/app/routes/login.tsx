//***************FULLY FUNCTIONAL LOGIN PAGE***************
//Imports
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
import { toApiUrl } from "~/utils/api-url";

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
      const response = await fetch(toApiUrl("/api/auth/reactivate"), {
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
    const response = await fetch(toApiUrl("/api/auth/login"), {
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

    const normalizedUserType = String(result.userType ?? "").trim().toLowerCase();

    const token = signToken({
      UserID: result.userID!,
      UserType: normalizedUserType as any,
      Username: result.username!,
      FirstName: result.firstName,
      LastName: result.lastName,
    });

    const destination = ROLE_HOME[normalizedUserType as keyof typeof ROLE_HOME] ?? "/";

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
  const [showPassword, setShowPassword] = useState(false);
  const [showReactivatePassword, setShowReactivatePassword] = useState(false);

  useEffect(() => {
    setIsReactivationOpen(Boolean(actionData?.showReactivation));
  }, [actionData?.showReactivation]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-linear-to-b from-blue-50 to-blue-100/50 dark:from-[#1e4b8f] dark:to-[#163a6f] px-4 py-12">
      <div className="w-full max-w-96 mx-auto">
        
        <div className="text-center mb-10">
          <h1 className="text-6xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            FleetScore
          </h1>
          <p className="text-slate-500 dark:text-slate-300 text-base mt-2 font-medium">
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
              <div className="relative flex flex-col">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  label="Password"
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                />
                <div className="absolute top-0 bottom-0 right-3 flex items-center">
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors mt-6"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <div className="text-right pt-0.5">
                <Link
                  to="/forgot-password"
                  className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full mt-1 font-bold py-4 shadow-lg shadow-blue-100 dark:shadow-slate-900/50"
              isLoading={isSubmitting}
              disabled={isSubmitting}
            >
              Sign in
            </Button>
          </Form>
        </div>

        {/* Footer */}
        <div className="mt-8 space-y-3 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-300 font-medium">
            New driver?{" "}
            <Link
              to="/register"
              className="text-blue-600 dark:text-blue-300 font-bold hover:text-blue-700 dark:hover:text-blue-200 underline underline-offset-4"
            >
              Create an account
            </Link>
          </p>
          
          <p className="text-sm text-slate-500 dark:text-slate-300 font-medium">
            Want to be a sponsor?{" "}
            <Link
              to="/apply"
              className="text-blue-600 dark:text-blue-300 font-bold hover:text-blue-700 dark:hover:text-blue-200 underline underline-offset-4"
            >
              Sponsor Application
            </Link>
          </p>
        </div>
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

            <div className="relative flex flex-col">
              <Input
                id="reactivationPassword"
                name="reactivationPassword"
                type={showReactivatePassword ? "text" : "password"}
                label="Password"
                autoComplete="current-password"
                required
                placeholder="Enter your password"
              />
              <div className="absolute top-0 bottom-0 right-3 flex items-center">
                <button
                  type="button"
                  onClick={() => setShowReactivatePassword(!showReactivatePassword)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors mt-6"
                  tabIndex={-1}
                >
                  {showReactivatePassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

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