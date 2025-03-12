let questions = [],
  currentQuestion = 0,
  score = 0,
  timeRemaining = 0,
  timerInterval,
  selectedAnswer = null,
  questionLimit = 15,
  typingInterval,
  autoNextTimeout,
  shuffledQuestions = [],
  data = null,
  selectedLesson = "সকল পাঠ"; // Track selected lesson

const startScreenHeading = document.getElementById("start-screen-heading");
const startScreen = document.querySelector(".start-screen");
const quizScreen = document.querySelector(".quiz");
const endScreen = document.querySelector(".end-screen");
const questionElement = document.querySelector(".question");
const answerWrapperElement = document.querySelector(".answer-wrapper");
const nextButton = document.querySelector(".next");
const scoreElement = document.querySelector(".final-score");
const totalScoreElement = document.querySelector(".total-score");
const progressText = document.querySelector(".progress-text");
const timer = document.querySelector(".timer");
const previousButton = document.querySelector(".previous");
const stopButton = document.querySelector(".stop");
const errorMessage = document.querySelector(".error-message");
const startButton = document.querySelector(".start");
const quizHeading = document.querySelector(".quiz-heading");
const uContainer = document.getElementById("u-container");
const numberProgressContainer = document.querySelector(".number-progress");
const questionContainer = document.querySelector(".question");
const questionLimitInput = document.getElementById("question-limit");
const timeLimitInput = document.getElementById("time-limit");
const quizLessonDropdown = document.getElementById("quiz-lesson"); // Get lesson dropdown
const lessonDropdownMenu = document.getElementById("lesson-dropdown-menu"); // Get dropdown menu container
let subjectName,
  questionHistory = {};
nextButton.disabled = false;

// IndexedDB setup
const dbName = "quizHistoryDB";
const storeName = "questionHistoryStore";
let db;

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }
    const request = indexedDB.open(dbName, 1);

    request.onerror = (event) => {
      console.error("IndexedDB error:", event);
      reject("IndexedDB failed to open");
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    };
  });
}

async function getQuestionHistoryFromDB() {
  await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.get("questionHistory");

    request.onerror = (event) => {
      console.error("Error getting question history from IndexedDB:", event);
      reject(event);
    };

    request.onsuccess = (event) => {
      resolve(event.target.result || {}); // Return empty object if no history found
    };
  });
}

async function saveQuestionHistoryToDB(history) {
  await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.put(history, "questionHistory"); // Save history as an object

    request.onerror = (event) => {
      console.error("Error saving question history to IndexedDB:", event);
      reject(event);
    };

    request.onsuccess = () => {
      resolve();
    };
  });
}

function stripHTML(html) {
  let temp = document.createElement("div");
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || "";
}

// Functions for managing IndexedDB history
async function saveQuestionHistory() {
  try {
    await saveQuestionHistoryToDB(questionHistory);
  } catch (error) {
    console.error("Error saving question history:", error);
  }
}

async function loadQuestionHistory() {
  try {
    questionHistory = await getQuestionHistoryFromDB();
    if (!questionHistory) {
      questionHistory = {};
    }
    if (typeof questionHistory !== "object" || questionHistory === null) {
      questionHistory = {}; // Ensure it's an object in case of corruption
    }
  } catch (error) {
    console.error("Error loading question history:", error);
    questionHistory = {}; // Initialize to empty object on error
    displayError(
      "Error loading question history. Starting with a clean slate."
    );
  }
}

async function loadQuestionData() {
  // Instead of fetching, just return the questionsData

  questionsData.sections.forEach((section) => {
    if (!questionHistory[section.section]) {
      // Initialize history for sections if not present
      questionHistory[section.section] = {}; // History for each section is now an object
    }
  });

  return questionsData;
}

function displayError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove("hide");
  errorMessage.style.opacity = 1;
}

loadQuestionData().then((fetchedData) => {
  if (fetchedData) {
    data = fetchedData;
    startButton.disabled = false;
  } else {
    console.error("Data is null.");
    displayError("Error loading questions. Please refresh the page.");
  }
});

startButton.addEventListener("click", startQuiz);
nextButton.addEventListener("click", nextQuestion);
previousButton.addEventListener("click", previousQuestion);
stopButton.addEventListener("click", stopQuiz);
document.querySelector(".restart").addEventListener("click", restartQuiz);
quizLessonDropdown.addEventListener("change", function () {
  selectedLesson = this.value; // Update selectedLesson on dropdown change
  updateMinLimitsForLesson(); // Call function to update min limits
});

function validateInputs() {
  const questionLimitValue = parseInt(questionLimitInput.value);
  const timeLimitValue = parseInt(timeLimitInput.value);
  const maxQuestions = parseInt(questionLimitInput.max); // Get dynamic max value
  const minQuestions = parseInt(questionLimitInput.min); // Get dynamic min value

  let errorMessageText = "";

  if (isNaN(questionLimitValue) || isNaN(timeLimitValue)) {
    errorMessageText = "Please enter valid question and time limits.";
  } else if (
    questionLimitValue < minQuestions ||
    timeLimitValue < minQuestions
  ) {
    errorMessageText = `Question and time limit must be at least ${minQuestions}.`; // Dynamic error message
  } else if (
    questionLimitValue > maxQuestions ||
    timeLimitValue > maxQuestions
  ) {
    errorMessageText = `Question and time limits cannot exceed ${maxQuestions}.`; // Dynamic error message - NEW MESSAGE
  }

  startButton.disabled = !!errorMessageText;
  errorMessage.textContent = errorMessageText;
  errorMessage.style.opacity = errorMessageText ? 1 : 0;
  errorMessage.classList.toggle("hide", !errorMessageText);
}

questionLimitInput.addEventListener("input", validateInputs);
timeLimitInput.addEventListener("input", validateInputs);

// Function to restrict input to numbers only
function restrictToNumbers(inputElement) {
  inputElement.addEventListener("input", function (event) {
    this.value = this.value.replace(/[^0-9]/g, ""); // Replace non-digits with empty string
  });

  inputElement.addEventListener("paste", function (event) {
    let pasteData = (event.clipboardData || window.clipboardData).getData(
      "text"
    );
    if (pasteData.match(/[^0-9]/g)) {
      event.preventDefault(); // Prevent paste if non-digits
    }
  });
}

restrictToNumbers(questionLimitInput);
restrictToNumbers(timeLimitInput);

async function startQuiz() {
  // Make startQuiz async
  const questionLimitValue = parseInt(questionLimitInput.value);
  const timeLimitValue = parseInt(timeLimitInput.value);
  startButton.disabled = false;
  const minQuestions = parseInt(questionLimitInput.min); // Get dynamic min value

  if (questionLimitValue < minQuestions || timeLimitValue < minQuestions) {
    errorMessage.textContent = `Question limit and time limit must be at least ${minQuestions}.`; // Dynamic message
    errorMessage.classList.remove("hide");
    return;
  } else {
    errorMessage.classList.add("hide");
  }

  questionLimit = questionLimitValue;
  timeRemaining = timeLimitValue * 60;
  currentQuestion = 0;
  score = 0;
  selectedAnswer = null;
  selectedLesson = quizLessonDropdown.value; // Get the selected lesson here

  if (subjectName) {
    const section = data.sections.find((s) => s.section === subjectName);

    if (section) {
      questions = section.questions;

      // Filter questions by selected lesson
      let filteredQuestions = questions;
      if (selectedLesson !== "সকল পাঠ") {
        filteredQuestions = questions.filter(
          (q) => q.lesson === selectedLesson
        );
      }

      if (filteredQuestions.length === 0 && selectedLesson !== "সকল পাঠ") {
        errorMessage.textContent = `No questions available for the lesson: ${selectedLesson}. Please select 'সকল পাঠ' or a different lesson.`;
        errorMessage.classList.remove("hide");
        return; // Stop quiz start if no questions for selected lesson
      } else if (
        filteredQuestions.length === 0 &&
        selectedLesson === "সকল পাঠ"
      ) {
        errorMessage.textContent = `No questions available for 'সকল পাঠ'. Please check question data.`;
        errorMessage.classList.remove("hide");
        return; // Stop quiz start if no questions for সকল পাঠ
      } else {
        errorMessage.classList.add("hide"); // Ensure error message is hidden if questions are found
      }

      // Update maxQuestions for input validation based on filtered questions
      const maxQuestionsForLesson = filteredQuestions.length;
      questionLimitInput.max = maxQuestionsForLesson;
      timeLimitInput.max = maxQuestionsForLesson;

      // Validate inputs again after filtering to reflect the correct max questions
      if (
        parseInt(questionLimitInput.value) > maxQuestionsForLesson ||
        parseInt(timeLimitInput.value) > maxQuestionsForLesson
      ) {
        validateInputs(); // Re-validate with the new max question limit based on lesson
        if (!errorMessage.classList.contains("hide")) {
          // if there is error after validation, return.
          return;
        }
      }

      shuffledQuestions = await selectQuestions(
        filteredQuestions, // Use filtered questions
        questionLimit,
        subjectName,
        selectedLesson // Pass selectedLesson to selectQuestions
      ); // Await the Promise
    } else {
      console.error("Subject not found:", subjectName);
      errorMessage.textContent = "Subject not found. Please refresh the page.";
      errorMessage.classList.remove("hide");
      return;
    }
  } else {
    console.warn("Subject name not yet received from parent window.");
    errorMessage.textContent = "Loading subject...";
    errorMessage.classList.remove("hide");
    return;
  }

  if (shuffledQuestions.length === 0) {
    errorMessage.textContent =
      "No questions available for the selected lesson.";
    errorMessage.classList.remove("hide");
    return; // Stop quiz start if no questions
  } else {
    errorMessage.classList.add("hide"); // Ensure error message is hidden if questions are found
  }

  shuffledQuestions.forEach((question) => {
    if (question) {
      // Check if question is defined
      question.answered = false;
    }
  });
  startScreen.classList.add("hide");
  quizScreen.classList.remove("hide");
  showQuiz();

  // Remove the direct text content setting
  // quizHeading.textContent = subjectName;

  // Use typeText for the quiz heading
  typeText(quizHeading, subjectName, 30);

  startTimer();
  displayQuestion();
}

async function selectQuestions(allQuestions, limit, subject, lesson) {
  // Added lesson parameter
  let selectedQuestions = [];
  const historyKey = lesson === "সকল পাঠ" ? subject : `${subject}-${lesson}`; // Create history key

  if (!questionHistory[subject]) {
    // Ensure subject history object exists
    questionHistory[subject] = {};
  }

  if (!questionHistory[subject][historyKey]) {
    // Initialize history for this lesson within the subject
    questionHistory[subject][historyKey] = [];
  }

  let availableQuestions = allQuestions.filter(
    (q) => !questionHistory[subject][historyKey].includes(q.question)
  );

  if (availableQuestions.length < limit) {
    let historyQuestions = [...questionHistory[subject][historyKey]];

    if (
      availableQuestions.length === 0 &&
      historyQuestions.length === questionHistory[subject][historyKey].length &&
      questionHistory[subject][historyKey].length > 0
    ) {
      questionHistory[subject][historyKey] = [];
      historyQuestions = [];
    }

    while (selectedQuestions.length < limit) {
      if (availableQuestions.length === 0) {
        if (historyQuestions.length === 0) break;
        const randomIndex = Math.floor(Math.random() * historyQuestions.length);
        const questionText = historyQuestions.splice(randomIndex, 1)[0];
        const question = allQuestions.find((q) => q.question === questionText);
        if (
          question &&
          !selectedQuestions.some((q) => q.question === question.question)
        ) {
          selectedQuestions.push(question);
        }
      } else {
        const randomIndex = Math.floor(
          Math.random() * availableQuestions.length
        );
        const question = availableQuestions.splice(randomIndex, 1)[0];
        selectedQuestions.push(question);
        questionHistory[subject][historyKey].push(question.question); // Use lesson-specific history key
      }
    }
  } else {
    while (selectedQuestions.length < limit && availableQuestions.length > 0) {
      const randomIndex = Math.floor(Math.random() * availableQuestions.length);
      const question = availableQuestions.splice(randomIndex, 1)[0];
      selectedQuestions.push(question);
      questionHistory[subject][historyKey].push(question.question); // Use lesson-specific history key
    }
  }

  while (selectedQuestions.length < limit) {
    const randomIndex = Math.floor(Math.random() * allQuestions.length);
    const question = allQuestions[randomIndex];
    if (!selectedQuestions.includes(question)) {
      selectedQuestions.push(question);
    }
  }

  await saveQuestionHistory();
  return shuffleArray(selectedQuestions);
}

function convertNewlinesToHtml(text) {
  return text.replace(/\n/g, "<br>");
}
function processTextWithImages(text, isEditMode = false) {
  if (isEditMode) {
    // In edit mode, return the original text with image links
    return text.replace(
      /<div class="image-container"><img src="([^"]+)"[^>]+><\/div>/g,
      "($1)"
    );
  }

  // Convert <img src=\"...\"/> to (image/...) format
  text = text.replace(
    /<img[^>]*src=["']([^"']*)["'][^>]*\/>/g,
    (match, src) => {
      return `(image/${src})`;
    }
  );

  // For display mode, replace image links with image elements
  return text.replace(/\(image\/[^\)]+\)/g, (match) => {
    const imgSrc = match.slice(1, -1); // Remove surrounding parentheses
    return `<div><img src="${imgSrc}" style="margin: 10px 0; height: auto; max-width: 100%;" alt="Image"></div>`;
  });
}

function displayError(_message) {
  // Display error message to the user in the UI
}

displayQuestion();

function displayQuestion() {
  if (
    !shuffledQuestions ||
    currentQuestion < 0 ||
    currentQuestion >= shuffledQuestions.length
  ) {
    showError("Invalid question index or question array.");
    return;
  }

  const questionData = shuffledQuestions[currentQuestion];
  clearPreviousContent();

  // Process the question text with images and LaTeX
  let content = processTextWithImages(questionData.question);

  // Highlight text inside '....'
  content = content.replace(/'([^']+)'/g, function (_match, p1) {
    return `<span class="highlight">${p1}</span>`;
  });

  // Replace <... class="mathy"> with <script type="math/asciimath">, preserving inner content
  content = content.replace(
    /<[^>]*class="mathy"[^>]*>(.*?)<\/[^>]*>/g,
    function (_match, p1) {
      // Strip out any HTML tags inside the mathy element content
      const cleanedContent = p1.replace(/<[^>]*>/g, ""); // Remove all HTML tags
      return `<script type="math/asciimath">${cleanedContent}</script>`;
    }
  );

  const questionHTML = `
    <h5>${convertNewlinesToHtml(content)}</h5>
  `;
  questionElement.innerHTML = questionHTML;

  // Ensure all images in the question have drag prevention
  const questionImages = questionElement.querySelectorAll("img");
  questionImages.forEach((img) => {
    img.addEventListener("dragstart", (event) => {
      event.preventDefault(); // Prevent dragging
    });
  });

  // Render MathJax to process ASCII Math
  MathJax.Hub.Queue(["Typeset", MathJax.Hub, questionElement]);

  // Display the answers
  displayAnswers(questionData);

  // Fade-in animation for answers
  answerWrapperElement.style.opacity = "1";
  answerWrapperElement.style.animation = "fadeInUp 1s";

  // Disable the previous button if this is the first question
  previousButton.disabled = currentQuestion === 0;

  // Disable both next and previous buttons if questionLimit is 1
  if (questionLimit === 1) {
    nextButton.disabled = true;
    previousButton.disabled = true;
  }

  // Update the question counter
  updateQuestionCounter();

  // Add CSS for highlighting dynamically
  addHighlightCSS();
}

// Function to add CSS dynamically
function addHighlightCSS() {
  const style = document.createElement("style");
  style.type = "text/css";
  style.innerHTML = `
.highlight {
  display: inline-block; /* Ensures border-radius applies to wrapped lines */
  background: linear-gradient(90deg, #84fab0, #8fd3f4);
  font-weight: bold;
  border-radius: 8px;
  padding: 3.5px 6px;
  margin: 2.5px 4px; /* Adds 4px of space on all sides (top, bottom, left, and right) */
  color: #ffffff;
}


  `;
  document.head.appendChild(style);
}

function showError(_message) {
  // Display error message to the user in the UI
}

function clearPreviousContent() {
  answerWrapperElement.innerHTML = "";
  questionElement.innerHTML = "";
  answerWrapperElement.style.opacity = "0";
}

function updateQuestionCounter() {
  document.querySelector(".current").innerHTML = currentQuestion + 1;
  document.querySelector(".total").innerHTML = questionLimit;
}
function displayAnswers(questionData) {
  if (questionData.answered) {
    // If the question has been answered, display all options
    questionData.options.forEach((option) => {
      const answerButton = document.createElement("div");
      answerButton.classList.add("answer");

      // Get the option text and its correctness (key = option text, value = is correct)
      const optionText = Object.keys(option)[0];
      const isCorrect = option[optionText];

      // Add the "c" class to the correct answer
      if (isCorrect) {
        answerButton.classList.add("c"); // Add the "c" class to mark it as correct
      }

      // Process the option text with images if needed
      let content = processTextWithImages(optionText);

      // Handle MathJax content replacement
      content = content.replace(
        /<[^>]*class="mathy"[^>]*>(.*?)<\/[^>]*>/g,
        function (match, p1) {
          const cleanedContent = p1.replace(/<[^>]*>/g, ""); // Remove all HTML tags
          return `<script type="math/asciimath">${cleanedContent}</script>`;
        }
      );

      // Render the content inside the button
      displayTextAndImage(answerButton, content);

      // Check if the option is correct or the selected wrong answer
      if (isCorrect) {
        answerButton.classList.add("correct");
      } else if (optionText === questionData.selectedAnswer) {
        answerButton.classList.add("wrong");
      }

      // Disable all buttons since the question has been answered
      answerButton.classList.add("disabled");
      answerWrapperElement.appendChild(answerButton);
    });
  } else {
    // Shuffle options and display them for answering
    const shuffledOptions = shuffleArray(questionData.options);

    shuffledOptions.forEach((option) => {
      const answerButton = document.createElement("div");
      answerButton.classList.add("answer");

      // Get the option text and its correctness (key = option text, value = is correct)
      const optionText = Object.keys(option)[0];
      const isCorrect = option[optionText];

      // Add the "c" class to the correct answer
      if (isCorrect) {
        answerButton.classList.add("c"); // Mark the correct option with "c"
      }

      // Process the option text with images if needed
      let content = processTextWithImages(optionText);

      // Handle MathJax content replacement
      content = content.replace(
        /<[^>]*class="mathy"[^>]*>(.*?)<\/[^>]*>/g,
        function (match, p1) {
          const cleanedContent = p1.replace(/<[^>]*>/g, ""); // Remove all HTML tags
          return `<script type="math/asciimath">${cleanedContent}</script>`;
        }
      );

      // Render the content inside the button
      displayTextAndImage(answerButton, content);

      // Allow user to select an answer
      answerButton.addEventListener("click", () =>
        selectAnswer(answerButton, option)
      );
      answerWrapperElement.appendChild(answerButton);
    });
  }

  // Trigger MathJax to render any math content that was inserted dynamically
  MathJax.Hub.Queue(["Typeset", MathJax.Hub, answerWrapperElement]);
}

function displayTextAndImage(element, content) {
  if (typeof content === "string") {
    if (content.trim().startsWith("<") && content.trim().endsWith(">")) {
      // If content is HTML, set it directly
      element.innerHTML = content;
    } else {
      // If it's plain text, split it and handle images
      const parts = content.split(/(\(image\/[^)]+\))/);

      parts.forEach((part) => {
        if (part.startsWith("(image/") && part.endsWith(")")) {
          const imgElement = document.createElement("img");
          imgElement.src = part.slice(1, -1); // Remove parentheses
          imgElement.alt = "Quiz image";
          imgElement.style.maxWidth = "100%";
          imgElement.style.height = "auto";
          imgElement.style.margin = "10px 0";

          // Prevent dragging of images
          imgElement.addEventListener("dragstart", (event) => {
            event.preventDefault(); // Prevent dragging
          });

          element.appendChild(imgElement);
        } else if (part.trim() !== "") {
          const textWithBreaks = part.replace(/\n/g, "<br>");
          const divElement = document.createElement("div");
          divElement.innerHTML = textWithBreaks;
          element.appendChild(divElement);
        }
      });
    }
  } else if (typeof content === "object" && content !== null) {
    if (content.text) {
      const textWithBreaks = content.text.replace(/\n/g, "<br>");
      const textNode = document.createElement("div");
      textNode.innerHTML = textWithBreaks;
      element.appendChild(textNode);
    }
    if (content.image) {
      const imgElement = document.createElement("img");
      imgElement.src = content.image;
      imgElement.alt = "Quiz image";
      imgElement.style.maxWidth = "100%";
      imgElement.style.height = "auto";
      imgElement.style.margin = "10px 0";

      // Prevent dragging of images
      imgElement.addEventListener("dragstart", (event) => {
        event.preventDefault(); // Prevent dragging
      });
      element.appendChild(imgElement);
    }
  }
}

// Helper function to check if an answer is correct
function isCorrectAnswer(option) {
  return Object.values(option)[0] === true; // Assuming the option value is a boolean indicating correctness
}

function selectAnswer(answerButton, selectedOption) {
  if (shuffledQuestions[currentQuestion].answered) {
    return; // Prevent selecting an answer if the question is already answered
  }

  let selectedAnswer = answerButton; // Declare the variable
  selectedAnswer.classList.add("selected");

  // Find the correct option from the current question (option with correctAnswer: true)
  const correctOption = shuffledQuestions[currentQuestion].options.find(
    (option) => isCorrectAnswer(option)
  );

  const isCorrect = isCorrectAnswer(selectedOption); // Check if the selected answer is correct

  const allAnswers = answerWrapperElement.querySelectorAll(".answer");

  // Disable further clicks on all answers
  allAnswers.forEach((answer) => {
    answer.classList.add("disabled");
    answer.removeEventListener("click", selectAnswer); // Disable further clicks
  });
  // If the selected answer is wrong, find the correct answer by looking for the "c" class
  if (!isCorrect) {
    // Find and highlight the correct answer immediately
    const correctAnswerElement =
      answerWrapperElement.querySelector(".answer.c");
    if (correctAnswerElement) {
      correctAnswerElement.classList.add("correct"); // Highlight the correct answer
    }

    selectedAnswer.classList.add("wrong");
  } else {
    selectedAnswer.classList.add("correct");
    score++; // Increment score for correct answer
  }

  // Mark the question as answered and store the selected answer
  shuffledQuestions[currentQuestion].answered = true;
  shuffledQuestions[currentQuestion].selectedAnswer =
    Object.keys(selectedOption)[0];

  // Mark the selected answer as correct or incorrect
  shuffledQuestions[currentQuestion].isCorrect = isCorrect;

  nextButton.disabled = false;

  // Set timeout to move to the next question
  autoNextTimeout = setTimeout(nextQuestion, 500); // Automatically move to the next question after 400ms
}

function findNextUnansweredQuestion() {
  for (let i = currentQuestion + 1; i < questionLimit; i++) {
    if (!shuffledQuestions[i].answered) {
      return i;
    }
  }
  return -1;
}

function countUnansweredQuestions() {
  return shuffledQuestions.slice(0, questionLimit).filter((q) => !q.answered)
    .length;
}

function nextQuestion() {
  clearInterval(typingInterval);
  clearTimeout(autoNextTimeout);

  const nextUnansweredIndex = findNextUnansweredQuestion();

  if (nextUnansweredIndex !== -1) {
    currentQuestion = nextUnansweredIndex;
    selectedAnswer = null;
    displayQuestion();
  } else {
    if (
      shuffledQuestions
        .slice(0, questionLimit)
        .every((question) => question.answered)
    ) {
      clearInterval(timerInterval);
      quizScreen.classList.add("hide");
      endScreen.classList.remove("hide");
      endQuiz();
    } else {
      const firstUnansweredIndex = shuffledQuestions.findIndex(
        (question) => !question.answered
      );
      if (firstUnansweredIndex !== -1) {
        currentQuestion = firstUnansweredIndex;
        selectedAnswer = null;
        displayQuestion();
      }
    }
  }
}

function previousQuestion() {
  clearInterval(typingInterval);
  clearTimeout(autoNextTimeout);

  if (currentQuestion > 0 && questionLimit > 1) {
    // added condition questionLimit > 1
    currentQuestion--;
    selectedAnswer = null;
    displayQuestion();
    nextButton.disabled = false;
  }
}

function stopQuiz() {
  clearInterval(timerInterval);
  quizScreen.classList.add("hide");
  endScreen.classList.remove("hide");
  hideQuiz();
  calculateAndDisplayResults();
  nextButton.disabled = false;
}

function displayFinalResults() {
  clearInterval(timerInterval);
  quizScreen.classList.add("hide");
  endScreen.classList.remove("hide");

  calculateAndDisplayResults();
}

function calculateAndDisplayResults() {
  clearInterval(timerInterval);

  let correctCount = 0,
    wrongCount = 0,
    totalScore = 0;

  // Iterate through all questions to count correct and wrong answers
  shuffledQuestions.forEach((q) => {
    if (q.answered) {
      // Only count answered questions
      if (q.isCorrect) {
        correctCount++;
        totalScore++; // Add 1 point for each correct answer
      } else {
        wrongCount++;
      }
    }
  });

  const notAnsweredCount = questionLimit - (correctCount + wrongCount);

  // Clear existing content
  scoreElement.textContent = "";
  totalScoreElement.textContent = "";
  document.querySelector(".correct-count").textContent = "";
  document.querySelector(".wrong-count").textContent = "";
  document.querySelector(".not-answered-count").textContent = "";

  // Create an array of results to type out
  const results = [
    { element: scoreElement, value: totalScore.toString() }, // Display total score
    { element: totalScoreElement, value: questionLimit.toString() },
    {
      element: document.querySelector(".correct-count"),
      value: correctCount.toString(),
    },
    {
      element: document.querySelector(".wrong-count"),
      value: wrongCount.toString(),
    },
    {
      element: document.querySelector(".not-answered-count"),
      value: notAnsweredCount.toString(),
    },
  ];

  // Type out each result sequentially
  function typeOutResults(index) {
    if (results && Array.isArray(results) && index < results.length) {
      typeText(results[index].element, results[index].value, 250).then(() => {
        typeOutResults(index + 1);
      });
    }
  }

  // Start typing results
  typeOutResults(0);
}

function endQuiz() {
  displayFinalResults();
}

function startTimer() {
  clearInterval(timerInterval);
  timeRemaining = parseInt(timeLimitInput.value) * 60;
  const progressBar = document.querySelector(".progress-bar");

  timerInterval = setInterval(() => {
    timeRemaining--;

    const hours = Math.floor(timeRemaining / 3600);
    const minutes = Math.floor((timeRemaining % 3600) / 60);
    const seconds = timeRemaining % 60;
    progressText.innerHTML = hours
      ? `${hours}h ${minutes}m ${seconds}s`
      : minutes
      ? `${minutes}m ${seconds}s`
      : `${seconds}s`;

    const percentageRemaining =
      (timeRemaining / (parseInt(timeLimitInput.value) * 60)) * 100;
    progressBar.style.width = `${percentageRemaining}%`;
    progressText.style.color = percentageRemaining >= 49.5 ? "#fff" : "#000";

    const barRect = progressBar.getBoundingClientRect();
    const textRect = progressText.getBoundingClientRect();
    progressText.classList.toggle(
      "visible",
      barRect.right < textRect.left ||
        barRect.bottom < textRect.top ||
        barRect.top > textRect.bottom
    );

    if (timeRemaining <= 0) {
      clearInterval(timerInterval);
      quizScreen.classList.add("hide");
      endScreen.classList.remove("hide");
      hideQuiz();
      endQuiz();
    }
  }, 1000);
}

function restartQuiz() {
  endScreen.classList.add("hide");
  startScreen.classList.remove("hide");
  hideQuiz();
  // We don't reset questionHistory here, so it persists between quiz attempts
}

window.addEventListener("message", async function (event) {
  // Marked function as async
  if (event.data === "closeQuiz") {
    closeQuiz();
  } else if (event.data.subjectName) {
    subjectName = event.data.subjectName;
    await loadQuestionHistory(); // Load history before showing start screen
    // Call showStartScreen only AFTER data is loaded
    loadQuestionData().then((fetchedData) => {
      if (fetchedData) {
        data = fetchedData;
        populateLessonDropdown(subjectName); // Populate lesson dropdown
        showStartScreen(subjectName);
      } else {
        // Handle the case where data is null (e.g., due to a fetch error)
        console.error("Data is null.");
        errorMessage.textContent = "";
        errorMessage.style.opacity = 1;
        errorMessage.textContent =
          "Error loading questions. Please refresh the page.";
        errorMessage.classList.remove("hide");
      }
    });
  } else if (event.data === "reloadQuiz") {
    // Handle quiz reload if needed
    await loadQuestionHistory(); // Reload question history on quiz reload
  }
});

function closeQuiz() {
  window.parent.postMessage("closeQuiz", "*");
  window.location.reload();
}

function typeText(element, text, speed, callback) {
  return new Promise((resolve) => {
    let i = 0;

    if (element.typingInterval) {
      clearInterval(element.typingInterval);
      element.typingInterval = null;
    }

    function insertImage(url) {
      const img = document.createElement("img");
      img.src = url;
      img.classList.add("img");
      img.style.width = "auto";
      img.style.height = "auto";
      img.style.marginTop = "7.5px";
      img.style.marginLeft = "0px";
      img.onerror = () => console.error(`Failed to load image: ${url}`);
      element.appendChild(img);
    }

    const interval = setInterval(function () {
      if (i >= text.length) {
        clearInterval(interval);
        if (callback) callback();
        resolve(); // Resolve the promise here
        return;
      }

      const char = text.charAt(i);

      if (char === "\n") {
        element.appendChild(document.createElement("br"));
        i++;
      } else if (char === "(") {
        let j = i + 1;
        while (j < text.length && text.charAt(j) !== ")") j++;
        if (j < text.length) {
          const content = text.substring(i + 1, j).trim();
          if (
            content.match(/\.(gif|jpe?g|tiff?|png|webp|bmp|svg|ico|avif)$/i)
          ) {
            insertImage(content);
            i = j + 1;
          } else {
            element.innerHTML += `(${content})`;
            i = j + 1;
          }
        } else {
          element.innerHTML += char;
          i++;
        }
      } else if (char === "<") {
        let j = i + 1;
        while (j < text.length && text.charAt(j) !== ">") j++;
        if (j < text.length) {
          const tag = text.substring(i, j + 1);
          element.innerHTML += tag;
          i = j + 1;
        } else {
          element.innerHTML += char;
          i++;
        }
      } else {
        element.innerHTML += char;
        i++;
      }
    }, speed);

    element.typingInterval = interval;
  });
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function showQuiz() {
  const quizContainer = document.querySelector(".quiz");
  quizContainer.classList.add("show");
  document.body.style.backgroundColor = "#fff";

  // Clear the quiz heading before applying the typing effect
  quizHeading.textContent = "";
  typeText(quizHeading, subjectName, 30);
}

function hideQuiz() {
  const quizContainer = document.querySelector(".quiz");
  quizContainer.classList.remove("show");
  document.body.style.backgroundColor = "";
}

function populateLessonDropdown(subjectName) {
  const lessonDropdown = document.getElementById("quiz-lesson");
  lessonDropdown.innerHTML = '<option value="সকল পাঠ">সকল পাঠ</option>'; // Reset dropdown with default option

  const section = data.sections.find((s) => s.section === subjectName);
  if (section && section.questions) {
    const lessons = new Set();
    section.questions.forEach((question) => {
      if (question.lesson) {
        lessons.add(question.lesson);
      }
    });

    if (lessons.size > 0) {
      lessons.forEach((lesson) => {
        const option = document.createElement("option");
        option.value = lesson;
        option.textContent = lesson;
        lessonDropdown.appendChild(option);
      });
      lessonDropdownMenu.classList.remove("hide"); // Show dropdown menu
    } else {
      lessonDropdownMenu.classList.add("hide"); // Hide dropdown menu if no lessons
      console.log("No lessons found for this subject, hiding dropdown.");
    }
  } else {
    lessonDropdownMenu.classList.add("hide"); // Hide dropdown menu if section or questions are missing
    console.log("Section or questions not found, hiding dropdown.");
  }
}

function updateMinLimitsForLesson() {
  const selectedLessonForLimit = quizLessonDropdown.value;
  let filteredQuestionsForLimit = questions;
  let newMinLimit;
  let maxQuestionsForLesson;

  if (selectedLessonForLimit !== "সকল পাঠ") {
    filteredQuestionsForLimit = questions.filter(
      (q) => q.lesson === selectedLessonForLimit
    );
    const availableQuestionsCount = filteredQuestionsForLimit.length;
    maxQuestionsForLesson = availableQuestionsCount; // Set max questions for lesson
    if (availableQuestionsCount < 10) {
      newMinLimit = 1; // Min 1 if less than 10 questions
    } else if (availableQuestionsCount < 30) {
      newMinLimit = 10; // Min 10 if between 10 and 29 questions
    } else {
      newMinLimit = 30; // Default 30 if 30 or more questions
    }
  } else {
    newMinLimit = 30; // Default 30 for "সকল পাঠ"
    maxQuestionsForLesson = questions.length; // Set max question for সকল পাঠ
  }

  questionLimitInput.min = newMinLimit;
  timeLimitInput.min = newMinLimit;
  questionLimitInput.max = maxQuestionsForLesson; // Update max limit
  timeLimitInput.max = maxQuestionsForLesson; // Update max limit
  questionLimitInput.value = newMinLimit;
  timeLimitInput.value = newMinLimit;

  validateInputs(); // Re-validate inputs to update error message if needed
}

function showStartScreen(subjectName) {
  const startScreen = document.querySelector(".start-screen");

  // Remove the direct text content setting
  // startScreenHeading.textContent = subjectName;

  // Apply typing effect to the heading:
  typeText(startScreenHeading, subjectName, 30);

  // Now 'data' is accessible
  const section = data.sections.find((s) => s.section === subjectName);

  if (section) {
    questions = section.questions;

    // Initialize maxQuestions to total questions before filtering
    let maxQuestions = questions.length;

    // Filter questions based on selected lesson (even on start screen load to initialize correctly)
    let filteredQuestions = questions;
    selectedLesson = quizLessonDropdown.value; // Ensure selectedLesson is up-to-date
    if (selectedLesson !== "সকল পাঠ") {
      filteredQuestions = questions.filter((q) => q.lesson === selectedLesson);
      maxQuestions = filteredQuestions.length; // Update maxQuestions after filtering
    } else {
      maxQuestions = questions.length; // if সকল পাঠ are selected then max question is total question
    }

    questionLimitInput.max = maxQuestions;
    questionLimit = Math.min(parseInt(questionLimitInput.value), maxQuestions);

    timeLimitInput.max = maxQuestions;
    timeRemaining = Math.min(parseInt(timeLimitInput.value), maxQuestions) * 60;

    updateMinLimitsForLesson(); // Call to set initial min limits based on 'সকল পাঠ' or default
    populateLessonDropdown(subjectName); // Populate and handle dropdown visibility here
  } else {
    console.error("Subject not found:", subjectName);
    errorMessage.textContent = "Subject not found. Please refresh the page.";
    errorMessage.classList.remove("hide");
    lessonDropdownMenu.classList.add("hide"); // Ensure dropdown is hidden if subject not found
    return;
  }

  startScreen.classList.remove("hide");

  const quizScreen = document.querySelector(".quiz");
  if (!quizScreen.classList.contains("hide")) {
    quizScreen.classList.add("hide");
  }
}

window.addEventListener("message", function (event) {
  if (event.data.subjectName) {
    const subjectName = event.data.subjectName;
    const quizHeading = document
      .getElementById("quiz-heading")
      .querySelector(".quiz-heading");
    const endScreenHeading = document.getElementById("end-screen-heading");
    const errorMessage = document.getElementById("error-message");
    const quizLessonLabel = document.getElementById("quiz-lesson-label");

    // Use the subjectName to set the headings
    typeText(quizHeading, subjectName, 30);
    typeText(endScreenHeading, subjectName, 30);

    // Reset input fields
    document.getElementById("time-limit").value = 30;
    document.getElementById("question-limit").value = 30;
    document.getElementById("quiz-lesson").value = "সকল পাঠ"; // Reset lesson dropdown to default
    questionLimitInput.value = 30;
    timeLimitInput.value = 30;

    updateMinLimitsForLesson(); // Set min limits to default 30 when page loads

    // Reset error message
    errorMessage.textContent = "";
    errorMessage.classList.add("hide");

    // Apply typing effect to labels only
    typeText(
      document.getElementById("time-limit-label"),
      "মিনিট নির্ধারণ করুন :",
      30
    );
    typeText(
      document.getElementById("question-limit-label"),
      "প্রশ্নের সংখ্যা নির্ধারণ করুন :",
      30
    );
    typeText(document.getElementById("start-button"), "কুইজ শুরু করুন", 30);
    typeText(quizLessonLabel, "পাঠ নির্বাচন করুন :", 30); // Type lesson label

    lessonDropdownMenu.classList.add("hide"); // Initially hide, visibility will be handled in populateLessonDropdown
  }
});

// Function to clear question history (optional, for testing or user preference)
async function clearQuestionHistory() {
  try {
    await saveQuestionHistoryToDB({}); // Save an empty history object to clear it
    questionHistory = {};
    data.sections.forEach((section) => {
      // Re-initialize history structure
      questionHistory[section.section] = {};
    });
  } catch (error) {
    console.error("Error clearing question history:", error);
  }
}

// You might want to call this function when initializing the quiz or on a user action
// clearQuestionHistory();
