import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { buildClearCookieHeader } from "~/utils/session.server";

/**
 * Logout action — clears the sessionId cookie and redirects to /login.
 * There is no GET route for /logout; any navigation to it should use a
 * <Form method="post"> button.
 */
export async function action(_: Route.ActionArgs) {
  return redirect("/login", {
    headers: {
      "Set-Cookie": buildClearCookieHeader(),
    },
  });
}

// Guard against someone navigating to /logout directly via GET
export async function loader(_: Route.LoaderArgs) {
  return redirect("/login");
}
