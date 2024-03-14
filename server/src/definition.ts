import { Location, TextDocument } from 'vscode-languageserver';
import { QxProjectContext } from './QxProjectContext';
import { ClassInfo } from './ClassInfo';
import { rfind } from './rfind';
import { getObjectExpressionEndingAt } from './sourceTools';
import { parse, getSourceOfAst, Ast } from './parsing';
import { strings } from './strings';
import { getExpressionType } from './getExpressionType';
import { QxClassDb } from './QxClassDb';

/**
 * Implementation for finding a definition of a symbol
 * @param source Source code for file at which definition was requested
 * @param pos Zero-based index of cursor in source where definition was requested
 * @param context 
 * @returns 
 */
export async function findDefinitions(source: string, pos: number, context: QxProjectContext) {
	let qxClassDb: QxClassDb = context.qxClassDb;

	var t = source.substring(pos);
	let matches = (/\w*/).exec(t);
	let tilEow = matches?.[0]?.length;
	if (tilEow == null) throw new Error();
	let endOfWordPos: number = pos + tilEow;

	let expr = getObjectExpressionEndingAt(source, endOfWordPos);
	if (!expr) return null;
	if (expr.startsWith("new ")) expr = expr.substring("new ".length);

	//check if it's a class
	var u = (await context.qxClassDb.getClassOrPackageInfo(expr));
	if (u && u.type != "class") return null;
	let classInfo: ClassInfo | null = u?.info as any;
	if (classInfo) {
		let sourceUri = await context.getSourceUriForClass(expr);
		let start = classInfo.location.start;
		let end = classInfo.location.end;
		if (sourceUri) {
			return [
				Location.create(sourceUri, { start: { line: start.line, character: start.column }, end: { line: end.line, character: end.column } })
			];
		}
	} else { // it means it's a member of a class
		const exprAst: Ast = parse(expr);
		if (!exprAst || !["MemberExpression", "OptionalMemberExpression"].includes(exprAst.type)) return null;
		let objectExpr: string = getSourceOfAst(exprAst.object, expr);
		const memberName: string = exprAst.property.name;

		let type = await getExpressionType(source, pos, objectExpr, context);
		if (!type) return null;

		let className = type.typeName;
		if (!qxClassDb.classExists(className)) return null;
		let classInfo: ClassInfo | null = await context.qxClassDb.getFullClassInfo(className);

		let memberInfo = classInfo.members?.[memberName] ?? classInfo.statics?.[memberName];

		if (!memberInfo) {
			return null;
		}

		let location = memberInfo.location;
		let sourceClass = memberInfo.mixin ?? memberInfo.inheritedFrom ?? className;

		let sourceUri = await context.getSourceUriForClass(sourceClass);
		if (!sourceUri) return null;
		return [
			Location.create(sourceUri, {
				start: {
					line: location.start.line,
					character: location.start.column
				},
				end: {
					line: location.end.line,
					character: location.end.column

				}
			})
		];
	}

	return null;
}