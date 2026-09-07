// Tests de l'exemple isolé avec le runner Node disponible sans dépendances.
// La suite applicative cible reste Jest/Supertest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proposeDish, parseCdf } from './budget.ts';
const dish = {
  dishId: 'dish-a', restaurantId: 'restaurant-a', unitPriceCdf: '14000.00',
  servesPeople: 1, isMainDish: true, eligible: true, distanceMeters: 1250.4,
};
test('30000 CDF pour deux: deux plats, reste 2000', () => {
  const result = proposeDish('30000.00', 2, dish);
  assert.equal(result.quantity, 2);
  assert.equal(result.total, '28000.00');
  assert.equal(result.remainingBudget, '2000.00');
  assert.equal(result.pricePerPerson, '14000.00');
});
test('égalité budget acceptée et dépassement d’un centime rejeté', () => {
  assert.equal(proposeDish('28000.00', 2, dish).remainingBudget, '0.00');
  assert.equal(proposeDish('27999.99', 2, dish), null);
});
test('portion collective ne multiplie pas prix par nombre de personnes', () => {
  const result = proposeDish('30000.00', 2, { ...dish, servesPeople: 3 });
  assert.equal(result.quantity, 1);
  assert.equal(result.pricePerPerson, '7000.00');
});
test('quantité arrondie vers le haut, pas de portion fractionnée', () => {
  const result = proposeDish('30000.00', 5, { ...dish, servesPeople: 3 });
  assert.equal(result.quantity, 2);
  assert.equal(result.total, '28000.00');
});
test('HALF_UP en affichage seulement et aucun flottant sur montant', () => {
  const result = proposeDish('2.00', 2, { ...dish, unitPriceCdf: '1.01', servesPeople: 2 });
  assert.equal(result.pricePerPerson, '0.51');
  assert.equal(result.remainingBudget, '0.99');
  assert.equal(parseCdf('999999999999.99'), 99999999999999n);
});
test('portion inconnue, accompagnement ou contenu non public exclus', () => {
  for (const patch of [{servesPeople:null},{isMainDish:false},{eligible:false}]) {
    assert.equal(proposeDish('30000.00', 2, {...dish,...patch}), null);
  }
});
test('entrées malformées et valeurs hors limites rejetées', () => {
  for (const value of ['1e3', 'NaN', '-1.00', '00.10', '1.001', '1000', '1,00']) {
    assert.throws(() => parseCdf(value));
  }
  for (const people of [0,21,1.5,NaN]) assert.throws(() => proposeDish('30000.00',people,dish));
  for (const budget of ['0.00','0.99','10000000.01']) assert.throws(() => proposeDish(budget,2,dish));
  for (const servesPeople of [0,21,1.5]) assert.throws(() => proposeDish('30000.00',2,{...dish,servesPeople}));
  assert.throws(() => proposeDish('30000.00',2,{...dish,unitPriceCdf:'0.00'}));
});
