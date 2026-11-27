const faceBtn = document.getElementById("face-btn");
const totpBtn = document.getElementById("totp-btn");
const cameraSection = document.getElementById("camera-section");
const consent = document.getElementById("consent");
const preview = document.getElementById("preview");
const startBtn = document.getElementById("start-camera");
const captureBtn = document.getElementById("capture-btn");
const cancelBtn = document.getElementById("cancel-btn");
const status = document.getElementById("status");

let stream = null;
let generation = 0;
let cameraTimer = null;
const CAMERA_TIMEOUT_MS = 60000;
function stopCamera() {
                 clearTimeout(cameraTimer);
    cameraTimer = null; generation++;

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }

    preview.srcObject = null;
    captureBtn.disabled = true;
    startBtn.disabled = false;
}

faceBtn.addEventListener("click", () => {
    cameraSection.hidden = false;
    status.textContent = "Camera test only. Authentication is not connected.";
});

totpBtn.addEventListener("click", () => {
    stopCamera();
    consent.checked = false;
    cameraSection.hidden = true;
    alert("TOTP integration is pending.");
});

startBtn.addEventListener("click", async () => {
    if (!consent.checked) {
        status.textContent = "Please provide consent first.";
        return;
    }

    stopCamera();

    if (!window.isSecureContext ||
        !navigator.mediaDevices?.getUserMedia) {
        stopCamera();
        status.textContent =
            "Camera requires a secure browser context.";
        return;
    }

    const request = generation;
    startBtn.disabled = true;
    cameraTimer = setTimeout(() => {
    stopCamera();
    consent.checked = false;

    status.textContent =
        "Camera session expired. Please provide consent and retry.";

}, CAMERA_TIMEOUT_MS);

    try {
        const newStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
        });

        if (request !== generation || !consent.checked) {
            newStream.getTracks().forEach(track => track.stop());
            return;
        }

        stream = newStream;
        preview.srcObject = stream;stream.getVideoTracks().forEach(track => {
    track.addEventListener("ended", () => {
        if (request !== generation) return;

        stopCamera();

        status.textContent =
            "Camera disconnected. Please reconnect and retry.";
    });
});
        status.textContent = "Camera is ready.";

    } catch (error) {
        if (request !== generation) return;
        stopCamera();
        const messages = {
    NotAllowedError:
        "Camera permission denied. Please allow access.",

    NotFoundError:
        "No camera detected. Please connect your camera.",

    NotReadableError:
        "Camera is busy or unavailable.",

    OverconstrainedError:
        "Camera settings are not supported.",

    SecurityError:
        "Camera access is blocked for security reasons."
};

status.textContent =
    messages[error.name] ||
    "Camera startup failed. Please try again."; }
});

cancelBtn.addEventListener("click", () => {
    stopCamera();
    consent.checked = false;
    cameraSection.hidden = true;
});

consent.addEventListener("change", () => {
    if (!consent.checked) {
        stopCamera();
        status.textContent = "Consent withdrawn.";
    }
});

window.addEventListener("pagehide", stopCamera);
const canvas = document.getElementById("canvas");
const MAX_IMAGE_BYTES = 1048576;

preview.addEventListener("playing", () => {
    if (stream && consent.checked) {
        captureBtn.disabled = false;
    }
});

captureBtn.addEventListener("click", () => {
    if (!stream || !consent.checked ||
        !preview.videoWidth || !preview.videoHeight) {
        stopCamera();
        status.textContent = "Camera is not ready.";
        return;
    }

    try {
        const scale = Math.min(
            1,
            640 / Math.max(preview.videoWidth, preview.videoHeight)
        );

        canvas.width = Math.round(preview.videoWidth * scale);
        canvas.height = Math.round(preview.videoHeight * scale);

        const context = canvas.getContext("2d");

        context.drawImage(
            preview, 0, 0,
            canvas.width, canvas.height
        );

        stopCamera();
        const request = generation;

        canvas.toBlob((blob) => {
            if (request !== generation || !consent.checked) {
                return;
            }

            if (!blob || blob.type !== "image/jpeg") {
                status.textContent = "Image capture failed.";
                return;
            }

            if (blob.size > MAX_IMAGE_BYTES) {
                status.textContent = "Image is too large. Please retry.";
                return;
            }

            const operations = {
    "Face Verification": "verify",
    "Face Enrollment": "enroll",
    "Face Replacement": "replace"
};

const operation = operations[cameraTitle.textContent];

const result = submitDemoCapture(operation, blob);

const sizeKB = (blob.size / 1024).toFixed(2);

status.textContent = result.accepted
    ? result.message + " Image size: " + sizeKB + " KB."
    : result.message;

        }, "image/jpeg", 0.85);

    } catch (error) {
        stopCamera();
        status.textContent = "Capture failed. Please retry.";
    } finally {
        canvas.width = 0;
        canvas.height = 0;
    }
});
const enrollBtn = document.getElementById("enroll-btn");
const replaceBtn = document.getElementById("replace-btn");
const cameraTitle = cameraSection.querySelector("h2");

function openCaptureDemo(operation) {
    stopCamera();
    consent.checked = false;
    cameraSection.hidden = false;
    cameraTitle.textContent = operation;

    status.textContent =
        "Demo only. No real enrollment or replacement.";
}

enrollBtn.disabled = false;
replaceBtn.disabled = false;

enrollBtn.textContent = "Enroll Face (Demo)";
replaceBtn.textContent = "Replace Face (Demo)";

enrollBtn.addEventListener("click", () => {
    openCaptureDemo("Face Enrollment");
});

replaceBtn.addEventListener("click", () => {
    openCaptureDemo("Face Replacement");
});

faceBtn.addEventListener("click", () => {
    openCaptureDemo("Face Verification");
});
