
// --- START OF FILE 0.js ---

// --- START OF FULL SIMPLIFIED SCRIPT with CSS Fix, Regenerate Button, ITERATIVE Section Selection, Image Copy on Accept, SVG Text Editing, AND External Image Downloading ---
// --- NOW EXPLICITLY HANDLES MULTIPLE IMAGES PER QUESTION CONTEXT (Generates ONE SVG) ---
// --- Includes fix for nested template literal error ---

/**
 * image_to_svg_replacer.js
 * Replaces image references (local paths or external URLs) in questions with AI-generated inline SVG,
 * using manual review via a local web server. Downloads external images first.
 * Focuses ONLY on image replacement, no content validation/fixing.
 * Includes CSS fix for better SVG display size in review tool.
 * Includes a "Regenerate SVG" option in the review tool.
 * Includes ITERATIVE Section Selection: Process sections batch by batch.
 * Includes Copying Original LOCAL Images on SVG Acceptance.
 * Includes SVG Text Editing in the review interface.
 * Handles multiple image references within a single question's context (question/options/explanation)
 * by generating ONE representative SVG and replacing ALL references with it.
 */

// --- Node.js Module Imports ---
const {
    GoogleGenerativeAI,
    HarmCategory,
    HarmBlockThreshold,
} = require("@google/generative-ai");
const fs = require("node:fs");
const path = require('path');
const mime = require("mime-types");
const http = require('http');
const url = require('url');
const crypto = require('crypto'); // For hashing URLs
const axios = require('axios'); // For downloading images
// Use readline/promises for async/await compatibility
const readline = require('node:readline/promises').createInterface({
    input: process.stdin,
    output: process.stdout,
});


// --- Configuration ---
let apiKey = process.env.GEMINI_API_KEY;

// --- Script Parameters ---
const API_DELAY_MS = 1000; // Delay between API calls
const SOURCE_INPUT_FILE = './questions.js'; // Source for first run
const OUTPUT_FILE = './questions.js'; // Output/Resume file

const REMOVAL_LOG = './removed_questions_log.txt'; // Log for pre-check/missing images/download failures
const SVG_GENERATION_FAILURE_LOG = './svg_generation_failures.log'; // Log for AI/API errors
const IMAGE_FOLDER = 'image'; // The directory name used in LOCAL image paths (e.g., "image/file.png")
const OUTPUT_IMAGE_FOLDER = './output_images'; // Destination folder for original LOCAL images when SVG is accepted
const DOWNLOADED_IMAGE_FOLDER = './downloaded_images'; // Folder to store downloaded external images
const SERVER_PORT = 8088;

// --- Fallback Model List ---
const FALLBACK_MODELS = [
    "gemini-1.5-pro-latest",
    "gemini-1.5-flash-latest",
    // Add other potential vision models if needed
     "gemini-2.0-flash-thinking-exp-01-21", // Example, check availability
     "gemini-2.5-pro-exp-03-25", // Example, check availability
];

// Safety Settings (Optional - adjust as needed)
let safetySettings; // Example: [{ category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }]

// --- Gemini API Setup ---
let genAI;
let model;
let generationConfig;
let GEMINI_MODEL_NAME;
let useJsonMode = true;

// --- Web Server State ---
let server;
let currentReviewData = null; // { qInfo, svgResult, originalImageSources, resolvePromise, rejectPromise }

// --- Logging Setup ---
try { fs.writeFileSync(REMOVAL_LOG, `--- Log started at ${new Date().toISOString()} ---\n\n`, 'utf8'); } catch (e) { console.warn("Could not clear/create log file:", REMOVAL_LOG, e.message)}
try { fs.writeFileSync(SVG_GENERATION_FAILURE_LOG, `--- Log started at ${new Date().toISOString()} ---\n\n`, 'utf8'); } catch (e) { console.warn("Could not clear/create log file:", SVG_GENERATION_FAILURE_LOG, e.message)}
// Ensure downloaded images folder exists
try {
    if (!fs.existsSync(DOWNLOADED_IMAGE_FOLDER)) {
        fs.mkdirSync(DOWNLOADED_IMAGE_FOLDER, { recursive: true });
        console.log(`   Created downloaded images directory: ${DOWNLOADED_IMAGE_FOLDER}`);
    }
} catch (e) {
    console.warn(`   [Warning] Could not create downloaded images directory: ${DOWNLOADED_IMAGE_FOLDER}`, e.message);
}
// Ensure output images folder exists
try {
    if (!fs.existsSync(OUTPUT_IMAGE_FOLDER)) {
        fs.mkdirSync(OUTPUT_IMAGE_FOLDER, { recursive: true });
        console.log(`   Created output images directory: ${OUTPUT_IMAGE_FOLDER}`);
    }
} catch (e) {
    console.warn(`   [Warning] Could not create output images directory: ${OUTPUT_IMAGE_FOLDER}`, e.message);
}

function appendToLogFile(filePath, content) {
    try {
        fs.appendFileSync(filePath, content + '\n\n---\n\n', 'utf8');
    } catch (error) {
        console.error(`   [Error] Failed to append to log file ${filePath}:`, error.message);
    }
}

// --- User Interaction Functions ---
async function askQuestion(query) {
    if (!readline || readline.closed) {
        console.warn("   [Warning] Readline interface closed or unavailable. Cannot ask question:", query);
        return "";
    }
    const answer = await readline.question(query);
    return answer.trim();
}

async function getApiKeyIfNeeded() {
    if (!apiKey) {
        console.warn("   GEMINI_API_KEY environment variable not set.");
        apiKey = await askQuestion('Enter your Gemini API key: ');
        if (!apiKey) throw new Error("API key not provided.");
        console.log("   Gemini API key received from user input.");
    } else {
        console.log("   Using Gemini API key from environment variable.");
    }
    return apiKey;
}
async function listAndSelectModel(genAIInstance) {
    let modelNames = [];
    try {
        console.log("   Attempting to fetch available Gemini models...");
        const result = await genAIInstance.listModels();
        let fetchedModels = [];
         // Handle different potential response structures from listModels()
         if (result && Symbol.iterator in Object(result)) { // Async iterator
              for await (const m of result) {
                 if (m.name && m.supportedGenerationMethods?.includes('generateContent') && (m.name.includes('pro') || m.name.includes('flash') || m.name.includes('vision'))) {
                     fetchedModels.push(m);
                  }
              }
         } else if (result && Array.isArray(result.models)) { // Object with 'models' array
             fetchedModels = result.models.filter(m => m.name && m.supportedGenerationMethods?.includes('generateContent') && (m.name.includes('pro') || m.name.includes('flash') || m.name.includes('vision')));
         } else if (Array.isArray(result)) { // Direct array response
             fetchedModels = result.filter(m => m.name && m.supportedGenerationMethods?.includes('generateContent') && (m.name.includes('pro') || m.name.includes('flash') || m.name.includes('vision')));
         }

        modelNames = fetchedModels.map(m => m.name?.startsWith('models/') ? m.name.substring(7) : m.name).filter(Boolean).sort();

        if (modelNames.length === 0) {
             console.warn("   Could not find any potentially vision-compatible models via dynamic listing.");
             console.warn(`   Falling back to predefined list: ${FALLBACK_MODELS.join(', ')}`);
             modelNames = [...FALLBACK_MODELS];
             if (modelNames.length === 0) throw new Error("Dynamic model listing yielded no results, and no fallback models defined.");
        } else {
            console.log(`   Successfully fetched ${modelNames.length} potentially vision-compatible models.`);
        }

    } catch (error) {
        console.warn(`   [Warning] Failed to dynamically list models: ${error.message}`);
        console.warn(`   Falling back to predefined list: ${FALLBACK_MODELS.join(', ')}`);
        modelNames = [...FALLBACK_MODELS];
        if (modelNames.length === 0) throw new Error("Model selection failed: No models available (dynamic listing failed, no fallback models).");
    }

    console.log("\nPlease select a Gemini Model (must support vision/images):");
    modelNames.forEach((name, index) => console.log(`  ${index + 1}. ${name}`));

    let selectedModelName = null;
    while (!selectedModelName) {
        const answer = await askQuestion(`Enter model number (1-${modelNames.length}): `);
        const modelIndex = parseInt(answer, 10);
        if (!isNaN(modelIndex) && modelIndex >= 1 && modelIndex <= modelNames.length) {
            selectedModelName = modelNames[modelIndex - 1];
        } else {
            console.log("   Invalid selection.");
        }
    }
    console.log(`   You selected: ${selectedModelName}`);
    return selectedModelName;
}
async function askForJsonModePreference() {
    const answer = await askQuestion('Use Gemini\'s JSON mode for responses? (yes/no) [Default: yes]: ');
    useJsonMode = answer.toLowerCase() !== 'no';
    console.log(`   JSON mode ${useJsonMode ? 'enabled' : 'disabled'}.`);
    return useJsonMode;
}

// --- Initialization and Setup ---
function initializeGeminiCore(key) {
    try {
        genAI = new GoogleGenerativeAI(key);
        console.log("   Gemini API client initialized (core).");
        return genAI;
    } catch (error) {
        console.error(`[Critical Error] Failed to initialize Gemini API client: ${error.message}`);
        throw error;
    }
}
function finalizeModelSetup(modelName, useJSON) {
    if (!genAI) throw new Error("Gemini API client not initialized.");
    if (!modelName) throw new Error("Model name not provided.");

    GEMINI_MODEL_NAME = modelName;
    useJsonMode = useJSON;

    try {
        const modelConfig = { model: GEMINI_MODEL_NAME };
        if (safetySettings) {
            modelConfig.safetySettings = safetySettings;
        }
        model = genAI.getGenerativeModel(modelConfig);
    } catch (error) {
         console.error(`[Critical Error] Failed to get generative model "${GEMINI_MODEL_NAME}": ${error.message}`);
         throw error;
    }

    generationConfig = { temperature: 0.25 };
    if (useJsonMode) {
        generationConfig.responseMimeType = "application/json";
    }
    console.log(`   Using Gemini Model: ${GEMINI_MODEL_NAME} (JSON Mode: ${useJsonMode})`);
    console.log("   Gemini API model setup finalized.");
}

// --- Save Progress Function ---
function saveProgress(data, phaseInfo) {
    console.log(`   Saving progress ${phaseInfo}...`);
    try {
        const outputFilePath = path.resolve(OUTPUT_FILE);
        const outputDir = path.dirname(outputFilePath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
            console.log(`   Created output directory: ${outputDir}`);
        }
        // Ensure data is in the expected format { sections: [...] }
        const dataToSave = (typeof data === 'object' && data !== null && Array.isArray(data.sections)) ? data : { sections: [] };
        if (!dataToSave.sections) {
            console.warn(`   [Warning] 'sections' property missing during saveProgress (${phaseInfo}). Saving empty structure.`);
            dataToSave.sections = [];
        }
        const outputContent = `const questionsData = ${JSON.stringify(dataToSave, null, 2)};\n\nmodule.exports = questionsData;`;
        fs.writeFileSync(outputFilePath, outputContent, 'utf8');
        console.log(`   Progress saved successfully to: ${outputFilePath}`);
    } catch (error) {
        console.error(`   [Error] Failed to save progress ${phaseInfo} to ${OUTPUT_FILE}:`, error.message, error);
    }
}

// --- Helper Functions ---
function delay(ms) {
    if (ms <= 0) return Promise.resolve();
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Extracts image sources (URLs or local paths) from text
function extractImagePaths(questionText, optionsText, localImageFolderPrefix) {
    const combinedText = (questionText || "") + " " + (optionsText || "");
    if (!combinedText) return [];

    const imageSources = new Set(); // Store both URLs and potential local paths

    // Regex to find src attribute in img tags (captures anything inside quotes)
    // Make it less greedy to avoid issues with multiple tags on one line
    const imgTagRegex = /<img\s+[^>]*?src=["']([^"']+)["'][^>]*?>/gi;
    let match;
    while ((match = imgTagRegex.exec(combinedText)) !== null) {
        if (match[1]) {
            imageSources.add(match[1].replace(/\\/g, '/')); // Normalize slashes
        }
    }

    // Regex for markdown-style links, assuming they are ALWAYS local relative paths
    // Ensure the prefix exists before attempting markdown extraction
    if (localImageFolderPrefix) {
        const normalizedPrefix = localImageFolderPrefix.replace(/\\/g, '/').replace(/\/$/, '');
        // Escape regex special characters in the prefix
        const escapedPrefix = normalizedPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Regex: Look for markdown image syntax `(optional/path/prefix/image.ext)`
        // Allows optional ./ at the start
        const markdownRegex = new RegExp(`\\(\\s*(?:\\.?\\/?)?(${escapedPrefix}[/][^)]+)\\s*\\)`, 'gi');
        while ((match = markdownRegex.exec(combinedText)) !== null) {
            if (match[1]) {
                imageSources.add(match[1].replace(/\\/g, '/')); // Normalize slashes
            }
        }
    }

    return [...imageSources];
}

// Downloads an image from a URL
async function downloadImage(imageUrl, destinationFolder, qInfoForLog) {
    const logPrefix = `   [S:${qInfoForLog.sIndex+1}, Q:${qInfoForLog.qIndex+1}] [Download]`;
    try {
        console.log(`${logPrefix} Attempting download: ${imageUrl}`);
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer', // Get data as binary buffer
            timeout: 15000, // 15 second timeout
             headers: { // Add a common user-agent
                 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
             }
        });

        if (response.status !== 200) {
            throw new Error(`HTTP status ${response.status}`);
        }

        // Determine filename and extension
        let filename = '';
        let extension = '';
        const contentType = response.headers['content-type'];
        const urlPath = new URL(imageUrl).pathname;
        const baseNameFromUrl = path.basename(urlPath);

        if (contentType && contentType.startsWith('image/')) {
            extension = `.${mime.extension(contentType) || 'img'}`;
        } else if (baseNameFromUrl && path.extname(baseNameFromUrl)) {
             extension = path.extname(baseNameFromUrl).toLowerCase();
             // Basic check for common image extensions
             if (!['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.tif', '.tiff'].includes(extension)) {
                 console.warn(`${logPrefix} URL extension "${extension}" might not be an image (Content-Type: ${contentType || 'N/A'}). Attempting save anyway.`);
                 extension = extension || '.img'; // Keep original extension if possible, fallback
             }
        } else {
            extension = '.img'; // Default if no info found
            console.warn(`${logPrefix} Could not determine image extension from URL or Content-Type. Using '.img'.`);
        }

        // Create a unique filename based on URL hash to prevent collisions
        const hash = crypto.createHash('sha256').update(imageUrl).digest('hex');
        // Sanitize basename from URL for use in filename
        const readablePart = baseNameFromUrl.replace(/[^a-zA-Z0-9_.-]/g, '_').substring(0, 50);
        filename = `${readablePart}_${hash.substring(0, 10)}${extension}`;

        const destinationPath = path.resolve(destinationFolder, filename);
        // Ensure the specific directory exists before writing
        fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
        fs.writeFileSync(destinationPath, response.data);
        console.log(`${logPrefix} Successfully downloaded and saved to: ${destinationPath}`);

        // Return the RELATIVE path for consistency with local paths
        return path.join(destinationFolder, filename).replace(/\\/g, '/');

    } catch (error) {
        let errMsg = error.message;
        if (error.response) errMsg = `HTTP Status ${error.response.status} - ${error.response.statusText}`;
        else if (error.request) errMsg = `Network error or no response received.`;
        console.error(`${logPrefix} Failed to download ${imageUrl}: ${errMsg}`);
        const logMsg = `[S:${qInfoForLog.sIndex+1}, Q:${qInfoForLog.qIndex+1}] Image Download Failed\nURL: ${imageUrl}\nError: ${errMsg}\n---`;
        appendToLogFile(REMOVAL_LOG, logMsg); // Log to removal log for download failures
        return null; // Indicate failure
    }
}

// Converts a local image file to the format Gemini API expects
function fileToGenerativePart(localImagePath, qInfoForLog) {
    let absolutePath = '';
    let inputPath = localImagePath; // Keep original for logging
    try {
        // Resolve the path relative to the current working directory
        absolutePath = path.resolve(process.cwd(), inputPath);

        // Check existence first
        if (!fs.existsSync(absolutePath)) {
            const logMsg = `[S:${qInfoForLog.sIndex+1}, Q:${qInfoForLog.qIndex+1}] Image file not found: ${absolutePath} (from path: ${inputPath}).`;
            console.warn(`   [Warning] ${logMsg}`);
            // Log missing local files to removal log as well
            appendToLogFile(REMOVAL_LOG, `[S:${qInfoForLog.sIndex+1}, Q:${qInfoForLog.qIndex+1}] Image File Missing\nPath: ${inputPath}\nResolved: ${absolutePath}\n---`);
            return null;
        }

        // Check if it's a file and not empty
        const stats = fs.statSync(absolutePath);
        if (!stats.isFile() || stats.size === 0) {
             const logMsg = `[S:${qInfoForLog.sIndex+1}, Q:${qInfoForLog.qIndex+1}] Image path is not a valid file or is empty: ${absolutePath} (from path: ${inputPath}).`;
             console.warn(`   [Warning] ${logMsg}`);
             appendToLogFile(REMOVAL_LOG, `[S:${qInfoForLog.sIndex+1}, Q:${qInfoForLog.qIndex+1}] Invalid/Empty Image File\nPath: ${inputPath}\nResolved: ${absolutePath}\n---`);
             return null;
        }

        // Check MIME type
        const mimeType = mime.lookup(absolutePath);
        if (!mimeType || !mimeType.startsWith('image/')) {
            const logMsg = `[S:${qInfoForLog.sIndex+1}, Q:${qInfoForLog.qIndex+1}] File is not a recognized image type (MIME: ${mimeType || 'unknown'}): ${absolutePath} (from path: ${inputPath}).`;
            console.warn(`   [Warning] ${logMsg}`);
            appendToLogFile(REMOVAL_LOG, `[S:${qInfoForLog.sIndex+1}, Q:${qInfoForLog.qIndex+1}] Unrecognized Image Type\nPath: ${inputPath}\nResolved: ${absolutePath}\nMIME: ${mimeType || 'unknown'}\n---`);
            return null;
        }

        // Check read permissions (optional but good practice)
        try {
            fs.accessSync(absolutePath, fs.constants.R_OK);
        } catch (permError) {
             const logMsg = `[S:${qInfoForLog.sIndex+1}, Q:${qInfoForLog.qIndex+1}] Permission denied reading image file: ${absolutePath} (from path: ${inputPath}). Error: ${permError.message}`;
             console.error(`   [Error] ${logMsg}`);
             appendToLogFile(REMOVAL_LOG, `[S:${qInfoForLog.sIndex+1}, Q:${qInfoForLog.qIndex+1}] Image Read Permission Denied\nPath: ${inputPath}\nResolved: ${absolutePath}\nError: ${permError.message}\n---`);
             return null;
        }

        // Read file and convert to base64
        const data = fs.readFileSync(absolutePath);
        return { inlineData: { data: data.toString("base64"), mimeType } };

    } catch (error) {
        // Catch any other errors during processing (e.g., path resolution issues)
        const logMsg = `[S:${qInfoForLog.sIndex+1}, Q:${qInfoForLog.qIndex+1}] Failed to process image file "${inputPath}" (resolved: ${absolutePath}): ${error.message}.`;
        console.error(`   [Error] ${logMsg}`);
        // Log processing errors to the removal log as well, as they prevent processing
        appendToLogFile(REMOVAL_LOG, `[S:${qInfoForLog.sIndex+1}, Q:${qInfoForLog.qIndex+1}] Image Processing Failed\nPath: ${inputPath}\nResolved: ${absolutePath}\nError: ${error.message}\n---`);
        return null;
    }
}


// --- AI Function for SVG Generation (Handles Downloads, Multiple Images) ---
async function generateSvgForImageQuestion(qInfo, originalImageSources) {
    const logPrefix = `   [S:${qInfo.sIndex+1}, Q:${qInfo.qIndex+1}]`;
    console.log(`${logPrefix} Attempting SVG generation for ${originalImageSources.length} image source(s): [${originalImageSources.join(', ')}]`);

    const imageParts = [];
    let imagesMissingOrInvalid = false;
    // Create a minimal qInfo for logging to avoid overly long log messages
    const qInfoForLog = { sectionName: qInfo.sectionName, sIndex: qInfo.sIndex, qIndex: qInfo.qIndex, questionTextSnippet: (qInfo.question?.question || "").substring(0, 50) + "..." };
    const localPathsUsedForApi = []; // Track which local paths were successfully processed

    if (originalImageSources.length === 0) {
         console.warn(`${logPrefix} Warning: No originalImageSources provided.`);
         // This case shouldn't happen if called correctly, but handle defensively
         return { status: "error", reason: "No image sources provided for SVG generation." };
    }

    console.log(`${logPrefix} Verifying, downloading (if needed), and processing image sources...`);
    for (const source of originalImageSources) {
        let localPathToUse = null;

        // Check if it's an external URL
        if (source.toLowerCase().startsWith('http://') || source.toLowerCase().startsWith('https://')) {
            localPathToUse = await downloadImage(source, DOWNLOADED_IMAGE_FOLDER, qInfoForLog);
            if (!localPathToUse) {
                imagesMissingOrInvalid = true;
                // Error logged within downloadImage, continue to check other sources
                continue;
            }
        } else {
            // Assume it's a local path relative to CWD
            localPathToUse = source;
        }

        // Process the local path (either original or downloaded)
        if (localPathToUse) {
             const part = fileToGenerativePart(localPathToUse, qInfoForLog);
             if (part) {
                 imageParts.push(part);
                 localPathsUsedForApi.push(localPathToUse); // Add successfully processed path
             } else {
                 imagesMissingOrInvalid = true; // fileToGenerativePart failed, error logged within it
             }
        } else {
             // This case should only be hit if downloadImage returned null
             imagesMissingOrInvalid = true;
        }
    } // End loop through originalImageSources

    // If any image failed download or processing, skip API call and mark for removal
    if (imagesMissingOrInvalid) {
        const errorMessage = `SVG generation skipped pre-API: One or more images failed download, were missing, or failed processing. Check logs above and ${REMOVAL_LOG}.`;
        console.error(`${logPrefix} ${errorMessage}`);
        // Log detailed info to removal log (already done for specific errors in helpers, but add a summary)
        const logMsg = `[S:${qInfo.sIndex+1}, Q:${qInfo.qIndex+1}] REMOVED (Image Download/Processing Failed Pre-API - Summary)\nSection: "${qInfo.sectionName}"\nSources Checked: ${JSON.stringify(originalImageSources)}\nOriginal Question ID (if available): ${qInfo.question?.id || 'N/A'}\nOriginal Question Text Snippet: ${(qInfo.question?.question || '').substring(0,100)}...`;
        appendToLogFile(REMOVAL_LOG, logMsg);
        // Use a specific status to trigger removal in the main loop
        return { status: "image_download_or_process_failed_remove_now", reason: errorMessage };
    }

    // If after processing all sources, we have no valid image parts (e.g., all failed)
    if (imageParts.length === 0) {
        const errorMessage = `SVG generation skipped: No valid image parts could be prepared for the API (all sources might have failed processing). Check logs.`;
         console.error(`${logPrefix} ${errorMessage}`);
         // Log this specific case too
         const logMsg = `[S:${qInfo.sIndex+1}, Q:${qInfo.qIndex+1}] REMOVED (No Valid Image Parts Pre-API)\nSection: "${qInfo.sectionName}"\nSources Checked: ${JSON.stringify(originalImageSources)}\nOriginal Question ID (if available): ${qInfo.question?.id || 'N/A'}`;
         appendToLogFile(REMOVAL_LOG, logMsg);
         return { status: "image_download_or_process_failed_remove_now", reason: errorMessage }; // Use same status for removal
    }

    console.log(`${logPrefix} Successfully prepared ${imageParts.length} image part(s) for API from paths: [${localPathsUsedForApi.join(', ')}]`);

    // Prepare the full question context for the AI
    const questionInput = {
        question: qInfo.question.question || "",
        options: qInfo.question.options || [],
        explanation: qInfo.question.explanation || ""
    };

    // --- UPDATED PROMPT (Handles Multiple Images Explicitly) ---
    const basePrompt = `You are an AI assistant specialized in analyzing images within the context of a Multiple Choice Question (MCQ) and generating a representative inline SVG replacement for the image(s).

Analyze the provided MCQ data (question, options, explanation) and the accompanying image(s). **If multiple images are provided, understand their combined relevance or the primary visual information needed for the question/options/explanation context.** Your **sole task** is to:

1.  Understand the key visual information in the image(s) relevant to the MCQ context. Focus on diagrams, charts, schematics, or essential visual elements described in the text. Synthesize information if multiple relevant images are present.
2.  Generate **a single**, clean, functional, inline SVG code snippet representing this key information. Prioritize clarity and semantic representation over exact pixel replication. Use standard SVG elements. Ensure the SVG is self-contained. The language used within the SVG (if any text is needed) should match the context language. Make it reasonably sized and viewable. Add a <title> element inside the SVG briefly describing its content for accessibility. Ensure the SVG adjusts its size according to the screen while maintaining visual clarity.
3.  Modify the original 'question', 'options', and 'explanation' text fields: Replace **ALL** occurrences of the original image references (e.g., \`<img>\` tags with the original source URLs/paths, markdown links like \`(image/path.jpg)\`) found anywhere within these fields with the **single generated inline SVG**. Preserve ALL other text and formatting (including existing HTML like \`<b>\`, \`<i>\` and MathJax spans like \`<span class="mathy">...\`</span>) exactly as they were.
4.  Provide a brief text description summarizing the generated SVG's content and purpose (considering all input images).

**DO NOT** validate or change the correctness of the question, the number/content of options, the explanation's quality, or enforce MathJax/HTML formatting beyond inserting the SVG. Your only text modification should be replacing ALL original image references with the single generated SVG.

**Output Format (JSON):**
Return a **single JSON object**:

\`\`\`json
{
  "status": "success" | "unfixable" | "error",
  "modified_data"?: { // REQUIRED if status is "success"
    "question": "string", // Original question text with ALL image references replaced by the single SVG
    "options": [ // Original options array with ALL image references replaced by the single SVG
      { "option text with SVG": boolean },
      // ... other options
    ],
    "explanation": "string", // Original explanation text with ALL image references replaced by the single SVG
    "svg_code": "string", // The single generated inline SVG code snippet (must start with <svg... and contain a <title>)
    "svg_description": "string" // Brief text description of the SVG content (summarizing all input images)
  },
  "reason"?: "string" // REQUIRED if status is "unfixable" or "error". Explain failure (e.g., "Image content too complex for SVG", "Cannot identify relevant visual info from multiple images").
}
\`\`\`

**Important Notes:**
*   **"success":** A single SVG was generated and ALL image references were replaced in text. Return \`modified_data\`.
*   **"unfixable":** Cannot generate a useful SVG (e.g., images are purely decorative, too complex, irrelevant). Provide "reason". Do not return \`modified_data\`.
*   **"error":** Unexpected processing issue occurred during generation. Provide "reason". Do not return \`modified_data\`.
*   Ensure the output is a single, valid JSON object adhering strictly to the specified structure.
*   The generated SVG must be inline and self-contained. Include a <title> element.

Here is the MCQ data:
${JSON.stringify(questionInput, null, 2)}

Analyze the MCQ data and the provided image(s). Perform SVG generation and replace ALL image references in the text fields with the single generated SVG. Provide the response as a single JSON object.`;
    // --- END UPDATED PROMPT ---


    let finalPrompt = basePrompt;
    // Add wrapper for non-JSON mode if needed
    if (!useJsonMode) {
         finalPrompt = `You MUST return your response ONLY as a single, valid JSON object. Do not include any text before or after the JSON structure. The JSON should start with \`{\` and end with \`}\`.\n\n${basePrompt}`;
    }
    const promptPart = { text: finalPrompt };
    // Combine text prompt and all valid image parts
    const requestParts = [promptPart, ...imageParts];

    console.log(`${logPrefix} Sending image question (${imageParts.length} image parts) to Gemini API for SVG generation...`);

    try {
        if (!model) throw new Error("Gemini model not initialized before API call.");

        // Make the API call
        const result = await model.generateContent({
            contents: [{ role: "user", parts: requestParts }],
            generationConfig,
            // safetySettings can be added here if defined globally
            ...(safetySettings && { safetySettings }),
        });
        const response = result.response;

        // --- Response Handling and Validation (largely unchanged) ---

        // Check for prompt blocking first
        if (response?.promptFeedback?.blockReason) {
            const blockReason = response.promptFeedback.blockReason;
            const safetyRatings = response.promptFeedback.safetyRatings || [];
            console.error(`${logPrefix} Error: API request blocked (Prompt). Reason: ${blockReason}. Ratings: ${JSON.stringify(safetyRatings)}`);
            appendToLogFile(SVG_GENERATION_FAILURE_LOG, `[S:${qInfo.sIndex+1}, Q:${qInfo.qIndex+1}] API Request Blocked (Prompt)\nReason: ${blockReason}\nRatings: ${JSON.stringify(safetyRatings)}\n---`);
            return { status: "error", reason: `API request blocked (Prompt): ${blockReason}` };
        }

        // Get the first candidate
        const candidate = response?.candidates?.[0];
         if (!candidate) {
            // Try to get finish reason from response level if candidate is missing
            const finishReason = response?.finishReason || 'Unknown';
            console.error(`${logPrefix} Error: No valid response candidate found from API. Finish Reason: ${finishReason}`);
            appendToLogFile(SVG_GENERATION_FAILURE_LOG, `[S:${qInfo.sIndex+1}, Q:${qInfo.qIndex+1}] No Valid API Candidate\nFinish Reason: ${finishReason}\n---`);
            return { status: "error", reason: `No valid response candidate. Finish Reason: ${finishReason}` };
        }

        // Check candidate's finish reason
        if (candidate.finishReason && candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
             console.error(`${logPrefix} Error: API response finished with problematic reason: ${candidate.finishReason}.`);
             let safetyInfo = '';
             if (candidate.finishReason === 'SAFETY' && candidate.safetyRatings) {
                 safetyInfo = `\nSafety Ratings: ${JSON.stringify(candidate.safetyRatings)}`;
                 console.error(`${logPrefix} Safety Ratings: ${JSON.stringify(candidate.safetyRatings)}`);
             }
             appendToLogFile(SVG_GENERATION_FAILURE_LOG, `[S:${qInfo.sIndex+1}, Q:${qInfo.qIndex+1}] API Abnormal Finish\nReason: ${candidate.finishReason}${safetyInfo}\n---`);
             return { status: "error", reason: `API response finished abnormally: ${candidate.finishReason}` };
        }
         if (candidate.finishReason === 'MAX_TOKENS') {
             console.warn(`${logPrefix} Warning: API response potentially truncated due to MAX_TOKENS.`);
             // Proceed, but be aware the JSON might be incomplete
         }

        // Extract text part
        const responseText = candidate?.content?.parts?.[0]?.text;
        if (!responseText || typeof responseText !== 'string' || responseText.trim() === '') {
            console.error(`${logPrefix} Error: Invalid or empty text response part from API candidate.`);
            appendToLogFile(SVG_GENERATION_FAILURE_LOG, `[S:${qInfo.sIndex+1}, Q:${qInfo.qIndex+1}] Invalid/Empty API Response Text\n---`);
            return { status: "error", reason: "Invalid/empty API response text." };
        }

        // Parse and validate the JSON response
        let svgResult;
        try {
             let jsonString = responseText.trim();
             // --- JSON Extraction Logic (handles ```json block or raw object) ---
             if (!useJsonMode) {
                 const jsonMatch = jsonString.match(/```json\s*([\s\S]*?)\s*```/);
                 if (jsonMatch && jsonMatch[1]) {
                     jsonString = jsonMatch[1].trim();
                 } else {
                     // Fallback: try finding the first '{' and last '}'
                     const jsonStart = jsonString.indexOf('{');
                     const jsonEnd = jsonString.lastIndexOf('}');
                     if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                        jsonString = jsonString.substring(jsonStart, jsonEnd + 1);
                         console.warn(`   ${logPrefix} Warning (Non-JSON Mode): Extracted JSON using substring {}. May be unreliable.`);
                     } else {
                         throw new Error("Could not find valid JSON object braces `{}` or ```json block in non-JSON mode response.");
                     }
                 }
             }
             // --- End JSON Extraction ---

             const parsed = JSON.parse(jsonString);

             // --- JSON Validation Logic (ensures structure matches prompt) ---
             if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error("API response parsed, but is not a single JSON object.");
             svgResult = parsed;

             // Validate status
             if (!svgResult.status || !["success", "unfixable", "error"].includes(svgResult.status)) throw new Error(`Invalid or missing 'status' field: ${svgResult.status}`);

             if (svgResult.status === 'success') {
                // Validate 'modified_data' structure for success status
                if (!svgResult.modified_data || typeof svgResult.modified_data !== 'object') throw new Error(`Status 'success': missing/invalid 'modified_data'.`);
                const modData = svgResult.modified_data;
                if (typeof modData.question !== 'string') throw new Error(`'modified_data.question' missing/not string.`);
                if (!Array.isArray(modData.options)) throw new Error(`'modified_data.options' missing/not array.`);
                if (typeof modData.explanation !== 'string') throw new Error(`'modified_data.explanation' missing/not string.`);
                if (typeof modData.svg_code !== 'string' || !modData.svg_code.trim().toLowerCase().startsWith('<svg')) throw new Error(`'modified_data.svg_code' invalid or not starting with <svg.`);
                // Check for <title> element (case-insensitive)
                if (!/<title>.*?<\/title>/i.test(modData.svg_code)) console.warn(`${logPrefix} Warning: Generated SVG code missing <title> element.`);
                if (typeof modData.svg_description !== 'string') throw new Error(`'modified_data.svg_description' missing/not string.`);
                if (modData.svg_description.trim() === '') console.warn(`${logPrefix} Warning: 'modified_data.svg_description' is empty.`);
                // Validate options format within modified_data
                modData.options.forEach((opt, optIndex) => {
                    if (!opt || typeof opt !== 'object' || Object.keys(opt).length !== 1 || typeof Object.values(opt)[0] !== 'boolean') throw new Error(`Invalid modified option format @ index ${optIndex}: ${JSON.stringify(opt)}`);
                });
             } else { // Status is 'unfixable' or 'error'
                 // Validate 'reason' field
                 if (typeof svgResult.reason !== 'string' || svgResult.reason.trim() === "") {
                     console.warn(`${logPrefix} Warning: Status '${svgResult.status}' but 'reason' missing/empty.`);
                     svgResult.reason = svgResult.reason || `(No reason provided by AI for status ${svgResult.status})`;
                 }
                 // Ensure 'modified_data' is not present for non-success statuses
                 if (svgResult.modified_data) {
                     console.warn(`${logPrefix} Warning: Status '${svgResult.status}' but 'modified_data' present. Ignoring.`);
                     delete svgResult.modified_data;
                 }
             }
             // --- End JSON Validation ---
        } catch (parseError) {
            console.error(`${logPrefix} Error parsing/validating JSON response: ${parseError.message}.`);
            console.error(`${logPrefix} Raw response snippet: ${responseText.substring(0, 500)}...`);
            const logMsg = `[S:${qInfo.sIndex+1}, Q:${qInfo.qIndex+1}] JSON Parsing/Validation Failed\nError: ${parseError.message}\nRaw Response Snippet:\n${responseText.substring(0, 1000)}...\n---`;
            appendToLogFile(SVG_GENERATION_FAILURE_LOG, logMsg);
            return { status: "error", reason: `Failed to parse/validate API JSON response: ${parseError.message}` };
        }

        console.log(`${logPrefix} API response received and parsed. Status: ${svgResult.status}`);
        // Add local paths used for successful API call to result for potential later use (e.g., copying)
        if (svgResult.status === 'success') {
            svgResult._localPathsUsed = localPathsUsedForApi;
        }
        return svgResult;

    } catch (error) {
        // Catch errors during the API call itself (network, authentication, etc.)
        console.error(`${logPrefix} Error calling Gemini API: ${error.message}.`);
         if (error.cause) console.error(`${logPrefix} Cause:`, error.cause);
         const logMsg = `[S:${qInfo.sIndex+1}, Q:${qInfo.qIndex+1}] API Call Failed\nError: ${error.message}\nCause: ${error.cause || 'N/A'}\n---`;
         appendToLogFile(SVG_GENERATION_FAILURE_LOG, logMsg);
        return { status: "error", reason: `API call failed: ${error.message}` };
    }
}


// --- Web Server Functions ---

// Helper function to decode HTML entities (basic)
function decodeHtmlEntities(encodedString) {
    // This is a very basic decoder, might not cover all entities.
    // Consider using a library like 'he' if comprehensive decoding is needed.
    if (typeof encodedString !== 'string') return encodedString;
    return encodedString.replace(/&lt;/g, '<')
                       .replace(/&gt;/g, '>')
                       .replace(/&quot;/g, '"')
                       .replace(/&apos;/g, "'")
                       .replace(/&amp;/g, '&');
}

// Generates HTML for the review interface (handles local and downloaded images)
function generateComparisonHtml(qInfo, svgResult, originalImageSources) {
    const { question: originalQ } = qInfo;
    const { modified_data } = svgResult; // Contains AI's proposed text with SVG replacements

    // Basic HTML escaping
    const escapeHtml = (unsafe) => {
        if (typeof unsafe !== 'string') return '';
        return unsafe.replace(/&/g, "&amp;") // Must be first
                     .replace(/</g, "&lt;")
                     .replace(/>/g, "&gt;")
                     .replace(/"/g, "&quot;")
                     .replace(/'/g, "&#039;"); // Use numeric entity for single quote
    };

    // Creates <img> tag for display in review UI, handling different source types
    const createRelativeImgTag = (sourcePathOrUrl) => {
        let serverPath = '';
        let altText = '';
        const cleanSource = sourcePathOrUrl.replace(/\\/g, '/'); // Normalize slashes
        // Normalize folder names for comparison (remove leading ./ and normalize slashes)
        const normalizedDownloadFolder = DOWNLOADED_IMAGE_FOLDER.replace(/\\/g, '/').replace(/^\.\//, '');
        const normalizedImageFolder = IMAGE_FOLDER.replace(/\\/g, '/').replace(/^\.\//, '');

        // Check if it's a downloaded image
        if (cleanSource.startsWith(normalizedDownloadFolder + '/')) {
            serverPath = `/${cleanSource}`; // Serve downloaded image via relative path from server root
            altText = `Downloaded Image: ${path.basename(cleanSource)}`;
        }
        // Check if it's an original local image (and IMAGE_FOLDER is defined)
        else if (normalizedImageFolder && cleanSource.startsWith(normalizedImageFolder + '/')) {
             serverPath = `/${cleanSource}`; // Serve original local image via relative path
             altText = `Original Local Image: ${cleanSource}`;
        }
        // Check if it's an external URL (should ideally be downloaded, but handle as fallback)
        else if (cleanSource.toLowerCase().startsWith('http://') || cleanSource.toLowerCase().startsWith('https://')) {
             serverPath = cleanSource; // Link directly to external URL
             altText = `External Image URL (Direct Link): ${cleanSource}`;
             // Optionally render as a link instead of a potentially broken image tag
             // return `<p style="color:orange; font-size:0.9em;">External URL: <a href="${escapeHtml(serverPath)}" target="_blank">${escapeHtml(serverPath)}</a></p>`;
        }
        // Assume it's some other relative path (might be incorrect if not in IMAGE_FOLDER)
        else {
            serverPath = `/${cleanSource}`; // Attempt to serve relative to root
            altText = `Image (Relative Path): ${cleanSource}`;
            console.warn(`[HTML Gen] Serving potentially non-standard relative path: ${cleanSource}`);
        }
        // Return the img tag
        return `<img src="${escapeHtml(serverPath)}" alt="${escapeHtml(altText)}" style="max-width: 100%; height: auto; border: 1px solid #ccc; margin: 5px 0; background-color: #fff;">`;
    };

    // Renders original text, replacing source references with actual <img> tags for review
    // This function now needs to handle multiple, potentially different image sources
    const renderOriginalTextWithImages = (text, allOriginalSources) => {
        if (typeof text !== 'string') return '';
        let renderedText = escapeHtml(text); // Start with escaped text

        // Iterate through ALL original sources found in the question context
        allOriginalSources.forEach(sourcePathOrUrl => {
            const cleanSource = sourcePathOrUrl.replace(/\\/g, '/');
            // Escape the source for use in RegExp (handle special characters)
            const escapedCleanSourceForRegex = cleanSource.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            // Regex for HTML img tags referencing this specific source
            const imgTagRegex = new RegExp(`<img\\s+[^>]*?src=["']${escapedCleanSourceForRegex}["'][^>]*?>`, 'gi');
            // Regex for Markdown links referencing this specific source (only if not an HTTP URL)
            let markdownRegex = null;
            if (!cleanSource.toLowerCase().startsWith('http')) {
                 markdownRegex = new RegExp(`\\(\\s*(?:\\.?\\/?)?${escapedCleanSourceForRegex}\\s*\\)`, 'gi');
            }

            // Create the replacement <img> tag using our helper function
            const replacementTag = createRelativeImgTag(cleanSource);

            // Replace all occurrences of this specific image reference in the escaped text
            renderedText = renderedText.replace(imgTagRegex, replacementTag); // Replace HTML tags
            if (markdownRegex) {
                 renderedText = renderedText.replace(markdownRegex, replacementTag); // Replace Markdown links
            }
        });

        // Revert escaping for known safe HTML tags AFTER replacements
        // Use non-greedy matching (.*?)
        renderedText = renderedText.replace(/&lt;span class="mathy"&gt;(.*?)&lt;\/span&gt;/gi, '<span class="mathy">$1</span>');
        renderedText = renderedText.replace(/&lt;b&gt;(.*?)&lt;\/b&gt;/gi, '<b>$1</b>');
        renderedText = renderedText.replace(/&lt;i&gt;(.*?)&lt;\/i&gt;/gi, '<i>$1</i>');
        renderedText = renderedText.replace(/&lt;br\s*?\/?&gt;/gi, '<br>');
        // Be careful with unescaping &amp; if the original text might contain intended entities
        // renderedText = renderedText.replace(/&amp;/g, '&');

        return renderedText;
    };

     // Renders text containing the AI-generated SVG/HTML
     // Assumes the input text ALREADY has the SVG embedded by the AI
     const renderModifiedTextWithSvg = (text) => {
         if (typeof text !== 'string') return '';
         // The text from modified_data should already contain the SVG.
         // We just need to ensure it's not double-escaped.
         // Let the browser render the raw HTML/SVG provided by the AI.
         // Basic decoding might be needed if the AI over-escaped, but ideally it provides valid HTML.
         // return decodeHtmlEntities(text); // Use cautiously
         return text; // Trust the AI output for now
     };

    // Renders options list (before or after)
    const renderOptions = (options, isAfter = false, allOriginalSources = []) => {
        if (!Array.isArray(options)) return '<li>No options found or invalid format</li>';
        return options.map(opt => {
            // Safely get text and correctness
            const text = (opt && typeof opt === 'object' && Object.keys(opt).length > 0) ? Object.keys(opt)[0] : 'Invalid Option Format';
            const isCorrect = (opt && typeof opt === 'object') ? Object.values(opt)[0] === true : false;

            // Render text based on whether it's 'before' (original + images) or 'after' (AI modified + SVG)
            let renderedText = isAfter
                ? renderModifiedTextWithSvg(text)
                : renderOriginalTextWithImages(text, allOriginalSources);

            const style = isCorrect ? 'font-weight: bold; color: green;' : '';
            const marker = isCorrect ? ' (Correct)' : ''; // Simplified marker
            return `<li style="margin-bottom: 10px; ${style}">${renderedText}${marker}</li>`;
        }).join('');
    };

    const reviewId = `s${qInfo.sIndex}q${qInfo.qIndex}`; // Unique ID for this review item

    // --- HTML Structure ---
    // Using the outer backticks for the main HTML template
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Review SVG Replacement (S:${qInfo.sIndex + 1}, Q:${qInfo.qIndex + 1})</title>
    <style>
        body { font-family: sans-serif; line-height: 1.6; padding: 15px; background-color: #fdfdfd; }
        h1, h2, h3 { color: #333; }
        .container { display: flex; gap: 20px; border: 1px solid #ccc; padding: 15px; flex-wrap: wrap; background-color: #fff; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .column { flex: 1; border: 1px solid #eee; padding: 15px; overflow-x: auto; min-width: 400px; background-color: #f9f9f9; border-radius: 4px; }
        .column h2 { margin-top: 0; border-bottom: 1px solid #ddd; padding-bottom: 8px; font-size: 1.3em; color: #555; }
        .column h3 { margin-top: 15px; margin-bottom: 8px; font-size: 1.1em; color: #444; border-bottom: 1px dashed #eee; padding-bottom: 4px;}
        ul { padding-left: 20px; margin-top: 5px; list-style: disc; }
        li { margin-bottom: 10px; word-wrap: break-word; /* Allow long text/options to wrap */ }
        /* Style for images displayed in the 'Before' column */
        .column .original-image-display img { max-width: 100%; height: auto; border: 1px solid #ccc; margin: 8px 0; display: block; background-color: #fff; }
        /* Style specifically for the SVG preview area */
        .svg-preview-area svg { max-width: 100%; width: auto; /* Allow SVG to determine its aspect ratio */ height: auto; max-height: 400px; /* Limit max height */ border: 1px solid #ddd; margin: 8px 0; display: block; background-color: #f0f0f0; }
        /* Style for SVGs embedded within the question/option/explanation text */
        .content-area svg { display: inline-block; vertical-align: middle; max-width: 90%; /* Prevent huge inline SVGs */ height: auto; max-height: 100px; /* Limit height of inline SVGs */ margin: 0 0.2em; border: 1px solid lightgray; background-color: #f8f8f8; padding: 2px; }
        .actions { margin-top: 25px; text-align: center; padding: 15px; background-color: #f0f0f0; border-radius: 5px;}
        .actions p { margin-bottom: 15px; font-weight: bold; color: #333; }
        .actions button { padding: 12px 25px; font-size: 16px; cursor: pointer; margin: 0 10px; border-radius: 4px; border: none; transition: background-color 0.2s ease; }
        .yes-button { background-color: #4CAF50; color: white; } .yes-button:hover { background-color: #45a049; }
        .no-button { background-color: #f44336; color: white; } .no-button:hover { background-color: #da190b; }
        .regen-button { background-color: #ff9800; color: white; } .regen-button:hover { background-color: #e68a00; }
        .actions button:disabled { background-color: #ccc; cursor: not-allowed; color: #666; }
        .code-edit-area { margin-top: 10px; }
        .code-edit-area label { font-weight: bold; display: block; margin-bottom: 5px; font-size: 0.95em; color: #333; }
        #editableSvgCode { width: 98%; min-height: 150px; max-height: 400px; font-family: monospace; font-size: 0.9em; border: 1px solid #ccc; padding: 8px; border-radius: 3px; resize: vertical; white-space: pre; overflow-wrap: normal; overflow-x: auto; }
        .mathy { color: #006400; font-style: italic; background-color: #f0fff0; padding: 0 2px; border-radius: 2px; border: 1px solid #d0e0d0; }
        .content-area { margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #f0f0f0; }
        .content-area:last-child { border-bottom: none; }
        .image-source-list { margin-top: 10px; }
        .image-source-list h4 { margin-bottom: 5px; font-size: 1em; color: #555; }
    </style>
</head>
<body>
    <h1>Review AI-Generated SVG Replacement</h1>
    <p><strong>Section:</strong> ${escapeHtml(qInfo.sectionName)}</p>
    <p><strong>Question Index (Original):</strong> ${qInfo.qIndex + 1}</p>
    <p><strong>AI SVG Description:</strong> ${escapeHtml(modified_data.svg_description)}</p>
    <p style="font-size: 0.9em; color: #666;">(Note: The AI generated a single SVG to replace all image references found in the original question, options, and explanation based on the combined context.)</p>

    <div class="container">
        <div class="column">
            <h2>Before (Original with Image References)</h2>
            <div class="content-area"><h3>Question:</h3><div>${renderOriginalTextWithImages(originalQ.question, originalImageSources)}</div></div>
            <div class="content-area"><h3>Options:</h3><ul>${renderOptions(originalQ.options, false, originalImageSources)}</ul></div>
            <div class="content-area"><h3>Explanation:</h3><div>${renderOriginalTextWithImages(originalQ.explanation, originalImageSources)}</div></div>
             ${originalImageSources.length > 0 ? `
             <div class="content-area image-source-list">
                <h4>Original Image Source(s) Referenced:</h4>
                <div class="original-image-display">
                    ${originalImageSources.map(p => createRelativeImgTag(p)).join('')}
                </div>
             </div>` : ''}
        </div>
        <div class="column">
            <h2>After (Text with Single SVG Replacement)</h2>
             <div class="content-area"><h3>Question:</h3><div>${renderModifiedTextWithSvg(modified_data.question)}</div></div>
            <div class="content-area"><h3>Options:</h3><ul>${renderOptions(modified_data.options, true)}</ul></div>
            <div class="content-area"><h3>Explanation:</h3><div>${renderModifiedTextWithSvg(modified_data.explanation)}</div></div>
            <div class="content-area code-edit-area">
                <label for="editableSvgCode">Editable SVG Code:</label>
                <textarea id="editableSvgCode" oninput="updateSvgPreview()">${escapeHtml(modified_data.svg_code)}</textarea>
            </div>
            <div class="content-area svg-preview-area">
                <h3>Rendered SVG Preview (Live Update):</h3>
                <div id="svgPreviewContainer">${modified_data.svg_code}</div> <!-- Display raw SVG code for rendering -->
            </div>
        </div>
    </div>

    <div class="actions">
        <p>Replace ALL original image reference(s) with the single SVG (edited if modified)?</p>
        <button id="yesBtn" class="yes-button" onclick="submitReview('yes', '${reviewId}')">Yes, Replace All</button>
        <button id="noBtn" class="no-button" onclick="submitReview('no', '${reviewId}')">No, Keep Original</button>
        <button id="regenBtn" class="regen-button" onclick="submitReview('regenerate', '${reviewId}')">Regenerate SVG</button>
    </div>

    <script>
        // Client-side HTML escaping (basic)
        function escapeHtmlClient(unsafe) {
            if (typeof unsafe !== 'string') return '';
            const div = document.createElement('div');
            div.textContent = unsafe;
            return div.innerHTML;
        }

        // Update SVG preview based on textarea content
        function updateSvgPreview() {
            const svgCode = document.getElementById('editableSvgCode').value;
            const previewContainer = document.getElementById('svgPreviewContainer');
            if (previewContainer) {
                // Basic check if it looks like SVG before injecting
                if (svgCode.trim().toLowerCase().startsWith('<svg')) {
                    previewContainer.innerHTML = svgCode;
                } else {
                    previewContainer.innerHTML = '<p style="color: red;">Invalid SVG code (must start with &lt;svg&gt;)</p>';
                }
            }
        }

        // Submit review decision to the server
        function submitReview(action, id) {
             // Disable buttons immediately
             document.querySelectorAll('.actions button').forEach(btn => btn.disabled = true);
             let message = 'Submitting... Please wait.';
             if (action === 'regenerate') message = 'Requesting regeneration...';
             document.querySelector('.actions p').textContent = message;

             let fetchOptions = { method: 'GET' };
             let url = '/confirm?action=' + encodeURIComponent(action) + '&id=' + encodeURIComponent(id);

             // Use POST only for 'yes' action to send potentially large edited SVG
             if (action === 'yes') {
                 const editedSvgCode = document.getElementById('editableSvgCode').value;
                 // Basic client-side validation before sending
                 if (!editedSvgCode || !editedSvgCode.trim().toLowerCase().startsWith('<svg')) {
                     alert('Error: Edited content does not appear to be valid SVG (must start with <svg>). Cannot submit.');
                     document.querySelectorAll('.actions button').forEach(btn => btn.disabled = false); // Re-enable buttons
                     document.querySelector('.actions p').textContent = 'Replace ALL original image reference(s) with the single SVG (edited if modified)?'; // Reset text
                     return; // Stop submission
                 }
                 fetchOptions = {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({ action: 'yes', id: id, editedSvg: editedSvgCode })
                 };
                 url = '/confirm'; // POST goes to the base confirm path
             }

             // Make the request
             fetch(url, fetchOptions)
                 .then(response => {
                     if (!response.ok) {
                         // Try to get error text from response body
                         return response.text().then(text => {
                             // *** CORRECTED LINE USING STRING CONCATENATION ***
                             throw new Error('HTTP error! Status: ' + response.status + ' ' + response.statusText + '. Response: ' + (text || '(No response body)'));
                         });
                     }
                     return response.text(); // Expect 'OK_NEXT' or 'OK_DONE'
                 })
                 .then(data => {
                     if (data === 'OK_NEXT') {
                         document.querySelector('.actions p').textContent = 'Success! Loading next item...';
                         // Add a small delay before reloading to show the message
                         setTimeout(() => { window.location.href = '/'; }, 500); // Reload root to get next item
                     } else if (data === 'OK_DONE') {
                         // Display completion message
                         document.body.innerHTML = '<h1>Review Complete</h1><p>All selected items have been processed. You can close this window or restart the script to process more sections.</p>';
                     } else {
                         // Handle unexpected success response
                         document.body.innerHTML = '<h1>Unexpected Response</h1><p>Received an unexpected success response from the server:</p><pre>' + escapeHtmlClient(data) + '</pre><p><a href="/">Reload</a></p>';
                     }
                 })
                 .catch(error => {
                     // Display fetch/network errors or HTTP errors
                     console.error('Fetch Error:', error);
                     document.body.innerHTML = '<h1>Error</h1><p>Failed to submit review decision:</p><pre>' + escapeHtmlClient(error.message) + '</pre><p><a href="/">Reload</a></p>';
                     // Consider re-enabling buttons here if it's a recoverable error, but often it's better to force reload
                 });
        }

        // Initial SVG preview render on page load
        document.addEventListener('DOMContentLoaded', updateSvgPreview);
    </script>
</body>
</html>`;
}


// Starts the review server, serving local and downloaded images
function startReviewServer(port) {
    return new Promise((resolve, reject) => {
        server = http.createServer(async (req, res) => {
            const requestUrl = url.parse(req.url, true);
            const pathname = requestUrl.pathname;
            const query = requestUrl.query;
            const method = req.method;

            try {
                // --- Root Path: Display Review UI ---
                if (pathname === '/' && method === 'GET') {
                    if (currentReviewData?.qInfo && currentReviewData?.svgResult?.status === 'success') {
                        // Generate HTML using the current review data
                        const html = generateComparisonHtml(currentReviewData.qInfo, currentReviewData.svgResult, currentReviewData.originalImageSources);
                        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end(html);
                    } else {
                        // --- Waiting Message Logic ---
                        let waitMessage = '<h1>Processing...</h1><p>Waiting for the next question to review...</p>';
                        if (currentReviewData?.svgResult?.status && currentReviewData.svgResult.status !== 'success') {
                            // If the last attempt resulted in an AI error shown to the script console
                            waitMessage = `<h1>Processing Error</h1><p>Issue processing previous item (Status: ${currentReviewData.svgResult.status}, Reason: ${currentReviewData.svgResult.reason || 'N/A'}). Waiting for script to proceed or finish...</p>`;
                        } else if (!currentReviewData) {
                            // Initial state or between questions
                            waitMessage = '<h1>Processing...</h1><p>Waiting for the next question or script initialization. Refresh if stuck for a long time.</p>';
                        }
                        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                        // Add auto-refresh to check again
                        res.end(`${waitMessage}<script>setTimeout(() => window.location.reload(), 5000);</script>`);
                    }
                }
                // --- Confirmation Path: Handle User Decision ---
                else if (pathname === '/confirm') {
                     let action = null;
                     let id = null;
                     let receivedSvg = null; // Will hold edited SVG from POST

                     if (method === 'POST') {
                         // Handle POST request (only for 'yes' action)
                         let body = '';
                         req.on('data', chunk => { body += chunk.toString(); });
                         req.on('end', async () => {
                             try {
                                 const postData = JSON.parse(body);
                                 action = postData.action;
                                 id = postData.id;
                                 receivedSvg = postData.editedSvg; // Get edited SVG from body

                                 if (action !== 'yes') throw new Error("POST method is only allowed for 'yes' action.");
                                 if (typeof receivedSvg !== 'string') throw new Error("Missing 'editedSvg' in POST body.");

                                 // Validate SVG basic structure before passing to processing
                                 const finalSvg = receivedSvg; // Use the received SVG
                                 if (!finalSvg.trim().toLowerCase().startsWith('<svg')) {
                                     console.warn(`[Server] Warning: Received edited content for ${id} via POST doesn't start with <svg>.`);
                                     // Decide whether to reject or proceed cautiously
                                     // For now, proceed but log warning. Could throw error here.
                                 }
                                 await processConfirmation(action, id, finalSvg, res); // Pass SVG to handler
                             } catch (parseError) {
                                 console.error(`[Server] Error parsing POST body or invalid data: ${parseError.message}`);
                                 if (!res.headersSent) res.writeHead(400, { 'Content-Type': 'text/plain' });
                                 if (!res.writableEnded) res.end(`Error: Invalid POST data - ${parseError.message}`);
                                 // Reject the promise if review is active
                                 if (currentReviewData?.rejectPromise) try { currentReviewData.rejectPromise(parseError); } catch (e) { /* ignore */ }
                             }
                         });
                     } else if (method === 'GET') {
                         // Handle GET request (for 'no' and 'regenerate')
                         action = query.action;
                         id = query.id;

                         if (action === 'yes') {
                             // 'yes' action MUST use POST
                             console.error("[Server] 'yes' action requires POST method to send SVG data.");
                             if (!res.headersSent) res.writeHead(405, {'Allow': 'POST', 'Content-Type': 'text/plain'});
                             if (!res.writableEnded) res.end('Error: Use POST method for "yes" action.');
                             if (currentReviewData?.rejectPromise) try { currentReviewData.rejectPromise(new Error("'yes' action requires POST")); } catch (e) { /* ignore */ }
                             return; // Stop processing GET for 'yes'
                         }
                         // Process 'no' or 'regenerate' from GET
                         await processConfirmation(action, id, null, res); // No SVG body for GET
                     } else {
                         // Handle other methods (PUT, DELETE, etc.)
                         if (!res.headersSent) res.writeHead(405, {'Allow': 'GET, POST', 'Content-Type': 'text/plain'});
                         if (!res.writableEnded) res.end('Method Not Allowed');
                     }
                }
                // --- Image Serving Path (Serves from IMAGE_FOLDER and DOWNLOADED_IMAGE_FOLDER) ---
                else if (pathname !== '/favicon.ico' && method === 'GET') {
                    // Decode URI component to handle spaces or special chars in filenames
                    const requestedRelativePath = decodeURIComponent(pathname.substring(1)).replace(/\\/g, '/');

                    // Define allowed base folders (relative from CWD, normalized)
                    const allowedFolders = [
                        IMAGE_FOLDER.replace(/\\/g, '/').replace(/^\.\//, ''),
                        DOWNLOADED_IMAGE_FOLDER.replace(/\\/g, '/').replace(/^\.\//, '')
                    ].filter(Boolean); // Filter out empty strings if folders aren't defined

                    // Security Check 1: Prevent path traversal (..)
                    if (requestedRelativePath.includes('..')) {
                         console.warn(`   [Server] Path traversal attempt blocked: ${requestedRelativePath}`);
                         res.writeHead(403); res.end('Forbidden'); return;
                    }

                    // Security Check 2: Ensure the requested path starts with an allowed folder prefix
                    const isAllowedPrefix = allowedFolders.some(folderPrefix => requestedRelativePath.startsWith(folderPrefix + '/'));
                    if (!isAllowedPrefix) {
                         console.warn(`   [Server] Access to non-allowed folder blocked: ${requestedRelativePath}`);
                         res.writeHead(403); res.end('Forbidden'); return;
                    }

                    // Resolve the absolute path on the server
                    const absoluteImagePath = path.resolve(process.cwd(), requestedRelativePath);

                    // Security Check 3: Double-check that the resolved path is still within an allowed root directory
                    // This helps prevent issues with symlinks or complex path manipulations.
                    const allowedAbsoluteRoots = allowedFolders.map(f => path.resolve(process.cwd(), f));
                    const isWithinAllowedRoot = allowedAbsoluteRoots.some(root => absoluteImagePath.startsWith(root + path.sep)); // Check startsWith root + separator
                     if (!isWithinAllowedRoot) {
                          console.warn(`   [Server] Forbidden access outside allowed roots (post-resolve): ${absoluteImagePath}`);
                          res.writeHead(403); res.end('Forbidden'); return;
                     }

                    // Check if file exists and is a file
                    if (fs.existsSync(absoluteImagePath) && fs.statSync(absoluteImagePath).isFile()) {
                        const mimeType = mime.lookup(absoluteImagePath) || 'application/octet-stream';
                        res.writeHead(200, { 'Content-Type': mimeType });
                        fs.createReadStream(absoluteImagePath).pipe(res); // Stream the file
                    } else {
                        console.warn(`   [Server] Image not found: ${absoluteImagePath} (requested: ${requestedRelativePath})`);
                        res.writeHead(404); res.end('Image not found');
                    }
                } else if (pathname === '/favicon.ico') {
                     // Handle favicon request (optional, prevents 404s in browser console)
                     res.writeHead(204); // No Content
                     res.end();
                } else {
                    // Handle any other paths
                    if (!res.headersSent) res.writeHead(404, { 'Content-Type': 'text/plain' });
                    if (!res.writableEnded) res.end('Not Found');
                }
            } catch (error) {
                 // --- General Server Error Handling ---
                 console.error(`   [Server] Error handling ${req.method} ${req.url}:`, error);
                 if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
                 if (!res.writableEnded) res.end(`Server Error: ${error.message}`);
                 // If an error occurs during confirmation, reject the promise
                 if (pathname === '/confirm' && currentReviewData?.rejectPromise) {
                     try { currentReviewData.rejectPromise(error); } catch (e) { /* ignore subsequent errors */ }
                 }
            }
        });

        // --- Helper function to process the confirmation action ---
        async function processConfirmation(action, id, finalSvg, res) {
             // Check if there's an active review waiting
             if (!currentReviewData?.resolvePromise || !currentReviewData?.qInfo) {
                 console.error("   [Server] Confirmation received, but no review promise or qInfo active.");
                 if (!res.headersSent) res.writeHead(409, { 'Content-Type': 'text/plain' }); // Conflict
                 if (!res.writableEnded) res.end('Error: No active review found or review data missing.');
                 return;
             }

             // Verify the ID matches the current review item
             const expectedId = `s${currentReviewData.qInfo.sIndex}q${currentReviewData.qInfo.qIndex}`;
             if (id !== expectedId) {
                 console.error(`   [Server] Confirmation ID mismatch. Expected ${expectedId}, got ${id}.`);
                 if (!res.headersSent) res.writeHead(400, { 'Content-Type': 'text/plain' }); // Bad Request
                 if (!res.writableEnded) res.end(`Error: ID mismatch. Expected ${expectedId}.`);
                 // Optionally reject the promise on mismatch
                 // if (currentReviewData.rejectPromise) try { currentReviewData.rejectPromise(new Error("ID mismatch")); } catch(e){}
                 return;
             }

             console.log(`   [Server] Processing confirmation: Action=${action}, ID=${id}${finalSvg ? ', HasFinalSVG=true' : ''}`);

             try {
                 // Resolve the promise based on the action
                 if (action === 'yes') {
                     // Pass the final SVG (edited or original from AI)
                     currentReviewData.resolvePromise({ accepted: true, finalSvg: finalSvg });
                 } else if (action === 'no') {
                     currentReviewData.resolvePromise({ accepted: false }); // Indicate rejection
                 } else if (action === 'regenerate') {
                     currentReviewData.resolvePromise('regenerate'); // Indicate regeneration request
                 } else {
                     throw new Error(`Invalid action received: ${action}`);
                 }

                 // Send confirmation back to the browser
                 if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'text/plain' });
                 // Send OK_NEXT to trigger reload/advance in the client-side JS
                 if (!res.writableEnded) res.end('OK_NEXT');

             } catch (resolveError) {
                 // Error occurred while resolving the promise or processing action
                 console.error(`   [Server] Error processing action '${action}' for ID ${id}: ${resolveError.message}`);
                 // Reject the main script's promise
                 if (currentReviewData?.rejectPromise) {
                     try { currentReviewData.rejectPromise(resolveError); } catch (e) { /* ignore */ }
                 }
                 // Send error response to browser
                 if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
                 if (!res.writableEnded) res.end(`Server Error processing action: ${resolveError.message}`);
             }
        }

        // Start listening
        server.listen(port, 'localhost', () => {
            console.log(`   Review server started on http://localhost:${port}`);
            resolve(server); // Resolve the promise when server is listening
        });

        // Handle server startup errors (like EADDRINUSE)
        server.on('error', (err) => {
            console.error(`   [Server] Failed to start on port ${port}:`, err.message);
            if (err.code === 'EADDRINUSE') {
                console.error(`   Error: Port ${port} is already in use. Please close the other application or choose a different port.`);
            }
            reject(err); // Reject the promise if server fails to start
        });
    });
}

// Stops the review server gracefully
function stopReviewServer() {
    return new Promise((resolve) => {
        if (server?.listening) {
            console.log("   Stopping review server...");
            // Force close after a timeout if graceful close hangs
            const timeout = setTimeout(() => {
                console.warn("   [Server] Forcing close after timeout.");
                if (server) server.destroy(); // Force close connections
                server = null;
                currentReviewData = null; // Clear state
                resolve();
            }, 2000); // 2 second timeout

            server.close((err) => {
                clearTimeout(timeout); // Cancel the force close timeout
                if (err) {
                    console.error("   [Server] Error during close:", err.message);
                } else {
                    console.log("   Review server stopped.");
                }
                server = null; // Ensure server object is cleared
                currentReviewData = null; // Clear state
                resolve(); // Resolve the promise once closed (or timed out)
            });
        } else {
            console.log("   Review server already stopped or not started.");
            server = null; // Ensure server object is cleared
            currentReviewData = null; // Clear state
            resolve(); // Resolve immediately if not running
        }
    });
}

// --- Section Processing Functions ---
// Finds sections with images not yet marked as accepted/rejected
function findUnprocessedSectionsWithImages(questionsData, imageFolderBase) {
    console.log("\n--- Scanning for sections with unprocessed images ---");
    const unprocessedSections = [];
    // Normalize the base image folder path for consistent checks
    const normalizedImageFolderBase = imageFolderBase ? imageFolderBase.replace(/\\/g, '/').replace(/\/$/, '') : null;

    if (!questionsData?.sections || !Array.isArray(questionsData.sections)) {
        console.warn("   [Scan] Invalid questionsData structure: 'sections' array not found.");
        return []; // Return empty array if structure is invalid
    }

    questionsData.sections.forEach((section, sIndex) => {
        const sectionName = section?.section || `Unnamed Section ${sIndex + 1}`;
        let sectionHasImages = false;
        let sectionIsFullyProcessed = true; // Assume processed until an unprocessed image Q is found
        let unprocessedCount = 0;

        if (section?.questions && Array.isArray(section.questions)) {
            for (const question of section.questions) {
                if (!question || typeof question !== 'object') continue; // Skip invalid question entries

                // Combine text from question, options, and explanation for image extraction
                const questionText = question.question || "";
                const optionsText = (question.options || [])
                    .map(opt => (typeof opt === 'object' && Object.keys(opt).length > 0) ? Object.keys(opt)[0] : '')
                    .join(' ');
                const explanationText = question.explanation || "";

                // Use extractImagePaths to find any img src or markdown link
                const imageSources = extractImagePaths(questionText, optionsText + " " + explanationText, normalizedImageFolderBase);

                if (imageSources.length > 0) {
                    sectionHasImages = true; // Mark section as having images
                    // Check if this specific question needs processing
                    if (question._svgReviewStatus !== "accepted" && question._svgReviewStatus !== "rejected") {
                        sectionIsFullyProcessed = false; // Found an unprocessed one
                        unprocessedCount++;
                    }
                }
            } // End loop through questions in section
        } else {
            // Log if a section is missing the 'questions' array
            console.warn(`   [Scan] Section ${sIndex + 1} "${sectionName}" has missing or invalid 'questions' array.`);
            // Treat section as fully processed if it has no valid questions array
        }

        // If the section had images AND at least one was unprocessed, add it to the list
        if (sectionHasImages && !sectionIsFullyProcessed) {
            unprocessedSections.push({
                sIndex: sIndex,
                sectionName: sectionName,
                unprocessedImageQCount: unprocessedCount
            });
            console.log(`   Found unprocessed section: ${sIndex + 1} "${sectionName}" (${unprocessedCount} image Qs needing review)`);
        } else if (sectionHasImages) {
            // Log sections that have images but are already fully processed
            console.log(`   Skipping fully processed section: ${sIndex + 1} "${sectionName}" (all image Qs reviewed)`);
        }
        // Sections without any images are implicitly skipped
    });
    console.log(`--- Scan Complete: Found ${unprocessedSections.length} sections containing unprocessed images. ---`);
    return unprocessedSections;
}

// Prompts user to select sections to process
async function promptUserForSectionSelection(availableSections) {
    if (!availableSections || availableSections.length === 0) {
        console.log("   No more unprocessed sections with images found.");
        return { action: 'quit', selectedIndices: [] }; // No sections to select
    }

    console.log("\nAvailable Sections with Unprocessed Images:");
    console.log("  0. Process ALL remaining");
    availableSections.forEach((secInfo, index) => {
        console.log(`  ${index + 1}. ${secInfo.sectionName} (Index: ${secInfo.sIndex + 1}, ${secInfo.unprocessedImageQCount} Qs)`);
    });
    console.log("  Q. Quit");

    let selectedIndices = null;
    let action = 'process'; // Default action

    while (selectedIndices === null) {
        const answer = await askQuestion(`Enter number(s) (e.g., 1, 3), 0 for all, or Q to quit: `);
        const input = answer.toLowerCase().trim();

        if (input === 'q') {
            action = 'quit';
            selectedIndices = []; // Empty array indicates quit
            console.log("   User chose to quit.");
            break;
        }

        if (input === '0') {
            // Select all available section indices
            selectedIndices = availableSections.map(s => s.sIndex);
            console.log(`   Selected: Process all ${selectedIndices.length} remaining sections.`);
            break;
        }

        // Process comma-separated list of numbers
        const choices = input.split(',').map(s => s.trim()).filter(Boolean); // Get individual choices
        const indices = [];
        let invalidInput = false;

        for (const choice of choices) {
            const num = parseInt(choice, 10);
            // Validate each number
            if (isNaN(num) || num < 1 || num > availableSections.length) {
                console.log(`   Invalid input: "${choice}". Please enter numbers between 1 and ${availableSections.length}, 0, or Q.`);
                invalidInput = true;
                break; // Stop processing this input line
            }
            // Convert valid choice number to actual section index
            indices.push(availableSections[num - 1].sIndex);
        }

        if (invalidInput) {
            continue; // Ask again
        }

        // Check if any valid indices were parsed
        if (indices.length === 0 && choices.length > 0) {
            // Input was not empty but resulted in no valid indices (e.g., just commas)
            console.log(`   Invalid input format. Please enter numbers, 0, or Q.`);
            continue; // Ask again
        } else if (indices.length > 0) {
            // Valid indices selected
            // Use Set to remove duplicates, then sort numerically
            selectedIndices = [...new Set(indices)].sort((a, b) => a - b);
            const selectedNames = selectedIndices.map(idx => availableSections.find(s => s.sIndex === idx)?.sectionName || `Index ${idx+1}`);
            console.log(`   Selected sections (Indices): [${selectedIndices.map(i=>i+1).join(', ')}] Names: ${selectedNames.join(', ')}`);
            break; // Selection successful
        } else {
            // Input was empty
            console.log(`   Please enter section number(s), 0, or Q.`);
            // Loop continues to ask again
        }
    } // End while loop

    return { action, selectedIndices };
}


// --- Main Processing Logic ---
async function run() {
    console.log(`\n--- Starting Image to SVG Replacement Process (Downloads Enabled, Multi-Image Handling) ---`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    const resolvedSourceInputFile = path.resolve(SOURCE_INPUT_FILE);
    const resolvedOutputFile = path.resolve(OUTPUT_FILE);
    const resolvedImageFolder = path.resolve(IMAGE_FOLDER); // Used for identifying local paths
    const resolvedOutputImageFolder = path.resolve(OUTPUT_IMAGE_FOLDER); // Used for copying accepted local images
    const resolvedDownloadedImageFolder = path.resolve(DOWNLOADED_IMAGE_FOLDER); // Used for storing downloads
    console.log(`Source: ${resolvedSourceInputFile}`);
    console.log(`Output/Resume: ${resolvedOutputFile}`);
    console.log(`Logs: ${path.resolve(REMOVAL_LOG)}, ${path.resolve(SVG_GENERATION_FAILURE_LOG)}`);
    console.log(`Source LOCAL Image Folder Prefix Used in Paths: "${IMAGE_FOLDER}"`);
    console.log(`Destination for Copied Original LOCAL Images (on Accept): ${resolvedOutputImageFolder}`);
    console.log(`Folder for Downloaded External Images: ${resolvedDownloadedImageFolder}`);
    console.log(`Server Port: ${SERVER_PORT}, API Delay: ${API_DELAY_MS}ms`);

    // --- 1. Load Data ---
    let questionsData;
    let inputFileToLoad;
    let isResuming = false;
    // Prefer output file if it exists (resume capability)
    if (fs.existsSync(resolvedOutputFile)) {
        inputFileToLoad = resolvedOutputFile;
        isResuming = true;
        console.log(`   Resuming from existing output file: ${resolvedOutputFile}`);
    } else {
        inputFileToLoad = resolvedSourceInputFile;
        console.log(`   Loading source file: ${resolvedSourceInputFile}`);
    }

    try {
        if (!fs.existsSync(inputFileToLoad)) {
            throw new Error(`Input file not found: ${inputFileToLoad}`);
        }
        // Clear cache to ensure fresh load, especially when resuming
        delete require.cache[require.resolve(inputFileToLoad)];
        const loadedModule = require(inputFileToLoad);

        // Handle different export styles (module.exports = { sections: [...] } or module.exports = [...])
        if (typeof loadedModule === 'object' && loadedModule !== null) {
            if (Array.isArray(loadedModule.sections)) {
                questionsData = loadedModule; // Expected format { sections: [...] }
            } else if (Array.isArray(loadedModule)) {
                // Handle case where the export is just the array of sections
                console.warn("   Loaded data is an array, wrapping in { sections: [...] } structure.");
                questionsData = { sections: loadedModule };
            } else if (loadedModule.default) { // Handle ES Module default export
                 if (typeof loadedModule.default === 'object' && loadedModule.default !== null) {
                     if (Array.isArray(loadedModule.default.sections)) {
                         questionsData = loadedModule.default;
                     } else if (Array.isArray(loadedModule.default)) {
                         console.warn("   Loaded data (default export) is an array, wrapping in { sections: [...] } structure.");
                         questionsData = { sections: loadedModule.default };
                     }
                 }
            } else if (loadedModule.questionsData && Array.isArray(loadedModule.questionsData.sections)) {
                 // Handle common naming like { questionsData: { sections: [...] } }
                 questionsData = loadedModule.questionsData;
            }
        }

        // Final validation of the loaded structure
        if (!questionsData || typeof questionsData !== 'object' || !Array.isArray(questionsData.sections)) {
            throw new Error(`Invalid data structure loaded from ${inputFileToLoad}. Expected an object with a 'sections' array.`);
        }
        console.log(`   Successfully loaded ${questionsData.sections.length} sections from: ${inputFileToLoad}`);
    } catch (error) {
        console.error(`[Critical Error] Failed loading or parsing ${inputFileToLoad}:`, error);
        if (readline && !readline.closed) readline.close();
        await stopReviewServer(); // Attempt cleanup
        process.exit(1);
    }

    // --- 2. Setup Gemini ---
    try {
        console.log("\n--- Initial Setup ---");
        const currentApiKey = await getApiKeyIfNeeded();
        const coreGenAI = initializeGeminiCore(currentApiKey); // Initialize client first
        const selectedModel = await listAndSelectModel(coreGenAI); // Then list models
        const useJson = await askForJsonModePreference(); // Ask preference
        finalizeModelSetup(selectedModel, useJson); // Finalize model and config
    } catch (error) {
        console.error(`[Critical Error] Gemini setup failed: ${error.message}`);
        if (readline && !readline.closed) readline.close();
        await stopReviewServer(); // Attempt cleanup
        process.exit(1);
    }
    console.log("--- Setup Complete ---");

    // --- 3. Start Server ---
    try {
        await startReviewServer(SERVER_PORT);
    } catch (error) {
        console.error(`[Critical Error] Could not start review server: ${error.message}. Aborting.`);
        if (readline && !readline.closed) readline.close();
        process.exit(1);
    }

    // --- 4. Main Processing Loop ---
    let keepProcessing = true;
    let iteration = 0;
    // Statistics counters
    let overallQuestionsChecked = 0, overallSkippedReviewed = 0;
    let totalQuestionsSentToApi = 0, totalSvgGenerated = 0, totalSvgAccepted = 0, totalSvgRejected = 0;
    let totalRemovedPrecheck = 0, totalApiFailures = 0, totalMissingImageRemoved = 0; // Includes download/process failures
    let totalRegenerations = 0; let totalImagesCopied = 0;

    while (keepProcessing) {
        iteration++;
        console.log(`\n--- Starting Processing Iteration ${iteration} ---`);

        // Find sections that still have work to do
        const availableSections = findUnprocessedSectionsWithImages(questionsData, IMAGE_FOLDER);
        if (availableSections.length === 0) {
            console.log("   All sections with images appear to be fully processed. Finishing.");
            keepProcessing = false;
            break; // Exit the main loop
        }

        // Ask user which sections to process in this batch
        const { action, selectedIndices } = await promptUserForSectionSelection(availableSections);
        if (action === 'quit') {
            console.log("   Quitting processing as requested by user.");
            keepProcessing = false;
            break; // Exit the main loop
        }
        if (!selectedIndices || selectedIndices.length === 0) {
            // Should not happen if action is not 'quit', but handle defensively
            console.log("   No sections selected or an issue occurred. Skipping iteration.");
            continue; // Go to next iteration
        }

        console.log(`\n--- Processing Selected Sections for Iteration ${iteration} --- [Indices: ${selectedIndices.map(i => i + 1).join(', ')}]`);

        // Prepare list of questions needing review from the selected sections
        const imageQuestionsToReview = [];
        console.log("\n--- Scanning Selected Sections for Image Questions & Pre-checks ---");
        for (const sIndex of selectedIndices) {
            // Validate section index
            if (sIndex < 0 || sIndex >= questionsData.sections.length) {
                console.warn(`   Skipping invalid section index ${sIndex}.`);
                continue;
            }
            const section = questionsData.sections[sIndex];
            // Validate section structure
            if (!section || typeof section !== 'object' || !section?.questions || !Array.isArray(section.questions)) {
                console.warn(`   Skipping invalid section structure at index ${sIndex}. Section data:`, section);
                continue;
            }

            const sectionTitle = section.section || `Unnamed Section ${sIndex + 1}`;
            const questionsArray = questionsData.sections[sIndex].questions; // Direct reference
            console.log(`  Scanning Section ${sIndex + 1}: "${sectionTitle}" (${questionsArray.length} questions)`);

            // Iterate backwards for safe removal using splice
            for (let qIndex = questionsArray.length - 1; qIndex >= 0; qIndex--) {
                const question = questionsArray[qIndex];
                overallQuestionsChecked++; // Count every question encountered in selected sections
                const qLogPrefix = `    S:${sIndex+1}, Q:${qIndex+1}`; // Log prefix for this question

                // Skip if already finalized in a previous run/iteration
                if (question?._svgReviewStatus === "accepted" || question?._svgReviewStatus === "rejected") {
                    overallSkippedReviewed++;
                    continue; // Already done, move to next question
                }
                // Clear any intermediate/error status from previous failed attempts if resuming
                if (question?._svgReviewStatus && question._svgReviewStatus !== "accepted" && question._svgReviewStatus !== "rejected") {
                    console.warn(`${qLogPrefix} - Resetting intermediate status '${question._svgReviewStatus}' for reprocessing.`);
                    delete question._svgReviewStatus;
                    delete question._svgDescription; // Also clear description if status is reset
                }

                // --- Basic Question Structure Validation ---
                let skipReason = null;
                 if (!question || typeof question !== 'object') {
                     skipReason = `Invalid question format (not an object)`;
                 } else if (!question.question || typeof question.question !== 'string' || !question.question.trim()) {
                     skipReason = `Missing or empty question text`;
                 } else if (question.hasOwnProperty('options') && question.options !== null) {
                     // Validate options only if they exist and are not null
                     if (!Array.isArray(question.options)) {
                         skipReason = `Invalid options format (not an array)`;
                     } else {
                         // Validate each option's structure: { "text": boolean }
                         for (let optIndex = 0; optIndex < question.options.length; optIndex++) {
                             const opt = question.options[optIndex];
                             if (!opt || typeof opt !== 'object' || Object.keys(opt).length !== 1 || typeof Object.values(opt)[0] !== 'boolean') {
                                 skipReason = `Invalid option structure @ index ${optIndex}: ${JSON.stringify(opt)}`;
                                 break; // Stop checking options on first error
                             }
                         }
                     }
                 } // No 'else if' for explanation - allow missing explanation
                 else if (question.hasOwnProperty('explanation') && question.explanation !== null && typeof question.explanation !== 'string') {
                     // Validate explanation only if it exists and is not null
                     skipReason = `Invalid explanation format (not a string or null)`;
                 }

                 // If validation failed, remove the question and log it
                 if (skipReason) {
                     console.warn(`${qLogPrefix} - REMOVING (Pre-check failed): ${skipReason}.`);
                     const logMsg = `[S:${sIndex+1}, Q:${qIndex+1}] REMOVED (Pre-check Failed): ${skipReason}\nSection: "${sectionTitle}"\nData Snippet: ${JSON.stringify(question).substring(0, 200)}...`;
                     appendToLogFile(REMOVAL_LOG, logMsg);
                     questionsArray.splice(qIndex, 1); // Remove from the array
                     totalRemovedPrecheck++;
                     saveProgress(questionsData, `after removing Q:${qIndex+1} (pre-check) in S:${sIndex+1}`); // Save immediately after removal
                     continue; // Move to the next question index
                 }
                 // --- End Basic Validation ---

                // Extract all image sources from the valid question context
                const questionText = question.question;
                const questionOptions = question.options || []; // Default to empty array if missing
                const combinedOptionsText = questionOptions.map(opt => Object.keys(opt)[0]).join(' '); // Extract text from options
                const explanationText = question.explanation || ""; // Default to empty string if missing/null

                // Use extractImagePaths with LOCAL prefix for markdown detection
                const allImageSources = extractImagePaths(questionText, combinedOptionsText + " " + explanationText, IMAGE_FOLDER);

                // If images are found and the question hasn't been finalized, add to review list
                if (allImageSources.length > 0 && question._svgReviewStatus !== "accepted" && question._svgReviewStatus !== "rejected") {
                    // Add to the beginning of the array to process in original order (due to iterating backwards)
                    imageQuestionsToReview.unshift({
                        question: question, // Keep a direct reference to the question object
                        sectionName: sectionTitle,
                        sIndex: sIndex,
                        qIndex: qIndex, // Store original index for logging/reference
                        imageSources: allImageSources // Store all found image sources
                    });
                }
            } // End question loop (iterating backwards)
        } // End section loop for selected indices
        console.log(`--- Scan Complete for Iteration ${iteration} --- Found ${imageQuestionsToReview.length} questions with image sources requiring review in selected sections.`);

        // --- Process the collected questions for this iteration ---
        if (imageQuestionsToReview.length > 0) {
            console.log(`\n--- Starting Review Process for ${imageQuestionsToReview.length} Questions in this Iteration ---`);
            console.log(`   Open browser to http://localhost:${SERVER_PORT}`);

            let currentReviewIndex = 0;
            while (currentReviewIndex < imageQuestionsToReview.length) {
                const qInfo = imageQuestionsToReview[currentReviewIndex]; // Get info for the current question

                // --- Find the actual question object in the main data structure ---
                // This is important because the array might have changed if questions were removed
                let currentQuestionObject = null;
                let currentIndexInMainArray = -1;
                const sectionQuestions = questionsData.sections[qInfo.sIndex]?.questions;
                if (sectionQuestions) {
                    // Find the question by comparing the object reference stored in qInfo
                    currentIndexInMainArray = sectionQuestions.findIndex(q => q === qInfo.question);
                    if (currentIndexInMainArray !== -1) {
                        currentQuestionObject = sectionQuestions[currentIndexInMainArray];
                    }
                }
                // --- End Find Question Object ---

                const qLogPrefix = `   [S:${qInfo.sIndex+1}, Q:${qInfo.qIndex+1}]`; // Log prefix using original index
                console.log(`\n${qLogPrefix} Processing Review Item ${currentReviewIndex + 1}/${imageQuestionsToReview.length} (Iteration ${iteration})...`);

                // Check if the question still exists (it might have been removed by a pre-check failure of a *later* question in the original array)
                if (!currentQuestionObject) {
                    console.warn(`${qLogPrefix} - Skipping: Question reference not found in current data (likely removed by prior step).`);
                    currentReviewIndex++; // Move to the next item in the review list
                    continue;
                }
                // Double-check status in case it was somehow modified between scan and now
                 if (currentQuestionObject._svgReviewStatus === "accepted" || currentQuestionObject._svgReviewStatus === "rejected") {
                     console.warn(`${qLogPrefix} - Skipping: Question status is already '${currentQuestionObject._svgReviewStatus}'.`);
                     currentReviewIndex++;
                     continue;
                 }

                // Call generateSvgForImageQuestion with the list of sources for this question
                const svgResult = await generateSvgForImageQuestion(qInfo, qInfo.imageSources);
                let reviewDecision = null; // Stores the outcome ('accepted', 'rejected', 'regenerate', 'error', etc.)

                // --- Handle AI Generation Result ---
                if (svgResult.status === "success") {
                    totalQuestionsSentToApi++; // Count successful pre-processing and API attempt
                    totalSvgGenerated++;
                    console.log(`${qLogPrefix} SVG generated successfully by AI. Waiting for user review...`);
                    try {
                        // Wait for the user interaction via the web server
                        reviewDecision = await new Promise((resolve, reject) => {
                            // Store data needed for the server and the promise resolvers
                            currentReviewData = {
                                qInfo, // Contains original question reference, indices, section name
                                svgResult, // Contains AI output (modified text, svg code, description)
                                originalImageSources: qInfo.imageSources, // List of original image paths/URLs
                                resolvePromise: resolve, // Function to call on success (yes/no/regen)
                                rejectPromise: reject   // Function to call on server error
                            };
                            // The server will call resolvePromise or rejectPromise later
                        });
                        // reviewDecision will be { accepted: true, finalSvg: "..." } or { accepted: false } or 'regenerate'
                    } catch (reviewError) {
                        // Catch errors from the server promise (e.g., server crash, network issue during review)
                        console.error(`${qLogPrefix} Error during review process: ${reviewError.message}. Keeping original question state.`);
                        totalApiFailures++; // Count this as a failure in the overall process
                        currentQuestionObject._svgReviewStatus = "review_error"; // Mark the question state
                        saveProgress(questionsData, `after review error S:${qInfo.sIndex+1}, Q:${qInfo.qIndex+1}`);
                        reviewDecision = 'error_occurred'; // Set decision to skip further processing for this item
                    } finally {
                        // IMPORTANT: Clear the current review data regardless of outcome
                        currentReviewData = null;
                    }

                } else if (svgResult.status === "image_download_or_process_failed_remove_now") {
                    // Handle the specific status indicating pre-API failure
                    totalMissingImageRemoved++; // Increment specific counter
                    console.warn(`${qLogPrefix} - REMOVING (Image Download/Processing Failed Pre-API). Reason: ${svgResult.reason}`);
                    // Find the index again (safer in case array shifted) and remove
                    const indexToRemove = questionsData.sections[qInfo.sIndex]?.questions.findIndex(q => q === qInfo.question);
                     if (indexToRemove !== -1) {
                         questionsData.sections[qInfo.sIndex].questions.splice(indexToRemove, 1);
                         saveProgress(questionsData, `after removing failed img dl/proc S:${qInfo.sIndex+1}, Q:${qInfo.qIndex+1}`);
                     } else {
                         // This should ideally not happen if currentQuestionObject was found earlier
                         console.error(`${qLogPrefix} - !! Critical Error: Could not find question to remove after image download/processing failure.`);
                     }
                     reviewDecision = 'removed'; // Set decision to indicate removal

                } else { // Handle other AI failures (unfixable, error, API block, parse error, etc.)
                    // May or may not have made an API attempt depending on where failure occurred
                    if (svgResult.reason?.includes("API call failed") || svgResult.reason?.includes("API request blocked") || svgResult.reason?.includes("No valid response candidate")) {
                        totalQuestionsSentToApi++; // Count it if API was likely called
                    }
                    totalApiFailures++; // Increment general API/AI failure counter
                    const reason = svgResult.reason || "Unknown AI failure.";
                    console.error(`${qLogPrefix} AI failed SVG generation or processing (Status: ${svgResult.status}). Reason: ${reason}. Keeping original.`);
                    // Logging to SVG_GENERATION_FAILURE_LOG is handled within generateSvgForImageQuestion for API/parse errors
                    currentQuestionObject._svgReviewStatus = "generation_failed"; // Mark question status
                    currentQuestionObject._svgDescription = `Failed: ${reason.substring(0, 100)}`; // Store failure reason snippet
                    saveProgress(questionsData, `after AI failure S:${qInfo.sIndex+1}, Q:${qInfo.qIndex+1}`);
                    reviewDecision = 'ai_failed'; // Set decision to skip further processing
                }
                // --- End Handle AI Generation Result ---


                // --- Process User Decision (or failure status) ---
                let advanceToNextQuestion = false; // Flag to control loop advancement

                if (reviewDecision && reviewDecision.accepted === true && typeof reviewDecision.finalSvg === 'string') {
                    // User clicked "Yes, Replace" and provided valid final SVG
                    totalSvgAccepted++;
                    const userFinalSvg = reviewDecision.finalSvg; // The SVG code (potentially edited by user)
                    console.log(`${qLogPrefix} User ACCEPTED SVG replacement (using final SVG from review).`);

                    try {
                        // --- Update the actual question object using AI's modified data ---
                        // We trust the AI's modified_data fields which should already have the SVG embedded
                        // However, if the user edited the SVG, we need to replace the SVG in the AI's modified text
                        // with the user's final SVG. This is complex.
                        // SAFER APPROACH: Use the AI's modified text structure but replace its SVG with the user's final SVG.

                        const aiModifiedData = svgResult.modified_data;
                        const aiSvgCode = aiModifiedData.svg_code;

                        // Replace the AI's SVG with the user's final SVG in the text fields
                        // Use a simple string replace. If the AI's SVG appears elsewhere unexpectedly, this might replace it too, but it's unlikely.
                        currentQuestionObject.question = aiModifiedData.question.replace(aiSvgCode, userFinalSvg);
                        currentQuestionObject.options = aiModifiedData.options.map(opt => {
                             const key = Object.keys(opt)[0];
                             const value = Object.values(opt)[0];
                             const updatedKey = key.replace(aiSvgCode, userFinalSvg);
                             return { [updatedKey]: value };
                         });
                        currentQuestionObject.explanation = aiModifiedData.explanation.replace(aiSvgCode, userFinalSvg);

                        // Update status and store description
                        currentQuestionObject._svgReviewStatus = "accepted";
                        currentQuestionObject._svgDescription = aiModifiedData.svg_description; // Store AI's description

                        // --- Copy original LOCAL images (if any) to output folder ---
                        console.log(`${qLogPrefix} Copying original LOCAL image(s) associated with this question to ${resolvedOutputImageFolder}...`);
                        const normalizedImageFolder = IMAGE_FOLDER.replace(/\\/g, '/').replace(/^\.\//, ''); // Normalize for comparison
                        let copiedCountThisQ = 0;
                        for (const sourcePathOrUrl of qInfo.imageSources) {
                             // Check if it's NOT an HTTP/HTTPS URL AND (either IMAGE_FOLDER is not set OR it starts with the normalized IMAGE_FOLDER prefix)
                             const isLocal = !sourcePathOrUrl.toLowerCase().startsWith('http');
                             const isInLocalFolder = !normalizedImageFolder || sourcePathOrUrl.startsWith(normalizedImageFolder + '/');

                             if (isLocal && isInLocalFolder) {
                                try {
                                    const sourcePath = path.resolve(process.cwd(), sourcePathOrUrl); // Absolute source path
                                    // Construct destination path preserving the relative structure from IMAGE_FOLDER downwards
                                    const relativePath = sourcePathOrUrl.startsWith(normalizedImageFolder + '/')
                                                        ? sourcePathOrUrl.substring(normalizedImageFolder.length + 1)
                                                        : path.basename(sourcePathOrUrl); // Fallback to basename if not in expected folder
                                    const destPath = path.resolve(resolvedOutputImageFolder, relativePath);

                                    if (!fs.existsSync(sourcePath)) {
                                        console.warn(`${qLogPrefix}   [Warning] Source local image not found for copying: ${sourcePath} (Original ref: ${sourcePathOrUrl})`);
                                        continue; // Skip copying this one
                                    }
                                    // Ensure destination directory exists
                                    fs.mkdirSync(path.dirname(destPath), { recursive: true });
                                    // Copy the file
                                    fs.copyFileSync(sourcePath, destPath);
                                    console.log(`${qLogPrefix}   Copied: ${sourcePathOrUrl} -> ${destPath}`);
                                    copiedCountThisQ++;
                                    totalImagesCopied++; // Increment overall counter
                                } catch (copyError) {
                                    console.error(`${qLogPrefix}   [Error] Failed to copy local image ${sourcePathOrUrl}: ${copyError.message}`);
                                    // Log error but continue processing other images/questions
                                }
                             }
                        }
                        if (copiedCountThisQ > 0) console.log(`${qLogPrefix}   Finished copying ${copiedCountThisQ} local image(s).`);
                        // --- End Image Copying ---

                        saveProgress(questionsData, `after accepting S:${qInfo.sIndex+1}, Q:${qInfo.qIndex+1}`);
                        advanceToNextQuestion = true; // Move to next question

                    } catch (replaceError) {
                        // Catch errors during the text replacement process
                        console.error(`${qLogPrefix} [Critical Error] Failed to update question object with final SVG: ${replaceError.message}.`);
                        currentQuestionObject._svgReviewStatus = "replacement_error"; // Mark error status
                        saveProgress(questionsData, `after SVG replacement error S:${qInfo.sIndex+1}, Q:${qInfo.qIndex+1}`);
                        advanceToNextQuestion = true; // Move on, but log the error
                    }

                } else if (reviewDecision && reviewDecision.accepted === false) { // User clicked "No, Keep Original"
                    totalSvgRejected++;
                    console.log(`${qLogPrefix} User REJECTED SVG replacement. Keeping original question state.`);
                    currentQuestionObject._svgReviewStatus = "rejected"; // Mark as rejected
                    currentQuestionObject._svgDescription = svgResult?.modified_data?.svg_description || "Rejected"; // Store description if available
                    saveProgress(questionsData, `after rejecting S:${qInfo.sIndex+1}, Q:${qInfo.qIndex+1}`);
                    advanceToNextQuestion = true; // Move to next question

                } else if (reviewDecision === 'regenerate') { // User clicked "Regenerate SVG"
                    totalRegenerations++;
                    console.log(`${qLogPrefix} User requested REGENERATION. Retrying this question...`);
                    // Clear status to allow reprocessing in the *next* pass of this inner loop
                    delete currentQuestionObject._svgReviewStatus;
                    delete currentQuestionObject._svgDescription;
                    advanceToNextQuestion = false; // Stay on the same question index for the next loop iteration

                } else if (reviewDecision === 'removed') {
                    // Question was already removed due to image processing failure
                    console.log(`${qLogPrefix} Question was removed due to image processing failure.`);
                    advanceToNextQuestion = true; // Move to the next item in the review list

                } else { // AI failed, review error, etc.
                    console.log(`${qLogPrefix} No user decision applied (AI/Review failed or skipped). Keeping current state.`);
                    // Status should already be set (e.g., 'generation_failed', 'review_error')
                    advanceToNextQuestion = true; // Move to the next item in the review list
                }

                // --- Advance Loop or Delay ---
                if (advanceToNextQuestion) {
                    currentReviewIndex++; // Move to the next question in the review list
                    // Apply delay only if there are more questions *in this batch* and delay is set
                    if (currentReviewIndex < imageQuestionsToReview.length && API_DELAY_MS > 0) {
                        console.log(`    Waiting ${API_DELAY_MS}ms before next API call...`);
                        await delay(API_DELAY_MS);
                    }
                } else { // Regenerating the same question
                     // Apply delay before retrying the same question
                     if (API_DELAY_MS > 0) {
                         console.log(`    Waiting ${API_DELAY_MS}ms before regenerating...`);
                         await delay(API_DELAY_MS);
                     }
                }
            } // End while loop for review items in this iteration
            console.log(`\n--- Finished Processing Questions for Iteration ${iteration} ---`);
        } else {
            console.log("\n--- No image questions found requiring review in the selected sections for this iteration ---");
        }
        // Save progress at the end of each iteration (batch of sections)
        saveProgress(questionsData, `at end of iteration ${iteration}`);
    } // End main while loop (keepProcessing)

    // --- 5. Close Readline ---
    if (readline && !readline.closed) {
        readline.close();
        console.log("\n   Readline interface closed.");
    }

    // --- 6. Final Summary ---
    console.log(`\n--- Final Summary ---`);
    console.log(`Model Used: ${GEMINI_MODEL_NAME || 'N/A'}`);
    console.log(`Total processing iterations (batches): ${iteration -1}`); // -1 because the last iteration exits
    const finalTotalQuestions = questionsData.sections.reduce((sum, sec) => sum + (sec.questions?.length || 0), 0);
    const initialTotalQuestions = overallQuestionsChecked + overallSkippedReviewed; // Estimate initial count
    console.log(`Total questions encountered (initial/resumed): ~${initialTotalQuestions}`);
    console.log(`Total questions checked across iterations: ${overallQuestionsChecked}`);
    console.log(`Skipped (already reviewed/finalized): ${overallSkippedReviewed}`);
    console.log(`Removed (pre-check validation failed): ${totalRemovedPrecheck}`);
    console.log(`Removed (Image Download/Processing Failed Pre-API): ${totalMissingImageRemoved}`);
    console.log(`----------------------------------------------------`);
    console.log(`Attempted API calls for SVG generation: ${totalQuestionsSentToApi}`);
    console.log(`   - AI Success (SVG Generated): ${totalSvgGenerated}`);
    console.log(`   - AI Failed (Unfixable/Error/Block/etc.): ${totalApiFailures}`);
    console.log(`----------------------------------------------------`);
    console.log(`User Reviews / Actions:`);
    console.log(`   - Accepted & Replaced (using final SVG): ${totalSvgAccepted}`);
    console.log(`   - Rejected (Original Kept): ${totalSvgRejected}`);
    console.log(`   - Regenerate Requests: ${totalRegenerations}`);
    console.log(`   - Original LOCAL Images Copied (on Accept): ${totalImagesCopied}`);
    console.log(`----------------------------------------------------`);
    console.log(`Final question count in output data: ${finalTotalQuestions}`);

    // --- 7. Stop Server and Final Save ---
    await stopReviewServer();
    console.log(`\n--- Final Save of Updated Data ---`);
    saveProgress(questionsData, "at end of script");

    console.log("\n--- Process Finished ---");
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Output file: ${resolvedOutputFile}`);
    console.log(`Check logs: ${REMOVAL_LOG}, ${SVG_GENERATION_FAILURE_LOG}`);
    console.log(`Original LOCAL images for accepted SVGs copied to: ${resolvedOutputImageFolder}`);
    console.log(`Downloaded external images stored in: ${resolvedDownloadedImageFolder}`);
}

// --- Execute Main Function ---
run().catch(async error => {
    // Catch unhandled promise rejections or synchronous errors in run()
    console.error("\n--- A CRITICAL UNHANDLED ERROR OCCURRED ---");
    console.error("Error Type:", error?.name || 'Unknown');
    console.error("Error Message:", error?.message || String(error));
    console.error("Stack Trace:", error?.stack || '(Not available)');
    console.error("---------------------------------------------");
    console.error("The script encountered a fatal error and had to stop.");
    console.error("Attempting to stop the review server if it was running...");
    await stopReviewServer();
    // Avoid saving progress here, as 'questionsData' might be in an inconsistent state
    console.error("Progress may not have been saved reliably after the error.");
    console.error(`Please check logs (${REMOVAL_LOG}, ${SVG_GENERATION_FAILURE_LOG}) and the output file (${OUTPUT_FILE}) for the last saved state.`);
    if (readline && !readline.closed) {
        readline.close(); // Ensure readline is closed
    }
    process.exit(1); // Exit with error code
});

// --- END OF FILE 0.js ---
