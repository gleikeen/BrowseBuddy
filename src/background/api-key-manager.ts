import type { ProviderConfig, StorageDataV1 } from '../shared/types'

let _nextId = 1
function genId(): string {
  return `provider_${Date.now()}_${_nextId++}`
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

// ===== Migration from v1 =====

async function migrateV1IfNeeded(): Promise<void> {
  const result = await chrome.storage.local.get(['apiKeys', 'providers'])
  if (result.providers) return // already migrated
  if (!result.apiKeys) return // no old data

  const oldKeys = result.apiKeys as StorageDataV1['apiKeys']
  const providers = DEFAULT_PROVIDERS.map((p) => ({ ...p }))

  if (oldKeys.openai) {
    providers[0].apiKey = oldKeys.openai
  }
  if (oldKeys.anthropic) {
    providers[1].apiKey = oldKeys.anthropic
  }

  await chrome.storage.local.set({
    providers,
    activeProviderId: providers[0].id,
  })
  await chrome.storage.local.remove(['apiKeys', 'activeProvider', 'activeModel'])
}

// ===== CRUD =====

export async function getProviders(): Promise<ProviderConfig[]> {
  await migrateV1IfNeeded()
  const result = await chrome.storage.local.get('providers')
  if (!result.providers || result.providers.length === 0) {
    // Initialize defaults
    const providers = DEFAULT_PROVIDERS.map((p) => ({ ...p }))
    await chrome.storage.local.set({ providers, activeProviderId: providers[0].id })
    return providers
  }
  return result.providers
}

export async function saveProviders(providers: ProviderConfig[]): Promise<void> {
  await chrome.storage.local.set({ providers })
}

export async function addProvider(config: Omit<ProviderConfig, 'id'>): Promise<ProviderConfig> {
  const providers = await getProviders()
  const provider: ProviderConfig = { ...config, id: genId() }
  providers.push(provider)
  await saveProviders(providers)
  return provider
}

export async function updateProvider(id: string, updates: Partial<ProviderConfig>): Promise<void> {
  const providers = await getProviders()
  const idx = providers.findIndex((p) => p.id === id)
  if (idx === -1) throw new Error(`Provider not found: ${id}`)
  providers[idx] = { ...providers[idx], ...updates, id } // preserve id
  await saveProviders(providers)
}

export async function removeProvider(id: string): Promise<void> {
  const providers = await getProviders()
  if (providers.length <= 1) throw new Error('Cannot remove last provider')
  const filtered = providers.filter((p) => p.id !== id)
  await saveProviders(filtered)

  // If removed the active one, switch to first
  const activeId = await getActiveProviderId()
  if (activeId === id) {
    await setActiveProviderId(filtered[0].id)
  }
}

// ===== Active Provider =====

export async function getActiveProviderId(): Promise<string> {
  const result = await chrome.storage.local.get('activeProviderId')
  if (result.activeProviderId) return result.activeProviderId
  const providers = await getProviders()
  return providers[0]?.id || ''
}

export async function setActiveProviderId(id: string): Promise<void> {
  await chrome.storage.local.set({ activeProviderId: id })
}

export async function getActiveProviderConfig(): Promise<ProviderConfig | null> {
  const providers = await getProviders()
  const activeId = await getActiveProviderId()
  return providers.find((p) => p.id === activeId) || providers[0] || null
}

// ===== Validation =====

async function validateOpenAICompatibleKey(baseUrl: string, apiKey: string): Promise<boolean> {
  const url = `${baseUrl.replace(/\/+$/, '')}/models`
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  return response.ok
}

async function validateAnthropicKey(baseUrl: string, apiKey: string): Promise<boolean> {
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/messages`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
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
  return response.status !== 401
}

export interface ValidateProviderPayload {
  providerId?: string
  type: 'openai-compatible' | 'anthropic'
  baseUrl: string
  apiKey: string
}

export interface ValidateProviderResult {
  valid: boolean
  error?: string
}

export async function handleValidateProvider(
  payload: unknown
): Promise<ValidateProviderResult> {
  const { type, baseUrl, apiKey, providerId } = payload as ValidateProviderPayload
  if (!baseUrl || !apiKey) {
    return { valid: false, error: 'Base URL and API Key are required' }
  }
  try {
    const valid =
      type === 'anthropic'
        ? await validateAnthropicKey(baseUrl, apiKey)
        : await validateOpenAICompatibleKey(baseUrl, apiKey)

    if (valid && providerId) {
      await updateProvider(providerId, { apiKey })
    }

    return { valid, error: valid ? undefined : 'Invalid API key or unreachable server' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { valid: false, error: message.includes('fetch') ? 'Cannot connect to server' : message }
  }
}
