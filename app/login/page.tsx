"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid email or password.");
    } else {
      router.push(callbackUrl);
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-black">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center bg-brand-red">
            <span className="text-sm font-800 tracking-tight text-white">CA</span>
          </div>
          <div className="text-center">
            <p className="text-lg font-700 tracking-tight text-white">CORE ACTION</p>
            <p className="text-xs font-500 uppercase tracking-widest text-white/40">
              Inventory ML
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-sm bg-white p-8 shadow-2xl">
          <div className="mb-6 flex items-center gap-2">
            <Lock className="h-4 w-4 text-brand-dark-gray" />
            <h1 className="text-sm font-700 uppercase tracking-widest text-brand-black">
              Sign In
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-xs font-600 uppercase tracking-wider text-brand-dark-gray">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-none border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-red focus:outline-none"
                placeholder="you@ridecore.pro"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1 block text-xs font-600 uppercase tracking-wider text-brand-dark-gray">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-none border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-red focus:outline-none"
              />
            </div>

            {error && (
              <p className="rounded-sm bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-none bg-brand-red px-4 py-3 text-sm font-700 uppercase tracking-widest text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p className="mt-6 text-center text-[10px] text-brand-dark-gray">
            Contact your administrator to reset your password.
          </p>
        </div>

        <p className="mt-4 text-center text-[10px] text-white/30">
          © {new Date().getFullYear()} Core Action Sports · #RIDECORE
        </p>
      </div>
    </div>
  );
}
