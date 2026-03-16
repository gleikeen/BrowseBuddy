import type { ChatMessage, ChatOptions } from '../../shared/types'
import type { AIProvider } from './anthropic'

export class OpenAICompatibleProvider implements AIProvider {
  name: string
  private apiKey: string
  private baseUrl: string

  constructor(apiKey: string, baseUrl = 'https://api.openai.com/v1', name = 'openai') {
    this.apiKey = apiKey
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.name = name
  }

  private get chatUrl(): string {
    return `${this.baseUrl}/chat/completions`
  }

  async chat(messages: ChatMessage[], options: ChatOptions): Promise<string> {
    const response = await fetch(this.chatUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model || 'gpt-4o',
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 0.7,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    })

    if (!response.ok) {
      throw new Error(`${this.name} API error: ${response.status}`)
    }

    const data = await response.json()
    return data.choices[0]?.message?.content || ''
  }

  async chatStream(
    messages: ChatMessage[],
    options: ChatOptions,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const response = await fetch(this.chatUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model || 'gpt-4o',
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 0.7,
        stream: true,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    })

    if (!response.ok) {
      throw new Error(`${this.name} API error: ${response.status}`)
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
            const content = parsed.choices?.[0]?.delta?.content
            if (content) {
              fullText += content
              onChunk(content)
            }
          } catch {
            // skip
          }
        }
      }
    }

    return fullText
  }
}
