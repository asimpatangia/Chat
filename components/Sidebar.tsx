'use client';

import { useState } from 'react';
import { Plus, MessageSquare, Trash2, Settings, ChevronLeft, Bot } from 'lucide-react';
import { Conversation } from '@/lib/types';

interface Props {
  open: boolean;
  conversations: Conversation[];
  activeId: string | null;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onSettings: () => void;
  onToggle: () => void;
}

export default function Sidebar({ open, conversations, activeId, onNew, onSelect, onDelete, onSettings, onToggle }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (!open) return null;

  return (
    <aside className="flex flex-col w-64 min-w-[16rem] bg-[#171717] h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-[#2f2f2f]">
        <div className="flex items-center gap-2">
          <Bot className="text-[#10a37f]" size={22} />
          <span className="font-semibold text-sm text-white">AI Chat</span>
        </div>
        <button
          onClick={onToggle}
          className="p-1.5 rounded hover:bg-[#2f2f2f] text-gray-400 hover:text-white transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
      </div>

      {/* New Chat */}
      <div className="px-3 py-2">
        <button
          onClick={onNew}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-[#2f2f2f] hover:text-white transition-colors"
        >
          <Plus size={16} />
          New chat
        </button>
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {conversations.length === 0 ? (
          <p className="text-xs text-gray-500 text-center mt-8 px-4">No conversations yet. Start a new chat!</p>
        ) : (
          <div className="space-y-0.5">
            {conversations.map(conv => (
              <div
                key={conv.id}
                className={`group relative flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                  activeId === conv.id
                    ? 'bg-[#2f2f2f] text-white'
                    : 'text-gray-400 hover:bg-[#2a2a2a] hover:text-white'
                }`}
                onClick={() => onSelect(conv.id)}
                onMouseEnter={() => setHoveredId(conv.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <MessageSquare size={14} className="shrink-0 opacity-60" />
                <span className="truncate flex-1">{conv.title}</span>
                {(hoveredId === conv.id || activeId === conv.id) && (
                  <button
                    onClick={e => { e.stopPropagation(); onDelete(conv.id); }}
                    className="shrink-0 p-0.5 rounded hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Settings */}
      <div className="border-t border-[#2f2f2f] px-3 py-3">
        <button
          onClick={onSettings}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-[#2f2f2f] hover:text-white transition-colors"
        >
          <Settings size={16} />
          API Keys & Settings
        </button>
      </div>
    </aside>
  );
}
