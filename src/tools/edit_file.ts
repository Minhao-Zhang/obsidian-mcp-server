import { App, TFile, normalizePath } from "obsidian";
import { z } from "zod";

// Define the schema for the tool's parameters using Zod
export const editFileParametersSchema = z.object({
	relative_path: z
		.string()
		.describe("Relative path to the file within the Obsidian vault."),
	start_line: z
		.number()
		.int()
		.min(1)
		.describe(
			"The 1-based starting line number of the content to replace."
		),
	end_line: z
		.number()
		.int()
		.min(1)
		.describe(
			"The 1-based ending line number (inclusive) of the content to replace."
		),
	new_content: z
		.string()
		.describe("The new content to insert in place of the specified lines."),
});

// Type alias for the validated parameters
export type EditFileParameters = z.infer<typeof editFileParametersSchema>;

/**
 * Edits a specific range of lines within a file in the Obsidian vault.
 *
 * @param app - The Obsidian App instance.
 * @param params - The validated parameters including path, lines, and new content.
 * @returns A JSON string indicating success or failure.
 */
export async function editFileTool(
	app: App,
	params: EditFileParameters
): Promise<string> {
	const { relative_path, start_line, end_line, new_content } = params;

	if (start_line > end_line) {
		return JSON.stringify({
			error: `Start line (${start_line}) cannot be greater than end line (${end_line}).`,
		});
	}

	const normalizedPath = normalizePath(relative_path);
	const file = app.vault.getAbstractFileByPath(normalizedPath);

	if (!file) {
		return JSON.stringify({ error: `File not found: ${normalizedPath}` });
	}

	if (!(file instanceof TFile)) {
		return JSON.stringify({
			error: `Path is a folder, not a file: ${normalizedPath}`,
		});
	}

	try {
		const currentContent = await app.vault.read(file);
		const lines = currentContent.split(/\r?\n/); // Split by newline, handling CRLF and LF

		// Adjust to 0-based index for array manipulation
		const startIndex = start_line - 1;
		const endIndex = end_line - 1; // Inclusive end index for slicing

		if (startIndex < 0 || startIndex >= lines.length) {
			return JSON.stringify({
				error: `Start line (${start_line}) is out of bounds for file with ${lines.length} lines.`,
			});
		}
		// Allow endIndex to be equal to lines.length if replacing up to the very end
		if (endIndex < 0 || endIndex >= lines.length) {
			return JSON.stringify({
				error: `End line (${end_line}) is out of bounds for file with ${lines.length} lines.`,
			});
		}

		// Construct the new content
		const linesBefore = lines.slice(0, startIndex);
		const linesAfter = lines.slice(endIndex + 1); // Get lines *after* the replaced block

		// Split new_content into lines as well, in case it's multi-line
		const newContentLines = new_content.split(/\r?\n/);

		const finalLines = [...linesBefore, ...newContentLines, ...linesAfter];
		const finalContent = finalLines.join("\n"); // Join with standard LF

		await app.vault.modify(file, finalContent);

		return JSON.stringify({
			success: true,
			message: `Successfully edited lines ${start_line}-${end_line} in ${normalizedPath}.`,
		});
	} catch (error: any) {
		console.error(`Error editing file ${normalizedPath}:`, error);
		return JSON.stringify({
			error: `Failed to edit file: ${error.message || error}`,
		});
	}
}
