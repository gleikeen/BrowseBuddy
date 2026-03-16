import { useState, useEffect, useCallback } from 'react'
import type { ProviderConfig, ProviderType } from '../shared/types'

type View = 'list' | 'edit'

interface ProviderFormData {
  name: string
  type: ProviderType
  baseUrl: string
  apiKey: string
  model: string
}

const EMPTY_FORM: ProviderFormData = {
  name: '',
  type: 'openai-compatible',
  baseUrl: '',
  apiKey: '',
  model: '',
}

const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'default-openai',
    name: 'OpenAI',
    type: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o',
  },
  {
    id: 'default-anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKey: '',
    model: 'claude-sonnet-4-20250514',
  },
]

export default function App() {
  const [providers, setProviders] = useState<ProviderConfig[] | null>(null)
  const [activeId, setActiveId] = useState('')
  const [view, setView] = useState<View>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProviderFormData>(EMPTY_FORM)
  const [validating, setValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<{ valid: boolean; error?: string } | null>(null)

  // Read directly from chrome.storage.local — no messaging needed
  const loadProviders = useCallback(() => {
    chrome.storage.local.get(['providers', 'activeProviderId', 'apiKeys'], (result) => {
      let provs: ProviderConfig[] = result.providers
      let aid: string = result.activeProviderId

      // Migrate v1 format if needed
      if (!provs && result.apiKeys) {
        provs = DEFAULT_PROVIDERS.map((p) => ({ ...p }))
        const oldKeys = result.apiKeys as Record<string, string>
        if (oldKeys.openai) provs[0].apiKey = oldKeys.openai
        if (oldKeys.anthropic) provs[1].apiKey = oldKeys.anthropic
        aid = provs[0].id
        chrome.storage.local.set({ providers: provs, activeProviderId: aid })
        chrome.storage.local.remove(['apiKeys', 'activeProvider', 'activeModel'])
      }

      if (!provs || provs.length === 0) {
        provs = DEFAULT_PROVIDERS.map((p) => ({ ...p }))
        aid = provs[0].id
        chrome.storage.local.set({ providers: provs, activeProviderId: aid })
      }

      setProviders(provs)
      setActiveId(aid || provs[0]?.id || '')
    })
  }, [])

  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  // Write directly to chrome.storage.local
  const saveToStorage = (updated: ProviderConfig[], newActiveId?: string) => {
    const aid = newActiveId || activeId
    setProviders(updated)
    setActiveId(aid)
    chrome.storage.local.set({ providers: updated, activeProviderId: aid })
  }

  const handleUse = (id: string) => {
    if (providers) saveToStorage(providers, id)
  }

  const handleDelete = (id: string) => {
    if (!providers || providers.length <= 1) return
    const updated = providers.filter((p) => p.id !== id)
    const newActive = activeId === id ? updated[0].id : activeId
    saveToStorage(updated, newActive)
  }

  const handleEdit = (provider: ProviderConfig) => {
    setEditingId(provider.id)
    setForm({
      name: provider.name,
      type: provider.type,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      model: provider.model,
    })
    setValidationResult(null)
    setView('edit')
  }

  const handleAdd = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setValidationResult(null)
    setView('edit')
  }

  const handleSave = () => {
    if (!providers) return
    const baseUrl = form.baseUrl.replace(/\/+$/, '')
    if (editingId) {
      const updated = providers.map((p) =>
        p.id === editingId
          ? { ...p, name: form.name, type: form.type, baseUrl, apiKey: form.apiKey, model: form.model }
          : p
      )
      saveToStorage(updated)
    } else {
      const newProvider: ProviderConfig = {
        id: `provider_${Date.now()}`,
        name: form.name,
        type: form.type,
        baseUrl,
        apiKey: form.apiKey,
        model: form.model || (form.type === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o'),
      }
      saveToStorage([...providers, newProvider])
    }
    setView('list')
  }

  // Test connection — use fetch directly from popup (allowed by host_permissions)
  const handleValidate = async () => {
    if (!form.apiKey || !form.baseUrl) return
    setValidating(true)
    setValidationResult(null)

    const baseUrl = form.baseUrl.replace(/\/+$/, '')

    try {
      let valid = false
      if (form.type === 'anthropic') {
        const resp = await fetch(`${baseUrl}/v1/messages`, {
          method: 'POST',
          headers: {
            'x-api-key': form.apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }],
          }),
        })
        valid = resp.status !== 401
      } else {
        const resp = await fetch(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${form.apiKey}` },
        })
        valid = resp.ok
      }
      setValidationResult({ valid, error: valid ? undefined : 'Invalid API key or unreachable server' })
    } catch (err) {
      setValidationResult({ valid: false, error: 'Cannot connect to server' })
    } finally {
      setValidating(false)
    }
  }

  const openSidePanel = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.sidePanel.open({ tabId: tabs[0].id })
      }
    })
  }

  // Loading state
  if (providers === null) {
    return (
      <div className="w-96 p-4">
        <p className="text-sm text-gray-400 text-center">Loading...</p>
      </div>
    )
  }

  if (view === 'edit') {
    return (
      <div className="w-96 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setView('list')} className="text-gray-400 hover:text-gray-600 text-sm">&larr;</button>
          <h1 className="text-sm font-bold">{editingId ? 'Edit Provider' : 'Add Provider'}</h1>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600">Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. DeepSeek, Ollama"
            className="w-full px-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600">Type</label>
          <div className="flex gap-2">
            {(['openai-compatible', 'anthropic'] as ProviderType[]).map((t) => (
              <button
                key={t}
                onClick={() => setForm({ ...form, type: t })}
                className={`flex-1 px-2 py-1.5 text-xs rounded border transition-colors ${
                  form.type === t
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                {t === 'openai-compatible' ? 'OpenAI Compatible' : 'Anthropic'}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600">API Base URL</label>
          <input
            value={form.baseUrl}
            onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
            placeholder={form.type === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1'}
            className="w-full px-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600">API Key</label>
          <input
            type="password"
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            placeholder="sk-..."
            className="w-full px-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600">Model</label>
          <input
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            placeholder={form.type === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o'}
            className="w-full px-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        {/* Test Connection */}
        <button
          onClick={handleValidate}
          disabled={validating || !form.apiKey || !form.baseUrl}
          className="w-full px-3 py-1.5 text-xs text-blue-600 bg-blue-50 rounded hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {validating ? 'Testing...' : 'Test Connection'}
        </button>
        {validationResult && (
          <p className={`text-xs ${validationResult.valid ? 'text-green-600' : 'text-red-500'}`}>
            {validationResult.valid ? '✓ Connection successful' : `✗ ${validationResult.error || 'Failed'}`}
          </p>
        )}

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={!form.name || !form.baseUrl}
          className="w-full px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save
        </button>
      </div>
    )
  }

  // List view
  return (
    <div className="w-96 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-bold">BrowseBuddy</h1>
          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">v0.1.0</span>
        </div>
        <button
          onClick={handleAdd}
          className="text-xs px-2 py-1 text-blue-600 bg-blue-50 rounded hover:bg-blue-100"
        >
          + Add
        </button>
      </div>

      <div className="space-y-2">
        {providers.map((p) => (
          <div
            key={p.id}
            className={`border rounded-lg p-3 transition-colors ${
              p.id === activeId ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${p.apiKey ? 'bg-green-400' : 'bg-gray-300'}`} />
                <span className="text-sm font-medium truncate">{p.name}</span>
                {p.id === activeId && (
                  <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded flex-shrink-0">Active</span>
                )}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                {p.id !== activeId && p.apiKey && (
                  <button
                    onClick={() => handleUse(p.id)}
                    className="text-xs px-2 py-0.5 text-green-600 bg-green-50 rounded hover:bg-green-100"
                  >
                    Use
                  </button>
                )}
                <button
                  onClick={() => handleEdit(p)}
                  className="text-xs px-2 py-0.5 text-gray-500 bg-gray-50 rounded hover:bg-gray-100"
                >
                  Edit
                </button>
                {providers.length > 1 && (
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="text-xs px-2 py-0.5 text-red-500 bg-red-50 rounded hover:bg-red-100"
                  >
                    Del
                  </button>
                )}
              </div>
            </div>
            <div className="mt-1 text-xs text-gray-400 truncate">{p.baseUrl}</div>
            <div className="mt-0.5 text-xs text-gray-400">
              {p.type === 'anthropic' ? 'Anthropic' : 'OpenAI Compatible'} &middot; {p.model || 'default model'}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={openSidePanel}
        className="w-full px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100"
      >
        Open Side Panel
      </button>
    </div>
  )
}
