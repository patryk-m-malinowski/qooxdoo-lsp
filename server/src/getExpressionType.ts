import { QxProjectContext } from './QxProjectContext';
import { isBetween } from './math';
import { regexes } from './regexes';
import { rfind } from './rfind';
import { getClassNameFromSource } from './sourceTools';
import {parse, getSourceOfAst } from './parsing';

/**
 * Object representing type information of an expression.
 * 
 * category - Type category of expression.
 *   Examples:
 * 	   Package: "qx.ui" -> "qxPackage"
 *   	 Package: "qx.ui.form" -> "qxPackage"
 * 	   Class: "qx.ui.form.Spinner" -> "qxClass"
 * 	   QxObject: "this" -> "qxObject"
 *       "new qx.ui.layout.Basic()" -> "qxObject"
 *       "spinner" => "qxObject" (given "let spinner = new qx.ui.form.Spinner();" before)
 * 
 * typeName - Name of class relating to object
 * 
 * parameterTypes (function only) - Function parameter types
 * returnType (functions only) - Function return type
 */
export interface TypeInfo {
	category: "qxPackage" | "qxClass" | "qxObject" | "function",
	typeName: string,
	parameterTypes?: TypeInfo[],
	returnType?: TypeInfo
}

/**
 * Returns the type of the expression in a Qooxdoo source file
 * @param source String containing source code of file
 * @param sourcePos Zero-based index representing the position in `source` at which to find the expression's type
 * @param expression 
 * @param context Qx Project context object
 * @returns 
 * 
 */
export async function getExpressionType(source: string, sourcePos: number, expression: string, context: QxProjectContext): Promise<TypeInfo | null> {
	const qxClassDb = context.qxClassDb;

	const expressionAst = parse(expression); //TODO find a way of doing this without exception handling
	if (!expressionAst) return null;

	const thisClassName = getClassNameFromSource(source);

	async function trySuper(): Promise<TypeInfo | null> {
		if (expression != "super") return null;
		let rgxExtends = new RegExp(`extend:\\s*(${regexes.MEMBER_CHAIN})`, 'g');
		let extendsMatch = rgxExtends.exec(source);
		if (!extendsMatch) return null;
		let superClassName = extendsMatch[1];
		return { category: "qxObject", typeName: superClassName };
	}

	async function tryThis(): Promise<TypeInfo | null> {
		if (expression !== "this" || !thisClassName) return null;
		if (!thisClassName) return null;
		return { category: "qxObject", typeName: thisClassName };
	}

	async function tryClassOrPackage(): Promise<TypeInfo | null> {
		if (expressionAst.type !== "MemberExpression") return null;
		let classOrPackageInfo = await qxClassDb.getClassOrPackageInfo(expression);
		if (classOrPackageInfo) {
			switch (classOrPackageInfo.type) {
				case "class":
					return { category: "qxClass", typeName: expression };
				case "package":
					return { category: "qxPackage", typeName: expression };
				default:
			}
		}
		return null;
	}

	async function tryObjectExpression(): Promise<TypeInfo | null> {
		if (!["OptionalMemberExpression", "MemberExpression"].includes(expressionAst.type)) return null;

		let objectString = getSourceOfAst(expressionAst.object, expression);

		let objectTypename = (await getExpressionType(source, sourcePos, objectString, context))?.typeName;
		if (!objectTypename) return null;
		let objectClassOrPackageInfo = await context.qxClassDb.getClassOrPackageInfo(objectTypename);
		if (!objectClassOrPackageInfo || objectClassOrPackageInfo?.info == "qxPackage") return null;

		let objectTypeInfo = objectClassOrPackageInfo.info;
		let allMembers = { ...objectTypeInfo.members, ...objectTypeInfo.statics };
		const memberName = expressionAst.property.name;
		const memberInfo = allMembers[memberName];
		if (!memberInfo) return null;
		if (memberInfo.type == "variable") {
			let propertyTypeInfo = memberInfo.jsdoc?.["@type"]?.[0].body;
			if (!propertyTypeInfo) return null;
			let typeMatch = /\{(.*)\}/.exec(propertyTypeInfo);
			if (!typeMatch) return null;
			let type: string = removeTemplateArgs(typeMatch[1]);
			return { category: "qxObject", typeName: type }
		} else if (memberInfo.type == "function") {
			const returnTypeName = removeTemplateArgs(memberInfo["jsdoc"]?.["@return"]?.[0].type as string);
			const returnType: TypeInfo = { category: "qxObject", typeName: returnTypeName }; //todo change to object
			return returnType ? { category: "function", typeName: "", returnType: returnType } : null;
		}
		return null;
	}

	async function tryCallExpression(): Promise<TypeInfo | null> {
		if (!["OptionalCallExpression", "CallExpression"].includes(expressionAst.type)) return null;
		let objectExprn: string = getSourceOfAst(expressionAst.callee.object, expression);
		let objectTypeInfo: TypeInfo | null = await getExpressionType(source, sourcePos, objectExprn, context);
		if (!objectTypeInfo) return null;
		let propertyName: string = expressionAst.callee.property.name;
		if (expressionAst.callee.type == "MemberExpression" && objectTypeInfo.category == "qxObject" && propertyName == "set") {
			return objectTypeInfo;
		}
		let functionType = await getExpressionType(source, sourcePos, getSourceOfAst(expressionAst.callee, expression), context);
		if (functionType?.category != "function") return null; //todo log error
		return functionType.returnType ?? null;
	}

	async function tryNewExpression(): Promise<TypeInfo | null> {
		if (expressionAst.type !== "NewExpression") return null;
		let className = getSourceOfAst(expressionAst.callee, expression);
		if (!context.qxClassDb.classExists(className)) return null;
		return { category: "qxObject", typeName: className };
	}

	async function tryIdentifier(): Promise<TypeInfo | null> {
		if (expressionAst.type !== "Identifier") return null;
		let varName = expression;
		let assignmentRegex = new RegExp(`${varName}\\s*=\\s*(.*?);`, "g");
		let searchInfo = rfind(source, sourcePos, assignmentRegex);
		if (searchInfo) {
			let typeInfo = await getExpressionType(source, searchInfo.start, searchInfo.groups[1], context);
			if (typeInfo) return typeInfo;
		}
		//try to lookup in method parameters
		if (!thisClassName) return null;
		let thisClassInfo = (await qxClassDb.getClassOrPackageInfo(thisClassName))?.info;
		if (!thisClassInfo) return null;
		let methodInfo: any;

		var methodName: string;
		for (const [memberName, memberInfo_] of Object.entries({ ...thisClassInfo.members, ...thisClassInfo.statics })) {
			let memberInfo = (memberInfo_ as any)
			if (!!memberInfo.location && isBetween(sourcePos, memberInfo.location.start.index, memberInfo.location.end.index)) {
				methodName = memberName;
				methodInfo = memberInfo;
				break;
			}
		}

		if (methodInfo) {
			async function getParamType(methodInfo: any): Promise<TypeInfo | null> {
				let paramInfo = methodInfo.jsdoc?.["@param"].find((p: any) => p.paramName == varName)
				if (paramInfo)
					return { category: "qxObject", typeName: paramInfo.type };
				else if (methodInfo.overriddenFrom) {
					let superClassInfo = (await qxClassDb.getClassOrPackageInfo(methodInfo.overriddenFrom))?.info;
					if (superClassInfo) {
						let superMethodInfo = superClassInfo.members[methodName];
						if (superMethodInfo) return getParamType(superMethodInfo)
					}
				}
				return null;
			}
			return getParamType(methodInfo);
		}
		return null;
	}

	return await trySuper() ?? await tryThis() ?? await tryClassOrPackage() ?? await tryCallExpression() ?? await tryIdentifier()
		?? await tryNewExpression() ?? await tryObjectExpression();
}

/**
 * Symbolic type for ASTs returned by Babel
 */




function removeTemplateArgs(typeName: string) {
	return typeName.replace(/<.*>/, "");
}