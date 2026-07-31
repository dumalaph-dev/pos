import { signOut } from "@/app/actions";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="rounded-btn bg-secondary px-4 py-2 text-sm font-bold uppercase text-primary"
      >
        Sign out
      </button>
    </form>
  );
}
