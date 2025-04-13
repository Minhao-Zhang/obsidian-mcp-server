import { App, normalizePath } from "obsidian";

export async function createFileTool(
	app: App,
	relativePath: string,
	content: string
): Promise<string> {
	if (relativePath === "") {
		return JSON.stringify({ error: "File path cannot be empty." });
	}

	const normalizedPath = normalizePath(relativePath);

	try {
		const existingFile = app.vault.getAbstractFileByPath(normalizedPath);
		if (existingFile) {
			return JSON.stringify({ error: "File already exists." });
		} else {
			await app.vault.create(normalizedPath, content);
			return JSON.stringify({ success: "File created successfully." });
		}
	} catch (error) {
		console.error("Error writing file:", error);
		return JSON.stringify({
			error: "Failed to create file. See console for details.",
		});
	}
}
