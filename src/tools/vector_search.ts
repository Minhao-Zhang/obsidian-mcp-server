import { Orama, search } from "@orama/orama";
import { MySchema } from "../orama-db";
import { getTextEmbeddings } from "../utils/embeddings";

interface VectorSearchInput {
	query: string;
	count: number;
	similarity?: number;
}

interface VectorSearchResult {
	text: string;
	metadata: any;
	file_path: string;
}

interface Hit {
	document: {
		text: string;
		metadata: any;
		file_path: string;
	};
}

export async function vectorSearch(
	db: Orama<MySchema>,
	input: VectorSearchInput,
	settings: any
): Promise<VectorSearchResult[]> {
	const { query, count } = input;

	console.log("Settings:", settings);

	if (!settings.apiKey) {
		console.error("API key is not defined in settings.");
		return [];
	}

	const embeddings = await getTextEmbeddings([query], settings);

	console.log("Embeddings:", embeddings);

	const results = await search(db, {
		term: query,
		mode: "vector",
		vector: {
			value: embeddings[0],
			property: "embedding",
		},
		similarity: input.similarity ?? 0.8,
		limit: count,
	});

	console.log("Results:", results);

	return results.hits.map(
		(hit: Hit) =>
			({
				text: hit.document.text,
				metadata: hit.document.metadata,
				file_path: hit.document.file_path,
			} as VectorSearchResult)
	);
}
