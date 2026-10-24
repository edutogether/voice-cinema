// 뒤에서 받기(엔진 · 완성용 원판)가 녹음실 장면 영상이 받히는 동안 쉬는 규칙(2026-10-24 «와이파이에서 너무 느림»).
import { describe, expect, test } from 'vitest';
import { backgroundTurn, holdBackground, readInBackground } from './backgroundLoad';

const settled = async (p: Promise<unknown>) => {
  let done = false;
  p.then(() => { done = true; });
  await new Promise((r) => setTimeout(r, 0));
  return done;
};

describe('holdBackground / backgroundTurn', () => {
  test('잡은 것이 없으면 뒤에서 받기는 바로 이어 간다', async () => {
    expect(await settled(backgroundTurn())).toBe(true);
  });

  test('앞에서 받는 영상이 잡고 있으면 기다리고, 놓으면 이어 간다', async () => {
    const release = holdBackground();
    const turn = backgroundTurn();
    expect(await settled(turn)).toBe(false);
    release();
    expect(await settled(turn)).toBe(true);
  });

  test('둘이 잡으면 둘 다 놓을 때까지 기다린다 — 한 번 놓기를 두 번 불러도 하나로 센다', async () => {
    const a = holdBackground();
    const b = holdBackground();
    const turn = backgroundTurn();
    a();
    a();
    expect(await settled(turn)).toBe(false);
    b();
    expect(await settled(turn)).toBe(true);
  });
});

describe('readInBackground', () => {
  test('잡혀 있는 동안은 다음 조각을 읽지 않고, 놓으면 끝까지 읽는다', async () => {
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5, 6])];
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulled < chunks.length) controller.enqueue(chunks[pulled++]);
        else controller.close();
      },
    }, { highWaterMark: 0 });
    const release = holdBackground();
    const got: number[] = [];
    const reading = readInBackground(new Response(body), (c) => got.push(...c));
    await new Promise((r) => setTimeout(r, 10));
    expect(got).toEqual([]);
    release();
    await reading;
    expect(got).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
