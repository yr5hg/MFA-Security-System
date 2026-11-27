function submitDemoCapture(operation, image) {
    const allowedOperations = [
        "verify",
        "enroll",
        "replace"
    ];

    if (!allowedOperations.includes(operation)) {
        return {
            accepted: false,
            message: "Invalid operation."
        };
    }

    if (!(image instanceof Blob) ||
        image.type !== "image/jpeg" ||
        image.size === 0 ||
        image.size > 1048576) {
        return {
            accepted: false,
            message: "Invalid image."
        };
    }

    return {
        accepted: true,
        message: "Demo input accepted. No authentication performed."
    };
}
