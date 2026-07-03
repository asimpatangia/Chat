'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Send, Mic, MicOff, Paperclip, Settings, Menu, Bot,
  User, Copy, Check, AlertCircle, Loader2, X, FileText, ImageIcon
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage, Provider, MODEL_OPTIONS } from '@/lib/types';

// File types whose text content can be extracted client-side
const TEXT_TYPES = [
  'text/', 'application/json', 'application/xml', 'application/javascript',
  'application/typescript', 'application/csv',
];
const MAX_FILE_CHARS = 30000; // ~30k chars to avoid huge prompts

interface AttachedFile {
  name: string;
  size: number;
  type: string;
  textContent: string | null;   // extracted text, null if binary
  publicUrl: string | null;     // set after successful Supabase upload
  uploadError: string | null;
  uploading: boolean;
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

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function isTextFile(file: File): boolean {
  if (isPdfFile(file)) return false; // PDFs handled separately
  return TEXT_TYPES.some(t => file.type.startsWith(t)) ||
    /\.(txt|md|csv|json|xml|js|ts|jsx|tsx|py|rb|go|java|c|cpp|h|css|html|yaml|yml|env|sh|sql|log)$/i.test(file.name);
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChatInterface({
  messages, conversationTitle, provider, model, hasApiKey,
  conversationId, sidebarOpen, onSend, onSettings, onToggleSidebar,
}: Props) {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }
  }, [input]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === 'assistant' && last.content === '') {
      setIsLoading(true);
    } else {
      setIsLoading(false);
    }
  }, [messages]);

  // ── Speech to text ──────────────────────────────────────────────────────────
  function initSpeechRecognition() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return null;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
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
      if (!recognition) { alert('Speech recognition is not supported in your browser.'); return; }
      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    }
  }

  // ── File handling ────────────────────────────────────────────────────────────
  async function handleFileSelect(file: File) {
    const isText = isTextFile(file);
    const isPdf = isPdfFile(file);
    let textContent: string | null = null;
    let readError: string | null = null;

    // 1. Extract text client-side so AI can read it
    if (isText) {
      try {
        const raw = await readFileAsText(file);
        textContent = raw.length > MAX_FILE_CHARS
          ? raw.slice(0, MAX_FILE_CHARS) + `\n\n[... truncated at ${MAX_FILE_CHARS} characters ...]`
          : raw;
      } catch {
        readError = 'Could not read file contents';
      }
    } else if (isPdf) {
      try {
        const { extractPdfText } = await import('@/lib/pdfExtract');
        const raw = await extractPdfText(file);
        textContent = raw.length > MAX_FILE_CHARS
          ? raw.slice(0, MAX_FILE_CHARS) + `\n\n[... truncated at ${MAX_FILE_CHARS} characters ...]`
          : raw;
      } catch (err) {
        readError = err instanceof Error ? err.message : 'Could not extract PDF text';
      }
    }

    const entry: AttachedFile = {
      name: file.name,
      size: file.size,
      type: file.type,
      textContent,
      publicUrl: null,
      uploadError: readError,
      uploading: true,
    };

    setAttachedFiles(prev => [...prev, entry]);

    // 2. Upload to Supabase for persistent storage (background)
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (conversationId) formData.append('conversationId', conversationId);

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setAttachedFiles(prev =>
        prev.map(f =>
          f.name === entry.name && f.uploading
            ? { ...f, publicUrl: data.public_url, uploading: false }
            : f
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setAttachedFiles(prev =>
        prev.map(f =>
          f.name === entry.name && f.uploading
            ? { ...f, uploadError: (f.uploadError ? f.uploadError + '; ' : '') + msg, uploading: false }
            : f
        )
      );
    }
  }

  function removeFile(name: string) {
    setAttachedFiles(prev => prev.filter(f => f.name !== name));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    Array.from(e.dataTransfer.files).forEach(handleFileSelect);
  }

  // ── Send message ─────────────────────────────────────────────────────────────
  function handleSubmit() {
    const text = input.trim();
    if ((!text && attachedFiles.length === 0) || isLoading) return;

    // Build message: user text + embedded file contents
    let fullMessage = text;

    attachedFiles.forEach(f => {
      if (f.textContent) {
        fullMessage += `\n\n--- File: ${f.name} (${formatBytes(f.size)}) ---\n${f.textContent}\n--- End of ${f.name} ---`;
      } else if (f.publicUrl) {
        fullMessage += `\n\n[Attached file: ${f.name} (${formatBytes(f.size)}) — ${f.publicUrl}]`;
      } else {
        fullMessage += `\n\n[Attached file: ${f.name} (${formatBytes(f.size)}) — binary file, content not extractable]`;
      }
    });

    setInput('');
    setAttachedFiles([]);
    onSend(fullMessage.trim());
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

  const anyUploading = attachedFiles.some(f => f.uploading);
  const canSend = (input.trim() || attachedFiles.length > 0) && !isLoading && !anyUploading && hasApiKey;

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
          <button onClick={onSettings} className="p-1.5 rounded hover:bg-[#2f2f2f] text-gray-400 hover:text-white transition-colors">
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
              <button onClick={onSettings} className="px-4 py-2 bg-[#10a37f] hover:bg-[#0d8a6a] text-white rounded-lg text-sm font-medium transition-colors">
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
                  <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user' ? 'bg-[#2f2f2f] text-white rounded-br-sm' : 'text-gray-200'
                  }`}>
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
                      // Render user messages — collapse embedded file blocks
                      <UserMessage content={msg.content} />
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
            No {MODEL_OPTIONS[provider].label} API key.{' '}
            <button onClick={onSettings} className="underline">Add one in Settings</button>
          </div>
        )}

        {/* Attached files preview */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachedFiles.map(f => (
              <div
                key={f.name}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs border ${
                  f.uploadError
                    ? 'bg-red-950/40 border-red-800/40 text-red-300'
                    : 'bg-[#2f2f2f] border-[#3f3f3f] text-gray-300'
                }`}
              >
                {f.uploading ? (
                  <Loader2 size={11} className="animate-spin text-gray-400" />
                ) : f.type.startsWith('image/') ? (
                  <ImageIcon size={11} />
                ) : (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) ? (
                  <FileText size={11} className="text-red-400" />
                ) : (
                  <FileText size={11} />
                )}
                <span className="max-w-[160px] truncate">{f.name}</span>
                {f.textContent && !f.uploading && (
                  <span className="text-gray-500">· text extracted</span>
                )}
                {f.uploadError && !f.textContent && (
                  <span title={f.uploadError} className="text-red-400">· error</span>
                )}
                <button
                  onClick={() => removeFile(f.name)}
                  className="ml-0.5 text-gray-500 hover:text-gray-200 transition-colors"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        {dragOver && (
          <div className="flex items-center justify-center gap-2 border-2 border-dashed border-[#10a37f] rounded-xl py-4 mb-2 text-sm text-[#10a37f]">
            <Paperclip size={16} />
            Drop file to attach
          </div>
        )}

        <div className={`flex items-end gap-2 bg-[#2f2f2f] rounded-2xl border transition-colors px-4 py-3 ${
          dragOver ? 'border-[#10a37f]' : 'border-[#3f3f3f] focus-within:border-[#555]'
        }`}>
          {/* File upload */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => {
              Array.from(e.target.files ?? []).forEach(handleFileSelect);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 p-1 text-gray-500 hover:text-gray-300 transition-colors"
            title="Attach file"
          >
            <Paperclip size={18} />
          </button>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={attachedFiles.length > 0 ? 'Ask something about the file(s)…' : 'Message AI Chat…'}
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
            disabled={!canSend}
            className="shrink-0 p-1.5 rounded-lg bg-[#10a37f] hover:bg-[#0d8a6a] text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Send message"
          >
            <Send size={15} />
          </button>
        </div>

        <p className="text-center text-xs text-gray-600 mt-2">
          Shift+Enter for new line · Drag & drop files · Text files are read and sent to the AI
        </p>
      </div>
    </div>
  );
}

// Renders user messages, collapsing embedded file blocks into a compact badge
function UserMessage({ content }: { content: string }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Split on file delimiters
  const parts = content.split(/(---\s*File:.*?---\s*End of.*?---)/s);

  return (
    <div className="whitespace-pre-wrap space-y-1">
      {parts.map((part, i) => {
        const fileMatch = part.match(/---\s*File:\s*(.+?)\s*\(.*?\)\s*---\n([\s\S]*?)\n---\s*End of/);
        if (fileMatch) {
          const fileName = fileMatch[1];
          const fileContent = fileMatch[2];
          const key = `${i}`;
          return (
            <div key={key} className="border border-[#3f3f3f] rounded-lg overflow-hidden text-xs">
              <button
                onClick={() => setExpanded(p => ({ ...p, [key]: !p[key] }))}
                className="flex items-center gap-2 w-full px-3 py-2 bg-[#1e1e1e] text-gray-400 hover:text-gray-200 text-left"
              >
                <FileText size={11} />
                <span className="font-medium truncate">{fileName}</span>
                <span className="ml-auto text-gray-600">{expanded[key] ? '▲ hide' : '▼ show'}</span>
              </button>
              {expanded[key] && (
                <pre className="px-3 py-2 text-gray-400 overflow-x-auto max-h-48 bg-[#171717] text-[11px] leading-relaxed">
                  {fileContent}
                </pre>
              )}
            </div>
          );
        }
        return part ? <span key={i}>{part}</span> : null;
      })}
    </div>
  );
}
