import test from 'node:test';
import assert from 'node:assert/strict';
import {ONTOLOGY_TYPES, ONTOLOGY_RELATIONS, resolveOntologyRelation, resolveOntologyType, isProvenanceReadInput} from '../../../lib/server/knowledge/provenance/ontology.ts';

const ALL_PREDICATES = ['offers_procedure','accepts_method','requires_document','requires_action','connects_to','provides_contact','permits_admission','located_at','opens_during'];

test('ontology relations cover exactly the closed predicate set statement_valid() enforces, no more no less', () => {
  assert.deepEqual([...ONTOLOGY_RELATIONS].map(r => r.predicate).sort(), [...ALL_PREDICATES].sort());
  assert.equal(new Set(ONTOLOGY_RELATIONS.map(r => r.predicate)).size, ALL_PREDICATES.length);
});

test('every relation domain/range type is a registered ontology type', () => {
  const typeIds = new Set(ONTOLOGY_TYPES.map(t => t.typeId));
  for (const r of ONTOLOGY_RELATIONS) {
    assert.ok(typeIds.has(r.domainType), `${r.predicate} domainType ${r.domainType} must be registered`);
    assert.ok(typeIds.has(r.rangeType), `${r.predicate} rangeType ${r.rangeType} must be registered`);
    assert.ok(r.zhLabel.length > 0 && r.enLabel.length > 0, `${r.predicate} needs zh/en labels`);
  }
});

test('resolveOntologyRelation never fabricates a relation for an unregistered predicate', () => {
  assert.equal(resolveOntologyRelation('offers_procedure')?.zhLabel, '提供办理流程');
  assert.equal(resolveOntologyRelation('located_at')?.rangeType, 'postal_address');
  assert.equal(resolveOntologyRelation('not_a_real_predicate'), undefined);
  assert.equal(resolveOntologyRelation(''), undefined);
  assert.equal(resolveOntologyRelation('__proto__'), undefined);
});

test('resolveOntologyType returns registered types only', () => {
  assert.equal(resolveOntologyType('service_entity')?.enLabel, 'Service entity');
  assert.equal(resolveOntologyType('unknown_type'), undefined);
});

test('isProvenanceReadInput accepts only a closed {factId: uuid} object', () => {
  assert.equal(isProvenanceReadInput({ factId: '12345678-1234-4123-8123-123456789012' }), true);
  for (const bad of [
    null, undefined, [], 'string', 42,
    {}, { factId: 'not-a-uuid' }, { factId: 123 },
    { factId: '12345678-1234-4123-8123-123456789012', extra: 'field' },
    { factId: '12345678-1234-4123-8123-123456789012', ['__proto__']: {} },
  ]) assert.equal(isProvenanceReadInput(bad), false, JSON.stringify(bad));
});
