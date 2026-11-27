async function getCurrentAttempt(signal) {
    return fetch("/attempts/current", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        signal: signal
    });
}


async function sendFaceCapture(operation, body, headers, signal) {
    const endpoints = {
        verify: "/face/verify",
        enroll: "/face/enroll",
        replace: "/face/enroll"
    };

    if (!Object.hasOwn(endpoints, operation)) {
        throw new Error("Invalid face operation.");
    }

    return fetch(endpoints[operation], {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        headers,
        body,
        signal
    });
}
