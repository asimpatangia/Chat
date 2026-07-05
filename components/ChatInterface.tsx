'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Send, Mic, MicOff, Paperclip, Settings, Menu, Bot,
  User, Copy, Check, AlertCircle, Loader2, X, FileText,
  FileSpreadsheet, Image as ImageIcon, FileImage,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage, ImagePart, Provider, MODEL_OPTIONS } from '@/lib/types';

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_CHARS = 30_000;
const MAX_PDF_IMAGE_PAGES = 5;

const TEXT_EXTENSIONS =
  /\.(txt|md|csv|json|xml|js|ts|jsx|tsx|py|rb|go|java|c|cpp|h|css|html|yaml|yml|env|sh|sql|log|toml|ini)$/i;
const EXCEL_EXTENSIONS = /\.(xlsx|xls|xlsm|xltx|ods)$/i;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];

// ── AttachedFile type ────────────────────────────────────────────────────────

type FileKind = 'text' | 'pdf-text' | 'pdf-image' | 'excel' | 'image' | 'binary';

interface AttachedFile {
  id: string; // random key
  name: string;
  size: number;
  kind: FileKind;
  textContent: string | null;
  images: ImagePart[] | null; // for image files and scanned PDFs
  publicUrl: string | null;
  error: string | null;
  processing: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function detectKind(file: File): FileKind {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) return 'pdf-text';
  if (IMAGE_TYPES.includes(file.type) || /\.(jpe?g|png|gif|webp|bmp)$/i.test(file.name)) return 'image';
  if (EXCEL_EXTENSIONS.test(file.name)) return 'excel';
  if (file.type.startsWith('text/') || TEXT_EXTENSIONS.test(file.name)) return 'text';
  return 'binary';
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsText(file);
  });
}

function truncate(text: string): string {
  return text.length > MAX_FILE_CHARS
    ? text.slice(0, MAX_FILE_CHARS) + `\n\n[… truncated at ${MAX_FILE_CHARS.toLocaleString()} characters]`
    : text;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  messages: ChatMessage[];
  conversationTitle: string;
  provider: Provider;
  model: string;
  hasApiKey: boolean;
  conversationId: string | null;
  sidebarOpen: boolean;
  onSend: (content: string, images?: ImagePart[]) => void;
  onSettings: () => void;
  onToggleSidebar: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ChatInterface({
  messages, conversationTitle, provider, model, hasApiKey,
  conversationId, sidebarOpen, onSend, onSettings, onToggleSidebar,
}: Props) {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'; }
  }, [input]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    setIsLoading(last?.role === 'assistant' && last.content === '');
  }, [messages]);

  // ── Speech ──────────────────────────────────────────────────────────────────

  function toggleListening() {
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Speech recognition not supported in this browser.'); return; }
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'en-US';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => {
      let t = '';
      for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript;
      setInput(t);
    };
    r.onend = () => setIsListening(false);
    r.onerror = () => setIsListening(false);
    recognitionRef.current = r;
    r.start();
    setIsListening(true);
  }

  // ── File processing ──────────────────────────────────────────────────────────

  function updateFile(id: string, patch: Partial<AttachedFile>) {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
  }

  async function processFile(file: File) {
    const id = Math.random().toString(36).slice(2);
    const kind = detectKind(file);

    const entry: AttachedFile = {
      id, name: file.name, size: file.size, kind,
      textContent: null, images: null, publicUrl: null,
      error: null, processing: true,
    };
    setFiles(prev => [...prev, entry]);

    // ── 1. Extract content client-side ──────────────────────────────────────
    if (kind === 'text') {
      try {
        const raw = await readFileAsText(file);
        updateFile(id, { textContent: truncate(raw), processing: false });
      } catch (e) {
        updateFile(id, { error: (e as Error).message, processing: false });
      }

    } else if (kind === 'excel') {
      try {
        const { extractExcelText } = await import('@/lib/excelExtract');
        const raw = await extractExcelText(file);
        updateFile(id, { textContent: truncate(raw), processing: false });
      } catch (e) {
        updateFile(id, { error: (e as Error).message, processing: false });
      }

    } else if (kind === 'pdf-text') {
      try {
        const { processPdf } = await import('@/lib/pdfExtract');
        const result = await processPdf(file);
        if (result.mode === 'image') {
          // Scanned PDF — pages rendered as images
          updateFile(id, {
            kind: 'pdf-image',
            images: result.images.map(p => ({ base64: p.base64, mimeType: p.mimeType })),
            textContent: null,
            processing: false,
          });
        } else {
          updateFile(id, {
            textContent: result.text ? truncate(result.text) : null,
            processing: false,
          });
        }
      } catch (e) {
        updateFile(id, { error: (e as Error).message, processing: false });
      }

    } else if (kind === 'image') {
      try {
        const { readImageAsBase64 } = await import('@/lib/imageExtract');
        const { base64, mimeType } = await readImageAsBase64(file);
        updateFile(id, { images: [{ base64, mimeType }], processing: false });
      } catch (e) {
        updateFile(id, { error: (e as Error).message, processing: false });
      }

    } else {
      // binary — just upload for storage
      updateFile(id, { processing: false });
    }

    // ── 2. Upload to Supabase for persistent storage ─────────────────────────
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (conversationId) formData.append('conversationId', conversationId);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      updateFile(id, { publicUrl: data.public_url });
    } catch (e) {
      // Don't overwrite a content-extraction error; just append
      setFiles(prev => prev.map(f => {
        if (f.id !== id) return f;
        return { ...f, error: f.error ? f.error : (e as Error).message };
      }));
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    Array.from(e.dataTransfer.files).forEach(processFile);
  }

  // ── Send ────────────────────────────────────────────────────────────────────

  function handleSubmit() {
    const text = input.trim();
    if ((!text && files.length === 0) || isLoading) return;

    let fullMessage = text;
    const allImages: ImagePart[] = [];

    files.forEach(f => {
      if (f.textContent) {
        fullMessage += `\n\n--- File: ${f.name} (${formatBytes(f.size)}) ---\n${f.textContent}\n--- End of ${f.name} ---`;
      }
      if (f.images && f.images.length > 0) {
        allImages.push(...f.images);
        if (!f.textContent) {
          const label = f.kind === 'pdf-image'
            ? `[PDF: ${f.name} — rendered as ${f.images.length} page image(s) for visual analysis]`
            : `[Image: ${f.name}]`;
          fullMessage += `\n\n${label}`;
        }
      }
      if (!f.textContent && (!f.images || f.images.length === 0) && f.publicUrl) {
        fullMessage += `\n\n[Attached file: ${f.name} — ${f.publicUrl}]`;
      }
    });

    setInput('');
    setFiles([]);
    onSend(fullMessage.trim(), allImages.length > 0 ? allImages : undefined);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  }

  async function copyMessage(content: string, idx: number) {
    await navigator.clipboard.writeText(content);
    setCopiedId(idx);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const anyProcessing = files.some(f => f.processing);
  const canSend = (input.trim() || files.length > 0) && !isLoading && !anyProcessing && hasApiKey;

  // ── File badge ───────────────────────────────────────────────────────────────

  function FileBadge({ f }: { f: AttachedFile }) {
    const hasError = !!f.error && !f.textContent && !f.images?.length;
    const Icon = f.kind === 'image' ? ImageIcon
      : f.kind === 'pdf-image' ? FileImage
      : f.kind === 'excel' ? FileSpreadsheet
      : FileText;

    const statusLabel = f.processing ? 'processing…'
      : f.kind === 'image' || f.kind === 'pdf-image' ? `${f.images?.length ?? 0} image(s) ready`
      : f.textContent ? 'text extracted'
      : hasError ? 'error'
      : 'uploaded';

    return (
      <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs border max-w-[220px] ${
        hasError
          ? 'bg-red-950/40 border-red-800/40 text-red-300'
          : 'bg-[#2f2f2f] border-[#3f3f3f] text-gray-300'
      }`}>
        {f.processing
          ? <Loader2 size={11} className="animate-spin shrink-0 text-gray-400" />
          : <Icon size={11} className={`shrink-0 ${
              f.kind === 'pdf-image' ? 'text-orange-400'
              : f.kind === 'image' ? 'text-blue-400'
              : f.kind === 'excel' ? 'text-green-400'
              : f.kind === 'pdf-text' ? 'text-red-400'
              : 'text-gray-400'
            }`} />
        }
        <span className="truncate flex-1">{f.name}</span>
        <span className="shrink-0 text-gray-600 text-[10px]">{statusLabel}</span>
        <button
          onClick={() => setFiles(prev => prev.filter(x => x.id !== f.id))}
          className="shrink-0 text-gray-500 hover:text-gray-200 ml-0.5"
        >
          <X size={11} />
        </button>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col flex-1 h-screen min-w-0"
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2f2f2f] shrink-0">
        {!sidebarOpen && (
          <button onClick={onToggleSidebar} className="p-1.5 rounded hover:bg-[#2f2f2f] text-gray-400 hover:text-white transition-colors">
            <Menu size={18} />
          </button>
        )}
        <span className="text-sm font-medium text-gray-300 truncate flex-1">{conversationTitle}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 hidden sm:block">{MODEL_OPTIONS[provider].label} · {model}</span>
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
                {hasApiKey ? `${MODEL_OPTIONS[provider].label} · ${model}` : 'Add an API key in Settings to start chatting'}
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
                  {/* Show attached images above the bubble */}
                  {msg.images && msg.images.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2 justify-end">
                      {msg.images.map((img, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={`data:${img.mimeType};base64,${img.base64}`}
                          alt={`attachment ${i + 1}`}
                          className="max-h-48 max-w-xs rounded-lg border border-[#3f3f3f] object-contain"
                        />
                      ))}
                    </div>
                  )}
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

      {/* Input area */}
      <div className="shrink-0 px-4 pb-4 pt-2 max-w-3xl mx-auto w-full">
        {!hasApiKey && (
          <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2 mb-2">
            <AlertCircle size={13} />
            No {MODEL_OPTIONS[provider].label} API key.{' '}
            <button onClick={onSettings} className="underline">Add one in Settings</button>
          </div>
        )}

        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {files.map(f => <FileBadge key={f.id} f={f} />)}
          </div>
        )}

        {dragOver && (
          <div className="flex items-center justify-center gap-2 border-2 border-dashed border-[#10a37f] rounded-xl py-4 mb-2 text-sm text-[#10a37f]">
            <Paperclip size={16} /> Drop to attach
          </div>
        )}

        <div className={`flex items-end gap-2 bg-[#2f2f2f] rounded-2xl border transition-colors px-4 py-3 ${
          dragOver ? 'border-[#10a37f]' : 'border-[#3f3f3f] focus-within:border-[#555]'
        }`}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.xlsx,.xls,.xlsm,.csv,.txt,.md,.json,.xml,.js,.ts,.py,.html,.css,.sql,.log"
            className="hidden"
            onChange={e => { Array.from(e.target.files ?? []).forEach(processFile); e.target.value = ''; }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 p-1 text-gray-500 hover:text-gray-300 transition-colors"
            title="Attach file (images, PDF, Excel, text)"
          >
            <Paperclip size={18} />
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={files.length > 0 ? 'Ask something about the file(s)…' : 'Message AI Chat…'}
            rows={1}
            className="flex-1 bg-transparent text-white text-sm placeholder-gray-600 resize-none outline-none max-h-[200px] leading-relaxed py-0.5"
          />

          <button
            onClick={toggleListening}
            className={`shrink-0 p-1 transition-colors ${isListening ? 'text-red-400 animate-pulse' : 'text-gray-500 hover:text-gray-300'}`}
            title={isListening ? 'Stop listening' : 'Voice input'}
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          <button
            onClick={handleSubmit}
            disabled={!canSend}
            className="shrink-0 p-1.5 rounded-lg bg-[#10a37f] hover:bg-[#0d8a6a] text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send size={15} />
          </button>
        </div>

        <p className="text-center text-xs text-gray-600 mt-2">
          Shift+Enter for new line · Supports images, PDF, Excel, text files · Drag & drop
        </p>
      </div>
    </div>
  );
}

// ── UserMessage — collapses embedded file blocks ──────────────────────────────

function UserMessage({ content }: { content: string }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const parts = content.split(/(---\s*File:.*?---\s*End of.*?---)/s);

  return (
    <div className="whitespace-pre-wrap space-y-1.5 text-sm">
      {parts.map((part, i) => {
        const m = part.match(/---\s*File:\s*(.+?)\s*\(.*?\)\s*---\n([\s\S]*?)\n---\s*End of/);
        if (m) {
          const key = String(i);
          return (
            <div key={key} className="border border-[#3f3f3f] rounded-lg overflow-hidden text-xs">
              <button
                onClick={() => setExpanded(p => ({ ...p, [key]: !p[key] }))}
                className="flex items-center gap-2 w-full px-3 py-2 bg-[#1e1e1e] text-gray-400 hover:text-gray-200 text-left"
              >
                <FileText size={11} />
                <span className="font-medium truncate">{m[1]}</span>
                <span className="ml-auto text-gray-600 shrink-0">{expanded[key] ? '▲ hide' : '▼ show'}</span>
              </button>
              {expanded[key] && (
                <pre className="px-3 py-2 text-gray-400 overflow-x-auto max-h-48 bg-[#171717] text-[11px] leading-relaxed">
                  {m[2]}
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
