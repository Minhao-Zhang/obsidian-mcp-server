# Obsidian MCP 服务器

中文文档（机翻）| [English](README.md)

这个 Obsidian 插件运行一个本地 MCP（模型上下文协议）服务器，允许外部应用程序（如 AI 助手、脚本或其他工具）通过标准化接口与您的 Obsidian vault 交互。

这是一个正在进行中的插件，虽然它功能齐全，但可能存在错误或不完整的功能。请报告您遇到的任何问题。我不太了解 TypeScript，因此可能存在安全性和可靠性问题。您可以通过在 GitHub 上打开 issue 或 pull request 来提供帮助。我会尽快回复它们。

## 特性

- **本地 MCP 服务器：** 在可配置的端口上运行一个基于 SSE 的 MCP 服务器。
- **用于语义搜索的 Vault 索引：**
  - 将您的 Markdown 笔记的内容索引到 Orama 向量数据库中。
  - 使用可配置的 OpenAI 兼容嵌入模型（例如，OpenAI，通过兼容端点的本地 Ollama 模型）来生成嵌入。
  - 允许配置文本分块参数（大小、重叠、分隔符）。
  - 支持使用 `.gitignore` 语法排除特定文件或模式的索引。
- **Obsidian 集成：**
  - **命令：** 在 Obsidian 命令面板中提供以下命令：
    - 启动/停止 MCP 服务器。
    - 重新索引整个 vault（根据嵌入提供商的不同，这可能非常耗时且成本高昂）。
    - 手动保存向量数据库索引。
  - **设置选项卡：** 提供一个专用设置面板来配置：
    - 服务器端口和自动启动行为。
    - 嵌入提供商详细信息（API 端点、模型名称、API 密钥）。
    - 用于索引的文件排除模式。
    - 分块参数。
    - 嵌入提供商的连接验证。
  - **Ribbon 图标：** 在 Obsidian ribbon 中添加一个状态图标，指示 MCP 服务器是正在运行还是已停止。

## MCP 工具

- **Vault 交互工具：** 通过 MCP 服务器公开以下工具：
  - `simple_vector_search`：使用向量嵌入对您的 vault 中已索引的笔记执行语义搜索。需要完成 vault 索引。
  - `count_entries`：报告向量存储中已索引的文档块的数量。
  - `list_files`：列出您的 vault 中指定目录中的文件和文件夹。
  - `read_file`：读取特定文件的内容（可选地带有行号）。
  - `create_file`：在 vault 中创建一个新文件。
  - `edit_file`：编辑现有文件中特定范围的行。

## TODO

- [x] 多语言支持（从简体中文开始）
- [ ] 重命名一些工具以更准确地反映功能
- [ ] 添加一个可以基于 Obsidian 模板生成笔记的工具
- [ ] 实现使用元数据（frontmatter）进行过滤的搜索
- [ ] 实现对新笔记和编辑的实时跟踪和更新

## 配置

在 Obsidian 中访问插件设置以配置：

1. **服务器设置：** 端口号以及服务器是否应与 Obsidian 一起自动启动。
2. **嵌入模型：** 为您选择的 OpenAI 兼容嵌入提供商提供 URL、模型名称和 API 密钥。使用提供的按钮验证连接。
3. **向量存储：**
    - 定义文件模式（如 `.gitignore`）以排除特定文件或文件夹的索引。您可以直接从 vault 的 `.gitignore` 文件中复制模式。
    - 如果需要，调整分块参数（大小、重叠、分隔符），但默认值通常是合适的。

## 用法

1. **配置：** 通过 Obsidian 设置面板设置插件，特别是嵌入模型详细信息。
2. **索引 Vault：** 从 Obsidian 命令面板运行“重新索引 Vault (MCP Server)”命令。这对于 `simple_vector_search` 工具的运行是必需的。等待索引过程完成（将出现通知）。
3. **启动服务器：** 确保 MCP 服务器正在运行。在设置中启用“自动启动 MCP”或使用“启动 MCP 服务器”命令。
4. **连接外部工具：** 将您的 MCP 客户端（例如，配置为使用 MCP 的 AI 助手）连接到设置中显示的服务器端点（例如，`http://localhost:8080/sse`）。
5. **利用工具：** 使用来自您连接的客户端的可用 MCP 工具（`simple_vector_search`、`list_files`、`read_file` 等）与您的 Obsidian vault 交互。
6. 在您最喜欢的支持 MCP 的客户端中，将 MCP 配置为 SSE 模式，并将端点设置为 `http://localhost:8080/sse`（或您配置的端口）。然后，您可以使用此插件公开的工具。
7. **停止服务器：** 使用“停止 MCP 服务器”命令停止服务器，以在不使用时停止服务器。

## 开发

此项目使用 TypeScript。确保您已安装 Node.js 和 npm。

1. 克隆存储库。
2. 运行 `npm install` 以安装依赖项。
3. 运行 `npm run dev` 以编译插件并监视更改。
4. 将 `main.js`、`manifest.json` 和 `styles.css` 文件复制到您的 Obsidian vault 的 `.obsidian/plugins/mcp-server/` 目录中。
5. 重新加载 Obsidian 并启用插件。

## 已知问题

如果您的 vault 包含大量笔记，则索引过程将失败，因为无法将数据库保存到单个本地文件。如果 `orama.json` 文件大于 512MB，则会发生这种情况。目前还没有解决这个问题的方法。您可以尝试减少 vault 中的笔记数量，或使用支持分片的不同向量数据库（如 Pinecone）。

## OramaDB 限制

OramaDB 以原始字符串形式存储浮点数。这可能会导致数据库大小快速增加，尤其是在索引具有许多数值的大型 vault 时。这是当前实现的一个已知限制。
