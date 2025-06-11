/* quiz.js */
// --- Global Variables ---
// State Management
let questions = [], // Holds questions for the *current* subject after loading
  currentQuestion = 0, // Index of the currently displayed question in shuffledQuestions
  score = 0, // User's score for the current quiz session (number of correctly filled BLANKS)
  timeRemaining = 0, // Time left in seconds
  timerInterval, // Interval ID for the main quiz timer
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
  timeLimitInput = null,
  quizLessonDropdown = null,
  lessonDropdownMenu = null; // The container div for the lesson dropdown label and select

// IndexedDB setup
const dbName = "quizHistoryDB";
const storeName = "questionHistoryStore";
let db; // Holds the IndexedDB database connection

// --- IndexedDB Functions ---
function openDatabase() {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }
    const request = indexedDB.open(dbName, 1);

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
        db.createObjectStore(storeName);
        console.log(`Object store '${storeName}' created.`);
      }
    };
  });
}

async function getQuestionHistoryFromDB() {
  try {
    await openDatabase();
    return new Promise((resolve, reject) => {
      if (!db) {
        console.error("getQuestionHistoryFromDB: Database connection not available.");
        resolve({});
        return;
      }
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.get("questionHistory");

      request.onerror = (event) => {
        console.error("Error getting question history from IndexedDB:", event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        console.log("Question history retrieved from IndexedDB.");
        resolve(event.target.result || {});
      };
    });
  } catch (error) {
      console.error("Failed to open database for reading history:", error);
      return {};
  }
}

async function saveQuestionHistoryToDB(history) {
    try {
        await openDatabase();
        return new Promise((resolve, reject) => {
            if (!db) {
                console.error("saveQuestionHistoryToDB: Database connection not available.");
                reject("Database connection not available.");
                return;
            }
            const transaction = db.transaction(storeName, "readwrite");
            const store = transaction.objectStore(storeName);
            const request = store.put(history, "questionHistory");

            request.onerror = (event) => {
                console.error("Error saving question history to IndexedDB:", event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = () => {
                console.log("Question history saved to IndexedDB.");
                resolve();
            };
        });
    } catch (error) {
        console.error("Failed to open database for saving history:", error);
        return Promise.reject(error);
    }
}

// --- Utility Functions ---
function stripHTML(html) {
  let temp = document.createElement("div");
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || "";
}

function containsImageMarker(text) {
  if (typeof text !== 'string' || !text) {
    return false;
  }
  const imageRegex = /(\(image\/[^\)]+\))|<img\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/i;
  return imageRegex.test(text);
}

function containsSVGMarker(text) {
  if (typeof text !== 'string' || !text) {
    return false;
  }
  const svgRegex = /<svg[\s>]/i;
  return svgRegex.test(text);
}

function convertNewlinesToHtml(text) {
  if (typeof text !== "string") {
    return "";
  }
  return text.replace(/\n/g, "<br>");
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function restrictToNumbers(inputElement) {
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
    if (typeof unsafe !== 'string') return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function extractCorrectAnswers(explanationString) {
    const answers = {};
    if (!explanationString) return answers;

    const cleanedString = explanationString.replace(/<\/?p>/g, '').trim();
    const parts = cleanedString.split(';');

    parts.forEach(part => {
        part = part.trim();
        if (!part) return;
        const match = part.match(/\(([a-z])\)\s*(.*)/i);
        if (match) {
            const blankId = match[1].toLowerCase();
            const answerText = match[2].trim();
            answers[blankId] = answerText.split('/').map(ans => ans.trim().toLowerCase());
        }
    });
    return answers;
}

// --- Core Application Logic ---
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

  questionsData.sections.forEach((section) => {
      if (section && section.section && !questionHistory[section.section]) {
          questionHistory[section.section] = {};
      }
  });
  return questionsData;
}

async function loadQuestionHistory() {
  try {
    const loadedHistory = await getQuestionHistoryFromDB();
    if (typeof loadedHistory === "object" && loadedHistory !== null) {
        questionHistory = loadedHistory;
    } else {
        questionHistory = {};
    }
  } catch (error) {
    console.error("Error loading question history:", error);
    questionHistory = {};
    displayError("Error loading question history. Progress tracking might be affected.");
  }
}

async function saveQuestionHistory() {
  try {
    await saveQuestionHistoryToDB(questionHistory);
  } catch (error) {
    console.error("Error saving question history:", error);
  }
}

function displayError(message) {
  if (errorMessage) {
    errorMessage.textContent = message;
    errorMessage.classList.remove("hide");
    errorMessage.style.opacity = 1;
  } else {
    alert(`Error: ${message}`);
  }
}

function hideError() {
    if (errorMessage && !errorMessage.classList.contains("hide")) {
        errorMessage.textContent = "";
        errorMessage.style.opacity = 0;
        errorMessage.classList.add("hide");
    }
}

function validateInputs() {
  if (!questionLimitInput || !timeLimitInput || !startButton || !errorMessage) {
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
      isValid = false;
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
function populateLessonDropdown(subjectName) {
  if (!quizLessonDropdown || !lessonDropdownMenu || !data || !data.sections) {
    if (lessonDropdownMenu) lessonDropdownMenu.classList.add("hide");
    if (quizLessonDropdown) quizLessonDropdown.disabled = true;
    return;
  }

  const lessonDropdown = quizLessonDropdown;
  lessonDropdown.innerHTML = "";

  const section = data.sections.find((s) => s.section === subjectName);
  let hasAnyImage = false;
  let hasAnySVG = false;
  let hasAnyLessons = false;
  let hasAnyQuestions = false;
  const uniqueLessons = new Set();

  if (section?.questions?.length > 0) {
    hasAnyQuestions = true;
    section.questions.forEach((q) => {
      if (!q) return;
      if (!hasAnyImage) {
        hasAnyImage = containsImageMarker(q.question) ||
                      q.options?.some(opt => {
                          const key = Object.keys(opt || {})[0];
                          return key && containsImageMarker(key);
                      });
      }
      if (!hasAnySVG) {
        hasAnySVG = containsSVGMarker(q.question) ||
                    q.options?.some(opt => {
                        const key = Object.keys(opt || {})[0];
                        return key && containsSVGMarker(key);
                    });
      }
      if (q.lesson && typeof q.lesson === "string" && q.lesson.trim()) {
        hasAnyLessons = true;
        uniqueLessons.add(q.lesson.trim());
      }
    });
  }

  const shouldShowDropdown = hasAnyQuestions && (hasAnyImage || hasAnySVG || hasAnyLessons);

  if (shouldShowDropdown) {
    lessonDropdownMenu.classList.remove("hide");
    lessonDropdown.disabled = false;
    lessonDropdown.options.add(new Option("সকল পাঠ", "সকল পাঠ"));
    if (hasAnyImage) lessonDropdown.options.add(new Option("শুধুমাত্র ছবিযুক্ত প্রশ্ন", "image_questions_only"));
    if (hasAnySVG) lessonDropdown.options.add(new Option("শুধুমাত্র SVG প্রশ্ন", "svg_questions_only"));
    if (hasAnyLessons) {
      Array.from(uniqueLessons).sort().forEach(lesson => lessonDropdown.options.add(new Option(lesson, lesson)));
    }
  } else {
    lessonDropdownMenu.classList.add("hide");
    lessonDropdown.disabled = true;
    selectedLesson = "সকল পাঠ";
  }
  lessonDropdown.value = "সকল পাঠ";
  selectedLesson = "সকল পাঠ";
}

function updateMinLimitsForLesson() {
  if (!questionLimitInput || !timeLimitInput || !quizLessonDropdown || !questions) {
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

  let filteredQuestions = [];
  if (Array.isArray(questions)) {
      if (lessonFilter === "image_questions_only") {
          filteredQuestions = questions.filter(q => q && (containsImageMarker(q.question) || q.options?.some(opt => { const key = Object.keys(opt || {})[0]; return key && containsImageMarker(key); })));
      } else if (lessonFilter === "svg_questions_only") {
          filteredQuestions = questions.filter(q => q && (containsSVGMarker(q.question) || q.options?.some(opt => { const key = Object.keys(opt || {})[0]; return key && containsSVGMarker(key); })));
      } else if (lessonFilter !== "সকল পাঠ") {
          filteredQuestions = questions.filter(q => q?.lesson === lessonFilter);
      } else {
          filteredQuestions = questions.filter(q => q);
      }
  }

  const availableCount = filteredQuestions.length;
  let newMinLimit = 1;
  let newMaxLimit = Math.max(1, availableCount);

  if (availableCount === 0) {
      displayError(`No questions available for the ${filterText}.`);
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

  questionLimitInput.min = newMinLimit;
  timeLimitInput.min = newMinLimit;
  questionLimitInput.max = newMaxLimit;
  timeLimitInput.max = newMaxLimit;

  const currentQVal = parseInt(questionLimitInput.value) || newMinLimit;
  const currentTVal = parseInt(timeLimitInput.value) || newMinLimit;

  questionLimitInput.value = Math.min(Math.max(currentQVal, newMinLimit), newMaxLimit);
  timeLimitInput.value = Math.min(Math.max(currentTVal, newMinLimit), newMaxLimit);
  validateInputs();
}

// --- Quiz Lifecycle Functions ---
async function startQuiz() {
  const requiredElements = [questionLimitInput, timeLimitInput, quizLessonDropdown, startButton, startScreen, quizScreen, quizHeading, lessonDropdownMenu, errorMessage];
  if (requiredElements.some(el => !el)) {
      displayError("Initialization error. Please refresh the page.");
      return;
  }
  if (!validateInputs()) return;

  questionLimit = parseInt(questionLimitInput.value);
  timeRemaining = parseInt(timeLimitInput.value) * 60;
  currentQuestion = 0;
  score = 0;
  shuffledQuestions = [];
  isPaused = false;

  if (quizLessonDropdown.disabled || lessonDropdownMenu.classList.contains('hide')) {
      selectedLesson = "সকল পাঠ";
  } else {
      selectedLesson = quizLessonDropdown.value;
  }

  if (!data || !subjectName) {
      displayError("Quiz data failed to load or subject missing. Please refresh.");
      return;
  }
  const section = data.sections.find((s) => s.section === subjectName);
  if (!section?.questions) {
      displayError("Subject data not found. Please select a subject again.");
      return;
  }

  let baseQuestions = section.questions.filter(q => q);
  let filteredQuestions = [];
  let currentFilterText = "selected filter";
   if (!quizLessonDropdown.disabled && quizLessonDropdown.selectedIndex >= 0) {
       currentFilterText = `"${quizLessonDropdown.options[quizLessonDropdown.selectedIndex].text}"`;
   } else if (selectedLesson === "সকল পাঠ"){
       currentFilterText = '"সকল পাঠ"';
   }

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

  let actualLimit = questionLimit;
  if (questionLimit > filteredQuestions.length) {
      actualLimit = filteredQuestions.length;
      questionLimitInput.value = actualLimit;
      if (parseInt(timeLimitInput.value) > actualLimit) {
          timeLimitInput.value = actualLimit;
          timeRemaining = actualLimit * 60;
      }
      validateInputs();
  }

  try {
      shuffledQuestions = await selectQuestions(filteredQuestions, actualLimit, subjectName, selectedLesson);
  } catch (error) {
      displayError("An error occurred while selecting questions.");
      return;
  }

  if (shuffledQuestions.length === 0) {
      displayError("Could not select any questions for the quiz. Please try again or change filters.");
      return;
  }

  shuffledQuestions.forEach(qData => {
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
    } else {
        qData.numBlanks = 0;
        qData.blankIds = [];
    }
    qData.answered = false;
    qData.userAnswers = {};
    qData.correctnessPerBlank = {};
  });

  startScreen.classList.add("hide");
  quizScreen.classList.remove("hide");
  endScreen.classList.add("hide");
  hideError();
  if (quizHeading) quizHeading.textContent = subjectName;
  displayQuestion();
  startTimer();
  showQuiz();
}

async function selectQuestions(allFilteredQuestions, limit, subject, lessonOrFilter) {
    let historyKey;
    if (lessonOrFilter === "image_questions_only") historyKey = `${subject}-images_only`;
    else if (lessonOrFilter === "svg_questions_only") historyKey = `${subject}-svg_only`;
    else if (lessonOrFilter === "সকল পাঠ") historyKey = `${subject}-all`;
    else historyKey = `${subject}-${lessonOrFilter}`;

    const actualLimit = Math.min(limit, allFilteredQuestions.length);
    if (limit > allFilteredQuestions.length) {
        console.warn(`Requested limit ${limit} exceeds available filtered questions ${allFilteredQuestions.length}. Using ${actualLimit}.`);
    }

    if (!questionHistory[subject]) questionHistory[subject] = {};
    if (!questionHistory[subject][historyKey]) questionHistory[subject][historyKey] = [];

    const historyList = questionHistory[subject][historyKey];
    let availableQuestions = allFilteredQuestions.filter(q => q?.question && !historyList.includes(q.question));
    let selectedQuestions = [];
    let historyWasReset = false;

    if (availableQuestions.length < actualLimit) {
        if (availableQuestions.length === 0 && historyList.length >= allFilteredQuestions.length && allFilteredQuestions.length > 0) {
            questionHistory[subject][historyKey] = [];
            historyList.length = 0;
            availableQuestions = [...allFilteredQuestions];
            historyWasReset = true;
        }

        if (!historyWasReset) {
            selectedQuestions.push(...availableQuestions);
            availableQuestions.forEach(q => {
                if (q?.question && !historyList.includes(q.question)) {
                    historyList.push(q.question);
                }
            });
            const neededFromHistory = actualLimit - selectedQuestions.length;
            if (neededFromHistory > 0) {
                let historyCandidates = allFilteredQuestions.filter(q => q?.question && historyList.includes(q.question));
                historyCandidates = shuffleArray(historyCandidates);
                let addedFromHistory = 0;
                for (const histQ of historyCandidates) {
                    if (addedFromHistory >= neededFromHistory) break;
                    if (!selectedQuestions.some(sq => sq.question === histQ.question)) {
                        selectedQuestions.push(histQ);
                        addedFromHistory++;
                    }
                }
            }
        } else {
            availableQuestions = shuffleArray(availableQuestions);
            selectedQuestions = availableQuestions.slice(0, actualLimit);
            selectedQuestions.forEach(q => {
                if (q?.question) {
                    historyList.push(q.question);
                }
            });
        }
    } else {
        availableQuestions = shuffleArray(availableQuestions);
        selectedQuestions = availableQuestions.slice(0, actualLimit);
        selectedQuestions.forEach(q => {
            if (q?.question && !historyList.includes(q.question)) {
                historyList.push(q.question);
            }
        });
    }

    while (selectedQuestions.length < actualLimit && allFilteredQuestions.length > selectedQuestions.length) {
        const remainingCandidates = allFilteredQuestions.filter(q => q && !selectedQuestions.some(sq => sq.question === q.question));
        if (remainingCandidates.length === 0) break;
        const randomIndex = Math.floor(Math.random() * remainingCandidates.length);
        selectedQuestions.push(remainingCandidates[randomIndex]);
        if (remainingCandidates[randomIndex]?.question && !historyList.includes(remainingCandidates[randomIndex].question)) {
             historyList.push(remainingCandidates[randomIndex].question);
        }
    }
    saveQuestionHistory();
    return shuffleArray(selectedQuestions);
}

function processTextWithImages(text) {
  if (typeof text !== 'string') return "";
  const regex = /(\(image\/([^\)]+)\))|(<img\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*>)/gi;
  return text.replace(regex, (match, _inlineMarker, inlineFilename, _imgTag, imgSrcValue) => {
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
}

function clearPreviousContent() {
  if (answerWrapperElement) answerWrapperElement.innerHTML = "";
  if (questionElement) questionElement.innerHTML = "";
  if (answerWrapperElement) answerWrapperElement.style.opacity = "0";
  clearTimeout(autoNextTimeout);
  clearInterval(typingInterval);
}

function updateQuestionCounter() {
  const currentEl = numberProgressContainer?.querySelector(".current");
  const totalEl = numberProgressContainer?.querySelector(".total");
  if (currentEl) currentEl.textContent = currentQuestion + 1;
  if (totalEl) totalEl.textContent = shuffledQuestions.length;
}

function addExplanationBlock(questionData, targetElement) {
  if (!questionData?.explanation?.trim() || !targetElement) return;
  if (targetElement.querySelector(".explanation-container")) return;

  const explanationContainer = document.createElement("div");
  explanationContainer.className = "explanation-container";
  const explanationHeading = document.createElement("h4");
  explanationHeading.className = "explanation-heading";
  explanationHeading.innerHTML = `<span class="explanation-heading-text">Explanation</span><img src="12arrow.png" alt="->" class="explanation-arrow-image">`;
  const explanationDiv = document.createElement("div");
  explanationDiv.className = "question-explanation";

  const correctAnswersMap = extractCorrectAnswers(questionData.explanation);
  let explanationHTML = "<ul>";
  const idsToDisplay = questionData.blankIds && questionData.blankIds.length > 0 ?
                       questionData.blankIds : Object.keys(correctAnswersMap).sort();
  idsToDisplay.forEach(blankId => {
      if (correctAnswersMap[blankId]) {
          explanationHTML += `<li>(${blankId}) ${correctAnswersMap[blankId].join(' / ')}</li>`;
      }
  });
  explanationHTML += "</ul>";
  explanationDiv.innerHTML = explanationHTML;

  explanationContainer.appendChild(explanationHeading);
  explanationContainer.appendChild(explanationDiv);
  targetElement.appendChild(explanationContainer);
  targetElement.style.opacity = "1";
}

function displayQuestion() {
  if (!questionElement || !answerWrapperElement || !previousButton || !nextButton || !pauseButton || !numberProgressContainer) {
    stopQuiz(); return;
  }
  if (currentQuestion < 0 || currentQuestion >= shuffledQuestions.length || !shuffledQuestions[currentQuestion]) {
    stopQuiz(); return;
  }

  const questionData = shuffledQuestions[currentQuestion];
  clearPreviousContent();
  pauseButton.classList.add("hide");

  let questionHTML = questionData.question;
  if (questionData.blankIds && questionData.blankIds.length > 0) {
      questionData.blankIds.forEach(blankId => {
          const inputValue = (questionData.answered && questionData.userAnswers && questionData.userAnswers[blankId] !== undefined)
                             ? questionData.userAnswers[blankId] : "";
          let inputStyle = "";
          if (questionData.answered && questionData.correctnessPerBlank) {
              if (questionData.correctnessPerBlank[blankId] === true) inputStyle = 'border: 2px solid green; background-color: #e6ffe6;';
              else if (questionData.correctnessPerBlank[blankId] === false) inputStyle = 'border: 2px solid red; background-color: #ffe6e6;';
          }
          const disabledAttr = questionData.answered ? "disabled" : "";
          const placeholderRegex = new RegExp(`\\((${blankId})\\)(\\s*_{2,})`, 'i');
          const inputFieldHTML = `(${blankId}) <input type="text" class="gap-input" data-blank-id="${blankId}" value="${escapeHtml(inputValue)}" style="${inputStyle}" ${disabledAttr}>`;
          questionHTML = questionHTML.replace(placeholderRegex, inputFieldHTML);
      });
  }

  let questionContent = processTextWithImages(questionHTML);
  questionContent = convertNewlinesToHtml(questionContent);
  questionContent = questionContent.replace(/'([^']+)'/g, `<span class="highlight">$1</span>`);
  questionContent = questionContent.replace(/<span class="mathy">(.*?)<\/span>/g, (_match, p1) => `<span><script type="math/asciimath">${stripHTML(p1)}</script></span>`);
  questionContent = questionContent.replace(/<[^>]*class="mathy"[^>]*>(.*?)<\/[^>]*>/g, (_match, p1) => `<span><script type="math/asciimath">${stripHTML(p1)}</script></span>`);
  questionElement.innerHTML = `<h5>${questionContent}</h5>`;

  try {
     if (window.MathJax?.Hub) MathJax.Hub.Queue(["Typeset", MathJax.Hub, questionElement]);
     else if (window.MathJax?.typesetPromise) window.MathJax.typesetPromise([questionElement]);
  } catch (error) { console.error("Error rendering MathJax for question:", error); }

  answerWrapperElement.innerHTML = "";
  answerWrapperElement.style.opacity = "1";
  updateQuestionCounter();
  previousButton.disabled = (currentQuestion === 0);

  if (questionData.answered) {
    nextButton.textContent = "Next";
    nextButton.disabled = (currentQuestion === shuffledQuestions.length - 1);
    addExplanationBlock(questionData, answerWrapperElement);
  } else {
    nextButton.textContent = "Check Answers";
    nextButton.disabled = false;
  }
  addHighlightCSS();
}

function checkCurrentQuestionAnswers() {
    const questionData = shuffledQuestions[currentQuestion];
    if (!questionData || questionData.answered) return;

    const inputs = questionElement.querySelectorAll(".gap-input");
    const correctAnswersMap = extractCorrectAnswers(questionData.explanation);

    questionData.userAnswers = {};
    questionData.correctnessPerBlank = {};
    let allBlanksInQuestionCorrect = true;

    if (inputs.length === 0 && questionData.numBlanks > 0) {
        questionData.blankIds.forEach(id => questionData.correctnessPerBlank[id] = false);
        allBlanksInQuestionCorrect = false;
    } else {
        inputs.forEach(input => {
            const blankId = input.dataset.blankId;
            const userAnswerOriginal = input.value.trim();
            const userAnswerLower = userAnswerOriginal.toLowerCase();
            questionData.userAnswers[blankId] = userAnswerOriginal;

            const possibleCorrectAnswers = correctAnswersMap[blankId] || [];
            let isThisBlankCorrect = possibleCorrectAnswers.length > 0 && possibleCorrectAnswers.includes(userAnswerLower);
            questionData.correctnessPerBlank[blankId] = isThisBlankCorrect;

            if (isThisBlankCorrect) {
                input.style.border = "2px solid green"; input.style.backgroundColor = "#e6ffe6"; score++;
            } else {
                input.style.border = "2px solid red"; input.style.backgroundColor = "#ffe6e6"; allBlanksInQuestionCorrect = false;
            }
            input.disabled = true;
        });
    }

    questionData.answered = true;
    questionData.isCorrect = allBlanksInQuestionCorrect;
    nextButton.textContent = "Next";
    nextButton.disabled = (currentQuestion === shuffledQuestions.length - 1);
    addExplanationBlock(questionData, answerWrapperElement);

    const delay = questionData.explanation?.trim() ? 3000 : 500;
    if (questionData.explanation?.trim()) pauseButton.classList.remove("hide");

    if (!isPaused) {
        autoNextTimeout = setTimeout(() => {
            if (isPaused) { isPaused = false; startTimer(); } // Resume if paused by button
            const nextIdx = findNextUnansweredQuestion();
            if (nextIdx !== -1) { currentQuestion = nextIdx; displayQuestion(); }
            else { endQuiz(); }
        }, delay);
    }
}

function findNextUnansweredQuestion() {
  for (let i = currentQuestion + 1; i < shuffledQuestions.length; i++) {
    if (shuffledQuestions[i] && !shuffledQuestions[i].answered) return i;
  }
  for (let i = 0; i < currentQuestion; i++) {
    if (shuffledQuestions[i] && !shuffledQuestions[i].answered) return i;
  }
  return -1;
}

function previousQuestion() {
    if (!pauseButton || !nextButton || currentQuestion <= 0) return;
    clearTimeout(autoNextTimeout);
    pauseButton.classList.add("hide");
    if (isPaused) { isPaused = false; startTimer(); }
    currentQuestion--;
    displayQuestion();
    nextButton.disabled = false;
}

function stopQuiz() {
  if (!quizScreen || !endScreen || !pauseButton) return;
  clearInterval(timerInterval); clearTimeout(autoNextTimeout);
  quizScreen.classList.add("hide"); endScreen.classList.remove("hide");
  pauseButton.classList.add("hide");
  hideQuiz(); calculateAndDisplayResults();
  if(nextButton) nextButton.disabled = false;
}

function endQuiz() {
    if (!quizScreen || !endScreen || !pauseButton) return;
    clearInterval(timerInterval); clearTimeout(autoNextTimeout);
    quizScreen.classList.add("hide"); endScreen.classList.remove("hide");
    pauseButton.classList.add("hide");
    hideQuiz(); calculateAndDisplayResults();
}

function calculateAndDisplayResults() {
    if (!scoreElement || !totalScoreElement || !endScreen) return;
    clearInterval(timerInterval);

    let totalPossibleBlanks = 0;
    shuffledQuestions.forEach(q => { totalPossibleBlanks += (q?.numBlanks || 0); });

    scoreElement.textContent = score.toString();
    totalScoreElement.textContent = totalPossibleBlanks.toString();

    let attemptedBlanks = 0;
    let answeredQuestionsCount = 0;
    shuffledQuestions.forEach(q => {
        if (q?.answered) {
            answeredQuestionsCount++;
            attemptedBlanks += (q.numBlanks || 0);
        }
    });
    const notAnsweredQuestionsCount = shuffledQuestions.length - answeredQuestionsCount;
    const correctBlanksCount = score;
    const wrongBlanksCount = attemptedBlanks - correctBlanksCount;

    const correctCountEl = endScreen.querySelector(".correct-count");
    const wrongCountEl = endScreen.querySelector(".wrong-count");
    const notAnsweredCountEl = endScreen.querySelector(".not-answered-count");

    if (correctCountEl) correctCountEl.textContent = correctBlanksCount.toString();
    if (wrongCountEl) wrongCountEl.textContent = Math.max(0, wrongBlanksCount).toString();
    if (notAnsweredCountEl) notAnsweredCountEl.textContent = notAnsweredQuestionsCount.toString();
}

async function restartQuiz() {
    if (!endScreen || !quizScreen || !startScreen || !pauseButton || !errorMessage || !subjectName) return;
    clearInterval(timerInterval); clearTimeout(autoNextTimeout);
    endScreen.classList.add("hide"); quizScreen.classList.add("hide");
    startScreen.classList.remove("hide"); pauseButton.classList.add("hide");
    hideError(); hideQuiz();
    currentQuestion = 0; score = 0; shuffledQuestions = []; isPaused = false; timeRemaining = 0;
    if (questionLimitInput) questionLimitInput.value = 30;
    if (timeLimitInput) timeLimitInput.value = 30;
    if (quizLessonDropdown) quizLessonDropdown.value = "সকল পাঠ";
    await loadQuestionHistory();
    if (data && subjectName) { populateLessonDropdown(subjectName); showStartScreen(subjectName); }
    else { displayError("Error restarting quiz. Please refresh."); if (startButton) startButton.disabled = true; }
}

// --- Timer and Pause Logic ---
function startTimer() {
  clearInterval(timerInterval);
  if (!timeLimitInput || !progressText) return;
  const progressBar = document.querySelector(".progress-bar");
  if (!progressBar) return;
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
  updateDisplay();
  timerInterval = setInterval(() => {
    if (!isPaused) {
      if (timeRemaining > 0) { timeRemaining--; updateDisplay(); }
      if (timeRemaining <= 0) { clearInterval(timerInterval); endQuiz(); }
    }
  }, 1000);
}

function handlePauseButtonClick() {
  if (!pauseButton || isPaused || pauseButton.classList.contains('hide')) return;
  isPaused = true; clearInterval(timerInterval); clearTimeout(autoNextTimeout);
  pauseButton.classList.add("hide");
}

// --- Communication with Parent Window ---
window.addEventListener("message", async (event) => {
  const messageData = event.data;
  if (messageData === "closeQuiz") closeQuiz();
  else if (messageData?.subjectName) {
    subjectName = messageData.subjectName;
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

    if (timeLimitInput) timeLimitInput.value = 30;
    if (questionLimitInput) questionLimitInput.value = 30;
    if (quizLessonDropdown) quizLessonDropdown.value = "সকল পাঠ";
    if (lessonDropdownMenu) lessonDropdownMenu.classList.add("hide");
    hideError();

    try {
        await loadQuestionHistory();
        const fetchedData = await loadQuestionData();
        if (fetchedData) {
            data = fetchedData;
            populateLessonDropdown(subjectName);
            showStartScreen(subjectName);
        } else {
            displayError("Error loading questions for this subject. Please refresh.");
            if (startButton) startButton.disabled = true;
        }
    } catch (error) {
        displayError("Failed to load quiz setup data. Please refresh.");
         if (startButton) startButton.disabled = true;
    }
  } else if (messageData === "reloadQuiz") {
    await loadQuestionHistory(); restartQuiz();
  }
});

function closeQuiz() {
  if (window.parent && window.parent !== window) window.parent.postMessage({ type: "closeQuiz" }, "*");
  clearInterval(timerInterval); clearTimeout(autoNextTimeout);
}

// --- UI Visibility and Styling ---
function showQuiz() {
  if (!quizScreen || !quizHeading) return;
  quizScreen.classList.add("show"); quizScreen.classList.remove("hide");
  document.body.style.backgroundColor = "#fff";
  if (quizHeading) quizHeading.textContent = subjectName || "Quiz";
}

function hideQuiz() {
  if (!quizScreen) return;
  quizScreen.classList.remove("show"); quizScreen.classList.add("hide");
  document.body.style.backgroundColor = "";
}

function showStartScreen(subjectName) {
  const elements = [startScreen, startScreenHeading, data, data?.sections, questionLimitInput, timeLimitInput, quizLessonDropdown, startButton, quizScreen, endScreen, lessonDropdownMenu, errorMessage];
  if (elements.some(el => el === null || el === undefined)) {
      displayError("Initialization error. Please refresh."); return;
  }
  startScreenHeading.textContent = subjectName || "Quiz Setup";
  const section = data.sections.find((s) => s.section === subjectName);

  if (section?.questions?.length > 0) {
      questions = section.questions.filter(q => q);
      questionLimitInput.disabled = false; timeLimitInput.disabled = false;
      updateMinLimitsForLesson();
  } else {
      questions = []; questionLimitInput.disabled = true; timeLimitInput.disabled = true;
      quizLessonDropdown.disabled = true; lessonDropdownMenu.classList.add("hide");
      startButton.disabled = true; displayError(`No questions available for the subject "${subjectName}".`);
      questionLimitInput.min = 1; timeLimitInput.min = 1;
      questionLimitInput.max = 1; timeLimitInput.max = 1;
      questionLimitInput.value = 1; timeLimitInput.value = 1;
  }
  startScreen.classList.remove("hide"); quizScreen.classList.add("hide"); endScreen.classList.add("hide");
  validateInputs();
}

function addHighlightCSS() {
    if (document.getElementById("quiz-dynamic-styles")) return;
    const style = document.createElement("style");
    style.id = "quiz-dynamic-styles";
    style.textContent = `
        .highlight { display: inline-block; background: linear-gradient(90deg, #84fab0, #8fd3f4); font-weight: bold; border-radius: 6px; padding: 2px 6px; margin: 1px 3px; color: #111; box-shadow: 1px 1px 2px rgba(0,0,0,0.1); }
        .explanation-container { margin-top: 25px; animation: fadeInUp 0.8s ease-out; }
        @keyframes fadeInUp { from { opacity: 0; transform: translate3d(0, 20px, 0); } to { opacity: 1; transform: translate3d(0, 0, 0); } }
        .explanation-heading { font-size: 1.1em; font-weight: bold; color: #0056b3; margin-bottom: 10px; display: flex; align-items: center; text-align: left; border-bottom: 1px solid #eee; padding-bottom: 5px; }
        .explanation-heading-text { margin-right: 8px; }
        .explanation-arrow-image { width: 20px; height: auto; transform: rotate(350deg); display: inline-block; vertical-align: middle; margin-left: 2px; margin-top: 0px; filter: brightness(1.1); }
        .question-explanation { padding: 12px 15px; background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px; text-align: left; color: #343a40; font-size: 0.95em; line-height: 1.6; box-shadow: inset 0 1px 2px rgba(0,0,0,0.05); word-wrap: break-word; overflow-y: auto; max-height: 300px; }
        .question-explanation .MathJax_Display { margin: 0.5em 0 !important; }
        .question-explanation script { display: none !important; }
        .question-explanation span > span > script { display: none !important; }
    `;
    document.head.appendChild(style);
}

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
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
  quizLessonDropdown = document.getElementById("quiz-lesson");
  lessonDropdownMenu = document.getElementById("lesson-dropdown-menu");

  if (quizScreen) quizScreen.classList.add("hide");
  if (endScreen) endScreen.classList.add("hide");
  if (startScreen) startScreen.classList.add("hide");
  if (pauseButton) pauseButton.classList.add("hide");
  if (lessonDropdownMenu) lessonDropdownMenu.classList.add("hide");
  if (errorMessage) errorMessage.classList.add("hide");
  if (startButton) startButton.disabled = true;

  if (startButton) startButton.addEventListener("click", startQuiz);
  if (stopButton) stopButton.addEventListener("click", stopQuiz);
  if (pauseButton) pauseButton.addEventListener("click", handlePauseButtonClick);
  const restartButton = document.querySelector(".restart");
  if (restartButton) restartButton.addEventListener("click", restartQuiz);

  if (quizLessonDropdown) {
    quizLessonDropdown.addEventListener("change", function () {
      selectedLesson = this.value; updateMinLimitsForLesson();
    });
  }
  if (questionLimitInput) { questionLimitInput.addEventListener("input", validateInputs); restrictToNumbers(questionLimitInput); }
  if (timeLimitInput) { timeLimitInput.addEventListener("input", validateInputs); restrictToNumbers(timeLimitInput); }

  nextButton = document.querySelector(".next");
  if (nextButton) {
    nextButton.textContent = "Check Answers"; // Initial text
    nextButton.addEventListener("click", () => {
        const questionData = shuffledQuestions[currentQuestion];
        if (!questionData) return;

        if (!questionData.answered) {
            checkCurrentQuestionAnswers();
        } else {
            clearTimeout(autoNextTimeout);
            pauseButton.classList.add("hide");
            if (isPaused) { isPaused = false; startTimer(); }

            // Try to find next unanswered first
            const nextUnansweredIndex = findNextUnansweredQuestion();
            if (nextUnansweredIndex !== -1) {
                currentQuestion = nextUnansweredIndex;
                displayQuestion();
            } else {
                // If all are answered, or no more unanswered ones, try to go to the next sequential one
                if (currentQuestion < shuffledQuestions.length - 1) {
                    currentQuestion++;
                    displayQuestion();
                } else {
                    endQuiz(); // All questions viewed/answered
                }
            }
        }
    });
  }
  if (previousButton) previousButton.addEventListener("click", previousQuestion);

  if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'quizReady' }, '*');
  addHighlightCSS();
});

async function clearQuestionHistory() {
  try {
    await saveQuestionHistoryToDB({});
    questionHistory = {};
    if (data && data.sections) {
      data.sections.forEach((section) => {
        if (section?.section) questionHistory[section.section] = {};
      });
    }
    displayError("Question history has been cleared.");
    setTimeout(() => { if(errorMessage) hideError(); }, 3000);
  } catch (error) {
    displayError("Could not clear question history.");
  }
}