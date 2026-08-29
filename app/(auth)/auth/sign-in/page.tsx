import type { Metadata } from "next";
import { PasswordSignInForm } from "@/components/auth/PasswordSignInForm";
import { safeReturnTo } from "@/lib/navigation/safe-return-to";

export const metadata: Metadata = {
  title: "Sign in | VisePanda",
  description: "Invitation-only closed-beta sign-in for VisePanda.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const { returnTo } = await searchParams;
  return <PasswordSignInForm returnTo={safeReturnTo(returnTo)} />;
}
