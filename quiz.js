let questions = [], currentQuestion = 0, score = 0, timeRemaining = 0, timerInterval, selectedAnswer = null, questionLimit = 15, typingInterval, autoNextTimeout, shuffledQuestions = [], data = null;

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
let subjectName, questionHistory = {};
nextButton.disabled = false;


function stripHTML(html) {
  let temp = document.createElement("div");
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || "";
}

// Functions for managing localStorage
function saveQuestionHistory() {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('quizQuestionHistory', JSON.stringify(questionHistory));
    } catch (error) {
      console.error("Error saving question history to localStorage:", error);
    }
  } else {
    console.warn("localStorage is not available. Skipping save operation.");
  }
}

function loadQuestionHistory() {
  if (typeof localStorage !== 'undefined') {
    try {
      const savedHistory = localStorage.getItem('quizQuestionHistory');
      if (savedHistory) {
        questionHistory = JSON.parse(savedHistory);
      } else {
        questionHistory = {}; // Initialize to empty object if no saved history
      }
    } catch (error) {
      console.error("Error loading question history from localStorage:", error);
      questionHistory = {}; // Reset history to default if parsing fails
      displayError("Error loading question history. Starting with a clean slate.");
    }
  } else {
    console.warn("localStorage is not available. Skipping load operation.");
    questionHistory = {}; // Initialize to empty object if localStorage is not available
  }
}


async function loadQuestionData() {
  // Instead of fetching, just return the questionsData

  questionsData.sections.forEach(section => {
    if (!questionHistory[section.section]) {
      questionHistory[section.section] = [];
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

function validateInputs() {
  const questionLimitValue = parseInt(questionLimitInput.value);
  const timeLimitValue = parseInt(timeLimitInput.value);
  const maxQuestions = questions.length;

  let errorMessageText = "";

  if (isNaN(questionLimitValue) || isNaN(timeLimitValue)) {
    errorMessageText = "Please enter valid question and time limits.";
  } else if (questionLimitValue < 0 || timeLimitValue < 0) {
    errorMessageText = "Question and time limit must be at least 30.";
  } else if (questionLimitValue > maxQuestions || timeLimitValue > maxQuestions) {
    errorMessageText = `Question and time limits cannot exceed ${maxQuestions}.`;
  }

  startButton.disabled = !!errorMessageText;
  errorMessage.textContent = errorMessageText;
  errorMessage.style.opacity = errorMessageText ? 1 : 0;
  errorMessage.classList.toggle("hide", !errorMessageText);
}

questionLimitInput.addEventListener("input", validateInputs);
timeLimitInput.addEventListener("input", validateInputs);

function startQuiz() {
  const questionLimitValue = parseInt(questionLimitInput.value);
  const timeLimitValue = parseInt(timeLimitInput.value);
  startButton.disabled = false;

  if (questionLimitValue < 0 || timeLimitValue < 0) {
    errorMessage.textContent = "Question limit and time limit must be at least 30.";
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

  if (subjectName) {
    const section = data.sections.find(
      (s) => s.section === subjectName,
    );

    if (section) {
      questions = section.questions;
      shuffledQuestions = selectQuestions(questions, questionLimit, subjectName);
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

  shuffledQuestions.forEach((question) => {
    if (question) { // Check if question is defined
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

function selectQuestions(allQuestions, limit, subject) {
  let selectedQuestions = [];
  
  // Ensure questionHistory is defined and initialized for the subject
  if (!questionHistory[subject]) {
    questionHistory[subject] = [];
  }
  
  let availableQuestions = allQuestions.filter(q => !questionHistory[subject].includes(q.question));

  if (availableQuestions.length < limit) {
    const historyQuestions = [...questionHistory[subject]]; // Make a copy to avoid modifying the original during the loop

    while (selectedQuestions.length < limit) {
      if (availableQuestions.length === 0) {
        if (historyQuestions.length === 0) break;

        const randomIndex = Math.floor(Math.random() * historyQuestions.length);
        const questionText = historyQuestions.splice(randomIndex, 1)[0];

        // Find the question in allQuestions
        const question = allQuestions.find(q => q.question === questionText);
        if (question && !selectedQuestions.some(q => q.question === question.question)) {
          selectedQuestions.push(question);
        }
      } else {
        const randomIndex = Math.floor(Math.random() * availableQuestions.length);
        const question = availableQuestions.splice(randomIndex, 1)[0];
        selectedQuestions.push(question);
        questionHistory[subject].push(question.question);
      }
    }

    // Clear history if necessary
    if (historyQuestions.length < questionHistory[subject].length) {
      questionHistory[subject] = [];
    }
  } else {
    while (selectedQuestions.length < limit && availableQuestions.length > 0) {
      const randomIndex = Math.floor(Math.random() * availableQuestions.length);
      const question = availableQuestions.splice(randomIndex, 1)[0];
      selectedQuestions.push(question);
      questionHistory[subject].push(question.question);
    }
  }

  // Fill remaining slots from allQuestions if needed
  while (selectedQuestions.length < limit) {
    const randomIndex = Math.floor(Math.random() * allQuestions.length);
    const question = allQuestions[randomIndex];
    if (!selectedQuestions.includes(question)) {
      selectedQuestions.push(question);
    }
  }

  saveQuestionHistory();
  return shuffleArray(selectedQuestions);
}

  function convertNewlinesToHtml(text) {
    return text.replace(/\n/g, '<br>');
}
function processTextWithImages(text, isEditMode = false) {
  if (isEditMode) {
      // In edit mode, return the original text with image links
      return text.replace(/<div class="image-container"><img src="([^"]+)"[^>]+><\/div>/g, '($1)');
  }

  // For display mode, replace image links with image elements
  return text.replace(/\(image\/[^\)]+\)/g, match => {
      const imgSrc = match.slice(1, -1); // Remove surrounding parentheses
      return `<div><img src="${imgSrc}" style="margin: 10px 0; height: auto; max-width: 100%;" alt="Image"></div>`;
  });
}


function displayQuestion() {
  if (!shuffledQuestions || currentQuestion < 0 || currentQuestion >= shuffledQuestions.length) {
    showError("Invalid question index or question array.");
    return;
  }

  const questionData = shuffledQuestions[currentQuestion];
  clearPreviousContent();

  // Process the question text with images and LaTeX
  let content = processTextWithImages(questionData.question);

<<<<<<< HEAD
  // Highlight text inside '....'
  content = content.replace(/'([^']+)'/g, function(_match, p1) {
    return `<span class="highlight">${p1}</span>`;
  });

=======
>>>>>>> e8f0884653b9a8e2be577b132b7b049ae14ae4ce
  // Replace <... class="mathy"> with <script type="math/asciimath">, preserving inner content
  content = content.replace(/<[^>]*class="mathy"[^>]*>(.*?)<\/[^>]*>/g, function(_match, p1) {
    // Strip out any HTML tags inside the mathy element content
    const cleanedContent = p1.replace(/<[^>]*>/g, ''); // Remove all HTML tags
    return `<script type="math/asciimath">${cleanedContent}</script>`;
  });

  const questionHTML = `
    <h5>${convertNewlinesToHtml(content)}</h5>
  `;
  questionElement.innerHTML = questionHTML;

  // Ensure all images in the question have drag prevention
  const questionImages = questionElement.querySelectorAll("img");
  questionImages.forEach(img => {
    img.addEventListener('dragstart', (event) => {
      event.preventDefault(); // Prevent dragging
    });
  });

  // Render MathJax to process ASCII Math
  MathJax.Hub.Queue(["Typeset", MathJax.Hub, questionElement]);

<<<<<<< HEAD
=======

>>>>>>> e8f0884653b9a8e2be577b132b7b049ae14ae4ce
  // Display the answers
  displayAnswers(questionData);

  // Fade-in animation for answers
  answerWrapperElement.style.opacity = "1";
  answerWrapperElement.style.animation = "fadeInUp 1s";

  // Disable the previous button if this is the first question
  previousButton.disabled = currentQuestion === 0;

  // Update the question counter
  updateQuestionCounter();
<<<<<<< HEAD

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
=======
}

>>>>>>> e8f0884653b9a8e2be577b132b7b049ae14ae4ce





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
      let content = optionText;
      
      // Handle MathJax content replacement
      content = content.replace(/<[^>]*class="mathy"[^>]*>(.*?)<\/[^>]*>/g, function(match, p1) {
        const cleanedContent = p1.replace(/<[^>]*>/g, ''); // Remove all HTML tags
        return `<script type="math/asciimath">${cleanedContent}</script>`;
      });

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
      let content = optionText;

      // Handle MathJax content replacement
      content = content.replace(/<[^>]*class="mathy"[^>]*>(.*?)<\/[^>]*>/g, function(match, p1) {
        const cleanedContent = p1.replace(/<[^>]*>/g, ''); // Remove all HTML tags
        return `<script type="math/asciimath">${cleanedContent}</script>`;
      });

      // Render the content inside the button
      displayTextAndImage(answerButton, content);

      // Allow user to select an answer
      answerButton.addEventListener("click", () => selectAnswer(answerButton, option));
      answerWrapperElement.appendChild(answerButton);
    });
  }

  // Trigger MathJax to render any math content that was inserted dynamically
  MathJax.Hub.Queue(["Typeset", MathJax.Hub, answerWrapperElement]);
}


function displayTextAndImage(element, content) {
  if (typeof content === 'string') {
    if (content.trim().startsWith('<') && content.trim().endsWith('>')) {
      // If content is HTML, set it directly
      element.innerHTML = content;
    } else {
      // If it's plain text, split it and handle images
      const parts = content.split(/(\(image\/[^)]+\))/);
      
      parts.forEach(part => {
        if (part.startsWith('(image/') && part.endsWith(')')) {
          const imgElement = document.createElement("img");
          imgElement.src = part.slice(1, -1); // Remove parentheses
          imgElement.alt = "Quiz image";
          imgElement.style.maxWidth = '100%';
          imgElement.style.height = 'auto';
          imgElement.style.margin = '10px 0';
          
          // Prevent dragging of images
          imgElement.addEventListener('dragstart', (event) => {
            event.preventDefault(); // Prevent dragging
          });

          element.appendChild(imgElement);
        } else if (part.trim() !== '') {
          const textWithBreaks = part.replace(/\n/g, '<br>');
          const divElement = document.createElement("div");
          divElement.innerHTML = textWithBreaks;
          element.appendChild(divElement);
        }
      });
    }
  } else if (typeof content === 'object' && content !== null) {
    if (content.text) {
      const textWithBreaks = content.text.replace(/\n/g, '<br>');
      const textNode = document.createElement("div");
      textNode.innerHTML = textWithBreaks;
      element.appendChild(textNode);
    }
    if (content.image) {
      const imgElement = document.createElement("img");
      imgElement.src = content.image;
      imgElement.alt = "Quiz image";
      imgElement.style.maxWidth = '100%';
      imgElement.style.height = 'auto';
      imgElement.style.margin = '10px 0';
      
      // Prevent dragging of images
      imgElement.addEventListener('dragstart', (event) => {
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
  const correctOption = shuffledQuestions[currentQuestion].options.find(option => isCorrectAnswer(option));

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
    const correctAnswerElement = answerWrapperElement.querySelector(".answer.c");
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
  shuffledQuestions[currentQuestion].selectedAnswer = Object.keys(selectedOption)[0];

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
  return shuffledQuestions.slice(0, questionLimit).filter(q => !q.answered).length;
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
    
    if (shuffledQuestions.slice(0, questionLimit).every((question) => question.answered)) {
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

  if (currentQuestion > 0) {
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

  let correctCount = 0, wrongCount = 0, totalScore = 0;

  // Iterate through all questions to count correct and wrong answers
  shuffledQuestions.forEach(q => {
    if (q.answered) { // Only count answered questions
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
  scoreElement.textContent = '';
  totalScoreElement.textContent = '';
  document.querySelector(".correct-count").textContent = '';
  document.querySelector(".wrong-count").textContent = '';
  document.querySelector(".not-answered-count").textContent = '';

  // Create an array of results to type out
  const results = [
    { element: scoreElement, value: totalScore.toString() }, // Display total score
    { element: totalScoreElement, value: questionLimit.toString() },
    { element: document.querySelector(".correct-count"), value: correctCount.toString() },
    { element: document.querySelector(".wrong-count"), value: wrongCount.toString() },
    { element: document.querySelector(".not-answered-count"), value: notAnsweredCount.toString() }
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
    progressText.innerHTML = hours ? `${hours}h ${minutes}m ${seconds}s` : minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;

    const percentageRemaining = (timeRemaining / (parseInt(timeLimitInput.value) * 60)) * 100;
    progressBar.style.width = `${percentageRemaining}%`;
    progressText.style.color = percentageRemaining >= 49.5 ? "#fff" : "#000";

    const barRect = progressBar.getBoundingClientRect();
    const textRect = progressText.getBoundingClientRect();
    progressText.classList.toggle("visible", barRect.right < textRect.left || barRect.bottom < textRect.top || barRect.top > textRect.bottom);

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

window.addEventListener("message", function (event) {
  if (event.data === "closeQuiz") {
    closeQuiz();
  } else if (event.data.subjectName) {
    subjectName = event.data.subjectName;
    // Call showStartScreen only AFTER data is loaded
    loadQuestionData().then((fetchedData) => { 
      if (fetchedData) {
        data = fetchedData;
        showStartScreen(subjectName);
      } else {
        // Handle the case where data is null (e.g., due to a fetch error)
        console.error("Error fetching data. Data is null.");
        errorMessage.textContent = "";
        errorMessage.style.opacity = 1;
        errorMessage.textContent =
          "Error loading questions. Please refresh the page.";
        errorMessage.classList.remove("hide");
      }
    });
  } else if (event.data === 'reloadQuiz') {
    // Handle quiz reload if needed
    loadQuestionHistory(); // Reload question history on quiz reload
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
      const img = document.createElement('img');
      img.src = url;
      img.classList.add('img');
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

      if (char === '\n') {
        element.appendChild(document.createElement('br'));
        i++;
      } else if (char === '(') {
        let j = i + 1;
        while (j < text.length && text.charAt(j) !== ')') j++;
        if (j < text.length) {
          const content = text.substring(i + 1, j).trim();
          if (content.match(/\.(gif|jpe?g|tiff?|png|webp|bmp|svg|ico|avif)$/i)) {
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
      } else if (char === '<') {
        let j = i + 1;
        while (j < text.length && text.charAt(j) !== '>') j++;
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

// ... (previous code remains the same)

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
    const maxQuestions = questions.length;

    questionLimitInput.max = maxQuestions;
    questionLimit = Math.min(parseInt(questionLimitInput.value), maxQuestions);

    timeLimitInput.max = maxQuestions;
    timeRemaining = Math.min(parseInt(timeLimitInput.value), maxQuestions) * 60;
  } else {
    console.error("Subject not found:", subjectName);
    errorMessage.textContent = "Subject not found. Please refresh the page.";
    errorMessage.classList.remove("hide");
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
    const quizHeading = document.getElementById("quiz-heading").querySelector(".quiz-heading");
    const endScreenHeading = document.getElementById("end-screen-heading");
    const errorMessage = document.getElementById("error-message");

    // Use the subjectName to set the headings
    typeText(quizHeading, subjectName, 30);
    typeText(endScreenHeading, subjectName, 30);

    // Reset input fields
    document.getElementById("time-limit").value = 30; 
    document.getElementById("question-limit").value = 30;

    // Reset error message
    errorMessage.textContent = ""; 
    errorMessage.classList.add("hide");

    // Apply typing effect to labels only
    typeText(
      document.getElementById("time-limit-label"),
      "মিনিট নির্ধারণ করুন:",
      30
    );
    typeText(
      document.getElementById("question-limit-label"),
      "প্রশ্নের সংখ্যা নির্ধারণ করুন:",
      30
    );
    typeText(document.getElementById('start-button'), 'কুইজ শুরু করুন', 30); 
  }
});



// Function to clear question history (optional, for testing or user preference)
function clearQuestionHistory() {
  localStorage.removeItem('quizQuestionHistory');
  questionHistory = {};
  data.sections.forEach(section => {
    questionHistory[section.section] = [];
  });
  console.log("Question history cleared");
}

// You might want to call this function when initializing the quiz or on a user action
// clearQuestionHistory();