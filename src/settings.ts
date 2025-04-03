import {
	App,
	PluginSettingTab,
	Setting,
	TextAreaComponent,
	ButtonComponent,
	Notice,
} from "obsidian";
import OpenAI from "openai";
import ObsidianMCPServer from "../main";
import { countEntries } from "./orama-db";

export interface ObsidianMCPServerPluginSettings {
	port: number;
	startOnStartup: boolean;
	modelProviderUrl: string;
	embeddingModel: string;
	apiKey: string;
	ignorePatterns: string;
	chunkSize: number;
	chunkOverlap: number;
	separators: string[];
}

export const DEFAULT_SETTINGS: ObsidianMCPServerPluginSettings = {
	port: 8080,
	startOnStartup: false,
	modelProviderUrl: "https://api.openai.com/v1",
	embeddingModel: "text-embedding-ada-002",
	apiKey: "sk_your_api_key",
	ignorePatterns: `.*/
*.png
*.jpg
*.jpeg
*.gif
*.svg
*.webp
*.pdf`,
	chunkSize: 1000,
	chunkOverlap: 200,
	separators: ["\n\n", "\n", ".", "?", "!", " ", ""],
};

export class ObsidianMCPServerSettingTab extends PluginSettingTab {
	plugin: ObsidianMCPServer;
	indexVaultCommand: any;

	constructor(app: App, plugin: ObsidianMCPServer, indexVaultCommand: any) {
		super(app, plugin);
		this.plugin = plugin;
		this.indexVaultCommand = indexVaultCommand;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl).setName("General").setHeading();

		new Setting(containerEl)
			.setName("Port")
			.setDesc("The port to use for the MCP server.")
			.addText((text) =>
				text
					.setPlaceholder("9090")
					.setValue(this.plugin.settings.port.toString())
					.onChange(async (value) => {
						const port = parseInt(value);
						if (!isNaN(port) && port > 0 && port < 65536) {
							this.plugin.settings.port = port;
							await this.plugin.saveSettings();
						} else {
							new Notice(
								"Invalid port number. Please enter a number between 1 and 65535."
							);
						}
					})
			);

		new Setting(containerEl)
			.setName("Auto Start MCP")
			.setDesc("Start the MCP server when Obsidian starts.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.startOnStartup)
					.onChange(async (value) => {
						this.plugin.settings.startOnStartup = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("MCP Endpoint")
			.setDesc(`http://localhost:${this.plugin.settings.port}/sse`)
			.addButton((button) => {
				button.setButtonText("Copy").onClick(() => {
					navigator.clipboard.writeText(
						`http://localhost:${this.plugin.settings.port}/sse`
					);
					new Notice("API Endpoint copied to clipboard");
				});
			});

		new Setting(containerEl).setName("Embedding Model").setHeading();

		new Setting(containerEl)
			.setName("Model Provider URL (OpenAI Compatible)")
			.setDesc("The base URL for the OpenAI compatible API endpoint.")
			.addText((text) =>
				text
					.setPlaceholder("https://api.openai.com/v1")
					.setValue(this.plugin.settings.modelProviderUrl)
					.onChange(async (value) => {
						this.plugin.settings.modelProviderUrl = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Embedding Model")
			.setDesc("The embedding model to use.")
			.addText((text) =>
				text
					.setPlaceholder("text-embedding-ada-002")
					.setValue(this.plugin.settings.embeddingModel)
					.onChange(async (value) => {
						this.plugin.settings.embeddingModel = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("API Key")
			.setDesc(
				"The API key to use for the OpenAI compatible API endpoint."
			)
			.addText((text) =>
				text
					.setPlaceholder("sk_your_api_key")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).addButton((button) => {
			button.setButtonText("Verify Connection").onClick(async () => {
				try {
					const isValid = await this.verifyConnection();
					if (isValid) {
						new Notice("Connection verified successfully!");
					} else {
						new Notice("Connection verification failed.");
					}
				} catch (error: any) {
					new Notice(
						`An error occurred during connection verification: ${error.message}`
					);
				}
			});
		});

		new Setting(containerEl).setName("Vector Store").setHeading();

		new Setting(containerEl)
			.setName("Files to exclude from indexing")
			.setDesc(
				"Specify file patterns to exclude from search indexing (uses .gitignore syntax). Patterns match against full file paths."
			);

		const fullWidthContainer = containerEl.createDiv();
		fullWidthContainer.style.width = "100%";
		fullWidthContainer.style.marginBottom = "1em";

		let ignorePatternsTextArea: TextAreaComponent;
		const textAreaContainer = fullWidthContainer.createDiv();
		const textArea = new TextAreaComponent(textAreaContainer);
		ignorePatternsTextArea = textArea;
		textArea
			.setPlaceholder(
				`.*/
*.png
*.jpg
*.jpeg
*.gif
*.svg
*.webp
*.pdf`
			)
			.setValue(this.plugin.settings.ignorePatterns);
		textArea.inputEl.style.minHeight = "200px";
		textArea.inputEl.style.width = "100%";
		textArea.onChange(async (value: string) => {
			this.plugin.settings.ignorePatterns = value;
			await this.plugin.saveSettings();
		});

		const buttonRow = fullWidthContainer.createDiv();
		buttonRow.style.display = "flex";
		buttonRow.style.justifyContent = "flex-end";
		buttonRow.style.marginTop = "0.5em";

		new ButtonComponent(buttonRow)
			.setButtonText("Copy from .gitignore")
			.onClick(async () => {
				try {
					const gitignoreContent = await this.app.vault.adapter.read(
						".gitignore"
					);
					ignorePatternsTextArea.setValue(gitignoreContent);
					this.plugin.settings.ignorePatterns = gitignoreContent;
					await this.plugin.saveSettings();
					new Notice(".gitignore content copied to settings.");
				} catch (error) {
					new Notice(
						"Could not read .gitignore file. Make sure it exists in the vault root."
					);
					console.error("Error reading .gitignore:", error.message);
				}
			});

		const countSetting = new Setting(containerEl)
			.setName("Stored Document Chunks")
			.setDesc("Loading count...");

		const mcpServerInstance = (this.plugin as any).mcpServer;
		if (mcpServerInstance && mcpServerInstance.oramaDB) {
			countEntries(mcpServerInstance.oramaDB)
				.then((count) => {
					countSetting.setDesc(`Total chunks inserted: ${count}`);
				})
				.catch((error) => {
					console.error(
						"Error getting Orama DB count for settings:",
						error
					);
					countSetting.setDesc("Error loading count.");
					new Notice(`Failed to get chunk count: ${error.message}`);
				});
		} else {
			countSetting.setDesc(
				"MCP Server not running or Vector DB not initialized."
			);
		}

		new Setting(this.containerEl).setName("Chunking").setHeading();

		new Setting(this.containerEl)
			.setName("Chunk Size")
			.setDesc("The maximum size of each chunk.")
			.addText((text) =>
				text
					.setPlaceholder("1000")
					.setValue(this.plugin.settings.chunkSize.toString())
					.onChange(async (value) => {
						const chunkSize = parseInt(value);
						if (!isNaN(chunkSize) && chunkSize > 0) {
							this.plugin.settings.chunkSize = chunkSize;
							await this.plugin.saveSettings();
						} else {
							new Notice(
								"Invalid chunk size. Please enter a positive number."
							);
						}
					})
			);

		new Setting(this.containerEl)
			.setName("Chunk Overlap")
			.setDesc("The amount of overlap between chunks.")
			.addText((text) =>
				text
					.setPlaceholder("200")
					.setValue(this.plugin.settings.chunkOverlap.toString())
					.onChange(async (value) => {
						const chunkOverlap = parseInt(value);
						if (!isNaN(chunkOverlap) && chunkOverlap >= 0) {
							this.plugin.settings.chunkOverlap = chunkOverlap;
							await this.plugin.saveSettings();
						} else {
							new Notice(
								"Invalid chunk overlap. Please enter a non-negative number."
							);
						}
					})
			);

		new Setting(this.containerEl)
			.setName("Separators")
			.setDesc("The separators to use when splitting text into chunks.")
			.addTextArea((text) =>
				text
					.setPlaceholder('["\n\n", "\n", ".", "?", "!", " ", ""]')
					.setValue(JSON.stringify(this.plugin.settings.separators))
					.onChange(async (value) => {
						try {
							const separators = JSON.parse(value);
							if (
								Array.isArray(separators) &&
								separators.every((s) => typeof s === "string")
							) {
								this.plugin.settings.separators = separators;
								await this.plugin.saveSettings();
							} else {
								new Notice(
									"Invalid separators. Please enter a valid JSON array of strings."
								);
							}
						} catch (e) {
							new Notice(
								"Invalid separators. Please enter a valid JSON array."
							);
						}
					})
			);

		new Setting(containerEl)
			.setName("Dangerous Zone")
			.setHeading()
			.setClass("dangerous-zone");

		new Setting(containerEl)
			.setName("Index Vault")
			.setDesc(
				"Rebuild the vector store by re-indexing all files in the vault. WARNING: This operation is very time consuming and expensive."
			)
			.addButton((button) => {
				button.setButtonText("Re-index Vault").onClick(async () => {
					new Notice("Re-indexing vault...");
					try {
						await this.indexVaultCommand(this.plugin);
						new Notice("Vault re-indexed successfully.");
					} catch (error: any) {
						new Notice(`Error re-indexing vault: ${error.message}`);
					}
				});
			});
	}

	async verifyConnection(): Promise<boolean> {
		const apiKey = this.plugin.settings.apiKey;
		const modelProviderUrl = this.plugin.settings.modelProviderUrl;
		const embeddingModel = this.plugin.settings.embeddingModel;

		if (!apiKey) {
			new Notice("Please provide an API key.");
			return false;
		}

		try {
			const openai = new OpenAI({
				apiKey: apiKey,
				baseURL: modelProviderUrl,
				dangerouslyAllowBrowser: true,
			});

			await openai.embeddings.create({
				input: "This is a test.",
				model: embeddingModel,
			});

			return true;
		} catch (error: any) {
			new Notice(`Connection verification failed: ${error.message}`);
			return false;
		}
	}
}
