import { App, Notice } from "obsidian";
import ObsidianMCPServer from "../../main"; // Adjust path as needed

export async function initializeOramaDbCommand(
	plugin: ObsidianMCPServer
): Promise<void> {
	const mcpServerInstance = (plugin as any).mcpServer; // Access the potentially private mcpServer

	if (!mcpServerInstance) {
		new Notice(
			"MCP Server is not running. Please start the MCP Server first."
		);
		return;
	}

	// Check if the MCPServer instance has the initializeOramaDB method
	if (typeof mcpServerInstance.initializeOramaDB !== "function") {
		new Notice(
			"MCP Server instance does not have the initializeOramaDB method."
		);
		console.error("MCP Server instance:", mcpServerInstance);
		return;
	}

	try {
		// We expect initializeOramaDB to be part of the mcpServerInstance
		await mcpServerInstance.initializeOramaDB();
		new Notice("Orama DB initialized");
	} catch (error: any) {
		console.error("Error initializing Orama DB via command:", error);
		new Notice(`Error initializing Orama DB: ${error.message}`);
	}
}
