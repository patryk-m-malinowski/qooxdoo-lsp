import { ParameterInformation, SignatureHelp } from 'vscode-languageserver';
import { rfind } from './rfind';
import { getObjectExpressionEndingAt } from './sourceTools';
import { QxProjectContext } from './QxProjectContext';
import { TypeInfo, getExpressionType } from './getExpressionType';

/**
 * Implementation for signature hint (function or method parameter hints)
 * @param source Source code string of where hints were requested
 * @param offset Zero-based index of the cursor in the source where hints were requested
 * @param context Qx project context object
 * @returns 
 */
export async function getSignatureHint(source: string, pos: number, context: QxProjectContext): Promise<SignatureHelp | null> {
	let bracketPos = rfind(source, pos, /\(/g)?.start;
	if (!bracketPos) throw new Error();

	//find parameter number. Count number of columns between opening '(' and ca
	let paramIndex = source.substring(bracketPos, pos).split('').filter(c => c == ',').length;

	let objAndMethod = getObjectExpressionEndingAt(source, bracketPos);
	if (!objAndMethod) return null;

	var methodInfo, methodName;
	//check if objectandmethod is a class, in which case provide constructor params
	let classInfo;
	if (objAndMethod.startsWith("new ") && (classInfo = (await context.qxClassDb.getClassOrPackageInfo(objAndMethod.substring("new ".length)))?.info)) {
		methodInfo = classInfo?.construct;
		methodName = objAndMethod;
	} else {
		const tokens = objAndMethod.split('.');
		if (tokens.length < 2) return null;
		methodName = tokens.pop();
		if (!methodName) throw new Error();

		let object: string = tokens.join(".");
		let objectType: TypeInfo | null = await getExpressionType(source, pos, object, context);
		if (!objectType) return null;


		let methodClass = objectType.typeName;
		if (!methodClass) throw new Error();

		//if the member is inherited, look in the class where it was inherited from
		while (true) {
			let classInfo = methodClass ? (await context.qxClassDb.getClassOrPackageInfo(methodClass))?.info : null;
			if (!classInfo) return null;
			methodInfo = classInfo.members?.[methodName] ?? classInfo.statics?.[methodName];
			if (!methodInfo) {
				methodClass = methodInfo?.overriddenFrom ?? classInfo?.superClass;
			}
			else {
				break;
			}

		}

		if (!methodInfo || methodInfo.type != "function") return null;

	}


	let paramList = methodInfo?.jsdoc?.["@param"];

	if (!paramList) return null;

	var paramLabels: string[] = [];

	let parameters: ParameterInformation[] = [];

	for (const paramInfo of paramList) {
		const paramLabel = paramInfo.paramName + ": " + paramInfo.type ?? "any";
		paramLabels.push(paramLabel);
		parameters.push({
			label: paramLabel,
			documentation: paramInfo.description ?? paramInfo.desc
		});
	}

	let signatureStr = `${methodName}(${paramLabels.join(',')})`;

	return signatureStr ? {
		signatures: [
			{
				label: signatureStr,
				documentation: methodInfo.jsdoc?.["@description"].body,
				parameters
			}
		],
		activeSignature: 0,
		activeParameter: paramIndex

	} : null;
}