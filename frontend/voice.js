// --- Voice Assistant Service ---

const voiceBtn = document.getElementById("voiceBtn");
const voiceStatus = document.getElementById("voiceStatus");

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

function initializeVoiceAssistant() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showVoiceError("Voice recording is not supported by your browser.");
        voiceBtn.disabled = true;
        return;
    }
    voiceBtn.addEventListener("click", toggleRecording);
    console.log("Voice assistant initialized.");
}

async function toggleRecording() {
    if (isRecording) stopRecording();
    else startRecording();
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

        mediaRecorder.addEventListener("dataavailable", event => audioChunks.push(event.data));
        mediaRecorder.addEventListener("stop", handleRecordingStop);
        mediaRecorder.start();
        startSilenceDetection(stream);
        updateUIRecording(true);
    } catch (err) {
        console.error("Microphone error:", err);
        if (stream) stream.getTracks().forEach(t => t.stop());
        showVoiceError("Microphone access denied. Allow mic permissions in browser settings.");
        updateUIRecording(false);
    }
}

function stopRecording() {
    stopSilenceDetection();
    if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
}

async function handleRecordingStop() {
    isRecording = false;
    updateUIRecording(false);
    setVoiceStatus("Processing audio...", false);
    releaseMicrophone();

    const audioBlob = new Blob(audioChunks, { type: "audio/wav" });

    try {
        const sttResponse = await sendToSTT(audioBlob);
        const userQuery = sttResponse.text;
        originalQueryLanguage = sttResponse.language;

        setVoiceStatus(`Heard: "${userQuery}"`, false);

        let queryForBackend = userQuery;
        if (originalQueryLanguage !== 'en-IN' && userQuery) {
            setVoiceStatus("Translating to English...", false);
            try {
                queryForBackend = await translateText(userQuery, 'en-IN');
            } catch (translateError) {
                console.warn("Translation failed, using original:", translateError);
                setVoiceStatus("Translation failed. Trying original query...", true);
            }
        }

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
                const n = (data[i] - 128) / 128;
                sumSquares += n * n;
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
        console.warn("Silence detection unavailable:", error);
    }
}

function stopSilenceDetection() {
    if (silenceCheckInterval) { clearInterval(silenceCheckInterval); silenceCheckInterval = null; }
    if (sourceNode) { try { sourceNode.disconnect(); } catch (_) {} sourceNode = null; }
    analyserNode = null;
    silenceStartTime = null;
    recordingStartTime = null;
    if (audioContext) { audioContext.close().catch(() => {}); audioContext = null; }
}

function releaseMicrophone() {
    if (!mediaStream) return;
    mediaStream.getTracks().forEach(t => t.stop());
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
            return { text: result.transcript.trim(), language: resolvedLanguage };
        } catch (err) {
            lastError = err;
            if (err.code === "network") throw err;
            if (err.code === "http" && err.status === 401) throw err;
        }
    }

    if (lastError && lastError.code === "empty_transcript")
        throw new Error("No speech detected. Please try speaking again.");
    if (lastError) throw lastError;
    throw new Error("Could not transcribe audio. Please try again.");
}

async function requestSTT(audioBlob, language, config) {
    const formData = new FormData();
    formData.append("file", audioBlob, "recording.wav");
    if (language) formData.append("language_code", language);

    let response;
    try {
        response = await fetch(config.STT_ENDPOINT, {
            method: "POST",
            headers: { "api-subscription-key": config.API_KEY },
            body: formData
        });
    } catch (err) {
        const error = new Error("Network error when calling STT API.");
        error.code = "network";
        throw error;
    }

    const responseText = await response.text();
    if (!response.ok) {
        const error = new Error(`STT API failed: ${response.status} ${response.statusText}`);
        error.code = "http";
        error.status = response.status;
        throw error;
    }

    let result;
    try { result = JSON.parse(responseText); }
    catch (e) { const err = new Error("Non-JSON response from STT API."); err.code = "invalid_json"; throw err; }

    if (!result || typeof result.transcript === 'undefined') {
        const err = new Error("API response missing 'transcript' field."); err.code = "invalid_payload"; throw err;
    }
    if (!result.transcript.trim()) {
        const err = new Error("No speech detected. Please try again."); err.code = "empty_transcript"; throw err;
    }

    return result;
}

function getSarvamConfig() {
    if (typeof SARVAM_AI_CONFIG === "undefined") return null;
    return SARVAM_AI_CONFIG;
}

function getSttFallbackLanguages(config) {
    if (Array.isArray(config.STT_FALLBACK_LANGUAGES) && config.STT_FALLBACK_LANGUAGES.length > 0)
        return config.STT_FALLBACK_LANGUAGES.filter(Boolean);
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
    if (!config || !config.API_KEY || !config.TRANSLATE_ENDPOINT)
        throw new Error("Sarvam AI translate endpoint not configured.");

    const response = await fetch(config.TRANSLATE_ENDPOINT, {
        method: "POST",
        headers: {
            "api-subscription-key": config.API_KEY,
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
        const err = await response.text();
        throw new Error(`Translate API failed: ${response.status} — ${err}`);
    }

    const result = await response.json();
    const translated = result.translated_text || result.translation || result.output || "";
    if (!translated) throw new Error("Empty translation response.");
    return translated;
}

async function speakText(textToSpeak) {
    setVoiceStatus("Generating voice reply...", false);

    const config = getSarvamConfig();
    if (!config || !config.API_KEY || !config.TTS_ENDPOINT)
        throw new Error("Sarvam AI TTS endpoint not configured.");

    const response = await fetch(config.TTS_ENDPOINT, {
        method: "POST",
        headers: {
            "api-subscription-key": config.API_KEY,
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
        const err = await response.text();
        throw new Error(`TTS API failed: ${response.statusText} — ${err}`);
    }

    const result = await response.json();
    if (result.audios && result.audios.length > 0) {
        const audioBlob = base64ToBlob(result.audios[0], "audio/wav");
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.play();
        audio.onended = () => clearVoiceStatus(100);
    } else {
        throw new Error("No audio returned from TTS API.");
    }
}

function base64ToBlob(base64, mimeType) {
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mimeType });
}

// --- UI Updates ---

function updateUIRecording(recording) {
    if (recording) {
        voiceBtn.classList.add("recording");
        voiceBtn.title = "Stop recording";
        setVoiceStatus("🎙 Listening...", false);
    } else {
        voiceBtn.classList.remove("recording");
        voiceBtn.title = "Ask with voice";
    }
}

function setVoiceStatus(message, isError) {
    voiceStatus.textContent = message;
    voiceStatus.style.color = isError ? "#f87171" : "#9f4040";
}

function showVoiceError(message) {
    setVoiceStatus("⚠ " + message, true);
}

function clearVoiceStatus(delay = 0) {
    setTimeout(() => { voiceStatus.textContent = ""; }, delay);
}