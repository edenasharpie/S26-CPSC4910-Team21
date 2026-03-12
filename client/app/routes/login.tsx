import { data, redirect, Form, useActionData } from "react-router";
import type { Route } from "./+types/login";
import {
  getSession,
  signToken,
  buildSetCookieHeader,
  ROLE_HOME,
} from "~/utils/session.server";

// Keep your logic exactly as is
const API_URL = process.env.API_URL ?? 'http://localhost:5000';

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
      return data({ error: result.error ?? "Login failed." }, { status: 401 });
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
  const actionData = useActionData<typeof action>();
  const error = actionData?.error;

  return (
    /* FORCE WIDE: We use min-w-screen and w-full here. 
      If it's still narrow, check your tailwind.config.ts or global.css 
    */
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-[450px] space-y-8">
        
        {/* Branding */}
        <div className="text-center">
          <h1 className="text-5xl font-black tracking-tight text-gray-900 dark:text-white mb-2">
            FleetScore
          </h1>
          <p className="text-base text-gray-500 dark:text-gray-400 font-medium">
            Sign in to your account
          </p>
        </div>

        {/* Using a standard div instead of Card to ensure styles apply */}
        <div className="bg-white dark:bg-gray-900 p-10 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800">
          <Form method="post" className="space-y-6">
            
            {error && (
              <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-bold border border-red-100 mb-4 text-center">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="username" className="block text-xs font-bold uppercase tracking-widest text-gray-400 ml-1">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                placeholder="Enter your username"
                className="w-full px-5 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-xs font-bold uppercase tracking-widest text-gray-400 ml-1">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                placeholder="••••••••"
                className="w-full px-5 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
              />
            </div>

            <button 
              type="submit" 
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-5 rounded-2xl shadow-lg shadow-indigo-200 dark:shadow-none transition-all transform active:scale-[0.98]"
            >
              Sign In
            </button>
          </Form>
        </div>

        <p className="text-center text-gray-400 text-xs font-bold tracking-widest uppercase">
          © 2026 FleetScore Logistics
        </p>
      </div>
    </div>
  );
}