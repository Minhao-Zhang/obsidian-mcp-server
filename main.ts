import { Notice, Plugin } from "obsidian";
import { MCPServer } from "./src/mcp-server.js";
import { stopOramaPersistence, saveDatabase } from "./src/orama-db.js";
import { initializeOramaDbCommand } from "./src/commands/initializeOramaDbCommand.js";
import { saveOramaDbCommand } from "./src/commands/saveOramaDbCommand.js";
import { indexVaultCommand } from "./src/commands/indexVaultCommand";
import {
	ObsidianMCPServerPluginSettings,
	DEFAULT_SETTINGS,
	ObsidianMCPServerSettingTab,
} from "./src/settings";

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

		// Add command to initialize Orama DB
		this.addCommand({
			id: "init-orama-db",
			name: "Initialize Orama DB",
			callback: () => initializeOramaDbCommand(this),
		});

		// Add command to manually save Orama DB
		this.addCommand({
			id: "save-orama-db",
			name: "Save Orama DB Manually",
			callback: () => saveOramaDbCommand(this),
		});

		// Add command to index all files
		this.addCommand({
			id: "index-vault",
			name: "Index All Files.",
			callback: () => indexVaultCommand(this),
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

	async onunload() {
		// Clean up if needed
		this.stopMCPServer();
		stopOramaPersistence();

		// Trigger a final save on unload
		const pluginDataDir = `${this.app.vault.configDir}/plugins/Obsidian-MCP-Server`;
		const filePath = `${pluginDataDir}/orama.msp`;
		await saveDatabase(this.app, filePath);
		console.log("Orama database saved on unload.");
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
		this.mcpServer = new MCPServer(
			this.app,
			this.settings.port,
			this.settings
		);
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
