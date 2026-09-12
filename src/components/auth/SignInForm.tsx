"use client";

import { useActionState } from "react";

import { signInAction, type SignInState } from "@/lib/auth/actions";

const initialState: SignInState = { error: null };

/** Staff email and password sign in. There is no sign up and no social login. */
export default function SignInForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-[16px] font-medium text-ink">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="h-14 rounded-2xl border border-line bg-surface px-5 text-[17px] text-ink outline-none focus:border-brand"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="text-[16px] font-medium text-ink">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-14 rounded-2xl border border-line bg-surface px-5 text-[17px] text-ink outline-none focus:border-brand"
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-2xl border border-attention-line bg-attention-soft px-5 py-4 text-[16px] text-attention-ink"
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="h-14 rounded-2xl bg-brand px-6 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
      >
        {pending ? "Signing in..." : "Sign In"}
      </button>
    </form>
  );
}
