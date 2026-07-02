import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '@/lib/supabase';
import { Provider, ChatMessage } from '@/lib/types';

export const runtime = 'edge';

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
          const openaiMessages = messages.map(m => ({ role: m.role, content: m.content }));

          const response = await client.chat.completions.create({
            model,
            messages: openaiMessages,
            stream: true,
          });

          for await (const chunk of response) {
            const text = chunk.choices[0]?.delta?.content ?? '';
            if (text) {
              fullContent += text;
              controller.enqueue(encoder.encode(text));
            }
          }
        } else if (provider === 'gemini') {
          const genAI = new GoogleGenerativeAI(apiKey);
          const geminiModel = genAI.getGenerativeModel({ model });

          // Build history (all but last user message)
          const history = messages.slice(0, -1).map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          }));
          const lastMessage = messages[messages.length - 1];

          const chat = geminiModel.startChat({ history });
          const result = await chat.sendMessageStream(lastMessage.content);

          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              fullContent += text;
              controller.enqueue(encoder.encode(text));
            }
          }
        } else if (provider === 'claude') {
          const client = new Anthropic({ apiKey });

          const response = await client.messages.create({
            model,
            max_tokens: 4096,
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            stream: true,
          });

          for await (const event of response) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              fullContent += event.delta.text;
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
        }

        // Save assistant message to DB after streaming
        if (conversationId && fullContent) {
          await supabase.from('messages').insert({
            conversation_id: conversationId,
            role: 'assistant',
            content: fullContent,
          });

          // Auto-update conversation title from first user message if it's still "New Chat"
          const firstUserMsg = messages.find(m => m.role === 'user');
          if (firstUserMsg && messages.length <= 2) {
            const title = firstUserMsg.content.slice(0, 60) + (firstUserMsg.content.length > 60 ? '...' : '');
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
