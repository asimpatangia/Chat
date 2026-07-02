export type Provider = 'openai' | 'gemini' | 'claude';

export interface ApiKeys {
  openai: string;
  gemini: string;
  claude: string;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

export interface UploadedFile {
  id: string;
  conversation_id: string | null;
  name: string;
  storage_path: string;
  public_url: string;
  size: number;
  mime_type: string;
  created_at: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const MODEL_OPTIONS: Record<Provider, { label: string; models: string[] }> = {
  openai: {
    label: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  gemini: {
    label: 'Google Gemini',
    models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'],
  },
  claude: {
    label: 'Anthropic Claude',
    models: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5-20251001'],
  },
};
