import {getObjectExpressionEndingAt} from "../src/sourceTools";

function getObjectExpressionAtEnd(str: string) {
	return getObjectExpressionEndingAt(str, str.length);
}

test("simple identifer", () => {
	const result = getObjectExpressionAtEnd("let x = 3; identifier_123")
	expect(result).toEqual("identifier_123");
})

test("spread", () => {
	const result = getObjectExpressionAtEnd("let x = 3; ...identifier_123")
	expect(result).toEqual("identifier_123");
})

test("function call", () => {
	const result = getObjectExpressionAtEnd("let x = 3; doSomething()")
	expect(result).toEqual("doSomething()");
})

test("optional function call", () => {
	const result = getObjectExpressionAtEnd("let x = 3; doSomething?.()")
	expect(result).toEqual("doSomething?.()");
})

test("method call", () => {
	const result = getObjectExpressionAtEnd("let x = 3; identifier_123.doSomething()")
	expect(result).toEqual("identifier_123.doSomething()");
})

test("inside a method argument", () => {
	const result = getObjectExpressionAtEnd("let x = 3; somefunc(identifier_123.doSomething()")
	expect(result).toEqual("identifier_123.doSomething()");
})

test("optional method call", () => {
	const result = getObjectExpressionAtEnd("let x = 3; identifier_123?.doSomething()")
	expect(result).toEqual("identifier_123?.doSomething()");
})

test("subscript access 1", () => {
	const result = getObjectExpressionAtEnd("const y = 2; let x = 3; identifier_123[4]")
	expect(result).toEqual("identifier_123[4]");
})

test("subscript access 2", () => {
	const result = getObjectExpressionAtEnd("const y = 2; let x = 3; identifier_123?.getArray()[4]")
	expect(result).toEqual("identifier_123?.getArray()[4]");
})

test("subscript access + spread operator", () => {
	const result = getObjectExpressionAtEnd("const y = 2; let x = 3; ...identifier_123?.getArray()[4]")
	expect(result).toEqual("identifier_123?.getArray()[4]");
})

test("optional subscript access", () => {
	const result = getObjectExpressionAtEnd("let x = 3; identifier_123?.getMap()?.[\"waaa\"]")
	expect(result).toEqual("identifier_123?.getMap()?.[\"waaa\"]");
})