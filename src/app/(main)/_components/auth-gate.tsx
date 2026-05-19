"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useConvexAuth } from "convex/react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * Client-side auth gate (sticky).
 *
 * Why not Authenticated / AuthLoading / Unauthenticated wrappers?
 *   Better-auth's Convex JWT refresh briefly toggles `isAuthenticated`
 *   off (and `isLoading` on) every time the token rotates. Wrapping the
 *   tree in those primitives would unmount and remount every page on
 *   each refresh, which is what was making every tab "flash" every few
 *   seconds and reset all `useQuery` subscriptions.
 *
 * Strategy:
 *   - Show a spinner only on the FIRST authentication check.
 *   - Once authed-once, render children and never tear them down again
 *     for transient auth-loading states.
 *   - Only redirect to /login if Convex reports unauthenticated AND
 *     loading has settled AND we haven't been authed before AND a brief
 *     grace period has elapsed (covers SSR-to-client handoff).
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const [hasBeenAuthed, setHasBeenAuthed] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const router = useRouter();
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isAuthenticated && !hasBeenAuthed) {
      setHasBeenAuthed(true);
    }
  }, [isAuthenticated, hasBeenAuthed]);

  useEffect(() => {
    // Only consider redirecting before we've ever been authenticated.
    if (hasBeenAuthed) return;
    if (isLoading || isAuthenticated) {
      if (redirectTimer.current) {
        clearTimeout(redirectTimer.current);
        redirectTimer.current = null;
      }
      return;
    }
    // Definitely unauthed and settled — redirect after a short grace
    // window in case auth is just resolving on first paint.
    if (!redirectTimer.current) {
      redirectTimer.current = setTimeout(() => {
        setRedirecting(true);
        router.replace("/login");
      }, 800);
    }
    return () => {
      if (redirectTimer.current) {
        clearTimeout(redirectTimer.current);
        redirectTimer.current = null;
      }
    };
  }, [isLoading, isAuthenticated, hasBeenAuthed, router]);

  if (hasBeenAuthed) return <>{children}</>;

  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      {redirecting && <span className="ml-3 text-sm text-muted-foreground">Redirecting…</span>}
    </div>
  );
}
