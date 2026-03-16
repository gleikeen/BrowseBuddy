import type { ChatMessage } from '../shared/types'
import type { AIChatPayload } from '../shared/messages'
import { AnthropicProvider, type AIProvider } from './providers/anthropic'
import { OpenAICompatibleProvider } from './providers/openai'
import { getActiveProviderConfig } from '../background/api-key-manager'
import { buildSystemPrompt } from './prompts'

const log = (...args: unknown[]) => console.log('[BrowseBuddy:ai]', ...args)

async function getProvider(): Promise<AIProvider> {
  const config = await getActiveProviderConfig()
  if (!config) {
    throw new Error('No provider configured. Please set up a provider first.')
  }
  if (!config.apiKey) {
    throw new Error(`No API key configured for ${config.name}. Please set up your API key first.`)
  }

  log('provider:', config.name, config.type, config.baseUrl, 'model:', config.model)

  if (config.type === 'anthropic') {
    return new AnthropicProvider(config.apiKey, config.baseUrl)
  }
  return new OpenAICompatibleProvider(config.apiKey, config.baseUrl, config.name)
}

export async function handleAIChat(
  payload: unknown
): Promise<{ response: string }> {
  const { messages, pageContext } = payload as AIChatPayload

  const formCount = pageContext?.forms?.length ?? 0
  const fieldCount = pageContext?.forms?.reduce((s, f) => s + (f.fields?.length ?? 0), 0) ?? 0
  log('chat request:', messages.length, 'messages,', pageContext ? `page: ${pageContext.url} (${formCount} forms, ${fieldCount} fields)` : 'no page context')

  const provider = await getProvider()
  const config = await getActiveProviderConfig()

  const systemPrompt = buildSystemPrompt(pageContext)
  log('system prompt length:', systemPrompt.length, 'chars')
  // Log a snippet of the prompt showing field selectors
  const selectorSnippet = systemPrompt.match(/selector: .+/g)?.slice(0, 3)
  if (selectorSnippet) log('selector examples:', selectorSnippet)

  const allMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ]

  log('sending to AI, model:', config?.model || 'default')

  const response = await provider.chat(allMessages, {
    model: config?.model || 'gpt-4o',
    maxTokens: 4096,
    temperature: 0.7,
    stream: false,
  })

  log('AI response length:', response.length, 'chars')
  log('AI response preview:', response.substring(0, 300))

  // Check if response contains fill_form action
  const jsonBlockMatch = response.match(/```(?:json)?[\s\S]*?```/)
  if (jsonBlockMatch) {
    log('JSON block found, length:', jsonBlockMatch[0].length)
    // Log the actual selectors in the JSON
    const selectorMatches = jsonBlockMatch[0].match(/"selector"\s*:\s*"([^"]+)"/g)
    if (selectorMatches) {
      log('AI used selectors:', selectorMatches.map((s) => s.replace(/"selector"\s*:\s*/, '')))
    }
  } else {
    log('no JSON block in response')
  }

  return { response }
}
