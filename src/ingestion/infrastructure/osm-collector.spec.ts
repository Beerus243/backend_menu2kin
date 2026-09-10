import { collectOsm, overpassQuery } from './osm-collector';
const payload = {
  osm3s: { timestamp_osm_base: '2026-09-07T00:00:00Z' },
  elements: [
    {
      type: 'relation',
      id: 5646651,
      tags: { boundary: 'administrative', name: 'Kinshasa' },
    },
  ],
};
it('borne les zones et cible la province Kinshasa', () => {
  expect(overpassQuery('kinshasa')).toContain('rel(5646651)');
  expect(() => overpassQuery('constructor' as never)).toThrow();
});
it('respecte Retry-After puis reprend sans réseau réel', async () => {
  let calls = 0;
  const delays: number[] = [];
  const fake: typeof fetch = async () =>
    ++calls === 1
      ? new Response('', { status: 429, headers: { 'Retry-After': '20' } })
      : Response.json(payload);
  expect(
    (
      await collectOsm('kinshasa', fake, async (ms) => {
        delays.push(ms);
      })
    ).attempts,
  ).toBe(2);
  expect(delays).toEqual([20000]);
});
it('refuse réponse partielle et attente longue', async () => {
  await expect(
    collectOsm('kinshasa', async () =>
      Response.json({ ...payload, remark: 'timeout' }),
    ),
  ).rejects.toThrow('INCOMPLETE');
  await expect(
    collectOsm(
      'kinshasa',
      async () =>
        new Response('', { status: 429, headers: { 'Retry-After': '120' } }),
    ),
  ).rejects.toThrow('RETRY_LATER');
});
