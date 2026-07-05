import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '@/lib/supabase';
import { Provider, ChatMessage, ImagePart } from '@/lib/types';

export const runtime = 'edge';

// ── Helper: build provider-specific message payloads ─────────────────────────

function buildOpenAIMessages(messages: ChatMessage[]) {
  return messages.map(m => {
    if (m.images && m.images.length > 0) {
      return {
        role: m.role,
        content: [
          { type: 'text' as const, text: m.content },
          ...m.images.map((img: ImagePart) => ({
            type: 'image_url' as const,
            image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
          })),
        ],
      };
    }
    return { role: m.role, content: m.content };
  });
}

function buildGeminiHistory(messages: ChatMessage[]) {
  return messages.slice(0, -1).map(m => {
    const parts: object[] = [{ text: m.content }];
    if (m.images) {
      m.images.forEach((img: ImagePart) => {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
      });
    }
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  });
}

function buildGeminiLastParts(msg: ChatMessage) {
  const parts: object[] = [{ text: msg.content }];
  if (msg.images) {
    msg.images.forEach((img: ImagePart) => {
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
    });
  }
  return parts;
}

function buildClaudeMessages(messages: ChatMessage[]) {
  return messages.map(m => {
    if (m.images && m.images.length > 0) {
      return {
        role: m.role,
        content: [
          ...m.images.map((img: ImagePart) => ({
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: img.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: img.base64,
            },
          })),
          { type: 'text' as const, text: m.content },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { messages, provider, apiKey, model, conversationId } = await req.json() as {
    messages: ChatMessage[];
    provider: Provider;
    apiKey: string;
    model: string;
    conversationId: string;
  };

  if (!apiKey) {
    return new Response(JSON.stringify({ error: `No API key provided for ${provider}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let fullContent = '';

      try {
        if (provider === 'openai') {
          const client = new OpenAI({ apiKey });
          const response = await client.chat.completions.create({
            model,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            messages: buildOpenAIMessages(messages) as any,
            stream: true,
          });
          for await (const chunk of response) {
            const text = chunk.choices[0]?.delta?.content ?? '';
            if (text) { fullContent += text; controller.enqueue(encoder.encode(text)); }
          }

        } else if (provider === 'gemini') {
          const genAI = new GoogleGenerativeAI(apiKey);
          const geminiModel = genAI.getGenerativeModel({ model });
          const history = buildGeminiHistory(messages);
          const lastMsg = messages[messages.length - 1];
          const lastParts = buildGeminiLastParts(lastMsg);
          const chat = geminiModel.startChat({ history });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = await chat.sendMessageStream(lastParts as any);
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) { fullContent += text; controller.enqueue(encoder.encode(text)); }
          }

        } else if (provider === 'claude') {
          const client = new Anthropic({ apiKey });
          const response = await client.messages.create({
            model,
            max_tokens: 4096,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            messages: buildClaudeMessages(messages) as any,
            stream: true,
          });
          for await (const event of response) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              fullContent += event.delta.text;
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
        }

        // Persist assistant reply (text only — images are transient)
        if (conversationId && fullContent) {
          await supabase.from('messages').insert({
            conversation_id: conversationId,
            role: 'assistant',
            content: fullContent,
          });

          // Auto-title from first user message
          const firstUserMsg = messages.find(m => m.role === 'user');
          if (firstUserMsg && messages.length <= 2) {
            const title = firstUserMsg.content.slice(0, 60) +
              (firstUserMsg.content.length > 60 ? '…' : '');
            await supabase
              .from('conversations')
              .update({ title })
              .eq('id', conversationId)
              .eq('title', 'New Chat');
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        controller.enqueue(encoder.encode(`\n\n**Error:** ${message}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
