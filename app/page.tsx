'use client';

import { useState, useEffect, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import ChatInterface from '@/components/ChatInterface';
import SettingsModal from '@/components/SettingsModal';
import { Conversation, ApiKeys, Provider, ChatMessage, ImagePart } from '@/lib/types';

const DEFAULT_KEYS: ApiKeys = { openai: '', gemini: '', claude: '' };

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeys>(DEFAULT_KEYS);
  const [provider, setProvider] = useState<Provider>('openai');
  const [model, setModel] = useState('gpt-4o');
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsSaved, setSettingsSaved] = useState(false);
  // Which providers have a key configured server-side (env var)
  const [envProviders, setEnvProviders] = useState<Record<string, boolean>>({});

  const deviceIdRef = useRef<string>('');

  // ── On mount: load device ID + settings ─────────────────────────────────────
  useEffect(() => {
    // Get or generate a stable device ID in localStorage
    let id = localStorage.getItem('ai-chat-device-id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('ai-chat-device-id', id);
    }
    deviceIdRef.current = id;

    loadSettings(id);
    fetchConversations();

    // Check which providers are pre-configured server-side
    fetch('/api/provider-status')
      .then(r => r.json())
      .then(setEnvProviders)
      .catch(() => {});
  }, []);

  async function loadSettings(deviceId: string) {
    // Try Supabase first (works across browser restarts, even if localStorage cleared)
    try {
      const res = await fetch(`/api/settings?deviceId=${deviceId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.apiKeys) {
          setApiKeys(data.apiKeys);
          setSettingsSaved(true);
        }
        if (data.provider) setProvider(data.provider as Provider);
        if (data.model) setModel(data.model);
        return; // success — don't fall through to localStorage
      }
    } catch {
      // network error — fall back to localStorage
    }

    // localStorage fallback (covers offline / Supabase outage)
    const saved = localStorage.getItem('ai-chat-keys');
    if (saved) { setApiKeys(JSON.parse(saved)); setSettingsSaved(true); }
    const savedProvider = localStorage.getItem('ai-chat-provider') as Provider;
    if (savedProvider) setProvider(savedProvider);
    const savedModel = localStorage.getItem('ai-chat-model');
    if (savedModel) setModel(savedModel);
  }

  // ── Conversations ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (activeConversationId) fetchMessages(activeConversationId);
    else setMessages([]);
  }, [activeConversationId]);

  async function fetchConversations() {
    const res = await fetch('/api/conversations');
    if (res.ok) setConversations(await res.json());
  }

  async function fetchMessages(conversationId: string) {
    const res = await fetch(`/api/conversations/${conversationId}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.map((m: { role: string; content: string }) => ({
        role: m.role, content: m.content,
      })));
    }
  }

  async function handleNewChat() {
    const res = await fetch('/api/conversations', { method: 'POST' });
    if (res.ok) {
      const conv = await res.json();
      setConversations(prev => [conv, ...prev]);
      setActiveConversationId(conv.id);
      setMessages([]);
    }
  }

  async function handleDeleteConversation(id: string) {
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConversationId === id) { setActiveConversationId(null); setMessages([]); }
  }

  // ── Settings save ────────────────────────────────────────────────────────────

  async function handleSaveKeys(keys: ApiKeys, newProvider: Provider, newModel: string) {
    setApiKeys(keys);
    setProvider(newProvider);
    setModel(newModel);
    setSettingsSaved(true);

    const settings = { apiKeys: keys, provider: newProvider, model: newModel };

    // Always persist to localStorage (fast, offline-safe)
    localStorage.setItem('ai-chat-keys', JSON.stringify(keys));
    localStorage.setItem('ai-chat-provider', newProvider);
    localStorage.setItem('ai-chat-model', newModel);

    // Also persist to Supabase (survives localStorage clears, browser data wipes)
    if (deviceIdRef.current) {
      try {
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: deviceIdRef.current, settings }),
        });
      } catch {
        // Supabase save failed — localStorage copy still works
      }
    }

    setShowSettings(false);
  }

  async function handleForgetKeys() {
    // Clear localStorage
    localStorage.removeItem('ai-chat-keys');
    localStorage.removeItem('ai-chat-provider');
    localStorage.removeItem('ai-chat-model');

    // Clear Supabase
    if (deviceIdRef.current) {
      try {
        await fetch(`/api/settings?deviceId=${deviceIdRef.current}`, { method: 'DELETE' });
      } catch { /* ignore */ }
    }

    setApiKeys(DEFAULT_KEYS);
    setSettingsSaved(false);
    setShowSettings(false);
  }

  // ── Send message ─────────────────────────────────────────────────────────────

  async function handleSendMessage(content: string, images?: ImagePart[]) {
    let convId = activeConversationId;

    if (!convId) {
      const res = await fetch('/api/conversations', { method: 'POST' });
      if (!res.ok) return;
      const conv = await res.json();
      convId = conv.id;
      setConversations(prev => [conv, ...prev]);
      setActiveConversationId(conv.id);
    }

    await fetch(`/api/conversations/${convId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'user', content }),
    });

    const userMsg: ChatMessage = { role: 'user', content, images };
    const newMessages: ChatMessage[] = [...messages, userMsg];
    setMessages([...newMessages, { role: 'assistant', content: '' }]);

    // Only send images on the most recent message (keep history lean)
    const apiMessages = newMessages.map((m, i) =>
      i === newMessages.length - 1 ? m : { role: m.role, content: m.content }
    );

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: apiMessages,
        provider,
        apiKey: apiKeys[provider],
        model,
        conversationId: convId,
      }),
    });

    if (!res.body) return;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let assistantContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      assistantContent += decoder.decode(value, { stream: true });
      const current = assistantContent;
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: current };
        return updated;
      });
    }

    fetchConversations();
  }

  const activeConversation = conversations.find(c => c.id === activeConversationId);

  return (
    <div className="flex h-screen bg-[#212121]">
      <Sidebar
        open={sidebarOpen}
        conversations={conversations}
        activeId={activeConversationId}
        onNew={handleNewChat}
        onSelect={setActiveConversationId}
        onDelete={handleDeleteConversation}
        onSettings={() => setShowSettings(true)}
        onToggle={() => setSidebarOpen(o => !o)}
      />
      <ChatInterface
        messages={messages}
        conversationTitle={activeConversation?.title ?? 'New Chat'}
        provider={provider}
        model={model}
        hasApiKey={!!envProviders[provider] || !!apiKeys[provider]}
        conversationId={activeConversationId}
        sidebarOpen={sidebarOpen}
        onSend={handleSendMessage}
        onSettings={() => setShowSettings(true)}
        onToggleSidebar={() => setSidebarOpen(o => !o)}
      />
      {showSettings && (
        <SettingsModal
          apiKeys={apiKeys}
          provider={provider}
          model={model}
          settingsSaved={settingsSaved}
          envProviders={envProviders}
          onSave={handleSaveKeys}
          onForget={handleForgetKeys}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
