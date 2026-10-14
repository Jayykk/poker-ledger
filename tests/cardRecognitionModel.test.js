import { describe, it, expect, vi, beforeEach } from 'vitest';

// The model the card photo goes to: 3.8 Flash named explicitly (3.7 was
// retired and silently routed there), thinking LOW, no temperature, and the
// SDK + App Check warmed up while the camera is open.
const calls = vi.hoisted(() => ({ getAI: 0, getGenerativeModel: [], generate: 0, appCheck: 0 }));

vi.mock('firebase/ai', () => ({
  ThinkingLevel: { MINIMAL: 'MINIMAL', LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
  GoogleAIBackend: class {},
  getAI: () => { calls.getAI++; return {}; },
  getGenerativeModel: (_ai, opts) => {
    calls.getGenerativeModel.push(opts);
    return {
      generateContent: async () => {
        calls.generate++;
        return { response: { text: () => JSON.stringify({ cards: [{ rank: 'A', suit: 'spades', group: 0 }] }) } };
      },
    };
  },
}));
vi.mock('../src/firebase-init.js', () => ({
  app: {},
  ensureAppCheck: async () => { calls.appCheck++; },
}));
vi.mock('../src/utils/imageCompression.js', () => ({
  fileToCompressedBase64: async () => ({ data: 'AAAA', mimeType: 'image/jpeg' }),
}));

const { useCardRecognition, prewarmCardRecognition } = await import('../src/composables/useCardRecognition.js');
const { GEMINI_MODEL, GEMINI_THINKING_LEVEL } = await import('../src/utils/cardRecognition.js');

describe('card recognition model settings', () => {
  beforeEach(() => { vi.spyOn(console, 'info').mockImplementation(() => {}); });

  it('defaults: gemini-3.8-flash, thinking LOW', () => {
    expect(GEMINI_MODEL).toBe('gemini-3.8-flash');
    expect(GEMINI_THINKING_LEVEL).toBe('LOW');
  });

  it('prewarm builds the model once (SDK + App Check) without calling Gemini', async () => {
    prewarmCardRecognition();
    prewarmCardRecognition();
    await new Promise((r) => setTimeout(r, 0));
    expect(calls.getAI).toBe(1);
    expect(calls.appCheck).toBe(1);
    expect(calls.generate).toBe(0);
    const [opts] = calls.getGenerativeModel;
    expect(opts.model).toBe('gemini-3.8-flash');
    expect(opts.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
    expect(opts.generationConfig).not.toHaveProperty('temperature');
  });

  it('a recognition reuses the warmed model and logs where the time went', async () => {
    const { recognizeCards } = useCardRecognition();
    const out = await recognizeCards(new Blob(['x'], { type: 'image/jpeg' }));
    expect(out.cards.length).toBe(1);
    expect(calls.getAI).toBe(1);
    expect(calls.generate).toBe(1);
    const logged = console.info.mock.calls.find((c) => c[0] === '[cardRecognition] timing ms');
    expect(logged[1]).toMatchObject({ model: 'gemini-3.8-flash', thinking: 'LOW' });
    for (const k of ['compress', 'prepare', 'gemini', 'total', 'kb']) expect(typeof logged[1][k]).toBe('number');
  });
});

describe('the panel warms up when the camera / picker opens', () => {
  it('openPicker calls prewarmCardRecognition before opening the input', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const panel = readFileSync(resolve(__dirname, '..', 'src/components/game/CardRecognitionPanel.vue'), 'utf-8');
    expect(panel).toMatch(/const openPicker = \(input\) => \{[\s\S]*?prewarmCardRecognition\(\);\s*input\.click\(\);/);
  });
});
