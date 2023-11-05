import { integer } from 'vscode-languageserver';
import { regexes } from './regexes';
import { rfinders } from './rfind';
import { isBracket, findMatchingBracket } from './brackets'

/**
 * Returns the longest-possible member expression (basically it works like your standard IntelliSense!)
 * @param source Source code of where expression is located
 * @param pos Zero-based position at which the expression ends
 * @returns 
 */
export function getObjectExpressionEndingAt(source: string, pos: integer): string | null {

	const s = rfinders.rgx;
	const or = rfinders.or;
	const seq = rfinders.seq;
	const maybe = rfinders.maybe;

	const rfindMatchingBrackets = (source: string, pos: number) => {
		if (!isBracket(source.charAt(pos - 1)))
			return null;

		const matchingBracketIndex = findMatchingBracket(source, pos - 1);
		if (matchingBracketIndex == -1) return null;
		return matchingBracketIndex;
	}

	function trace(id: any, f: any) {
		const g = (src: any, pos: any) => {
			console.log("started: " + id + " pos:" + pos);
			let result = f(src, pos);
			console.log("ended: " + id + " result: " + result);
			return result;
		}
		return g;

	}


	const functionCallOrMemberExpression: rfinders.RFinder = (...args) => {
		let rfinder = or(
			seq(maybe(seq(functionCallOrMemberExpression, s(/(\?)?\./g))), s(regexes.IDENTIFIER)),
			seq(functionCallOrMemberExpression, maybe(s('\\?\\.')), rfindMatchingBrackets)
		);
		return rfinder(...args);
	}

	const matcher = seq(maybe(s("new\\s+")), functionCallOrMemberExpression);
	const exprStart = matcher(source, pos);

	return exprStart !== null ? source.substring(exprStart, pos) : null;
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

