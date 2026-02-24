// --- Voice Assistant Service ---

// DOM Elements
const voiceBtn = document.getElementById("voiceBtn");
const voiceStatus = document.getElementById("voiceStatus");

// State
let mediaRecorder;
let mediaStream;
let audioChunks = [];
let isRecording = false;
let originalQueryLanguage = 'en-IN';
let audioContext;
let analyserNode;
let sourceNode;
let silenceCheckInterval;
let silenceStartTime = null;
let recordingStartTime = null;

const SILENCE_THRESHOLD_RMS = 0.02;
const SILENCE_DURATION_MS = 1800;
const INITIAL_SPEECH_GRACE_MS = 1200;
const SILENCE_CHECK_INTERVAL_MS = 150;
const DEFAULT_STT_FALLBACK_LANGUAGES = [
    "te-IN", "hi-IN", "ta-IN", "kn-IN", "ml-IN", "bn-IN", "en-IN"
];
const SUPPORTED_LANGUAGE_CODES = new Set([
    "te-IN", "hi-IN", "ta-IN", "kn-IN", "ml-IN", "bn-IN", "en-IN"
]);

// --- Service Initialization ---

function initializeVoiceAssistant() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showVoiceError("Voice recording is not supported by your browser.");
        voiceBtn.disabled = true;
        return;
    }

    voiceBtn.addEventListener("click", toggleRecording);
    console.log("Voice assistant initialized.");
}

// --- Core Functions ---

async function toggleRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

async function startRecording() {
    let stream;
    try {
        stopSilenceDetection();
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        isRecording = true;
        mediaStream = stream;
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        silenceStartTime = null;
        recordingStartTime = Date.now();

        mediaRecorder.addEventListener("dataavailable", event => {
            audioChunks.push(event.data);
        });

        mediaRecorder.addEventListener("stop", handleRecordingStop);

        mediaRecorder.start();
        startSilenceDetection(stream);
        updateUIRecording(true);
    } catch (err) {
        console.error("Error accessing microphone:", err);
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        showVoiceError("Microphone access was denied. Please allow microphone permissions in your browser settings.");
        updateUIRecording(false);
    }
}

function stopRecording() {
    stopSilenceDetection();
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
}

async function handleRecordingStop() {
    isRecording = false;
    updateUIRecording(false);
    setVoiceStatus("Processing audio...", false);
    releaseMicrophone();

    const audioBlob = new Blob(audioChunks, { type: "audio/wav" });

    try {
        // 1. Send to STT
        const sttResponse = await sendToSTT(audioBlob);
        const userQuery = sttResponse.text;
        originalQueryLanguage = sttResponse.language;

        setVoiceStatus(`Heard: "${userQuery}"`, false);

        // 2. Translate if necessary
        let queryForBackend = userQuery;
        if (originalQueryLanguage !== 'en-IN' && userQuery) {
            setVoiceStatus("Translating to English...", false);
            try {
                queryForBackend = await translateText(userQuery, 'en-IN');
            } catch (translateError) {
                console.warn("Translation failed, using original transcript:", translateError);
                setVoiceStatus("Translation failed. Trying original query...", true);
            }
        }

        // 3. Submit to backend
        if (queryForBackend) {
            queryInput.value = queryForBackend;
            submitQuery();
        }
        clearVoiceStatus(4000);

    } catch (error) {
        console.error("Voice processing failed:", error);
        showVoiceError(error.message);
        clearVoiceStatus(5000);
    }
}

function startSilenceDetection(stream) {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;

        audioContext = new AudioCtx();
        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 2048;
        sourceNode = audioContext.createMediaStreamSource(stream);
        sourceNode.connect(analyserNode);

        const data = new Uint8Array(analyserNode.fftSize);

        silenceCheckInterval = setInterval(() => {
            if (!isRecording || !mediaRecorder || mediaRecorder.state === "inactive") return;

            analyserNode.getByteTimeDomainData(data);
            let sumSquares = 0;
            for (let i = 0; i < data.length; i++) {
                const normalized = (data[i] - 128) / 128;
                sumSquares += normalized * normalized;
            }

            const rms = Math.sqrt(sumSquares / data.length);
            const now = Date.now();

            if (recordingStartTime && now - recordingStartTime < INITIAL_SPEECH_GRACE_MS) return;

            if (rms < SILENCE_THRESHOLD_RMS) {
                if (!silenceStartTime) silenceStartTime = now;
                if (now - silenceStartTime >= SILENCE_DURATION_MS) {
                    setVoiceStatus("Silence detected. Stopping...", false);
                    stopRecording();
                }
            } else {
                silenceStartTime = null;
            }
        }, SILENCE_CHECK_INTERVAL_MS);
    } catch (error) {
        console.warn("Could not enable silence detection:", error);
    }
}

function stopSilenceDetection() {
    if (silenceCheckInterval) {
        clearInterval(silenceCheckInterval);
        silenceCheckInterval = null;
    }

    if (sourceNode) {
        try { sourceNode.disconnect(); } catch (_) {}
        sourceNode = null;
    }

    analyserNode = null;
    silenceStartTime = null;
    recordingStartTime = null;

    if (audioContext) {
        audioContext.close().catch(() => {});
        audioContext = null;
    }
}

function releaseMicrophone() {
    if (!mediaStream) return;
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
}


// --- API Communication ---

async function sendToSTT(audioBlob) {
    setVoiceStatus("Converting speech to text...", false);

    const config = getSarvamConfig();
    if (!config || !config.API_KEY || !config.STT_ENDPOINT) {
        throw new Error("Sarvam AI API key or STT endpoint is not configured.");
    }

    const configuredInputLanguage = (config.STT_INPUT_LANGUAGE || "auto").trim();
    const attemptLanguages = configuredInputLanguage.toLowerCase() === "auto"
        ? [null, ...getSttFallbackLanguages(config)]
        : [configuredInputLanguage];

    let lastError = null;
    for (const language of attemptLanguages) {
        try {
            const result = await requestSTT(audioBlob, language, config);
            const detectedLanguage = normalizeLanguageCode(result.language_code);
            const resolvedLanguage = detectedLanguage || normalizeLanguageCode(language) || "en-IN";
            return {
                text: result.transcript.trim(),
                language: resolvedLanguage
            };
        } catch (err) {
            lastError = err;
            if (err.code === "network") throw err;
            if (err.code === "http" && err.status === 401) throw err;
        }
    }

    if (lastError && lastError.code === "empty_transcript") {
        throw new Error("No speech was detected. Please try speaking again.");
    }
    if (lastError) throw lastError;
    throw new Error("Could not transcribe audio. Please try again.");
}

async function requestSTT(audioBlob, language, config) {
    const formData = new FormData();
    formData.append("file", audioBlob, "recording.wav");
    if (language) {
        formData.append("language_code", language);  // ✅ correct field name for Sarvam
    }

    let response;
    try {
        response = await fetch(config.STT_ENDPOINT, {
            method: "POST",
            headers: {
                "api-subscription-key": config.API_KEY  // ✅ correct Sarvam header
            },
            body: formData
        });
    } catch (err) {
        console.error("STT fetch failed:", err);
        const error = new Error("Network error or CORS issue when calling STT API.");
        error.code = "network";
        throw error;
    }

    const responseText = await response.text();

    if (!response.ok) {
        console.error("STT API Error Response:", responseText);
        const error = new Error(`Speech-to-Text API request failed: ${response.status} ${response.statusText}`);
        error.code = "http";
        error.status = response.status;
        throw error;
    }

    let result;
    try {
        result = JSON.parse(responseText);
    } catch (e) {
        console.error("Failed to parse STT response:", responseText);
        const error = new Error("Received a non-JSON response from the STT API.");
        error.code = "invalid_json";
        throw error;
    }

    console.log("Full STT API Response:", result);

    if (!result || typeof result.transcript === 'undefined') {
        const error = new Error("API response is missing the 'transcript' field.");
        error.code = "invalid_payload";
        throw error;
    }

    if (!result.transcript.trim()) {
        const error = new Error("No speech was detected. Please try speaking again.");
        error.code = "empty_transcript";
        throw error;
    }

    return result;
}

function getSarvamConfig() {
    if (typeof SARVAM_AI_CONFIG === "undefined") return null;
    return SARVAM_AI_CONFIG;
}

function getSttFallbackLanguages(config) {
    if (Array.isArray(config.STT_FALLBACK_LANGUAGES) && config.STT_FALLBACK_LANGUAGES.length > 0) {
        return config.STT_FALLBACK_LANGUAGES.filter(Boolean);
    }
    return DEFAULT_STT_FALLBACK_LANGUAGES;
}

function normalizeLanguageCode(languageCode) {
    const raw = (languageCode || "").trim();
    if (!raw) return "";

    const lower = raw.toLowerCase();
    if (lower.startsWith("te")) return "te-IN";
    if (lower.startsWith("hi")) return "hi-IN";
    if (lower.startsWith("ta")) return "ta-IN";
    if (lower.startsWith("kn")) return "kn-IN";
    if (lower.startsWith("ml")) return "ml-IN";
    if (lower.startsWith("bn")) return "bn-IN";
    if (lower.startsWith("en")) return "en-IN";
    if (SUPPORTED_LANGUAGE_CODES.has(raw)) return raw;
    return "";
}

async function translateText(text, targetLanguage) {
    setVoiceStatus("Translating...", false);

    const config = getSarvamConfig();
    if (!config || !config.API_KEY || !config.TRANSLATE_ENDPOINT) {
        throw new Error("Sarvam AI API key or Translate endpoint is not configured.");
    }

    try {
        const response = await fetch(config.TRANSLATE_ENDPOINT, {
            method: "POST",
            headers: {
                "api-subscription-key": config.API_KEY,  // ✅ correct Sarvam header
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                input: text,
                source_language_code: originalQueryLanguage,
                target_language_code: targetLanguage,
                speaker_gender: "Female",
                mode: "formal",
                model: "mayura:v1",
                enable_preprocessing: false
            })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error("Translate API Error:", errorBody);
            throw new Error(`Translation API request failed: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        console.log("Translate API Response:", result);

        const translated = result.translated_text
            || result.translation
            || result.output
            || "";

        if (!translated) {
            throw new Error("Empty translation response from Sarvam API.");
        }

        return translated;

    } catch (error) {
        console.error("Translation error:", error);
        throw error;
    }
}

async function speakText(textToSpeak) {
    console.log(`Requesting TTS for: "${textToSpeak}" in language ${originalQueryLanguage}`);
    setVoiceStatus("Generating voice reply...", false);

    const config = getSarvamConfig();
    if (!config || !config.API_KEY || !config.TTS_ENDPOINT) {
        throw new Error("Sarvam AI API key or TTS endpoint is not configured.");
    }

    try {
        const response = await fetch(config.TTS_ENDPOINT, {
            method: "POST",
            headers: {
                "api-subscription-key": config.API_KEY,  // ✅ correct Sarvam header
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                inputs: [textToSpeak],
                target_language_code: originalQueryLanguage,
                speaker: "meera",
                pitch: 0,
                pace: 1.0,
                loudness: 1.5,
                enable_preprocessing: false,
                model: "bulbul:v1"
            })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error("TTS API Error:", errorBody);
            throw new Error(`Text-to-Speech API request failed: ${response.statusText}`);
        }

        const result = await response.json();
        console.log("TTS API Response:", result);

        // Sarvam TTS returns base64 audio
        if (result.audios && result.audios.length > 0) {
            const base64Audio = result.audios[0];
            const audioBlob = base64ToBlob(base64Audio, "audio/wav");
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audio.play();
            audio.onended = () => clearVoiceStatus(100);
        } else {
            throw new Error("No audio returned from TTS API.");
        }

    } catch (error) {
        console.error("TTS failed:", error);
        showVoiceError("Sorry, could not play the voice reply.");
        clearVoiceStatus(5000);
    }
}

function base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
}


// --- UI and Status Updates ---

function updateUIRecording(recording) {
    if (recording) {
        voiceBtn.classList.add("recording");
        voiceBtn.title = "Stop recording";
        setVoiceStatus("Listening...", false);
    } else {
        voiceBtn.classList.remove("recording");
        voiceBtn.title = "Ask with voice";
    }
}

function setVoiceStatus(message, isError) {
    voiceStatus.textContent = message;
    voiceStatus.style.color = isError ? "#c53030" : "#555";
}

function showVoiceError(message) {
    setVoiceStatus(message, true);
}

function clearVoiceStatus(delay = 0) {
    setTimeout(() => {
        voiceStatus.textContent = "";
    }, delay);
}