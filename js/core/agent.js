/**
 * ReAct Agent 核心循环
 *
 * 面试核心：不依赖 LangChain，手写 Agent Loop
 *
 * 模式：Thought → Action → Observation → Thought → ...
 *   Thought:    LLM 分析当前状态，决定下一步做什么
 *   Action:     调用工具（web_search / calculate_package 等）
 *   Observation: 工具返回结果
 *   循环直到 LLM 输出 FINISH 或达到 maxSteps
 *
 * 为什么用 ReAct 而不是 Plan-Execute？
 *   → 秋招信息搜索具有不确定性（搜索结果未知），
 *     需要边看边调整，ReAct 比一次性计划更灵活。
 */

class ReActAgent {
  /**
   * @param {Object} config
   * @param {string} config.name        - Agent 名称
   * @param {string} config.role        - Agent 角色描述
   * @param {string} config.goal        - Agent 目标
   * @param {ToolRegistry} config.tools - 工具注册表
   * @param {Object} config.llm         - LLM 调用接口
   * @param {number} config.maxSteps    - 最大步数（默认 8）
   * @param {number} config.temperature - LLM 温度
   */
  constructor({ name, role, goal, tools, llm, memory = null, maxSteps = 8, temperature = 0.7 }) {
    this.name = name;
    this.role = role;
    this.goal = goal;
    this.tools = tools;
    this.llm = llm;
    this.memory = memory;      // MemorySystem（可选），启用 Working Memory 自动压缩
    this.maxSteps = maxSteps;
    this.temperature = temperature;
    this.trace = [];           // 完整的思考-行动-观察链路
    this._aborted = false;
  }

  /** 构建 System Prompt */
  buildSystemPrompt(customContext = '') {
    const toolList = this.tools.list()
      .map(t => `- ${t.name}: ${t.description}`)
      .join('\n');

    return `你是一个 ${this.role}。
目标：${this.goal}

你可以使用以下工具来完成任务：
${toolList}

## 输出格式要求
你必须严格按照以下 JSON 格式回复（不要输出其他内容）：

如果需要进行操作：
{"action": "工具名称", "input": {"参数": "值"}, "reasoning": "为什么需要这一步"}

如果任务已完成，需要输出最终答案：
{"action": "FINISH", "answer": "完整的分析结果（使用 Markdown 格式，详细且结构化）", "reasoning": "任务完成总结"}

## 工作原则
1. 每次只调用一个工具
2. 观察工具返回结果后再决定下一步
3. 如果工具返回错误，尝试其他方式或工具
4. 信息充足后立即输出 FINISH，不要过度搜集
5. 所有信息必须基于工具返回的真实数据，不要编造
${customContext}`;
  }

  /**
   * 执行 Agent 任务
   * @param {string} task 用户任务描述
   * @param {Object} callbacks
   * @param {Function} callbacks.onStep       - 每步推理回调
   * @param {Function} callbacks.onToolCall   - 工具调用回调
   * @param {Function} callbacks.onComplete   - 完成回调
   * @param {Function} callbacks.onError      - 错误回调
   */
  async run(task, { onStep, onToolCall, onComplete, onError, onStream, onStreamEnd, onTokenUsage } = {}) {
    this.trace = [];
    this._aborted = false;

    const systemMessage = { role: 'system', content: this.buildSystemPrompt() };
    const useStream = !!onStream && typeof this.llm.chatStream === 'function';
    this._totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const signal = this._abortController?.signal;

    // 对话历史：有 memory 时用其 working 数组作为唯一存储源（自动压缩），
    // 否则用本地数组（行为与旧版一致）。
    let history = [];
    const resetWorking = () => {
      if (this.memory) {
        if (typeof this.memory.resetWorking === 'function') this.memory.resetWorking();
        else this.memory.working.length = 0;
      } else {
        history = [];
      }
    };
    const pushMessage = (m) => {
      if (this.memory) this.memory.addWorking(m);
      else history.push(m);
    };
    // system prompt 始终置于最前，不参与压缩
    const buildMessages = () => [
      systemMessage,
      ...(this.memory ? this.memory.getWorkingContext() : history)
    ];

    resetWorking();
    pushMessage({ role: 'user', content: task });

    for (let step = 0; step < this.maxSteps; step++) {
      if (this._aborted) break;

      try {
        const messages = buildMessages();

        // ====== Step 1: THINK（调用 LLM，优先流式输出） ======
        let rawResponse;
        if (useStream) {
          onStream(step + 1, ''); // 通知 UI：开始流式思考
          rawResponse = await this.llm.chatStream(
            messages,
            { temperature: this.temperature, signal },
            (chunk, fullText) => onStream(step + 1, fullText)
          );
          onStreamEnd?.(step + 1, rawResponse);
        } else {
          rawResponse = await this.llm.chat(messages, { temperature: this.temperature, signal });
        }
        const parsed = this._parseResponse(rawResponse);

        // Token 追踪：累加本次调用的 token 消耗
        if (this.llm.lastUsage) {
          const u = this.llm.lastUsage;
          this._totalUsage.prompt_tokens += u.prompt_tokens || 0;
          this._totalUsage.completion_tokens += u.completion_tokens || 0;
          this._totalUsage.total_tokens += u.total_tokens || 0;
          onTokenUsage?.(this._totalUsage, this.llm.cost || null);
        }

        this.trace.push({
          step: step + 1,
          type: 'think',
          reasoning: parsed.reasoning,
          action: parsed.action,
          input: parsed.input
        });

        onStep?.({
          step: step + 1,
          reasoning: parsed.reasoning,
          action: parsed.action,
          input: parsed.input
        });

        // ====== Step 2: 判断是否结束 ======
        if (parsed.action === 'FINISH') {
          const finalAnswer = parsed.answer || parsed.reasoning || rawResponse;
          this.trace.push({ step: step + 1, type: 'finish', answer: finalAnswer });
          onComplete?.({ answer: finalAnswer, trace: this.trace, steps: step + 1, usage: this._totalUsage, cost: this.llm.cost });
          return { answer: finalAnswer, trace: this.trace, steps: step + 1, usage: this._totalUsage, cost: this.llm.cost };
        }

        // ====== Step 3: ACT（执行工具） ======
        const toolResult = await this.tools.execute(parsed.action, parsed.input || {});

        this.trace.push({
          step: step + 1,
          type: 'observe',
          tool: parsed.action,
          result: toolResult
        });

        onToolCall?.({
          step: step + 1,
          tool: parsed.action,
          input: parsed.input,
          result: toolResult
        });

        // ====== Step 4: OBSERVE（添加到对话） ======
        pushMessage({ role: 'assistant', content: rawResponse });
        pushMessage({
          role: 'user',
          content: `[工具 "${parsed.action}" 的执行结果]\n${JSON.stringify(toolResult)}`
        });

      } catch (e) {
        // AbortError：用户主动中止，不恢复
        if (e.name === 'AbortError') {
          this.trace.push({ step: step + 1, type: 'abort' });
          onComplete?.({ answer: '⏹️ 已停止', trace: this.trace, steps: step + 1, aborted: true });
          return { answer: '⏹️ 已停止', trace: this.trace, steps: step + 1, aborted: true };
        }

        this.trace.push({ step: step + 1, type: 'error', error: e.message });
        onError?.({ step: step + 1, error: e.message });

        // 错误恢复：告知 LLM 出错了，让它调整策略
        pushMessage({
          role: 'user',
          content: `[系统提示] 上一步操作出错: ${e.message}。请调整策略，尝试其他方法或工具。`
        });
      }
    }

    // 达到最大步数 → 强制总结
    const messages = buildMessages();
    messages.push({
      role: 'user',
      content: '已达到最大操作步数。请基于已获取的信息，立即输出 FINISH 并给出当前最佳答案。'
    });

    try {
      const rawResponse = await this.llm.chat(messages, { temperature: this.temperature, signal });
      const parsed = this._parseResponse(rawResponse);
      const answer = parsed.answer || rawResponse;
      onComplete?.({ answer, trace: this.trace, steps: this.maxSteps, forced: true, usage: this._totalUsage, cost: this.llm.cost });
      return { answer, trace: this.trace, steps: this.maxSteps, forced: true, usage: this._totalUsage, cost: this.llm.cost };
    } catch (e) {
      const msg = 'Agent 执行超时，请稍后重试';
      onError?.({ error: msg });
      return { answer: msg, trace: this.trace, steps: this.maxSteps, error: true };
    }
  }

  /** 设置中止控制器（由调用方在 run() 前传入） */
  setAbortController(controller) {
    this._abortController = controller;
  }

  /** 中止执行 */
  abort() {
    this._aborted = true;
    if (this._abortController) {
      this._abortController.abort();
    }
  }

  /** 解析 LLM 返回的 JSON */
  _parseResponse(raw) {
    try {
      // 尝试直接解析
      return JSON.parse(raw);
    } catch {
      // 尝试从文本中提取 JSON 块
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch {
          // 无法解析，当作最终答案
        }
      }
      // 兜底：当作自然语言回答
      return { action: 'FINISH', answer: raw, reasoning: 'LLM 返回了自然语言格式，直接作为答案输出' };
    }
  }
}

export { ReActAgent };
