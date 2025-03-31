import { FastMCP } from "fastmcp";
import { z } from "zod";
import { App, Notice } from "obsidian";
import { listFilesTool } from "./tools/list_files";
import { readFileTool } from "./tools/read_file";
import { writeFileTool } from "./tools/write_files";

export class MCPServer {
	private server: FastMCP;
	private port: number;

	constructor(private app: App, port: number) {
		this.port = port;
		this.server = new FastMCP({
			name: "Obsidian MCP Server",
			version: "1.0.0",
		});

		this.setupTools();
	}

	start() {
		try {
			this.server.start({
				transportType: "sse",
				sse: {
					endpoint: "/sse",
					port: this.port, // Use the port from settings
				},
			});
			console.log("MCP Server started successfully on port", this.port);
		} catch (error) {
			console.error("Error starting MCP server:", error);
			new Notice(
				`Error starting MCP server on port ${this.port}. See console for details.`
			);
		}
	}

	private setupTools() {
		this.server.addTool({
			name: "list_files",
			description:
				"List files and sub-folders for a given relative path to the root of the Obsidian vault.",
			parameters: z.object({
				relative_path: z
					.string()
					.describe(
						"Relative path to the root of the Obsidian vault."
					),
			}),
			execute: async (input: { relative_path: string }) => {
				try {
					return await listFilesTool(this.app, input.relative_path);
				} catch (error) {
					console.error("Error listing files:", error);
					return JSON.stringify({
						error: "Failed to list files. See console for details.",
					});
				}
			},
		});

		this.server.addTool({
			name: "read_file",
			description: "Returns the content of a file.",
			parameters: z.object({
				relative_path: z
					.string()
					.describe(
						"Relative path to the file to the root of the Obsidian vault."
					),
			}),
			execute: async (input: { relative_path: string }) => {
				try {
					return await readFileTool(this.app, input.relative_path);
				} catch (error) {
					console.error("Error reading file:", error);
					return JSON.stringify({
						error: "Failed to read file. See console for details.",
					});
				}
			},
		});

		this.server.addTool({
			name: "write_file",
			description:
				"Writes content to a file, but only if the file doesn't already exist.",
			parameters: z.object({
				relative_path: z
					.string()
					.describe(
						"Relative path to the file to the root of the Obsidian vault."
					),
				content: z.string().describe("Content to write to the file."),
			}),
			execute: async (input: {
				relative_path: string;
				content: string;
			}) => {
				try {
					return await writeFileTool(
						this.app,
						input.relative_path,
						input.content
					);
				} catch (error) {
					console.error("Error writing file:", error);
					return JSON.stringify({
						error: "Failed to write file. See console for details.",
					});
				}
			},
		});
	}

	stop() {
		try {
			this.server.stop();
			console.log("MCP Server stopped successfully");
		} catch (error) {
			console.error("Error stopping MCP server:", error);
			new Notice(`Error stopping MCP server. See console for details.`);
		}
	}
}
