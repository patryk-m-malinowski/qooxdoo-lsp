import babel = require("@babel/parser");

export type Ast = any;

export function parse(exprn: string): Ast | null {
	let out: Ast | null = null;
	try {
		out = babel.parseExpression(exprn, { allowSuperOutsideMethod: true, errorRecovery: true });
	} catch (e) {
		return null;
	}
	return out;
}

/**
 * 
 * @param ast AST of expression (as returned by Babel)
 * @param source Original source which the AST is derived from
 * @returns 
 */
export function getSourceOfAst(ast: Ast, source: string) {
	return source.substring(ast.start, ast.end);
}