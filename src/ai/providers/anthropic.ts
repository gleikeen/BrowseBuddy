import type { ChatMessage, ChatOptions } from '../../shared/types'

export interface AIProvider {
  name: string
  chat(messages: ChatMessage[], options: ChatOptions): Promise<string>
  chatStream(messages: ChatMessage[], options: ChatOptions, onChunk: (chunk: string) => void): Promise<string>
}

export class AnthropicProvider implements AIProvider {
  name = 'anthropic'
  private apiKey: string
  private baseUrl: string

  constructor(apiKey: string, baseUrl = 'https://api.anthropic.com') {
    this.apiKey = apiKey
    this.baseUrl = baseUrl.replace(/\/+$/, '')
  }

  private get messagesUrl(): string {
    return `${this.baseUrl}/v1/messages`
  }

  async chat(messages: ChatMessage[], options: ChatOptions): Promise<string> {
    const systemMessage = messages.find((m) => m.role === 'system')
    const chatMessages = messages.filter((m) => m.role !== 'system')

    const response = await fetch(this.messagesUrl, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: options.model || 'claude-sonnet-4-20250514',
        max_tokens: options.maxTokens || 4096,
        system: systemMessage?.content,
        messages: chatMessages.map((m) => ({ role: m.role, content: m.content })),
      }),
    })

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`)
    }

    const data = await response.json()
    return data.content[0]?.text || ''
  }

  async chatStream(
    messages: ChatMessage[],
    options: ChatOptions,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const systemMessage = messages.find((m) => m.role === 'system')
    const chatMessages = messages.filter((m) => m.role !== 'system')

    const response = await fetch(this.messagesUrl, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: options.model || 'claude-sonnet-4-20250514',
        max_tokens: options.maxTokens || 4096,
        stream: true,
        system: systemMessage?.content,
        messages: chatMessages.map((m) => ({ role: m.role, content: m.content })),
      }),
    })

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let fullText = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              fullText += parsed.delta.text
              onChunk(parsed.delta.text)
            }
          } catch {
            // skip non-JSON lines
          }
        }
      }
    }

    return fullText
  }
}
