import { signOut } from "@/app/actions";

export function SignOutButton({ className = "" }: { className?: string }) {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className={`rounded-btn bg-secondary px-4 py-2 text-sm font-bold uppercase text-primary ${className}`}
      >
        Sign out
      </button>
    </form>
  );
}
