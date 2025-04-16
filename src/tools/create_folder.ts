import { App, Notice, normalizePath } from "obsidian";

type TFunction = (key: string, params?: Record<string, string>) => string;

export async function createFolderTool(
	app: App,
	relativePath: string
): Promise<string> {
	try {
		const pathParts = relativePath.split("/");
		let currentPath = "";

		for (let i = 0; i < pathParts.length; i++) {
			currentPath += pathParts[i] + "/";
			const folderPath = currentPath.slice(0, -1); // Remove trailing slash
			try {
				await app.vault.createFolder(folderPath);
			} catch (error: any) {
				// Ignore error if folder already exists
				if (error.message !== "Folder already exists.") {
					console.error("Error creating folder:", error);
					return JSON.stringify({
						error: `Failed to create folder: ${folderPath}. ${error.message}`,
					});
				}
			}
		}

		return JSON.stringify({ success: "Folder created successfully." });
	} catch (error: any) {
		console.error("Error creating folder:", error);
		return JSON.stringify({
			error: `Failed to create folder: ${relativePath}. ${error.message}`,
		});
	}
}
