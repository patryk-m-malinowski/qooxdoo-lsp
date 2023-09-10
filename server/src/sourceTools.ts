import { integer } from 'vscode-languageserver';
import { regexes } from './regexes';
import { rfind } from './search';

/**
 * Returns the a member chain expression (obj.property1.property2) which ends on pos.
 * @param source 
 * @param pos 
 */
export function getObjectExpressionEndingAt(source: string, pos: integer): string | null {
	let findResult = rfind(source, pos, regexes.OBJECT_EXPRN);
	if (findResult?.end == pos) return findResult.match;
	return null;
}
