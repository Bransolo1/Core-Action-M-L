import { NextRequest, NextResponse } from "next/server";
import { getAIInsight } from "@/lib/anthropic";

interface AIRequestBody {
  context: string;
  question: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: AIRequestBody = await req.json();
    const result = await getAIInsight(body);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/ai-suggest]", err);
    const message = err instanceof Error ? err.message : "AI suggestion failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
