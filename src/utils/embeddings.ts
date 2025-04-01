import OpenAI from "openai";
import ObsidianMCPServer from "main";

export async function getTextEmbeddings(
	texts: string[],
	settings: ObsidianMCPServer["settings"]
): Promise<number[][]> {
	const openai = new OpenAI({
		apiKey: settings.apiKey,
		baseURL: settings.modelProviderUrl,
		dangerouslyAllowBrowser: true, // Required to use OpenAI SDK in a browser environment
	});

	const embeddings = await openai.embeddings.create({
		input: texts,
		model: settings.embeddingModel,
	});

	return embeddings.data.map((item) => item.embedding);
}
