import { redirect } from "react-router";
import {
  getSession,
  signToken,
  buildSetCookieHeader,
  ROLE_HOME,
} from "~/utils/session.server";

const API_URL = process.env.API_URL ?? "http://localhost:5000";

export async function action({ request }: { request: Request }) {
  const session = getSession(request);

  if (!session) {
    return redirect("/login");
  }

  if (!session.OriginalUser) {
    return redirect(ROLE_HOME[session.UserType] ?? "/");
  }

  try {
    await fetch(`${API_URL}/api/auth/assumption-exit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actingUserId: session.UserID,
        originalUserId: session.OriginalUser.UserID,
      }),
    });
  } catch {
    // The user should still be able to restore their own session even if audit logging fails.
  }

  const restoredToken = signToken({
    UserID: session.OriginalUser.UserID,
    UserType: session.OriginalUser.UserType,
    Username: session.OriginalUser.Username,
    FirstName: session.OriginalUser.FirstName,
    LastName: session.OriginalUser.LastName,
  });

  return redirect(ROLE_HOME[session.OriginalUser.UserType] ?? "/", {
    headers: {
      "Set-Cookie": buildSetCookieHeader(restoredToken),
    },
  });
}

export async function loader() {
  return redirect("/");
}
