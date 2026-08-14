/**
 * LLM 工厂 — DeepSeek / Gemini 统一接口
 *
 * 主线程（agent-app.js）与 Web Worker（agent-worker.js）共用同一份实现，
 * 消除两处重复的 chat / chatStream 代码。
 *
 * 每个 LLM 实例暴露统一契约：
 *   name       引擎名
 *   cost       { input, output } 元/百万 token
 *   lastUsage  最近一次调用的 token 用量
 *   chat(messages, opts)                 非流式，返回字符串
 *   chatStream(messages, opts, onChunk)  流式，返回完整字符串
 *
 * opts 支持 { temperature, signal, maxTokens }。
 */

// 成本常量（元 / 百万 token）
export const COST = {
  deepseek: { input: 1,   output: 2   },
  gemini:   { input: 0.5, output: 1.5 }
};

/** 解析 DeepSeek 的 SSE 流，onChunk(delta, fullText) 逐块回调 */
async function consumeDeepSeekStream(resp, llm, onChunk) {
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // 不完整的行留到下次拼接

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content || '';
        if (delta) {
          fullText += delta;
          onChunk?.(delta, fullText);
        }
        if (json.usage) {
          llm.lastUsage = {
            prompt_tokens: json.usage.prompt_tokens,
            completion_tokens: json.usage.completion_tokens,
            total_tokens: json.usage.total_tokens
          };
        }
      } catch (e) { /* 跳过解析失败的行 */ }
    }
  }
  return fullText;
}

/** 解析 Gemini 的 SSE 流 */
async function consumeGeminiStream(resp, llm, onChunk) {
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      try {
        const json = JSON.parse(data);
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) {
          fullText += text;
          onChunk?.(text, fullText);
        }
        if (json.usageMetadata) {
          llm.lastUsage = {
            prompt_tokens: json.usageMetadata.promptTokenCount,
            completion_tokens: json.usageMetadata.candidatesTokenCount,
            total_tokens: json.usageMetadata.totalTokenCount
          };
        }
      } catch (e) { /* 跳过 */ }
    }
  }
  return fullText;
}

/** DeepSeek（OpenAI 兼容）引擎 */
export function createDeepSeekLLM(apiKey) {
  const llm = {
    name: 'DeepSeek',
    cost: COST.deepseek,
    lastUsage: null,

    async chat(messages, opts = {}) {
      const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages,
          temperature: opts.temperature ?? 0.7,
          max_tokens: opts.maxTokens ?? 2048
        }),
        signal: opts.signal || undefined
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `API 请求失败 (${resp.status})`);
      }
      const data = await resp.json();
      const u = data.usage;
      llm.lastUsage = u
        ? { prompt_tokens: u.prompt_tokens, completion_tokens: u.completion_tokens, total_tokens: u.total_tokens }
        : null;
      return data.choices?.[0]?.message?.content || '';
    },

    async chatStream(messages, opts = {}, onChunk) {
      const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages,
          temperature: opts.temperature ?? 0.7,
          max_tokens: opts.maxTokens ?? 2048,
          stream: true
        }),
        signal: opts.signal || undefined
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `API 请求失败 (${resp.status})`);
      }
      return await consumeDeepSeekStream(resp, llm, onChunk);
    }
  };
  return llm;
}

/** Gemini 引擎（含真流式 SSE） */
export function createGeminiLLM(apiKey) {
  const llm = {
    name: 'Gemini',
    cost: COST.gemini,
    lastUsage: null,

    _buildPrompt(messages) {
      return messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n');
    },

    async chat(messages, opts = {}) {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: this._buildPrompt(messages) }] }],
            generationConfig: { temperature: opts.temperature ?? 0.7, maxOutputTokens: opts.maxTokens ?? 2048 }
          }),
          signal: opts.signal || undefined
        }
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `API 请求失败 (${resp.status})`);
      }
      const data = await resp.json();
      const u = data.usageMetadata;
      llm.lastUsage = u
        ? { prompt_tokens: u.promptTokenCount, completion_tokens: u.candidatesTokenCount, total_tokens: u.totalTokenCount }
        : null;
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    },

    async chatStream(messages, opts = {}, onChunk) {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: this._buildPrompt(messages) }] }],
            generationConfig: { temperature: opts.temperature ?? 0.7, maxOutputTokens: opts.maxTokens ?? 2048 }
          }),
          signal: opts.signal || undefined
        }
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `API 请求失败 (${resp.status})`);
      }
      return await consumeGeminiStream(resp, llm, onChunk);
    }
  };
  return llm;
}

/** 按 provider 名称创建 LLM，默认 DeepSeek */
export function createLLM(provider, apiKey) {
  if (provider === 'gemini') return createGeminiLLM(apiKey);
  return createDeepSeekLLM(apiKey);
}
