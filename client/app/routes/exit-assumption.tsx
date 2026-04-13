import { redirect } from "react-router";
import {
  getSession,
  signToken,
  buildSetCookieHeader,
  ROLE_HOME,
} from "~/utils/session.server";
import { getApiBaseUrl } from "~/utils/api-url";

const API_URL = getApiBaseUrl();

export async function action({ request }: { request: Request }) {
  const requestUrl = new URL(request.url);
  const isUnloadMode = requestUrl.searchParams.get("mode") === "unload";
  const session = getSession(request);

  if (!session) {
    if (isUnloadMode) {
      return new Response(null, { status: 204 });
    }
    return redirect("/login");
  }

  if (!session.OriginalUser) {
    if (isUnloadMode) {
      return new Response(null, { status: 204 });
    }
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

  const restoredCookieHeader = buildSetCookieHeader(restoredToken);

  if (isUnloadMode) {
    return new Response(null, {
      status: 204,
      headers: {
        "Set-Cookie": restoredCookieHeader,
        "Cache-Control": "no-store",
      },
    });
  }

  return redirect(ROLE_HOME[session.OriginalUser.UserType] ?? "/", {
    headers: {
      "Set-Cookie": restoredCookieHeader,
    },
  });
}

export async function loader() {
  return redirect("/");
}
