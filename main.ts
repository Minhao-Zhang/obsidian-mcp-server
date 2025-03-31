import { App, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { MCPServer } from "./src/mcp-server";
import OpenAI from "openai";

interface ObsidianMCPServerPluginSettings {
	port: number;
	startOnStartup: boolean;
	modelProviderUrl: string;
	embeddingModel: string;
	apiKey: string;
}

const DEFAULT_SETTINGS: ObsidianMCPServerPluginSettings = {
	port: 8080,
	startOnStartup: false,
	modelProviderUrl: "https://api.openai.com/v1",
	embeddingModel: "text-embedding-ada-002",
	apiKey: "sk_your_api_key",
};

export default class ObsidianMCPServer extends Plugin {
	settings: ObsidianMCPServerPluginSettings;
	private mcpServer?: MCPServer;

	async onload() {
		await this.loadSettings();

		// Start MCP server if startOnStartup is enabled
		if (this.settings.startOnStartup) {
			console.log("Autostart is enabled");
			this.startMCPServer();
		}

		// Add command to start MCP server
		this.addCommand({
			id: "start-mcp-server",
			name: "Start MCP Server",
			callback: () => {
				this.startMCPServer();
			},
		});

		// Add command to stop MCP server
		this.addCommand({
			id: "stop-mcp-server",
			name: "Stop MCP Server",
			callback: () => {
				this.stopMCPServer();
			},
		});

		// Add ribbon icon
		const ribbonIconEl = this.addRibbonIcon(
			"server",
			"MCP Server",
			(evt: MouseEvent) => {
				new Notice("MCP Server is running");
			}
		);
		ribbonIconEl.addClass("mcp-server-ribbon-class");

		// Add settings tab
		this.addSettingTab(new ObsidianMCPServerSettingTab(this.app, this));
	}

	onunload() {
		// Clean up if needed
		this.stopMCPServer();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private startMCPServer() {
		this.mcpServer = new MCPServer(this.app, this.settings.port);
		this.mcpServer.start();
		new Notice("MCP Server started");
	}

	private stopMCPServer() {
		if (this.mcpServer) {
			this.mcpServer.stop();
			this.mcpServer = undefined;
			new Notice("MCP Server stopped");
		}
	}
}

class ObsidianMCPServerSettingTab extends PluginSettingTab {
	plugin: ObsidianMCPServer;

	constructor(app: App, plugin: ObsidianMCPServer) {
		super(app, plugin);
		this.plugin = plugin;
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
				dangerouslyAllowBrowser: true, // Required to use OpenAI SDK in a browser environment
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
