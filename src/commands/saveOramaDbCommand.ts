import { App, Notice } from "obsidian";
import ObsidianMCPServer from "../../main"; // Adjust path as needed

export async function saveOramaDbCommand(
	plugin: ObsidianMCPServer
): Promise<void> {
	const mcpServerInstance = (plugin as any).mcpServer; // Access the potentially private mcpServer

	if (!mcpServerInstance) {
		new Notice("MCP Server is not running.");
		return;
	}

	// Check if the MCPServer instance has the triggerSaveDb method
	if (typeof mcpServerInstance.triggerSaveDb !== "function") {
		new Notice(
			"MCP Server instance does not have the triggerSaveDb method."
		);
		console.error("MCP Server instance:", mcpServerInstance);
		return;
	}

	try {
		// Use the existing method on the server instance
		await mcpServerInstance.triggerSaveDb();
		new Notice("Orama DB saved manually."); // Provide feedback as the original command did
	} catch (error: any) {
		// The triggerSaveDb method already logs errors and shows a notice,
		// but we can add another log here for clarity if needed.
		console.error("Error executing save Orama DB command:", error);
		// Optionally, show another notice, though triggerSaveDb might already do it.
		// new Notice(`Error saving Orama DB via command: ${error.message}`);
	}
}
