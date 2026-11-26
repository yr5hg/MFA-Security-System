
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const tf = require('@tensorflow/tfjs-core');
require('@tensorflow/tfjs-converter');
require('@tensorflow/tfjs-backend-wasm');

// Resolve the Human WASM build without loading the native build.
const humanDist = path.dirname(
    require.resolve('@vladmandic/human')
);

const H = require(
    path.join(humanDist, 'human.node-wasm.js')
);

const modelDirectory = process.env.HUMAN_MODEL_DIR
    ? path.resolve(process.env.HUMAN_MODEL_DIR)
    : path.join(path.dirname(humanDist), 'models');

const wasmDirectory = path.dirname(
    require.resolve('@tensorflow/tfjs-backend-wasm')
);

const requiredFiles = [
    'blazeface.json',
    'blazeface.bin'
];

let initializationPromise = null;
let runtimeInfo = null;

// Read only the explicitly allowed local model files.
function readModelAssets() {
    const assets = new Map();
    const checksums = {};

    for (const filename of requiredFiles) {
        const filePath = path.join(modelDirectory, filename);

        if (!fs.existsSync(filePath)) {
            throw new Error(`Missing model file: ${filename}`);
        }

        const content = fs.readFileSync(filePath);

        if (content.length === 0) {
            throw new Error(`Empty model file: ${filename}`);
        }

        assets.set(`/${filename}`, content);

        checksums[filename] = crypto
            .createHash('sha256')
            .update(content)
            .digest('hex');
    }

    return { assets, checksums };
}

// Temporarily expose only the required model assets locally.
// This avoids relying on native TensorFlow's file:// loader.
async function startModelLoader(assets) {
    const server = http.createServer((request, response) => {
        const content = assets.get(request.url);

        if (request.method !== 'GET' || !content) {
            response.writeHead(404);
            response.end();
            return;
        }

        const contentType = request.url.endsWith('.json')
            ? 'application/json'
            : 'application/octet-stream';

        response.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': content.length,
            'Cache-Control': 'no-store'
        });

        response.end(content);
    });

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address();

    return {
        server,
        basePath: `http://127.0.0.1:${address.port}/`
    };
}

async function createRuntime() {
    const { assets, checksums } = readModelAssets();

    const { server, basePath } =
        await startModelLoader(assets);

    try {
        const human = new H.Human({
            backend: 'wasm',

            wasmPath:
                wasmDirectory.replace(/\\/g, '/') + '/',

            wasmPlatformFetch: false,
            modelBasePath: basePath,

            debug: false,
            async: false,
            cacheModels: false,
            cacheSensitivity: 0,
            softwareKernels: true,

            filter: {
                enabled: false,
                return: false
            },

            gesture: {
                enabled: false
            },

            face: {
                enabled: true,

                detector: {
                    modelPath: 'blazeface.json',
                    rotation: false,
                    maxDetected: 5,
                    minConfidence: 0.2,
                    minSize: 0,
                    skipFrames: 0,
                    skipTime: 0,
                    return: false
                },

                mesh: {
                    enabled: false
                },

                attention: {
                    enabled: false
                },

                iris: {
                    enabled: false
                },

                description: {
                    enabled: false
                },

                emotion: {
                    enabled: false
                },

                antispoof: {
                    enabled: false
                },

                liveness: {
                    enabled: false
                }
            },

            body: {
                enabled: false
            },

            hand: {
                enabled: false
            },

            object: {
                enabled: false
            },

            segmentation: {
                enabled: false
            }
        });

        await human.load();
        await tf.ready();

        if (tf.getBackend() !== 'wasm') {
            throw new Error('Unexpected TensorFlow.js backend');
        }

        const models = human.models.list();

        const detector = models.find(
            (model) => model.name === 'blazeface'
        );

        if (
            !detector ||
            !detector.loaded ||
            !(detector.size > 0)
        ) {
            throw new Error('Face detection model did not load');
        }

        runtimeInfo = {
            nodeVersion: process.version,
            platform: process.platform,
            architecture: process.arch,
            humanVersion: human.version,
            tensorflowVersion: tf.version_core,
            backend: tf.getBackend(),
            models: human.models.loaded(),
            modelChecksums: checksums
        };

        return human;

    } finally {
        // The temporary asset loader is not needed after loading.
        await new Promise((resolve) => {
            server.close(resolve);
        });
    }
}

function initializeModel() {
    if (!initializationPromise) {
        initializationPromise = createRuntime()
            .catch((error) => {
                initializationPromise = null;
                runtimeInfo = null;
                throw error;
            });
    }

    return initializationPromise;
}

function getRuntimeInfo() {
    return runtimeInfo;
}

module.exports = {
    initializeModel,
    getRuntimeInfo,
    tf
};
