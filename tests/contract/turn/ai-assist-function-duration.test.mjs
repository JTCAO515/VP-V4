import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const webRoute = "app/api/chat/grounded/ai-assist/route.ts";
const nativeRoute = "app/api/chat/native/v4/turns/[turnId]/ai-assist/route.ts";
const nativeHandler = "lib/server/turn/native-ai-assist-http.ts";

function parse(path) {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
}

function declaredDuration(path) {
  const declaration = parse(path).statements.flatMap(statement =>
    ts.isVariableStatement(statement) && statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
      ? [...statement.declarationList.declarations] : [],
  ).find(item => ts.isIdentifier(item.name) && item.name.text === "maxDuration");
  assert.ok(declaration && declaration.initializer && ts.isNumericLiteral(declaration.initializer), `${path} must export a static numeric maxDuration`);
  return Number(declaration.initializer.text);
}

function requestScopes(path) {
  const scopes = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "nativeRequestScope") {
      const budget = node.arguments[1];
      assert.ok(budget && ts.isNumericLiteral(budget), `${path} must give nativeRequestScope a static numeric budget`);
      scopes.push(Number(budget.text));
    }
    ts.forEachChild(node, visit);
  }
  visit(parse(path));
  assert.equal(scopes.length, 1, `${path} must have one explicit AI-assist request scope`);
  return scopes[0];
}

test("both AI-assist function limits cover their 75s request scopes", () => {
  const webScope = requestScopes(webRoute);
  const nativeScope = requestScopes(nativeHandler);
  assert.equal(webScope, 75_000);
  assert.equal(nativeScope, 75_000);
  assert.ok(declaredDuration(webRoute) * 1000 >= webScope);
  assert.ok(declaredDuration(nativeRoute) * 1000 >= nativeScope);
});
