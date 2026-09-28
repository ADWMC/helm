# arXiv 候选：AI Agent 意图理解 / 上下文优化

抓取查询：5 条 · 去重后 60 篇 · 2024-01 之后 54 篇

## 已落地（3 篇写进 references）

| 文档 | 来源 | 结论 |
|---|---|---|
| `references/ai-security/intent-understanding-clarification.md` | `2603.26233` + `2502.04485` | 该不该问 + 用信息增益 EIG 选问哪个 |
| `references/ai-security/context-optimization.md` | `2510.00615` | ACON：对比反馈迭代压缩准则 |
| `references/ai-security/memory-management.md` | `2601.01885` + `2609.30289` | 记忆有效性：作废比召回更关键 |

**核对源码后修正了三条初判**（初判写在下方"helm 的对应缺口"，保留作推理留痕）：

| 初判 | 核对结果 |
|---|---|
| context：helm 没有预算调度 | **错** —— `online-context-compact` 有经济学判据的压缩决策 |
| memory：helm 没有记忆选择策略 | **错** —— `status=stale` 从不注入 + 唯一索引取代 |
| intent：与"run 中不问人"冲突 | **对**，且条款措辞比预期更宽（"no mid-run human questions"） |

## helm 的对应缺口（初判，部分已被核对推翻）

- **intent**：读不准用户要什么——helm 直接执行 Spec 目标，没有消歧环节
- **context**：~~helm 只有每轮拼装，没有预算调度~~ → **实为：压缩准则写死，无反馈回路**
- **memory**：~~helm 有 tool-memory 但没有记忆选择策略~~ → **实为：有效性只认探针失效，不认结论被推翻**
- **clarify**：该不该问、什么时候问——与 helm 的「run 中不问人」条款直接冲突（**成立**）
- **planning**：计划表示与重规划——helm 用 10 类 StepKind 硬编码阶段

## 候选（2024-01 之后，按时间倒序）

| 日期 | arXiv ID | 命中主题 | 标题 |
|---|---|---|---|
| 2026-09 | `2609.30289v1` | memory | Not All Memories Are Equal: Hierarchical Collaborative Memory for Validity-Aware Retrieval in LLM Agents |
| 2026-09 | `2609.02054v1` | clarify | A Tri-Agent Framework for Evaluating and Aligning Question Clarification Capabilities of Large Language Models |
| 2026-08 | `2608.23992v1` | context | Hybrid Semantic Tool Discovery for Enterprise MCP Gateway: Architecture and Implementation |
| 2026-08 | `2608.15008v1` | memory | Harness the Memory: A Holistic Evaluation of Memory Substrates in Memory Agents |
| 2026-08 | `2608.04746v1` | memory | Caching for the Future: Scrub Jay Episodic Memory Principles for Agent Memory Systems |
| 2026-07 | `2607.10532v1` | context | Implicit Fine-tuning via Context Engineering: A Curriculum Learning Framework for Multimodal Entity Alignment |
| 2026-06 | `2608.19202v1` | clarify | Active Inference as Context Acquisition for AI Agents |
| 2026-06 | `2606.09916v1` | intent | IntentKV: Cross-Turn Intent-Aware KV Cache Pruning for Agent Inference |
| 2026-06 | `2606.04874v2` | planning | Agent Planning Benchmark: A Diagnostic Framework for Planning Capabilities in LLM Agents |
| 2026-05 | `2605.21768v1` | memory | Memory-R2: Fair Credit Assignment for Long-Horizon Memory-Augmented LLM Agents |
| 2026-05 | `2605.16976v1` | intent | Securing LLM Agents Need Intent-to-Execution Integrity |
| 2026-05 | `2605.15721v1` | context | Contexting as Recommendation: Evolutionary Collaborative Filtering for Context Engineering |
| 2026-05 | `2605.14051v1` | planning | SPIN: Structural LLM Planning via Iterative Navigation for Industrial Tasks |
| 2026-05 | `2605.09698v1` | clarify | Ambig-DS: A Benchmark for Task-Framing Ambiguity in Data-Science Agents |
| 2026-04 | `2604.09747v1` | memory | ADAM: A Systematic Data Extraction Attack on Agent Memory via Adaptive Querying |
| 2026-03 | `2603.26233v3` | clarify | Ask or Assume? Uncertainty-Aware Clarification-Seeking in Coding Agents |
| 2026-03 | `2603.20976v1` | intent | Detection of adversarial intent in Human-AI teams using LLMs |
| 2026-03 | `2603.12740v1` | planning | ToolTree: Efficient LLM Agent Tool Planning via Dual-Feedback Monte Carlo Tree Search and Bidirectional Pruning |
| 2026-03 | `2603.09022v2` | context | MEMO: Memory-Augmented Model Context Optimization for Robust Multi-Turn Multi-Agent LLM Games |
| 2026-02 | `2602.13691v1` | planning | PhGPO: Pheromone-Guided Policy Optimization for Long-Horizon Tool Planning |
| 2026-02 | `2602.01995v2` | clarify | Think Like a Doctor: Conversational Diagnosis through the Exploration of Diagnostic Knowledge Graphs |
| 2026-01 | `2601.21557v2` | context | Meta Context Engineering via Agentic Skill Evolution |
| 2026-01 | `2601.15487v1` | context | MiRAGE: A Multiagent Framework for Generating Multimodal Multihop Question-Answer Dataset for RAG Evaluation |
| 2026-01 | `2601.13114v1` | intent | IntAgent: NWDAF-Based Intent LLM Agent Towards Advanced Next Generation Networks |
| 2026-01 | `2601.08742v1` | intent | Inferring Latent Intentions: Attributional Natural Language Inference in LLM Agents |
| 2026-01 | `2601.01885v3` | memory | Agentic Memory: Learning Unified Long-Term and Short-Term Memory Management for Large Language Model Agents |
| 2025-12 | `2512.24615v1` | context | Youtu-Agent: Scaling Agent Productivity with Automated Generation and Hybrid Policy Optimization |
| 2025-12 | `2512.15374v2` | context | SCOPE: Prompt Evolution for Enhancing Agent Effectiveness |
| 2025-12 | `2512.11143v1` | planning | Automated Penetration Testing with LLM Agents and Classical Planning |
| 2025-12 | `2512.03001v1` | context | Invasive Context Engineering to Control Large Language Models |
| 2025-11 | `2511.20857v2` | memory | Evo-Memory: Benchmarking LLM Agent Test-time Learning with Self-Evolving Memory |
| 2025-11 | `2511.01527v1` | planning | TPS-Bench: Evaluating AI Agents' Tool Planning \& Scheduling Abilities in Compounding Tasks |
| 2025-10 | `2510.26493v1` | context | Context Engineering 2.0: The Context of Context Engineering |
| 2025-10 | `2510.18550v1` | intent | JAUNT: Joint Alignment of User Intent and Network State for QoE-centric LLM Tool Routing |
| 2025-10 | `2510.18476v1` | intent | Probabilistic Modeling of Intentions in Socially Intelligent LLM Agents |
| 2025-10 | `2510.00615v3` | context | ACON: Optimizing Context Compression for Long-horizon LLM Agents |
| 2025-07 | `2507.22925v1` | memory | Hierarchical Memory for High-Efficiency Long-Term Reasoning in LLM Agents |
| 2025-06 | `2506.17514v1` | context | Kaleidoscopic Teaming in Multi Agent Simulations |
| 2025-06 | `2506.07524v3` | intent | TAI3: Testing Agent Integrity in Interpreting User Intent |
| 2025-06 | `2506.04980v1` | intent | Agentic AI for Intent-Based Industrial Automation |
| 2025-04 | `2504.11571v1` | planning | GraphicBench: A Planning Benchmark for Graphic Design with Language Agents |
| 2025-03 | `2503.21760v2` | memory | MemInsight: Autonomous Memory Augmentation for LLM Agents |
| 2025-02 | `2502.13172v2` | memory | Unveiling Privacy Risks in LLM Agent Memory |
| 2025-02 | `2502.06975v1` | memory | Position: Episodic Memory is the Missing Piece for Long-Term LLM Agents |
| 2025-02 | `2502.04485v1` | clarify | Active Task Disambiguation with LLMs |
| 2025-02 | `2502.01390v1` | planning | Plan-Then-Execute: An Empirical Study of User Trust and Team Performance When Using LLM Agents As A Daily Assistant |
| 2025-01 | `2501.08760v2` | intent | INTA: Intent-Based Translation for Network Configuration with LLM Agents |
| 2024-10 | `2410.22552v1` | intent | Auto-Intent: Automated Intent Discovery and Self-Exploration for Large Language Model Web Agents |
| 2024-10 | `2410.19692v1` | clarify | AGENT-CQ: Automatic Generation and Evaluation of Clarifying Questions for Conversational Search with LLMs |
| 2024-08 | `2408.02232v4` | intent | SpecRover: Code Intent Extraction via LLMs |
| 2024-06 | `2406.11132v2` | planning | RePrompt: Planning by Automatic Prompt Engineering for Large Language Models Agents |
| 2024-04 | `2404.17833v1` | planning | Testing and Understanding Erroneous Planning in LLM Agents through Synthesized User Inputs |
| 2024-01 | `2401.15688v2` | planning | Divide and Conquer: Language Models can Plan and Self-Correct for Compositional Text-to-Image Generation |
| 2024-01 | `2402.01698v1` | planning | Large language model empowered participatory urban planning |

## 更早（背景/经典，2024 之前）

- `2311.08719v1` (2023-11) Think-in-Memory: Recalling and Post-thinking Enable LLMs with Long-Term Memory
- `2201.08742v1` (2022-01) Towards Building Economic Models of Conversational Search
- `2201.00235v1` (2022-01) Simulating and Modeling the Risk of Conversational Search
- `2109.12451v1` (2021-09) Deciding Whether to Ask Clarifying Questions in Large-Scale Spoken Language Understanding
- `2105.04774v1` (2021-05) Learning to Ask Appropriate Questions in Conversational Recommendation
- `2101.06327v1` (2021-01) Controlling the Risk of Conversational Search via Reinforcement Learning
