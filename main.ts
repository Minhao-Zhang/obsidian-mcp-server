import { Notice, Plugin, getLanguage } from "obsidian";
import type { App } from "obsidian";

interface Translation {
	commands: Record<string, string>;
	notices: Record<string, string>;
	ribbonTooltip: string;
	serverStatus: {
		running: string;
		stopped: string;
	};
	[key: string]: any; // Index signature for dynamic access
}

interface Translations {
	en: Translation;
	zh?: Translation;
}
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
	private mcpServer?: MCPServer;
	private translations: Translations = { en: {} as Translation };
	private currentLanguage = "en";

	async loadTranslations() {
		const lang = getLanguage() || "en";
		this.currentLanguage = ["en", "zh"].includes(lang) ? lang : "en";

		try {
			const enTranslations: Translation = (
				await import("./locales/en.json")
			).default;
			this.translations.en = enTranslations;

			if (this.currentLanguage === "zh") {
				const zhTranslations: Translation = (
					await import("./locales/zh.json")
				).default;
				this.translations.zh = zhTranslations;
			}
		} catch (error) {
			console.error("Failed to load translations:", error);
		}
	}

	// Updated t function to handle nested keys (e.g., "commands.start-mcp-server")
	t(key: string, params: Record<string, string> = {}): string {
		const keys = key.split(".");

		const findTranslation = (
			langTranslations: Translation | undefined
		): string | undefined => {
			if (!langTranslations) return undefined;
			let current: any = langTranslations;
			for (const k of keys) {
				if (current && typeof current === "object" && k in current) {
					current = current[k];
				} else {
					return undefined; // Key path not found
				}
			}
			return typeof current === "string" ? current : undefined; // Return only if the final value is a string
		};

		const lang = this.currentLanguage as keyof Translations;
		let translation = findTranslation(this.translations[lang]);

		// Fallback to English if translation not found in current language
		if (translation === undefined && lang !== "en") {
			translation = findTranslation(this.translations.en);
		}

		// Fallback to the key itself if not found in English either
		translation = translation ?? key;

		// Replace parameters
		return Object.entries(params).reduce(
			(str, [k, v]) => str.replace(`{${k}}`, v),
			translation
		);
	}

	async onload() {
		await this.loadSettings();
		await this.loadTranslations();

		// Start MCP server if startOnStartup is enabled
		if (this.settings.startOnStartup) {
			this.startMCPServer(); // This initializes this.mcpServer
		}

		// Add command to start MCP server
		this.addCommand({
			id: "start-mcp-server",
			name: this.t("commands.start-mcp-server"),
			callback: () => {
				if (!this.mcpServer) {
					this.startMCPServer();
				} else {
					new Notice(this.t("notices.serverAlreadyRunning"));
				}
			},
		});

		// Add command to stop MCP server
		this.addCommand({
			id: "stop-mcp-server",
			name: this.t("commands.stop-mcp-server"),
			callback: () => {
				this.stopMCPServer();
			},
		});

		// Command to trigger re-indexing
		this.addCommand({
			id: "index-vault", // New command ID
			name: this.t("commands.index-vault"),
			callback: () => {
				if (!this.mcpServer) {
					new Notice(this.t("notices.serverNotRunning"));
					return;
				}
				// Call the standalone command function, passing the plugin instance and the server instance
				indexVaultCommand(this, this.mcpServer).catch((error) => {
					console.error(
						"Error during index vault command execution:",
						error
					);
					new Notice(
						this.t("notices.indexingError", {
							error: error.message,
						})
					);
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
			name: this.t("commands.save-orama-db"),
			callback: () => {
				if (!this.mcpServer) {
					new Notice(this.t("notices.cannotSaveDb"));
					return;
				}
				// Call the save function directly or a method on the server if preferred
				saveOramaDbCommand(this); // Assuming this uses the global DB instance
			},
		});

		// Add ribbon icon (maybe make it indicate server status?)
		const ribbonIconEl = this.addRibbonIcon(
			"server", // Use a relevant icon
			this.t("ribbonTooltip"),
			(evt: MouseEvent) => {
				// Show status on click
				if (this.mcpServer) {
					new Notice(this.t("notices.serverRunning"));
					// Optionally trigger status check or open settings
				} else {
					new Notice(this.t("serverStatus.stopped"));
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
						new Notice(this.t("notices.serverNotRunning"));
						return;
					}
					indexVaultCommand(this, this.mcpServer).catch((error) => {
						console.error(
							"Error during index vault command execution from settings:",
							error
						);
						new Notice(
							this.t("notices.indexingError", {
								error: error.message,
							})
						);
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
			new Notice(this.t("notices.serverAlreadyRunning"));
			return;
		}

		try {
			this.mcpServer = new MCPServer(
				this.app,
				this.settings.port,
				this.settings,
				this.t.bind(this) // Pass the translation function
			);
			this.mcpServer.start(); // Start listening
			new Notice(
				this.t("notices.serverStarted", {
					port: this.settings.port.toString(),
				})
			);
		} catch (error) {
			console.error("Failed to start MCP Server:", error);
			new Notice(
				this.t("notices.serverStartFailed", { error: error.message })
			);
			this.mcpServer = undefined; // Ensure it's undefined on failure
		}
	}

	private stopMCPServer() {
		if (this.mcpServer) {
			this.mcpServer.stop(); // This should handle closing DB etc.
			this.mcpServer = undefined;
			new Notice(this.t("notices.serverStopped"));
		} else {
			new Notice(this.t("notices.serverAlreadyStopped")); // Optional notice
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
