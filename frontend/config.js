// AI Banking Data Assistant - Frontend Config

const API_URL = "https://ai-banking-data-assistant-bac.onrender.com";

let SARVAM_AI_CONFIG = {
    API_KEY: "",
    STT_ENDPOINT: "https://api.sarvam.ai/speech-to-text",
    TRANSLATE_ENDPOINT: "https://api.sarvam.ai/translate",
    TTS_ENDPOINT: "https://api.sarvam.ai/text-to-speech",
    STT_INPUT_LANGUAGE: "auto",
    STT_FALLBACK_LANGUAGES: ["te-IN","hi-IN","ta-IN","kn-IN","ml-IN","bn-IN","en-IN"]
};

(async function loadSarvamConfig() {
    try {
        const res = await fetch(API_URL + "/config");
        if (!res.ok) return;
        const data = await res.json();
        if (data.sarvam_api_key) SARVAM_AI_CONFIG.API_KEY = data.sarvam_api_key;
        if (data.sarvam_stt_endpoint) SARVAM_AI_CONFIG.STT_ENDPOINT = data.sarvam_stt_endpoint;
        console.log("Sarvam config loaded.");
    } catch(e) {
        console.warn("Could not fetch Sarvam config:", e.message);
    }
})();