/* quiz.js - WITH EXTENSIVE CONSOLE LOGGING AND AI EXPLANATION */
// --- Global Variables ---
// State Management
let questions = [], // Holds questions for the *current* subject after loading
  currentQuestion = 0, // Index of the currently displayed question in shuffledQuestions
  score = 0, // User's score for the current quiz session (number of correctly filled BLANKS)
  timeRemaining = 0, // Time left in seconds
  timerInterval, // Interval ID for the main quiz timer
  questionLimit = 30, // Default, updated from input, max number of questions for the quiz
  typingInterval, // Interval ID for the typing effect on explanations
  autoNextTimeout, // Timeout ID for automatically moving to the next question
  shuffledQuestions = [], // Array of questions selected and shuffled for the current quiz instance
  data = null, // Holds the entire fetched questions data (all subjects/sections)
  isPaused = false, // Tracks pause state, primarily for the explanation delay/pause button
  subjectName, // Name of the current subject being quizzed
  questionHistory = {}; // In-memory cache of question history loaded from/saved to IndexedDB

// --- NEW: State for re-evaluation ---
let isRecheckModeActive = false;

// API Key and Model Selection
let userApiKey = "";
let selectedGeminiModel = "gemini-pro"; // Default model, ensure this is a valid model you have access to
let fetchModelsTimeout; // For debouncing API key input

// DOM Element References (initialized in DOMContentLoaded)
let startScreenHeading = null,
  startScreen = null,
  quizScreen = null,
  endScreen = null,
  questionElement = null,
  answerWrapperElement = null, // Will be used for explanation block
  nextButton = null,
  scoreElement = null,         // Represents correct blanks
  totalScoreElement = null,    // Represents total blanks in quiz
  progressText = null,
  timer = null, // The timer container div
  previousButton = null,
  stopButton = null,
  pauseButton = null,
  errorMessage = null,
  startButton = null,
  quizHeading = null,
  uContainer = null, // Seems unused? Review needed.
  numberProgressContainer = null, // Container for "Question X of Y"
  questionContainer = null, // Container for question h5
  questionLimitInput = null,
  timeLimitInput = null;

// --- NEW: DOM Elements for re-evaluation/re-explanation ---
let recheckButtonElement = null;
let regenerateExplanationButtonElement = null;

// Modal elements
let apiKeyModal = null;
let apiKeyInput = null;
let modelSelect = null;
let modalSubmitButton = null;
let closeModalButton = null;
let modalErrorMessage = null;


// IndexedDB setup
const dbName = "quizHistoryDB";
const storeName = "questionHistoryStore";
let db; // Holds the IndexedDB database connection

// --- IndexedDB Functions ---
function openDatabase() {
  console.log("DB: openDatabase called");
  return new Promise((resolve, reject) => {
    if (db) {
      console.log("DB: Reusing existing connection");
      resolve(db);
      return;
    }
    const request = indexedDB.open(dbName, 1);
    console.log("DB: Opening new connection...");

    request.onerror = (event) => {
      console.error("DB: IndexedDB error:", event.target.error);
      reject(`IndexedDB failed to open: ${event.target.errorCode}`);
    };
    request.onsuccess = (event) => {
      db = event.target.result;
      console.log("DB: IndexedDB opened successfully.");
      resolve(db);
    };
    request.onupgradeneeded = (event) => {
      console.log("DB: IndexedDB upgrade needed.");
      const db = event.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
        console.log(`DB: Object store '${storeName}' created.`);
      }
    };
  });
}

async function getQuestionHistoryFromDB() {
  console.log("DB_HISTORY: getQuestionHistoryFromDB called");
  try {
    await openDatabase();
    return new Promise((resolve, reject) => {
      if (!db) {
        console.error("DB_HISTORY: Database connection not available for get.");
        resolve({}); return;
      }
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.get("questionHistory");
      console.log("DB_HISTORY: Requesting history from store.");

      request.onerror = (event) => {
        console.error("DB_HISTORY: Error getting question history:", event.target.error);
        reject(event.target.error);
      };
      request.onsuccess = (event) => {
        console.log("DB_HISTORY: Question history retrieved:", event.target.result || {});
        resolve(event.target.result || {});
      };
    });
  } catch (error) {
      console.error("DB_HISTORY: Failed to open database for reading history:", error);
      return {};
  }
}

async function saveQuestionHistoryToDB(history) {
    console.log("DB_HISTORY: saveQuestionHistoryToDB called with current history:", JSON.parse(JSON.stringify(questionHistory)));
    try {
        await openDatabase();
        return new Promise((resolve, reject) => {
            if (!db) {
                console.error("DB_HISTORY: Database connection not available for save.");
                reject("Database connection not available."); return;
            }
            const transaction = db.transaction(storeName, "readwrite");
            const store = transaction.objectStore(storeName);
            const request = store.put(history, "questionHistory");
            console.log("DB_HISTORY: Putting history to store.");

            request.onerror = (event) => {
                console.error("DB_HISTORY: Error saving question history:", event.target.error);
                reject(event.target.error);
            };
            request.onsuccess = () => {
                console.log("DB_HISTORY: Question history saved successfully.");
                resolve();
            };
        });
    } catch (error) {
        console.error("DB_HISTORY: Failed to open database for saving history:", error);
        return Promise.reject(error);
    }
}


// --- Utility Functions ---
function stripHTML(html) {
  // console.log("UTIL: stripHTML called with:", html);
  let temp = document.createElement("div");
  temp.innerHTML = html;
  const text = temp.textContent || temp.innerText || "";
  // console.log("UTIL: stripHTML output:", text);
  return text;
}

function convertNewlinesToHtml(text) {
  // console.log("UTIL: convertNewlinesToHtml called with:", text);
  if (typeof text !== "string") {
    // console.log("UTIL: convertNewlinesToHtml input not a string, returning empty.");
    return "";
  }
  const result = text.replace(/\n/g, "<br>");
  // console.log("UTIL: convertNewlinesToHtml output:", result);
  return result;
}

function shuffleArray(array) {
  // console.log("UTIL: shuffleArray called with:", JSON.parse(JSON.stringify(array)));
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  // console.log("UTIL: shuffleArray output:", JSON.parse(JSON.stringify(shuffled)));
  return shuffled;
}

function restrictToNumbers(inputElement) {
  // console.log("UTIL: restrictToNumbers called for element:", inputElement);
  if (!inputElement) return;
  inputElement.addEventListener("input", function () {
    this.value = this.value.replace(/[^0-9]/g, "");
  });
  inputElement.addEventListener("paste", function (event) {
    let pasteData = (event.clipboardData || window.clipboardData)?.getData("text");
    if (pasteData && /[^0-9]/.test(pasteData)) {
      event.preventDefault();
    }
  });
}

function escapeHtml(unsafe) {
    // console.log("UTIL: escapeHtml called with:", unsafe);
    if (typeof unsafe !== 'string') return '';
    const result = unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
    // console.log("UTIL: escapeHtml output:", result);
    return result;
}

function extractCorrectAnswers(explanationString) {
    console.log("UTIL: extractCorrectAnswers called with explanationString:", explanationString);
    const answers = {};
    if (!explanationString) {
        console.log("UTIL: extractCorrectAnswers - explanationString is empty, returning empty answers.");
        return answers;
    }
    const cleanedString = explanationString.replace(/<\/?p>/g, '').trim();
    const parts = cleanedString.split(';');
    console.log("UTIL: extractCorrectAnswers - split parts:", parts);

    parts.forEach(part => {
        part = part.trim();
        if (!part) return;
        const match = part.match(/\(([a-z])\)\s*____\s*(.*)/i);
        if (match) {
            const blankId = match[1].toLowerCase();
            const answerText = match[2].trim();
            const cleanedAnswerText = answerText.replace(/<[^>]*>.*?<\/[^>]*>|<[^>]*\/?>/g, '').trim();
            answers[blankId] = cleanedAnswerText.split('/').map(ans => ans.trim().toLowerCase());
            console.log(`UTIL: extractCorrectAnswers - Matched blankId: ${blankId}, answers:`, answers[blankId]);
        } else {
             const fallbackMatch = part.match(/\(([a-z])\)\s*(.*)/i);
             if (fallbackMatch) {
                const blankId = fallbackMatch[1].toLowerCase();
                const answerText = fallbackMatch[2].trim();
                 const cleanedAnswerText = answerText.replace(/<[^>]*>.*?<\/[^>]*>|<[^>]*\/?>/g, '').trim();
                 answers[blankId] = cleanedAnswerText.split('/').map(ans => ans.trim().toLowerCase());
                 console.log(`UTIL: extractCorrectAnswers - Fallback Matched blankId: ${blankId}, answers:`, answers[blankId]);
             } else {
                 console.log("UTIL: extractCorrectAnswers - No match for part:", part);
             }
        }
    });
    console.log("UTIL: extractCorrectAnswers - final extracted answers map:", JSON.parse(JSON.stringify(answers)));
    return answers;
}


// --- Core Application Logic ---
function loadQuestionData() {
  console.log("CORE: loadQuestionData called");
  if (typeof questionsData === "undefined") {
    console.error("CORE: Global 'questionsData' is not defined.");
    displayError("Failed to load question data. Please ensure data source is available.");
    return null;
  }
  if (!questionsData || typeof questionsData !== 'object' || !Array.isArray(questionsData.sections)) {
    console.error("CORE: Invalid 'questionsData' structure.", questionsData);
    displayError("Invalid question data format.");
    return null;
  }
  console.log("CORE: questionsData structure appears valid.");
  questionsData.sections.forEach((section) => {
      if (section && section.sectionname && !questionHistory[section.sectionname]) {
          console.log(`CORE: Initializing history for new section: ${section.sectionname}`);
          questionHistory[section.sectionname] = {};
      }
  });
  console.log("CORE: loadQuestionData finished. Current questionHistory:", JSON.parse(JSON.stringify(questionHistory)));
  return questionsData;
}

async function loadQuestionHistory() {
  console.log("CORE: loadQuestionHistory called");
  try {
    const loadedHistory = await getQuestionHistoryFromDB();
    if (typeof loadedHistory === "object" && loadedHistory !== null) {
        questionHistory = loadedHistory;
        console.log("CORE: Question history loaded successfully from IndexedDB:", JSON.parse(JSON.stringify(questionHistory)));
    } else {
        console.warn("CORE: Invalid history data loaded from DB, resetting to empty object.");
        questionHistory = {};
    }
  } catch (error) {
    console.error("CORE: Error loading question history:", error);
    questionHistory = {};
    displayError("Error loading question history. Progress tracking might be affected.");
  }
}

async function saveQuestionHistory() {
  console.log("CORE: saveQuestionHistory called with current history:", JSON.parse(JSON.stringify(questionHistory)));
  try {
    await saveQuestionHistoryToDB(questionHistory);
    console.log("CORE: Attempted to save question history to IndexedDB.");
  } catch (error) {
    console.error("CORE: Error saving question history:", error);
  }
}

function displayError(message, isModal = false) {
  console.log("UI: displayError called with message:", message, "isModal:", isModal);
  const targetElement = isModal ? modalErrorMessage : errorMessage;
  if (targetElement) {
    targetElement.textContent = message;
    targetElement.classList.remove("hide");
    targetElement.style.opacity = 1;
  } else {
    const errorModal = document.createElement('div');
    errorModal.className = 'error-modal';
    errorModal.innerHTML = `<div class="error-modal-content"><h3>Error</h3><p>${message}</p><button onclick="this.parentElement.parentElement.remove()">Close</button></div>`;
    document.body.appendChild(errorModal);
    console.error("Error displayed in custom modal:", message);
  }
}

function hideError(isModal = false) {
  console.log("UI: hideError called", "isModal:", isModal);
  const targetElement = isModal ? modalErrorMessage : errorMessage;
    if (targetElement && !targetElement.classList.contains("hide")) {
        targetElement.textContent = "";
        targetElement.style.opacity = 0;
        targetElement.classList.add("hide");
    }
}

function validateInputs() {
  console.log("VALIDATE: validateInputs called");
  if (!questionLimitInput || !timeLimitInput || !startButton || !errorMessage) {
    console.warn("VALIDATE: Input elements not ready for validation.");
    return false;
  }

  if (errorMessage && !errorMessage.textContent.includes("No questions available")) {
     hideError();
  }

  const questionLimitValue = parseInt(questionLimitInput.value);
  const timeLimitValue = parseInt(timeLimitInput.value);
  const maxAllowed = parseInt(questionLimitInput.max);
  const minAllowed = parseInt(questionLimitInput.min);
  console.log("VALIDATE: QLimitVal:", questionLimitValue, "TLimitVal:", timeLimitValue, "MaxAllowed:", maxAllowed, "MinAllowed:", minAllowed);


  let errorMsg = "";
  let isValid = true;

  if (isNaN(questionLimitValue) || questionLimitValue <= 0) {
    errorMsg = "Please enter a valid number of questions (must be > 0).";
    isValid = false;
  } else if (isNaN(timeLimitValue) || timeLimitValue <= 0) {
    errorMsg = "Please enter a valid time limit in minutes (must be > 0).";
    isValid = false;
  } else if (!isNaN(minAllowed) && (questionLimitValue < minAllowed)) {
    errorMsg = `Number of questions must be at least ${minAllowed}.`;
    isValid = false;
  } else if (!isNaN(minAllowed) && (timeLimitValue < minAllowed)) {
    errorMsg = `Time limit must be at least ${minAllowed} minutes.`;
    isValid = false;
  } else if (!isNaN(maxAllowed) && maxAllowed > 0 && questionLimitValue > maxAllowed) {
    errorMsg = `Number of questions cannot exceed the ${maxAllowed} available for "${subjectName || 'this subject'}".`;
    isValid = false;
  } else if (!isNaN(maxAllowed) && maxAllowed > 0 && timeLimitValue > maxAllowed) {
    errorMsg = `Time limit cannot exceed ${maxAllowed} minutes (max available for this subject).`;
    isValid = false;
  } else if (maxAllowed <= 0 && (errorMessage && !errorMessage.textContent.includes("No questions available"))){
      isValid = false;
  }
  console.log("VALIDATE: isValid:", isValid, "errorMsg:", errorMsg);


  startButton.disabled = !isValid;

  if (!isValid && errorMsg) {
    displayError(errorMsg);
  } else if (isValid && errorMessage && errorMessage.textContent && !errorMessage.textContent.includes("No questions available")) {
      hideError();
  }
  console.log("VALIDATE: startButton.disabled:", startButton.disabled);
  return isValid;
}

// --- Populating UI Elements ---
function updateQuestionLimits() {
  console.log("UI_LIMITS: updateQuestionLimits called.");
  if (!questionLimitInput || !timeLimitInput || !questions) {
    console.warn("UI_LIMITS: Cannot update limits: Elements or global questions data not ready.");
    if (questionLimitInput) { questionLimitInput.min = 1; questionLimitInput.max = 1; questionLimitInput.value = 1; }
    if (timeLimitInput) { timeLimitInput.min = 1; timeLimitInput.max = 1; timeLimitInput.value = 1; }
    validateInputs(); return;
  }

  const subjectContextText = `"${subjectName || 'current subject'}"`;
  const availableCount = Array.isArray(questions) ? questions.length : 0;
  let newMinLimit = 1;
  let newMaxLimit = Math.max(1, availableCount);
  console.log("UI_LIMITS: availableCount:", availableCount, "subjectContextText:", subjectContextText);


  if (availableCount === 0) {
      displayError(`No questions available for ${subjectContextText}.`);
      newMinLimit = 1; newMaxLimit = 1;
  } else {
      if (availableCount >= 30) newMinLimit = 30;
      else if (availableCount >= 10) newMinLimit = 10;
      else newMinLimit = 1;
      newMinLimit = Math.min(newMinLimit, newMaxLimit);
      if (errorMessage && errorMessage.textContent.includes("No questions available")) {
          hideError();
      }
  }
  console.log("UI_LIMITS: newMinLimit:", newMinLimit, "newMaxLimit:", newMaxLimit);


  questionLimitInput.min = newMinLimit;
  timeLimitInput.min = newMinLimit;
  questionLimitInput.max = newMaxLimit;
  timeLimitInput.max = newMaxLimit;

  const currentQVal = parseInt(questionLimitInput.value) || newMinLimit;
  const currentTVal = parseInt(timeLimitInput.value) || newMinLimit;

  questionLimitInput.value = Math.min(Math.max(currentQVal, newMinLimit), newMaxLimit);
  timeLimitInput.value = Math.min(Math.max(currentTVal, newMinLimit), newMaxLimit);
  console.log("UI_LIMITS: questionLimitInput.value set to:", questionLimitInput.value);
  console.log("UI_LIMITS: timeLimitInput.value set to:", timeLimitInput.value);
  validateInputs();
  console.log("UI_LIMITS: updateQuestionLimits finished.");
}


// --- Quiz Lifecycle Functions ---
async function startQuiz() {
  console.log("QUIZ_LIFECYCLE: Attempting to start quiz...");
  const requiredElements = [questionLimitInput, timeLimitInput, startButton, startScreen, quizScreen, quizHeading, errorMessage];
  if (requiredElements.some(el => !el)) {
      console.error("QUIZ_LIFECYCLE: Required elements not ready to start quiz. Aborting.");
      displayError("Initialization error. Please refresh the page.");
      return;
  }

  if (!validateInputs()) {
      console.log("QUIZ_LIFECYCLE: Start button disabled due to validation errors. Aborting startQuiz.");
      return;
  }
  console.log("QUIZ_LIFECYCLE: Inputs validated, showing API key modal.");
  showApiKeyModal();
}

async function startQuizAfterApiKeySelection() {
  console.log("QUIZ_LIFECYCLE: Attempting to start quiz after API Key selection...");
  questionLimit = parseInt(questionLimitInput.value);
  timeRemaining = parseInt(timeLimitInput.value) * 60;
  currentQuestion = 0;
  score = 0;
  shuffledQuestions = [];
  isPaused = false;
  isRecheckModeActive = false; // Ensure reset at quiz start
  console.log("QUIZ_LIFECYCLE: Initial state set - questionLimit:", questionLimit, "timeRemaining:", timeRemaining);


  if (!data || !subjectName) {
      console.error("QUIZ_LIFECYCLE: Quiz data or subject name not available. Cannot start quiz.");
      displayError("Quiz data failed to load or subject missing. Please refresh.");
      return;
  }
  const section = data.sections.find((s) => s.sectionname === subjectName);
  if (!section?.questions) {
      console.error("QUIZ_LIFECYCLE: Subject section or questions not found for:", subjectName);
      displayError("Subject data not found. Please select a subject again.");
      return;
  }
  console.log("QUIZ_LIFECYCLE: Found section for subject:", subjectName);

  let baseQuestions = section.questions.filter(q => q);
  let filteredQuestions = baseQuestions;
  const filterDescriptionText = `the subject "${subjectName}"`;

  if (filteredQuestions.length === 0) {
      console.warn("QUIZ_LIFECYCLE: No questions available for", filterDescriptionText);
      displayError(`No questions available for ${filterDescriptionText}. Please change the subject.`);
      if(startButton) startButton.disabled = true;
      return;
  }
  console.log("QUIZ_LIFECYCLE: Filtered questions count:", filteredQuestions.length);

  let actualLimit = questionLimit;
  if (questionLimit > filteredQuestions.length) {
      actualLimit = filteredQuestions.length;
      questionLimitInput.value = actualLimit;
      if (parseInt(timeLimitInput.value) > actualLimit) {
          timeLimitInput.value = actualLimit;
          timeRemaining = actualLimit * 60;
      }
      console.log("QUIZ_LIFECYCLE: Adjusted questionLimit to actualLimit:", actualLimit, "and timeRemaining to:", timeRemaining);
      validateInputs();
  }

  try {
      shuffledQuestions = await selectQuestions(filteredQuestions, actualLimit, subjectName, "all_questions_for_subject");
      console.log("QUIZ_LIFECYCLE: Questions selected and shuffled. Count:", shuffledQuestions.length);
  } catch (error) {
      console.error("QUIZ_LIFECYCLE: Error during question selection:", error);
      displayError("An error occurred while selecting questions.");
      return;
  }

  if (shuffledQuestions.length === 0) {
      console.warn("QUIZ_LIFECYCLE: Could not select any questions for the quiz.");
      displayError("Could not select any questions for the quiz. Please try again or change filters.");
      return;
  }

  shuffledQuestions.forEach((qData, index) => {
    console.log(`QUIZ_LIFECYCLE: Processing question ${index} for blank counts.`);
    if (qData && qData.question) {
        const blankRegex = /\(([a-z])\)\s*_{2,}/gi;
        let count = 0;
        let ids = [];
        let match;
        blankRegex.lastIndex = 0;
        while ((match = blankRegex.exec(qData.question)) !== null) {
            count++;
            ids.push(match[1].toLowerCase());
        }
        qData.numBlanks = count;
        qData.blankIds = ids;
        console.log(`QUIZ_LIFECYCLE: Question ${index} - numBlanks: ${count}, blankIds: ${ids.join(',')}`);
    } else {
        qData.numBlanks = 0;
        qData.blankIds = [];
        console.log(`QUIZ_LIFECYCLE: Question ${index} - No question text or invalid, numBlanks: 0`);
    }
    qData.answered = false;
    qData.userAnswers = {};
    qData.correctnessPerBlank = {};
    qData.finalExplanationHtml = ""; // Initialize for storing AI explanation
    qData.aiFilledBlanks = {}; // Initialize for tracking AI-filled blanks
  });

  startScreen.classList.add("hide");
  quizScreen.classList.remove("hide");
  endScreen.classList.add("hide");
  hideError();
  if (quizHeading) quizHeading.textContent = subjectName;
  console.log("QUIZ_LIFECYCLE: Quiz setup complete. Displaying first question.");
  displayQuestion();
  startTimer();
  showQuiz();
}

async function selectQuestions(allFilteredQuestions, limit, subject, filterType) {
    console.log("CORE_SELECT_Q: selectQuestions called. allFilteredQuestions count:", allFilteredQuestions.length, "limit:", limit, "subject:", subject, "filterType:", filterType);
    let historyKey = `${subject}-${filterType}`;
    const actualLimit = Math.min(limit, allFilteredQuestions.length);
    console.log("CORE_SELECT_Q: actualLimit:", actualLimit, "historyKey:", historyKey);


    if (!questionHistory[subject]) questionHistory[subject] = {};
    if (!questionHistory[subject][historyKey]) questionHistory[subject][historyKey] = [];
    const historyList = questionHistory[subject][historyKey];
    console.log("CORE_SELECT_Q: Initial historyList for key:", historyKey, "Length:", historyList.length, "Content:", JSON.parse(JSON.stringify(historyList)));

    let availableQuestions = allFilteredQuestions.filter(q => q?.question && !historyList.includes(q.question));
    let selectedQuestions = [];
    let historyWasReset = false;
    console.log("CORE_SELECT_Q: availableQuestions (not in history) count:", availableQuestions.length);


    if (availableQuestions.length < actualLimit) {
        console.log("CORE_SELECT_Q: Not enough new questions. available:", availableQuestions.length, "needed:", actualLimit);
        if (availableQuestions.length === 0 && historyList.length >= allFilteredQuestions.length && allFilteredQuestions.length > 0) {
            console.log("CORE_SELECT_Q: All questions seen, resetting history for this key.");
            questionHistory[subject][historyKey] = [];
            historyList.length = 0; // Clear the reference array as well
            availableQuestions = [...allFilteredQuestions];
            historyWasReset = true;
            console.log("CORE_SELECT_Q: History reset. availableQuestions count now:", availableQuestions.length);
        }

        if (!historyWasReset) {
            console.log("CORE_SELECT_Q: Taking all available new questions.");
            selectedQuestions.push(...availableQuestions);
            availableQuestions.forEach(q => {
                if (q?.question && !historyList.includes(q.question)) { // Double check before pushing
                    historyList.push(q.question);
                }
            });
            const neededFromHistory = actualLimit - selectedQuestions.length;
            console.log("CORE_SELECT_Q: selectedQuestions from new:", selectedQuestions.length, "neededFromHistory:", neededFromHistory);
            if (neededFromHistory > 0) {
                let historyCandidates = allFilteredQuestions.filter(q => q?.question && historyList.includes(q.question));
                console.log("CORE_SELECT_Q: Candidates from history (before shuffle):", historyCandidates.length);
                historyCandidates = shuffleArray(historyCandidates);
                let addedFromHistory = 0;
                for (const histQ of historyCandidates) {
                    if (addedFromHistory >= neededFromHistory) break;
                    if (!selectedQuestions.some(sq => sq.question === histQ.question)) {
                        selectedQuestions.push(histQ);
                        addedFromHistory++;
                    }
                }
                console.log("CORE_SELECT_Q: Added from history:", addedFromHistory);
            }
        } else { // History was reset
            console.log("CORE_SELECT_Q: Selecting from reset (all) questions.");
            availableQuestions = shuffleArray(availableQuestions);
            selectedQuestions = availableQuestions.slice(0, actualLimit);
            selectedQuestions.forEach(q => {
                if (q?.question) { // No need to check if includes, as historyList is now empty for this path
                    historyList.push(q.question);
                }
            });
        }
    } else {
        console.log("CORE_SELECT_Q: Enough new questions available. Shuffling and slicing.");
        availableQuestions = shuffleArray(availableQuestions);
        selectedQuestions = availableQuestions.slice(0, actualLimit);
        selectedQuestions.forEach(q => {
            if (q?.question && !historyList.includes(q.question)) {
                historyList.push(q.question);
            }
        });
    }

    // Fallback: if still not enough, try to fill with any remaining questions not yet selected
    while (selectedQuestions.length < actualLimit && allFilteredQuestions.length > selectedQuestions.length) {
        console.log("CORE_SELECT_Q: Fallback fill. selected:", selectedQuestions.length, "needed:", actualLimit);
        const remainingCandidates = allFilteredQuestions.filter(q => q && !selectedQuestions.some(sq => sq.question === q.question));
        if (remainingCandidates.length === 0) {
            console.log("CORE_SELECT_Q: Fallback - no more unique candidates.");
            break;
        }
        const randomIndex = Math.floor(Math.random() * remainingCandidates.length);
        selectedQuestions.push(remainingCandidates[randomIndex]);
        if (remainingCandidates[randomIndex]?.question && !historyList.includes(remainingCandidates[randomIndex].question)) {
             historyList.push(remainingCandidates[randomIndex].question);
        }
    }
    console.log("CORE_SELECT_Q: Final selectedQuestions count:", selectedQuestions.length);
    console.log("CORE_SELECT_Q: Final historyList for key:", historyKey, "Length:", historyList.length);


    saveQuestionHistory();
    return shuffleArray(selectedQuestions); // Shuffle one last time for good measure
}

function processTextWithImages(text) {
  // console.log("UTIL: processTextWithImages called with text:", text);
  if (typeof text !== 'string') return "";
  const regex = /(\(image\/[^\)]+\))|<img\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const result = text.replace(regex, (match, _inlineMarker, inlineFilename, _imgTag, imgSrcValue) => {
    let finalSrc = "";
    if (inlineFilename) {
        finalSrc = inlineFilename.toLowerCase().startsWith("image/") ? inlineFilename : `image/${inlineFilename}`;
    } else if (imgSrcValue) {
      finalSrc = imgSrcValue;
    } else { return match; }
    if (!finalSrc || typeof finalSrc !== 'string' || finalSrc.trim() === "") { return match; }
    const altText = inlineFilename || imgSrcValue.split('/').pop() || "Image";
    return `<div><img src="${finalSrc}" alt="${altText}" style="max-width: 100%; height: auto; display: block; margin: 5px auto;" ondragstart="return false;"></div>`;
  });
  // console.log("UTIL: processTextWithImages output:", result);
  return result;
}

function clearPreviousContent() {
  console.log("UI: clearPreviousContent called.");
  if (answerWrapperElement) answerWrapperElement.innerHTML = "";
  if (questionElement) questionElement.innerHTML = "";
  if (answerWrapperElement) answerWrapperElement.style.opacity = "0";
  clearTimeout(autoNextTimeout);
  clearInterval(typingInterval);
  typingInterval = null;
}

function updateQuestionCounter() {
  // console.log("UI: updateQuestionCounter called.");
  const currentEl = numberProgressContainer?.querySelector(".current");
  const totalEl = numberProgressContainer?.querySelector(".total");
  if (currentEl) currentEl.textContent = currentQuestion + 1;
  if (totalEl) totalEl.textContent = shuffledQuestions.length;
}

function typeHtmlContent(targetElement, htmlString, speed = 20) {
    console.log("UI: typeHtmlContent called for target:", targetElement, "speed:", speed);
    // console.log("UI: typeHtmlContent HTML string:", htmlString);
    return new Promise(resolve => {
        targetElement.innerHTML = '';
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlString;

        const cursorSpan = document.createElement('span');
        cursorSpan.className = 'typing-cursor';
        targetElement.appendChild(cursorSpan);

        const nodesToType = Array.from(tempDiv.childNodes);
        let currentNodeIndex = 0;
        let textNodeCharIndex = 0;

        if (typingInterval) {
            console.log("UI: typeHtmlContent - clearing existing typingInterval.");
            clearInterval(typingInterval);
            typingInterval = null;
        }

        typingInterval = setInterval(() => {
            if (currentNodeIndex >= nodesToType.length) {
                clearInterval(typingInterval);
                typingInterval = null;
                cursorSpan.remove();
                console.log("UI: typeHtmlContent finished typing.");
                resolve();
                return;
            }

            const currentNode = nodesToType[currentNodeIndex];

            if (currentNode.nodeType === Node.TEXT_NODE) {
                const text = currentNode.textContent;
                if (textNodeCharIndex < text.length) {
                    const char = text[textNodeCharIndex];
                    targetElement.insertBefore(document.createTextNode(char), cursorSpan);
                    textNodeCharIndex++;
                } else {
                    textNodeCharIndex = 0;
                    currentNodeIndex++;
                }
            } else if (currentNode.nodeType === Node.ELEMENT_NODE) {
                targetElement.insertBefore(currentNode.cloneNode(true), cursorSpan);
                currentNodeIndex++;
                textNodeCharIndex = 0;
            } else {
                currentNodeIndex++;
                textNodeCharIndex = 0;
            }
        }, speed);
    });
}

// --- AI Helper Functions (NEW/MODIFIED for 2-set processing) ---
const HIGHLIGHT_STYLE_FOR_AI_EXPLANATION = "display: inline-block; background: linear-gradient(90deg, #84fab0, #8fd3f4); font-weight: bold; border-radius: 6px; padding: 2px 6px; margin: 1px 3px; color: #111; box-shadow: 1px 1px 2px rgba(0,0,0,0.1);";

// SET 1 AI Helper: Evaluate user's answer (correctness only)
async function aiEvaluateUserAnswer(questionData, blankId, userAnswer, expectedCorrectAnswers) {
    console.log(`AI_EVALUATE: Called for blankId: ${blankId}, userAnswer: "${userAnswer}", expected: [${expectedCorrectAnswers.join(', ')}]`);
    const questionText = stripHTML(questionData.question);
    const primaryExpectedAnswer = expectedCorrectAnswers[0] || "N/A";

    let prompt = `You are a quiz evaluator for a Bengali quiz app. For the given fill-in-the-blank question, a user has provided an answer for a specific blank.
The question is: "${questionText}"
Blank ID: (${blankId})
User's Answer: "${userAnswer}"
Expected Correct Answer(s) for this blank: [${expectedCorrectAnswers.join(', ')}] (The primary expected answer is "${primaryExpectedAnswer}")

Task:
Determine if the user's answer is correct or a very close acceptable variation of the expected correct answers.

Format your entire response as a JSON object with ONLY the following key:
- "is_correct": boolean (true if user's answer is correct/acceptable, false otherwise)

Ensure your JSON response is valid.`;

    console.log("AI_EVALUATE: Prompt for blank", blankId, ":\n", prompt);
    try {
        const payload = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } };
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${selectedGeminiModel}:generateContent?key=${userApiKey}`;
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error("AI_EVALUATE: API error response text:", errorText);
            throw new Error(`API error ${response.status}: ${errorText}`);
        }
        const result = await response.json();
        const aiTextResponse = result.candidates[0].content.parts[0].text;
        console.log("AI_EVALUATE: Raw AI JSON string for blank", blankId, ":", aiTextResponse);
        const parsedResponse = JSON.parse(aiTextResponse.trim());
        console.log("AI_EVALUATE: Parsed AI response for blank", blankId, ":", parsedResponse);
        return parsedResponse;
    } catch (error) {
        console.error("AI_EVALUATE: Error for blank", blankId, ":", error);
        return { is_correct: false }; // Default to incorrect on error
    }
}

// SET 1 AI Helper: Get correct answer for an empty blank (answer only)
async function aiGetAnswerForEmptyBlank_NoExplanation(questionData, blankId, expectedCorrectAnswers) {
    console.log(`AI_FILL_BLANK: Called for blankId: ${blankId}, expected: [${expectedCorrectAnswers.join(', ')}]`);
    const questionText = stripHTML(questionData.question);
    const primaryCorrectAnswer = expectedCorrectAnswers[0] || "তথ্য উপলব্ধ নেই";

    let prompt = `You are a quiz helper for a Bengali quiz app. For the given fill-in-the-blank question, blank (${blankId}) was left unanswered by the user.
The question is: "${questionText}"
The expected correct answer(s) for blank (${blankId}) are: [${expectedCorrectAnswers.join(', ')}]. The primary correct answer is "${primaryCorrectAnswer}".

Task:
Provide the primary correct answer for blank (${blankId}).

Format your entire response as a JSON object with ONLY the following key:
- "correct_answer": string (the primary correct answer for the blank)

Ensure your JSON response is valid.`;

    console.log("AI_FILL_BLANK: Prompt for blank", blankId, ":\n", prompt);
    try {
        const payload = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } };
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${selectedGeminiModel}:generateContent?key=${userApiKey}`;
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error("AI_FILL_BLANK: API error response text:", errorText);
            throw new Error(`API error ${response.status}: ${errorText}`);
        }
        const result = await response.json();
        const aiTextResponse = result.candidates[0].content.parts[0].text;
        console.log("AI_FILL_BLANK: Raw AI JSON string for blank", blankId, ":", aiTextResponse);
        const parsedResponse = JSON.parse(aiTextResponse.trim());
        console.log("AI_FILL_BLANK: Parsed AI response for blank", blankId, ":", parsedResponse);
        return parsedResponse;
    } catch (error) {
        console.error("AI_FILL_BLANK: Error for blank", blankId, ":", error);
        return { correct_answer: primaryCorrectAnswer }; // Default to primary on error
    }
}

// SET 2 AI Helper: Generate HTML explanation for a blank (based on final state)
async function aiGenerateExplanationForBlank(questionData, blankId, answerToExplain, isUserCorrect, actualCorrectAnswer, wasInitiallyEmpty) {
    console.log(`AI_EXPLAIN_BLANK: Called for blankId: ${blankId}, answerToExplain: "${answerToExplain}", isUserCorrect: ${isUserCorrect}, actualCorrectAnswer: "${actualCorrectAnswer}", wasInitiallyEmpty: ${wasInitiallyEmpty}`);
    const questionText = stripHTML(questionData.question);
    let prompt;

    let explanationTaskDescription;
    let htmlStructureToUse;

    if (wasInitiallyEmpty) {
        explanationTaskDescription = `Task:
Provide a concise explanation in Bengali for why "${answerToExplain}" is the correct answer for blank (${blankId}), using the exact HTML format below. Highlight key Bengali or English terms within your explanation using <span style="${HIGHLIGHT_STYLE_FOR_AI_EXPLANATION}">term</span>.`;

        htmlStructureToUse = `**Explanation HTML Structure (Strictly follow this for the 'explanation_html' value):**
<p style="margin-bottom: 5px;">
    <span style="font-size: 1.1em; color: #007bff; margin-right: 5px;">🔹</span>
    <strong>(${blankId}) সঠিক উত্তর: <span style="${HIGHLIGHT_STYLE_FOR_AI_EXPLANATION}">${answerToExplain}</span></strong> (এই ফাঁকা স্থানটি খালি ছিল)
</p>
<p style="margin-left: 25px; margin-bottom: 3px;">
    <strong>Grammar:</strong> "Relevant grammar rule in Bengali for <span style='${HIGHLIGHT_STYLE_FOR_AI_EXPLANATION}'>${answerToExplain}</span>, with <span style='${HIGHLIGHT_STYLE_FOR_AI_EXPLANATION}'>key terms</span> highlighted."
</p>
<p style="margin-left: 25px; margin-bottom: 3px;">
    <strong>Explanation:</strong> "Detailed explanation in Bengali why <span style='${HIGHLIGHT_STYLE_FOR_AI_EXPLANATION}'>${answerToExplain}</span> is correct, with <span style='${HIGHLIGHT_STYLE_FOR_AI_EXPLANATION}'>important concepts</span> highlighted."
</p>
<p style="margin-left: 25px; margin-bottom: 10px;">
    <strong>Example:</strong> "Example sentence in Bengali using the correct answer <span style='${HIGHLIGHT_STYLE_FOR_AI_EXPLANATION}'>${answerToExplain}</span>."
</p>`;

        prompt = `You are a quiz helper for a Bengali quiz app. For the given fill-in-the-blank question, blank (${blankId}) was initially empty and has now been filled with the correct answer.
The question is: "${questionText}"
Blank ID: (${blankId})
Filled Correct Answer: "${answerToExplain}" (This was the AI-provided correct answer)

${explanationTaskDescription}

Format your entire response as a JSON object with ONLY the following key:
- "explanation_html": string (your explanation in HTML format, following the structure below)

${htmlStructureToUse}

Ensure your JSON response is valid. Use Bengali for all explanations and examples.`;

    } else { // User provided an answer
        explanationTaskDescription = `Task:
Provide an explanation in Bengali using the exact HTML format below, based on whether the answer was marked correct or incorrect. Highlight key Bengali or English terms within your explanation using <span style="${HIGHLIGHT_STYLE_FOR_AI_EXPLANATION}">term</span>.`;

        if (isUserCorrect) {
            htmlStructureToUse = `**Explanation HTML Structure (Use this if the answer was marked CORRECT):**
<p style="margin-bottom: 5px;">
    <span style="font-size: 1.1em; color: #007bff; margin-right: 5px;">🔹</span>
    <strong>(${blankId}) <span style="${HIGHLIGHT_STYLE_FOR_AI_EXPLANATION}">${answerToExplain}</span></strong> – <span style="color:green; font-weight:bold;">সঠিক!</span>
</p>
<p style="margin-left: 25px; margin-bottom: 3px;">
    <strong>Grammar:</strong> "Relevant grammar rule in Bengali, with <span style='${HIGHLIGHT_STYLE_FOR_AI_EXPLANATION}'>key terms</span> highlighted."
</p>
<p style="margin-left: 25px; margin-bottom: 10px;">
    <strong>Example:</strong> "Example sentence in Bengali using the correct answer, e.g., <span style='${HIGHLIGHT_STYLE_FOR_AI_EXPLANATION}'>${answerToExplain}</span>."
</p>`;
        } else {
            htmlStructureToUse = `**Explanation HTML Structure (Use this if the answer was marked INCORRECT):**
<p style="margin-bottom: 5px;">
    <span style="font-size: 1.1em; color: #007bff; margin-right: 5px;">🔹</span>
    <strong>(${blankId}) <span style="${HIGHLIGHT_STYLE_FOR_AI_EXPLANATION}">${actualCorrectAnswer}</span></strong> – <span style="color:red; font-weight:bold;">আপনার উত্তর "${answerToExplain}" সঠিক নয়।</span>
</p>
<p style="margin-left: 25px; margin-bottom: 3px;">
    <strong>Grammar:</strong> "Relevant grammar rule in Bengali explaining the correct usage for <span style='${HIGHLIGHT_STYLE_FOR_AI_EXPLANATION}'>${actualCorrectAnswer}</span>, with <span style='${HIGHLIGHT_STYLE_FOR_AI_EXPLANATION}'>key terms</span> highlighted."
</p>
<p style="margin-left: 25px; margin-bottom: 3px;">
    <strong>Explanation:</strong> "Detailed explanation in Bengali why <span style='${HIGHLIGHT_STYLE_FOR_AI_EXPLANATION}'>${actualCorrectAnswer}</span> is correct and why <span style='${HIGHLIGHT_STYLE_FOR_AI_EXPLANATION}'>${answerToExplain}</span> might be wrong, with <span style='${HIGHLIGHT_STYLE_FOR_AI_EXPLANATION}'>important concepts</span> highlighted."
</p>
<p style="margin-left: 25px; margin-bottom: 10px;">
    <strong>Example:</strong> "Example sentence in Bengali using the correct answer <span style='${HIGHLIGHT_STYLE_FOR_AI_EXPLANATION}'>${actualCorrectAnswer}</span>."
</p>`;
        }

        prompt = `You are a quiz explainer for a Bengali quiz app. For the given fill-in-the-blank question, a user's answer for blank (${blankId}) has been evaluated.
The question is: "${questionText}"
Blank ID: (${blankId})
User's Answer (or current answer in blank): "${answerToExplain}"
This answer was marked as: ${isUserCorrect ? "CORRECT" : "INCORRECT"}.
The primary correct answer for this blank (for reference if user was wrong, or if it's the same as user's answer) is: "${actualCorrectAnswer}"

${explanationTaskDescription}

Format your entire response as a JSON object with ONLY the following key:
- "explanation_html": string (your explanation in HTML format, following the structure below)

${htmlStructureToUse}

Ensure your JSON response is valid. Use Bengali for all explanations and examples.`;
    }

    console.log("AI_EXPLAIN_BLANK: Prompt for blank", blankId, ":\n", prompt);
    try {
        const payload = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } };
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${selectedGeminiModel}:generateContent?key=${userApiKey}`;
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error("AI_EXPLAIN_BLANK: API error response text:", errorText);
            throw new Error(`API error ${response.status}: ${errorText}`);
        }
        const result = await response.json();
        const aiTextResponse = result.candidates[0].content.parts[0].text;
        console.log("AI_EXPLAIN_BLANK: Raw AI JSON string for blank", blankId, ":", aiTextResponse);
        const parsedResponse = JSON.parse(aiTextResponse.trim());
        console.log("AI_EXPLAIN_BLANK: Parsed AI response for blank", blankId, ":", parsedResponse);
        return parsedResponse;
    } catch (error) {
        console.error("AI_EXPLAIN_BLANK: Error for blank", blankId, ":", error);
        const fallbackMessage = wasInitiallyEmpty ?
            `<p style="color:red;">(${blankId}) এর জন্য ব্যাখ্যা তৈরি করতে সমস্যা হয়েছে। সঠিক উত্তর: ${answerToExplain}</p>` :
            `<p style="color:red;">(${blankId}) এর জন্য ব্যাখ্যা তৈরি করতে সমস্যা হয়েছে। আপনার উত্তর: ${answerToExplain}, সঠিক উত্তর: ${actualCorrectAnswer}</p>`;
        return { explanation_html: fallbackMessage };
    }
}
// --- End of AI Helper Functions ---

function displayQuestion() {
  console.log(`UI_DISPLAY_Q: Displaying question ${currentQuestion + 1} of ${shuffledQuestions.length}`);
  if (!questionElement || !answerWrapperElement || !previousButton || !nextButton || !pauseButton || !numberProgressContainer) {
    console.error("UI_DISPLAY_Q: Required UI elements missing. Stopping quiz.");
    stopQuiz(); return;
  }
  if (currentQuestion < 0 || currentQuestion >= shuffledQuestions.length || !shuffledQuestions[currentQuestion]) {
    console.error("UI_DISPLAY_Q: Invalid current question index or data:", currentQuestion, shuffledQuestions[currentQuestion]);
    stopQuiz(); return;
  }

  const questionData = shuffledQuestions[currentQuestion];
  console.log("UI_DISPLAY_Q: Current questionData (before rendering):", JSON.parse(JSON.stringify(questionData)));
  clearPreviousContent();
  if(pauseButton) pauseButton.classList.add("hide");

  questionData.userAnswers = questionData.userAnswers || {};
  questionData.correctnessPerBlank = questionData.correctnessPerBlank || {};
  questionData.aiFilledBlanks = questionData.aiFilledBlanks || {};
  console.log("UI_DISPLAY_Q: Question data (after ensuring objects exist):", JSON.parse(JSON.stringify(questionData)), "isRecheckModeActive:", isRecheckModeActive);

  let questionHTML = questionData.question;
  if (questionData.blankIds && questionData.blankIds.length > 0) {
      questionData.blankIds.forEach(blankId => {
          const inputValue = (questionData.userAnswers && questionData.userAnswers[blankId] !== undefined)
                             ? questionData.userAnswers[blankId] : "";
          let inputStyle = "";
          const isAiFilled = questionData.aiFilledBlanks && questionData.aiFilledBlanks[blankId];
          console.log(`UI_DISPLAY_Q: Blank ${blankId} - inputValue: "${inputValue}", isAiFilled: ${isAiFilled}, answered: ${questionData.answered}, correctness: ${questionData.correctnessPerBlank[blankId]}`);


          if (questionData.answered && !isRecheckModeActive) { // Only apply styles if answered AND not in recheck mode
              if (isAiFilled) {
                  inputStyle = 'border: 2px solid orange; background-color: #fff8e1;';
                  console.log(`UI_DISPLAY_Q: Blank ${blankId} - STYLING AI FILLED (orange)`);
              } else if (questionData.correctnessPerBlank && questionData.correctnessPerBlank[blankId] === true) {
                  inputStyle = 'border: 2px solid green; background-color: #e6ffe6;';
                  console.log(`UI_DISPLAY_Q: Blank ${blankId} - STYLING CORRECT (green)`);
              } else if (questionData.correctnessPerBlank && questionData.correctnessPerBlank[blankId] === false) {
                  inputStyle = 'border: 2px solid red; background-color: #ffe6ffe6;';
                  console.log(`UI_DISPLAY_Q: Blank ${blankId} - STYLING INCORRECT (red)`);
              } else {
                  console.log(`UI_DISPLAY_Q: Blank ${blankId} - NO STYLING (answered but no correctness or not in recheck)`);
              }
          } else {
              console.log(`UI_DISPLAY_Q: Blank ${blankId} - NOT STYLING (not answered or in recheck mode)`);
          }
          const placeholderRegex = new RegExp(`\\((${blankId})\\)(\\s*_{2,})`, 'i');
          const inputFieldHTML = `(${blankId}) <input type="text" class="gap-input" data-blank-id="${blankId}" value="${escapeHtml(inputValue)}" style="${inputStyle}">`;
          questionHTML = questionHTML.replace(placeholderRegex, inputFieldHTML);
      });
  }

  let questionContent = processTextWithImages(questionHTML);
  questionContent = convertNewlinesToHtml(questionContent);
  questionContent = questionContent.replace(/<span class="mathy">(.*?)<\/span>/g, (_match, p1) => `<span><script type="math/asciimath">${stripHTML(p1)}</script></span>`);
  questionContent = questionContent.replace(/<[^>]*class="mathy"[^>]*>(.*?)<\/[^>]*>/g, (_match, p1) => `<span><script type="math/asciimath">${stripHTML(p1)}</script></span>`);
  questionElement.innerHTML = `<h5>${questionContent}</h5>`;

  const allInputs = questionElement.querySelectorAll(".gap-input");
  if (questionData.answered) {
    console.log("UI_DISPLAY_Q: Question is answered. Setting up buttons for answered state.");
    nextButton.textContent = "Next";
    nextButton.disabled = (currentQuestion === shuffledQuestions.length - 1 && findNextUnansweredQuestion() === -1);

    if (recheckButtonElement && regenerateExplanationButtonElement) {
        recheckButtonElement.classList.remove("hide");
        regenerateExplanationButtonElement.classList.remove("hide");
    }

    if (isRecheckModeActive) {
        console.log("UI_DISPLAY_Q: Recheck mode IS ACTIVE. Enabling inputs.");
        allInputs.forEach(input => input.disabled = false);
        if (recheckButtonElement) recheckButtonElement.textContent = "Cancel Re-evaluation";
        if (regenerateExplanationButtonElement) regenerateExplanationButtonElement.disabled = true;
        nextButton.textContent = "Submit Re-evaluation";
        nextButton.disabled = false;
    } else {
        console.log("UI_DISPLAY_Q: Recheck mode IS NOT ACTIVE. Disabling inputs.");
        allInputs.forEach(input => input.disabled = true);
        if (recheckButtonElement) recheckButtonElement.textContent = "Re-evaluate My Answers";
        if (recheckButtonElement) recheckButtonElement.disabled = false;
        if (regenerateExplanationButtonElement) regenerateExplanationButtonElement.disabled = false;
    }
  } else {
    console.log("UI_DISPLAY_Q: Question is NOT answered. Setting up buttons for unanswered state.");
    allInputs.forEach(input => input.disabled = false);
    nextButton.textContent = "Check Answers";
    nextButton.disabled = false;
    if (recheckButtonElement) recheckButtonElement.classList.add("hide");
    if (regenerateExplanationButtonElement) regenerateExplanationButtonElement.classList.add("hide");
  }


  try {
     if (window.MathJax?.Hub) MathJax.Hub.Queue(["Typeset", MathJax.Hub, questionElement]);
     else if (window.MathJax?.typesetPromise) window.MathJax.typesetPromise([questionElement]);
  } catch (error) { console.error("UI_DISPLAY_Q: Error rendering MathJax for question:", error); }

  answerWrapperElement.innerHTML = "";
  answerWrapperElement.style.opacity = "1";
  updateQuestionCounter();
  previousButton.disabled = (currentQuestion === 0);

  if (questionData.answered && !isRecheckModeActive) {
    console.log("UI_DISPLAY_Q: Displaying stored explanation as question is answered and not in recheck mode.");
    if (questionData.finalExplanationHtml && answerWrapperElement) {
        const explanationContainerDiv = document.createElement("div");
        explanationContainerDiv.className = "explanation-container";
        const headingDiv = document.createElement("div");
        headingDiv.className = "explanation-heading";
        headingDiv.innerHTML = `<span class="explanation-heading-text">ব্যাখ্যা:</span> <img src="https://placehold.co/20x20/0056b3/ffffff?text=%E2%96%B6" class="explanation-arrow-image" alt="Arrow">`;
        explanationContainerDiv.appendChild(headingDiv);
        const explanationContentDiv = document.createElement("div");
        explanationContentDiv.className = "question-explanation";
        explanationContainerDiv.appendChild(explanationContentDiv);
        answerWrapperElement.appendChild(explanationContainerDiv);

        explanationContainerDiv.style.opacity = "1";
        explanationContentDiv.innerHTML = questionData.finalExplanationHtml;
        console.log("UI_DISPLAY_Q: Stored explanation HTML:", questionData.finalExplanationHtml);


        try {
            if (window.MathJax?.Hub) MathJax.Hub.Queue(["Typeset", MathJax.Hub, explanationContentDiv]);
            else if (window.MathJax?.typesetPromise) window.MathJax.typesetPromise([explanationContentDiv]);
        } catch (error) { console.error("Error re-rendering MathJax for stored explanation:", error); }
        if (pauseButton) pauseButton.classList.add('hide');
    } else {
        console.log("UI_DISPLAY_Q: No stored explanation or answerWrapperElement missing.");
    }
  }
  addHighlightCSS();
  console.log("UI_DISPLAY_Q: displayQuestion finished.");
}

async function checkCurrentQuestionAnswers() {
    console.log(`%cCHECK_ANSWERS_AI_V2: Checking answers for question ${currentQuestion + 1}. Recheck mode: ${isRecheckModeActive}`, "color: blue; font-weight: bold;");
    const questionData = shuffledQuestions[currentQuestion];
    if (!questionData) {
        console.error("CHECK_ANSWERS_AI_V2: Question data missing. Aborting check.");
        return;
    }
    console.log("CHECK_ANSWERS_AI_V2: Initial questionData:", JSON.parse(JSON.stringify(questionData)));


    // --- Initial UI Setup for Checking ---
    if (answerWrapperElement) answerWrapperElement.innerHTML = "";
    const explanationContainer = document.createElement("div");
    explanationContainer.className = "explanation-container";
    explanationContainer.style.opacity = "0";

    const heading = document.createElement("div");
    heading.className = "explanation-heading";
    heading.innerHTML = `<span class="explanation-heading-text">ফলাফল ও ব্যাখ্যা:</span> <img src="https://placehold.co/20x20/0056b3/ffffff?text=%E2%96%B6" class="explanation-arrow-image" alt="Arrow">`;
    explanationContainer.appendChild(heading);

    const explanationContentElement = document.createElement("div");
    explanationContentElement.className = "question-explanation";
    explanationContainer.appendChild(explanationContentElement);
    if (answerWrapperElement) {
        answerWrapperElement.appendChild(explanationContainer);
    }

    if (nextButton) nextButton.disabled = true;
    if (previousButton) previousButton.disabled = true;
    if (stopButton) stopButton.disabled = true;
    if (recheckButtonElement) recheckButtonElement.disabled = true;
    if (regenerateExplanationButtonElement) regenerateExplanationButtonElement.disabled = true;
    if (pauseButton) pauseButton.classList.add("hide");
    clearTimeout(autoNextTimeout);
    clearInterval(typingInterval); typingInterval = null;
    console.log("CHECK_ANSWERS_AI_V2: UI prepared, buttons disabled.");

    explanationContentElement.innerHTML = "উত্তর মূল্যায়ন করা হচ্ছে..."; // Phase 1 message
    explanationContainer.style.opacity = "1";


    // --- SET 1: Evaluation & Data Collection ---
    console.log("%cCHECK_ANSWERS_AI_V2 (SET 1): Starting Evaluation & Data Collection", "color: green;");
    const evaluationPromises = [];
    const inputs = Array.from(questionElement.querySelectorAll(".gap-input"));
    const correctAnswersMap = extractCorrectAnswers(questionData.explanation);
    console.log("CHECK_ANSWERS_AI_V2 (SET 1): Correct answers map from grammer.js:", JSON.parse(JSON.stringify(correctAnswersMap)));


    const evaluationResults = {};

    questionData.userAnswers = questionData.userAnswers || {};
    questionData.aiFilledBlanks = questionData.aiFilledBlanks || {};

    for (const input of inputs) {
        const blankId = input.dataset.blankId;
        const userAnswerOriginal = input.value.trim();
        const expectedCorrectAnswersForBlank = correctAnswersMap[blankId] || [];
        console.log(`CHECK_ANSWERS_AI_V2 (SET 1) - BLANK ${blankId}: User answer: "${userAnswerOriginal}", Expected: [${expectedCorrectAnswersForBlank.join(', ')}]`);


        questionData.userAnswers[blankId] = userAnswerOriginal; // Store user's attempt

        if (userAnswerOriginal !== "") {
            console.log(`CHECK_ANSWERS_AI_V2 (SET 1) - BLANK ${blankId}: User provided answer. Calling aiEvaluateUserAnswer.`);
            delete questionData.aiFilledBlanks[blankId];
            evaluationPromises.push(
                aiEvaluateUserAnswer(questionData, blankId, userAnswerOriginal, expectedCorrectAnswersForBlank)
                    .then(result => {
                        console.log(`CHECK_ANSWERS_AI_V2 (SET 1) - BLANK ${blankId}: aiEvaluateUserAnswer result:`, JSON.parse(JSON.stringify(result)));
                        evaluationResults[blankId] = {
                            userAnswer: userAnswerOriginal,
                            isCorrect: result.is_correct
                        };
                    })
                    .catch(err => {
                        console.error(`CHECK_ANSWERS_AI_V2 (SET 1) - BLANK ${blankId}: aiEvaluateUserAnswer ERROR:`, err);
                        evaluationResults[blankId] = { userAnswer: userAnswerOriginal, isCorrect: false, error: true };
                    })
            );
        } else { // Empty blank
            console.log(`CHECK_ANSWERS_AI_V2 (SET 1) - BLANK ${blankId}: Empty blank. Calling aiGetAnswerForEmptyBlank_NoExplanation.`);
            evaluationPromises.push(
                aiGetAnswerForEmptyBlank_NoExplanation(questionData, blankId, expectedCorrectAnswersForBlank)
                    .then(result => {
                        console.log(`CHECK_ANSWERS_AI_V2 (SET 1) - BLANK ${blankId}: aiGetAnswerForEmptyBlank_NoExplanation result:`, JSON.parse(JSON.stringify(result)));
                        evaluationResults[blankId] = {
                            aiFilledAnswer: result.correct_answer,
                            isCorrect: false
                        };
                    })
                    .catch(err => {
                        console.error(`CHECK_ANSWERS_AI_V2 (SET 1) - BLANK ${blankId}: aiGetAnswerForEmptyBlank_NoExplanation ERROR:`, err);
                        evaluationResults[blankId] = { aiFilledAnswer: (expectedCorrectAnswersForBlank[0] || "ত্রুটি"), error: true };
                    })
            );
        }
    }

    await Promise.all(evaluationPromises);
    console.log("CHECK_ANSWERS_AI_V2 (SET 1): All evaluation promises resolved. evaluationResults:", JSON.parse(JSON.stringify(evaluationResults)));


    // --- Apply Evaluation Results to UI, Score, and questionData ---
    console.log("%cCHECK_ANSWERS_AI_V2 (SET 1): Applying Evaluation Results to UI & Score", "color: green;");
    for (const input of inputs) {
        const blankId = input.dataset.blankId;
        const result = evaluationResults[blankId];
        console.log(`CHECK_ANSWERS_AI_V2 (SET 1) - APPLYING BLANK ${blankId}: Result from evaluation:`, JSON.parse(JSON.stringify(result)));


        const wasPreviouslyUserCorrectForScoring = questionData.correctnessPerBlank[blankId] === true &&
                                               !(questionData.aiFilledBlanks && questionData.aiFilledBlanks[blankId]);
        console.log(`CHECK_ANSWERS_AI_V2 (SET 1) - BLANK ${blankId}: wasPreviouslyUserCorrectForScoring: ${wasPreviouslyUserCorrectForScoring}`);


        if (result.aiFilledAnswer !== undefined) { // Blank was empty, now AI filled
            console.log(`CHECK_ANSWERS_AI_V2 (SET 1) - BLANK ${blankId}: AI FILLED. Answer: "${result.aiFilledAnswer}"`);
            input.value = result.aiFilledAnswer;
            questionData.userAnswers[blankId] = result.aiFilledAnswer;
            questionData.aiFilledBlanks[blankId] = true;
            input.style.border = "2px solid orange";
            input.style.backgroundColor = "#fff8e1";
            questionData.correctnessPerBlank[blankId] = false;
            if (wasPreviouslyUserCorrectForScoring) {
                score--;
                console.log(`CHECK_ANSWERS_AI_V2 (SET 1) - BLANK ${blankId}: Score DECREMENTED to ${score} (was correct, now AI filled)`);
            }
        } else { // User provided an answer
            console.log(`CHECK_ANSWERS_AI_V2 (SET 1) - BLANK ${blankId}: USER ANSWERED. isCorrect: ${result.isCorrect}`);
            questionData.correctnessPerBlank[blankId] = result.isCorrect;
            if (result.isCorrect) {
                input.style.border = "2px solid green";
                input.style.backgroundColor = "#e6ffe6";
                if (!wasPreviouslyUserCorrectForScoring) {
                    score++;
                    console.log(`CHECK_ANSWERS_AI_V2 (SET 1) - BLANK ${blankId}: Score INCREMENTED to ${score}`);
                }
            } else {
                input.style.border = "2px solid red";
                input.style.backgroundColor = "#ffe6ffe6";
                if (wasPreviouslyUserCorrectForScoring) {
                    score--;
                    console.log(`CHECK_ANSWERS_AI_V2 (SET 1) - BLANK ${blankId}: Score DECREMENTED to ${score} (was correct, now incorrect)`);
                }
            }
        }
        input.disabled = true;
    }

    questionData.answered = true;
    if (questionData.blankIds && questionData.blankIds.length > 0) {
        const userAttemptedBlanks = questionData.blankIds
            .filter(bId => !(questionData.aiFilledBlanks && questionData.aiFilledBlanks[bId]));
        const allUserAttemptsCorrect = userAttemptedBlanks.length > 0 && userAttemptedBlanks
            .every(bId => questionData.correctnessPerBlank[bId] === true);
        questionData.isCorrect = allUserAttemptsCorrect;
    } else {
        questionData.isCorrect = true;
    }
    console.log(`CHECK_ANSWERS_AI_V2 (SET 1): Evaluation complete. Question ${currentQuestion + 1} isCorrect: ${questionData.isCorrect}. Current global score: ${score}. Updated questionData:`, JSON.parse(JSON.stringify(questionData)));


    // --- SET 2: Explanation Generation ---
    console.log("%cCHECK_ANSWERS_AI_V2 (SET 2): Starting Explanation Generation", "color: purple;");
    explanationContentElement.innerHTML = "ব্যাখ্যা তৈরি করা হচ্ছে...";

    let accumulatedExplanationHtml = "";
    const explanationPromises = [];

    for (const blankId of questionData.blankIds) {
        const answerInBlank = questionData.userAnswers[blankId];
        const isMarkedCorrect = questionData.correctnessPerBlank[blankId]; // This is crucial!
        const wasInitiallyEmptyAndAiFilled = !!(questionData.aiFilledBlanks && questionData.aiFilledBlanks[blankId]);
        const actualCorrectAnswerForExplanation = (correctAnswersMap[blankId] && correctAnswersMap[blankId][0]) || answerInBlank;
        console.log(`CHECK_ANSWERS_AI_V2 (SET 2) - BLANK ${blankId}: Preparing explanation. answerInBlank: "${answerInBlank}", isMarkedCorrect: ${isMarkedCorrect}, wasInitiallyEmptyAndAiFilled: ${wasInitiallyEmptyAndAiFilled}, actualCorrectAnswerForExplanation: "${actualCorrectAnswerForExplanation}"`);


        explanationPromises.push(
            aiGenerateExplanationForBlank(questionData, blankId, answerInBlank, isMarkedCorrect, actualCorrectAnswerForExplanation, wasInitiallyEmptyAndAiFilled)
                .then(result => {
                    console.log(`CHECK_ANSWERS_AI_V2 (SET 2) - BLANK ${blankId}: aiGenerateExplanationForBlank result:`, JSON.parse(JSON.stringify(result)));
                    accumulatedExplanationHtml += result.explanation_html;
                    accumulatedExplanationHtml += "<hr style='margin-top: 5px; margin-bottom: 10px; border-color: #eee;'/>";
                })
                .catch(err => {
                    console.error(`CHECK_ANSWERS_AI_V2 (SET 2) - BLANK ${blankId}: aiGenerateExplanationForBlank ERROR:`, err);
                    accumulatedExplanationHtml += `<p style="color:red;">(${blankId}) এর জন্য ব্যাখ্যা তৈরি করতে সমস্যা হয়েছে।</p><hr style='margin-top: 5px; margin-bottom: 10px; border-color: #eee;'/>`;
                })
        );
    }

    await Promise.all(explanationPromises);
    console.log("CHECK_ANSWERS_AI_V2 (SET 2): All explanation promises resolved.");

    questionData.finalExplanationHtml = accumulatedExplanationHtml.endsWith("<hr style='margin-top: 5px; margin-bottom: 10px; border-color: #eee;'/>")
                                      ? accumulatedExplanationHtml.slice(0, -1 * ("<hr style='margin-top: 5px; margin-bottom: 10px; border-color: #eee;'/>".length))
                                      : accumulatedExplanationHtml;
    console.log("CHECK_ANSWERS_AI_V2 (SET 2): Final accumulatedExplanationHtml:", questionData.finalExplanationHtml);


    // --- Display Final Explanation and Restore UI ---
    console.log("%cCHECK_ANSWERS_AI_V2: Displaying Final Explanation & Restoring UI", "color: blue; font-weight: bold;");
    if (explanationContentElement) {
        if (questionData.finalExplanationHtml) {
            await typeHtmlContent(explanationContentElement, questionData.finalExplanationHtml, 20);
            try {
                if (window.MathJax?.Hub) MathJax.Hub.Queue(["Typeset", MathJax.Hub, explanationContentElement]);
                else if (window.MathJax?.typesetPromise) window.MathJax.typesetPromise([explanationContentElement]);
            } catch (error) { console.error("AI_EXPLAIN_V2: Error rendering MathJax for explanation:", error); }

            if (pauseButton) pauseButton.classList.remove("hide");
            if (!isPaused) {
                clearTimeout(autoNextTimeout);
                autoNextTimeout = setTimeout(() => {
                    if (pauseButton) pauseButton.classList.add('hide');
                    const nextIdx = findNextUnansweredQuestion();
                    if (nextIdx !== -1) {
                        currentQuestion = nextIdx; displayQuestion();
                    } else {
                        endQuiz();
                    }
                }, 5000);
            }
        } else {
            explanationContainer.style.display = "none";
        }
    }

    isRecheckModeActive = false;
    if (nextButton) nextButton.textContent = "Next";
    if (recheckButtonElement) {
        recheckButtonElement.textContent = "Re-evaluate My Answers";
        recheckButtonElement.classList.remove("hide");
        recheckButtonElement.disabled = false;
    }
    if (regenerateExplanationButtonElement) {
        regenerateExplanationButtonElement.classList.remove("hide");
        regenerateExplanationButtonElement.disabled = false;
    }

    if (previousButton) previousButton.disabled = (currentQuestion === 0);
    if (stopButton) stopButton.disabled = false;
    if (nextButton) nextButton.disabled = (currentQuestion === shuffledQuestions.length - 1 && findNextUnansweredQuestion() === -1);

    console.log(`CHECK_ANSWERS_AI_V2: Process complete for question ${currentQuestion + 1}.`);
}


function findNextUnansweredQuestion() {
  console.log("NAV: findNextUnansweredQuestion called from currentQuestion:", currentQuestion);
  for (let i = currentQuestion + 1; i < shuffledQuestions.length; i++) {
    if (shuffledQuestions[i] && !shuffledQuestions[i].answered) {
      console.log("NAV: Found next unanswered at index:", i);
      return i;
    }
  }
  for (let i = 0; i < currentQuestion; i++) {
    if (shuffledQuestions[i] && !shuffledQuestions[i].answered) {
      console.log("NAV: Found next unanswered (wrapped around) at index:", i);
      return i;
    }
  }
  console.log("NAV: No more unanswered questions found.");
  return -1;
}

function previousQuestion() {
    console.log("NAV: previousQuestion called. Moving from", currentQuestion + 1, "to", currentQuestion);
    if (!pauseButton || !nextButton || currentQuestion <= 0) {
        console.log("NAV: previousQuestion - cannot go back or elements missing.");
        return;
    }

    isRecheckModeActive = false;
    clearTimeout(autoNextTimeout);
    clearInterval(typingInterval);
    typingInterval = null;
    pauseButton.classList.add("hide");
    if (isPaused) { console.log("NAV: Resuming from pause (previous button)."); isPaused = false; startTimer(); }
    currentQuestion--;
    console.log("NAV: currentQuestion is now:", currentQuestion);
    displayQuestion();
}

function stopQuiz() {
  console.log("QUIZ_LIFECYCLE: stopQuiz called (manual stop)");
  if (!quizScreen || !endScreen || !pauseButton) {
      console.error("QUIZ_LIFECYCLE: stopQuiz - required elements missing.");
      return;
  }
  isRecheckModeActive = false;
  clearInterval(timerInterval); clearTimeout(autoNextTimeout); clearInterval(typingInterval);
  typingInterval = null;
  quizScreen.classList.add("hide"); endScreen.classList.remove("hide");
  pauseButton.classList.add("hide");
  hideQuiz(); calculateAndDisplayResults();
  if(nextButton) nextButton.disabled = false;
  console.log("QUIZ_LIFECYCLE: Quiz stopped, results displayed.");
}

function endQuiz() {
    console.log("QUIZ_LIFECYCLE: endQuiz called (natural end - time/all answered)");
    if (!quizScreen || !endScreen || !pauseButton) {
        console.error("QUIZ_LIFECYCLE: endQuiz - required elements missing.");
        return;
    }
    isRecheckModeActive = false;
    clearInterval(timerInterval); clearTimeout(autoNextTimeout); clearInterval(typingInterval);
    typingInterval = null;
    quizScreen.classList.add("hide"); endScreen.classList.remove("hide");
    pauseButton.classList.add("hide");
    hideQuiz(); calculateAndDisplayResults();
    console.log("QUIZ_LIFECYCLE: Quiz ended naturally, results displayed.");
}

function calculateAndDisplayResults() {
    console.log("RESULTS: calculateAndDisplayResults called");
    if (!scoreElement || !totalScoreElement || !endScreen) {
        console.error("RESULTS: calculateAndDisplayResults - required score/screen elements missing.");
        return;
    }
    clearInterval(timerInterval); // Ensure timer is stopped

    let totalPossibleBlanks = 0;
    shuffledQuestions.forEach(q => { totalPossibleBlanks += (q?.numBlanks || 0); });
    console.log("RESULTS: totalPossibleBlanks:", totalPossibleBlanks, "final score:", score);


    scoreElement.textContent = score.toString();
    totalScoreElement.textContent = totalPossibleBlanks.toString();

    let attemptedBlanks = 0; // User attempted blanks
    let answeredQuestionsCount = 0; // Questions where at least one blank was touched or AI filled
    shuffledQuestions.forEach(q => {
        if (q?.answered) { // answered flag is set after checkCurrentQuestionAnswers
            answeredQuestionsCount++;
            if (q.blankIds) {
                q.blankIds.forEach(blankId => {
                    // Count as attempted if user provided an answer and it wasn't AI filled
                    if (q.userAnswers[blankId] !== undefined && !(q.aiFilledBlanks && q.aiFilledBlanks[blankId])) {
                        attemptedBlanks++;
                    }
                });
            }
        }
    });
    const notAnsweredQuestionsCount = shuffledQuestions.length - answeredQuestionsCount;
    const correctBlanksCount = score; // Score directly reflects user-correct blanks

    let wrongBlanksCount = 0;
    shuffledQuestions.forEach(q => {
        if (q?.answered && q.blankIds) {
            q.blankIds.forEach(blankId => {
                if (q.userAnswers[blankId] !== undefined &&
                    !(q.aiFilledBlanks && q.aiFilledBlanks[blankId]) && // User attempt
                    q.correctnessPerBlank[blankId] === false) {         // Marked incorrect
                    wrongBlanksCount++;
                }
            });
        }
    });
    console.log("RESULTS: answeredQuestionsCount:", answeredQuestionsCount, "notAnsweredQuestionsCount:", notAnsweredQuestionsCount);
    console.log("RESULTS: correctBlanksCount (score):", correctBlanksCount, "wrongBlanksCount (user attempts):", wrongBlanksCount, "attemptedBlanks (user):", attemptedBlanks);


    const correctCountEl = endScreen.querySelector(".correct-count");
    const wrongCountEl = endScreen.querySelector(".wrong-count");
    const notAnsweredCountEl = endScreen.querySelector(".not-answered-count");

    if (correctCountEl) correctCountEl.textContent = correctBlanksCount.toString();
    if (wrongCountEl) wrongCountEl.textContent = Math.max(0, wrongBlanksCount).toString();
    if (notAnsweredCountEl) notAnsweredCountEl.textContent = notAnsweredQuestionsCount.toString();
    console.log("RESULTS: Displayed counts on end screen.");
}

async function restartQuiz() {
    console.log("QUIZ_LIFECYCLE: restartQuiz called");
    if (!endScreen || !quizScreen || !startScreen || !pauseButton || !errorMessage || !subjectName) {
        console.error("QUIZ_LIFECYCLE: Cannot restart quiz: Missing elements or subject name.");
        return;
    }
    isRecheckModeActive = false;
    clearInterval(timerInterval); clearTimeout(autoNextTimeout); clearInterval(typingInterval);
    typingInterval = null;
    endScreen.classList.add("hide"); quizScreen.classList.add("hide");
    startScreen.classList.remove("hide"); pauseButton.classList.add("hide");
    hideError(); hideQuiz();
    currentQuestion = 0; score = 0; shuffledQuestions = []; isPaused = false; timeRemaining = 0;
    if (questionLimitInput) questionLimitInput.value = 30;
    if (timeLimitInput) timeLimitInput.value = 30;
    console.log("QUIZ_LIFECYCLE: State reset for restart.");
    await loadQuestionHistory();
    if (data && subjectName) {
        console.log("QUIZ_LIFECYCLE: Restarting with subject:", subjectName);
        showStartScreen(subjectName);
    } else {
        console.error("QUIZ_LIFECYCLE: Error restarting quiz - data or subjectName missing.");
        displayError("Error restarting quiz. Please refresh.");
        if (startButton) startButton.disabled = true;
    }
}

// --- Timer and Pause Logic ---
function startTimer() {
  console.log("TIMER: startTimer called. isPaused:", isPaused, "TimeRemaining:", timeRemaining);
  clearInterval(timerInterval);
  if (!timeLimitInput || !progressText) { console.error("TIMER: Required elements missing."); return; }
  const progressBar = document.querySelector(".progress-bar");
  if (!progressBar) { console.error("TIMER: Progress bar element not found!"); return; }
  const totalDuration = parseInt(timeLimitInput.value) * 60;
  console.log("TIMER: totalDuration:", totalDuration);


  const updateDisplay = () => {
    if (totalDuration <= 0) return;
    const percentageRemaining = Math.max(0, (timeRemaining / totalDuration) * 100);
    progressBar.style.width = `${percentageRemaining}%`;
    const hours = Math.floor(timeRemaining / 3600);
    const minutes = Math.floor((timeRemaining % 3600) / 60);
    const seconds = timeRemaining % 60;
    let timeString = "";
    if (hours > 0) timeString = `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
    else if (minutes > 0) timeString = `${minutes}m ${String(seconds).padStart(2, '0')}s`;
    else timeString = `${seconds}s`;
    progressText.innerHTML = timeString;
    progressText.style.color = (percentageRemaining >= 49.5) ? "#fff" : "#000";
  };
  updateDisplay(); // Initial display
  timerInterval = setInterval(() => {
    if (!isPaused) {
      if (timeRemaining > 0) { timeRemaining--; updateDisplay(); }
      if (timeRemaining <= 0) {
        console.log("TIMER: Time is up!");
        clearInterval(timerInterval); endQuiz();
      }
    }
  }, 1000);
}

function handlePauseButtonClick() {
  console.log("PAUSE: handlePauseButtonClick called. isPaused:", isPaused, "PauseButton hidden:", pauseButton.classList.contains('hide'));
  if (!pauseButton || isPaused || pauseButton.classList.contains('hide') || isRecheckModeActive) {
      console.log("PAUSE: Cannot pause. Conditions not met.");
      return;
  }
  isPaused = true; clearInterval(timerInterval); clearTimeout(autoNextTimeout); clearInterval(typingInterval);
  typingInterval = null;
  pauseButton.classList.add("hide");
  console.log("PAUSE: Quiz paused.");
}

// --- API Key Modal Logic ---
function showApiKeyModal() {
    console.log("MODAL: showApiKeyModal called.");
    if (!apiKeyModal || !apiKeyInput || !modelSelect || !modalSubmitButton || !closeModalButton || !modalErrorMessage) {
        console.error("MODAL: API Key modal elements not found. Cannot display modal.");
        displayError("API Key modal initialization error. Please refresh.");
        return;
    }
    apiKeyModal.style.display = "flex";
    apiKeyInput.value = userApiKey;
    hideError(true);

    modelSelect.innerHTML = '<option value="">API Key লিখুন মডেল লোড করতে...</option>';
    modelSelect.disabled = true;
    modalSubmitButton.disabled = true;

    if (userApiKey) {
        console.log("MODAL: User API key exists, fetching models.");
        fetchAvailableModels(userApiKey);
    }
}

function hideApiKeyModal() {
    console.log("MODAL: hideApiKeyModal called.");
    if (apiKeyModal) {
        apiKeyModal.style.display = "none";
        hideError(true);
    }
}

async function fetchAvailableModels(apiKey) {
    console.log("MODAL: fetchAvailableModels called with apiKey (length):", apiKey?.length);
    modelSelect.innerHTML = '<option value="">মডেল লোড হচ্ছে...</option>';
    modelSelect.disabled = true;
    modalSubmitButton.disabled = true;
    hideError(true);

    if (!apiKey) {
        modelSelect.innerHTML = '<option value="">API Key লিখুন মডেল লোড করতে...</option>';
        console.log("MODAL: No API key provided to fetchAvailableModels.");
        return;
    }

    try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        console.log("MODAL: Fetching models from URL:", apiUrl);
        const response = await fetch(apiUrl);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: { message: 'Unknown error structure' } }));
            console.error("MODAL: Failed to fetch models. Status:", response.status, "Error Data:", errorData);
            throw new Error(`Failed to fetch models: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
        }
        const data = await response.json();
        console.log("MODAL: Models data received:", data);
        modelSelect.innerHTML = '';
        let defaultOptionAdded = false;

        if (data.models && Array.isArray(data.models)) {
            data.models.forEach(model => {
                if (model.supportedGenerationMethods && model.supportedGenerationMethods.includes('generateContent')) {
                    const option = document.createElement('option');
                    option.value = model.name.split('/')[1];
                    option.textContent = model.displayName || model.name.split('/')[1];
                    modelSelect.appendChild(option);
                    console.log("MODAL: Added model to select:", option.value, option.textContent);
                    if (option.value === selectedGeminiModel && !defaultOptionAdded) {
                        option.selected = true;
                        defaultOptionAdded = true;
                        console.log("MODAL: Selected default model:", selectedGeminiModel);
                    }
                }
            });
        }

        if (modelSelect.options.length === 0) {
            console.warn("MODAL: No compatible models found.");
            modelSelect.innerHTML = '<option value="">কোন মডেল পাওয়া যায়নি</option>';
            displayError("কোন AI মডেল পাওয়া যায়নি। অনুগ্রহ করে আপনার API কী এবং নেটওয়ার্ক সংযোগ পরীক্ষা করুন।", true);
            modelSelect.disabled = true;
            modalSubmitButton.disabled = true;
        } else {
            modelSelect.disabled = false;
            modalSubmitButton.disabled = false;
            if (!defaultOptionAdded && modelSelect.options.length > 0) {
                modelSelect.value = modelSelect.options[0].value;
                selectedGeminiModel = modelSelect.options[0].value;
                console.log("MODAL: No default selected, using first available model:", selectedGeminiModel);
            }
        }
    } catch (error) {
        console.error("MODAL: Error fetching available models:", error);
        modelSelect.innerHTML = '<option value="">মডেল লোড ব্যর্থ</option>';
        displayError(`মডেল লোড করতে ব্যর্থ: ${error.message}.`, true);
        modelSelect.disabled = true;
        modalSubmitButton.disabled = true;
    }
}

function handleModalSubmit() {
    console.log("MODAL: handleModalSubmit called.");
    const enteredApiKey = apiKeyInput.value.trim();
    const selectedModel = modelSelect.value;
    console.log("MODAL: Entered API Key (length):", enteredApiKey.length, "Selected Model:", selectedModel);


    if (!enteredApiKey) {
        displayError("অনুগ্রহ করে আপনার Gemini API Key লিখুন।", true);
        return;
    }
    if (!selectedModel) {
        displayError("অনুগ্রহ করে একটি AI মডেল নির্বাচন করুন।", true);
        return;
    }

    userApiKey = enteredApiKey;
    selectedGeminiModel = selectedModel;
    console.log("MODAL: API Key and Model set. userApiKey (length):", userApiKey.length, "selectedGeminiModel:", selectedGeminiModel);
    hideApiKeyModal();
    startQuizAfterApiKeySelection();
}

// --- Communication with Parent Window ---
window.addEventListener("message", async (event) => {
  console.log("PARENT_MSG: Received message from parent:", event.data);
  const messageData = event.data;
  if (messageData === "closeQuiz") {
    console.log("PARENT_MSG: closeQuiz message received.");
    closeQuiz();
  } else if (messageData?.subjectName) {
    subjectName = messageData.subjectName;
    console.log("PARENT_MSG: subjectName message received. Subject:", subjectName);
    if (quizHeading) quizHeading.textContent = subjectName;
    if (startScreenHeading) startScreenHeading.textContent = subjectName;
    const endScreenHeading = document.getElementById("end-screen-heading");
    if (endScreenHeading) endScreenHeading.textContent = subjectName;
    const timeLimitLabel = document.getElementById("time-limit-label");
    if (timeLimitLabel) timeLimitLabel.textContent = "মিনিট নির্ধারণ করুন :";
    const questionLimitLabel = document.getElementById("question-limit-label");
    if (questionLimitLabel) questionLimitLabel.textContent = "প্রশ্নের সংখ্যা নির্ধারণ করুন :";
    const startButtonEl = document.getElementById("start-button");
    if (startButtonEl) startButtonEl.textContent = "কুইজ শুরু করুন";
    const quizNameLabel = document.getElementById("quiz-name-label");
    if (quizNameLabel) quizNameLabel.textContent = subjectName;

    if (timeLimitInput) timeLimitInput.value = 30;
    if (questionLimitInput) questionLimitInput.value = 30;
    hideError();

    if (quizScreen) quizScreen.classList.add("hide");
    if (endScreen) endScreen.classList.add("hide");
    if (startScreen) startScreen.classList.remove("hide");
    isRecheckModeActive = false;

    try {
        await loadQuestionHistory();
        const fetchedData = await loadQuestionData();
        if (fetchedData) {
            data = fetchedData;
            console.log("PARENT_MSG: Data loaded, showing start screen for subject:", subjectName);
            showStartScreen(subjectName);
        } else {
            console.error("PARENT_MSG: Error loading questions for subject:", subjectName);
            displayError("Error loading questions for this subject. Please refresh.");
            if (startButton) startButton.disabled = true;
        }
    } catch (error) {
        console.error("PARENT_MSG: Failed to load quiz setup data:", error);
        displayError("Failed to load quiz setup data. Please refresh.");
         if (startButton) startButton.disabled = true;
    }
  } else if (messageData === "reloadQuiz") {
    console.log("PARENT_MSG: reloadQuiz message received.");
    await loadQuestionHistory(); restartQuiz();
  }
});

function closeQuiz() {
  console.log("QUIZ_CLOSE: closeQuiz called.");
  if (window.parent && window.parent !== window) {
      console.log("QUIZ_CLOSE: Posting 'closeQuiz' message to parent.");
      window.parent.postMessage({ type: "closeQuiz" }, '*');
  }
  clearInterval(timerInterval); clearTimeout(autoNextTimeout); clearInterval(typingInterval);
  typingInterval = null;
}

// --- UI Visibility and Styling ---
function showQuiz() {
  console.log("UI_VIS: showQuiz called.");
  if (!quizScreen || !quizHeading) {
      console.error("UI_VIS: showQuiz - quizScreen or quizHeading missing.");
      return;
  }
  quizScreen.classList.add("show"); quizScreen.classList.remove("hide");
  document.body.style.backgroundColor = "#fff";
  if (quizHeading) quizHeading.textContent = subjectName || "Quiz";
}

function hideQuiz() {
  console.log("UI_VIS: hideQuiz called.");
  if (!quizScreen) {
      console.error("UI_VIS: hideQuiz - quizScreen missing.");
      return;
  }
  quizScreen.classList.remove("show"); quizScreen.classList.add("hide");
  document.body.style.backgroundColor = "";
}

function showStartScreen(subjectNameParam) {
  console.log("UI_VIS: showStartScreen called for subject:", subjectNameParam);
  const elements = [startScreen, startScreenHeading, data, data?.sections, questionLimitInput, timeLimitInput, startButton, quizScreen, endScreen, errorMessage];
  if (elements.some(el => el === null || el === undefined)) {
      console.error("UI_VIS: Cannot show start screen: Required elements or data structure not ready.");
      displayError("Initialization error. Please refresh."); return;
  }

  if (startScreenHeading) startScreenHeading.textContent = subjectNameParam || "Quiz Setup";
  const quizNameLabel = document.getElementById("quiz-name-label");
  if (quizNameLabel) quizNameLabel.textContent = subjectNameParam || "Quiz";

  const section = data.sections.find((s) => s.sectionname === subjectNameParam);
  console.log("UI_VIS: showStartScreen - found section:", section ? section.sectionname : "Not found");


  if (section?.questions?.length > 0) {
      questions = section.questions.filter(q => q);
      console.log("UI_VIS: showStartScreen - Questions available for subject. Count:", questions.length);
      questionLimitInput.disabled = false; timeLimitInput.disabled = false;
      updateQuestionLimits();
  } else {
      questions = [];
      console.warn("UI_VIS: showStartScreen - No questions available for subject. Disabling inputs.");
      questionLimitInput.disabled = true; timeLimitInput.disabled = true;
      if (startButton) startButton.disabled = true;
      updateQuestionLimits(); // Will show error if no questions
  }

  if (startScreen) startScreen.classList.remove("hide");
  if (quizScreen) quizScreen.classList.add("hide");
  if (endScreen) endScreen.classList.add("hide");
  isRecheckModeActive = false;
  console.log("UI_VIS: showStartScreen - UI updated.");
}


function addHighlightCSS() {
    // console.log("UI_STYLE: addHighlightCSS called.");
    if (document.getElementById("quiz-dynamic-styles")) return;
    const style = document.createElement("style");
    style.id = "quiz-dynamic-styles";
    style.textContent = `
        .explanation-container { margin-top: 25px; animation: fadeInUp 0.8s ease-out; }
        @keyframes fadeInUp { from { opacity: 0; transform: translate3d(0, 20px, 0); } to { opacity: 1; transform: translate3d(0, 0, 0); } }
        .explanation-heading { font-size: 1.1em; font-weight: bold; color: #0056b3; margin-bottom: 10px; display: flex; align-items: center; text-align: left; border-bottom: 1px solid #eee; padding-bottom: 5px; }
        .explanation-heading-text { margin-right: 8px; }
        .explanation-arrow-image { width: 20px; height: auto; transform: rotate(350deg); display: inline-block; vertical-align: middle; margin-left: 2px; margin-top: 0px; filter: brightness(1.1); }
        .question-explanation { padding: 12px 15px; background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px; text-align: left; color: #343a40; font-size: 0.95em; line-height: 1.6; box-shadow: inset 0 1px 2px rgba(0,0,0,0.05); word-wrap: break-word; overflow-y: auto; max-height: 300px; }
        /* This .highlight rule is for JS-driven highlighting, AI will use inline styles */
        .question-explanation .highlight {
            display: inline-block;
            background: linear-gradient(90deg, #84fab0, #8fd3f4);
            font-weight: bold;
            border-radius: 6px;
            padding: 2px 6px;
            margin: 1px 3px;
            color: #111;
            box-shadow: 1px 1px 2px rgba(0,0,0,0.1);
        }
        .question-explanation .MathJax_Display { margin: 0.5em 0 !important; }
        .question-explanation script { display: none !important; }
        .question-explanation span > span > script { display: none !important; }
        .typing-cursor {
            display: inline-block;
            width: 2px;
            height: 1.2em;
            background-color: #333;
            animation: blink-caret 0.75s step-end infinite;
            vertical-align: middle;
            margin-left: 2px;
        }
        @keyframes blink-caret {
            from, to { background-color: transparent }
            50% { background-color: #333; }
        }
    `;
    document.head.appendChild(style);
}

// --- NEW: Event handler for Recheck button ---
async function handleRecheckButtonClick() {
    console.log("BTN_RECHECK: Recheck button clicked. isRecheckModeActive (before):", isRecheckModeActive);
    const questionData = shuffledQuestions[currentQuestion];
    if (!questionData || !questionData.answered) {
        console.warn("BTN_RECHECK: Cannot recheck unanswered question.");
        return;
    }

    if (isRecheckModeActive) { // Was "Cancel Re-evaluation"
        isRecheckModeActive = false;
        console.log("BTN_RECHECK: Cancelling re-evaluation. isRecheckModeActive (after):", isRecheckModeActive);
        displayQuestion();
    } else { // Was "Re-evaluate My Answers"
        isRecheckModeActive = true;
        console.log("BTN_RECHECK: Starting re-evaluation. isRecheckModeActive (after):", isRecheckModeActive);
        displayQuestion();

        if (answerWrapperElement) {
            // answerWrapperElement.innerHTML = ""; // Optionally clear
        }
        if (pauseButton) pauseButton.classList.add('hide');
        clearTimeout(autoNextTimeout);
    }
}

// --- NEW: Event handler for Regenerate Explanation button ---
async function handleRegenerateExplanationClick() {
    console.log("BTN_REGEN_EXPLAIN: Regenerate explanation clicked.");
    const questionData = shuffledQuestions[currentQuestion];
    if (!questionData || !questionData.answered) {
        console.warn("BTN_REGEN_EXPLAIN: Cannot regenerate for unanswered question.");
        return;
    }

    if (isRecheckModeActive) {
        console.warn("BTN_REGEN_EXPLAIN: Cannot regenerate explanation while in re-check mode.");
        return;
    }

    if (nextButton) nextButton.disabled = true;
    if (previousButton) previousButton.disabled = true;
    if (stopButton) stopButton.disabled = true;
    if (recheckButtonElement) recheckButtonElement.disabled = true;
    if (regenerateExplanationButtonElement) regenerateExplanationButtonElement.disabled = true;
    if (pauseButton) pauseButton.classList.add('hide');
    clearTimeout(autoNextTimeout);
    clearInterval(typingInterval); typingInterval = null;
    console.log("BTN_REGEN_EXPLAIN: Buttons disabled for regeneration.");

    if (answerWrapperElement) answerWrapperElement.innerHTML = "";
    const explanationContainerDiv = document.createElement("div");
    explanationContainerDiv.className = "explanation-container";
    explanationContainerDiv.style.opacity = "0";

    const headingDiv = document.createElement("div");
    headingDiv.className = "explanation-heading";
    headingDiv.innerHTML = `<span class="explanation-heading-text">ব্যাখ্যা (পুনরায় তৈরি):</span> <img src="https://placehold.co/20x20/0056b3/ffffff?text=%E2%96%B6" class="explanation-arrow-image" alt="Arrow">`;
    explanationContainerDiv.appendChild(headingDiv);

    const explanationContentDiv = document.createElement("div");
    explanationContentDiv.className = "question-explanation";
    explanationContainerDiv.appendChild(explanationContentDiv);
    if (answerWrapperElement) {
        answerWrapperElement.appendChild(explanationContainerDiv);
    }

    explanationContentDiv.innerHTML = "নতুন ব্যাখ্যা তৈরি করা হচ্ছে...";
    explanationContainerDiv.style.opacity = "1";

    let newAccumulatedExplanationHtml = "";
    const correctAnswersMap = extractCorrectAnswers(questionData.explanation);
    console.log("BTN_REGEN_EXPLAIN: correctAnswersMap for regeneration:", JSON.parse(JSON.stringify(correctAnswersMap)));


    const explanationPromises = [];

    for (const blankId of questionData.blankIds) {
        const answerInBlank = questionData.userAnswers[blankId];
        const isMarkedCorrect = questionData.correctnessPerBlank[blankId];
        const wasInitiallyEmptyAndAiFilled = !!(questionData.aiFilledBlanks && questionData.aiFilledBlanks[blankId]);
        const actualCorrectAnswerForExplanation = (correctAnswersMap[blankId] && correctAnswersMap[blankId][0]) || answerInBlank;
        console.log(`BTN_REGEN_EXPLAIN - BLANK ${blankId}: answerInBlank: "${answerInBlank}", isMarkedCorrect: ${isMarkedCorrect}, wasInitiallyEmptyAndAiFilled: ${wasInitiallyEmptyAndAiFilled}, actualCorrectAnswerForExplanation: "${actualCorrectAnswerForExplanation}"`);


         explanationPromises.push(
            aiGenerateExplanationForBlank(questionData, blankId, answerInBlank, isMarkedCorrect, actualCorrectAnswerForExplanation, wasInitiallyEmptyAndAiFilled)
                .then(result => {
                    console.log(`BTN_REGEN_EXPLAIN - BLANK ${blankId}: aiGenerateExplanationForBlank result:`, JSON.parse(JSON.stringify(result)));
                    newAccumulatedExplanationHtml += result.explanation_html;
                    newAccumulatedExplanationHtml += "<hr style='margin-top: 5px; margin-bottom: 10px; border-color: #eee;'/>";
                })
                .catch(err => {
                    console.error(`BTN_REGEN_EXPLAIN - BLANK ${blankId}: aiGenerateExplanationForBlank ERROR:`, err);
                    newAccumulatedExplanationHtml += `<p style="color:red;">(${blankId}) এর জন্য ব্যাখ্যা পুনরায় তৈরি করতে সমস্যা হয়েছে।</p><hr style='margin-top: 5px; margin-bottom: 10px; border-color: #eee;'/>`;
                })
        );
    }

    await Promise.all(explanationPromises);
    console.log("BTN_REGEN_EXPLAIN: All regeneration promises resolved.");

    questionData.finalExplanationHtml = newAccumulatedExplanationHtml.endsWith("<hr style='margin-top: 5px; margin-bottom: 10px; border-color: #eee;'/>")
                                      ? newAccumulatedExplanationHtml.slice(0, -1 * ("<hr style='margin-top: 5px; margin-bottom: 10px; border-color: #eee;'/>".length))
                                      : newAccumulatedExplanationHtml;
    console.log("BTN_REGEN_EXPLAIN: New finalExplanationHtml:", questionData.finalExplanationHtml);


    if (explanationContentDiv) {
        if (questionData.finalExplanationHtml) {
            await typeHtmlContent(explanationContentDiv, questionData.finalExplanationHtml, 20);
            try {
                if (window.MathJax?.Hub) MathJax.Hub.Queue(["Typeset", MathJax.Hub, explanationContentDiv]);
                else if (window.MathJax?.typesetPromise) window.MathJax.typesetPromise([explanationContentDiv]);
            } catch (error) { console.error("REGEN_EXPLAIN: Error rendering MathJax:", error); }
        } else {
            explanationContentDiv.innerHTML = "<p>কোনো ব্যাখ্যা তৈরি করা যায়নি।</p>";
        }
    }

    if (previousButton) previousButton.disabled = (currentQuestion === 0);
    if (stopButton) stopButton.disabled = false;
    if (nextButton) nextButton.disabled = (currentQuestion === shuffledQuestions.length - 1 && findNextUnansweredQuestion() === -1);
    if (recheckButtonElement) recheckButtonElement.disabled = false;
    if (regenerateExplanationButtonElement) regenerateExplanationButtonElement.disabled = false;
    console.log("BTN_REGEN_EXPLAIN: Buttons re-enabled.");
}


// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
  console.log("INIT: DOMContentLoaded event fired.");
  startScreenHeading = document.getElementById("start-screen-heading");
  startScreen = document.querySelector(".start-screen");
  quizScreen = document.querySelector(".quiz");
  endScreen = document.querySelector(".end-screen");
  questionElement = document.querySelector(".question");
  answerWrapperElement = document.querySelector(".answer-wrapper");
  scoreElement = document.querySelector(".final-score");
  totalScoreElement = document.querySelector(".total-score");
  progressText = document.querySelector(".progress-text");
  timer = document.querySelector(".timer");
  previousButton = document.querySelector(".previous");
  stopButton = document.querySelector(".stop");
  pauseButton = document.querySelector(".pause");
  errorMessage = document.querySelector(".error-message");
  startButton = document.querySelector(".start");
  quizHeading = document.querySelector(".quiz-heading");
  numberProgressContainer = document.querySelector(".number-progress");
  questionContainer = document.querySelector(".question-container");
  questionLimitInput = document.getElementById("question-limit");
  timeLimitInput = document.getElementById("time-limit");

  recheckButtonElement = document.querySelector(".recheck");
  regenerateExplanationButtonElement = document.querySelector(".regenerate-explanation");

  apiKeyModal = document.getElementById("apiKeyModal");
  apiKeyInput = document.getElementById("api-key-input");
  modelSelect = document.getElementById("model-select");
  modalSubmitButton = document.getElementById("modal-submit-button");
  closeModalButton = document.getElementById("closeModalButton");
  modalErrorMessage = document.getElementById("modal-error-message");

  if (quizScreen) quizScreen.classList.add("hide");
  if (endScreen) endScreen.classList.add("hide");
  if (startScreen) startScreen.classList.add("hide");
  if (pauseButton) pauseButton.classList.add("hide");
  if (errorMessage) errorMessage.classList.add("hide");
  if (recheckButtonElement) recheckButtonElement.classList.add("hide");
  if (regenerateExplanationButtonElement) regenerateExplanationButtonElement.classList.add("hide");
  console.log("INIT: DOM elements cached and initial UI state set.");


  nextButton = document.querySelector(".next");
  if (nextButton) nextButton.disabled = false;
  if (startButton) startButton.disabled = true; // Will be enabled by validateInputs if appropriate

  if (startButton) startButton.addEventListener("click", startQuiz);
  if (modalSubmitButton) modalSubmitButton.addEventListener("click", handleModalSubmit);
  if (closeModalButton) closeModalButton.addEventListener("click", hideApiKeyModal);
  if (apiKeyInput) {
      apiKeyInput.addEventListener("input", () => {
          clearTimeout(fetchModelsTimeout);
          hideError(true);
          const currentKey = apiKeyInput.value.trim();
          if (currentKey.length > 0) {
              fetchModelsTimeout = setTimeout(() => fetchAvailableModels(currentKey), 500);
          } else {
              modelSelect.innerHTML = '<option value="">API Key লিখুন মডেল লোড করতে...</option>';
              modelSelect.disabled = true;
              modalSubmitButton.disabled = true;
          }
      });
  }
  if (modelSelect) modelSelect.addEventListener("change", () => hideError(true));

  if (nextButton) {
    nextButton.addEventListener("click", async () => {
        console.log("BTN_NEXT: Clicked.");
        const questionData = shuffledQuestions[currentQuestion];
        if (!questionData) { console.error("BTN_NEXT: No questionData for currentQuestion:", currentQuestion); return; }
        console.log("BTN_NEXT: isRecheckModeActive:", isRecheckModeActive, "Answered:", questionData.answered, "Text:", nextButton.textContent);

        if (isRecheckModeActive || !questionData.answered) {
            console.log("BTN_NEXT: Calling checkCurrentQuestionAnswers (recheck or first check).");
            await checkCurrentQuestionAnswers();
        } else {
            console.log("BTN_NEXT: Standard Next navigation for answered question.");
            clearTimeout(autoNextTimeout);
            clearInterval(typingInterval);
            typingInterval = null;
            if (pauseButton) pauseButton.classList.add("hide");
            if (isPaused) { isPaused = false; startTimer(); }

            const nextUnansweredIndex = findNextUnansweredQuestion();
            if (nextUnansweredIndex !== -1) {
                currentQuestion = nextUnansweredIndex;
                displayQuestion();
            } else {
                if (currentQuestion < shuffledQuestions.length - 1) {
                    currentQuestion++;
                    displayQuestion();
                } else {
                    console.log("BTN_NEXT: All questions answered or viewed. Ending quiz.");
                    endQuiz();
                }
            }
        }
    });
  } else console.error("INIT: Next button not found!");

  if (previousButton) previousButton.addEventListener("click", previousQuestion);
  if (stopButton) stopButton.addEventListener("click", stopQuiz);
  if (pauseButton) pauseButton.addEventListener("click", handlePauseButtonClick);

  if (recheckButtonElement) recheckButtonElement.addEventListener("click", handleRecheckButtonClick);
  if (regenerateExplanationButtonElement) regenerateExplanationButtonElement.addEventListener("click", handleRegenerateExplanationClick);


  const restartButton = document.querySelector(".restart");
  if (restartButton) restartButton.addEventListener("click", restartQuiz);

  if (questionLimitInput) {
    questionLimitInput.addEventListener("input", validateInputs);
    restrictToNumbers(questionLimitInput);
  }
  if (timeLimitInput) {
    timeLimitInput.addEventListener("input", validateInputs);
    restrictToNumbers(timeLimitInput);
  }
  console.log("INIT: Event listeners added.");

  if (window.parent && window.parent !== window) {
    console.log("INIT: Posting 'quizReady' message to parent.");
    window.parent.postMessage({ type: 'quizReady' }, '*');
  }
  addHighlightCSS();
  console.log("INIT: DOMContentLoaded complete.");
});

async function clearQuestionHistory() {
  console.log("HISTORY_CLEAR: clearQuestionHistory called");
  try {
    await saveQuestionHistoryToDB({});
    questionHistory = {};
    if (data && data.sections) {
      data.sections.forEach((section) => {
        if (section?.sectionname) questionHistory[section.sectionname] = {};
      });
    }
    console.log("HISTORY_CLEAR: Question history cleared locally and in DB.");
    displayError("Question history has been cleared.");
    setTimeout(() => { if(errorMessage) hideError(); }, 3000);
  } catch (error) {
    console.error("HISTORY_CLEAR: Error clearing question history:", error);
    displayError("Could not clear question history.");
  }
}