import { NextRequest } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAIInsight } from "@/lib/anthropic";
import { rateLimit } from "@/lib/rate-limit";
import { unauthorized, tooManyRequests, zodError, serverError, ok } from "@/lib/api-response";

const schema = z.object({
  context: z.string().min(1).max(10_000),
  question: z.string().min(1).max(1_000),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  // Rate limit: 10 AI calls per user per minute
  const rl = rateLimit(`ai:${session.user.id}`, { limit: 10, windowMs: 60_000 });
  if (!rl.success) return tooManyRequests(rl.resetAt);

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);

  try {
    const result = await getAIInsight(parsed.data);
    return ok(result);
  } catch (err) {
    return serverError(err);
  }
}
