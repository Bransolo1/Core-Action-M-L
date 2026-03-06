import { NextRequest } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, created, unauthorized, badRequest, zodError, serverError } from "@/lib/api-response";

const createSchema = z.object({
  purchaseOrderId: z.string().min(1),
  content: z.string().min(1).max(2000),
});

/** GET /api/po-comments?poId=xxx */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  const poId = req.nextUrl.searchParams.get("poId");
  if (!poId) return badRequest("poId query param required");

  try {
    const comments = await prisma.pOComment.findMany({
      where: { purchaseOrderId: poId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });

    return ok(
      comments.map((c) => ({
        id: c.id,
        purchaseOrderId: c.purchaseOrderId,
        userId: c.userId,
        userName: c.user.name ?? c.user.email,
        content: c.content,
        createdAt: c.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    return serverError(err);
  }
}

/** POST /api/po-comments */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  if (session.user.role === "VIEWER") {
    return unauthorized("Viewers cannot add comments");
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);

  try {
    const comment = await prisma.pOComment.create({
      data: {
        purchaseOrderId: parsed.data.purchaseOrderId,
        userId: session.user.id,
        content: parsed.data.content,
      },
      include: { user: { select: { name: true, email: true } } },
    });

    return created({
      id: comment.id,
      purchaseOrderId: comment.purchaseOrderId,
      userId: comment.userId,
      userName: comment.user.name ?? comment.user.email,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
    });
  } catch (err) {
    return serverError(err);
  }
}
