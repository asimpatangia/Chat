'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Mic, MicOff, Paperclip, Settings, Menu, Bot,
  User, Copy, Check, AlertCircle, Loader2, X
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage, Provider, MODEL_OPTIONS } from '@/lib/types';

interface UploadedFile {
  id: string;
  name: string;
  public_url: string;
  size: number;
}

interface Props {
  messages: ChatMessage[];
  conversationTitle: string;
  provider: Provider;
  model: string;
  hasApiKey: boolean;
  conversationId: string | null;
  sidebarOpen: boolean;
  onSend: (content: string) => void;
  onSettings: () => void;
  onToggleSidebar: () => void;
}

export default function ChatInterface({
  messages, conversationTitle, provider, model, hasApiKey,
  conversationId, sidebarOpen, onSend, onSettings, onToggleSidebar,
}: Props) {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const isStreaming = messages.length > 0 && messages[messages.length - 1]?.role === 'assistant' &&
    messages[messages.length - 1]?.content === '' && isLoading;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }
  }, [input]);

  // Track loading based on last assistant message being empty
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === 'assistant' && last.content === '') {
      setIsLoading(true);
    } else {
      setIsLoading(false);
    }
  }, [messages]);

  function initSpeechRecognition() {
    const SpeechRecognition = (window as Window & typeof globalThis & { SpeechRecognition?: typeof window.SpeechRecognition; webkitSpeechRecognition?: typeof window.SpeechRecognition }).SpeechRecognition
      || (window as Window & typeof globalThis & { webkitSpeechRecognition?: typeof window.SpeechRecognition }).webkitSpeechRecognition;

    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };

    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    return recognition;
  }

  function toggleListening() {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      const recognition = initSpeechRecognition();
      if (!recognition) {
        alert('Speech recognition is not supported in your browser.');
        return;
      }
      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    }
  }

  async function handleFileUpload(file: File) {
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    if (conversationId) formData.append('conversationId', conversationId);

    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    if (res.ok) {
      const data = await res.json();
      setUploadedFiles(prev => [...prev, data]);
      setInput(prev => prev + (prev ? '\n' : '') + `[File: ${file.name}](${data.public_url})`);
    }
    setIsUploading(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }

  function handleSubmit() {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    setUploadedFiles([]);
    onSend(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  async function copyMessage(content: string, idx: number) {
    await navigator.clipboard.writeText(content);
    setCopiedId(idx);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const isWaiting = isLoading && messages[messages.length - 1]?.content === '';

  return (
    <div
      className="flex flex-col flex-1 h-screen min-w-0"
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Top Bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2f2f2f] shrink-0">
        {!sidebarOpen && (
          <button onClick={onToggleSidebar} className="p-1.5 rounded hover:bg-[#2f2f2f] text-gray-400 hover:text-white transition-colors">
            <Menu size={18} />
          </button>
        )}
        <span className="text-sm font-medium text-gray-300 truncate flex-1">{conversationTitle}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 hidden sm:block">
            {MODEL_OPTIONS[provider].label} · {model}
          </span>
          <button
            onClick={onSettings}
            className="p-1.5 rounded hover:bg-[#2f2f2f] text-gray-400 hover:text-white transition-colors"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-4">
            <Bot size={48} className="text-[#10a37f] opacity-70" />
            <div>
              <h2 className="text-xl font-semibold text-white mb-1">How can I help you today?</h2>
              <p className="text-sm text-gray-500">
                {hasApiKey
                  ? `Using ${MODEL_OPTIONS[provider].label} · ${model}`
                  : 'Add an API key in Settings to start chatting'}
              </p>
            </div>
            {!hasApiKey && (
              <button
                onClick={onSettings}
                className="px-4 py-2 bg-[#10a37f] hover:bg-[#0d8a6a] text-white rounded-lg text-sm font-medium transition-colors"
              >
                Add API Key
              </button>
            )}
          </div>
        ) : (
          <div className="max-w-3xl mx-auto w-full px-4 py-6 space-y-6">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="shrink-0 w-8 h-8 rounded-full bg-[#10a37f] flex items-center justify-center mt-0.5">
                    <Bot size={16} className="text-white" />
                  </div>
                )}
                <div className={`group relative max-w-[85%] ${msg.role === 'user' ? 'order-first' : ''}`}>
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-[#2f2f2f] text-white rounded-br-sm'
                        : 'text-gray-200'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      msg.content === '' ? (
                        <div className="flex items-center gap-2 text-gray-500">
                          <Loader2 size={16} className="animate-spin" />
                          <span>Thinking…</span>
                        </div>
                      ) : (
                        <div className="prose-chat">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        </div>
                      )
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                  </div>
                  {msg.content && (
                    <button
                      onClick={() => copyMessage(msg.content, idx)}
                      className="absolute -bottom-5 right-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs text-gray-600 hover:text-gray-400"
                    >
                      {copiedId === idx ? <Check size={12} /> : <Copy size={12} />}
                      {copiedId === idx ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="shrink-0 w-8 h-8 rounded-full bg-[#3f3f3f] flex items-center justify-center mt-0.5">
                    <User size={16} className="text-gray-300" />
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="shrink-0 px-4 pb-4 pt-2 max-w-3xl mx-auto w-full">
        {!hasApiKey && (
          <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2 mb-2">
            <AlertCircle size={13} />
            No {MODEL_OPTIONS[provider].label} API key. <button onClick={onSettings} className="underline">Add one in Settings</button>
          </div>
        )}

        {/* Uploaded files preview */}
        {uploadedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {uploadedFiles.map(f => (
              <div key={f.id} className="flex items-center gap-1.5 bg-[#2f2f2f] rounded-lg px-2.5 py-1.5 text-xs text-gray-300">
                <Paperclip size={11} />
                <span className="max-w-[140px] truncate">{f.name}</span>
                <button onClick={() => setUploadedFiles(prev => prev.filter(u => u.id !== f.id))} className="text-gray-500 hover:text-gray-300">
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={`flex items-end gap-2 bg-[#2f2f2f] rounded-2xl border transition-colors px-4 py-3 ${
          dragOver ? 'border-[#10a37f]' : 'border-[#3f3f3f] focus-within:border-[#555]'
        }`}>
          {/* File upload */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ''; }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="shrink-0 p-1 text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
            title="Attach file"
          >
            {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
          </button>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message AI Chat…"
            rows={1}
            className="flex-1 bg-transparent text-white text-sm placeholder-gray-600 resize-none outline-none max-h-[200px] leading-relaxed py-0.5"
          />

          {/* Speech to text */}
          <button
            onClick={toggleListening}
            className={`shrink-0 p-1 transition-colors ${isListening ? 'text-red-400 animate-pulse' : 'text-gray-500 hover:text-gray-300'}`}
            title={isListening ? 'Stop listening' : 'Start voice input'}
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          {/* Send */}
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading || !hasApiKey}
            className="shrink-0 p-1.5 rounded-lg bg-[#10a37f] hover:bg-[#0d8a6a] text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Send message"
          >
            <Send size={15} />
          </button>
        </div>
        <p className="text-center text-xs text-gray-600 mt-2">
          Shift+Enter for new line · Drag & drop to upload files
        </p>
      </div>
    </div>
  );
}
