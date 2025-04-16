import { App, normalizePath } from "obsidian";
import { createFolderTool } from "./create_folder";

export async function createFileTool(
	app: App,
	relativePath: string,
	content: string
): Promise<string> {
	try {
		const pathParts = relativePath.split("/");
		const filename = pathParts.pop();
		let folderPath = pathParts.join("/");

		// Check if folderPath is empty
		if (folderPath === "") {
			// If folderPath is empty, it means the file is in the root directory
			// So, we can directly create the file
			if (relativePath === "") {
				return JSON.stringify({ error: "File path cannot be empty." });
			}

			const normalizedPath = normalizePath(relativePath);

			try {
				const existingFile =
					app.vault.getAbstractFileByPath(normalizedPath);
				if (existingFile) {
					return JSON.stringify({ error: "File already exists." });
				} else {
					await app.vault.create(normalizedPath, content);
					return JSON.stringify({
						success: "File created successfully.",
					});
				}
			} catch (error) {
				console.error("Error writing file:", error);
				return JSON.stringify({
					error: "Failed to create file. See console for details.",
				});
			}
		}

		// Check if the folder exists
		let folderExists = app.vault.getAbstractFileByPath(folderPath);

		if (!folderExists) {
			// If the folder doesn't exist, create it
			try {
				await createFolderTool(app, folderPath);
				folderExists = app.vault.getAbstractFileByPath(folderPath);
			} catch (error) {
				console.error("Error creating folder:", error);
				return JSON.stringify({
					error: "Failed to create folder. See console for details.",
				});
			}
		}

		// Create the file
		if (relativePath === "") {
			return JSON.stringify({ error: "File path cannot be empty." });
		}

		const normalizedPath = normalizePath(relativePath);

		try {
			const existingFile =
				app.vault.getAbstractFileByPath(normalizedPath);
			if (existingFile) {
				return JSON.stringify({ error: "File already exists." });
			} else {
				await app.vault.create(normalizedPath, content);
				return JSON.stringify({
					success: "File created successfully.",
				});
			}
		} catch (error) {
			console.error("Error writing file:", error);
			return JSON.stringify({
				error: "Failed to create file. See console for details.",
			});
		}
	} catch (error) {
		console.error("Error writing file:", error);
		return JSON.stringify({
			error: "Failed to create file. See console for details.",
		});
	}
}
