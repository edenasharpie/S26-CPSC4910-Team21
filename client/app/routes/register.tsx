import { data, redirect, Form, Link, useActionData, useNavigation } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useState } from "react";
import { Alert, Button, Input } from "~/components";
import { toApiUrl } from "~/utils/api-url";
import { getSession, ROLE_HOME } from "~/utils/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
    const user = getSession(request);
    if (user) {
        throw redirect(ROLE_HOME[user.UserType] ?? "/");
    }
    return {};
}

export async function action({ request }: ActionFunctionArgs) {
    const formData = await request.formData();

    const payload = {
        username: String(formData.get("username") ?? "").trim(),
        email: String(formData.get("email") ?? "").trim(),
        password: String(formData.get("password") ?? ""),
        confirmPassword: String(formData.get("confirmPassword") ?? ""),
        firstName: String(formData.get("firstName") ?? "").trim(),
        lastName: String(formData.get("lastName") ?? "").trim(),
        licenseNumber: String(formData.get("licenseNumber") ?? "").trim(),
        phone: String(formData.get("phone") ?? "").trim(),
    };

    if (!payload.username || !payload.email || !payload.password || !payload.firstName || !payload.lastName || !payload.licenseNumber) {
        return data({ error: "Please fill in all required fields." }, { status: 400 });
    }

    if (payload.password !== payload.confirmPassword) {
        return data({ error: "Passwords do not match." }, { status: 400 });
    }

    try {
        const response = await fetch(toApiUrl("/api/user/register-driver"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: payload.username,
                email: payload.email,
                password: payload.password,
                firstName: payload.firstName,
                lastName: payload.lastName,
                licenseNumber: payload.licenseNumber,
                phone: payload.phone,
            }),
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            return data({ error: result.error ?? "Could not create account." }, { status: response.status });
        }

        return data({ success: "Account created. You can now sign in." });
    } catch {
        return data({ error: "Could not reach the server. Please try again." }, { status: 503 });
    }
}

export default function RegisterPage() {
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const isSubmitting = navigation.state !== "idle";
    const errorMessage = actionData && "error" in actionData ? actionData.error : undefined;
    const successMessage = actionData && "success" in actionData ? actionData.success : undefined;

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    return (
        <div className="min-h-screen w-full px-4 sm:px-6 py-12 bg-linear-to-b from-blue-50 to-blue-100/50 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center">
            <div className="w-full max-w-3xl">
                <div className="w-full bg-white dark:bg-slate-900 rounded-3xl shadow-xl shadow-blue-200/50 dark:shadow-black/30 p-6 sm:p-8 md:p-10 space-y-6 border border-white dark:border-slate-800">
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Create Driver Account</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-300">
                        Self-registration is available for drivers only. Sponsor and admin accounts are pre-created.
                    </p>

                      {errorMessage && <Alert variant="error" message={errorMessage} dismissible={false} />}
                      {successMessage && <Alert variant="success" message={successMessage} dismissible={false} />}

                    <Form method="post" className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input name="firstName" label="First Name" required />
                            <Input name="lastName" label="Last Name" required />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input name="username" label="Username" required autoComplete="username" />
                            <Input name="email" label="Email" type="email" required autoComplete="email" />
                            <Input name="phone" label="Phone (optional)" type="tel" autoComplete="tel" />
                            <Input name="licenseNumber" label="License Number" required />
                        </div>

                        <div className="space-y-1.5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="relative flex flex-col">
                                    <Input
                                        name="password"
                                        label="Password"
                                        type={showPassword ? "text" : "password"}
                                        required
                                        autoComplete="new-password"
                                        placeholder="Enter password"
                                    />
                                    <div className="absolute top-0 bottom-0 right-3 flex items-center">
                                      <button
                                          type="button"
                                          onClick={() => setShowPassword(!showPassword)}
                                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors mt-6" // mt-6 to align with input area, not label
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
                                <div className="relative flex flex-col">
                                    <Input
                                        name="confirmPassword"
                                        label="Confirm Password"
                                        type={showConfirmPassword ? "text" : "password"}
                                        required
                                        autoComplete="new-password"
                                        placeholder="Re-enter password"
                                    />
                                    <div className="absolute top-0 bottom-0 right-3 flex items-center">
                                      <button
                                          type="button"
                                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors mt-6" // mt-6 to align with input area, not label
                                          tabIndex={-1}
                                      >
                                          {showConfirmPassword ? (
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
                            </div>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium px-1">
                                Password must be at least 10 characters and include uppercase, lowercase, and a special character.
                            </p>
                        </div>

                        <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting} className="w-full">
                            Create Driver Account
                        </Button>
                    </Form>

                    <p className="text-sm text-center text-slate-500 dark:text-slate-300">
                        Already have an account?{" "}
                        <Link to="/login" className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}