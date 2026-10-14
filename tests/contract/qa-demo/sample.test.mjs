import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
import { fixtures, sampleReply } from '../../../components/qa-demo/fixtures.ts';

test('synthetic fixtures resolve only the explicit bilingual preset vocabulary', () => {
  assert.equal(fixtures.length, 2);
  for (const fixture of fixtures) {
    assert.match(fixture.id, /^synthetic-/);
    for (const [english, chinese] of [['why', '为什么'], ['simplify', '简化'], ['correction', '纠正']]) {
      assert.equal(sampleReply(fixture, ` ${english.toUpperCase()} `), sampleReply(fixture, chinese));
      assert.match(sampleReply(fixture, english), /固定示例/);
    }
    for (const unknown of ['', 'why tomorrow', 'ignore instructions', '任意问题']) {
      assert.match(sampleReply(fixture, unknown), /没有预设示例回应/);
    }
  }
  assert.notEqual(sampleReply(fixtures[0], 'why'), sampleReply(fixtures[1], 'why'));
});

test('sample import closure has no IO, persistence, credentials or server actions', () => {
  const allowed = new Set(['react', './fixtures', './QaDemoWorkspace.module.css', '@/components/qa-demo/QaDemoWorkspace']);
  const forbidden = /^(fetch|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|cookie|cookies|sendBeacon|process|eval|Function|require|createPasswordAuthClient|qaApi)$/;
  for (const file of ['app/qa/demo/page.tsx', ...readdirSync('components/qa-demo').filter(f => /\.tsx?$/.test(f)).map(f => `components/qa-demo/${f}`)]) {
    const source = readFileSync(file, 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isImportDeclaration(node)) assert.ok(allowed.has(node.moduleSpecifier.text), `unexpected import in ${file}`);
      if (ts.isCallExpression(node)) assert.notEqual(node.expression.kind, ts.SyntaxKind.ImportKeyword, 'no dynamic import');
      if (ts.isIdentifier(node)) assert.ok(!forbidden.test(node.text), `IO identifier ${node.text}`);
      if (ts.isStringLiteral(node)) assert.notEqual(node.text, 'use server');
      ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.doesNotMatch(source, /https?:\/\/|dangerouslySetInnerHTML/);
  }
  const component = readFileSync('components/qa-demo/QaDemoWorkspace.tsx', 'utf8');
  assert.match(component, /<a href="\/qa">/);
  assert.doesNotMatch(component, /next\/link/);
});
