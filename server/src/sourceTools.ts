import { integer } from 'vscode-languageserver';
import { regexes } from './regexes';
import { rfind } from './search';

const BRACKETS: string = "(){}[]";


enum BracketType { OPENING, CLOSING }

function getBracketType(bracket: string): BracketType {
	const bracketIndex = BRACKETS.indexOf(bracket);
	if (bracketIndex == -1) throw new Error("Bracket must be one of (,),[,],{,}");
	return bracketIndex % 2 ? BracketType.CLOSING
		: BracketType.OPENING
}

/**
 * 
 * @param source Qx class source
 * @returns Name of class if it can find it, null otherwise
 */
export function getClassNameFromSource(source: string): string | null {
	var rgx = new RegExp(regexes.RGX_CLASSDEF, "g");
	let groups = rgx.exec(source);
	let className = groups?.at(1);
	return className ?? null;
}

function getOpposingBracket(bracket: string) {
	const bracketIndex = BRACKETS.indexOf(bracket);
	const bracketType = getBracketType(bracket);
	return BRACKETS.charAt(bracketIndex + bracketType == BracketType.OPENING ? 1 : -1);
}

/**
 * 
 * @param source source code of where to find matching bracket
 * @param pos Zero-based index in `source`
 * @returns 
 */
function findMatchingBracket(source: string, pos: number): number {
	if (!BRACKETS.includes(source.charAt(pos)))
		throw new Error("Character is not a bracket!");

	let stack = [source.charAt(pos)]

	//if our bracket is opening, we are going forwards
	if (getBracketType(source.charAt(pos)) == BracketType.OPENING) {
		pos++;
		for (; pos < source.length && stack.length > 0; pos++) {
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
		for (; pos < source.length && stack.length > 0; pos--) {
			if (BRACKETS.includes(source.charAt(pos))) {
				const encounteredBracket = source.charAt(pos);
				if (getBracketType(encounteredBracket) == BracketType.OPENING) {
					if (stack.pop() != getOpposingBracket(encounteredBracket)) {
						return -1;
					} else break;

				} else {
					stack.push(encounteredBracket);
				}
			}
		}
	}

	return stack.length == 0 ? pos : -1;


}

/**
 * Returns the longest-possible member expression (basically it works like your standard IntelliSense!)
 * @param source Source code of where expression is located
 * @param pos Zero-based position at which the expression ends
 * @returns 
 */
export function getObjectExpressionEndingAt(source: string, pos: integer): string | null {
	if (BRACKETS.includes(source.charAt(pos - 1))) {
		const matchingBracketIndex = findMatchingBracket(source, pos - 1);
		if (matchingBracketIndex == -1) return null;
		return getObjectExpressionEndingAt(source, matchingBracketIndex) + source.substring(matchingBracketIndex, pos);
	}

	let identifierFindInfo = rfind(source, pos, regexes.IDENTIFIER);
	if (identifierFindInfo) {
		let { start: identifierStart, match: identifier } = identifierFindInfo;
		if (source.charAt(identifierStart - 1) == '.') {
			return getObjectExpressionEndingAt(source, identifierStart - 1) + '.' + identifier
		}

		let newFindInfo = rfind(source, identifierStart, /new\s+/g, true);
		if (newFindInfo && newFindInfo.end == identifierStart) {
			let { start: newStart } = newFindInfo;

			return source.substring(newStart, pos);
		}

		return identifier;
	}

	return null;

}