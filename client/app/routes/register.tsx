import { data, redirect, Form, Link, useActionData, useNavigation } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
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
		firstName: String(formData.get("firstName") ?? "").trim(),
		lastName: String(formData.get("lastName") ?? "").trim(),
		licenseNumber: String(formData.get("licenseNumber") ?? "").trim(),
		phone: String(formData.get("phone") ?? "").trim(),
	};

	if (!payload.username || !payload.email || !payload.password || !payload.firstName || !payload.lastName || !payload.licenseNumber) {
		return data({ error: "Please fill in all required fields." }, { status: 400 });
	}

	try {
		const response = await fetch(toApiUrl("/api/user/register-driver"), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
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

						<Input
							name="password"
							label="Password"
							type="password"
							required
							autoComplete="new-password"
							placeholder="Min 10 chars, upper/lower/special"
						/>

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
