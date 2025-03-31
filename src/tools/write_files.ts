import { App, normalizePath } from "obsidian";

export async function writeFileTool(
	app: App,
	relativePath: string,
	content: string
): Promise<string> {
	if (relativePath === "") {
		return JSON.stringify({ error: "File path cannot be empty." });
	}

	const normalizedPath = normalizePath(relativePath);
	const adapter = app.vault.adapter;

	try {
		if (await adapter.exists(normalizedPath)) {
			return JSON.stringify({ error: "File already exists." });
		} else {
			await adapter.write(normalizedPath, content);
			return JSON.stringify({ success: "File created successfully." });
		}
	} catch (error) {
		console.error("Error writing file:", error);
		return JSON.stringify({
			error: "Failed to create file. See console for details.",
		});
	}
}
