function getApiErrorMessage(statusCode) {
    const messages = {
        400: "Invalid request. Please try again.",
        401: "Authentication required. Please log in again.",
        403: "Access denied.",
        409: "Attempt or approval expired or invalid.",
        413: "Image exceeds the allowed size.",
        415: "Unsupported image format.",
        429: "Too many attempts. Please try again later.",
        503: "Service unavailable. Please try again later.",
        0: "Unable to connect to the server."
    };

    return messages[statusCode] ||
        "Request failed. Please try again.";
}
