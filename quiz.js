/* quiz.js */
// --- Global Variables ---
// State Management
let questions = [], // Holds questions for the *current* subject after loading
  currentQuestion = 0, // Index of the currently displayed question in shuffledQuestions
  score = 0, // User's score for the current quiz session
  timeRemaining = 0, // Time left in seconds
  timerInterval, // Interval ID for the main quiz timer
  selectedAnswer = null, // Potentially obsolete - state tracked in shuffledQuestions
  questionLimit = 30, // Default, updated from input, max number of questions for the quiz
  typingInterval, // Interval ID for the deprecated typeText effect
  autoNextTimeout, // Timeout ID for automatically moving to the next question
  shuffledQuestions = [], // Array of questions selected and shuffled for the current quiz instance
  data = null, // Holds the entire fetched questions data (all subjects/sections)
  selectedLesson = "সকল পাঠ", // Tracks selected lesson/filter ('সকল পাঠ' is "All Lessons")
  isPaused = false, // Tracks pause state, primarily for the explanation delay/pause button
  subjectName, // Name of the current subject being quizzed
  questionHistory = {}; // In-memory cache of question history loaded from/saved to IndexedDB

// DOM Element References (initialized in DOMContentLoaded)
let startScreenHeading = null,
  startScreen = null,
  quizScreen = null,
  endScreen = null,
  questionElement = null,
  answerWrapperElement = null,
  nextButton = null,
  scoreElement = null,
  totalScoreElement = null,
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
  timeLimitInput = null,
  quizLessonDropdown = null,
  lessonDropdownMenu = null; // The container div for the lesson dropdown label and select

// IndexedDB setup
const dbName = "quizHistoryDB";
const storeName = "questionHistoryStore";
let db; // Holds the IndexedDB database connection

// --- IndexedDB Functions ---
/**
 * Opens (or creates) the IndexedDB database.
 * @returns {Promise<IDBDatabase>} A promise that resolves with the database connection.
 */
function openDatabase() {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }
    const request = indexedDB.open(dbName, 1); // Version 1

    request.onerror = (event) => {
      console.error("IndexedDB error:", event.target.error);
      reject(`IndexedDB failed to open: ${event.target.errorCode}`);
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      console.log("IndexedDB opened successfully.");
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      console.log("IndexedDB upgrade needed.");
      const db = event.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName); // Simple key-value store using "questionHistory" as the key
        console.log(`Object store '${storeName}' created.`);
      }
    };
  });
}

/**
 * Retrieves the entire question history object from IndexedDB.
 * @returns {Promise<object>} A promise that resolves with the history object, or an empty object if none exists or an error occurs.
 */
async function getQuestionHistoryFromDB() {
  try {
    await openDatabase();
    return new Promise((resolve, reject) => {
      if (!db) {
        console.error("getQuestionHistoryFromDB: Database connection not available.");
        resolve({}); // Resolve with empty object if DB connection failed
        return;
      }
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      // Using a single known key "questionHistory" to store the entire history object
      const request = store.get("questionHistory");

      request.onerror = (event) => {
        console.error("Error getting question history from IndexedDB:", event.target.error);
        reject(event.target.error); // Reject the promise on error
      };

      request.onsuccess = (event) => {
        console.log("Question history retrieved from IndexedDB.");
        resolve(event.target.result || {}); // Return empty object if no history found
      };
    });
  } catch (error) {
      console.error("Failed to open database for reading history:", error);
      return {}; // Return empty object on failure to open DB
  }
}

/**
 * Saves the entire question history object to IndexedDB.
 * @param {object} history The question history object to save.
 * @returns {Promise<void>} A promise that resolves when saving is complete, or rejects on error.
 */
async function saveQuestionHistoryToDB(history) {
    try {
        await openDatabase();
        return new Promise((resolve, reject) => {
            if (!db) {
                console.error("saveQuestionHistoryToDB: Database connection not available.");
                reject("Database connection not available."); // Reject promise if DB connection failed
                return;
            }
            const transaction = db.transaction(storeName, "readwrite");
            const store = transaction.objectStore(storeName);
            // Using a single known key "questionHistory" to store the entire history object
            const request = store.put(history, "questionHistory");

            request.onerror = (event) => {
                console.error("Error saving question history to IndexedDB:", event.target.error);
                reject(event.target.error); // Reject the promise on error
            };

            request.onsuccess = () => {
                console.log("Question history saved to IndexedDB.");
                resolve(); // Resolve the promise on success
            };
        });
    } catch (error) {
        console.error("Failed to open database for saving history:", error);
        return Promise.reject(error); // Reject the promise on failure to open DB
    }
}

// --- Utility Functions ---
/**
 * Removes HTML tags from a string.
 * @param {string} html The HTML string.
 * @returns {string} The text content without HTML tags.
 */
function stripHTML(html) {
  let temp = document.createElement("div");
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || "";
}

/**
 * Checks if a string contains an image marker like (image/...) or an <img> tag.
 * @param {string} text The text to check.
 * @returns {boolean} True if an image marker or tag is found.
 */
function containsImageMarker(text) {
  if (typeof text !== 'string' || !text) {
    return false;
  }
  const imageRegex = /(\(image\/[^\)]+\))|<img\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/i;
  return imageRegex.test(text);
}

/**
 * Checks if a string contains an <svg> tag.
 * @param {string} text The text to check.
 * @returns {boolean} True if an <svg> tag is found.
 */
function containsSVGMarker(text) {
  if (typeof text !== 'string' || !text) {
    return false;
  }
  const svgRegex = /<svg[\s>]/i;
  return svgRegex.test(text);
}

/**
 * Converts newline characters (\n) to HTML <br> tags.
 * @param {string} text The text to convert.
 * @returns {string} The text with newlines replaced by <br>.
 */
function convertNewlinesToHtml(text) {
  if (typeof text !== "string") {
    return "";
  }
  return text.replace(/\n/g, "<br>");
}

/**
 * Shuffles an array in place using the Fisher-Yates (Knuth) algorithm.
 * @param {Array<any>} array The array to shuffle.
 * @returns {Array<any>} The shuffled array.
 */
function shuffleArray(array) {
  const shuffled = [...array]; // Create a shallow copy
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Attaches event listeners to an input element to restrict input to numbers only.
 * @param {HTMLInputElement} inputElement The input element.
 */
function restrictToNumbers(inputElement) {
  if (!inputElement) return;
  inputElement.addEventListener("input", function () {
    this.value = this.value.replace(/[^0-9]/g, ""); // Allow only digits
  });

  inputElement.addEventListener("paste", function (event) {
    let pasteData = (event.clipboardData || window.clipboardData)?.getData("text");
    if (pasteData && /[^0-9]/.test(pasteData)) {
      event.preventDefault();
    }
  });
}

// --- Core Application Logic ---

/**
 * Loads the main question data from the global `questionsData` variable.
 * Initializes the structure for question history if not already present.
 * @returns {Promise<object|null>} The loaded data object or null on failure.
 */
async function loadQuestionData() {
  if (typeof questionsData === "undefined") {
    console.error("Global 'questionsData' is not defined.");
    displayError("Failed to load question data. Please ensure data source is available.");
    return null;
  }
  if (!questionsData || typeof questionsData !== 'object' || !Array.isArray(questionsData.sections)) {
    console.error("Invalid 'questionsData' structure. Expected { sections: [...] }.", questionsData);
    displayError("Invalid question data format.");
    return null;
  }

  console.log("Question data structure appears valid.");
  // Ensure history object has keys for each section defined in the data
  questionsData.sections.forEach((section) => {
      if (section && section.section && !questionHistory[section.section]) {
          questionHistory[section.section] = {}; // Initialize history for the subject
      }
  });
  return questionsData;
}

/**
 * Loads the question history from IndexedDB into the global `questionHistory` variable.
 */
async function loadQuestionHistory() {
  try {
    const loadedHistory = await getQuestionHistoryFromDB();
    if (typeof loadedHistory === "object" && loadedHistory !== null) {
        questionHistory = loadedHistory;
        console.log("Question history loaded successfully from IndexedDB.");
    } else {
        console.warn("Invalid history data loaded from DB, resetting to empty object.");
        questionHistory = {};
    }
  } catch (error) {
    console.error("Error loading question history:", error);
    questionHistory = {}; // Initialize to empty object on error
    displayError("Error loading question history. Progress tracking might be affected.");
  }
}

/**
 * Saves the current state of the global `questionHistory` variable to IndexedDB.
 */
async function saveQuestionHistory() {
  try {
    await saveQuestionHistoryToDB(questionHistory);
    console.log("Attempted to save question history to IndexedDB.");
  } catch (error) {
    console.error("Error saving question history:", error);
    // Optionally inform user, but might be too noisy
    // displayError("Could not save quiz progress.");
  }
}

/**
 * Displays an error message in the designated error message element.
 * @param {string} message The error message to display.
 */
function displayError(message) {
  if (errorMessage) {
    errorMessage.textContent = message;
    errorMessage.classList.remove("hide");
    errorMessage.style.opacity = 1;
    console.error("Displayed Error:", message);
  } else {
    console.error("Error Message Element not found! Message:", message);
    alert(`Error: ${message}`); // Fallback
  }
}

/**
 * Hides the error message element.
 */
function hideError() {
    if (errorMessage && !errorMessage.classList.contains("hide")) {
        errorMessage.textContent = "";
        errorMessage.style.opacity = 0;
        errorMessage.classList.add("hide");
    }
}


/**
 * Validates the question limit and time limit inputs on the start screen.
 * Enables/disables the start button based on validity.
 * Displays specific error messages.
 * @returns {boolean} True if inputs are valid, false otherwise.
 */
function validateInputs() {
  if (!questionLimitInput || !timeLimitInput || !startButton || !errorMessage) {
    console.warn("Input elements not ready for validation.");
    return false;
  }

  if (errorMessage && !errorMessage.textContent.includes("No questions available")) {
     hideError();
  }

  const questionLimitValue = parseInt(questionLimitInput.value);
  const timeLimitValue = parseInt(timeLimitInput.value);
  const maxQuestions = parseInt(questionLimitInput.max);
  const minQuestions = parseInt(questionLimitInput.min);

  let errorMsg = "";
  let isValid = true;

  if (isNaN(questionLimitValue) || questionLimitValue <= 0) {
    errorMsg = "Please enter a valid number of questions (must be > 0).";
    isValid = false;
  } else if (isNaN(timeLimitValue) || timeLimitValue <= 0) {
    errorMsg = "Please enter a valid time limit in minutes (must be > 0).";
    isValid = false;
  } else if (!isNaN(minQuestions) && (questionLimitValue < minQuestions || timeLimitValue < minQuestions)) {
    errorMsg = `Number of questions and time limit must be at least ${minQuestions}.`;
    isValid = false;
  } else if (!isNaN(maxQuestions) && maxQuestions > 0 && (questionLimitValue > maxQuestions || timeLimitValue > maxQuestions)) {
    errorMsg = `Number of questions and time limit cannot exceed the ${maxQuestions} available for this filter.`;
    isValid = false;
  } else if (isNaN(maxQuestions) || maxQuestions <= 0){
      // This case implies no questions are available for the filter
      isValid = false; // Keep start button disabled
      // Error message should be handled by updateMinLimitsForLesson
  }

  startButton.disabled = !isValid;

  if (!isValid && errorMsg) {
    displayError(errorMsg);
  } else if (isValid && errorMessage && errorMessage.textContent && !errorMessage.textContent.includes("No questions available")) {
      hideError();
  }

  return isValid;
}

// --- Populating UI Elements ---

/**
 * Populates the lesson selection dropdown based on available questions,
 * lessons, images, and SVGs for the current subject.
 * Hides the dropdown if no relevant filtering options exist.
 * @param {string} subjectName The name of the current subject.
 */
function populateLessonDropdown(subjectName) {
  if (!quizLessonDropdown || !lessonDropdownMenu || !data || !data.sections) {
    console.warn("Cannot populate lesson dropdown: Elements or data not ready.");
    if (lessonDropdownMenu) lessonDropdownMenu.classList.add("hide");
    if (quizLessonDropdown) quizLessonDropdown.disabled = true;
    return;
  }

  const lessonDropdown = quizLessonDropdown;
  lessonDropdown.innerHTML = ""; // Clear previous options

  const section = data.sections.find((s) => s.section === subjectName);

  // Scan questions for characteristics
  let hasAnyImage = false;
  let hasAnySVG = false;
  let hasAnyLessons = false;
  let hasAnyQuestions = false;
  const uniqueLessons = new Set();

  if (section?.questions?.length > 0) {
    hasAnyQuestions = true;
    section.questions.forEach((q) => {
      if (!q) return;

      // Check images
      if (!hasAnyImage) {
        hasAnyImage = containsImageMarker(q.question) ||
                      q.options?.some(opt => {
                          const key = Object.keys(opt || {})[0];
                          return key && containsImageMarker(key);
                      });
      }
      // Check SVG
      if (!hasAnySVG) {
        hasAnySVG = containsSVGMarker(q.question) ||
                    q.options?.some(opt => {
                        const key = Object.keys(opt || {})[0];
                        return key && containsSVGMarker(key);
                    });
      }
      // Check lessons
      if (q.lesson && typeof q.lesson === "string" && q.lesson.trim()) {
        hasAnyLessons = true;
        uniqueLessons.add(q.lesson.trim());
      }
    });
  }

  // Determine Dropdown Visibility and Options
  const shouldShowDropdown = hasAnyQuestions && (hasAnyImage || hasAnySVG || hasAnyLessons);

  if (shouldShowDropdown) {
    lessonDropdownMenu.classList.remove("hide");
    lessonDropdown.disabled = false;

    lessonDropdown.options.add(new Option("সকল পাঠ", "সকল পাঠ")); // "All Lessons"
    if (hasAnyImage) lessonDropdown.options.add(new Option("শুধুমাত্র ছবিযুক্ত প্রশ্ন", "image_questions_only")); // "Image Questions Only"
    if (hasAnySVG) lessonDropdown.options.add(new Option("শুধুমাত্র SVG প্রশ্ন", "svg_questions_only")); // "SVG Questions Only"
    if (hasAnyLessons) {
      Array.from(uniqueLessons).sort().forEach(lesson => lessonDropdown.options.add(new Option(lesson, lesson)));
    }
    console.log(`Lesson dropdown populated for ${subjectName}. Images: ${hasAnyImage}, SVG: ${hasAnySVG}, Lessons: ${hasAnyLessons}`);
  } else {
    lessonDropdownMenu.classList.add("hide");
    lessonDropdown.disabled = true;
    selectedLesson = "সকল পাঠ"; // Default if hidden
    console.log(`Lesson dropdown hidden for ${subjectName}. Questions: ${hasAnyQuestions}, Images: ${hasAnyImage}, SVG: ${hasAnySVG}, Lessons: ${hasAnyLessons}`);
  }

  lessonDropdown.value = "সকল পাঠ";
  selectedLesson = "সকল পাঠ";
}

/**
 * Updates the min/max attributes and values of the question/time limit inputs
 * based on the number of questions available for the currently selected lesson/filter.
 */
function updateMinLimitsForLesson() {
  if (!questionLimitInput || !timeLimitInput || !quizLessonDropdown || !questions) {
    console.warn("Cannot update limits: Elements or questions data not ready.");
    if (questionLimitInput) { questionLimitInput.min = 1; questionLimitInput.max = 1; questionLimitInput.value = 1; }
    if (timeLimitInput) { timeLimitInput.min = 1; timeLimitInput.max = 1; timeLimitInput.value = 1; }
    validateInputs();
    return;
  }

  const lessonFilter = quizLessonDropdown.disabled ? "সকল পাঠ" : quizLessonDropdown.value;
  let filterText = "selected filter";
   if (!quizLessonDropdown.disabled && quizLessonDropdown.selectedIndex >= 0) {
       filterText = `"${quizLessonDropdown.options[quizLessonDropdown.selectedIndex].text}"`;
   } else if (lessonFilter === "সকল পাঠ"){
       filterText = '"সকল পাঠ"';
   }

  // Filter questions based on the selected criteria
  let filteredQuestions = [];
  if (Array.isArray(questions)) {
      if (lessonFilter === "image_questions_only") {
          filteredQuestions = questions.filter(q => q && (containsImageMarker(q.question) || q.options?.some(opt => { const key = Object.keys(opt || {})[0]; return key && containsImageMarker(key); })));
      } else if (lessonFilter === "svg_questions_only") {
          filteredQuestions = questions.filter(q => q && (containsSVGMarker(q.question) || q.options?.some(opt => { const key = Object.keys(opt || {})[0]; return key && containsSVGMarker(key); })));
      } else if (lessonFilter !== "সকল পাঠ") {
          filteredQuestions = questions.filter(q => q?.lesson === lessonFilter);
      } else {
          filteredQuestions = questions.filter(q => q); // Filter out null/undefined
      }
  } else {
      console.error("Global 'questions' variable is not an array or not set.");
  }

  const availableCount = filteredQuestions.length;
  let newMinLimit = 1;
  let newMaxLimit = Math.max(1, availableCount);

  if (availableCount === 0) {
      displayError(`No questions available for the ${filterText}.`);
      newMinLimit = 1;
      newMaxLimit = 1;
  } else {
      if (availableCount >= 30) newMinLimit = 30;
      else if (availableCount >= 10) newMinLimit = 10;
      else newMinLimit = 1;
      newMinLimit = Math.min(newMinLimit, newMaxLimit); // Ensure min <= max
      if (errorMessage && errorMessage.textContent.includes("No questions available")) {
          hideError();
      }
  }

  questionLimitInput.min = newMinLimit;
  timeLimitInput.min = newMinLimit;
  questionLimitInput.max = newMaxLimit;
  timeLimitInput.max = newMaxLimit;

  const currentQVal = parseInt(questionLimitInput.value) || newMinLimit;
  const currentTVal = parseInt(timeLimitInput.value) || newMinLimit;

  questionLimitInput.value = Math.min(Math.max(currentQVal, newMinLimit), newMaxLimit);
  timeLimitInput.value = Math.min(Math.max(currentTVal, newMinLimit), newMaxLimit);

  validateInputs(); // Re-validate after updating limits/values
}


// --- Quiz Lifecycle Functions ---

/**
 * Starts the quiz after validating inputs and selecting questions.
 * Transitions the UI from the start screen to the quiz screen.
 */
async function startQuiz() {
  console.log("Attempting to start quiz...");
  const requiredElements = [questionLimitInput, timeLimitInput, quizLessonDropdown, startButton, startScreen, quizScreen, quizHeading, lessonDropdownMenu, errorMessage];
  if (requiredElements.some(el => !el)) {
      console.error("Required elements not ready to start quiz. Aborting.");
      displayError("Initialization error. Please refresh the page.");
      return;
  }

  if (!validateInputs()) {
      console.log("Start button disabled due to validation errors. Aborting startQuiz.");
      return;
  }

  // Setup Quiz State
  questionLimit = parseInt(questionLimitInput.value);
  timeRemaining = parseInt(timeLimitInput.value) * 60;
  currentQuestion = 0;
  score = 0;
  shuffledQuestions = [];
  isPaused = false;

  // Determine effective lesson filter
  if (quizLessonDropdown.disabled || lessonDropdownMenu.classList.contains('hide')) {
      selectedLesson = "সকল পাঠ";
      console.log("Dropdown disabled/hidden, forcing selectedLesson to 'সকল পাঠ'");
  } else {
      selectedLesson = quizLessonDropdown.value;
      console.log("Using dropdown value for selectedLesson:", selectedLesson);
  }

  // Load and Filter Questions
  if (!data || !subjectName) {
      console.error("Quiz data or subject name not available. Cannot start quiz.");
      displayError("Quiz data failed to load or subject missing. Please refresh.");
      return;
  }
  const section = data.sections.find((s) => s.section === subjectName);
  if (!section?.questions) {
      console.error("Subject section or questions not found for:", subjectName);
      displayError("Subject data not found. Please select a subject again.");
      return;
  }

  let baseQuestions = section.questions.filter(q => q); // Filter out invalid entries
  let filteredQuestions = [];
  let currentFilterText = "selected filter";
  if (!quizLessonDropdown.disabled && quizLessonDropdown.selectedIndex >= 0) {
       currentFilterText = `"${quizLessonDropdown.options[quizLessonDropdown.selectedIndex].text}"`;
   } else if (selectedLesson === "সকল পাঠ"){
       currentFilterText = '"সকল পাঠ"';
   }

  // Apply filter
  if (selectedLesson === "image_questions_only") {
    filteredQuestions = baseQuestions.filter(q => containsImageMarker(q.question) || q.options?.some(opt => { const key = Object.keys(opt || {})[0]; return key && containsImageMarker(key); }));
  } else if (selectedLesson === "svg_questions_only") {
    filteredQuestions = baseQuestions.filter(q => containsSVGMarker(q.question) || q.options?.some(opt => { const key = Object.keys(opt || {})[0]; return key && containsSVGMarker(key); }));
  } else if (selectedLesson !== "সকল পাঠ") {
    filteredQuestions = baseQuestions.filter(q => q.lesson === selectedLesson);
  } else {
    filteredQuestions = baseQuestions;
  }

  if (filteredQuestions.length === 0) {
      displayError(`No questions available for the ${currentFilterText}. Please change the filter or subject.`);
      if(startButton) startButton.disabled = true;
      return;
  }

  // Adjust question limit if needed
  let actualLimit = questionLimit; // Use a local variable for the adjusted limit
  if (questionLimit > filteredQuestions.length) {
      console.warn(`Requested ${questionLimit} questions, but only ${filteredQuestions.length} available for ${currentFilterText}. Adjusting limit.`);
      actualLimit = filteredQuestions.length; // Adjust the limit for this session
      questionLimitInput.value = actualLimit; // Update input display

      if (parseInt(timeLimitInput.value) > actualLimit) {
          timeLimitInput.value = actualLimit;
          timeRemaining = actualLimit * 60;
          console.warn(`Time limit also adjusted to ${actualLimit} minutes.`);
      }
      validateInputs(); // Re-validate after adjusting limits
  }

  // Select Questions (using history and the potentially adjusted limit)
  try {
      shuffledQuestions = await selectQuestions(filteredQuestions, actualLimit, subjectName, selectedLesson);
      console.log(`DEBUG: startQuiz - Assigned shuffledQuestions. Length: ${shuffledQuestions.length}, Expected Limit (after adjustment): ${actualLimit}`);
  } catch (error) {
      console.error("Error during question selection:", error);
      displayError("An error occurred while selecting questions.");
      return;
  }

  if (shuffledQuestions.length === 0) {
      displayError("Could not select any questions for the quiz. Please try again or change filters.");
      return;
  }

  // Initialize question state
  shuffledQuestions.forEach(q => { if (q) q.answered = false; });

  // Transition to Quiz Screen
  startScreen.classList.add("hide");
  quizScreen.classList.remove("hide");
  endScreen.classList.add("hide");
  hideError();

  if (quizHeading) quizHeading.textContent = subjectName;

  // Start Quiz
  displayQuestion();
  startTimer();
  showQuiz();
  console.log(`Quiz started with ${shuffledQuestions.length} questions. Filter: ${selectedLesson}. Time: ${timeRemaining/60} mins.`);
}


/**
 * Selects questions for the quiz based on the filter, limit, and user's history.
 * Prioritizes unseen questions and handles history reset when all questions for a filter are seen.
 * Saves the updated history to IndexedDB.
 * @param {Array<object>} allFilteredQuestions Questions already filtered by lesson/type.
 * @param {number} limit The maximum number of questions to select.
 * @param {string} subject The current subject name.
 * @param {string} lessonOrFilter The selected filter ('সকল পাঠ', 'image_questions_only', 'svg_questions_only', or specific lesson name).
 * @returns {Promise<Array<object>>} A promise resolving with the array of selected and shuffled questions.
 */
async function selectQuestions(allFilteredQuestions, limit, subject, lessonOrFilter) {
    // Generate a unique history key for this subject/filter combination
    let historyKey;
    if (lessonOrFilter === "image_questions_only") historyKey = `${subject}-images_only`;
    else if (lessonOrFilter === "svg_questions_only") historyKey = `${subject}-svg_only`;
    else if (lessonOrFilter === "সকল পাঠ") historyKey = `${subject}-all`;
    else historyKey = `${subject}-${lessonOrFilter}`; // Specific lesson name

    // Determine the actual number of questions to select (cannot exceed available)
    const actualLimit = Math.min(limit, allFilteredQuestions.length);
    if (limit > allFilteredQuestions.length) {
        console.warn(`Requested limit ${limit} exceeds available filtered questions ${allFilteredQuestions.length}. Using ${actualLimit}.`);
    }

    // Ensure history structure exists for this subject and filter
    if (!questionHistory[subject]) questionHistory[subject] = {};
    if (!questionHistory[subject][historyKey]) questionHistory[subject][historyKey] = [];

    const historyList = questionHistory[subject][historyKey]; // Array of seen question *texts*
    // Find questions from the filtered list that are *not* in the history
    let availableQuestions = allFilteredQuestions.filter(q => q?.question && !historyList.includes(q.question));
    let selectedQuestions = [];
    let historyWasReset = false; // Flag to track if history was reset during this selection

    // --- Selection Logic ---
    // Case 1: Not enough *new* questions available
    if (availableQuestions.length < actualLimit) {
        console.log(`Not enough new questions (${availableQuestions.length}) for filter '${historyKey}', need ${actualLimit}. Checking history.`);

        // Check if ALL questions for this filter have been seen previously
        if (
            availableQuestions.length === 0 && // No new questions left
            historyList.length >= allFilteredQuestions.length && // History contains at least as many as available
            allFilteredQuestions.length > 0 // And there are actually questions for this filter
        ) {
            console.log(`All ${allFilteredQuestions.length} questions for filter "${historyKey}" seen. Resetting history for this filter.`);
            questionHistory[subject][historyKey] = []; // Reset history list in memory
            historyList.length = 0; // Clear the local copy too (important!)
            availableQuestions = [...allFilteredQuestions]; // All questions are now considered "available" again
            historyWasReset = true; // Set the flag
        }

        // --- Sub-case: History was NOT reset ---
        if (!historyWasReset) {
            // Add all available *new* questions first
            selectedQuestions.push(...availableQuestions);
            // Add these new questions to the history list
            availableQuestions.forEach(q => {
                if (q?.question && !historyList.includes(q.question)) { // Double check not already added
                    historyList.push(q.question);
                }
            });

            // Calculate how many more questions are needed from the history
            const neededFromHistory = actualLimit - selectedQuestions.length;
            if (neededFromHistory > 0) {
                // Get questions that *are* in the history and *are* part of the current filtered set
                let historyCandidates = allFilteredQuestions.filter(q => q?.question && historyList.includes(q.question));
                historyCandidates = shuffleArray(historyCandidates); // Shuffle potential candidates from history

                // Add needed questions from shuffled history, avoiding duplicates already selected
                let addedFromHistory = 0;
                for (const histQ of historyCandidates) {
                    if (addedFromHistory >= neededFromHistory) break;
                    // Ensure we don't add a question already selected (e.g., if availableQuestions was empty)
                    if (!selectedQuestions.some(sq => sq.question === histQ.question)) {
                        selectedQuestions.push(histQ);
                        // NOTE: No need to add these back to historyList, they are already there.
                        addedFromHistory++;
                    }
                }
                console.log(`Added ${addedFromHistory} questions from history for filter '${historyKey}'.`);
            }
        // --- Sub-case: History WAS reset ---
        } else {
            // availableQuestions now holds ALL questions for the filter
            availableQuestions = shuffleArray(availableQuestions); // Shuffle them
            selectedQuestions = availableQuestions.slice(0, actualLimit); // Take only the required number (respecting the limit!)
            // Add these selected questions to the now-empty history list
            selectedQuestions.forEach(q => {
                if (q?.question) { // No need to check historyList inclusion as it's empty
                    historyList.push(q.question);
                }
            });
            console.log(`Selected ${selectedQuestions.length} questions after history reset for filter '${historyKey}'.`);
        }

    // Case 2: Enough *new* questions are available
    } else {
        availableQuestions = shuffleArray(availableQuestions);
        selectedQuestions = availableQuestions.slice(0, actualLimit); // Take the required number of new questions
        // Add these selected new questions to history
        selectedQuestions.forEach(q => {
            if (q?.question && !historyList.includes(q.question)) {
                historyList.push(q.question);
            }
        });
        console.log(`Selected ${selectedQuestions.length} new questions for filter '${historyKey}'.`);
    }

    // --- Safety check: Fill remaining slots if selection logic somehow failed (unlikely with current logic) ---
    while (selectedQuestions.length < actualLimit && allFilteredQuestions.length > selectedQuestions.length) {
        const remainingCandidates = allFilteredQuestions.filter(q => q && !selectedQuestions.some(sq => sq.question === q.question));
        if (remainingCandidates.length === 0) break; // Avoid infinite loop if no more unique questions exist
        const randomIndex = Math.floor(Math.random() * remainingCandidates.length);
        selectedQuestions.push(remainingCandidates[randomIndex]);
        // Also add to history if added via safety check
        if (remainingCandidates[randomIndex]?.question && !historyList.includes(remainingCandidates[randomIndex].question)) {
             historyList.push(remainingCandidates[randomIndex].question);
        }
        console.warn("Safety check: Had to add extra question(s) to meet limit - review selection logic.");
    }

    // --- Save the updated history (with newly added question texts) to IndexedDB ---
    // This happens asynchronously and doesn't block returning the questions.
    saveQuestionHistory();

    // --- Final shuffle of the selected questions list before returning ---
    return shuffleArray(selectedQuestions);
}


/**
 * Processes text to replace image markers `(image/...)` or HTML `<img>` tags
 * with standardized HTML `<img>` elements.
 * @param {string} text The input text.
 * @returns {string} The text with image markers/tags replaced by HTML elements.
 */
function processTextWithImages(text) {
  if (typeof text !== 'string') return "";

  const regex = /(\(image\/([^\)]+)\))|(<img\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*>)/gi;

  return text.replace(regex, (match, _inlineMarker, inlineFilename, _imgTag, imgSrcValue) => {
    let finalSrc = "";

    if (inlineFilename) {
        finalSrc = inlineFilename.toLowerCase().startsWith("image/") ? inlineFilename : `image/${inlineFilename}`;
    } else if (imgSrcValue) {
      finalSrc = imgSrcValue;
    } else {
      return match;
    }

    if (!finalSrc || typeof finalSrc !== 'string' || finalSrc.trim() === "") {
      console.warn("Invalid image source detected or extracted:", match);
      return match;
    }

    const altText = inlineFilename || imgSrcValue.split('/').pop() || "Image";
    return `<div><img src="${finalSrc}" alt="${altText}" style="max-width: 100%; height: auto; display: block; margin: 5px auto;" ondragstart="return false;"></div>`;
  });
}

/**
 * Clears the question and answer areas, resets answer wrapper opacity,
 * and clears any pending timeouts/intervals related to question display.
 */
function clearPreviousContent() {
  if (answerWrapperElement) answerWrapperElement.innerHTML = "";
  if (questionElement) questionElement.innerHTML = "";
  if (answerWrapperElement) answerWrapperElement.style.opacity = "0";
  clearTimeout(autoNextTimeout);
  clearInterval(typingInterval);
}

/**
 * Updates the "Question X of Y" counter display.
 */
function updateQuestionCounter() {
  const currentEl = numberProgressContainer?.querySelector(".current");
  const totalEl = numberProgressContainer?.querySelector(".total");
  if (currentEl) currentEl.textContent = currentQuestion + 1;
  if (totalEl) totalEl.textContent = shuffledQuestions.length; // Use actual length of selected questions
}

/**
 * Creates and appends the explanation block (if available) below the answers.
 * Processes the explanation text for images, newlines, and MathJax.
 * @param {object} questionData The data for the current question.
 * @param {HTMLElement} targetElement The element to append the explanation block to (usually answerWrapperElement).
 */
function addExplanationBlock(questionData, targetElement) {
  if (!questionData?.explanation?.trim() || !targetElement) {
    return;
  }
  if (targetElement.querySelector(".explanation-container")) return; // Prevent duplicates

  const explanationContainer = document.createElement("div");
  explanationContainer.className = "explanation-container";

  const explanationHeading = document.createElement("h4");
  explanationHeading.className = "explanation-heading";
  explanationHeading.innerHTML = `
      <span class="explanation-heading-text">Explanation</span>
      <img src="12arrow.png" alt="->" class="explanation-arrow-image">
    `;

  const explanationDiv = document.createElement("div");
  explanationDiv.className = "question-explanation";

  // Process explanation content
  let explanationContent = processTextWithImages(questionData.explanation);
  explanationContent = convertNewlinesToHtml(explanationContent);
  explanationContent = explanationContent.replace(
    /<span class="mathy">(.*?)<\/span>/g,
    (_match, p1) => `<span><script type="math/asciimath">${stripHTML(p1)}</script></span>`
  );
  explanationContent = explanationContent.replace(
    /<[^>]*class="mathy"[^>]*>(.*?)<\/[^>]*>/g,
    (_match, p1) => `<span><script type="math/asciimath">${stripHTML(p1)}</script></span>`
  );

  explanationDiv.innerHTML = explanationContent;

  explanationContainer.appendChild(explanationHeading);
  explanationContainer.appendChild(explanationDiv);
  targetElement.appendChild(explanationContainer);

  // Queue MathJax rendering
  try {
    if (window.MathJax?.Hub) {
      MathJax.Hub.Queue(["Typeset", MathJax.Hub, explanationDiv]);
    } else if (window.MathJax?.typesetPromise) {
         window.MathJax.typesetPromise([explanationDiv]);
    }
  } catch (error) {
    console.error("Error rendering MathJax for explanation:", error);
  }
}

/**
 * Displays the current question text and prepares the answer options.
 * Handles text processing for images, highlights, newlines, and MathJax.
 * Updates UI elements like the question counter and navigation buttons.
 */
function displayQuestion() {
  if (!questionElement || !answerWrapperElement || !previousButton || !nextButton || !pauseButton || !numberProgressContainer) {
    console.error("Required UI elements missing for displayQuestion. Stopping quiz.");
    displayError("UI Error. Please refresh.");
    stopQuiz();
    return;
  }
  if (currentQuestion < 0 || currentQuestion >= shuffledQuestions.length || !shuffledQuestions[currentQuestion]) {
    console.error("Invalid current question index or data:", currentQuestion, shuffledQuestions[currentQuestion]);
    displayError("Error loading question data.");
    stopQuiz();
    return;
  }

  const questionData = shuffledQuestions[currentQuestion];
  clearPreviousContent();
  pauseButton.classList.add("hide");

  // Prepare and Display Question Text
  let questionContent = processTextWithImages(questionData.question);
  questionContent = convertNewlinesToHtml(questionContent);
  questionContent = questionContent.replace(/'([^']+)'/g, `<span class="highlight">$1</span>`);
  questionContent = questionContent.replace(
    /<span class="mathy">(.*?)<\/span>/g,
    (_match, p1) => `<span><script type="math/asciimath">${stripHTML(p1)}</script></span>`
  );
  questionContent = questionContent.replace(
    /<[^>]*class="mathy"[^>]*>(.*?)<\/[^>]*>/g,
    (_match, p1) => `<span><script type="math/asciimath">${stripHTML(p1)}</script></span>`
  );

  questionElement.innerHTML = `<h5>${questionContent}</h5>`;

  // Queue MathJax rendering for the question
  try {
     if (window.MathJax?.Hub) {
         MathJax.Hub.Queue(["Typeset", MathJax.Hub, questionElement]);
     } else if (window.MathJax?.typesetPromise) {
         window.MathJax.typesetPromise([questionElement]);
     }
  } catch (error) {
    console.error("Error rendering MathJax for question:", error);
  }

  // Display answers
  displayAnswers(questionData);

  // Trigger answer fade-in animation
  answerWrapperElement.style.opacity = "1";

  // Update UI State
  updateQuestionCounter();
  previousButton.disabled = (currentQuestion === 0);
  nextButton.disabled = (questionData.answered && currentQuestion === shuffledQuestions.length - 1);

  addHighlightCSS(); // Ensure dynamic CSS is present
}


/**
 * Renders the answer options for the current question.
 * Handles displaying answered states (correct/wrong/disabled) or adding click listeners.
 * Processes option text for images, newlines, and MathJax.
 * @param {object} questionData The data for the current question.
 */
function displayAnswers(questionData) {
  if (!answerWrapperElement) return;
  answerWrapperElement.innerHTML = "";

  if (!questionData?.options || !Array.isArray(questionData.options)) {
    console.error("Invalid or missing options for question:", questionData);
    displayError("Error displaying answer options.");
    return;
  }

  questionData.options.forEach((option) => {
    if (typeof option !== 'object' || option === null || Object.keys(option).length !== 1) {
      console.warn("Skipping invalid option format:", option);
      return;
    }

    const optionText = Object.keys(option)[0];
    const isCorrect = option[optionText] === true;

    const answerButton = document.createElement("div");
    answerButton.classList.add("answer");
    if (isCorrect) {
      answerButton.classList.add("c"); // Hidden class to identify correct answer
    }

    // Prepare and Display Option Text
    let optionContent = processTextWithImages(optionText);
    optionContent = convertNewlinesToHtml(optionContent);
    optionContent = optionContent.replace(
        /<span class="mathy">(.*?)<\/span>/g,
        (_match, p1) => `<span><script type="math/asciimath">${stripHTML(p1)}</script></span>`
      );
    optionContent = optionContent.replace(
      /<[^>]*class="mathy"[^>]*>(.*?)<\/[^>]*>/g,
      (_match, p1) => `<span><script type="math/asciimath">${stripHTML(p1)}</script></span>`
    );

    answerButton.innerHTML = optionContent;

    // Handle Answer State
    if (questionData.answered) {
      answerButton.classList.add("disabled");
      if (isCorrect) {
        answerButton.classList.add("correct");
      } else if (optionText === questionData.selectedAnswer) {
        answerButton.classList.add("wrong");
      }
    } else {
      answerButton.addEventListener("click", () => selectAnswer(answerButton, option, questionData));
    }

    answerWrapperElement.appendChild(answerButton);
  });

  // If question was already answered (navigating back), show explanation
  if (questionData.answered) {
    addExplanationBlock(questionData, answerWrapperElement);
  }

  // Queue MathJax rendering for answers
  try {
      if (window.MathJax?.Hub) {
          MathJax.Hub.Queue(["Typeset", MathJax.Hub, answerWrapperElement]);
      } else if (window.MathJax?.typesetPromise) {
         window.MathJax.typesetPromise([answerWrapperElement]);
     }
  } catch (error) {
    console.error("Error rendering MathJax for answers:", error);
  }
}

/**
 * Handles the user clicking an answer option.
 * Marks the question as answered, updates score, styles buttons,
 * shows explanation (if any), and sets up auto-next or pause.
 * @param {HTMLElement} answerButton The clicked answer button element.
 * @param {object} selectedOption The option object corresponding to the clicked button.
 * @param {object} questionData The data for the current question.
 */
function selectAnswer(answerButton, selectedOption, questionData) {
    if (!questionData || questionData.answered || !answerWrapperElement || !nextButton || !pauseButton) {
        return; // Prevent re-answering or errors
    }

    clearTimeout(autoNextTimeout);

    const optionText = Object.keys(selectedOption)[0];
    const isCorrect = selectedOption[optionText] === true;

    // Mark question state
    questionData.answered = true;
    questionData.selectedAnswer = optionText;
    questionData.isCorrect = isCorrect;

    // Disable all answer buttons
    const allAnswers = answerWrapperElement.querySelectorAll(".answer");
    allAnswers.forEach(btn => btn.classList.add("disabled"));

    // Style selected and correct answers
    answerButton.classList.add("selected");
    if (isCorrect) {
        answerButton.classList.add("correct");
        score++;
        console.log(`Question ${currentQuestion + 1} Correct. Score: ${score}`);
    } else {
        answerButton.classList.add("wrong");
        const correctAnswerElement = answerWrapperElement.querySelector(".answer.c");
        if (correctAnswerElement) {
            correctAnswerElement.classList.add("correct");
        }
        console.log(`Question ${currentQuestion + 1} Incorrect.`);
    }

    // Enable next button (unless last question)
    nextButton.disabled = (currentQuestion === shuffledQuestions.length - 1);

    // Handle explanation and auto-next/pause
    if (questionData.explanation?.trim()) {
        addExplanationBlock(questionData, answerWrapperElement);
        pauseButton.classList.remove("hide");
        if (!isPaused) { // Only start timer if not already paused
             autoNextTimeout = setTimeout(nextQuestion, 3000);
        }
    } else {
         if (!isPaused) { // Only start timer if not already paused
            autoNextTimeout = setTimeout(nextQuestion, 500);
         }
    }
}


/**
 * Finds the index of the next unanswered question in the `shuffledQuestions` array,
 * wrapping around if necessary.
 * @returns {number} The index of the next unanswered question, or -1 if all are answered.
 */
function findNextUnansweredQuestion() {
  for (let i = currentQuestion + 1; i < shuffledQuestions.length; i++) {
    if (shuffledQuestions[i] && !shuffledQuestions[i].answered) return i;
  }
  for (let i = 0; i < currentQuestion; i++) {
    if (shuffledQuestions[i] && !shuffledQuestions[i].answered) return i;
  }
  return -1;
}

/**
 * Moves the quiz to the next unanswered question, or ends the quiz if none remain.
 * Resumes the timer if it was paused via the pause button.
 */
function nextQuestion() {
  if (!pauseButton || !quizScreen || !endScreen) return;

  clearTimeout(autoNextTimeout);
  pauseButton.classList.add("hide");

  if (isPaused) {
      console.log("Resuming from pause via Next button.");
      isPaused = false;
      startTimer(); // Resume timer countdown
  }

  const nextIndex = findNextUnansweredQuestion();
  if (nextIndex !== -1) {
      console.log(`Moving to next unanswered question: ${nextIndex + 1}`);
      currentQuestion = nextIndex;
      displayQuestion();
  } else {
      console.log("All questions answered. Ending quiz.");
      endQuiz();
  }
}

/**
 * Moves the quiz to the previous question. Allows reviewing answered questions.
 * Resumes the timer if it was paused via the pause button.
 */
function previousQuestion() {
    if (!pauseButton || !nextButton || currentQuestion <= 0) return;

    clearTimeout(autoNextTimeout);
    pauseButton.classList.add("hide");

    if (isPaused) {
        console.log("Resuming from pause via Previous button.");
        isPaused = false;
        startTimer(); // Resume timer countdown
    }

    console.log(`Moving to previous question: ${currentQuestion}`);
    currentQuestion--;
    displayQuestion();
    nextButton.disabled = false; // Ensure next is enabled when going back
}


/**
 * Stops the quiz immediately (e.g., via the Stop button).
 * Clears timers and transitions to the end screen.
 */
function stopQuiz() {
  console.log("Quiz stopped manually.");
  if (!quizScreen || !endScreen || !pauseButton) return;

  clearInterval(timerInterval);
  clearTimeout(autoNextTimeout);

  quizScreen.classList.add("hide");
  endScreen.classList.remove("hide");
  pauseButton.classList.add("hide");

  hideQuiz();
  calculateAndDisplayResults();
  if(nextButton) nextButton.disabled = false;
}

/**
 * Handles the natural end of the quiz (time runs out or all questions answered).
 * Clears timers and transitions to the end screen.
 */
function endQuiz() {
    console.log("Quiz ended.");
    if (!quizScreen || !endScreen || !pauseButton) return;

    clearInterval(timerInterval);
    clearTimeout(autoNextTimeout);

    quizScreen.classList.add("hide");
    endScreen.classList.remove("hide");
    pauseButton.classList.add("hide");

    hideQuiz();
    calculateAndDisplayResults();
}

/**
 * Calculates the final score and statistics based on the `shuffledQuestions` array
 * and displays them on the end screen.
 */
function calculateAndDisplayResults() {
    console.log(`DEBUG: calculateAndDisplayResults - Running. shuffledQuestions.length: ${shuffledQuestions.length}`);
    if (!scoreElement || !totalScoreElement || !endScreen) return;

    clearInterval(timerInterval); // Ensure timer is stopped

    let correctCount = 0;
    let wrongCount = 0;

    shuffledQuestions.forEach(q => {
        if (q?.answered) {
            if (q.isCorrect) correctCount++;
            else wrongCount++;
        }
    });

    const totalAttempted = correctCount + wrongCount;
    const notAnsweredCount = shuffledQuestions.length - totalAttempted;
    const totalQuestionsInQuiz = shuffledQuestions.length; // Use the actual number of questions in this quiz session

    // Get end screen elements
    const correctCountEl = endScreen.querySelector(".correct-count");
    const wrongCountEl = endScreen.querySelector(".wrong-count");
    const notAnsweredCountEl = endScreen.querySelector(".not-answered-count");

    // Display results
    scoreElement.textContent = correctCount.toString();
    totalScoreElement.textContent = totalQuestionsInQuiz.toString(); // Display the correct total
    if (correctCountEl) correctCountEl.textContent = correctCount.toString();
    if (wrongCountEl) wrongCountEl.textContent = wrongCount.toString();
    if (notAnsweredCountEl) notAnsweredCountEl.textContent = notAnsweredCount.toString();

    console.log(`Final Results: Correct: ${correctCount}, Wrong: ${wrongCount}, Not Answered: ${notAnsweredCount}, Total: ${totalQuestionsInQuiz}`);
}


/**
 * Resets the quiz state and returns the user to the start screen
 * for the current subject, reloading history and re-initializing UI elements.
 */
async function restartQuiz() {
    console.log("Restarting quiz...");
    if (!endScreen || !quizScreen || !startScreen || !pauseButton || !errorMessage || !subjectName) {
        console.error("Cannot restart quiz: Missing elements or subject name.");
        return;
    }

    // Stop ongoing processes
    clearInterval(timerInterval);
    clearTimeout(autoNextTimeout);

    // Reset UI
    endScreen.classList.add("hide");
    quizScreen.classList.add("hide");
    startScreen.classList.remove("hide");
    pauseButton.classList.add("hide");
    hideError();
    hideQuiz();

    // Reset state variables
    currentQuestion = 0;
    score = 0;
    selectedAnswer = null;
    shuffledQuestions = [];
    isPaused = false;
    timeRemaining = 0;

    // Reset inputs/dropdown
    if (questionLimitInput) questionLimitInput.value = 30;
    if (timeLimitInput) timeLimitInput.value = 30;
    if (quizLessonDropdown) quizLessonDropdown.value = "সকল পাঠ";

    // Reload history
    await loadQuestionHistory();

    // Re-initialize start screen
    if (data && subjectName) {
        populateLessonDropdown(subjectName);
        showStartScreen(subjectName); // Calls updateMinLimits -> validateInputs
    } else {
        console.error("Cannot re-initialize start screen: Data or subjectName missing.");
        displayError("Error restarting quiz. Please refresh.");
        if (startButton) startButton.disabled = true;
    }
}

// --- Timer and Pause Logic ---

/**
 * Starts or resumes the quiz timer countdown. Updates the progress bar and text display.
 * Ends the quiz if time runs out.
 */
function startTimer() {
  console.log("Timer starting/resuming...");
  clearInterval(timerInterval);

  if (!timeLimitInput || !progressText) {
    console.error("Cannot start timer: Required elements missing.");
    return;
  }
  const progressBar = document.querySelector(".progress-bar");
  if (!progressBar) {
    console.error("Progress bar element not found!");
    return;
  }

  const totalDuration = parseInt(timeLimitInput.value) * 60;

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
      if (timeRemaining > 0) {
        timeRemaining--;
        updateDisplay();
      }
      if (timeRemaining <= 0) {
        console.log("Time ran out!");
        clearInterval(timerInterval);
        endQuiz();
      }
    }
  }, 1000);
}

/**
 * Handles the click event for the pause button.
 * Pauses the timer and the auto-next timeout if active and visible.
 */
function handlePauseButtonClick() {
  if (!pauseButton || isPaused || pauseButton.classList.contains('hide')) return;

  console.log("Quiz paused via button.");
  isPaused = true;
  clearInterval(timerInterval);
  clearTimeout(autoNextTimeout);
  pauseButton.classList.add("hide"); // Hide button after pausing
}

// --- Communication with Parent Window ---

/**
 * Listens for messages from the parent window (e.g., to set subject, close, reload).
 */
window.addEventListener("message", async (event) => {
  // Optional: Add origin check for security if deployed in a specific context
  // if (event.origin !== "YOUR_EXPECTED_ORIGIN") return;

  const messageData = event.data;

  if (messageData === "closeQuiz") {
    console.log("Received 'closeQuiz' message.");
    closeQuiz();
  } else if (messageData?.subjectName) {
    subjectName = messageData.subjectName;
    console.log(`Received subject name: ${subjectName}`);

    // Set text content directly
    if (quizHeading) quizHeading.textContent = subjectName;
    const endScreenHeading = document.getElementById("end-screen-heading");
    if (endScreenHeading) endScreenHeading.textContent = subjectName;
    const timeLimitLabel = document.getElementById("time-limit-label");
    if (timeLimitLabel) timeLimitLabel.textContent = "মিনিট নির্ধারণ করুন :";
    const questionLimitLabel = document.getElementById("question-limit-label");
    if (questionLimitLabel) questionLimitLabel.textContent = "প্রশ্নের সংখ্যা নির্ধারণ করুন :";
    const startButtonEl = document.getElementById("start-button");
    if (startButtonEl) startButtonEl.textContent = "কুইজ শুরু করুন";
    const quizLessonLabel = document.getElementById("quiz-lesson-label");
    if (quizLessonLabel) quizLessonLabel.textContent = "পাঠ নির্বাচন করুন :";

    // Reset inputs/UI
    if (timeLimitInput) timeLimitInput.value = 30;
    if (questionLimitInput) questionLimitInput.value = 30;
    if (quizLessonDropdown) quizLessonDropdown.value = "সকল পাঠ";
    if (lessonDropdownMenu) lessonDropdownMenu.classList.add("hide");
    hideError();

    // Load data and set up start screen
    try {
        await loadQuestionHistory(); // Load history first
        const fetchedData = await loadQuestionData(); // Then load main data

        if (fetchedData) {
            data = fetchedData;
            populateLessonDropdown(subjectName); // Populate dropdown based on data
            showStartScreen(subjectName); // Show screen, update limits based on dropdown/data
        } else {
            console.error("Data is null after load attempt for subject:", subjectName);
            displayError("Error loading questions for this subject. Please refresh.");
            if (startButton) startButton.disabled = true;
        }
    } catch (error) {
        console.error("Error during initial setup (history/data loading):", error);
        displayError("Failed to load quiz setup data. Please refresh.");
         if (startButton) startButton.disabled = true;
    }
  } else if (messageData === "reloadQuiz") {
    console.log("Received 'reloadQuiz' message. Restarting...");
    await loadQuestionHistory(); // Reload history
    restartQuiz(); // Go back to start screen for current subject
  }
});

/**
 * Sends a message to the parent window to request closing the quiz iframe/container.
 * Cleans up local timers.
 */
function closeQuiz() {
  console.log("Sending 'closeQuiz' message to parent.");
  if (window.parent && window.parent !== window) {
       window.parent.postMessage({ type: "closeQuiz" }, "*"); // Consider specifying target origin for security
  }
  clearInterval(timerInterval);
  clearTimeout(autoNextTimeout);
}

// --- UI Visibility and Styling ---

/**
 * Makes the main quiz screen visible and sets appropriate styles.
 */
function showQuiz() {
  if (!quizScreen || !quizHeading) return;
  quizScreen.classList.add("show");
  quizScreen.classList.remove("hide");
  document.body.style.backgroundColor = "#fff";
  if (quizHeading) quizHeading.textContent = subjectName || "Quiz";
}

/**
 * Hides the main quiz screen and resets associated styles.
 */
function hideQuiz() {
  if (!quizScreen) return;
  quizScreen.classList.remove("show");
  quizScreen.classList.add("hide");
  document.body.style.backgroundColor = "";
}

/**
 * Sets up and displays the initial start screen for the given subject.
 * Populates/updates UI elements based on the subject's data and questions.
 * @param {string} subjectName The name of the subject to display.
 */
function showStartScreen(subjectName) {
  const elements = [startScreen, startScreenHeading, data, data?.sections, questionLimitInput, timeLimitInput, quizLessonDropdown, startButton, quizScreen, endScreen, lessonDropdownMenu, errorMessage];
  if (elements.some(el => el === null || el === undefined)) {
      console.error("Cannot show start screen: Required elements or data structure not ready.");
      displayError("Initialization error. Please refresh.");
      return;
  }

  startScreenHeading.textContent = subjectName || "Quiz Setup";

  const section = data.sections.find((s) => s.section === subjectName);

  if (section?.questions?.length > 0) { // Check if questions exist and array has items
      questions = section.questions.filter(q => q); // Set global 'questions', filtering invalid entries
      console.log(`Found ${questions.length} valid questions for subject: ${subjectName}`);

      questionLimitInput.disabled = false;
      timeLimitInput.disabled = false;
      // Dropdown enabled state handled by populateLessonDropdown

      updateMinLimitsForLesson(); // Update limits based on default filter ("সকল পাঠ")
  } else {
      console.warn("No valid questions found for subject:", subjectName);
      questions = [];
      questionLimitInput.disabled = true;
      timeLimitInput.disabled = true;
      quizLessonDropdown.disabled = true;
      lessonDropdownMenu.classList.add("hide");
      startButton.disabled = true;
      displayError(`No questions available for the subject "${subjectName}".`);
      // Set safe defaults for limits
      questionLimitInput.min = 1; timeLimitInput.min = 1;
      questionLimitInput.max = 1; timeLimitInput.max = 1;
      questionLimitInput.value = 1; timeLimitInput.value = 1;
  }

  // Show start screen, hide others
  startScreen.classList.remove("hide");
  quizScreen.classList.add("hide");
  endScreen.classList.add("hide");

  validateInputs(); // Final validation check
}


/**
 * Adds dynamic CSS rules for text highlighting and explanation blocks if not already present.
 */
function addHighlightCSS() {
    if (document.getElementById("quiz-dynamic-styles")) return;

    const style = document.createElement("style");
    style.id = "quiz-dynamic-styles";
    style.textContent = `
        .highlight {
            display: inline-block; background: linear-gradient(90deg, #84fab0, #8fd3f4);
            font-weight: bold; border-radius: 6px; padding: 2px 6px;
            margin: 1px 3px; color: #111; box-shadow: 1px 1px 2px rgba(0,0,0,0.1);
        }
        .explanation-container { margin-top: 25px; animation: fadeInUp 0.8s ease-out; }
        @keyframes fadeInUp {
            from { opacity: 0; transform: translate3d(0, 20px, 0); }
            to { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        .explanation-heading {
            font-size: 1.1em; font-weight: bold; color: #0056b3; margin-bottom: 10px;
            display: flex; align-items: center; text-align: left;
            border-bottom: 1px solid #eee; padding-bottom: 5px;
        }
        .explanation-heading-text { margin-right: 8px; }
        .explanation-arrow-image {
            width: 20px; height: auto; transform: rotate(350deg); display: inline-block;
            vertical-align: middle; margin-left: 2px; margin-top: 0px; filter: brightness(1.1);
        }
        .question-explanation {
            padding: 12px 15px; background-color: #f8f9fa; border: 1px solid #dee2e6;
            border-radius: 6px; text-align: left; color: #343a40; font-size: 0.95em;
            line-height: 1.6; box-shadow: inset 0 1px 2px rgba(0,0,0,0.05);
            word-wrap: break-word; overflow-y: auto; max-height: 300px;
        }
        .question-explanation .MathJax_Display { margin: 0.5em 0 !important; }
        .question-explanation script { display: none !important; }
        .question-explanation span > span > script { display: none !important; }
    `;
    document.head.appendChild(style);
}

// --- Deprecated Functions ---

/**
 * DEPRECATED: Simulates typing text into an element. Replaced by direct innerHTML assignment.
 * Kept for reference.
 * @param {HTMLElement} element The target element.
 * @param {string} text The text to type.
 * @param {number} speed Typing speed in milliseconds per character.
 * @param {function} [callback] Optional callback function after typing finishes.
 * @returns {Promise<void>}
 */
function typeText(element, text, speed, callback) {
  // ... (implementation remains the same as before, but function is not called)
  return new Promise((resolve) => {
    if (!element || typeof text !== "string") {
      console.warn("typeText: Invalid element or text provided.");
      if (callback) callback(); resolve(); return;
    }
    let i = 0; element.innerHTML = "";
    if (element.typingInterval) { clearInterval(element.typingInterval); element.typingInterval = null; }
    const interval = setInterval(function () {
      if (i >= text.length) {
        clearInterval(interval); element.typingInterval = null;
        if (callback) callback(); resolve(); return;
      }
      const char = text.charAt(i);
      if (char === "\n") element.appendChild(document.createElement("br"));
      else element.innerHTML += char;
      i++;
    }, speed);
    element.typingInterval = interval;
  });
}

// --- Initialization ---

/**
 * Main initialization function run after the DOM is fully loaded.
 * Assigns DOM elements to variables and sets up initial event listeners.
 */
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded and parsed.");

  // Assign DOM elements
  startScreenHeading = document.getElementById("start-screen-heading");
  startScreen = document.querySelector(".start-screen");
  quizScreen = document.querySelector(".quiz");
  endScreen = document.querySelector(".end-screen");
  questionElement = document.querySelector(".question");
  answerWrapperElement = document.querySelector(".answer-wrapper");
  nextButton = document.querySelector(".next");
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
  quizLessonDropdown = document.getElementById("quiz-lesson");
  lessonDropdownMenu = document.getElementById("lesson-dropdown-menu");

  // Initial UI State
  if (quizScreen) quizScreen.classList.add("hide");
  if (endScreen) endScreen.classList.add("hide");
  if (startScreen) startScreen.classList.add("hide");
  if (pauseButton) pauseButton.classList.add("hide");
  if (lessonDropdownMenu) lessonDropdownMenu.classList.add("hide");
  if (errorMessage) errorMessage.classList.add("hide");
  if (nextButton) nextButton.disabled = false;
  if (startButton) startButton.disabled = true; // Start disabled until subject/data loaded

  // Add Event Listeners
  if (startButton) startButton.addEventListener("click", startQuiz);
  else console.error("Start button not found!");

  if (nextButton) nextButton.addEventListener("click", nextQuestion);
  else console.error("Next button not found!");

  if (previousButton) previousButton.addEventListener("click", previousQuestion);
  else console.error("Previous button not found!");

  if (stopButton) stopButton.addEventListener("click", stopQuiz);
  else console.error("Stop button not found!");

  if (pauseButton) pauseButton.addEventListener("click", handlePauseButtonClick);
  else console.error("Pause button not found!");

  const restartButton = document.querySelector(".restart");
  if (restartButton) restartButton.addEventListener("click", restartQuiz);
  else console.error("Restart button not found!");

  if (quizLessonDropdown) {
    quizLessonDropdown.addEventListener("change", function () {
      selectedLesson = this.value;
      updateMinLimitsForLesson(); // Update limits when filter changes
    });
  } else console.error("Lesson dropdown not found!");

  if (questionLimitInput) {
    questionLimitInput.addEventListener("input", validateInputs);
    restrictToNumbers(questionLimitInput);
  } else console.error("Question limit input not found!");

  if (timeLimitInput) {
    timeLimitInput.addEventListener("input", validateInputs);
    restrictToNumbers(timeLimitInput);
  } else console.error("Time limit input not found!");

  console.log("Waiting for data and subject name message from parent...");

  // Inform parent window that the quiz iframe is ready
  console.log("Quiz iframe DOM ready, sending 'quizReady' message to parent.");
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'quizReady' }, '*');// Consider target origin
  }

  addHighlightCSS(); // Add dynamic CSS
});

/**
 * Clears the entire question history from IndexedDB and resets the in-memory object.
 * Re-initializes the history structure based on loaded data sections.
 * Displays a confirmation message.
 */
async function clearQuestionHistory() {
  try {
    await saveQuestionHistoryToDB({}); // Save an empty object to clear DB
    questionHistory = {}; // Reset in-memory history
    // Re-initialize structure based on current data (if loaded)
    if (data && data.sections) {
      data.sections.forEach((section) => {
        if (section?.section) {
             questionHistory[section.section] = {};
        }
      });
    }
    console.log("Question history cleared.");
    displayError("Question history has been cleared."); // Inform user
    setTimeout(() => { if(errorMessage) hideError(); }, 3000); // Hide message after 3s
  } catch (error) {
    console.error("Error clearing question history:", error);
    displayError("Could not clear question history.");
  }
}