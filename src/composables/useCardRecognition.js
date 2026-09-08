import { ref } from 'vue';
import {
  GEMINI_MODEL,
  CARD_RESPONSE_SCHEMA,
  CARD_RECOGNITION_PROMPT,
  CardRecognitionError,
  RECOGNITION_ERROR,
  parseGeminiJson,
  normalizeRecognizedCards,
  mapAiError
} from '../utils/cardRecognition.js';
import { fileToCompressedBase64 } from '../utils/imageCompression.js';
import { logger } from '../utils/logger.js';
import { app, ensureAppCheck } from '../firebase-init.js';

// Module-level singleton so the firebase/ai chunk and the model are only
// created once per page load, and only after the user actually taps the button.
let modelPromise = null;

async function getModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      // Lazy: firebase/ai is only downloaded when recognition is first used.
      const ai = await import('firebase/ai');
      // App Check is enforced for Firebase AI Logic; must be initialised before getAI().
      await ensureAppCheck();
      const aiInstance = ai.getAI(app, { backend: new ai.GoogleAIBackend() });
      return ai.getGenerativeModel(aiInstance, {
        model: GEMINI_MODEL,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: CARD_RESPONSE_SCHEMA,
          temperature: 0
        }
      });
    })().catch((e) => {
      modelPromise = null; // allow a retry on the next call
      throw e;
    });
  }
  return modelPromise;
}

/**
 * Composable: photo → Gemini (Firebase AI Logic) → card strings ("A♠", "10♥").
 */
export function useCardRecognition() {
  const loading = ref(false);
  const errorCode = ref(null);

  /**
   * @param {File|Blob} file Image picked by the user
   * @returns {Promise<string[]>} Recognised cards in app notation
   * @throws {CardRecognitionError} with `.code` from RECOGNITION_ERROR
   */
  const recognizeCards = async (file) => {
    loading.value = true;
    errorCode.value = null;
    try {
      const { data, mimeType } = await fileToCompressedBase64(file);
      const model = await getModel();
      const result = await model.generateContent({
        contents: [{
          role: 'user',
          parts: [
            { text: CARD_RECOGNITION_PROMPT },
            { inlineData: { mimeType, data } }
          ]
        }]
      });
      const cards = normalizeRecognizedCards(parseGeminiJson(result.response.text()));
      if (cards.length === 0) {
        throw new CardRecognitionError(RECOGNITION_ERROR.NO_CARDS);
      }
      return cards;
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
