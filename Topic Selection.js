let questions = [], currentQuestion = 0, score = 0, timeRemaining = 0, timerInterval, selectedAnswer = null, questionLimit = 15, typingInterval, autoNextTimeout, shuffledQuestions = [], data = null;
const urls = ['http://localhost:5500/', 'http://localhost:3001/', 'http://localhost:8080/'];
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




// Functions for managing localStorage
function saveQuestionHistory() {
  localStorage.setItem('quizQuestionHistory', JSON.stringify(questionHistory));
}

function loadQuestionHistory() {
  const savedHistory = localStorage.getItem('quizQuestionHistory');
  if (savedHistory) {
    questionHistory = JSON.parse(savedHistory);
  }
}

async function loadQuestionData() {
  for (const baseUrl of urls) {
    try {
      const response = await fetch(`${baseUrl}questions.json`);
      if (!response.ok) {
        console.warn(`Failed to fetch from ${baseUrl}questions.json. Status: ${response.status}`);
        continue;
      }
      const data = await response.json();

      loadQuestionHistory();
      data.sections.forEach(section => {
        if (!questionHistory[section.section]) {
          questionHistory[section.section] = [];
        }
      });

      return data;
    } catch (error) {
      console.error(`Error fetching or parsing data from ${baseUrl}questions.json:`, error);
    }
  }

  displayError("Error loading questions. Please refresh the page.");
  return null;
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
  } else if (questionLimitValue < 30 || timeLimitValue < 30) {
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

  if (questionLimitValue < 30 || timeLimitValue < 30) {
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
    question.answered = false;
  });

  startScreen.classList.add("hide");
  quizScreen.classList.remove("hide");
  showQuiz();

  typeText(quizHeading, subjectName, 30);

  startTimer();
  displayQuestion();
}

function selectQuestions(allQuestions, limit, subject) {
  let selectedQuestions = [];
  let availableQuestions = allQuestions.filter(q => !questionHistory[subject].includes(q.question));

  if (availableQuestions.length < limit) {
    const historyQuestions = questionHistory[subject];
    while (selectedQuestions.length < limit) {
      if (availableQuestions.length === 0) {
        if (historyQuestions.length === 0) break;
        const randomIndex = Math.floor(Math.random() * historyQuestions.length);
        const question = historyQuestions.splice(randomIndex, 1)[0];
        if (!selectedQuestions.some(q => q.question === question)) {
          selectedQuestions.push(allQuestions.find(q => q.question === question));
        }
      } else {
        const randomIndex = Math.floor(Math.random() * availableQuestions.length);
        const question = availableQuestions.splice(randomIndex, 1)[0];
        selectedQuestions.push(question);
        questionHistory[subject].push(question.question);
      }
    }
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

function displayQuestion() {
  const questionData = shuffledQuestions[currentQuestion];
  
  answerWrapperElement.innerHTML = "";
  questionElement.innerHTML = ""; // Using innerHTML instead of textContent
  answerWrapperElement.style.opacity = "0";

  // Keep the newline characters as \n for processing in the typeText function
  const textWithBreaks = questionData.question;

  // Use typeText function to display the question with a typing effect
  typeText(questionElement, textWithBreaks, 0, () => {
    // Callback after the question has finished typing
    answerWrapperElement.style.opacity = "1";
    answerWrapperElement.style.animation = "fadeInUp 1s";

    displayAnswers(questionData);

    // Disable the previous button if it's the first question
    previousButton.disabled = currentQuestion === 0;
  });

  const currentQuestionNumber = document.querySelector(".current");
  currentQuestionNumber.textContent = currentQuestion + 1;
  
  const totalQuestionNumber = document.querySelector(".total");
  totalQuestionNumber.textContent = questionLimit;
}




function displayAnswers(questionData) {
  if (questionData.answered) {
    questionData.options.forEach((option) => {
      const answerButton = document.createElement("div");
      answerButton.classList.add("answer");

      displayTextAndImage(answerButton, option);

      if (isCorrectAnswer(option, questionData.correctAnswer)) {
        answerButton.classList.add("correct");
      } else if (option === questionData.selectedAnswer) {
        answerButton.classList.add("wrong");
      }

      answerButton.classList.add("disabled");
      answerWrapperElement.appendChild(answerButton);
    });
  } else {
    const shuffledOptions = shuffleArray(questionData.options);

    shuffledOptions.forEach((option, index) => {
      const answerButton = document.createElement("div");
      answerButton.classList.add("answer");

      displayTextAndImage(answerButton, option);

      answerButton.addEventListener("click", () => selectAnswer(answerButton, option));
      answerWrapperElement.appendChild(answerButton);
    });
  }
}

function displayTextAndImage(element, content) {
  if (typeof content === 'string') {
    // Split content into parts with text and image links
    const parts = content.split(/(\(image\/[^)]+\))/); // Split text and image link
    
    parts.forEach(part => {
      if (part.startsWith('(image/') && part.endsWith(')')) {
        // Handle image link
        const imgElement = document.createElement("img");
        imgElement.src = part.slice(1, -1); // Remove parentheses around image link
        imgElement.alt = "Image"; // Add descriptive alt text if possible
        imgElement.style.maxWidth = '30vw'; // Ensure image scales appropriately
        imgElement.style.margin = '5px auto'; // Apply margin
        element.appendChild(imgElement);
      } else if (part.trim() !== '') {
        // Handle text part and replace '\n' with <br>
        const textWithBreaks = part.replace(/\n/g, '<br>'); // Replace \n with <br>
        const divElement = document.createElement("div");
        divElement.innerHTML = textWithBreaks; // Insert text with line breaks
        element.appendChild(divElement);
      }
    });
  } else if (typeof content === 'object' && content !== null) {
    // Handle object with both text and image fields
    if (content.text) {
      const textWithBreaks = content.text.replace(/\n/g, '<br>');
      const textNode = document.createElement("div");
      textNode.innerHTML = textWithBreaks;
      element.appendChild(textNode);
    }
    if (content.image) {
      const imgElement = document.createElement("img");
      imgElement.src = content.image;
      imgElement.alt = "Image"; // Add descriptive alt text if possible
      imgElement.style.maxWidth = '30vw'; // Ensure image scales appropriately
      imgElement.style.margin = '5px auto'; // Apply margin
      element.appendChild(imgElement);
    }
  } else {
    console.error('Unsupported content type');
  }
}


function selectAnswer(answerButton, selectedOption) {
  if (shuffledQuestions[currentQuestion].answered) {
    return;
  }

  selectedAnswer = answerButton;
  selectedAnswer.classList.add("selected");

  const correctAnswer = shuffledQuestions[currentQuestion].correctAnswer;

  const allAnswers = answerWrapperElement.querySelectorAll(".answer");
  allAnswers.forEach((answer) => {
    const optionText = answer.textContent;
    if (isCorrectAnswer(optionText, correctAnswer)) {
      answer.classList.add("correct");
    } else {
      answer.classList.add("disabled");
    }
    answer.removeEventListener("click", selectAnswer);
  });

  if (isCorrectAnswer(selectedOption, correctAnswer)) {
    score++;
    selectedAnswer.classList.add("correct");
  } else {
    selectedAnswer.classList.add("wrong");
  }

  shuffledQuestions[currentQuestion].answered = true;
  shuffledQuestions[currentQuestion].selectedAnswer = selectedOption;

  nextButton.disabled = false;

  autoNextTimeout = setTimeout(nextQuestion, 400);
}

function isCorrectAnswer(option, correctAnswer) {
  if (Array.isArray(correctAnswer)) {
    return correctAnswer.includes(option);
  }
  
  if (typeof correctAnswer === 'string') {
    return option === correctAnswer;
  }
  
  if (typeof correctAnswer === 'object' && correctAnswer !== null) {
    if (correctAnswer.text && correctAnswer.image) {
      return option.includes(correctAnswer.text) && option.includes(correctAnswer.image);
    }
    if (correctAnswer.text) {
      return option.includes(correctAnswer.text);
    }
    if (correctAnswer.image) {
      return option.includes(correctAnswer.image);
    }
  }
  
  return false;
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
  }
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
    (q) => q.answered && q.selectedAnswer === q.correctAnswer
  ).length;
  const wrongCount = shuffledQuestions.filter(
    (q) => q.answered && q.selectedAnswer !== q.correctAnswer
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
        250
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
}

function typeText(element, text, speed, callback) {
  let i = 0;
  let interval = null; 

  // Clear any existing interval for this element
  if (element.typingInterval) {
    clearInterval(element.typingInterval);
    element.typingInterval = null;
  }

  // Clear existing content
  element.innerHTML = "";  // Use innerHTML to support <br> tags

  interval = setInterval(() => {
    if (i < text.length) {
      // Handle newline characters (\n) and convert them to <br>
      if (text[i] === "\n") {
        element.innerHTML += "<br>";  // Add the line break
        i++;  // Move to the next character
      } else if (text.slice(i, i + 4) === "<br>") {
        // Handle literal <br> tags
        element.innerHTML += "<br>";  // Add the line break
        i += 4;  // Skip over "<br>"
      } else {
        // Append the next character
        element.innerHTML += text[i];
        i++;
      }
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