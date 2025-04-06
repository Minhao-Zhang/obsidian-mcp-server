import { Notice, Plugin } from "obsidian";
import { MCPServer } from "./src/mcp-server.js"; // Ensure MCPServer is imported
import { saveOramaDbCommand } from "./src/commands/saveOramaDbCommand.js";
// Import the command function itself
import { indexVaultCommand } from "./src/commands/indexVaultCommand";
import {
	ObsidianMCPServerPluginSettings,
	DEFAULT_SETTINGS,
	ObsidianMCPServerSettingTab,
} from "./src/settings";

export default class ObsidianMCPServer extends Plugin {
	settings: ObsidianMCPServerPluginSettings;
	// Make mcpServer potentially public or add a getter if needed by settings tab directly
	// but passing via callback is safer.
	private mcpServer?: MCPServer;

	async onload() {
		await this.loadSettings();

		// Start MCP server if startOnStartup is enabled
		if (this.settings.startOnStartup) {
			this.startMCPServer(); // This initializes this.mcpServer
		}

		// Add command to start MCP server
		this.addCommand({
			id: "start-mcp-server",
			name: "Start Server",
			callback: () => {
				if (!this.mcpServer) {
					this.startMCPServer();
				} else {
					new Notice("MCP Server is already running.");
				}
			},
		});

		// Add command to stop MCP server
		this.addCommand({
			id: "stop-mcp-server",
			name: "Stop Server",
			callback: () => {
				this.stopMCPServer();
			},
		});

		// Command to trigger re-indexing
		this.addCommand({
			id: "index-vault", // New command ID
			name: "Re-index Vault", // New command name
			callback: () => {
				if (!this.mcpServer) {
					new Notice(
						"MCP Server is not running. Please start it first."
					);
					return;
				}
				// Call the standalone command function, passing the plugin instance and the server instance
				indexVaultCommand(this, this.mcpServer).catch((error) => {
					console.error(
						"Error during index vault command execution:",
						error
					);
					new Notice(`Error during indexing: ${error.message}`);
				});
			},
		});

		// Remove the old init-orama-db command if index-vault replaces its functionality
		// this.addCommand({
		// 	id: "init-orama-db",
		// 	name: "Initialize Orama DB",
		// 	callback: () => initializeOramaDbCommand(this),
		// });

		// Add command to manually save Orama DB (might still be useful for debugging)
		this.addCommand({
			id: "save-orama-db",
			name: "Save Vector Database Manually",
			callback: () => {
				if (!this.mcpServer) {
					new Notice("MCP Server is not running. Cannot save DB.");
					return;
				}
				// Call the save function directly or a method on the server if preferred
				saveOramaDbCommand(this); // Assuming this uses the global DB instance
			},
		});

		// Add ribbon icon (maybe make it indicate server status?)
		const ribbonIconEl = this.addRibbonIcon(
			"server", // Use a relevant icon
			"MCP Server Status", // Tooltip
			(evt: MouseEvent) => {
				// Show status on click
				if (this.mcpServer) {
					new Notice("MCP Server is running.");
					// Optionally trigger status check or open settings
				} else {
					new Notice(
						"MCP Server is stopped. Click Start command or enable autostart."
					);
				}
			}
		);
		ribbonIconEl.addClass("mcp-server-ribbon-class");

		// Add settings tab
		// Pass a lambda function that calls indexVaultCommand with the current server instance
		this.addSettingTab(
			new ObsidianMCPServerSettingTab(
				this.app,
				this,
				// Callback function for the re-index button in settings
				() => {
					if (!this.mcpServer) {
						new Notice(
							"MCP Server is not running. Please start it first."
						);
						return;
					}
					indexVaultCommand(this, this.mcpServer).catch((error) => {
						console.error(
							"Error during index vault command execution from settings:",
							error
						);
						new Notice(`Error during indexing: ${error.message}`);
					});
				}
			)
		);
	}

	async onunload() {
		// Clean up
		this.stopMCPServer(); // Stops server and closes DB via server's stop method
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
		// Potentially restart server if port changed? Or notify user.
	}

	// Renamed for clarity, ensures only one server instance runs
	private startMCPServer() {
		if (this.mcpServer) {
			new Notice("MCP Server is already running.");
			return;
		}

		try {
			this.mcpServer = new MCPServer(
				this.app,
				this.settings.port,
				this.settings
			);
			this.mcpServer.start(); // Start listening
			new Notice(`MCP Server started on port ${this.settings.port}`);
		} catch (error) {
			console.error("Failed to start MCP Server:", error);
			new Notice(`Failed to start MCP Server: ${error.message}`);
			this.mcpServer = undefined; // Ensure it's undefined on failure
		}
	}

	private stopMCPServer() {
		if (this.mcpServer) {
			this.mcpServer.stop(); // This should handle closing DB etc.
			this.mcpServer = undefined;
			new Notice("MCP Server stopped");
		} else {
			new Notice("MCP Server is already stopped."); // Optional notice
		}
	}

	// Public method for settings tab to safely get the DB count
	async getDbCount(): Promise<number | null> {
		if (this.mcpServer) {
			return await this.mcpServer.getOramaDbCount();
		}
		return null; // Return null if server isn't running
	}
}
