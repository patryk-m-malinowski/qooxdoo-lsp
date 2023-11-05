
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
		if (!matches || searcher.lastIndex > pos || searcher.lastIndex == 0) break;
		lastSearch = { start: matches.index, end: searcher.lastIndex, match: matches[0], groups: matches }
	}

	if (mustEndAtPos && lastSearch?.end != pos) return null;
	return lastSearch;
}

/**
 * A collection of functions used to help in looking up patterns in strings backwards from some specified position in the string
 */
export namespace rfinders {

	/**
	 * An RFinder (i.e. reverse finder) is a function which is used to match a pattern backwards in a string `source`,
	 * such that the match exactly ends at some specified position `pos`.
	 * If the pattern is found, it returns the position in the string of the start of the pattern.
	 * If the pattern is not found, it returns null
	 */
	export type RFinder = (source: string, pos: number) => number | null;

	/**
	 * Constructs an RFinder which must match the specified RegExp,
	 * exactly before `pos` in `source
	 * This is the base case for all RFinders
	 * @param s
	 * @returns 
	 */
	export function string(s: RegExp | string): RFinder {
		return (source: string, pos: number) => rfind(source, pos, s)?.start ?? null;
	}
	
	/**
	 * Returns an RFinder which looks up the given RegEx before some position in a string
	 * @param searcher 
	 * @returns 
	 */
	export function rgx(searcher: RegExp | string): RFinder {
		return (source: string, pos: number): number | null => {
			return rfind(source, pos, searcher, true)?.start ?? null;
		};
	}


	/**
	 * Constructs an RFinder which tries to match using the RFinders in `args`,
	 * starting from the leftmost argument and ending on the rightmost argument
	 * @param args 
	 * @returns 
	 */
	export function or(...args: RFinder[]): RFinder {
		const arg1 = args.shift();
		if (!arg1) throw new Error("At least one argument must be supplied")
		if (args.length > 0)
			return (str: string, pos: number) => arg1(str, pos) ?? or(...args)(str, pos);
		else return arg1;
	}

	/**
	 * Constructs an RFinder such that the RFinders in `args` match in sequence
	 * i.e. args[-1] has to match before the specified position,
	 * then args[-2] must immediately precede,
	 * then args[-3] must immediately precede, and so on
	 * @param args 
	 * @returns 
	 */
	export function seq(...args: RFinder[]): RFinder {
		const arg1 = args.pop();
		if (!arg1) throw new Error("At least one argument must be supplied")
		const arg2 = args.pop();
		if (arg2)
			return (str: string, pos: number) => {
				let arg1Start = arg1(str, pos);
				if (!arg1Start) return null;
				return seq(...args, arg2)(str, arg1Start);
			}
		else
			return arg1;
	}

	/**
	 * Constructs an RFinder which permits either a match or no-match of the specified RFinder.
	 * @param rfinder 
	 * @returns 
	 */
	export function maybe(rfinder: RFinder): RFinder {
		return (str: string, pos: number) => {
			return rfinder(str, pos) ?? pos;
		}
	}

	
}
