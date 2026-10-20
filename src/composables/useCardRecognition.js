import { ref } from 'vue';
import {
  GEMINI_MODEL,
  GEMINI_THINKING_LEVEL,
  CARD_RESPONSE_SCHEMA,
  CARD_RECOGNITION_PROMPT,
  CardRecognitionError,
  RECOGNITION_ERROR,
  parseGeminiJson,
  normalizeRecognition,
  mapAiError
} from '../utils/cardRecognition.js';
import { fileToCompressedBase64 } from '../utils/imageCompression.js';
import { logger } from '../utils/logger.js';
import { app, ensureAppCheck } from '../firebase-init.js';

/**
 * Loader for a Gemini model that answers JSON in the given schema. The
 * firebase/ai chunk and the model are only created once per page load, and
 * only after the user actually taps something; a failed load is retried on
 * the next call. Also used for receipt recognition (useEventExpenses).
 * @param {object} responseSchema firebase/ai SchemaRequest literal
 * @returns {() => Promise<object>} resolves to the GenerativeModel
 */
export function lazyGeminiJsonModel(responseSchema) {
  let modelPromise = null;
  return () => {
    if (!modelPromise) {
      modelPromise = (async () => {
        // Lazy: firebase/ai is only downloaded when recognition is first used.
        const ai = await import('firebase/ai');
        // App Check is enforced for Firebase AI Logic; must be initialised before getAI().
        await ensureAppCheck();
        const aiInstance = ai.getAI(app, { backend: new ai.GoogleAIBackend() });
        return ai.getGenerativeModel(aiInstance, {
          model: GEMINI_MODEL,
          // No temperature: 3.8 Flash's migration notes say to drop it
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema,
            thinkingConfig: { thinkingLevel: ai.ThinkingLevel?.[GEMINI_THINKING_LEVEL] || GEMINI_THINKING_LEVEL }
          }
        });
      })().catch((e) => {
        modelPromise = null; // allow a retry on the next call
        throw e;
      });
    }
    return modelPromise;
  };
}

const getModel = lazyGeminiJsonModel(CARD_RESPONSE_SCHEMA);

/**
 * Start loading firebase/ai and App Check (reCAPTCHA token) in the background,
 * e.g. when the camera / picker opens, so the first recognition doesn't wait
 * for them. Safe to call repeatedly; a failure is retried on real use.
 */
export function prewarmCardRecognition() {
  getModel().catch(() => {});
}

/**
 * Composable: photo → Gemini (Firebase AI Logic) → card strings ("A♠", "10♥").
 */
export function useCardRecognition() {
  const loading = ref(false);
  const errorCode = ref(null);

  /**
   * @param {File|Blob} file Image picked by the user
   * @returns {Promise<{ cards: Array<{ card: string, group: number }>, communityGroup: number | null }>}
   *   Recognised cards in app notation, grouped by physical placement
   * @throws {CardRecognitionError} with `.code` from RECOGNITION_ERROR
   */
  const recognizeCards = async (file) => {
    loading.value = true;
    errorCode.value = null;
    const t0 = performance.now();
    const timing = {};
    try {
      const { data, mimeType } = await fileToCompressedBase64(file);
      timing.compress = performance.now() - t0;
      const model = await getModel();
      timing.prepare = performance.now() - t0 - timing.compress;
      const t1 = performance.now();
      const result = await model.generateContent({
        contents: [{
          role: 'user',
          parts: [
            { text: CARD_RECOGNITION_PROMPT },
            { inlineData: { mimeType, data } }
          ]
        }]
      });
      timing.gemini = performance.now() - t1;
      // Where the time goes (always logged: phones are where it matters)
      console.info('[cardRecognition] timing ms', {
        compress: Math.round(timing.compress),
        prepare: Math.round(timing.prepare),
        gemini: Math.round(timing.gemini),
        total: Math.round(performance.now() - t0),
        kb: Math.round((data.length * 3) / 4 / 1024),
        model: GEMINI_MODEL,
        thinking: GEMINI_THINKING_LEVEL,
      });
      const recognition = normalizeRecognition(parseGeminiJson(result.response.text()));
      if (recognition.cards.length === 0) {
        throw new CardRecognitionError(RECOGNITION_ERROR.NO_CARDS);
      }
      return recognition;
    } catch (e) {
      const code = mapAiError(e);
      errorCode.value = code;
      logger.warn('[cardRecognition]', code, e);
      throw e instanceof CardRecognitionError ? e : new CardRecognitionError(code, e);
    } finally {
      loading.value = false;
    }
  };

  return { loading, errorCode, recognizeCards };
}
