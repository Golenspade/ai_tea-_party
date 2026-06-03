# 社区调研：Agent 编排、叙事与 Big Scale

**日期**：2026-06-03  
**目的**：为 Big Scale 第一场景（Archive vs 共享设定库）与 DM/Orchestrator 形态提供外部参考。  
**说明**：产品提到的「Locus of Agent」经检索，与当前栈最接近的公开方案为 **Oracle Locus SDK**（多 Agent 编排），与 **Pi Agent（earendil-works/pi-mono）** 为不同产品线；下文分开记录，避免混用。

---

## 1. Oracle Locus SDK（Multi-Agent Locus）

- 官网：<https://locusagents.oracle.com/>  
- 仓库：<https://github.com/oracle-samples/locus>  
- PyPI：`locus-sdk`（beta）

### 1.1 核心思路

| 概念 | 说明 |
|------|------|
| **PRISM 认知路由** | 自然语言任务 → 类型化 `GoalFrame` → 八种协调协议之一 |
| **统一 Agent 类** | 七种进程内形态 + A2A；同一 event stream |
| **Orchestrator + Specialists** | 协调者路由到领域专家（与我们的 **DM 调度** 概念相近） |
| **StateGraph** | 显式 DAG、条件边、**human-in-the-loop** 门控 |
| **approval_gated_execution** | 执行前人工批准（与 **Ask** 类似但偏审批） |

### 1.2 对 AI Tea Party 的启示

- **DM 模式** 可对标 `Orchestrator + Specialists`：DM 不写正文，只选下一「写手」Agent。  
- **Big Scale / 持久化**：Locus 强调 Oracle DB 26ai 的 durable threads、in-DB chunking、versioned saver — 我们若不用 Oracle，可借鉴「**版本化存档 + 分块嵌入**」而非具体 DB。  
- **Archive 第一场景**：社区侧更重 **durable thread + 选择性落盘**，而非早期定「共享设定库」；设定库更像我们的 **(a) 世界书持久化**。

---

## 2. Pi Agent 生态（earendil-works / pi-mono）

- 我们已用：`@earendil-works/pi-agent-core`、`@earendil-works/pi-ai`  
- Coding Agent 默认 Tool：`read` / `write` / `edit` / `bash`（**写文件**是核心能力，但是代码场景）

### 2.1 Ask / 用户输入

| 来源 | 模式 |
|------|------|
| Pi 扩展生态 | `ask_question`、`answer.ts` 等扩展；可替换 TUI 为结构化 Q&A |
| Agentrail `AskUserQuestion` | `waiting_for_user_input` 事件 → 挂起 → 用户回答 → resume |
| 我们的选择 | **侧栏决策面板** + `ask_pending` / `ask_resolved` WS 事件 |

**结论**：Pi 核心包**不内置**叙事向 `ask_user`；我们按 **Agentrail 事件模式** 自研 Tool + 前端宿主，与 extension 思路一致。

### 2.2 Write

- Pi 的 `write` / `edit` 针对**文件系统**，不是「Write to Room」。  
- 叙事场景的 **Write to Room / Write to Bar** 需 **业务层 Tool**，映射到 `messages` 与 **Bar 状态存储**。

---

## 3. 叙事多 Agent 学术/开源参考

### StoryWriter（Multi-Agent Long Story）

- 论文：[2506.16445 StoryWriter](http://arxiv.org/pdf/2506.16445)  
- 结构：**outline agents → planning agents → writing agents**  
- **ReIO**：输入侧压缩历史上下文并 **cache 摘要**；输出侧按需 rewrite — 与我们的 **Summary/Compact** 高度相关。

| StoryWriter 模块 | AI Tea Party 映射 |
|------------------|-------------------|
| Outline / Planning | DM + 剧情书 (b) |
| Writing agents | 角色 Agent / Write to Room |
| ReIO 摘要缓存 | Compact + Big Scale archive |
| Coordinator rewrite | Patch Room（Phase 2） |

---

## 4. Big Scale：第一场景建议（调研结论）

社区披露普遍**晚于**「单房间消息流」，常见顺序为：

```mermaid
flowchart LR
  A[Current 会话态] --> B[Compact 摘要]
  B --> C[Archive 落盘]
  C --> D[跨 Session 检索 / 共享设定]
```

| 场景 | 优先级建议 | 理由 |
|------|------------|------|
| **Archive 导出 / 会话归档** | **P3 首选** | StoryWriter ReIO、Locus durable thread 均先解决「长对话存续」 |
| **共享设定库** | P3–P4 | 更接近我们的 **(a) 世界书** 产品化，非 Big Scale 首发 |
| **跨 room 设定复用** | 更晚 | 需权限、版本、导入导出（可参考 Chatbox 配置持久化调研） |

**建议**：Big Scale v1 = **按 room 导出 archive（消息 + 变量快照 + 当前 Bar 状态 + 可选摘要）**；共享设定库走 **世界书/四书** 持久化路线，不挤占 Big Scale 首发。

---

## 5. 与产品决策的对齐检查

| 产品决策 | 调研支持 |
|----------|----------|
| Ask 侧栏 | 与 approval / AskUserQuestion 模式一致 |
| Write to Room vs Write to Bar | Pi 无现成等价；需自研；Bar ≈ Current Scale 外围摘要 |
| DM 指定发言者 | Locus Orchestrator、StoryWriter Coordinator 均支持 |
| Wireframe 并行 | 合理；Ask/Bar 需前端先行定义布局 |

---

## 6. 待继续调研

- [x] [Chatbox](https://github.com/chatboxai/chatbox) 配置与持久化（见 `chatbox-config-reference.md` 初稿）  
- [ ] Pi mono `packages/agent` 是否新增 narrative 示例（跟踪 upstream main）  
- [ ] 确认产品所说的「Locus」是否专指 Oracle Locus，或另有内部/中文社区名词  

---

## 7. 参考链接

- Oracle Locus: <https://locusagents.oracle.com/>  
- oracle-samples/locus: <https://github.com/oracle-samples/locus>  
- Pi mono (earendil-works): <https://github.com/badlogic/pi-mono>  
- AskUserQuestion 模式: <https://agentrail.run/tools/ask-user-question>  
- StoryWriter: <http://arxiv.org/pdf/2506.16445>
