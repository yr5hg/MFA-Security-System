const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const tf = require('@tensorflow/tfjs-core');
require('@tensorflow/tfjs-converter');
require('@tensorflow/tfjs-backend-wasm');

const humanDist = path.dirname(require.resolve('@vladmandic/human'));
const H = require(path.join(humanDist, 'human.node-wasm.js'));
const modelDirectory = process.env.HUMAN_MODEL_DIR
    ? path.resolve(process.env.HUMAN_MODEL_DIR)
    : path.join(path.dirname(humanDist), 'models');
const wasmDirectory = path.dirname(require.resolve('@tensorflow/tfjs-backend-wasm'));

const requiredModels = ['blazeface', 'facemesh', 'faceres'];
const requiredFiles = requiredModels.flatMap(name => [`${name}.json`, `${name}.bin`]);
let initializationPromise = null;
let runtimeInfo = null;

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
        checksums[filename] = crypto.createHash('sha256').update(content).digest('hex');
    }
    return { assets, checksums };
}

async function startModelLoader(assets) {
    const server = http.createServer((request, response) => {
        const content = assets.get(request.url);
        if (request.method !== 'GET' || !content) {
            response.writeHead(404);
            response.end();
            return;
        }
        response.writeHead(200, {
            'Content-Type': request.url.endsWith('.json')
                ? 'application/json' : 'application/octet-stream',
            'Content-Length': content.length,
            'Cache-Control': 'no-store'
        });
        response.end(content);
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    return { server, basePath: `http://127.0.0.1:${server.address().port}/` };
}

async function createRuntime() {
    const { assets, checksums } = readModelAssets();
    const { server, basePath } = await startModelLoader(assets);
    try {
        const human = new H.Human({
            backend: 'wasm',
            wasmPath: wasmDirectory.replace(/\\/g, '/') + '/',
            wasmPlatformFetch: false,
            modelBasePath: basePath,
            debug: false,
            async: false,
            cacheModels: false,
            cacheSensitivity: 0,
            softwareKernels: true,
            filter: { enabled: false, return: false },
            gesture: { enabled: false },
            face: {
                enabled: true,
                detector: {
                    modelPath: 'blazeface.json',
                    rotation: true,
                    maxDetected: 5,
                    minConfidence: 0.2,
                    minSize: 0,
                    skipFrames: 0,
                    skipTime: 0,
                    return: false
                },
                mesh: {
                    enabled: true,
                    modelPath: 'facemesh.json',
                    keepInvalid: true
                },
                description: {
                    enabled: true,
                    modelPath: 'faceres.json',
                    skipFrames: 0,
                    skipTime: 0,
                    minConfidence: 0.1
                },
                attention: { enabled: false },
                iris: { enabled: false },
                emotion: { enabled: false },
                antispoof: { enabled: false },
                liveness: { enabled: false }
            },
            body: { enabled: false },
            hand: { enabled: false },
            object: { enabled: false },
            segmentation: { enabled: false }
        });
        await human.load();
        await tf.ready();
        if (tf.getBackend() !== 'wasm') {
            throw new Error('Unexpected TensorFlow.js backend');
        }
        const models = human.models.list();
        for (const name of requiredModels) {
            const model = models.find(item => item.name === name);
            if (!model || !model.loaded || !(model.size > 0)) {
                throw new Error(`Required model did not load: ${name}`);
            }
        }
        if (typeof human.match?.similarity !== 'function') {
            throw new Error('Human similarity interface is unavailable');
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
        await new Promise(resolve => { server.close(resolve); });
    }
}

function initializeModel() {
    if (!initializationPromise) {
        initializationPromise = createRuntime().catch(error => {
            initializationPromise = null;
            runtimeInfo = null;
            throw error;
        });
    }
    return initializationPromise;
}

function getRuntimeInfo() { return runtimeInfo; }
module.exports = { initializeModel, getRuntimeInfo, tf };
