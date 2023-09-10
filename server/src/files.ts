/**
 * 
 * @param uri uri
 * @returns Converts uri to absolute file system path
 */
export function uriToPath(uri: string): string {
	return uri.substring("file://".length);
}
