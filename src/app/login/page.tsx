import SignInForm from "@/components/auth/SignInForm";
import { APP_NAME } from "@/lib/navigation";

export const metadata = {
  title: "Staff Sign In",
};

export default async function LoginPage(props: PageProps<"/login">) {
  const { next } = await props.searchParams;
  const nextPath = typeof next === "string" ? next : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-[36px] font-semibold leading-tight tracking-tight text-ink">
            {APP_NAME}
          </h1>
          <p className="mt-3 text-[18px] text-ink-muted">Staff Sign In</p>
        </div>

        <div className="rounded-3xl border border-line bg-surface p-8 sm:p-10">
          <SignInForm next={nextPath} />
        </div>
      </div>
    </main>
  );
}
