import { App, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { MCPServer } from "./src/mcp-server";

interface ObsidianMCPServerPluginSettings {
	port: number;
	startOnStartup: boolean;
}

const DEFAULT_SETTINGS: ObsidianMCPServerPluginSettings = {
	port: 8080,
	startOnStartup: false,
};

export default class ObsidianMCPServer extends Plugin {
	settings: ObsidianMCPServerPluginSettings;
	private mcpServer?: MCPServer;

	async onload() {
		await this.loadSettings();

		// Start MCP server if startOnStartup is enabled
		if (this.settings.startOnStartup) {
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
		if (!this.mcpServer) {
			this.mcpServer = new MCPServer(this.app, this.settings.port);
			this.mcpServer.start();
			new Notice("MCP Server started");
		} else {
			new Notice("MCP Server is already running");
		}
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
			.setName("Start MCP Server on startup")
			.setDesc("Start the MCP server when Obsidian starts.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.startOnStartup)
					.onChange(async (value) => {
						this.plugin.settings.startOnStartup = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
