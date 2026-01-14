import ObsidianMCPServer from "main";
import {
	App,
	PluginSettingTab,
	Setting,
	TextAreaComponent,
	ButtonComponent,
	Notice,
	TFile,
} from "obsidian";
import OpenAI from "openai";

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
	tools: {
		simple_vector_search: boolean;
		count_entries: boolean;
		list_files: boolean;
		read_file: boolean;
		create_file: boolean;
		create_link: boolean;
		edit_file: boolean;
		delete_file: boolean;
		create_folder: boolean;
		delete_folder: boolean;
	};
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
	tools: {
		simple_vector_search: true,
		count_entries: true,
		list_files: true,
		read_file: true,
		create_file: true,
		create_link: true,
		edit_file: true,
		delete_file: true,
		create_folder: true,
		delete_folder: true,
	},
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

		new Setting(containerEl)
			.setName(this.plugin.t("settings.port.name"))
			.setDesc(this.plugin.t("settings.port.desc"))
			.addText((text) =>
				text
					.setPlaceholder("8080") // Placeholder doesn't usually need translation
					.setValue(this.plugin.settings.port.toString())
					.onChange(async (value) => {
						const port = parseInt(value);
						if (!isNaN(port) && port > 0 && port < 65536) {
							this.plugin.settings.port = port;
							await this.plugin.saveSettings();
						} else {
							new Notice(
								this.plugin.t("settings.notices.invalidPort")
							);
						}
					})
			);

		new Setting(containerEl)
			.setName(this.plugin.t("settings.autoStart.name"))
			.setDesc(this.plugin.t("settings.autoStart.desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.startOnStartup)
					.onChange(async (value) => {
						this.plugin.settings.startOnStartup = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(this.plugin.t("settings.mcpEndpoint.name"))
			.setDesc(`http://localhost:${this.plugin.settings.port}/sse`) // URL itself is not translated
			.addButton((button) => {
				button
					.setButtonText(this.plugin.t("settings.buttons.copy"))
					.onClick(() => {
						navigator.clipboard.writeText(
							`http://localhost:${this.plugin.settings.port}/sse`
						);
						new Notice(
							this.plugin.t("settings.notices.endpointCopied")
						);
					});
			});

		new Setting(containerEl)
			.setName(this.plugin.t("settings.embeddingModel.heading"))
			.setHeading();

		new Setting(containerEl)
			.setName(this.plugin.t("settings.modelProviderUrl.name"))
			.setDesc(this.plugin.t("settings.modelProviderUrl.desc"))
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
			.setName(this.plugin.t("settings.embeddingModel.name"))
			.setDesc(this.plugin.t("settings.embeddingModel.desc"))
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
			.setName(this.plugin.t("settings.apiKey.name"))
			.setDesc(this.plugin.t("settings.apiKey.desc"))
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
			button
				.setButtonText(
					this.plugin.t("settings.buttons.verifyConnection")
				)
				.onClick(async () => {
					try {
						const isValid = await this.verifyConnection();
						if (isValid) {
							new Notice(
								this.plugin.t(
									"settings.notices.connectionVerified"
								)
							);
						}
						// Error handled within verifyConnection
					} catch (error: any) {
						// This catch might be redundant if verifyConnection handles notices
						new Notice(
							this.plugin.t("settings.notices.connectionError", {
								error: error.message,
							})
						);
					}
				});
		});

		new Setting(containerEl)
			.setName(this.plugin.t("settings.vectorStore.heading"))
			.setHeading();

		new Setting(containerEl)
			.setName(this.plugin.t("settings.excludeFiles.name"))
			.setDesc(this.plugin.t("settings.excludeFiles.desc"));

		const fullWidthContainer = containerEl.createDiv({
			cls: "mcp-full-width-container",
		});

		const textAreaContainer = fullWidthContainer.createDiv();
		const textArea = new TextAreaComponent(textAreaContainer)
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
			.setValue(this.plugin.settings.ignorePatterns)
			.onChange(async (value: string) => {
				this.plugin.settings.ignorePatterns = value;
				await this.plugin.saveSettings();
			});
		const ignorePatternsTextArea: TextAreaComponent = textArea;

		const buttonRow = fullWidthContainer.createDiv({
			cls: "mcp-button-row",
		});

		new ButtonComponent(buttonRow)
			.setButtonText(this.plugin.t("settings.buttons.copyGitignore"))
			.onClick(async () => {
				try {
					const gitignoreAbstractFile =
						this.app.vault.getAbstractFileByPath(".gitignore");
					if (gitignoreAbstractFile instanceof TFile) {
						const gitignoreContent = await this.app.vault.read(
							gitignoreAbstractFile
						);
						ignorePatternsTextArea.setValue(gitignoreContent);
						this.plugin.settings.ignorePatterns = gitignoreContent;
						await this.plugin.saveSettings();
						new Notice(
							this.plugin.t("settings.notices.gitignoreCopied")
						);
					} else {
						new Notice(
							this.plugin.t("settings.notices.gitignoreReadError")
						);
						console.error(".gitignore is not a file");
					}
				} catch (error) {
					new Notice(
						this.plugin.t("settings.notices.gitignoreReadError")
					);
					console.error("Error reading .gitignore:", error.message);
				}
			});

		const countSetting = new Setting(containerEl)
			.setName(this.plugin.t("settings.storedChunks.name"))
			.setDesc(this.plugin.t("settings.storedChunks.loading"));

		// Use the new public method to get the count
		this.plugin
			.getDbCount()
			.then((count) => {
				if (count !== null) {
					countSetting.setDesc(
						this.plugin.t("settings.storedChunks.loaded", {
							count: count.toString(),
						})
					);
				} else {
					countSetting.setDesc(
						this.plugin.t("settings.storedChunks.notRunning")
					);
				}
			})
			.catch((error) => {
				console.error(
					"Error getting Orama DB count via plugin method:",
					error
				);
				countSetting.setDesc(
					this.plugin.t("settings.storedChunks.errorLoading")
				);
				new Notice(
					this.plugin.t("settings.notices.chunkCountError", {
						error: error.message,
					})
				);
			});

		new Setting(this.containerEl)
			.setName(this.plugin.t("settings.chunking.heading"))
			.setHeading();

		new Setting(this.containerEl)
			.setName(this.plugin.t("settings.chunkSize.name"))
			.setDesc(this.plugin.t("settings.chunkSize.desc"))
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
								this.plugin.t(
									"settings.notices.invalidChunkSize"
								)
							);
						}
					})
			);

		new Setting(this.containerEl)
			.setName(this.plugin.t("settings.chunkOverlap.name"))
			.setDesc(this.plugin.t("settings.chunkOverlap.desc"))
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
								this.plugin.t(
									"settings.notices.invalidChunkOverlap"
								)
							);
						}
					})
			);

		new Setting(this.containerEl)
			.setName(this.plugin.t("settings.separators.name"))
			.setDesc(this.plugin.t("settings.separators.desc"))
			.addTextArea((text) =>
				text
					.setPlaceholder('["\n\n", "\n", ".", "?", "!", " ", ""]')
					.setValue(JSON.stringify(this.plugin.settings.separators))
					.onChange(async (value) => {
						try {
							const trimmedValue = value.trim();
							const separators = JSON.parse(trimmedValue);
							if (
								Array.isArray(separators) &&
								separators.every((s) => typeof s === "string")
							) {
								this.plugin.settings.separators = separators;
								await this.plugin.saveSettings();
							} else {
								new Notice(
									this.plugin.t(
										"settings.notices.invalidSeparatorsJson"
									)
								);
							}
						} catch (e: any) {
							new Notice(
								this.plugin.t(
									"settings.notices.invalidSeparatorsFormat",
									{
										error: e.message,
									}
								)
							);
						}
					})
			);

		new Setting(containerEl)
			.setName(this.plugin.t("settings.dangerousZone.heading"))
			.setHeading()
			.setClass("dangerous-zone"); // Keep class for styling

		new Setting(containerEl)
			.setName(this.plugin.t("settings.indexVault.name"))
			.setDesc(this.plugin.t("settings.indexVault.desc"))
			.addButton((button) => {
				button
					.setButtonText(this.plugin.t("settings.buttons.reindex"))
					.onClick(async () => {
						new Notice(
							this.plugin.t("settings.notices.reindexingStarted")
						);
						try {
							// Assuming indexVaultCommand is passed correctly and handles its own notices/errors
							await this.indexVaultCommand(); // Removed 'this.plugin' if not needed by the passed function
							// Success notice might be better handled within indexVaultCommand if it's async
							new Notice(
								this.plugin.t(
									"settings.notices.reindexingSuccess"
								)
							);
						} catch (error: any) {
							new Notice(
								this.plugin.t(
									"settings.notices.reindexingError",
									{
										error: error.message,
									}
								)
							);
						}
					});
			});

		// Add MCP Tools settings at the end
		const mcpToolsHeader = containerEl.createEl("h2", {
			text: "▶ " + this.plugin.t("settings.tools.heading"), // Start collapsed
		});

		// Create the wrapper div
		const mcpToolsSection = containerEl.createDiv({
			cls: "mcp-tools-section",
		});
		mcpToolsSection.style.display = "none"; // Start collapsed explicitly

		// --- Add Restart Server Button INSIDE Collapsible Section ---
		new Setting(mcpToolsSection) // Target the mcpToolsSection now
			.setName(this.plugin.t("settings.buttons.restartHint"))
			.addButton((button) => {
				button
					.setButtonText(
						this.plugin.t("settings.buttons.restartMCPServer")
					)
					.onClick(async () => {
						try {
							await (this.plugin as any).restartMCPServer();
							new Notice(
								this.plugin.t("settings.notices.restartSuccess")
							); // Use translation
						} catch (error: any) {
							console.error("MCP Server restart error:", error); // Log the full error
							new Notice(
								this.plugin.t("settings.notices.restartError", {
									error: error?.message || String(error),
								}) // Use translation and provide error message
							);
						}
					});
			});

		// Vector search setting
		new Setting(mcpToolsSection) // Add directly to mcpToolsSection
			.setName("simple_vector_search")
			.setDesc(this.plugin.t("settings.tools.simple_vector_search"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.tools.simple_vector_search)
					.onChange(async (value) => {
						this.plugin.settings.tools.simple_vector_search = value;
						await this.plugin.saveSettings();
					})
			);

		// Count entries setting
		new Setting(mcpToolsSection) // Add directly to mcpToolsSection
			.setName("count_entries")
			.setDesc(this.plugin.t("settings.tools.count_entries"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.tools.count_entries)
					.onChange(async (value) => {
						this.plugin.settings.tools.count_entries = value;
						await this.plugin.saveSettings();
					})
			);

		// --- Click Handler for Toggling the Entire Section ---
		mcpToolsHeader.addEventListener("click", () => {
			// Toggle the 'is-expanded' class and check if it's now present
			const isNowExpanded =
				mcpToolsSection.classList.toggle("is-expanded");

			// Update the header text based on the new state
			if (isNowExpanded) {
				mcpToolsHeader.textContent =
					"▼ " + this.plugin.t("settings.tools.heading");
			} else {
				mcpToolsHeader.textContent =
					"▶ " + this.plugin.t("settings.tools.heading");
			}
		});

		// --- Add remaining settings directly to the section ---
		new Setting(mcpToolsSection) // Already correctly added
			.setName("list_files")
			.setDesc(this.plugin.t("settings.tools.list_files"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.tools.list_files)
					.onChange(async (value) => {
						this.plugin.settings.tools.list_files = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(mcpToolsSection)
			.setName("read_file")
			.setDesc(this.plugin.t("settings.tools.read_file"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.tools.read_file)
					.onChange(async (value) => {
						this.plugin.settings.tools.read_file = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(mcpToolsSection)
			.setName("create_file")
			.setDesc(this.plugin.t("settings.tools.create_file"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.tools.create_file)
					.onChange(async (value) => {
						this.plugin.settings.tools.create_file = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(mcpToolsSection)
			.setName("create_link")
			.setDesc(this.plugin.t("settings.tools.create_link"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.tools.create_link)
					.onChange(async (value) => {
						this.plugin.settings.tools.create_link = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(mcpToolsSection)
			.setName("edit_file")
			.setDesc(this.plugin.t("settings.tools.edit_file"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.tools.edit_file)
					.onChange(async (value) => {
						this.plugin.settings.tools.edit_file = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(mcpToolsSection)
			.setName("delete_file")
			.setDesc(this.plugin.t("settings.tools.delete_file"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.tools.delete_file)
					.onChange(async (value) => {
						this.plugin.settings.tools.delete_file = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(mcpToolsSection)
			.setName("create_folder")
			.setDesc(this.plugin.t("settings.tools.create_folder"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.tools.create_folder)
					.onChange(async (value) => {
						this.plugin.settings.tools.create_folder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(mcpToolsSection)
			.setName("delete_folder")
			.setDesc(this.plugin.t("settings.tools.delete_folder"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.tools.delete_folder)
					.onChange(async (value) => {
						this.plugin.settings.tools.delete_folder = value;
						await this.plugin.saveSettings();
					})
			);

		mcpToolsHeader.addEventListener("click", () => {
			mcpToolsSection.style.display =
				mcpToolsSection.style.display === "none" ? "block" : "none";
		});
	}

	async verifyConnection(): Promise<boolean> {
		const apiKey = this.plugin.settings.apiKey;
		const modelProviderUrl = this.plugin.settings.modelProviderUrl;
		const embeddingModel = this.plugin.settings.embeddingModel;

		if (!apiKey || apiKey === "sk_your_api_key") {
			// Added check for default key
			new Notice(this.plugin.t("settings.notices.apiKeyRequired"));
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
			new Notice(
				this.plugin.t("settings.notices.connectionVerifyFailed", {
					error: error.message,
				})
			);
			return false;
		}
	}
}
