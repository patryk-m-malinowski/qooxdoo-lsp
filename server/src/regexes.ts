export namespace regexes {
	export const IDENTIFIER = "[A-Za-z_][A-Za-z_0-9]*";
	export const RGX_MEMBER_CHAIN = `${IDENTIFIER}(\\.${IDENTIFIER})*(?=(\\(.*\\))?)`;
	export const RGX_CLASSDEF = `qx\\.Class\\.define\\("(.+?)"`;
	export const MEMBER_CHAIN = `${IDENTIFIER}(.${IDENTIFIER})*`
	export const OBJECT_EXPRN = `(new )?(${regexes.IDENTIFIER}(\\.${regexes.IDENTIFIER})*)(\\(.*\\))?(\\.${regexes.IDENTIFIER})?`
	export const NEW_EXPRN = `new\\s+(${regexes.IDENTIFIER}(\\.${regexes.IDENTIFIER})*)(\\(.*\\))?(\\.${regexes.IDENTIFIER})?`
}