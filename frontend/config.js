// ── Backend API URL ───────────────────────────────────────────────────────────
const API_URL = "http://localhost:8000";

// ── Sarvam AI Configuration (Voice Assistant) ─────────────────────────────────
// API key is fetched securely from the backend /config endpoint
// so it never needs to be hardcoded here.

let SARVAM_AI_CONFIG = null;

(async function loadConfig() {
    try {
        const response = await fetch(`${API_URL}/config`);
        if (!response.ok) throw new Error(`Config fetch failed: ${response.status}`);
        const data = await response.json();

        if (data.sarvam_api_key) {
            SARVAM_AI_CONFIG = {
                API_KEY: data.sarvam_api_key,

                STT_ENDPOINT:       "https://api.sarvam.ai/speech-to-text",
                TRANSLATE_ENDPOINT: "https://api.sarvam.ai/translate",
                TTS_ENDPOINT:       "https://api.sarvam.ai/text-to-speech",

                // Set to "auto" to detect language automatically,
                // or use a specific code: "en-IN", "hi-IN", "te-IN", etc.
                STT_INPUT_LANGUAGE: "auto",

                // Fallback languages tried in order when STT_INPUT_LANGUAGE is "auto"
                STT_FALLBACK_LANGUAGES: [
                    "te-IN", "hi-IN", "ta-IN", "kn-IN", "ml-IN", "bn-IN", "en-IN"
                ]
            };
            console.log("Sarvam AI config loaded successfully.");
        } else {
            console.warn("Sarvam API key not returned by backend. Voice features disabled.");
        }
    } catch (err) {
        console.warn("Could not load config from backend. Voice features disabled.", err);
    }
})();