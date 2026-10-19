import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * One-time 18+ age confirmation.
 *
 * Shown when the signed-in user has no confirmed birth date. The server
 * refuses AI routes until auth.confirmAge succeeds, so this gate is a
 * UX affordance on top of a real server-side check — not the check
 * itself. Copy is currently English-first.
 */
export function AgeGate() {
  const { user, refresh, logout } = useAuth();
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState("");
  const [underage, setUnderage] = useState(false);

  const confirmAge = trpc.auth.confirmAge.useMutation({
    onSuccess: async () => {
      await refresh();
    },
    onError: err => {
      if (err.data?.code === "FORBIDDEN") {
        setUnderage(true);
      } else {
        setError(err.message);
      }
    },
  });

  const open = Boolean(user) && !(user as any)?.birthDate;
  if (!open) return null;

  return (
    <Dialog open>
      <DialogContent
        className="max-w-md [&>button]:hidden"
        onInteractOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        {underage ? (
          <>
            <DialogHeader>
              <DialogTitle>We can't let you in</DialogTitle>
              <DialogDescription>
                YUMEI is an 18+ service and isn't available to minors. If you're
                going through a hard time, you're not alone — reach out to
                someone you trust, or find help at{" "}
                <a
                  className="underline"
                  href="https://findahelpline.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  findahelpline.com
                </a>
                .
              </DialogDescription>
            </DialogHeader>
            <Button variant="outline" onClick={() => logout()}>
              Sign out
            </Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Confirm your age</DialogTitle>
              <DialogDescription>
                YUMEI is an adults-only (18+) service, and your companion is
                AI-generated — not a real person. Enter your date of birth to
                continue. We only use it to confirm you're an adult.
              </DialogDescription>
            </DialogHeader>
            <form
              className="flex flex-col gap-3"
              onSubmit={e => {
                e.preventDefault();
                setError("");
                confirmAge.mutate({ birthDate });
              }}
            >
              <Input
                type="date"
                required
                value={birthDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={e => setBirthDate(e.target.value)}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                type="submit"
                disabled={confirmAge.isPending || !birthDate}
              >
                {confirmAge.isPending
                  ? "Confirming…"
                  : "I'm 18 or older — continue"}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
