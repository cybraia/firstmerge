import { signIn, signOut } from "@/auth";

const devLogin = process.env.NODE_ENV !== "production" && process.env.AUTH_DEV_LOGIN === "1";

export function SignInButton({ label = "Sign in with GitHub", redirectTo = "/" }: { label?: string; redirectTo?: string }) {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("github", { redirectTo });
      }}
    >
      <button className="btn" type="submit">
        {label}
      </button>
    </form>
  );
}

/** Rendered only in local development when AUTH_DEV_LOGIN=1. */
export function DevSignInButton({ redirectTo = "/" }: { redirectTo?: string }) {
  if (!devLogin) return null;
  return (
    <form
      action={async () => {
        "use server";
        await signIn("dev", { redirectTo });
      }}
    >
      <button className="btn ghost small" type="submit">
        Dev login (local only)
      </button>
    </form>
  );
}

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    >
      <button className="btn ghost small" type="submit">
        Sign out
      </button>
    </form>
  );
}
