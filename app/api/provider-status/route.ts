import { NextResponse } from 'next/server';

/**
 * Returns which providers have API keys configured as server-side env vars.
 * Returns true/false only — the actual key values are never sent to the client.
 */
export async function GET() {
  return NextResponse.json({
    openai: !!process.env.OPENAI_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    claude: !!process.env.ANTHROPIC_API_KEY,
  });
}
