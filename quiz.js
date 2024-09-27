let questions = [], currentQuestion = 0, score = 0, timeRemaining = 0, timerInterval, selectedAnswer = null, questionLimit = 15, typingInterval, autoNextTimeout, shuffledQuestions = [], data = null;
const urls = [ 'http://localhost:8080/', 'http://localhost:3001/', 'http://localhost:5500/'];
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

  // Process the question text
  const content = `
  <h5>${convertNewlinesToHtml(processTextWithImages(questionData.question))}</h5>
`;

  // Clear the questionElement and start typing the question
  questionElement.innerHTML = content; // Clear previous text

  // Call the typing function with a callback to handle after typing is complete
  
    answerWrapperElement.style.opacity = "1";
    answerWrapperElement.style.animation = "fadeInUp 1s";

    displayAnswers(questionData);
    
    previousButton.disabled = currentQuestion === 0;

    updateQuestionCounter();
  
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

    shuffledOptions.forEach((option) => {
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
      element.appendChild(imgElement);
    }
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
  // Helper function to strip HTML tags and trim the string
  const stripHTML = (str) => str.replace(/<[^>]*>/g, '').trim();

  // If the correctAnswer is an array, check if any stripped version of the option matches any stripped version of the array elements
  if (Array.isArray(correctAnswer)) {
    return correctAnswer.some(answer => stripHTML(option) === stripHTML(answer));
  }

  // If correctAnswer is a string, compare the stripped versions of the option and correctAnswer
  if (typeof correctAnswer === 'string') {
    return stripHTML(option) === stripHTML(correctAnswer);
  }

  // If correctAnswer is an object, handle text and image properties
  if (typeof correctAnswer === 'object' && correctAnswer !== null) {
    const strippedOption = stripHTML(option);

    // Check if the object has both text and image properties
    if (correctAnswer.text && correctAnswer.image) {
      return (
        strippedOption.includes(stripHTML(correctAnswer.text)) &&
        strippedOption.includes(stripHTML(correctAnswer.image))
      );
    }
    
    // Check if the object has only the text property
    if (correctAnswer.text) {
      return strippedOption.includes(stripHTML(correctAnswer.text));
    }
    
    // Check if the object has only the image property
    if (correctAnswer.image) {
      return strippedOption.includes(stripHTML(correctAnswer.image));
    }
  }

  // Return false if none of the conditions match
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
  clearInterval(timerInterval);
  
  let correctCount = 0, wrongCount = 0;
  
  shuffledQuestions.forEach(q => {
    if (q.answered) {
      if (isCorrectAnswer(q.selectedAnswer, q.correctAnswer)) {
        correctCount++;
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
    { element: scoreElement, value: score.toString() },
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
    const quizHeading = document
      .getElementById("quiz-heading")
      .querySelector(".quiz-heading");
    const endScreenHeading =
      document.getElementById("end-screen-heading");
    const errorMessage = document.getElementById("error-message");

    // Remove the direct text content setting
    // quizHeading.textContent = subjectName;
    // endScreenHeading.textContent = subjectName;

    // Apply typing effect to headings
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

// ... (rest of the code remains the same)

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