// --- Voice Assistant Service ---

// DOM Elements
const voiceBtn = document.getElementById("voiceBtn");
const voiceStatus = document.getElementById("voiceStatus");

// State
let mediaRecorder;
let mediaStream;
let audioChunks = [];
let isRecording = false;
let originalQueryLanguage = 'en-IN'; // Default to English
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
            queryForBackend = await translateText(userQuery, 'en-IN');
        }

        // 3. Submit to backend
        if (queryForBackend) {
            queryInput.value = queryForBackend;
            submitQuery(); // This function is in app.js
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
        if (!AudioCtx) {
            return;
        }

        audioContext = new AudioCtx();
        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 2048;
        sourceNode = audioContext.createMediaStreamSource(stream);
        sourceNode.connect(analyserNode);

        const data = new Uint8Array(analyserNode.fftSize);

        silenceCheckInterval = setInterval(() => {
            if (!isRecording || !mediaRecorder || mediaRecorder.state === "inactive") {
                return;
            }

            analyserNode.getByteTimeDomainData(data);
            let sumSquares = 0;
            for (let i = 0; i < data.length; i++) {
                const normalized = (data[i] - 128) / 128;
                sumSquares += normalized * normalized;
            }

            const rms = Math.sqrt(sumSquares / data.length);
            const now = Date.now();

            if (recordingStartTime && now - recordingStartTime < INITIAL_SPEECH_GRACE_MS) {
                return;
            }

            if (rms < SILENCE_THRESHOLD_RMS) {
                if (!silenceStartTime) {
                    silenceStartTime = now;
                }
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
        try {
            sourceNode.disconnect();
        } catch (_) {}
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
    if (!mediaStream) {
        return;
    }
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
}


// --- API Communication ---

async function sendToSTT(audioBlob) {
    setVoiceStatus("Converting speech to text...", false);

    const config = getSarvamConfig();
    if (!config.API_KEY || !config.STT_ENDPOINT) {
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
            return {
                text: result.transcript.trim(),
                language: normalizeLanguageCode(result.language_code)
            };
        } catch (err) {
            lastError = err;

            if (err.code === "network") {
                throw err;
            }
            if (err.code === "http" && err.status === 401) {
                throw err;
            }
            // Keep trying other languages for payload/empty transcript or non-fatal HTTP errors.
        }
    }

    if (lastError && lastError.code === "empty_transcript") {
        throw new Error("No speech was detected. Please try speaking again.");
    }
    if (lastError) {
        throw lastError;
    }
    throw new Error("Could not transcribe audio. Please try again.");
}

async function requestSTT(audioBlob, language, config) {
    const formData = new FormData();
    formData.append("file", audioBlob, "recording.wav");
    if (language) {
        formData.append("language", language);
    }

    let response;
    try {
        response = await fetch(config.STT_ENDPOINT, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${config.API_KEY}`
            },
            body: formData
        });
    } catch (err) {
        console.error("Fetch call to STT API failed directly. This is likely a network or CORS issue.", err);
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
        console.error("Failed to parse STT API response as JSON:", responseText);
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
    if (typeof SARVAM_AI_CONFIG === "undefined") {
        throw new Error("Sarvam config is missing. Create frontend/config.js and define SARVAM_AI_CONFIG.");
    }
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
    if (!raw) return "en-IN";

    const lower = raw.toLowerCase();
    if (lower.startsWith("te")) return "te-IN";
    if (lower.startsWith("hi")) return "hi-IN";
    if (lower.startsWith("ta")) return "ta-IN";
    if (lower.startsWith("kn")) return "kn-IN";
    if (lower.startsWith("ml")) return "ml-IN";
    if (lower.startsWith("bn")) return "bn-IN";
    if (lower.startsWith("en")) return "en-IN";
    return raw;
}

async function translateText(text, targetLanguage) {
    setVoiceStatus("Translating...", false);

    const config = getSarvamConfig();
    if (!config.API_KEY || !config.TRANSLATE_ENDPOINT) {
        throw new Error("Sarvam AI API key or Translate endpoint is not configured.");
    }

    const response = await fetch(config.TRANSLATE_ENDPOINT, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${config.API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            text: text,
            target_language: targetLanguage
            // The source_language might be an optional parameter.
            // If the STT service provides it, we could pass it here.
            // source_language: originalQueryLanguage 
        })
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("Translate API Error:", errorBody);
        throw new Error(`Translation API request failed: ${response.statusText}`);
    }

    const result = await response.json();

    // Assuming the API returns a response like: { "translated_text": "..." }
    if (!result || !result.translated_text) {
        throw new Error("Received an invalid response from the Translate API.");
    }

    return result.translated_text;
}

async function speakText(textToSpeak) {
    console.log(`Requesting TTS for: "${textToSpeak}" in language ${originalQueryLanguage}`);
    setVoiceStatus("Generating voice reply...", false);

    const config = getSarvamConfig();
    if (!config.API_KEY || !config.TTS_ENDPOINT) {
        throw new Error("Sarvam AI API key or TTS endpoint is not configured.");
    }

    try {
        const response = await fetch(config.TTS_ENDPOINT, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${config.API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                text: textToSpeak,
                language: originalQueryLanguage
                // The API might require a specific voice ID as well
                // voice: 'voice-id-for-telugu' 
            })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error("TTS API Error:", errorBody);
            throw new Error(`Text-to-Speech API request failed: ${response.statusText}`);
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.play();
        
        audio.onended = () => {
            clearVoiceStatus(100);
        };

    } catch (error) {
        console.error("TTS failed:", error);
        showVoiceError("Sorry, could not play the voice reply.");
        clearVoiceStatus(5000);
    }
}


// --- UI and Status Updates ---

function updateUIRecording(isRecording) {
    if (isRecording) {
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

// --- Initializer ---
// The call to initializeVoiceAssistant() will be in app.js
// to ensure all DOM elements are loaded.
