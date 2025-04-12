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
		textArea.onChange(async (value: string) => {
			this.plugin.settings.ignorePatterns = value;
			await this.plugin.saveSettings();
		});

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
