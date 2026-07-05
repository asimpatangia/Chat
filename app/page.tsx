'use client';

import { useState, useEffect } from 'react';
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

  useEffect(() => {
    const saved = localStorage.getItem('ai-chat-keys');
    if (saved) setApiKeys(JSON.parse(saved));
    const savedProvider = localStorage.getItem('ai-chat-provider') as Provider;
    if (savedProvider) setProvider(savedProvider);
    const savedModel = localStorage.getItem('ai-chat-model');
    if (savedModel) setModel(savedModel);
  }, []);

  useEffect(() => { fetchConversations(); }, []);

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
      // Messages loaded from DB have no images (images are transient)
      setMessages(data.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
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

  async function handleSelectConversation(id: string) {
    setActiveConversationId(id);
  }

  async function handleDeleteConversation(id: string) {
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConversationId === id) { setActiveConversationId(null); setMessages([]); }
  }

  function handleSaveKeys(keys: ApiKeys, newProvider: Provider, newModel: string) {
    setApiKeys(keys);
    setProvider(newProvider);
    setModel(newModel);
    localStorage.setItem('ai-chat-keys', JSON.stringify(keys));
    localStorage.setItem('ai-chat-provider', newProvider);
    localStorage.setItem('ai-chat-model', newModel);
    setShowSettings(false);
  }

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

    // Persist user message text to DB (images are not stored)
    await fetch(`/api/conversations/${convId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'user', content }),
    });

    const userMsg: ChatMessage = { role: 'user', content, images };
    const newMessages: ChatMessage[] = [...messages, userMsg];
    setMessages([...newMessages, { role: 'assistant', content: '' }]);

    // Strip images from previous messages to keep payload size sane
    // (only the current message needs images; history is text-only)
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
        onSelect={handleSelectConversation}
        onDelete={handleDeleteConversation}
        onSettings={() => setShowSettings(true)}
        onToggle={() => setSidebarOpen(o => !o)}
      />
      <ChatInterface
        messages={messages}
        conversationTitle={activeConversation?.title ?? 'New Chat'}
        provider={provider}
        model={model}
        hasApiKey={!!apiKeys[provider]}
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
          onSave={handleSaveKeys}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
