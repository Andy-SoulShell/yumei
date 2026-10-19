import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { error: authError } = await authClient.signIn.magicLink({
        email,
        callbackURL: "/",
      });
      if (authError) {
        setError(authError.message ?? "Failed to send magic link");
      } else {
        setSent(true);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-6 p-8 max-w-md w-full">
          <h1 className="text-2xl font-semibold tracking-tight text-center">
            Check your inbox
          </h1>
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            We sent a sign-in link to <strong>{email}</strong>. Click the link
            in the email to continue.
          </p>
          <Button
            variant="ghost"
            onClick={() => {
              setSent(false);
              setEmail("");
            }}
          >
            Use a different email
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-6 p-8 max-w-md w-full">
        <h1 className="text-2xl font-semibold tracking-tight text-center">
          Sign in to continue
        </h1>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          Enter your email and we'll send you a magic link.
        </p>
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
          />
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? "Sending…" : "Send magic link"}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground text-center max-w-sm">
          18+ only. Companions on YUMEI are AI-generated — not real people. We
          never train models on your conversations.
        </p>
      </div>
    </div>
  );
}
