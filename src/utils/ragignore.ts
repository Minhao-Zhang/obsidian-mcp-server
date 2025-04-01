import ignore from "ignore";

export function createRagignoreMatcher(
	patterns: string
): (path: string) => boolean {
	const ignorer = ignore().add(patterns);

	return (path: string) => {
		return ignorer.ignores(path);
	};
}
