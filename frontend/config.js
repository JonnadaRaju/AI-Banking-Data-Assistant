let SARVAM_AI_CONFIG = {
    API_KEY: "",
    STT_ENDPOINT: "https://api.sarvam.ai/speech-to-text",
    TRANSLATE_ENDPOINT: "https://api.sarvam.ai/translate",
    TTS_ENDPOINT: "https://api.sarvam.ai/text-to-speech"
};

fetch(`${API_URL}/config`)
    .then(r => r.json())
    .then(data => {
        if (data.sarvam_api_key) {
            SARVAM_AI_CONFIG.API_KEY = data.sarvam_api_key;
        }
    })
    .catch(err => console.error("Could not load config:", err));