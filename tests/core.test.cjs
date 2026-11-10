const assert = require('node:assert/strict');
const { test } = require('node:test');
require('../extension/core.js');
const { parseDuration, sortVideos, planMoves } = globalThis.TubeOrderCore;

test('interpreta minutos, horas e durações ausentes', () => {
  assert.equal(parseDuration('9:40'), 580);
  assert.equal(parseDuration('1:02:03'), 3723);
  assert.equal(parseDuration('  12:05  '), 725);
  assert.equal(parseDuration('AO VIVO'), null);
  assert.equal(parseDuration('Vídeo privado'), null);
  assert.equal(parseDuration(''), null);
});

test('ordena por segundos com estabilidade nos empates e sem duração no fim', () => {
  const videos = [
    { id: 'a', duration: 580, originalIndex: 0 },
    { id: 'private', duration: null, originalIndex: 1 },
    { id: 'b', duration: 580, originalIndex: 2 },
    { id: 'hour', duration: 3723, originalIndex: 3 },
    { id: 'short', duration: 45, originalIndex: 4 },
  ];
  assert.deepEqual(sortVideos(videos, 'asc').map(v => v.id), ['short', 'a', 'b', 'hour', 'private']);
  assert.deepEqual(sortVideos(videos, 'desc').map(v => v.id), ['hour', 'a', 'b', 'short', 'private']);
  assert.equal(videos[0].id, 'a', 'não altera a lista de entrada');
});

function applyMoves(ids, moves) {
  const result = [...ids];
  for (const { id, edge } of moves) {
    const index = result.indexOf(id);
    assert.ok(index >= 0, 'cada movimento aponta para um vídeo existente');
    result.splice(index, 1);
    if (edge === 'top') result.unshift(id);
    else if (edge === 'bottom') result.push(id);
    else assert.fail(`borda desconhecida: ${edge}`);
  }
  return result;
}

test('plano de movimentos salva exatamente a sequência desejada', () => {
  const permutations = [];
  function visit(prefix, rest) {
    if (!rest.length) permutations.push(prefix);
    for (let i = 0; i < rest.length; i++) visit([...prefix, rest[i]], rest.filter((_, index) => index !== i));
  }
  visit([], ['a', 'b', 'c', 'd', 'e']);
  for (const initial of permutations) {
    const target = ['a', 'b', 'c', 'd', 'e'];
    const moves = planMoves(initial, target);
    assert.deepEqual(applyMoves(initial, moves), target, initial.join(','));
    assert.ok(moves.length <= initial.length - 1, 'evita mover todos os itens sem necessidade');
  }
  assert.deepEqual(planMoves(['a', 'b', 'c'], ['a', 'b', 'c']), []);
  assert.deepEqual(planMoves([], []), []);
});

test('modo de mover para o início preserva itens indisponíveis no fim', () => {
  const initial=['unavailable','long','short','medium'];
  const target=['short','medium','long','unavailable'];
  const moves=planMoves(initial,target,{topOnly:true});
  assert.ok(moves.every(move=>move.edge==='top'));
  assert.ok(moves.every(move=>move.id!=='unavailable'));
  assert.deepEqual(applyMoves(initial,moves),target);
});
