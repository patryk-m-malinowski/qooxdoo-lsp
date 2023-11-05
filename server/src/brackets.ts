import { regexes } from './regexes';

const BRACKETS: string = "(){}[]";

enum BracketType { OPENING, CLOSING }

export function isBracket(character: string) {
	return BRACKETS.includes(character);
}

/**
 * 
 * @param source source code of where to find matching bracket
 * @param pos Zero-based index in `source`
 * @returns 
 */
export function findMatchingBracket(source: string, pos: number): number {
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


function getBracketType(bracket: string): BracketType {
	const bracketIndex = BRACKETS.indexOf(bracket);
	if (bracketIndex == -1) throw new Error("Bracket must be one of (,),[,],{,}");
	return bracketIndex % 2 ? BracketType.CLOSING
		: BracketType.OPENING
}

function getOpposingBracket(bracket: string) {
	const bracketIndex = BRACKETS.indexOf(bracket);
	const bracketType = getBracketType(bracket);
	return BRACKETS.charAt(bracketIndex + (bracketType == BracketType.OPENING ? 1 : -1));
}

