/* quiz.js */
// Global variables for quiz state and data
let questions = [], // Holds questions for the current subject (filtered based on lesson if applicable)
  currentQuestion = 0, // Index of the currently displayed question
  score = 0, // User's current score
  timeRemaining = 0, // Time left in seconds
  timerInterval, // Interval ID for the timer
  selectedAnswer = null, // Stores the DOM element of the selected answer (used briefly)
  questionLimit = 15, // Default number of questions, updated from input
  typingInterval, // Interval ID for the typing effect
  autoNextTimeout, // Timeout ID for automatically moving to the next question
  shuffledQuestions = [], // Array holding the actual questions selected and shuffled for the current quiz instance
  data = null, // Holds the entire quiz data loaded from questionsData
  selectedLesson = "সকল পাঠ", // Tracks the selected lesson/filter ('সকল পাঠ' means all lessons)
  isPaused = false; // Tracks if the quiz timer/auto-next is paused

// Declare element variables, assign them in DOMContentLoaded
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
  timer = null,
  previousButton = null,
  stopButton = null,
  pauseButton = null,
  errorMessage = null,
  startButton = null,
  quizHeading = null,
  uContainer = null,
  numberProgressContainer = null,
  questionContainer = null,
  questionLimitInput = null,
  timeLimitInput = null,
  quizLessonDropdown = null,
  lessonDropdownMenu = null;

// Subject name received from parent window
let subjectName;
// In-memory store for question history (loaded from/saved to IndexedDB)
let questionHistory = {}; // Structure: { subjectName: { historyKey: [questionText1, questionText2, ...] } }

// IndexedDB setup
const dbName = "quizHistoryDB";
const storeName = "questionHistoryStore";
let db; // Holds the database connection

/**
 * Opens (or creates) the IndexedDB database.
 * @returns {Promise<IDBDatabase>} A promise that resolves with the database connection.
 */
function openDatabase() {
  return new Promise((resolve, reject) => {
    // Return existing connection if available
    if (db) {
      resolve(db);
      return;
    }
    const request = indexedDB.open(dbName, 1); // Version 1

    request.onerror = (event) => {
      console.error("IndexedDB error:", event.target.error);
      reject("IndexedDB failed to open");
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      console.log("IndexedDB opened successfully.");
      resolve(db);
    };

    // Creates the object store if it doesn't exist (runs on first open or version upgrade)
    request.onupgradeneeded = (event) => {
      console.log("IndexedDB upgrade needed.");
      const db = event.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
        console.log(`Object store '${storeName}' created.`);
      }
    };
  });
}

/**
 * Retrieves the entire question history object from IndexedDB.
 * @returns {Promise<object>} A promise that resolves with the history object or an empty object.
 */
async function getQuestionHistoryFromDB() {
  await openDatabase(); // Ensure DB is open
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      // Get the history object stored under the key "questionHistory"
      const request = store.get("questionHistory");

      request.onerror = (event) => {
        console.error("Error getting question history from IndexedDB:", event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        console.log("Question history loaded from IndexedDB:", event.target.result);
        resolve(event.target.result || {}); // Return empty object if no history found
      };
    } catch (error) {
        console.error("Error creating IndexedDB transaction:", error);
        reject(error);
    }
  });
}

/**
 * Saves the entire question history object to IndexedDB.
 * @param {object} history The question history object to save.
 * @returns {Promise<void>} A promise that resolves when saving is complete.
 */
async function saveQuestionHistoryToDB(history) {
  await openDatabase(); // Ensure DB is open
  return new Promise((resolve, reject) => {
     try {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        // Save the entire history object under the key "questionHistory"
        const request = store.put(history, "questionHistory");

        request.onerror = (event) => {
          console.error("Error saving question history to IndexedDB:", event.target.error);
          reject(event.target.error);
        };

        request.onsuccess = () => {
          console.log("Question history saved to IndexedDB.");
          resolve();
        };
     } catch (error) {
        console.error("Error creating IndexedDB transaction for saving:", error);
        reject(error);
     }
  });
}

/**
 * Utility function to remove HTML tags from a string.
 * @param {string} html The HTML string.
 * @returns {string} The text content without HTML tags.
 */
function stripHTML(html) {
  let temp = document.createElement("div");
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || "";
}

/**
 * Checks if a string contains an image marker like (image/...) or <img src="image/...">.
 * @param {string} text The text to check.
 * @returns {boolean} True if an image marker is found, false otherwise.
 */
function containsImageMarker(text) {
  // Ensure text is a string before testing
  if (typeof text !== "string" || !text) {
    return false;
  }
  // Regex to find either (image/...) or <img src="image/..."> patterns
  const imageRegex =
    /(\(image\/[^\)]+\))|(<img.*?src=["']image\/[^"']+["'].*?>)/;
  return imageRegex.test(text);
}

/**
 * Saves the current in-memory question history to IndexedDB.
 */
async function saveQuestionHistory() {
  try {
    await saveQuestionHistoryToDB(questionHistory);
  } catch (error) {
    console.error("Error saving question history:", error);
    // Optionally display an error to the user
    // displayError("Failed to save quiz progress.");
  }
}

/**
 * Loads question history from IndexedDB into the in-memory `questionHistory` object.
 * Initializes history structure if necessary.
 */
async function loadQuestionHistory() {
  try {
    const loadedHistory = await getQuestionHistoryFromDB();
    // Ensure loaded history is a valid object, default to empty object if not
    questionHistory = (typeof loadedHistory === 'object' && loadedHistory !== null) ? loadedHistory : {};
    console.log("Question history loaded successfully.");
    // Ensure structure exists for known sections after data is loaded (done in loadQuestionData)
  } catch (error) {
    console.error("Error loading question history:", error);
    questionHistory = {}; // Initialize to empty object on error
    displayError(
      "Error loading question history. Progress tracking might be affected."
    );
  }
}

/**
 * Loads the main question data (from the global `questionsData` variable).
 * Initializes history structure for each section found in the data.
 * @returns {Promise<object|null>} The loaded data object or null on error.
 */
async function loadQuestionData() {
  // Ensure questionsData is available globally
  if (typeof questionsData === "undefined") {
    console.error(
      "questionsData is not defined. Make sure questions_data.js is loaded before quiz.js."
    );
    displayError("Critical Error: Question data is missing.");
    return null;
  }

  if (questionsData && questionsData.sections && Array.isArray(questionsData.sections)) {
    // Initialize history structure for each section if not already present
    questionsData.sections.forEach((section) => {
      if (section && section.section) { // Check if section and section name exist
          if (!questionHistory[section.section]) {
            questionHistory[section.section] = {}; // History for each section is an object { historyKey: [...] }
          }
      } else {
          console.warn("Found section without a valid 'section' name in questionsData.");
      }
    });
    console.log("Question data processed. History structure initialized/verified.");
    return questionsData;
  } else {
    console.error("questionsData format is invalid or sections array is missing.");
    displayError("Error: Invalid question data format.");
    return null;
  }
}

/**
 * Displays an error message to the user.
 * @param {string} message The error message to display.
 */
function displayError(message) {
  if (errorMessage) { // Check if errorMessage element exists
    errorMessage.textContent = message;
    errorMessage.classList.remove("hide");
    errorMessage.style.opacity = 1; // Make it visible
    console.error("Displayed Error:", message); // Also log to console
  } else {
    // Fallback if error element isn't ready (e.g., during initial load)
    console.error("Error Message Element not found! Message:", message);
    alert("Error: " + message); // Use alert as a last resort
  }
}

/**
 * Hides the error message area.
 */
function hideError() {
    if (errorMessage && !errorMessage.classList.contains("hide")) {
        errorMessage.textContent = "";
        errorMessage.style.opacity = 0;
        // Use timeout to allow fade-out before adding 'hide'
        setTimeout(() => {
            errorMessage.classList.add("hide");
        }, 300); // Match transition duration if any
    }
}


/**
 * Restricts an input element to accept only numeric characters.
 * @param {HTMLInputElement} inputElement The input element.
 */
function restrictToNumbers(inputElement) {
  if (!inputElement) return; // Add null check
  inputElement.addEventListener("input", function () {
    // Replace any non-digit character with an empty string
    this.value = this.value.replace(/[^0-9]/g, "");
  });

  // Prevent pasting non-numeric content
  inputElement.addEventListener("paste", function (event) {
    let pasteData = (event.clipboardData || window.clipboardData).getData(
      "text"
    );
    if (pasteData.match(/[^0-9]/g)) {
      event.preventDefault(); // Prevent paste if non-digits are found
    }
  });
}

// Load data early, but element assignments and listeners happen in DOMContentLoaded
loadQuestionHistory().then(() => {
    loadQuestionData().then((fetchedData) => {
      if (fetchedData) {
        data = fetchedData;
        console.log("Initial data and history loaded.");
        // Further initialization requiring data (like populating dropdown) happens
        // when subjectName is received or in DOMContentLoaded if needed.
      } else {
        console.error("Data is null or failed to load after history load.");
        // Error should have been displayed by loadQuestionData
      }
    });
});


/**
 * Validates the question limit and time limit inputs based on current min/max values.
 * Updates the error message and start button state accordingly.
 */
function validateInputs() {
  // Add null checks for input elements
  if (!questionLimitInput || !timeLimitInput || !startButton || !errorMessage) {
    console.warn("Input elements or start button/error message not ready for validation.");
    return;
  }

  const questionLimitValue = parseInt(questionLimitInput.value);
  const timeLimitValue = parseInt(timeLimitInput.value);
  // Use parseFloat for min/max in case they are set dynamically with decimals (though unlikely here)
  const maxQuestions = parseInt(questionLimitInput.max);
  const minQuestions = parseInt(questionLimitInput.min);

  let errorMessageText = "";

  // Check if limits are valid numbers
  if (isNaN(questionLimitValue) || isNaN(timeLimitValue)) {
    errorMessageText = "Please enter valid numbers for question and time limits.";
  }
  // Check against dynamic min values
  else if (!isNaN(minQuestions) && (questionLimitValue < minQuestions || timeLimitValue < minQuestions)) {
     errorMessageText = `Question and time limit must be at least ${minQuestions}.`;
  }
  // Check against dynamic max values
  else if (!isNaN(maxQuestions) && (questionLimitValue > maxQuestions || timeLimitValue > maxQuestions)) {
     errorMessageText = `Question and time limits cannot exceed ${maxQuestions} for the selected filter.`;
  }

  // Determine if the "no questions available" error is currently showing
  const noQuestionsErrorShowing = !errorMessage.classList.contains("hide") &&
                                   errorMessage.textContent.includes("No questions available");

  // Disable start button if there's a validation error OR if the "no questions" error is showing
  startButton.disabled = !!errorMessageText || noQuestionsErrorShowing;

  // Display the validation error message, or hide the error area if valid
  if (errorMessageText) {
    displayError(errorMessageText);
  } else if (!noQuestionsErrorShowing) {
    // Hide error only if it's not the specific "no questions" message
     hideError();
  }
}


/**
 * Starts the quiz after validating inputs and selecting questions.
 */
async function startQuiz() {
  // Ensure required elements are ready
  if (
    !questionLimitInput || !timeLimitInput || !quizLessonDropdown ||
    !startButton || !startScreen || !quizScreen || !quizHeading || !errorMessage
  ) {
    console.error("Required elements not ready to start quiz.");
    displayError("Initialization error. Please refresh the page.");
    return;
  }

  // Ensure data is loaded
   if (!data) {
    console.error("Quiz data not loaded. Cannot start quiz.");
    displayError("Quiz data failed to load. Please refresh.");
    return;
  }

  // Ensure subject name is set
  if (!subjectName) {
    console.warn("Subject name not yet received. Cannot start quiz.");
    displayError("Loading subject information...");
    return;
  }

  const questionLimitValue = parseInt(questionLimitInput.value);
  const timeLimitValue = parseInt(timeLimitInput.value);

  // Re-validate inputs right before starting
  validateInputs();
  if (startButton.disabled) {
    console.log("Start button is disabled. Check input values or available questions.");
    // Error message should already be displayed by validateInputs
    return; // Stop if validation fails or no questions available
  }

  // --- Initialize Quiz State ---
  questionLimit = questionLimitValue;
  timeRemaining = timeLimitValue * 60; // Set initial timeRemaining in seconds
  currentQuestion = 0;
  score = 0;
  selectedAnswer = null;
  isPaused = false; // Ensure quiz starts unpaused
  selectedLesson = quizLessonDropdown.value; // Get the selected lesson/filter

  // --- Filter and Select Questions ---
  const section = data.sections.find((s) => s.section === subjectName);
  let baseQuestions = []; // Questions for the current subject

  if (section && section.questions && Array.isArray(section.questions)) {
    baseQuestions = section.questions.filter(q => q && q.question); // Filter out invalid question entries
  } else {
    console.error("Subject section or questions not found:", subjectName);
    displayError("Subject data not found. Please refresh the page.");
    return;
  }

  if (baseQuestions.length === 0) {
      console.error("No valid questions found for subject:", subjectName);
      displayError(`No questions available for subject "${subjectName}".`);
      return;
  }

  // Filter questions based on the selected lesson/filter
  let filteredQuestions = filterQuestions(baseQuestions, selectedLesson);
  let currentFilterText = getCurrentFilterText(); // Get text for messages

  if (filteredQuestions.length === 0) {
    // This case should ideally be prevented by updateMinLimitsForLesson disabling start, but double-check
    displayError(
      `No questions available for the filter: "${currentFilterText}". Please select a different filter.`
    );
    startButton.disabled = true; // Ensure start is disabled
    return; // Stop quiz start
  }

  // Adjust question limit if it exceeds available filtered questions
  if (questionLimitValue > filteredQuestions.length) {
    console.warn(
      `Requested ${questionLimitValue} questions, but only ${filteredQuestions.length} available for "${currentFilterText}". Adjusting limit.`
    );
    // Don't display this as an error, just adjust silently or with a console warning.
    // displayError(`Limit adjusted to ${filteredQuestions.length} available questions.`); // Optional user message
    questionLimit = filteredQuestions.length; // Adjust limit
    questionLimitInput.value = questionLimit; // Update input display

    // Optionally adjust time limit proportionally or keep user's choice
    // Let's keep the user's time limit unless it's also higher than the new question count
    if (timeLimitValue > filteredQuestions.length) {
        timeLimitInput.value = questionLimit; // Adjust time input as well
        timeRemaining = questionLimit * 60; // Adjust time state
    }
  } else {
    // Use the potentially adjusted questionLimit if it was lowered
    questionLimit = Math.min(questionLimitValue, filteredQuestions.length);
  }


  // Select the final set of questions for the quiz using history
  try {
      shuffledQuestions = await selectQuestions(
        filteredQuestions, // Use the correctly filtered questions
        questionLimit, // Use the potentially adjusted limit
        subjectName,
        selectedLesson // Pass selectedLesson/filter for history key
      );
  } catch (error) {
      console.error("Error during question selection:", error);
      displayError("An error occurred while preparing questions.");
      return;
  }


  if (!shuffledQuestions || shuffledQuestions.length === 0) {
    // This check might be redundant due to earlier checks, but good safety
    displayError(
      "No questions could be selected for the quiz. Please try again or change filters."
    );
    startButton.disabled = true; // Ensure start is disabled
    return; // Stop quiz start if no questions
  }

  // Mark all selected questions as unanswered initially
  shuffledQuestions.forEach((question) => {
    if (question) { // Check if question is defined
      question.answered = false;
      question.selectedAnswer = null; // Ensure previous selections are cleared
      question.isCorrect = null;
    }
  });

  // --- Transition to Quiz Screen ---
  hideError(); // Hide any previous error messages
  startScreen.classList.add("hide");
  quizScreen.classList.remove("hide");
  showQuiz(); // Make sure quiz UI elements are visible

  // Use typeText for the quiz heading
  if (quizHeading) typeText(quizHeading, subjectName, 30);

  startTimer(); // Start the timer
  displayQuestion(); // Display the first question
}

/**
 * Gets the display text for the currently selected filter/lesson.
 * @returns {string} The text of the selected option or a default string.
 */
function getCurrentFilterText() {
    if (
        quizLessonDropdown &&
        !quizLessonDropdown.disabled &&
        quizLessonDropdown.options.length > 0 &&
        quizLessonDropdown.selectedIndex >= 0
      ) {
        return quizLessonDropdown.options[quizLessonDropdown.selectedIndex].text;
      } else if (selectedLesson === "সকল পাঠ") {
        // Handle case where dropdown might be hidden but default is used
        return "সকল পাঠ";
      } else if (selectedLesson === "image_questions_only") {
          return "শুধুমাত্র ছবিযুক্ত প্রশ্ন"; // Specific text for image filter
      }
      return "Current Filter"; // Fallback
}

/**
 * Filters a list of questions based on a lesson or filter type.
 * @param {Array} questionsToFilter The array of question objects to filter.
 * @param {string} lessonOrFilter The selected lesson name, "সকল পাঠ", or "image_questions_only".
 * @returns {Array} The filtered array of questions.
 */
function filterQuestions(questionsToFilter, lessonOrFilter) {
    if (!Array.isArray(questionsToFilter)) return []; // Safety check

    if (lessonOrFilter === "image_questions_only") {
        return questionsToFilter.filter((q) => {
            if (!q || !q.question) return false; // Basic validation
            // Check question text
            if (containsImageMarker(q.question)) return true;
            // Check options if question text doesn't have image
            if (q.options && Array.isArray(q.options)) {
                return q.options.some((option) => {
                    if (typeof option !== "object" || option === null || Object.keys(option).length === 0) return false;
                    const optionText = Object.keys(option)[0];
                    return containsImageMarker(optionText);
                });
            }
            return false; // Exclude if neither question nor any option has image
        });
    } else if (lessonOrFilter !== "সকল পাঠ") {
        // Filter by specific lesson name
        return questionsToFilter.filter(
            (q) => q && q.lesson === lessonOrFilter // Include only questions matching the specific lesson
        );
    } else {
        // "সকল পাঠ" - return all valid questions passed in
        return questionsToFilter.filter(q => q && q.question); // Ensure only valid questions are returned
    }
}


/**
 * Selects questions for the quiz, prioritizing unseen questions using history.
 * @param {Array} allAvailableQuestions Filtered questions based on lesson/filter.
 * @param {number} limit The number of questions to select.
 * @param {string} subject The name of the subject.
 * @param {string} lessonOrFilter The selected lesson or filter type ("সকল পাঠ", specific lesson, "image_questions_only").
 * @returns {Promise<Array>} A promise resolving to an array of selected question objects.
 */
async function selectQuestions(allAvailableQuestions, limit, subject, lessonOrFilter) {
  let selectedQuestions = [];
  // Generate a unique key for storing history based on subject and filter
  let historyKey;
  if (lessonOrFilter === "image_questions_only") {
    historyKey = `${subject}-images_only`;
  } else if (lessonOrFilter === "সকল পাঠ") {
    historyKey = `${subject}-all`; // Key for all lessons within the subject
  } else {
    historyKey = `${subject}-${lessonOrFilter}`; // Key for a specific lesson
  }

  // Ensure limit is not greater than the number of available questions
  const actualLimit = Math.min(limit, allAvailableQuestions.length);
  if (limit > allAvailableQuestions.length) {
    console.warn(
      `Requested limit ${limit} exceeds available questions ${allAvailableQuestions.length} for filter "${lessonOrFilter}". Using ${actualLimit}.`
    );
  }

  // Ensure subject and history key structure exists in the history object
  if (!questionHistory[subject]) {
    questionHistory[subject] = {};
  }
  if (!questionHistory[subject][historyKey]) {
    questionHistory[subject][historyKey] = []; // Initialize history array for this key
  }

  // Get questions that haven't been seen according to the history for this specific key
  let unseenQuestions = allAvailableQuestions.filter(
    (q) => q && q.question && !questionHistory[subject][historyKey].includes(q.question)
  );

  // Get questions that *have* been seen (for potential reuse)
  let seenQuestions = allAvailableQuestions.filter(
    (q) => q && q.question && questionHistory[subject][historyKey].includes(q.question)
  );

  // Check if we need to reset history (all available questions have been seen)
  if (unseenQuestions.length === 0 && seenQuestions.length === allAvailableQuestions.length && allAvailableQuestions.length > 0) {
      console.log(`All ${allAvailableQuestions.length} questions for "${historyKey}" have been seen. Resetting history for this filter.`);
      questionHistory[subject][historyKey] = []; // Clear history for this key
      unseenQuestions = allAvailableQuestions; // All questions are now considered unseen
      seenQuestions = []; // No questions are considered seen anymore
      // Note: We don't save history here yet, wait until selection is complete
  }

  // Prioritize unseen questions
  unseenQuestions = shuffleArray(unseenQuestions); // Shuffle unseen questions
  let takeFromUnseen = Math.min(actualLimit, unseenQuestions.length);
  selectedQuestions = unseenQuestions.slice(0, takeFromUnseen);

  // Add the newly selected unseen questions to history
  selectedQuestions.forEach(q => {
      if (q && q.question && !questionHistory[subject][historyKey].includes(q.question)) {
          questionHistory[subject][historyKey].push(q.question);
      }
  });

  // If more questions are needed, take from seen questions
  const remainingNeeded = actualLimit - selectedQuestions.length;
  if (remainingNeeded > 0 && seenQuestions.length > 0) {
      seenQuestions = shuffleArray(seenQuestions); // Shuffle seen questions
      let takeFromSeen = Math.min(remainingNeeded, seenQuestions.length);
      selectedQuestions.push(...seenQuestions.slice(0, takeFromSeen));
  }

  // Fallback: This should ideally not be needed if logic above is correct, but as a safety net
  // if somehow we still don't have enough questions (e.g., due to duplicates or errors),
  // try filling remaining spots randomly from all available (avoiding duplicates).
  let attempts = 0; // Prevent infinite loop
  while (selectedQuestions.length < actualLimit && attempts < allAvailableQuestions.length * 2) {
      const randomIndex = Math.floor(Math.random() * allAvailableQuestions.length);
      const potentialQuestion = allAvailableQuestions[randomIndex];
      if (potentialQuestion && potentialQuestion.question && !selectedQuestions.some(sq => sq.question === potentialQuestion.question)) {
          selectedQuestions.push(potentialQuestion);
          // Optionally add to history here if it wasn't added before
          if (!questionHistory[subject][historyKey].includes(potentialQuestion.question)) {
              questionHistory[subject][historyKey].push(potentialQuestion.question);
          }
      }
      attempts++;
  }

  // Save the updated history to IndexedDB
  await saveQuestionHistory();

  // Final shuffle of the selected list before returning
  return shuffleArray(selectedQuestions);
}


/**
 * Converts newline characters (\n) in text to HTML <br> tags.
 * @param {string} text The input text.
 * @returns {string} Text with newlines converted to <br>.
 */
function convertNewlinesToHtml(text) {
  if (typeof text !== "string") {
    return ""; // Return empty string for non-string input
  }
  return text.replace(/\n/g, "<br>");
}

/**
 * Processes text to replace image markers `(image/...)` or `<img src="image/...">`
 * with standard HTML `<img>` tags.
 * @param {string} text The text containing potential image markers.
 * @returns {string} The text with markers replaced by HTML image tags.
 */
function processTextWithImages(text) {
  if (typeof text !== "string") {
    return ""; // Return empty string for non-string input
  }
  // Regex captures:
  // match: The whole matched string (either marker or img tag)
  // inlineImage: The content of (image/...) marker, e.g., "image/filename.jpg"
  // imgTag: The whole <img ...> tag if matched
  // imgSrc: The src attribute value from the <img ...> tag, e.g., "image/filename.png"
  return text.replace(
    /(\(image\/([^\)]+)\))|(<img.*?src=["'](image\/[^"']+)["'].*?>)/g, // Added capture group for filename inside ()
    (match, inlineImageMarker, inlineImageFilename, imgTag, imgSrc) => {
      let filename;
      if (inlineImageMarker) {
        // Filename from (image/filename)
        filename = "image/" + inlineImageFilename; // Prepend "image/"
      } else if (imgSrc) {
        // Filename from <img src="image/filename" ...>
        filename = imgSrc;
      } else {
        return match; // Should not happen with this regex, but safety first
      }

      // Basic validation: Check if filename seems reasonable
      if (!filename || typeof filename !== "string" || filename.trim() === "image/") {
        console.warn("Invalid image source detected:", match);
        return `<span style="color: red;">[Invalid Image: ${match}]</span>`; // Return an indicator of the issue
      }

      // Return a standard img tag structure
      // Added ondragstart="return false;" to prevent dragging images
      return `<div><img src="${filename}" style="max-width: 100%; height: auto; display: block; margin: 5px auto;" alt="Image" ondragstart="return false;"></div>`;
    }
  );
}

/**
 * Displays the current question and its answers.
 */
function displayQuestion() {
  // Ensure required elements are ready
  if (
    !questionElement || !answerWrapperElement || !previousButton ||
    !nextButton || !pauseButton || !progressText || !numberProgressContainer
  ) {
    console.error("Required elements missing for displayQuestion. Stopping quiz.");
    displayError("UI Error. Cannot display question.");
    stopQuiz(); // Stop if critical elements are missing
    return;
  }

  // Validate current question index and data
  if (
    !shuffledQuestions || currentQuestion < 0 ||
    currentQuestion >= shuffledQuestions.length || !shuffledQuestions[currentQuestion]
  ) {
    console.error("Invalid question index or question data missing:", currentQuestion, shuffledQuestions);
    displayError("Error loading question data.");
    stopQuiz();
    return;
  }

  const questionData = shuffledQuestions[currentQuestion];
  pauseButton.classList.add("hide"); // Ensure pause button is hidden initially for the new question
  clearPreviousContent(); // Clear question, answers, timeouts

  // --- Process and Display Question Text ---
  let questionContent = questionData.question;

  // 1. Process for image markers -> HTML <img> tags
  questionContent = processTextWithImages(questionContent);

  // 2. Highlight text within single quotes '...' -> <span class="highlight">...</span>
  questionContent = questionContent.replace(/'([^']+)'/g, (_match, p1) => `<span class="highlight">${p1}</span>`);

  // 3. Convert MathJax markers <... class="mathy">...</...> -> <script type="math/asciimath">...</script>
  questionContent = questionContent.replace(
    /<[^>]*class="mathy"[^>]*>(.*?)<\/[^>]*>/g, // Find elements with class="mathy"
    (_match, p1) => {
      // p1 is the content inside the mathy element
      const cleanedContent = p1.replace(/<[^>]*>/g, ""); // Remove any HTML tags *inside* the math content
      return `<script type="math/asciimath">${cleanedContent}</script>`; // Return MathJax script tag
    }
  );

  // 4. Convert newlines to <br> (applied to the entire processed content)
  const questionHTML = `<h5>${convertNewlinesToHtml(questionContent)}</h5>`;
  questionElement.innerHTML = questionHTML;

  // --- Render MathJax ---
  try {
    if (typeof MathJax !== "undefined" && MathJax.Hub) {
      // Queue MathJax typesetting for the question element
      MathJax.Hub.Queue(["Typeset", MathJax.Hub, questionElement]);
    } else if (typeof MathJax === "undefined") {
      // Only log warning once if MathJax is missing
      console.warn("MathJax library not detected.");
    }
  } catch (error) {
    console.error("Error rendering MathJax for question:", error);
  }

  // --- Display Answers ---
  displayAnswers(questionData);

  // Fade-in animation for answers
  answerWrapperElement.style.opacity = "1";
  answerWrapperElement.style.animation = "fadeInUp 0.5s ease-out"; // Use a standard ease-out

  // --- Update Button States ---
  previousButton.disabled = currentQuestion === 0; // Disable prev on first question
  // Next button: Enabled if not the last question OR if the last question is unanswered.
  // Disabled only if it IS the last question AND it has been answered.
  nextButton.disabled = (currentQuestion === shuffledQuestions.length - 1) && questionData.answered;

  // Special case: Disable both if only one question in the quiz
  if (shuffledQuestions.length <= 1) {
    nextButton.disabled = true;
    previousButton.disabled = true;
  }

  // --- Update Progress ---
  updateQuestionCounter();

  // Add CSS for highlighting dynamically (if not already added)
  addHighlightCSS(); // Ensures styles are present
}

/**
 * Adds CSS rules for highlighting and explanations dynamically to the document head.
 */
function addHighlightCSS() {
  // Check if style element already exists
  if (document.getElementById("highlight-styles")) return;

  const style = document.createElement("style");
  style.id = "highlight-styles"; // Add an ID to prevent duplication
  style.type = "text/css";
  style.innerHTML = `
  /* Style for highlighted text segments */
  .highlight {
    display: inline-block; /* Allows padding/border-radius on wrapped lines */
    background: linear-gradient(90deg, #84fab0, #8fd3f4); /* Gradient background */
    font-weight: bold;
    border-radius: 8px; /* Rounded corners */
    padding: 3.5px 6px; /* Padding around text */
    margin: 2.5px 4px; /* Spacing around the highlight */
    color: #ffffff; /* White text */
    box-shadow: 1px 1px 3px rgba(0,0,0,0.2); /* Subtle shadow */
  }

  /* Container for the explanation block */
  .explanation-container {
    margin-top: 25px; /* Space above the explanation */
    padding-top: 15px; /* Padding top inside container */
    border-top: 1px dashed #ccc; /* Separator line */
    animation: fadeInUp 0.8s ease-out; /* Fade-in animation */
    text-align: left; /* Ensure content inside aligns left */
  }

  /* Heading for the explanation ("Explanation" text + arrow) */
  .explanation-heading {
    font-size: 1.1em; /* Slightly larger font size */
    font-weight: bold;
    color: #0056b3; /* Heading color */
    margin-bottom: 12px; /* Space below the heading */
    display: flex; /* Use flexbox for alignment */
    align-items: center; /* Vertically align text and image */
  }

  /* Span for the "Explanation" text itself */
  .explanation-heading-text {
    margin-right: 8px; /* Space between text and arrow */
  }

  /* Styling for the arrow image */
  .explanation-arrow-image {
    width: 24px;
    height: auto;
    transform: rotate(350deg); /* Slight rotation */
    vertical-align: middle; /* Align with text */
    margin-left: 1px;
    margin-top: 2px; /* Fine-tune vertical alignment */
  }

  /* Styling for the explanation content box */
  .question-explanation {
    padding: 15px;
    background-color: #f8f9fa; /* Light background color */
    border: 1px solid #dee2e6; /* Subtle border */
    border-radius: 8px;
    color: #343a40; /* Darker text color for readability */
    font-size: 0.95em; /* Standard font size */
    line-height: 1.6; /* Improved line spacing */
    box-shadow: inset 0 1px 3px rgba(0,0,0,0.05); /* Inner shadow */
    word-wrap: break-word; /* Wrap long words */
    overflow-y: auto; /* Add scrollbar if content overflows */
    max-height: 300px; /* Limit height */
    text-align: left; /* Ensure text inside aligns left */
  }

  /* Ensure images within explanation scale correctly */
  .question-explanation img {
      max-width: 100%;
      height: auto;
      display: block; /* Center images or align left */
      margin: 10px auto; /* Add some margin around images */
      border-radius: 4px; /* Optional: slightly rounded corners for images */
  }

  /* Ensure MathJax display math is centered and scrolls if needed */
   .question-explanation .MathJax_Display {
      overflow-x: auto;
      overflow-y: hidden;
      max-width: 100%;
   }
  `;
  document.head.appendChild(style);
}


/**
 * Clears the content of the question and answer areas, and clears timeouts/intervals.
 */
function clearPreviousContent() {
  if (answerWrapperElement) answerWrapperElement.innerHTML = "";
  if (questionElement) questionElement.innerHTML = "";
  // Reset opacity for fade-in effect on next question's answers
  if (answerWrapperElement) answerWrapperElement.style.opacity = "0";
  // Clear any pending auto-next timeout
  clearTimeout(autoNextTimeout);
  // Clear any active typing interval (safety measure)
  clearInterval(typingInterval);
}

/**
 * Updates the question counter display (e.g., "Question 5 of 15").
 */
function updateQuestionCounter() {
  const currentEl = document.querySelector(".current"); // Element for current question number
  const totalEl = document.querySelector(".total"); // Element for total questions
  if (currentEl) currentEl.textContent = currentQuestion + 1; // Display 1-based index
  if (totalEl) totalEl.textContent = shuffledQuestions.length; // Display total selected questions
}

/**
 * Adds the explanation block (heading and content) to a target DOM element.
 * Processes the explanation text for images and MathJax.
 * @param {object} questionData The question object containing the explanation.
 * @param {HTMLElement} targetElement The DOM element to append the explanation block to.
 */
function addExplanationBlock(questionData, targetElement) {
  // Validate inputs
  if (
    !questionData || !questionData.explanation ||
    typeof questionData.explanation !== "string" || questionData.explanation.trim() === "" ||
    !targetElement
  ) {
    return; // Do nothing if no valid explanation or target
  }

  // Prevent adding multiple explanation blocks
  if (targetElement.querySelector(".explanation-container")) {
    console.warn("Attempted to add duplicate explanation block.");
    return;
  }

  // Create container for the explanation
  const explanationContainer = document.createElement("div");
  explanationContainer.className = "explanation-container";

  // Create heading ("Explanation" + arrow)
  const explanationHeading = document.createElement("h4");
  explanationHeading.className = "explanation-heading";
  explanationHeading.innerHTML = `
      <span class="explanation-heading-text">Explanation</span>
      <img src="12arrow.png" alt="->" class="explanation-arrow-image">
    `; // Use innerHTML for simplicity

  // Create div for the explanation content
  const explanationDiv = document.createElement("div");
  explanationDiv.className = "question-explanation";

  // --- Process Explanation Content ---
  // 1. Process for image markers -> HTML <img> tags
  let explanationContent = processTextWithImages(questionData.explanation);

  // 2. Convert MathJax markers <... class="mathy">...</...> -> <script type="math/asciimath">...</script>
  explanationContent = explanationContent.replace(
    /<[^>]*class="mathy"[^>]*>(.*?)<\/[^>]*>/g,
    (_match, p1) => {
      const cleanedContent = p1.replace(/<[^>]*>/g, ""); // Remove inner HTML tags
      return `<script type="math/asciimath">${cleanedContent}</script>`;
    }
  );

   // 3. Convert newlines to <br> (applied to the entire processed content)
   explanationContent = convertNewlinesToHtml(explanationContent);

  // 4. Set the processed content
  explanationDiv.innerHTML = explanationContent;

  // Append heading and content to the container
  explanationContainer.appendChild(explanationHeading);
  explanationContainer.appendChild(explanationDiv);

  // Append the container to the target element
  targetElement.appendChild(explanationContainer);

  // --- Render MathJax within the explanation ---
  try {
    if (typeof MathJax !== "undefined" && MathJax.Hub) {
      // Queue MathJax typesetting for the newly added explanation div
      MathJax.Hub.Queue(["Typeset", MathJax.Hub, explanationDiv]);
    }
  } catch (error) {
    console.error("Error rendering MathJax for explanation:", error);
  }
}


/**
 * Displays the answer options for the given question.
 * Handles displaying answered state (correct/wrong) or adding click listeners for unanswered questions.
 * @param {object} questionData The data for the current question, including options.
 */
function displayAnswers(questionData) {
  if (!answerWrapperElement) return; // Safety check
  answerWrapperElement.innerHTML = ""; // Clear previous answers

  // Validate options structure
  if (!questionData || !questionData.options || !Array.isArray(questionData.options)) {
    console.error("Invalid or missing options for the current question:", questionData);
    displayError("Error displaying answer options.");
    return;
  }

  // Iterate through each option for the question
  questionData.options.forEach((option) => {
    // Validate individual option format: { "Option Text": boolean }
    if (typeof option !== "object" || option === null || Object.keys(option).length !== 1) {
      console.warn("Skipping invalid option format:", option);
      return; // Skip this iteration if option format is wrong
    }

    const optionText = Object.keys(option)[0];
    const isCorrect = option[optionText]; // Boolean indicating correctness

    // Create the answer button element
    const answerButton = document.createElement("div");
    answerButton.classList.add("answer");

    // Add a 'c' class marker to the correct answer (used later for highlighting)
    if (isCorrect) {
      answerButton.classList.add("c");
    }

    // --- Process Option Text ---
    // 1. Process for image markers -> HTML <img> tags
    let content = processTextWithImages(optionText);

    // 2. Convert MathJax markers <... class="mathy">...</...> -> <script type="math/asciimath">...</script>
    content = content.replace(
      /<[^>]*class="mathy"[^>]*>(.*?)<\/[^>]*>/g,
      (_match, p1) => {
        const cleanedContent = p1.replace(/<[^>]*>/g, ""); // Remove inner HTML tags
        return `<script type="math/asciimath">${cleanedContent}</script>`;
      }
    );

    // 3. Convert newlines to <br> (applied to the entire processed content)
    content = convertNewlinesToHtml(content);

    // Set the processed content as the button's inner HTML
    answerButton.innerHTML = content; // Use innerHTML as content might contain HTML (img, script, br)

    // --- Handle Answered vs. Unanswered State ---
    if (questionData.answered) {
      // If question is already answered, display state and disable interaction
      answerButton.classList.add("disabled"); // Visually disable
      if (isCorrect) {
        answerButton.classList.add("correct"); // Highlight correct answer
      } else if (optionText === questionData.selectedAnswer) {
        // Highlight the user's incorrect selection
        answerButton.classList.add("wrong");
      }
    } else {
      // If question is unanswered, add click listener to handle selection
      answerButton.addEventListener("click", () => selectAnswer(answerButton, option));
    }

    // Add the button to the wrapper
    answerWrapperElement.appendChild(answerButton);
  });

  // --- Add Explanation (if answered) ---
  // After all answer buttons are added, check if the question was answered and has an explanation.
  if (questionData.answered) {
    addExplanationBlock(questionData, answerWrapperElement);
    // Note: Pause button visibility and auto-next are handled in `selectAnswer` when the answer is *first* chosen.
    // When revisiting an answered question, we don't show the pause button or start auto-next.
  }

  // --- Render MathJax for Answers ---
  try {
    if (typeof MathJax !== "undefined" && MathJax.Hub) {
      // Queue MathJax typesetting for the entire answer wrapper
      MathJax.Hub.Queue(["Typeset", MathJax.Hub, answerWrapperElement]);
    }
  } catch (error) {
    console.error("Error rendering MathJax for answers:", error);
  }
}


/**
 * Helper function to check if an option object represents the correct answer.
 * @param {object} option The option object (e.g., {"Answer Text": true}).
 * @returns {boolean} True if the option is correct, false otherwise.
 */
function isCorrectAnswer(option) {
  // Validate option format
  if (typeof option !== "object" || option === null || Object.keys(option).length !== 1) {
    return false;
  }
  // The value associated with the option text key should be true for correct answers
  return Object.values(option)[0] === true;
}

/**
 * Handles the user selecting an answer. Updates UI, score, and state.
 * Triggers auto-advance to the next question after a delay.
 * @param {HTMLElement} answerButton The clicked answer button element.
 * @param {object} selectedOption The data object for the selected option.
 */
function selectAnswer(answerButton, selectedOption) {
  // Ensure elements are ready and question is valid/unanswered
  if (!answerWrapperElement || !nextButton || !pauseButton || !shuffledQuestions[currentQuestion] || shuffledQuestions[currentQuestion].answered) {
    return; // Do nothing if already answered or elements missing
  }

  // Clear any pending auto-next timeout from a potential rapid re-click (though unlikely)
  clearTimeout(autoNextTimeout);

  const questionData = shuffledQuestions[currentQuestion];
  const isCorrect = isCorrectAnswer(selectedOption); // Check correctness
  const selectedOptionText = Object.keys(selectedOption)[0]; // Get the text of the selected option

  // --- Update Question State ---
  questionData.answered = true;
  questionData.selectedAnswer = selectedOptionText;
  questionData.isCorrect = isCorrect;

  // --- Update UI ---
  // Disable all answer buttons for this question
  const allAnswers = answerWrapperElement.querySelectorAll(".answer");
  allAnswers.forEach((answer) => {
    answer.classList.add("disabled");
    // Clone and replace to remove listeners cleanly (safer than removeEventListener if handlers are complex)
    // const clone = answer.cloneNode(true);
    // answer.parentNode.replaceChild(clone, answer);
    // For simple listeners added directly, just adding 'disabled' class and logic check is usually sufficient.
  });

  // Apply visual feedback (selected, correct/wrong)
  answerButton.classList.add("selected"); // Mark the one clicked
  if (isCorrect) {
    answerButton.classList.add("correct");
    score++; // Increment score only for correct answers
    console.log(`Question ${currentQuestion + 1} Correct! Score: ${score}`);
  } else {
    answerButton.classList.add("wrong");
    // Find and highlight the actual correct answer
    const correctAnswerElement = answerWrapperElement.querySelector(".answer.c"); // Find the element with 'c' class
    if (correctAnswerElement) {
      correctAnswerElement.classList.add("correct"); // Highlight it
    }
    console.log(`Question ${currentQuestion + 1} Incorrect.`);
  }

  // --- Handle Explanation and Auto-Next ---
  if (questionData.explanation && questionData.explanation.trim() !== "") {
    // If there's an explanation:
    addExplanationBlock(questionData, answerWrapperElement); // Display it
    pauseButton.classList.remove("hide"); // Show the pause button
    // Set timeout for auto-next (longer delay with explanation)
    autoNextTimeout = setTimeout(() => {
        // Check if paused *just before* moving next
        if (!isPaused) {
            nextQuestion();
        } else {
            console.log("Auto-next prevented because quiz is paused.");
        }
    }, 3000); // 3 seconds delay
  } else {
    // If no explanation:
    pauseButton.classList.add("hide"); // Ensure pause button is hidden
    // Set timeout for auto-next (shorter delay)
    autoNextTimeout = setTimeout(() => {
         // Check if paused *just before* moving next
        if (!isPaused) {
            nextQuestion();
        } else {
            console.log("Auto-next prevented because quiz is paused.");
        }
    }, 500); // 0.5 seconds delay
  }

  // Update next button state (disabled if this was the last question)
  nextButton.disabled = (currentQuestion === shuffledQuestions.length - 1);
}


/**
 * Finds the index of the next unanswered question, wrapping around if necessary.
 * @returns {number} The index of the next unanswered question, or -1 if all are answered.
 */
function findNextUnansweredQuestion() {
  // Start searching from the question *after* the current one
  for (let i = currentQuestion + 1; i < shuffledQuestions.length; i++) {
    if (shuffledQuestions[i] && !shuffledQuestions[i].answered) {
      return i; // Found unanswered question after current
    }
  }
  // If not found after current, wrap around and check from the beginning up to the current one
  for (let i = 0; i < currentQuestion; i++) {
    if (shuffledQuestions[i] && !shuffledQuestions[i].answered) {
      return i; // Found unanswered question before current
    }
  }
  // If the current question itself is the only unanswered one (or all are answered)
   if (shuffledQuestions[currentQuestion] && !shuffledQuestions[currentQuestion].answered) {
       // This case shouldn't typically be reached via nextQuestion logic, but included for completeness
       return currentQuestion;
   }

  return -1; // No unanswered questions found anywhere
}

/**
 * Counts the number of unanswered questions remaining in the quiz.
 * @returns {number} The count of unanswered questions.
 */
function countUnansweredQuestions() {
  return shuffledQuestions.filter((q) => q && !q.answered).length;
}

/**
 * Moves to the next unanswered question or ends the quiz if all questions are answered.
 * Handles resuming from pause if triggered via Next button.
 */
function nextQuestion() {
  // Ensure required elements are ready
  if (!pauseButton || !quizScreen || !endScreen) {
      console.error("Cannot proceed to next question: Core elements missing.");
      return;
  }

  // Clear intervals/timeouts associated with the *current* question's display/interaction
  clearInterval(typingInterval); // Clear any text typing effect
  clearTimeout(autoNextTimeout); // Clear pending auto-next
  pauseButton.classList.add("hide"); // Hide pause button when manually navigating

  // --- Handle Pause State ---
  // If the quiz was paused (e.g., user clicked pause on explanation),
  // clicking Next should resume the quiz.
  if (isPaused) {
    isPaused = false; // Unpause the state
    console.log("Quiz resumed via Next button.");
    startTimer(); // Restart the timer explicitly
  }

  // --- Find Next Question ---
  const nextUnansweredIndex = findNextUnansweredQuestion();

  if (nextUnansweredIndex !== -1) {
    // If an unanswered question is found:
    currentQuestion = nextUnansweredIndex; // Update current question index
    selectedAnswer = null; // Reset selected answer state for the new question
    displayQuestion(); // Display the new question
  } else {
    // If no unanswered questions remain:
    console.log("All questions answered. Ending quiz.");
    clearInterval(timerInterval); // Stop the timer
    quizScreen.classList.add("hide"); // Hide quiz screen
    endScreen.classList.remove("hide"); // Show end screen
    endQuiz(); // Call function to calculate and display final results
  }
}

/**
 * Moves to the previous question.
 * Handles resuming from pause if triggered via Previous button.
 */
function previousQuestion() {
   // Ensure required elements are ready
  if (!pauseButton || !nextButton) {
      console.error("Cannot proceed to previous question: Core elements missing.");
      return;
  }

  // Clear intervals/timeouts associated with the *current* question
  clearInterval(typingInterval);
  clearTimeout(autoNextTimeout);
  pauseButton.classList.add("hide"); // Hide pause button when manually navigating

  // --- Handle Pause State ---
  // If the quiz was paused, clicking Previous should resume it.
  if (isPaused) {
    isPaused = false; // Unpause the state
    console.log("Quiz resumed via Previous button.");
    startTimer(); // Restart the timer explicitly
  }

  // --- Navigate ---
  if (currentQuestion > 0) {
    // If not already on the first question:
    currentQuestion--; // Decrement current question index
    selectedAnswer = null; // Reset selected answer state
    displayQuestion(); // Display the previous question
    // Ensure next button is enabled after going back (unless it's the last question and answered)
    nextButton.disabled = (currentQuestion === shuffledQuestions.length - 1) && shuffledQuestions[currentQuestion]?.answered;
  } else {
      console.log("Already on the first question.");
      // Optionally provide feedback, e.g., button wiggle
  }
}

/**
 * Stops the quiz immediately, clears timers, and shows the end screen with results.
 */
function stopQuiz() {
  // Ensure required elements are ready
  if (!quizScreen || !endScreen || !pauseButton || !nextButton) {
      console.error("Cannot stop quiz: Core elements missing.");
      return;
  }
  console.log("Quiz stopped by user.");
  clearInterval(timerInterval); // Stop the timer
  clearTimeout(autoNextTimeout); // Stop any auto-next
  isPaused = false; // Ensure pause state is reset

  // Transition UI
  quizScreen.classList.add("hide");
  endScreen.classList.remove("hide");
  pauseButton.classList.add("hide"); // Hide pause button
  hideQuiz(); // Hide any other quiz-specific elements if necessary

  // Calculate and display results
  calculateAndDisplayResults();

  // Reset button states for potential restart
  nextButton.disabled = false;
  // Previous button state will be handled if quiz restarts
}

/**
 * Finalizes the quiz, stops timers, and displays the final results screen.
 * Typically called when time runs out or all questions are answered.
 */
function displayFinalResults() {
  // Ensure required elements are ready
  if (!quizScreen || !endScreen || !pauseButton) {
      console.error("Cannot display final results: Core elements missing.");
      return;
  }
  clearInterval(timerInterval); // Ensure timer is stopped
  clearTimeout(autoNextTimeout); // Ensure auto-next is stopped
  isPaused = false; // Reset pause state

  // Transition UI
  quizScreen.classList.add("hide");
  endScreen.classList.remove("hide");
  pauseButton.classList.add("hide"); // Hide pause button on end screen

  // Calculate and display results
  calculateAndDisplayResults();
}

/**
 * Calculates the quiz results (correct, wrong, unanswered) and displays them on the end screen.
 * Uses a typing effect for the numbers.
 */
function calculateAndDisplayResults() {
  // Ensure result elements are ready
  if (!scoreElement || !totalScoreElement) {
      console.error("Cannot display results: Score elements missing.");
      // Attempt to get elements again, maybe they become available later?
      scoreElement = document.querySelector(".final-score");
      totalScoreElement = document.querySelector(".total-score");
      if (!scoreElement || !totalScoreElement) return; // Exit if still not found
  }

  clearInterval(timerInterval); // Ensure timer is stopped again

  let correctCount = 0;
  let wrongCount = 0;

  // Iterate through the questions actually used in this quiz instance
  shuffledQuestions.forEach((q) => {
    if (q && q.answered) { // Check if question exists and was answered
      if (q.isCorrect) {
        correctCount++;
      } else {
        wrongCount++;
      }
    }
  });

  const totalAttempted = correctCount + wrongCount;
  // Calculate unanswered based on the total number of questions selected for the quiz
  const notAnsweredCount = shuffledQuestions.length - totalAttempted;
  const totalQuestionsInQuiz = shuffledQuestions.length; // Total possible score is number of questions
  const finalScore = correctCount; // Score is the number of correct answers

  // --- Get result display elements ---
  // Select elements inside the function as they are on the end screen
  const correctCountEl = document.querySelector(".correct-count");
  const wrongCountEl = document.querySelector(".wrong-count");
  const notAnsweredCountEl = document.querySelector(".not-answered-count");

  // --- Clear previous results and prepare for typing effect ---
  scoreElement.textContent = "";
  totalScoreElement.textContent = "";
  if (correctCountEl) correctCountEl.textContent = "";
  if (wrongCountEl) wrongCountEl.textContent = "";
  if (notAnsweredCountEl) notAnsweredCountEl.textContent = "";

  // Array defining elements and the values to type into them
  const results = [
    { element: scoreElement, value: finalScore.toString() },
    { element: totalScoreElement, value: totalQuestionsInQuiz.toString() },
    { element: correctCountEl, value: correctCount.toString() },
    { element: wrongCountEl, value: wrongCount.toString() },
    { element: notAnsweredCountEl, value: notAnsweredCount.toString() },
  ];

  // Function to type out results sequentially
  function typeOutResults(index) {
    if (index >= results.length) {
      console.log("Finished typing results.");
      return; // Base case: all results typed
    }

    const item = results[index];
    // Check if the element exists before trying to type
    if (item.element) {
      typeText(item.element, item.value, 100) // Use a faster speed for results
        .then(() => {
          // Recursively call for the next item after the current one finishes
          typeOutResults(index + 1);
        })
        .catch(error => {
            console.error("Error typing result:", error);
            // Attempt to continue with the next item even if one fails
            typeOutResults(index + 1);
        });
    } else {
      // Element missing, log warning and skip to the next
      console.warn("Result element missing for index:", index, "Value:", item.value);
      typeOutResults(index + 1);
    }
  }

  // Start typing the results from the first item (index 0)
  typeOutResults(0);
}

/**
 * Called when the quiz ends, either by finishing all questions, time running out, or stopping manually.
 */
function endQuiz() {
  console.log("Quiz ended. Displaying final results.");
  displayFinalResults();
  // Any other cleanup needed at the very end of the quiz session can go here.
}

/**
 * Starts or resumes the quiz timer and updates the progress bar.
 */
function startTimer() {
  // Ensure required elements are ready
  if (!timeLimitInput || !progressText) {
      console.error("Cannot start timer: Required elements missing.");
      return;
  }
  const progressBar = document.querySelector(".progress-bar");
  if (!progressBar) {
    console.error("Progress bar element not found!");
    return;
  }

  // Clear any existing interval to prevent multiple timers running
  clearInterval(timerInterval);
  console.log(`Timer ${timerInterval ? 'restarted' : 'started'}. Time remaining: ${timeRemaining}s`);

  // Calculate total duration based on the *initial* time limit set for the quiz
  // Use the state variable `questionLimit` if time was adjusted, otherwise use input.
  // Let's assume timeLimitInput reflects the *actual* duration set at the start or adjusted.
  const totalDuration = parseInt(timeLimitInput.value) * 60;

  // Avoid division by zero or negative duration
  if (totalDuration <= 0) {
      console.warn("Timer cannot start with zero or negative duration.");
      progressBar.style.width = '0%';
      progressText.innerHTML = "0s";
      return;
  }

  // Update progress bar and text immediately based on current timeRemaining
  const updateProgress = () => {
      if (timeRemaining < 0) timeRemaining = 0; // Prevent negative time

      const hours = Math.floor(timeRemaining / 3600);
      const minutes = Math.floor((timeRemaining % 3600) / 60);
      const seconds = timeRemaining % 60;

      // Format time string (e.g., 1h 15m 30s, 15m 30s, 30s)
      let timeString = "";
      if (hours > 0) {
        timeString = `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
      } else if (minutes > 0) {
        timeString = `${minutes}m ${String(seconds).padStart(2, '0')}s`;
      } else {
        timeString = `${seconds}s`;
      }
      progressText.innerHTML = timeString; // Update time display

      // Calculate percentage remaining
      const percentageRemaining = (timeRemaining / totalDuration) * 100;
      progressBar.style.width = `${Math.max(0, percentageRemaining)}%`; // Ensure width is not negative

      // Change text color for better visibility on progress bar
      progressText.style.color = percentageRemaining >= 49.5 ? "#fff" : "#000";

      // Change progress bar color based on time remaining (optional)
      if (percentageRemaining < 20) {
          progressBar.style.backgroundColor = '#dc3545'; // Red
      } else if (percentageRemaining < 50) {
          progressBar.style.backgroundColor = '#ffc107'; // Yellow
      } else {
          progressBar.style.backgroundColor = '#28a745'; // Green (or default)
      }
  };

  updateProgress(); // Initial update

  // Start the interval timer
  timerInterval = setInterval(() => {
    // Only decrement time if the quiz is NOT paused
    if (!isPaused) {
      if (timeRemaining > 0) {
        timeRemaining--; // Decrement time
        updateProgress(); // Update UI
      }

      // Check if time has run out
      if (timeRemaining <= 0) {
        console.log("Time ran out!");
        clearInterval(timerInterval); // Stop this timer
        if (quizScreen && !quizScreen.classList.contains('hide')) { // Check if quiz is active
            quizScreen.classList.add("hide");
            endScreen.classList.remove("hide");
            if (pauseButton) pauseButton.classList.add("hide");
            hideQuiz(); // Additional cleanup if needed
            endQuiz(); // Go directly to end results
        }
      }
    }
  }, 1000); // Run every second
}

/**
 * Resets the quiz state and returns the user to the start screen.
 * Reloads history and data to ensure freshness (optional, but good practice).
 */
async function restartQuiz() {
  console.log("Restarting quiz...");
  // Ensure required screen elements are ready
  if (!endScreen || !quizScreen || !startScreen || !pauseButton || !errorMessage) {
      console.error("Cannot restart quiz: Core screen elements missing.");
      return;
  }

  // --- Stop Current Quiz Activity ---
  clearInterval(timerInterval);
  clearTimeout(autoNextTimeout);
  isPaused = false; // Reset pause state

  // --- Reset UI ---
  endScreen.classList.add("hide");
  quizScreen.classList.add("hide");
  startScreen.classList.remove("hide"); // Show start screen
  pauseButton.classList.add("hide");
  hideQuiz(); // Hide any other quiz elements
  hideError(); // Clear any lingering error messages

  // --- Reset Quiz State Variables ---
  currentQuestion = 0;
  score = 0;
  selectedAnswer = null;
  shuffledQuestions = [];
  timeRemaining = 0; // Will be set again in startQuiz based on new input

  // --- Reset Input Fields to Defaults (or last used subject's defaults) ---
  // Let showStartScreen handle resetting inputs based on the subject data
  // if (questionLimitInput) questionLimitInput.value = 15; // Default value
  // if (timeLimitInput) timeLimitInput.value = 15; // Default value
  // if (quizLessonDropdown) quizLessonDropdown.value = "সকল পাঠ"; // Reset to default

  // --- Reload Data and History (Optional but recommended) ---
  // This ensures that if the underlying data changed, the restart reflects it.
  // It also ensures history is up-to-date.
  try {
      await loadQuestionHistory();
      const fetchedData = await loadQuestionData();
      if (fetchedData) {
          data = fetchedData;
          // Re-populate dropdown and show start screen for the *current* subjectName
          // subjectName should still hold the value from the last session
          if (subjectName) {
              populateLessonDropdown(subjectName);
              showStartScreen(subjectName); // This will set inputs/limits correctly
          } else {
              console.error("Cannot restart: Subject name is missing.");
              displayError("Error restarting quiz. Please select a subject again.");
              startScreen.classList.add("hide"); // Hide start screen if no subject
          }
      } else {
          throw new Error("Failed to reload question data.");
      }
  } catch (error) {
      console.error("Error reloading data/history on restart:", error);
      displayError("Failed to reload quiz data for restart.");
      startScreen.classList.add("hide"); // Hide start screen on error
  }
}


/**
 * Handles the click event on the pause button. Pauses the timer and auto-next feature.
 */
function handlePauseButtonClick() {
  if (!pauseButton) return; // Safety check

  // Only allow pausing if the button is visible (meaning explanation is shown)
  // and the quiz is not already paused.
  if (!pauseButton.classList.contains("hide") && !isPaused) {
    isPaused = true; // Set pause flag FIRST
    clearInterval(timerInterval); // Stop the timer interval
    clearTimeout(autoNextTimeout); // Stop the pending auto-next timeout
    pauseButton.classList.add("hide"); // Hide the pause button itself (user needs Next/Prev to resume)
    console.log("Quiz paused via button. Timer and auto-next stopped.");
    // Optionally, display a "Paused" indicator somewhere
  } else {
    // Log why pause didn't happen (already paused or button hidden)
    console.log(`Pause button clicked but ignored: isPaused=${isPaused}, button hidden=${pauseButton.classList.contains("hide")}`);
  }
}

// --- Communication with Parent Window (e.g., iframe) ---

window.addEventListener("message", async (event) => {
  // Basic security check: Optionally verify event.origin
  // if (event.origin !== "expected_parent_origin") {
  //   console.warn("Message received from unexpected origin:", event.origin);
  //   return;
  // }

  const messageData = event.data;

  // --- Handle Subject Name Message ---
  if (messageData && messageData.subjectName) {
    subjectName = messageData.subjectName;
    console.log("Received subject name:", subjectName);

    // Ensure DOM elements are ready before proceeding (they should be if DOMContentLoaded fired)
    if (!startScreenHeading || !timeLimitInput || !questionLimitInput || !quizLessonDropdown || !startButton || !errorMessage || !lessonDropdownMenu) {
        console.error("DOM elements not ready when subject name received.");
        // Maybe wait or retry? For now, log error.
        displayError("Initialization error after receiving subject. Please refresh.");
        return;
    }

    // Reset UI elements on the start screen for the new subject
    startScreenHeading.textContent = ""; // Clear previous heading
    timeLimitInput.value = 15; // Reset to default
    questionLimitInput.value = 15; // Reset to default
    quizLessonDropdown.value = "সকল পাঠ"; // Reset dropdown
    quizLessonDropdown.innerHTML = ""; // Clear old options
    lessonDropdownMenu.classList.add("hide"); // Hide dropdown until populated
    startButton.disabled = true; // Disable start button initially
    hideError(); // Clear any previous errors

    // Apply typing effect to labels and button (check element existence)
    const timeLimitLabelElement = document.getElementById("time-limit-label");
    const questionLimitLabelElement = document.getElementById("question-limit-label");
    const quizLessonLabelElement = document.getElementById("quiz-lesson-label");

    if (timeLimitLabelElement) typeText(timeLimitLabelElement, "মিনিট নির্ধারণ করুন :", 30);
    if (questionLimitLabelElement) typeText(questionLimitLabelElement, "প্রশ্নের সংখ্যা নির্ধারণ করুন :", 30);
    if (startButton) typeText(startButton, "কুইজ শুরু করুন", 30);
    if (quizLessonLabelElement) typeText(quizLessonLabelElement, "পাঠ নির্বাচন করুন :", 30);

    // Load history and data (data loading also initializes history structure)
    try {
      await loadQuestionHistory(); // Load history first
      const fetchedData = await loadQuestionData(); // Then load data

      if (fetchedData) {
        data = fetchedData;
        // Now populate dropdown and show start screen with correct limits
        populateLessonDropdown(subjectName); // Populate based on loaded data
        showStartScreen(subjectName); // Show screen, set limits, validate
      } else {
        // Handle data loading failure
        console.error("Data is null after load attempt for subject:", subjectName);
        displayError("Error loading questions for this subject. Please try another.");
        startScreen.classList.add('hide'); // Hide start screen if data fails
      }
    } catch (error) {
      console.error("Error loading history or data for subject:", subjectName, error);
      displayError("Failed to load quiz setup data. Please refresh.");
      startScreen.classList.add('hide'); // Hide start screen on error
    }
  }
  // --- Handle Close Quiz Message ---
  else if (messageData === "closeQuiz") {
    console.log("Received closeQuiz message from parent.");
    closeQuiz();
  }
  // --- Handle Reload Quiz Message ---
  else if (messageData === "reloadQuiz") {
    console.log("Received reloadQuiz message from parent.");
    // Similar logic to restart, but might need specific handling depending on parent context
    restartQuiz(); // For now, just restart the quiz
  }
});

/**
 * Sends a message to the parent window to close the quiz (e.g., hide the iframe).
 * Performs local cleanup.
 */
function closeQuiz() {
  console.log("Sending closeQuiz message to parent.");
  // Stop timers and clear state
  clearInterval(timerInterval);
  clearTimeout(autoNextTimeout);
  isPaused = false;
  // Send message to parent window
  if (window.parent && window.parent !== window) {
      window.parent.postMessage("closeQuiz", "*"); // Use specific origin in production
  }
  // Optionally hide the quiz interface locally as well
  if(quizScreen) quizScreen.classList.add('hide');
  if(startScreen) startScreen.classList.add('hide');
  if(endScreen) endScreen.classList.add('hide');
  document.body.innerHTML = "Quiz closed."; // Or some other placeholder
}

/**
 * Simulates typing text into an HTML element.
 * @param {HTMLElement} element The target element.
 * @param {string} text The text to type.
 * @param {number} speed The delay between characters in milliseconds.
 * @param {function} [callback] Optional callback function executed when typing is complete.
 * @returns {Promise<void>} A promise that resolves when typing is complete.
 */
function typeText(element, text, speed, callback) {
  return new Promise((resolve, reject) => {
    // Validate inputs
    if (!element || typeof text !== 'string' || typeof speed !== 'number' || speed <= 0) {
      console.warn("typeText: Invalid arguments provided.", { element, text, speed });
      if (element && typeof text === 'string') element.textContent = text; // Set text directly as fallback
      if (callback) callback();
      resolve(); // Resolve promise even on error/fallback
      return;
    }

    let i = 0;
    element.innerHTML = ""; // Clear existing content

    // Clear any previous interval associated with this specific element
    // Store interval ID on a custom property of the element
    if (element.typingInterval) {
      clearInterval(element.typingInterval);
      element.typingInterval = null;
    }

    const interval = setInterval(() => {
      if (i >= text.length) {
        // Typing complete
        clearInterval(interval);
        element.typingInterval = null; // Clear the stored interval ID
        if (callback) {
            try {
                callback(); // Execute callback
            } catch (e) {
                console.error("Error in typeText callback:", e);
            }
        }
        resolve(); // Resolve the promise
        return;
      }

      // Append the next character
      const char = text.charAt(i);
      // Handle newline characters specifically if needed, otherwise just append
      // if (char === '\n') {
      //   element.appendChild(document.createElement("br"));
      // } else {
         element.textContent += char; // Use textContent for safety against HTML injection if text is untrusted
      // }
      i++;
    }, speed);

    // Store the interval ID on the element itself
    element.typingInterval = interval;
  });
}

/**
 * Shuffles an array in place using the Fisher-Yates (Durstenfeld) algorithm.
 * @param {Array} array The array to shuffle.
 * @returns {Array} The shuffled array (the same array instance passed in).
 */
function shuffleArray(array) {
  if (!Array.isArray(array)) return array; // Return input if not an array
  // Create a copy to avoid modifying the original array passed by reference
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    // Pick a random index from 0 to i
    const j = Math.floor(Math.random() * (i + 1));
    // Swap elements shuffled[i] and shuffled[j]
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled; // Return the new shuffled array
}

/**
 * Shows the main quiz interface elements.
 */
function showQuiz() {
  if (!quizScreen || !quizHeading) return; // Safety check
  quizScreen.classList.add("show"); // Add 'show' class (for potential animations)
  quizScreen.classList.remove("hide"); // Ensure 'hide' class is removed
  document.body.style.backgroundColor = "#fff"; // Set background for quiz screen

  // Clear and apply typing effect to the quiz heading
  quizHeading.textContent = "";
  typeText(quizHeading, subjectName || "Quiz", 30); // Use subjectName or a default
}

/**
 * Hides the main quiz interface elements.
 */
function hideQuiz() {
  if (!quizScreen) return; // Safety check
  quizScreen.classList.remove("show"); // Remove 'show' class
  quizScreen.classList.add("hide"); // Add 'hide' class
  document.body.style.backgroundColor = ""; // Reset background color
}

/**
 * Populates the lesson selection dropdown based on the available questions for the subject.
 * Hides the dropdown if no lessons or image questions are found.
 * @param {string} currentSubjectName The name of the subject to populate lessons for.
 */
function populateLessonDropdown(currentSubjectName) {
  // Ensure elements and data are ready
  if (!quizLessonDropdown || !lessonDropdownMenu || !data || !data.sections) {
    console.warn("Cannot populate lesson dropdown: Elements or data not ready.");
    if (lessonDropdownMenu) lessonDropdownMenu.classList.add("hide"); // Hide if possible
    if (quizLessonDropdown) quizLessonDropdown.disabled = true;
    return;
  }

  const lessonDropdown = quizLessonDropdown;
  lessonDropdown.innerHTML = ""; // Clear previous options

  // Find the data section for the current subject
  const section = data.sections.find((s) => s.section === currentSubjectName);
  let subjectQuestions = [];
  if (section && section.questions && Array.isArray(section.questions)) {
      subjectQuestions = section.questions.filter(q => q && q.question); // Get valid questions
  }

  // --- Scan questions to find characteristics ---
  let hasAnyImage = false;
  let hasAnyLessons = false;
  const uniqueLessons = new Set(); // Store unique lesson names

  if (subjectQuestions.length > 0) {
      subjectQuestions.forEach((q) => {
          // Check for images (question or options) - stop checking once one is found
          if (!hasAnyImage) {
              if (containsImageMarker(q.question) ||
                  (q.options && Array.isArray(q.options) && q.options.some(opt => {
                      if (typeof opt !== "object" || opt === null || Object.keys(opt).length === 0) return false;
                      return containsImageMarker(Object.keys(opt)[0]);
                  }))
              ) {
                  hasAnyImage = true;
              }
          }

          // Check for and collect valid, non-empty lesson names
          if (q.lesson && typeof q.lesson === "string" && q.lesson.trim() !== "") {
              hasAnyLessons = true;
              uniqueLessons.add(q.lesson.trim());
          }
      });
  }
  // --- End Scan ---

  // --- Determine Dropdown Visibility and Populate ---

  // Case 1: No questions found for the subject at all.
  if (subjectQuestions.length === 0) {
    console.log(`No questions found for subject: ${currentSubjectName}. Hiding lesson dropdown.`);
    lessonDropdownMenu.classList.add("hide");
    lessonDropdown.disabled = true;
    selectedLesson = "সকল পাঠ"; // Reset state
    return; // Stop populating
  }

  // Case 2: Questions exist, but NEITHER specific lessons NOR image questions were found.
  // In this scenario, the only meaningful filter is "All Lessons", so hide the dropdown.
  if (!hasAnyLessons && !hasAnyImage) {
    console.log(`No specific lessons or image questions found for ${currentSubjectName}. Hiding dropdown.`);
    lessonDropdownMenu.classList.add("hide");
    lessonDropdown.disabled = true;
    selectedLesson = "সকল পাঠ"; // Default to using all available questions
    return; // Stop populating
  }

  // Case 3: EITHER specific lessons OR image questions (or both) exist. Show the dropdown.
  lessonDropdownMenu.classList.remove("hide");
  lessonDropdown.disabled = false;

  // Always add "সকল পাঠ" (All Lessons) option first
  const allLessonsOption = document.createElement("option");
  allLessonsOption.value = "সকল পাঠ";
  allLessonsOption.textContent = "সকল পাঠ";
  lessonDropdown.appendChild(allLessonsOption);

  // Conditionally add "Image Questions Only" option if images were found
  if (hasAnyImage) {
    const imageOnlyOption = document.createElement("option");
    imageOnlyOption.value = "image_questions_only";
    imageOnlyOption.textContent = "শুধুমাত্র ছবিযুক্ত প্রশ্ন"; // Text for image filter
    lessonDropdown.appendChild(imageOnlyOption);
    console.log("Adding 'Image Only' option.");
  }

  // Conditionally add specific lesson options if lessons were found
  if (hasAnyLessons) {
    const sortedLessons = Array.from(uniqueLessons).sort(); // Sort lessons alphabetically
    sortedLessons.forEach((lesson) => {
      const option = document.createElement("option");
      option.value = lesson;
      option.textContent = lesson; // Display lesson name
      lessonDropdown.appendChild(option);
    });
    console.log("Adding specific lesson options:", sortedLessons);
  }

  // Set default selection and update state
  lessonDropdown.value = "সকল পাঠ";
  selectedLesson = "সকল পাঠ"; // Update state to match default selection
}


/**
 * Updates the `min` and `max` attributes of the question/time limit inputs
 * based on the number of questions available for the currently selected lesson/filter.
 * Also adjusts the current input values if they fall outside the new range and re-validates.
 */
function updateMinLimitsForLesson() {
  // Ensure elements and subject's base questions are ready
  if (!questionLimitInput || !timeLimitInput || !quizLessonDropdown || !questions) {
    console.warn("Cannot update limits: Elements or base questions data not ready.");
    // Set safe defaults if elements exist but data doesn't
    if (questionLimitInput) { questionLimitInput.min = 1; questionLimitInput.max = 1; questionLimitInput.value = 1; }
    if (timeLimitInput) { timeLimitInput.min = 1; timeLimitInput.max = 1; timeLimitInput.value = 1; }
    if (startButton) startButton.disabled = true; // Disable start if limits can't be set
    return;
  }

  // Determine the filter to use (dropdown value or default if disabled)
  const selectedFilter = quizLessonDropdown.disabled ? "সকল পাঠ" : quizLessonDropdown.value;

  // Filter the base 'questions' array (all questions for the subject) using the selected filter
  // Use the reusable filterQuestions function
  const filteredQuestionsForLimit = filterQuestions(questions, selectedFilter);
  const maxQuestionsForFilter = filteredQuestionsForLimit.length;
  const currentFilterText = getCurrentFilterText(); // Get text for messages

  let newMinLimit = 1; // Absolute minimum is 1

  // --- Determine new min/max based on available questions ---
  if (maxQuestionsForFilter <= 0) {
    // No questions available for this filter
    newMinLimit = 1; // Keep min at 1
    // maxQuestionsForFilter is already 0, but input max cannot be less than min
    questionLimitInput.max = 1;
    timeLimitInput.max = 1;
    // Display error only if the dropdown menu itself is visible
    if (lessonDropdownMenu && !lessonDropdownMenu.classList.contains("hide")) {
        displayError(`No questions available for the filter: "${currentFilterText}".`);
    } else {
        // If dropdown is hidden, it means no filters were applicable anyway, so don't show error.
        // Or, if the base subject had no questions, an error might be shown elsewhere.
        hideError(); // Hide any previous error
    }
  } else {
    // Questions are available, determine min based on count (example logic)
    if (maxQuestionsForFilter < 10) {
        newMinLimit = 1; // Allow starting with few questions
    } else if (maxQuestionsForFilter < 30) {
        newMinLimit = 10; // Suggest at least 10 if available
    } else {
        newMinLimit = 15; // Default suggested min if plenty available (adjust as needed)
    }
    // Ensure min is not greater than the actual max available
    newMinLimit = Math.min(newMinLimit, maxQuestionsForFilter);

    // Set the actual max based on filtered count
    questionLimitInput.max = maxQuestionsForFilter;
    timeLimitInput.max = maxQuestionsForFilter; // Keep time max same as question max

    // Hide the "no questions available" error if it was previously shown
    if (errorMessage && errorMessage.textContent.includes("No questions available")) {
      hideError();
    }
  }

  // --- Update input attributes ---
  questionLimitInput.min = newMinLimit;
  timeLimitInput.min = newMinLimit; // Keep time min same as question min

  // --- Adjust current values if they are outside the new range ---
  const currentQVal = parseInt(questionLimitInput.value) || newMinLimit; // Default to new min if invalid
  const currentTVal = parseInt(timeLimitInput.value) || newMinLimit;

  // Clamp values within the new [min, max] range
  questionLimitInput.value = Math.min(Math.max(currentQVal, newMinLimit), parseInt(questionLimitInput.max));
  timeLimitInput.value = Math.min(Math.max(currentTVal, newMinLimit), parseInt(timeLimitInput.max));

  // Re-validate inputs to update error message and start button state
  validateInputs();
}


/**
 * Shows the start screen, populates subject-specific info, and sets up initial input limits.
 * @param {string} currentSubjectName The name of the subject being set up.
 */
function showStartScreen(currentSubjectName) {
  // Ensure required elements are ready
  if (
    !startScreen || !startScreenHeading || !data || !data.sections ||
    !questionLimitInput || !timeLimitInput || !quizLessonDropdown ||
    !startButton || !quizScreen || !endScreen || !lessonDropdownMenu
  ) {
    console.error("Cannot show start screen: Required elements or data not ready.");
    displayError("Initialization error. Please refresh.");
    return;
  }

  console.log(`Setting up start screen for subject: ${currentSubjectName}`);

  // Apply typing effect to the heading
  typeText(startScreenHeading, currentSubjectName || "Quiz Setup", 30);

  // Find the section data for the current subject
  const section = data.sections.find((s) => s.section === currentSubjectName);

  // Set the global 'questions' array for the current subject
  if (section && section.questions && Array.isArray(section.questions)) {
    // Filter out any potentially invalid question entries right away
    questions = section.questions.filter(q => q && q.question);
    console.log(`Loaded ${questions.length} valid questions for ${currentSubjectName}.`);
  } else {
    console.error(`Subject data or questions not found for: ${currentSubjectName}`);
    questions = []; // Reset global questions array
  }

  // --- Handle UI based on whether questions exist ---
  if (questions.length > 0) {
    // Questions exist: Enable inputs, update limits based on dropdown state
    questionLimitInput.disabled = false;
    timeLimitInput.disabled = false;
    // Dropdown enabled state is handled by populateLessonDropdown

    // Update min/max limits based on the *currently selected* filter in the dropdown
    // (populateLessonDropdown should have already run and set the default)
    updateMinLimitsForLesson(); // This sets min/max and validates

    // Start button state is handled by validateInputs within updateMinLimitsForLesson
  } else {
    // No questions found for this subject: Disable inputs, show error
    questionLimitInput.disabled = true;
    timeLimitInput.disabled = true;
    quizLessonDropdown.disabled = true; // Ensure dropdown is disabled
    lessonDropdownMenu.classList.add("hide"); // Ensure dropdown is hidden
    startButton.disabled = true; // Disable start button

    // Set placeholder limits
    questionLimitInput.min = 1; questionLimitInput.max = 1; questionLimitInput.value = 1;
    timeLimitInput.min = 1; timeLimitInput.max = 1; timeLimitInput.value = 1;

    displayError(`No questions available for the subject "${currentSubjectName}".`);
  }

  // --- Make Screens Visible/Hidden ---
  startScreen.classList.remove("hide");
  quizScreen.classList.add("hide");
  endScreen.classList.add("hide");

  // Final validation check (might be redundant if updateMinLimitsForLesson called it, but safe)
  validateInputs();
}


// --- DOMContentLoaded Event Listener ---
// This is where element assignments and initial event listeners are set up.
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded and parsed.");

  // --- Assign all DOM elements to variables ---
  startScreenHeading = document.getElementById("start-screen-heading");
  startScreen = document.querySelector(".start-screen");
  quizScreen = document.querySelector(".quiz");
  endScreen = document.querySelector(".end-screen");
  questionElement = document.querySelector(".question"); // Inside quiz screen
  answerWrapperElement = document.querySelector(".answer-wrapper"); // Inside quiz screen
  nextButton = document.querySelector(".next"); // Inside quiz screen controls
  scoreElement = document.querySelector(".final-score"); // Inside end screen
  totalScoreElement = document.querySelector(".total-score"); // Inside end screen
  progressText = document.querySelector(".progress-text"); // Inside timer/progress bar
  timer = document.querySelector(".timer"); // Timer container
  previousButton = document.querySelector(".previous"); // Inside quiz screen controls
  stopButton = document.querySelector(".stop"); // Inside quiz screen controls
  pauseButton = document.querySelector(".pause"); // Inside quiz screen controls (appears conditionally)
  errorMessage = document.querySelector(".error-message"); // Error display area
  startButton = document.querySelector(".start"); // On start screen
  quizHeading = document.querySelector(".quiz-heading"); // Heading on quiz screen
  // uContainer = document.getElementById("u-container"); // Not used? Check HTML
  numberProgressContainer = document.querySelector(".number-progress"); // Question counter container
  // questionContainer = document.querySelector(".question"); // Already assigned to questionElement
  questionLimitInput = document.getElementById("question-limit"); // On start screen
  timeLimitInput = document.getElementById("time-limit"); // On start screen
  quizLessonDropdown = document.getElementById("quiz-lesson"); // On start screen
  lessonDropdownMenu = document.getElementById("lesson-dropdown-menu"); // Container for lesson dropdown + label

  // --- Initial UI State ---
  // Hide screens initially, wait for subject name message
  if (quizScreen) quizScreen.classList.add("hide");
  if (endScreen) endScreen.classList.add("hide");
  if (startScreen) startScreen.classList.add("hide");
  if (pauseButton) pauseButton.classList.add("hide"); // Pause button hidden by default
  if (lessonDropdownMenu) lessonDropdownMenu.classList.add("hide"); // Lesson dropdown hidden by default
  if (errorMessage) errorMessage.classList.add("hide"); // Error message hidden by default
  if (startButton) startButton.disabled = true; // Start button disabled until subject/data loaded and validated
  if (nextButton) nextButton.disabled = false; // Initial state (will be updated based on question)
  if (previousButton) previousButton.disabled = true; // Prev button disabled initially

  // --- Add Core Event Listeners ---
  // Ensure elements exist before adding listeners
  if (startButton) {
    startButton.addEventListener("click", startQuiz);
  } else { console.error("Start button not found!"); }

  if (nextButton) {
    nextButton.addEventListener("click", nextQuestion);
  } else { console.error("Next button not found!"); }

  if (previousButton) {
    previousButton.addEventListener("click", previousQuestion);
  } else { console.error("Previous button not found!"); }

  if (stopButton) {
    stopButton.addEventListener("click", stopQuiz);
  } else { console.error("Stop button not found!"); }

  if (pauseButton) {
    pauseButton.addEventListener("click", handlePauseButtonClick);
  } else { console.error("Pause button not found!"); }

  const restartButton = document.querySelector(".restart"); // On end screen
  if (restartButton) {
    restartButton.addEventListener("click", restartQuiz);
  } else { console.error("Restart button not found!"); }

  // Listener for lesson dropdown changes
  if (quizLessonDropdown) {
    quizLessonDropdown.addEventListener("change", function () {
      selectedLesson = this.value; // Update selected lesson state
      console.log("Lesson/filter changed to:", selectedLesson);
      updateMinLimitsForLesson(); // Update limits and validate based on new selection
    });
  } else { console.error("Lesson dropdown not found!"); }

  // Listeners for input validation and number restriction
  if (questionLimitInput) {
    questionLimitInput.addEventListener("input", validateInputs);
    restrictToNumbers(questionLimitInput);
  } else { console.error("Question limit input not found!"); }

  if (timeLimitInput) {
    timeLimitInput.addEventListener("input", validateInputs);
    restrictToNumbers(timeLimitInput);
  } else { console.error("Time limit input not found!"); }

  // --- Post-DOM Load Checks ---
  console.log("DOM setup complete. Waiting for subject name message from parent...");

  // Inform parent window that the quiz iframe is ready (if applicable)
  if (window.parent && window.parent !== window) {
     console.log("Sending 'quizReady' message to parent.");
     window.parent.postMessage("quizReady", "*"); // Use specific origin in production
     // Parent should respond with subjectName message
  } else {
      console.warn("Not running in an iframe or cannot access parent.");
      // Handle standalone mode? Or display message asking to be embedded?
      // For testing, you might manually call setup functions here with a default subject
      // Example:
      // subjectName = "Sample Subject"; // Hardcode for testing
      // loadQuestionHistory().then(() => loadQuestionData()).then(d => {
      //     if(d) { data = d; populateLessonDropdown(subjectName); showStartScreen(subjectName); }
      // });
       displayError("Quiz cannot load subject. Ensure it's run correctly.");
  }
});

/**
 * Clears the entire question history from IndexedDB and resets the in-memory history.
 * Useful for testing or providing a user option to reset progress.
 * @returns {Promise<void>}
 */
async function clearQuestionHistory() {
  console.warn("Attempting to clear ALL question history from IndexedDB...");
  try {
    await saveQuestionHistoryToDB({}); // Save an empty object, effectively clearing the store
    questionHistory = {}; // Reset in-memory history object
    // Re-initialize structure based on current data (if loaded)
    if (data && data.sections) {
      data.sections.forEach((section) => {
        if (section && section.section) {
            // No need to add empty objects here, selectQuestions will handle initialization
        }
      });
    }
    console.log("Question history successfully cleared.");
    // Optionally, inform the user (e.g., on a settings page)
    alert("Question history has been cleared."); // Simple alert for confirmation
  } catch (error) {
    console.error("Error clearing question history:", error);
    displayError("Could not clear question history due to an error.");
  }
}

// Example Usage from Console:
// To clear history: clearQuestionHistory()
// To manually start (for testing without parent):
// subjectName = 'اسم الموضوع'; loadQuestionHistory().then(()=>loadQuestionData()).then(d=>{if(d){data=d; populateLessonDropdown(subjectName); showStartScreen(subjectName);}});