'use client';

import { useState } from 'react';
import { X, Eye, EyeOff, Key, CheckCircle, Trash2 } from 'lucide-react';
import { ApiKeys, Provider, MODEL_OPTIONS } from '@/lib/types';

interface Props {
  apiKeys: ApiKeys;
  provider: Provider;
  model: string;
  settingsSaved: boolean;
  onSave: (keys: ApiKeys, provider: Provider, model: string) => void;
  onForget: () => void;
  onClose: () => void;
}

export default function SettingsModal({ apiKeys, provider, model, settingsSaved, onSave, onForget, onClose }: Props) {
  const [keys, setKeys] = useState<ApiKeys>({ ...apiKeys });
  const [selectedProvider, setSelectedProvider] = useState<Provider>(provider);
  const [selectedModel, setSelectedModel] = useState(model);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [confirmForget, setConfirmForget] = useState(false);

  function toggleShow(key: string) {
    setShowKeys(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function handleProviderChange(p: Provider) {
    setSelectedProvider(p);
    setSelectedModel(MODEL_OPTIONS[p].models[0]);
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#1e1e1e] border border-[#3f3f3f] rounded-xl w-full max-w-md shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#3f3f3f]">
          <div className="flex items-center gap-2">
            <Key size={18} className="text-[#10a37f]" />
            <h2 className="font-semibold text-white">API Keys & Settings</h2>
          </div>
          <div className="flex items-center gap-2">
            {settingsSaved && (
              <span className="flex items-center gap-1 text-xs text-[#10a37f]">
                <CheckCircle size={13} />
                Remembered
              </span>
            )}
            <button onClick={onClose} className="p-1 rounded hover:bg-[#2f2f2f] text-gray-400 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Provider selector */}
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Active Provider</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(MODEL_OPTIONS) as Provider[]).map(p => (
                <button
                  key={p}
                  onClick={() => handleProviderChange(p)}
                  className={`py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                    selectedProvider === p
                      ? 'bg-[#10a37f] border-[#10a37f] text-white'
                      : 'border-[#3f3f3f] text-gray-400 hover:border-gray-500 hover:text-white'
                  }`}
                >
                  {MODEL_OPTIONS[p].label}
                </button>
              ))}
            </div>
          </div>

          {/* Model */}
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Model</label>
            <select
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value)}
              className="w-full bg-[#2f2f2f] border border-[#3f3f3f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#10a37f] transition-colors"
            >
              {MODEL_OPTIONS[selectedProvider].models.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* API Keys */}
          <div className="space-y-3">
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider">API Keys</label>
            {(Object.keys(MODEL_OPTIONS) as Provider[]).map(p => (
              <div key={p}>
                <label className="block text-xs text-gray-500 mb-1">{MODEL_OPTIONS[p].label}</label>
                <div className="relative">
                  <input
                    type={showKeys[p] ? 'text' : 'password'}
                    placeholder={`Enter ${MODEL_OPTIONS[p].label} API key…`}
                    value={keys[p]}
                    onChange={e => setKeys(prev => ({ ...prev, [p]: e.target.value }))}
                    className="w-full bg-[#2f2f2f] border border-[#3f3f3f] rounded-lg px-3 py-2 pr-10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#10a37f] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShow(p)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showKeys[p] ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            ))}

            <p className="text-xs text-gray-600 flex items-center gap-1">
              <CheckCircle size={11} className="text-[#10a37f]" />
              Keys are saved to your browser and our database — they persist across sessions automatically.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-[#3f3f3f] text-sm text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(keys, selectedProvider, selectedModel)}
              className="flex-1 py-2 rounded-lg bg-[#10a37f] hover:bg-[#0d8a6a] text-white text-sm font-medium transition-colors"
            >
              Save & Remember
            </button>
          </div>

          {/* Forget / delete saved keys */}
          {settingsSaved && !confirmForget && (
            <button
              onClick={() => setConfirmForget(true)}
              className="flex items-center justify-center gap-1.5 w-full py-1.5 text-xs text-gray-600 hover:text-red-400 transition-colors"
            >
              <Trash2 size={12} />
              Forget saved keys
            </button>
          )}
          {confirmForget && (
            <div className="flex items-center gap-2 bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2">
              <span className="text-xs text-red-300 flex-1">Delete all saved keys?</span>
              <button
                onClick={() => setConfirmForget(false)}
                className="text-xs text-gray-400 hover:text-white px-2"
              >
                Cancel
              </button>
              <button
                onClick={onForget}
                className="text-xs text-red-400 hover:text-red-300 font-medium px-2"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
