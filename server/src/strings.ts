export namespace strings {
	/**
	 * Returns new string but forces first character to be lower case (Qooxdoo's qx.lang.String.firstDown would be useful here)
	 * @param input 
	 * @returns 
	 */
	export function firstDown(input: string): string {
		return input.charAt(0).toLowerCase() + input.substring(1);
	}
}