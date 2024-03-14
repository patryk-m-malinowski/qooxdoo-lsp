/** Stores information regarding a Qooxdoo class e.g. the methods, properties, and members.
 *  Format is exactly the same as the JSON files found in compiled/meta  
 * */
export interface ClassInfo {
	members: { [memberName: string]: MemberInfo },
	properties: { [memberName: string]: any },
	statics: { [memberName: string]: MemberInfo },
	location: Location,
	superClass?: string,
	mixins?: string[],
	construct: MethodInfo,
	isSingleton?: boolean,
};

export interface MemberInfo {
	jsdoc?: any,
	access: AccessSpecifier,
	location: Location,
	type?: "function" | "variable",
	overriddenFrom?: string,
	inheritedFrom?: string,
	mixin?: string,
}

export interface MethodInfo extends MemberInfo {
	params: any[]
}

export type AccessSpecifier = "public" | "protected" | "private";
export interface FilePos { line: number, column: number, index: number }
export interface Location { start: FilePos, end: FilePos };