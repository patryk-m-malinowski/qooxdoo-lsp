/**
 * Reverse finder function. Finds closest match endin on or before the position (pos).
 * @param source Source text to search in
 * @param pos Position in source file
 * @param searcher The pattern you are searching for
 * @param mustEndAtPos If set to true, a match will only be returned if it ends at pos
 * @returns 
 */
export function rfind(source: string, pos: number, searcher: string | RegExp, mustEndAtPos: boolean = false): { start: number, end: number, match: string, groups: RegExpExecArray } | null {
	source = source.substring(0, pos);
	if (typeof (searcher) == "string") {
		searcher = new RegExp(searcher, "g");
	}

	var lastSearch = null;
	while (true) {
		let matches: RegExpExecArray | null = searcher.exec(source);
		if (!matches || searcher.lastIndex > pos  || searcher.lastIndex == 0) break;
		lastSearch = { start: matches.index, end: searcher.lastIndex, match: matches[0], groups: matches }
	}

	if (mustEndAtPos && lastSearch?.end != pos ) return null;
	return lastSearch;
}