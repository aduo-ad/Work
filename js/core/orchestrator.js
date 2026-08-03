/**
 * 多 Agent 编排器
 *
 * 三种编排模式（面试重点）：
 *   1. Sequential  — Agent A 输出作为 Agent B 输入（流水线）
 *   2. Parallel    — 多个 Agent 同时执行，合并结果
 *   3. Debate      — 两个 Agent 对立观点辩论，裁判 Agent 裁决
 */

class Orchestrator {
  /** 串行流水线 — 每个 Agent 的输出传给下一个 */
  static async sequential(agents, task, callbacks = {}) {
    const results = [];
    let input = task;

    for (const agent of agents) {
      callbacks.onAgentStart?.(agent.name);

      const result = await agent.run(input, {
        onStep:    (s) => callbacks.onStep?.(agent.name, s),
        onToolCall:(t) => callbacks.onToolCall?.(agent.name, t),
      });

      results.push({ agent: agent.name, result });
      input = result.answer; // 下个 Agent 的输入
      callbacks.onAgentEnd?.(agent.name, result);
    }

    return results;
  }

  /** 并行执行 — 多个 Agent 同时跑，结果合并 */
  static async parallel(agents, task, callbacks = {}) {
    callbacks.onParallelStart?.(agents.map(a => a.name));

    const promises = agents.map(agent =>
      agent.run(task, {
        onStep:    (s) => callbacks.onStep?.(agent.name, s),
        onToolCall:(t) => callbacks.onToolCall?.(agent.name, t),
      }).then(r => ({ agent: agent.name, result: r }))
    );

    const results = await Promise.all(promises);
    callbacks.onParallelEnd?.(results);

    // 合并：所有 Agent 的答案拼接
    const merged = results
      .map(r => `## ${r.agent}\n${r.result.answer}`)
      .join('\n\n---\n\n');

    return { merged, details: results };
  }

  /** 辩论模式 — 两个对立 Agent + 裁判 */
  static async debate({ pro, con, judge }, task, rounds = 2, callbacks = {}) {
    callbacks.onDebateStart?.();

    let proArg = `请从正面/优势角度分析：${task}`;
    let conArg = `请从负面/风险角度分析：${task}`;

    for (let r = 1; r <= rounds; r++) {
      callbacks.onRoundStart?.(r);

      // 正方论证
      const proResult = await pro.run(proArg, {
        onStep: (s) => callbacks.onStep?.(`正方(第${r}轮)`, s)
      });

      // 反方论证（可以看到正方的论点进行反驳）
      conArg = `对方（正方）认为：${proResult.answer.slice(0, 300)}\n\n请从对立角度反驳，并补充你的观点。原始任务：${task}`;

      const conResult = await con.run(conArg, {
        onStep: (s) => callbacks.onStep?.(`反方(第${r}轮)`, s)
      });

      // 下一轮正方要回应反方
      proArg = `对方（反方）认为：${conResult.answer.slice(0, 300)}\n\n请回应对方论点，补充你的论证。原始任务：${task}`;

      callbacks.onRoundEnd?.(r, { pro: proResult, con: conResult });
    }

    // 裁判裁决
    callbacks.onJudgeStart?.();
    const judgeTask = `请基于以下辩论内容，做出综合裁决和建议。

## 正方观点
${proArg}

## 辩论过程已完成 ${rounds} 轮

请给出：1) 综合结论 2) 双方合理之处 3) 最终建议

原始任务：${task}`;

    const verdict = await judge.run(judgeTask, {
      onStep: (s) => callbacks.onStep?.('裁判', s)
    });

    return { verdict: verdict.answer, rounds };
  }
}

export { Orchestrator };
