import { App, Notice } from "obsidian";
import ObsidianMCPServer from "../../main"; // Adjust path as needed
import { MCPServer } from "../mcp-server"; // Import MCPServer type

export async function saveOramaDbCommand(
	plugin: ObsidianMCPServer,
	serverInstance?: MCPServer // Accept server instance directly
): Promise<void> {
	// Use the passed serverInstance
	if (!serverInstance) {
		new Notice("MCP Server is not running.");
		return;
	}

	// Check if the MCPServer instance has the triggerSaveDb method
	if (typeof serverInstance.triggerSaveDb !== "function") {
		new Notice(
			"MCP Server instance does not have the triggerSaveDb method."
		);
		console.error("MCP Server instance:", serverInstance);
		return;
	}

	try {
		// Use the method on the passed server instance
		await serverInstance.triggerSaveDb();
		// Notice is already shown in triggerSaveDb, no need to repeat unless desired
		// new Notice("Orama DB saved manually.");
	} catch (error: any) {
		// triggerSaveDb already logs errors and shows a notice
		console.error("Error executing save Orama DB command wrapper:", error);
	}
}
