import { useState, useRef, useEffect, useCallback } from 'react'
import type { ChatMessage, Workflow, PageContext } from '../shared/types'
import type { ExtensionMessage, AIChatPayload } from '../shared/messages'

type TabView = 'chat' | 'workflows'

interface DisplayMessage {
  role: 'user' | 'assistant'
  content: string
}

interface FillAction {
  fields: Array<{ selector: string; value: string }>
}

function parseFillActions(response: string): FillAction[] {
  // Match ```json ... ``` blocks (tolerant of whitespace variations)
  const jsonBlocks = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/g)
  if (!jsonBlocks) return []

  const actions: FillAction[] = []
  for (const block of jsonBlocks) {
    const inner = block.replace(/```(?:json)?\s*\n?/, '').replace(/\n?\s*```$/, '').trim()
    try {
      const parsed = JSON.parse(inner)
      // Support { action: "fill_form", fields: [...] }
      if (parsed.action === 'fill_form' && Array.isArray(parsed.fields)) {
        actions.push({ fields: parsed.fields })
      }
      // Support { fields: [...] } directly
      else if (Array.isArray(parsed.fields)) {
        actions.push({ fields: parsed.fields })
      }
      // Support bare array [{ selector, value }]
      else if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].selector) {
        actions.push({ fields: parsed })
      }
    } catch {
      // not valid JSON
    }
  }
  return actions
}

interface TabInfo {
  id: number
  title: string
  url: string
  favIconUrl?: string
}

async function getAllTabs(): Promise<TabInfo[]> {
  const tabs = await chrome.tabs.query({ currentWindow: true })
  return tabs
    .filter((t) => t.id && t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'))
    .map((t) => ({ id: t.id!, title: t.title || t.url || '', url: t.url || '', favIconUrl: t.favIconUrl }))
}

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_PAGE_CONTEXT', payload: {} })
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/index.js'],
    })
    await new Promise((r) => setTimeout(r, 300))
  }
}

async function getPageContext(tabId: number): Promise<PageContext | null> {
  try {
    await ensureContentScript(tabId)
    const result = await chrome.tabs.sendMessage(tabId, {
      type: 'EXTRACT_PAGE_CONTEXT',
      payload: {},
    })
    return result?.context ?? null
  } catch {
    return null
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabView>('chat')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [composing, setComposing] = useState(false)

  // Per-tab conversation history: tabId -> messages
  const chatHistoryRef = useRef<Map<number, DisplayMessage[]>>(new Map())
  const [messages, setMessages] = useState<DisplayMessage[]>([])

  // Page connection state
  const [connectedTabId, setConnectedTabId] = useState<number | null>(null)
  const [connectedTabTitle, setConnectedTabTitle] = useState('')
  const [pageConnected, setPageConnected] = useState<boolean | null>(null)
  const [showTabPicker, setShowTabPicker] = useState(false)
  const [availableTabs, setAvailableTabs] = useState<TabInfo[]>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    // Keep history map in sync
    if (connectedTabId && messages.length > 0) {
      chatHistoryRef.current.set(connectedTabId, messages)
    }
  }, [messages, connectedTabId])

  const connectToTab = useCallback(async (tabId: number) => {
    // Save current tab's messages before switching
    if (connectedTabId && connectedTabId !== tabId) {
      chatHistoryRef.current.set(connectedTabId, messages)
    }

    const ctx = await getPageContext(tabId)
    if (ctx) {
      setConnectedTabId(tabId)
      setConnectedTabTitle(ctx.title || ctx.url)
      setPageConnected(true)
      // Restore saved history for this tab, or start fresh
      setMessages(chatHistoryRef.current.get(tabId) || [])
    } else {
      setConnectedTabId(null)
      setConnectedTabTitle('')
      setPageConnected(false)
    }
    setShowTabPicker(false)
  }, [connectedTabId, messages])

  // Auto-connect to active tab on mount
  useEffect(() => {
    const init = async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.id && tab.url && !tab.url.startsWith('chrome://')) {
        await connectToTab(tab.id)
      } else {
        setPageConnected(false)
      }
    }
    init()
  }, [connectToTab])

  const handleRefresh = async () => {
    if (connectedTabId) {
      // Refresh without switching — just re-check connection, keep messages
      const ctx = await getPageContext(connectedTabId)
      setPageConnected(ctx !== null)
      if (ctx) setConnectedTabTitle(ctx.title || ctx.url)
    } else {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.id) await connectToTab(tab.id)
    }
  }

  const handleOpenTabPicker = async () => {
    const tabs = await getAllTabs()
    setAvailableTabs(tabs)
    setShowTabPicker(!showTabPicker)
  }

  const handleClear = () => {
    setMessages([])
    if (connectedTabId) {
      chatHistoryRef.current.delete(connectedTabId)
    }
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return

    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setLoading(true)

    try {
      let pageContext: PageContext | null = null
      if (connectedTabId) {
        pageContext = await getPageContext(connectedTabId)
        setPageConnected(pageContext !== null)
      }

      const chatMessages: ChatMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }))
      chatMessages.push({ role: 'user', content: text })

      if (chatMessages.length > 10) {
        chatMessages.splice(0, chatMessages.length - 10)
      }

      const message: ExtensionMessage<AIChatPayload> = {
        type: 'AI_CHAT',
        payload: { messages: chatMessages, pageContext: pageContext ?? undefined },
      }

      const result = await chrome.runtime.sendMessage(message) as { response?: string; error?: string }

      if (result?.error) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant' as const, content: `Error: ${result.error}` },
        ])
      } else if (result?.response) {
        // Try to extract and execute fill actions from AI response
        let fillStatus = ''
        if (connectedTabId) {
          const fillActions = parseFillActions(result.response)
          console.log('[BrowseBuddy:panel] parsed fill actions:', fillActions.length, fillActions.length > 0 ? JSON.stringify(fillActions[0].fields.map((f) => f.selector)) : '')
          if (fillActions.length > 0) {
            try {
              await ensureContentScript(connectedTabId)
              const results = []
              for (const action of fillActions) {
                console.log('[BrowseBuddy:panel] sending FILL_FORM to tab', connectedTabId, ':', action.fields.length, 'fields')
                const fillResult = await chrome.tabs.sendMessage(connectedTabId, {
                  type: 'FILL_FORM',
                  payload: action,
                }) as { filled?: number; failed?: string[] } | undefined
                console.log('[BrowseBuddy:panel] fill result:', fillResult)
                if (fillResult) results.push(fillResult)
              }
              const totalFilled = results.reduce((s, r) => s + (r.filled || 0), 0)
              const totalFailed = results.flatMap((r) => r.failed || [])
              if (totalFilled > 0 || totalFailed.length > 0) {
                fillStatus = `\n\n---\n_Filled ${totalFilled} field(s)${totalFailed.length > 0 ? `, ${totalFailed.length} failed: ${totalFailed.join(', ')}` : ''}_`
              }
            } catch (err) {
              console.error('[BrowseBuddy:panel] fill error:', err)
              fillStatus = `\n\n---\n_Fill failed: ${String(err)}_`
            }
          }
        } else {
          console.log('[BrowseBuddy:panel] no connectedTabId, skipping fill')
        }

        setMessages((prev) => [
          ...prev,
          { role: 'assistant' as const, content: (result.response as string) + fillStatus },
        ])
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${String(err)}` },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !composing) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <div className="border-b px-4 py-2">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-sm font-bold">BrowseBuddy</h1>
        </div>

        {/* Page connection bar */}
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
            pageConnected === null ? 'bg-gray-300' :
            pageConnected ? 'bg-green-400' : 'bg-red-400'
          }`} />
          <span className="text-xs text-gray-600 truncate flex-1 min-w-0">
            {pageConnected === null ? 'Connecting...' :
             pageConnected ? connectedTabTitle : 'No page connected'}
          </span>
          <button
            onClick={handleRefresh}
            title="Refresh connection"
            className="text-gray-400 hover:text-gray-600 p-0.5 rounded hover:bg-gray-100 flex-shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
          </button>
          <button
            onClick={handleOpenTabPicker}
            title="Switch page"
            className={`text-gray-400 hover:text-gray-600 p-0.5 rounded hover:bg-gray-100 flex-shrink-0 ${showTabPicker ? 'bg-gray-100 text-gray-600' : ''}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
            </svg>
          </button>
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              title="Clear conversation"
              className="text-gray-400 hover:text-red-500 p-0.5 rounded hover:bg-red-50 flex-shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              </svg>
            </button>
          )}
        </div>

        {/* Tab picker dropdown */}
        {showTabPicker && (
          <div className="mt-2 border rounded-lg max-h-48 overflow-y-auto bg-white shadow-sm">
            {availableTabs.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400">No available pages</div>
            ) : (
              availableTabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => connectToTab(t.id)}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 flex items-center gap-2 border-b last:border-b-0 ${
                    t.id === connectedTabId ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                  }`}
                >
                  {t.favIconUrl && (
                    <img src={t.favIconUrl} width="12" height="12" className="flex-shrink-0" />
                  )}
                  <span className="truncate">{t.title}</span>
                </button>
              ))
            )}
          </div>
        )}

        {/* Tab switcher */}
        <div className="flex gap-1 mt-2">
          {(['chat', 'workflows'] as TabView[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                activeTab === tab
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'chat' ? 'Chat' : 'Workflows'}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'chat' ? (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-gray-400 text-sm mt-8">
                <p>Ask me anything about this page.</p>
                <p className="mt-1 text-xs">Try: "Fill this form with test data"</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 px-3 py-2 rounded-lg text-sm text-gray-400">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t p-3">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onCompositionStart={() => setComposing(true)}
                onCompositionEnd={() => setComposing(false)}
                placeholder="Type a message..."
                rows={1}
                className="flex-1 px-3 py-2 text-sm border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 p-4">
          <WorkflowsPanel connectedTabId={connectedTabId} />
        </div>
      )}
    </div>
  )
}

function WorkflowsPanel({ connectedTabId }: { connectedTabId: number | null }) {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [recording, setRecording] = useState(false)
  const [replayingId, setReplayingId] = useState<string | null>(null)

  useEffect(() => {
    chrome.storage.local.get('workflows', (result) => {
      setWorkflows(result.workflows || [])
    })
  }, [])

  const saveWorkflows = (updated: Workflow[]) => {
    setWorkflows(updated)
    chrome.storage.local.set({ workflows: updated })
  }

  const startRecording = async () => {
    if (!connectedTabId) return
    try {
      await ensureContentScript(connectedTabId)
      await chrome.tabs.sendMessage(connectedTabId, { type: 'START_RECORDING', payload: {} })
      setRecording(true)
    } catch { /* ignore */ }
  }

  const stopRecording = async () => {
    if (!connectedTabId) return
    try {
      const result = await chrome.tabs.sendMessage(connectedTabId, { type: 'STOP_RECORDING', payload: {} }) as { actions?: unknown[] }
      setRecording(false)
      if (result?.actions && result.actions.length > 0) {
        const name = prompt('Name this workflow:') || `Workflow ${workflows.length + 1}`
        const workflow: Workflow = {
          id: Date.now().toString(),
          name,
          actions: result.actions as Workflow['actions'],
          variables: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        saveWorkflows([...workflows, workflow])
      }
    } catch { /* ignore */ }
  }

  const replayWorkflow = async (workflow: Workflow) => {
    if (!connectedTabId) return
    setReplayingId(workflow.id)
    try {
      await ensureContentScript(connectedTabId)
      await chrome.tabs.sendMessage(connectedTabId, {
        type: 'REPLAY_WORKFLOW',
        payload: workflow,
      })
    } catch { /* ignore */ } finally {
      setReplayingId(null)
    }
  }

  const deleteWorkflow = (id: string) => {
    saveWorkflows(workflows.filter((w) => w.id !== id))
  }

  const exportWorkflow = (workflow: Workflow) => {
    const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${workflow.name.replace(/\s+/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-3">
      <button
        onClick={recording ? stopRecording : startRecording}
        disabled={!connectedTabId}
        className={`w-full px-3 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
          recording
            ? 'bg-red-600 text-white hover:bg-red-700'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {recording ? 'Stop Recording' : 'Start Recording'}
      </button>

      {workflows.length === 0 ? (
        <div className="text-center text-gray-400 text-sm mt-6">
          <p>No workflows recorded yet.</p>
          <p className="mt-1 text-xs">Click "Start Recording" to begin.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {workflows.map((w) => (
            <div key={w.id} className="border rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium truncate">{w.name}</span>
                <span className="text-xs text-gray-400">{w.actions.length} steps</span>
              </div>
              <div className="flex gap-1 mt-2">
                <button
                  onClick={() => replayWorkflow(w)}
                  disabled={replayingId !== null || !connectedTabId}
                  className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100 disabled:opacity-50"
                >
                  {replayingId === w.id ? 'Running...' : 'Replay'}
                </button>
                <button
                  onClick={() => exportWorkflow(w)}
                  className="px-2 py-1 text-xs bg-gray-50 text-gray-600 rounded hover:bg-gray-100"
                >
                  Export
                </button>
                <button
                  onClick={() => deleteWorkflow(w.id)}
                  className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
