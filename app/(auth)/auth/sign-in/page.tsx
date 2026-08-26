import type { Metadata } from "next";
import { PasswordSignInForm } from "@/components/auth/PasswordSignInForm";

export const metadata: Metadata = {
  title: "Sign in | VisePanda",
  description: "Invitation-only closed-beta sign-in for VisePanda.",
};

export default function SignInPage() {
  return <PasswordSignInForm />;
}
