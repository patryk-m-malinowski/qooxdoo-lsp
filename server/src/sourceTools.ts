import { integer } from 'vscode-languageserver';
import { regexes } from './regexes';
import { rfind } from './search';

const BRACKETS: string = "(){}[]";
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

enum BracketType { OPENING, CLOSING }

function getBracketType(bracket: string): BracketType {
	const bracketIndex = BRACKETS.indexOf(bracket);
	if (bracketIndex == -1) throw new Error();
	return bracketIndex % 2 ? BracketType.CLOSING
		: BracketType.OPENING
}

function getOpposingBracket(bracket: string) {
	const bracketIndex = BRACKETS.indexOf(bracket);
	const bracketType = getBracketType(bracket);
	return BRACKETS.charAt(bracketIndex + bracketType == BracketType.OPENING ? 1 : -1);
}

function findMatchingBracket(source: string, pos: number): number {
	if (!BRACKETS.includes(source.charAt(pos)))
		throw new Error("Character is not a bracket!");

	let stack = [source.charAt(pos)]

	//if our bracket is opening, we are going forwards
	if (getBracketType(source.charAt(pos)) == BracketType.OPENING) {
		pos++;
		for (; pos < source.length; pos++) {
			if (BRACKETS.includes(source.charAt(pos))) {
				const encounteredBracket = source.charAt(pos);
				if (getBracketType(encounteredBracket) == BracketType.OPENING) {
					stack.push(source.charAt(pos));
				} else {
					if (stack.pop() != getOpposingBracket(encounteredBracket)) {
						return -1;
					}
				}
			}
		}
	} else {
		pos--;
		for (; pos < source.length; pos--) {
			if (BRACKETS.includes(source.charAt(pos))) {
				const encounteredBracket = source.charAt(pos);
				if (getBracketType(encounteredBracket) == BracketType.OPENING) {
					if (stack.pop() != getOpposingBracket(encounteredBracket)) {
						return -1;
					}
				} else {
					stack.push(encounteredBracket);
				}
			}
		}
	}

	return stack.length == 0 ? pos : -1;


}

export function getObjectExpressionEndingAT(source: string, pos: integer): string | null {
	if (BRACKETS.includes(source.charAt(pos - 1))) {
		const matchingBracketIndex = findMatchingBracket(source, pos);
		return getObjectExpressionEndingAT(source, matchingBracketIndex);
	}

	let identifierFindInfo = rfind(source, pos, regexes.IDENTIFIER);
	if (identifierFindInfo) {
		let { start: identifierStart, match: identifier } = identifierFindInfo;
		if (source.charAt(identifierStart - 1) == '.') {
			return getObjectExpressionEndingAt(source, identifierStart - 1) + identifier
		}

		let newFindInfo = rfind(source, identifierStart, /new\w+/g);
		if (newFindInfo) {
			let { start: newStart } = newFindInfo;

			return source.substring(newStart, pos);
		}
	}

	return null;

}