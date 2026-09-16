import { PasswordSignInForm } from "@/components/auth/PasswordSignInForm";
import { TestingChat } from "./TestingChat";

export default function TestingChatPage() {
  return <TestingChat signInFallback={<PasswordSignInForm returnTo="/testing-chat" />} />;
}
