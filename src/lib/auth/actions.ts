"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SignInState = { error: string | null };

const SignInSchema = z.object({
  email: z.string().trim().min(1, "Enter your email address.").email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

/** Only allow redirects back into this application. */
function safeNextPath(value: string | undefined): string {
  if (!value) return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  if (value === "/login" || value.startsWith("/login?")) return "/dashboard";
  return value;
}

export async function signInAction(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  if (!isSupabaseConfigured) {
    return {
      error:
        "Sign in is not available yet. Supabase environment values are missing.",
    };
  }

  const parsed = SignInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details and try again." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Do not leak whether the email exists.
    return { error: "Email or password is incorrect." };
  }

  redirect(safeNextPath(parsed.data.next));
}

export async function signOutAction() {
  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
