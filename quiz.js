// Global variables
let questions = [];
const questionLimitInput = document.getElementById("question-limit");
const timeLimitInput = document.getElementById("time-limit");
let currentQuestion = 0;
let score = 0;
let timeRemaining = 0;
let timerInterval;
let selectedAnswer = null;
let questionLimit = 15;
let typingInterval;
let autoNextTimeout;
let shuffledQuestions = []; // Initialized as an empty array
let data = null;
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

let subjectName;

// Function to load questions data (using Promise)
async function loadQuestionData() {
  try {
    const response = await fetch('http://localhost:3001/questions.json'); 
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching or parsing data:", error);
    errorMessage.textContent = "";
    
    errorMessage.textContent =
      "Error loading questions. Please refresh the page.";
    errorMessage.classList.remove("hide");
    return null; 
  }
}

// Fetch and parse data from questions.json
loadQuestionData()
  .then((fetchedData) => {
    if (fetchedData) {
      data = fetchedData;
      startButton.disabled = false;
    } else {
      console.error("Error fetching data. Data is null.");
      errorMessage.textContent = "";
      errorMessage.style.opacity = 1;
      errorMessage.textContent =
        "Error loading questions. Please refresh the page.";
      errorMessage.classList.remove("hide");
    }
  });

// Start Quiz button event
startButton.addEventListener("click", startQuiz);

// Event listeners for buttons
nextButton.addEventListener("click", nextQuestion);
previousButton.addEventListener("click", previousQuestion);
stopButton.addEventListener("click", stopQuiz);
document.querySelector(".restart").addEventListener("click", restartQuiz);

function validateInputs() {
  const questionLimitValue = parseInt(questionLimitInput.value);
  const timeLimitValue = parseInt(timeLimitInput.value);
  const maxQuestions = questions.length;

  if (isNaN(questionLimitValue) || isNaN(timeLimitValue)) {
    startButton.disabled = true;
    errorMessage.textContent = "";
    errorMessage.style.opacity = 1;
    errorMessage.textContent = "Please enter valid question and time limits.";
    errorMessage.classList.remove("hide");
    return;
  } else if (questionLimitValue < 30 || timeLimitValue < 30) {
    startButton.disabled = true;
    errorMessage.textContent = "";
    errorMessage.style.opacity = 1;
    errorMessage.textContent =
      "Question limit and time limit must be at least 30.";
    errorMessage.classList.remove("hide");
    return;
  } else if (
    questionLimitValue > maxQuestions ||
    timeLimitValue > maxQuestions
  ) {
    startButton.disabled = true;
    errorMessage.textContent = "";
    errorMessage.style.opacity = 1;
    errorMessage.textContent = `Question and time limits cannot exceed ${maxQuestions}.`;
    errorMessage.classList.remove("hide");
    return;
  } else {
    startButton.disabled = false;
    errorMessage.classList.add("hide");
  }
}

questionLimitInput.addEventListener("input", validateInputs);
timeLimitInput.addEventListener("input", validateInputs);

function startQuiz() {
  const questionLimitValue = parseInt(questionLimitInput.value);
  const timeLimitValue = parseInt(timeLimitInput.value);
  startButton.disabled = false;

  if (questionLimitValue < 30 || timeLimitValue < 30) {
    errorMessage.textContent = "";
    errorMessage.style.opacity = 1;
    errorMessage.textContent =
      "Question limit and time limit must be at least 30.";
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
      shuffledQuestions = shuffleArray(questions.slice(0, questionLimit)); // Shuffle within section
    } else {
      console.error("Subject not found:", subjectName);
      errorMessage.textContent = "";
      errorMessage.style.opacity = 1;
      errorMessage.textContent = "Subject not found. Please refresh the page.";
      errorMessage.classList.remove("hide");
      return;
    }
  } else {
    console.warn("Subject name not yet received from parent window.");
    errorMessage.textContent = "";
    errorMessage.style.opacity = 1;
    errorMessage.textContent = "Loading subject...";
    errorMessage.classList.remove("hide");
    return;
  }

  questions.forEach((question) => {
    question.answered = false;
  });

  startScreen.classList.add("hide");
  quizScreen.classList.remove("hide");
  showQuiz();

  typeText(quizHeading, subjectName, 30);

  typeText(previousButton, "Previous", 30);
  typeText(stopButton, "Stop", 30);
  typeText(nextButton, "Next", 30);

  startTimer();
  displayQuestion();
}

function displayQuestion() {
  const questionData = shuffledQuestions[currentQuestion];

  // Clear previous answers and question
  answerWrapperElement.innerHTML = "";
  questionElement.textContent = "";

  // Add fade-in animation
  answerWrapperElement.style.animation = "fadeInUp 1s";

  // Type the question text character by character
  typeText(questionElement, questionData.question.replace(/\\n/g, '\n'), 25); 

  if (questionData.answered) {
    questionData.options.forEach((option) => {
      const answerButton = document.createElement("div");
      answerButton.classList.add("answer");

      if (typeof option === 'string') {
        const parts = option.split(' ');
        const textPart = parts.filter(part => !part.match(/(gif|jpe?g|tiff?|png|webp|bmp|svg|ico|avif)$/i)).join(' ');
        answerButton.textContent = textPart;

        const imagePart = parts.find(part => part.match(/(gif|jpe?g|tiff?|png|webp|bmp|svg|ico|avif)$/i));
        if (imagePart) {
          const imgElement = document.createElement("img");
          imgElement.src = imagePart;
          imgElement.alt = "Option Image";
          imgElement.style.maxWidth = '90%'; 
          imgElement.style.margin = '10px'; 
          answerButton.appendChild(imgElement);
        }
      } else if (typeof option === 'object') {
        answerButton.textContent = option.text;

        if (option.image) {
          const imgElement = document.createElement("img");
          imgElement.src = option.image;
          imgElement.alt = "Option Image";
          imgElement.style.maxWidth = '90%'; 
          imgElement.style.margin = '10px'; 
          answerButton.appendChild(imgElement);
        }
      }

      if (typeof option === 'string' && option === questionData.correctAnswer) {
        answerButton.classList.add("correct");
      } else if (typeof option === 'object' && option.text === questionData.correctAnswer) {
        answerButton.classList.add("correct");
      } else if (typeof option === 'string' && option === questionData.selectedAnswer) {
        answerButton.classList.add("wrong");
      } else if (typeof option === 'object' && option.text === questionData.selectedAnswer) {
        answerButton.classList.add("wrong");
      }

      answerButton.classList.add("disabled");

      answerWrapperElement.appendChild(answerButton);
    });
  } else {
    // Shuffle the answer options for each question
    const shuffledOptions = shuffleArray(questionData.options);

    // Type each answer option character by character
    shuffledOptions.forEach((option, index) => {
      const answerButton = document.createElement("div");
      answerButton.classList.add("answer");

      // Handle string and object options
      if (typeof option === 'string') {
        // Split the option string by space
        const parts = option.split(' ');
        const textPart = parts.filter(part => !part.match(/(gif|jpe?g|tiff?|png|webp|bmp|svg|ico|avif)$/i)).join(' ');
        answerButton.textContent = textPart;

        // Find the image filename
        const imagePart = parts.find(part => part.match(/(gif|jpe?g|tiff?|png|webp|bmp|svg|ico|avif)$/i));
        if (imagePart) {
          const imgElement = document.createElement("img");
          imgElement.src = imagePart;
          imgElement.alt = "Option Image";
          imgElement.style.maxWidth = '90%'; 
          imgElement.style.margin = '10px'; 
          answerButton.appendChild(imgElement);
        }
      } else if (typeof option === 'object') {
        // Handle object with 'text' and 'image' properties
        answerButton.textContent = option.text;

        if (option.image) {
          const imgElement = document.createElement("img");
          imgElement.src = option.image;
          imgElement.alt = "Option Image";
          imgElement.style.maxWidth = '90%'; 
          imgElement.style.margin = '10px'; 
          answerButton.appendChild(imgElement);
        }
      }

      // REPLACE THE OPTION HERE BEFORE PASSING TO typeText
      option = option.replace(/\\n/g, '\n');

      // Type the option text
      typeText(answerButton, option, 0 + index * 0); // Delay options a bit

      // Add event listener for answer selection
      answerButton.addEventListener("click", () => selectAnswer(answerButton));
      answerWrapperElement.appendChild(answerButton);
    });
  }

  // Update question progress display
  const currentQuestionNumber = document.querySelector(".current");
  currentQuestionNumber.textContent = currentQuestion + 1;
  const totalQuestionNumber = document.querySelector(".total");
  totalQuestionNumber.textContent = questionLimit;

  // Disable previous button for the first question
  previousButton.disabled = currentQuestion === 0;
}

function selectAnswer(answerButton) {
  if (shuffledQuestions[currentQuestion].answered) {
    return;
  }

  selectedAnswer = answerButton;
  selectedAnswer.classList.add("selected");

  const correctAnswer = shuffledQuestions[currentQuestion].correctAnswer;

  const allAnswers = answerWrapperElement.querySelectorAll(".answer");
  allAnswers.forEach((answer) => {
    const answerText = typeof answer.textContent === 'string' ? answer.textContent : answer.textContent.trim(); 

    if (typeof correctAnswer === 'string' && answerText === correctAnswer) {
      answer.classList.add("correct");
    } else if (typeof correctAnswer === 'object' && answerText === correctAnswer.text) {
      answer.classList.add("correct");
    } else {
      answer.classList.add("disabled");
    }
    answer.removeEventListener("click", selectAnswer);
  });

  if (typeof correctAnswer === 'string' && selectedAnswer.textContent === correctAnswer) {
    score++;
    selectedAnswer.classList.add("correct");
  } else if (typeof correctAnswer === 'object' && selectedAnswer.textContent === correctAnswer.text) {
    score++;
    selectedAnswer.classList.add("correct");
  } else {
    selectedAnswer.classList.add("wrong");
  }

  shuffledQuestions[currentQuestion].answered = true;
  shuffledQuestions[currentQuestion].selectedAnswer =
    selectedAnswer.textContent;

  nextButton.disabled = false;

  autoNextTimeout = setTimeout(nextQuestion, 400);
}

function findNextUnansweredQuestion() {
  for (let i = currentQuestion + 1; i < questionLimit; i++) {
    if (!shuffledQuestions[i].answered) {
      return i;
    }
  }
  return -1;
}

function nextQuestion() {
  clearInterval(typingInterval);
  clearTimeout(autoNextTimeout);

  const nextUnansweredIndex = findNextUnansweredQuestion();

  if (nextUnansweredIndex !== -1) {
    currentQuestion = nextUnansweredIndex;
    selectedAnswer = null;

    answerWrapperElement.style.animation = "fadeInUp 1s";

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
        (question) => !question.answered,
      );
      if (firstUnansweredIndex !== -1) {
        currentQuestion = firstUnansweredIndex;
        selectedAnswer = null;

        answerWrapperElement.style.animation = "fadeInUp 1s";

        displayQuestion();
      }
    }
  }
}

function previousQuestion() {
  clearInterval(typingInterval);
  clearTimeout(autoNextTimeout);

  currentQuestion--;
  selectedAnswer = null;

  answerWrapperElement.style.animation = "fadeInUp 1s";

  displayQuestion();
}

function stopQuiz() {
  clearInterval(timerInterval);
  quizScreen.classList.add("hide");
  endScreen.classList.remove("hide");
  hideQuiz();
  calculateAndDisplayResults();
}

function displayFinalResults() {
  clearInterval(timerInterval);
  quizScreen.classList.add("hide");
  endScreen.classList.remove("hide");

  calculateAndDisplayResults();
}

function calculateAndDisplayResults() {
  const correctCount = shuffledQuestions.filter(
    (q) => q.answered && q.selectedAnswer === q.correctAnswer,
  ).length;
  const wrongCount = shuffledQuestions.filter(
    (q) => q.answered && q.selectedAnswer !== q.correctAnswer,
  ).length;
  const notAnsweredCount = questionLimit - (correctCount + wrongCount);

  scoreElement.textContent = score;
  totalScoreElement.textContent = questionLimit;
  document.querySelector(".correct-count").textContent = correctCount;
  document.querySelector(".wrong-count").textContent = wrongCount;
  document.querySelector(".not-answered-count").textContent = notAnsweredCount;

  const elementsToType = [
    scoreElement,
    totalScoreElement,
    document.querySelector(".correct-count"),
    document.querySelector(".wrong-count"),
    document.querySelector(".not-answered-count"),
  ];

  clearInterval(typingInterval);

  let currentIndex = 0;
  typingInterval = setInterval(() => {
    if (currentIndex < elementsToType.length) {
      typeText(
        elementsToType[currentIndex],
        elementsToType[currentIndex].textContent,
        250,
      );
      currentIndex++;
    } else {
      clearInterval(typingInterval);
    }
  }, 200);
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
    const seconds = Math.floor(timeRemaining % 60);

    if (hours > 0) {
      progressText.innerHTML = `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      progressText.innerHTML = `${minutes}m ${seconds}s`;
    } else {
      progressText.innerHTML = `${seconds}s`;
    }

    const percentageRemaining =
      (timeRemaining / (parseInt(timeLimitInput.value) * 60)) * 100;
    progressBar.style.width = `${percentageRemaining}%`;

    if (percentageRemaining >= 49.5) {
      progressText.style.color = "#fff";
    } else {
      progressText.style.color = "#000";
    }

    const progressBarRect = progressBar.getBoundingClientRect();
    const progressTextRect = progressText.getBoundingClientRect();

    if (
      progressBarRect.right < progressTextRect.left ||
      progressBarRect.bottom < progressTextRect.top ||
      progressBarRect.top > progressTextRect.bottom
    ) {
      progressText.classList.add("visible");
    } else {
      progressText.classList.remove("visible");
    }

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
    // Handle 'reloadQuiz' message here
    console.log("Received 'reloadQuiz' message. Reloading...");
    location.reload(); // Reloads the current page
  }
});



function closeQuiz() {
  
  window.parent.postMessage("closeQuiz", "*");
  
}

// Modified to reset typing animation
function typeText(element, text, speed, callback) {
  let i = 0;
  let interval = null; 

  // Clear any existing interval for this element
  if (element.typingInterval) {
      clearInterval(element.typingInterval);
      element.typingInterval = null;
  }

  // Clear existing text content
  element.textContent = "";

  interval = setInterval(() => {
      if (i < text.length) {
          // Append the character
          element.textContent += text[i];
          i++;
      } else {
          clearInterval(interval);
          element.typingInterval = null; 
          if (callback) {
              callback();
          }
      }
  }, speed);
  
  // Store the interval reference for the element
  element.typingInterval = interval;  
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
}

function hideQuiz() {
  const quizContainer = document.querySelector(".quiz");
  quizContainer.classList.remove("show");
  document.body.style.backgroundColor = "";
}

function showStartScreen(subjectName) {
  const startScreen = document.querySelector(".start-screen");
  // Set the text content directly here:
  startScreenHeading.textContent = subjectName;
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
    const quizHeading = document
      .getElementById("quiz-heading")
      .querySelector(".quiz-heading");
    const endScreenHeading =
      document.getElementById("end-screen-heading");
    const errorMessage = document.getElementById("error-message");

    // Set the text content initially
    // REMOVE THIS LINE: startScreenHeading.textContent = subjectName; 
    quizHeading.textContent = subjectName;
    endScreenHeading.textContent = subjectName;

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
      30,
    );
    typeText(
      document.getElementById("question-limit-label"),
      "প্রশ্নের সংখ্যা নির্ধারণ করুন:",
      30,
    );
    typeText(document.getElementById('start-button'), 'কুইজ শুরু করুন', 30); 

    // Call showStartScreen with the loaded data
    // showStartScreen(subjectName, data); 
  }
});
function closeQuiz() {
  window.parent.postMessage("closeQuiz", "*");
  location.reload(); // Reloads the current page
}

