# 分发 helm 本体：诊断与修复方案

## 结论先说

**helm 现在无法分发给别人。** 别人 clone 仓库后跑不起来，`npm install` 也装不上。
根因有三个，全部实测确认：

| # | 问题 | 后果 | 严重度 |
|---|---|---|---|
| 1 | i18n 词条没打进 tarball | 装了也启动即崩 | 高 |
| 2 | 6 个依赖包没发布到 npm（其中 5 个不该是依赖） | `npm install` 直接 404 | 高 |
| 3 | `helm` 启动器是手写绝对路径 | 别人没有这个命令 | 高 |

---

## 问题 1：i18n 词条缺失

### 现象

从 tarball 装出来的 helm 一启动就崩：

```
Error: [i18n] cannot load catalog en.json
  (tried: .../dist/i18n/en.json)
```

### 根因

`dist/bundle/chunks/chunk-*.js` 里的 `loadCatalog()` 按两个候选路径找词条：

```js
function loadCatalog(file) {
  let candidates = [join(HERE, "..", "..", "i18n", file)];   // -> dist/i18n/
  try {
    candidates.push(createRequire3(import.meta.url)
      .resolve(`@adwmc/helm-kernel/i18n/${file}`));           // -> 需要 kernel 包
  } catch {}
  ...
}
```

第一条是预期路径 `dist/i18n/`，**但 `copy-assets` 从来没往那里拷过东西**：

```json
"copy-assets": "shx mkdir -p dist/modes/interactive/theme && ... &&
                shx cp src/core/export-html/vendor/*.js dist/core/export-html/vendor/"
```

`copy-assets` 只拷了主题、图片、export-html 模板 —— 没有 i18n。
第二条路径依赖 `@adwmc/helm-kernel` 包存在，而那个包是 `private`，也不存在。

**两条路径同时失效，所以必崩。**

### 词条实际位置

```
packages/helmpi-kernel/i18n/en.json        9462 B
packages/helmpi-kernel/i18n/surfaces.json  4205 B
packages/helmpi-kernel/i18n/zh-CN.json     9010 B
```

### 修复

在 `copy-assets` 末尾追加：

```
&& shx mkdir -p dist/i18n && shx cp ../helmpi-kernel/i18n/*.json dist/i18n/
```

**已验证**：执行后 `dist/i18n/{en,surfaces,zh-CN}.json` 三个文件就位。

---

## 问题 2：依赖包没发布

### 现象

```
$ npm install @adwmc/helm-coding-agent
npm error 404 Not Found - GET .../@adwmc%2fhelm-coding-agent - Not found
```

连 tarball 也要崩在依赖上：

```
$ npm install ./adwmc-helm-coding-agent-0.87.1.tgz
npm error 404 Not Found - GET .../@adwmc%2fhelm-agent-core - Not found
```

### 实测：6 个依赖全部 404

```
[无] @adwmc/helm-kernel      -> E404
[无] @adwmc/helm-tools       -> E404
[无] @adwmc/helm-chord       -> E404
[无] @adwmc/helm-agent-core  -> E404
[无] @adwmc/helm-ai          -> E404
[无] @adwmc/helm-tui         -> E404
```

### 关键发现：依赖分三类，不是"1 个 vs 6 个"

我一开始的结论是错的，这里记下修正过程，因为错法本身有价值。

**第一版结论（错）**：扫 `dist/bundle/` 的真实 import，只找到
`@adwmc/helm-chord/context`，于是判断"CLI 只需要 1 个包"。

**这个结论被 `--version` 假通过验证了** —— `--version` 确实只用 1 个包就能跑。

**但真会话立刻暴露问题**：

```
$ node dist/bundle/cli.js --print "say ok"
Error: Cannot find module '@adwmc/helm-kernel/package.json'
    at builtinKernelEntry (...)
```

`builtinKernelEntry()` 在启动时要 `require.resolve('@adwmc/helm-kernel/package.json')`。
**`--version` 不构建 runtime，所以测不到这条路径。**

修正后逐个添加实测，得到真实的最小集合：

| 依赖 | CLI 启动 | 真会话 | 扩展运行时 | 备注 |
|---|---|---|---|---|
| `@adwmc/helm-chord` | 必需 | 必需 | - | bundle 唯一真实 import |
| `@adwmc/helm-kernel` | - | **必需** | **必需** | 启动时解析 + 内置 kernel 扩展 |
| `@adwmc/helm-tui` | - | - | **必需** | 扩展 import 它（pi-footer 就是）|
| `@adwmc/helm-agent-core` | - | - | **必需** | loader alias fallback |
| `@adwmc/helm-ai` | - | - | **必需** | loader alias fallback |
| `@adwmc/helm-tools` | - | - | 可选 | 只有 `dist/index.js` 库入口用 |

**实测：只装 `helm-chord` + `helm-kernel` + npm 依赖，真会话跑通**（输出 `ok`，exit 0）。

### 但 extensions 会静默失败

装成包后 `packages/` 目录不存在，`resolveWorkspaceOrImport` 的
workspace 路径检查落空，fallback 到 `import.meta.resolve`。实测结果：

```
packagesRoot: .../solo            exists: true
workspace tui: .../solo/tui/dist/index.js   exists: false
  @adwmc/helm-tui:         FAIL MODULE_NOT_FOUND
  @adwmc/helm-agent-core:  FAIL MODULE_NOT_FOUND
  @adwmc/helm-ai:          FAIL MODULE_NOT_FOUND
  @adwmc/helm-kernel:      OK
  @adwmc/helm-chord:       OK
import.meta.resolve('@adwmc/helm-tui'): FAIL ERR_MODULE_NOT_FOUND
```

**后果**：像 pi-footer 这种 `import { truncateToWidth } from "@adwmc/helm-tui"`
的扩展装不上。而且**helm 容忍扩展加载失败**（会话仍然 exit 0），
所以用户看到的是"footer 没生效"，不是"扩展崩了" —— 极难排查。

**这一条决定了分发方案**：只发 2 个包不够，扩展生态会瘸。
要么发 5 个（除 helm-tools），要么接受扩展只能用不 import helm-tui 的那些。

### 那 5 个"假依赖"的澄清

初次扫描时我用 `Select-String -Pattern '@adwmc/helm-[a-z-]+'` 扫 bundle，
匹配到 6 个包名，误以为都是 import。实际上其中 5 个是
`virtual-modules.js` 里的**字符串 key**：

```js
"@adwmc/helm-agent-core": dist_exports2,
"@adwmc/helm-tui": dist_exports,
"@adwmc/helm-ai": comp...
```

这些是给编译成独立二进制时用的模块替身表，不是 `from` 语句。
**教训：搜包名要搜 `from "..."` 的形式，不能只搜包名。**

### 修复选项（实测修正版）

完整的**内部依赖闭包**（从 coding-agent 出发，含传递依赖）：

| 包 | 体积 | 用途 | 必需性 |
|---|---|---|---|
| `@adwmc/helm-coding-agent` | 7.42 MB | 本体 | — |
| `@adwmc/helm-kernel` | 0.59 MB | 内置 kernel 扩展 | 必需 |
| `@adwmc/helm-tui` | 0.61 MB | 扩展 import | 必需 |
| `@adwmc/helm-agent-core` | 1.00 MB | loader alias | 必需 |
| `@adwmc/helm-ai` | 0.87 MB | loader alias | 必需 |
| `@adwmc/helm-chord` | 0.35 MB | bundle import | 必需 |
| `@adwmc/helm-tools` | 0.01 MB | 库入口 | 必需（几乎无成本）|
| `@adwmc/helm-telemetry` | 0.03 MB | agent-core 和 ai 的传递依赖 | **必需** |

合计约 10.9 MB。

**`@adwmc/helm-telemetry` 是第三次才发现的** —— 我第一次扫 bundle 漏了它，
逐个添加依赖时也没碰到，直到用真实 `npm install` 走依赖解析才暴露：

```
npm error 404 Not Found - GET .../@adwmc%2fhelm-telemetry - Not found
```

它是 `helm-agent-core` 和 `helm-ai` 的传递依赖。
**手搓 node_modules 永远发现不了这类问题，必须让 npm 真正解析依赖。**

**最终结论：8 个包全都要发。** 没有可以省掉的。
总体积不大（最小 10 KB，最大 1 MB），发布的边际成本很低。

### 验证方式（已验证可跑）

`docs/tests/helm-clean-install.py` 做完整验证：

1. 打包全部 8 个包
2. 用 `file:` 协议写一个测试 package.json（**绕开 registry，但让 npm 做真实依赖解析**）
3. `npm install --ignore-scripts`
4. 从**安装目录外**跑 `--version` 和真会话 `<code>--print "say ok"</code>`
5. 确认 `dist/i18n/` 进包

实测输出：

```
3. npm install --ignore-scripts
   install OK

4. running from the install dir (outside the repo)
   version        exit=0 PASS  0.87.1
   real session   exit=0 PASS  ok

5. dist/i18n shipped: True ['en.json', 'surfaces.json', 'zh-CN.json']

ALL CHECKS PASSED
```

扩展也验证过：装 pi-footer（import helm-tui）+ helm-dashboard 后，
4 个扩展全部加载成功，0 错误。

**为什么必须用 `file:` 而不是手搓 node_modules：**
手工 tar 解包不会解析传递依赖（`which`、`shebang-regex`、`isexe`……），
产生一堆**假失败**。我在这上面浪费了三轮，最后才改用 npm。

---

## 问题 3：启动器是手写绝对路径

### 现状

`%APPDATA%\npm\helm.ps1`（和 `helm.cmd`）内容：

```powershell
# helm launcher — points at the built fork bundle (workspace deps not published to npm)
node "C:\Users\Administrator\Documents\GitHub\helm\packages\coding-agent\dist\bundle\cli.js" @args
```

**写死了当前机器的绝对路径。** 这个文件不是 npm 生成的，是手工放的。
别人不可能有。

而且注释里那句 "workspace deps not published to npm" 正说明了：
**做这个 launcher 的人知道包发不出去，所以绕过了 npm。**

### 正确形态

`package.json` 里其实**已经有正确的 bin 声明**：

```json
"bin": {
  "helm":   "dist/bundle/cli.js",
  "helmpi": "dist/bundle/cli.js",
  "pi":     "dist/bundle/cli.js"
}
```

只要包能发布（或从 tarball 装），
`npm install -g` 会自动生成正确的 `helm` 命令，**不需要手写 launcher**。

---

## pi 是怎么干的（上游调研结论）

helm 仓库原样保留了上游的全部发布机制。核心事实：

### 1. 唯一的包清单：`private !== true`

```js
// scripts/release-packages.mjs
export function getPublicWorkspacePackages() {
	return findPackageDirectories()
		.map(...)
		.filter((pkg) => pkg.private !== true);   // <- 全部机制的源头
}
```

`publish.mjs`（发布）、`release.mjs`（版本/注册校验）、
`coding-agent-consumer.mjs`（隔离安装打包）全部消费这一个函数。
**private 的运行时依赖 = 永远发不出去**——helm-kernel/helm-tools 正是这样消失的。

### 2. `release:local`：仓库外隔离安装是发布阻断项

`scripts/local-release.mjs` + `scripts/coding-agent-consumer.mjs`：

1. `generate:models`（见下面的坑）
2. `npm run check` + `./test.sh`
3. 逐包 clean+build，`npm pack` 打全部 public 包
4. 在**仓库外**临时目录写一个 package.json：只有 `coding-agent` 一个直接依赖，
   其余全部走 `overrides: { "@adwmc/*": "file:./tarballs/*.tgz" }`
   （这就是绕开 registry 的标准姿势，`npm install` 真实解析传递依赖）
5. 冒烟：SDK 三个导出存在性断言、`client/protocol/server` 不可解析断言、
   两个入口 `--version` 与 package.json 版本一致
6. bun 二进制同样隔离验证（skill 要求 tmux 交互冒烟，"Failures are release blockers"）

### 3. `release:patch`：锁步版本 + tag 触发 CI

`scripts/release.mjs`：所有包同版本 bump → CHANGELOG `[Unreleased]`→版本 →
`npm run check` → commit `Release vX.Y.Z` → tag → push。
发布前校验**每个 public 包已在 npm 注册**（没注册过 → 拒绝）。

### 4. tag → CI OIDC 可信发布

`.github/workflows/build-binaries.yml` 的 `publish-npm` job：
`environment: npm-publish` + `id-token: write`（GitHub Actions OIDC，无 OTP/本地登录），
依次跑 `npm ci` → build → check → `npm test` → `npm run check:package-install`
→ `node scripts/publish.mjs`（幂等：已发布的版本只验内容不重发）。
之后 `announce-pi-dev-release` 逐一确认每个包在精确版本可解析才写 R2 标记。

### 5. 实测上游 npm

```
[有] @earendil-works/pi-coding-agent @ 0.87.1
[有] @earendil-works/pi-tui          @ 0.87.1
[有] @earendil-works/pi-ai           @ 0.87.1
[有] @earendil-works/pi-agent-core   @ 0.87.1
[有] @earendil-works/chord           @ 0.87.1
```

**全部公开、同版本、锁步**。helm 的 8 个内部包一个都不在。pi 没有手写
launcher、没有 private 运行时依赖、`files` 白名单保证 dist 进包
（对照实测：chord 的 dist 被根 .gitignore 忽略，`files: ["dist"]` 依然打进 tarball）。

---

## 本次修复（已完成，全部实测）

| # | 修复 | 验证 |
|---|---|---|
| 1 | `copy-assets` 补 `dist/i18n/` 拷贝 | tarball 含 i18n 三件套；干净安装跑通 |
| 2 | kernel/tools 摘掉 `private: true` | `getPublicWorkspacePackages()` = 13 包 |
| 3 | kernel/tools 增加 tsgo 构建（tsconfig.build.json + `clean`/`build` 脚本） | dist 产物与 exports 一一对应 |
| 4 | exports 改 `{source, types, import}`：types 指回 src（保 check 免构建）、import 指 dist（保 node ESM 不再踩 `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`） | tsgo + 真会话双绿 |
| 5 | kernel/tools `files` 白名单（dist/src/i18n/references/CHANGELOG） | pack 验证 529 文件，dist 在包内 |
| 6 | kernel 声明运行时依赖 `@adwmc/helm-ai`、`@adwmc/helm-tui` | `check:runtime-deps` 绿（pi 的门禁认可） |
| 7 | `local-release.mjs` 包清单补 kernel/tools（放在 coding-agent 之后，解开类型循环），build/clean 加存在性守卫 | 清单 13 包 |
| 8 | `publish.mjs` 对源码直发包跳过 dist 断言 + Windows cmd.exe spawn（`shell: win32`） | `publish --dry-run` 全 13 包绿 |
| 9 | `coding-agent-consumer.mjs`：命令/参数空格引号（`C:\Program Files` 被 cmd 切断）+ 嵌套安装剔除 `npm_config_allow_scripts`（`npm run` 下 npm ≥11 抛 EALLOWSCRIPTS） | `npm run test:scripts` 28/28 |
| 10 | 根 build 链尾部追加 kernel/tools | `npm run check` 含 shrinkwrap/install-lock 重生成 |
| 11 | `export.ts` 的 playbook 路径 `join(dir, "references", ...)` → `join(dir, "..", "references", ...)`（原路径 `src/references` 不存在，一直被 try/catch 静默吞掉） | 两种布局（src/dist）都指向包根 |

### 验证矩阵（最终全绿）

```
npm run check                    exit=0   （含 biome/tsgo/pinned/runtime-deps/shrinkwrap/install-lock/…）
npm run test:scripts             exit=0   （28/28）
node scripts/coding-agent-consumer.mjs     exit=0   （隔离安装 + SDK/CLI 冒烟，pi 的发布门禁）
node scripts/publish.mjs --dry-run         exit=0   （13 包 dist/lockstep/pack 校验）
kernel node:test                 264/264
sol-pi vitest                    53/53
```

### 踩过的两个坑（pi 发布流程在本机的副作用）

1. **`release:local` 无条件跑 `generate:models`** → 刷新 gitignored 的
   `providers/data/*.json` 到当前上游模型代次 → 16 个 ai 测试文件里 pin 的
   旧代次 ID（`Kimi-K2.6`、`kimi-k2p6`、`glm-5p2`…）类型检查全挂（38 个错误）。
   恢复方式：取 `@earendil-works/pi-ai@0.87.1` 发布包里的 data，做两代 schema
   迁移（entry 加 `type:"chat"`、键加 `chat:` 前缀——缺前缀会让
   `KeyForType` 把目录推成 `never`），共迁移 together/fireworks/opencode-go。
2. **本机用户 `~/.npmrc` 有 `allow-scripts=`**（DSH 依赖）。`npm run` 会把它
   以 env 形式传给子进程，npm ≥11 视为 CLI 来源，project 安装直接
   `EALLOWSCRIPTS` 报错 → `npm run test:scripts` 必挂。已在
   consumer.mjs 的 spawn env 里剔除该变量（等价于新 shell 语义）。

### 仍未做（属运维，不是代码）

- **13 个包的实际发布**：CI 路径需要在 npmjs.org 配 `@adwmc/*` 的 trusted
  publisher（OIDC），或先手动 `npm publish` 首发注册（`release.mjs` 的
  "已注册" 校验过了才允许 `release:patch`）。
- 手写 `helm.ps1`/`helm.cmd` 删除（发布后由 `npm i -g` 生成取代）。
- `release:local` 在 Windows 上的 bun 二进制段仍卡 `./scripts/build-binaries.sh`
  （bash 脚本；CI 在 ubuntu 不受影响）。npm 段已由同一套
  `check:package-install` 代码路径完整验证。

---

## 修复清单（原诊断，保留存档）

### 必须做

1. **`packages/coding-agent/package.json`** — `copy-assets` 补 i18n 拷贝
   （已改，已验证）
2. **`packages/coding-agent/package.json`** — dependencies 精简为真实需要的
3. **`packages/coding-agent/package.json`** — 修掉第 55 行多余的缩进
   （`"@adwmc/helm-kernel"` 比同层其他项多一个 tab）

### 分发方式（需选择）

4. 发布 `@adwmc/helm-chord`，或
5. 走 git clone + 本地构建，或
6. 提供 tarball 下载 + 本地安装脚本

### 收尾

7. 删掉手写的 `helm.ps1` / `helm.cmd`，改用 npm 生成
8. 写 README 的安装章节

---

## 验证方法

装完必须验三件事，缺一不可：

```bash
# 1. 命令存在且版本正确
helm --version

# 2. 能真的起一个会话（不只是 --version）
helm --print "say ok"

# 3. 不是从源码目录跑的（否则等于没测分发）
cd /tmp && helm --version && helm --print "say ok"
```

第 3 条最关键 —— 在仓库目录里测会因为 junction 解析到源码而假通过。
