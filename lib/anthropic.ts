import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local");
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export interface AIInsightRequest {
  context: string;
  question: string;
}

export interface AIInsightResponse {
  insight: string;
  model: string;
}

/**
 * Get a narrative AI insight from Claude about a forecast or purchase order.
 */
export async function getAIInsight(req: AIInsightRequest): Promise<AIInsightResponse> {
  const client = getAnthropicClient();

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: `You are an expert inventory and buying analyst for Core Action Sports,
an Australian action sports distributor (skateboarding, surfing, snowboarding).
You provide concise, data-driven insights about inventory forecasting, purchase orders,
and sell-through performance. Use bullet points and be specific.
Always flag seasonal risks, stockout risks, and profitability concerns.`,
    messages: [
      {
        role: "user",
        content: `Context:\n${req.context}\n\nQuestion: ${req.question}`,
      },
    ],
  });

  const content = message.content[0];
  const insight = content.type === "text" ? content.text : "";

  return { insight, model: message.model };
}
