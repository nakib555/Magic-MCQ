/* quiz.js */
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
    selectedLesson = "সকল পাঠ", // Track selected lesson,
    isPaused = false; // Track pause state

// Declare element variables, but assign them later in DOMContentLoaded
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

let subjectName,
    questionHistory = {};
// nextButton.disabled = false; // Cannot set property here, nextButton is null

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
        displayError( // Use displayError safely
            "Error loading question history. Starting with a clean slate."
        );
    }
}

async function loadQuestionData() {
    // Instead of fetching, just return the questionsData
    // Ensure questionsData is available globally or passed correctly
    if (typeof questionsData === 'undefined') {
        console.error("questionsData is not defined. Make sure it's loaded before calling loadQuestionData.");
        return null; // Or handle the error appropriately
    }

    if (questionsData && questionsData.sections) { // Add null check for questionsData
        questionsData.sections.forEach((section) => {
            if (!questionHistory[section.section]) {
                // Initialize history for sections if not present
                questionHistory[section.section] = {}; // History for each section is now an object
            }
        });
        return questionsData;
    } else {
        console.error("questionsData or questionsData.sections is missing.");
        return null;
    }


}

function displayError(message) {
    if (errorMessage) { // Check if errorMessage is assigned
        errorMessage.textContent = message;
        errorMessage.classList.remove("hide");
        errorMessage.style.opacity = 1;
    } else {
        console.error("Error Message Element not found! Message:", message);
    }
}

// Function to restrict input to numbers only
function restrictToNumbers(inputElement) {
    if (!inputElement) return; // Add null check
    inputElement.addEventListener("input", function () {
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

// Load data, but element assignments and listeners happen in DOMContentLoaded
loadQuestionData().then((fetchedData) => {
    if (fetchedData) {
        data = fetchedData;
        // Don't enable start button here, do it in DOMContentLoaded check
    } else {
        console.error("Data is null or failed to load.");
        // Can't display error yet as errorMessage might be null
        // displayError("Error loading questions. Please refresh the page.");
    }
});


function validateInputs() {
    // Add null checks for input elements
    if (!questionLimitInput || !timeLimitInput) {
        console.warn("Input elements not ready for validation.");
        return;
    }

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
        // Check if maxQuestions is a valid number before comparison
        if (!isNaN(maxQuestions) && maxQuestions > 0) {
             errorMessageText = `Question and time limits cannot exceed ${maxQuestions}.`; // Dynamic error message - NEW MESSAGE
        } else {
            // Handle case where maxQuestions might not be set yet or is invalid
             errorMessageText = `Please select a subject and lesson first.`;
        }
    }

    if (startButton) { // Check if startButton is defined before accessing disabled property
        startButton.disabled = !!errorMessageText;
    } else {
        console.warn("startButton is null, cannot update disabled state.");
    }
    // Use displayError safely
    if (errorMessageText) {
        displayError(errorMessageText);
    } else if (errorMessage) { // Hide only if errorMessage exists
        errorMessage.textContent = "";
        errorMessage.style.opacity = 0;
        errorMessage.classList.add("hide");
    }
}


async function startQuiz() {
    // Make startQuiz async
    if (!questionLimitInput || !timeLimitInput || !quizLessonDropdown || !startButton || !startScreen || !quizScreen || !quizHeading) {
        console.error("Required elements not ready to start quiz.");
        displayError("Initialization error. Please refresh.");
        return;
    }

    const questionLimitValue = parseInt(questionLimitInput.value);
    const timeLimitValue = parseInt(timeLimitInput.value);
    startButton.disabled = false; // Can assume startButton exists if we got here

    // Re-validate right before starting
     validateInputs();
     if (startButton.disabled) { // Check disabled property
         console.log("Start button disabled due to validation errors.");
         return; // Stop if validation fails
     }


    questionLimit = questionLimitValue;
    // Set initial timeRemaining HERE, not in startTimer()
    timeRemaining = timeLimitValue * 60;
    currentQuestion = 0;
    score = 0;
    selectedAnswer = null;
    isPaused = false; // Ensure quiz starts unpaused
    selectedLesson = quizLessonDropdown.value; // Get the selected lesson here

    if (!data) {
         console.error("Quiz data not loaded. Cannot start quiz.");
         displayError("Quiz data failed to load. Please refresh.");
         return;
     }

    if (subjectName) {
        const section = data.sections.find((s) => s.section === subjectName);

        if (section) {
            questions = section.questions;

            // Filter questions by selected lesson
            let filteredQuestions = questions;
            if (selectedLesson !== "সকল পাঠ") {
                filteredQuestions = questions.filter(
                    (q) => q && q.lesson === selectedLesson // Add safety check for q
                );
            }

             // Add safety check for filteredQuestions being an array
             if (!Array.isArray(filteredQuestions)) {
                 console.error("Filtered questions is not an array:", filteredQuestions);
                 displayError("Error filtering questions.");
                 return;
             }


            if (filteredQuestions.length === 0 && selectedLesson !== "সকল পাঠ") {
                displayError(`No questions available for the lesson: ${selectedLesson}. Please select 'সকল পাঠ' or a different lesson.`);
                return; // Stop quiz start if no questions for selected lesson
            } else if (
                filteredQuestions.length === 0 &&
                selectedLesson === "সকল পাঠ"
            ) {
                displayError(`No questions available for 'সকল পাঠ'. Please check question data.`);
                return; // Stop quiz start if no questions for সকল পাঠ
            } else {
                 if (errorMessage) errorMessage.classList.add("hide"); // Ensure error message is hidden if questions are found
            }

             // Check if the requested question limit exceeds available filtered questions
             if (questionLimitValue > filteredQuestions.length) {
                 displayError(`Requested ${questionLimitValue} questions, but only ${filteredQuestions.length} available for "${selectedLesson}". Limit adjusted.`);
                 questionLimit = filteredQuestions.length; // Adjust limit
                 questionLimitInput.value = questionLimit; // Update input display
                 // Adjust time limit proportionally or keep it as set? Decide based on requirements.
                 // For now, let's keep the user's time limit unless it's also too high
                 if (timeLimitValue > filteredQuestions.length) {
                     timeLimitInput.value = questionLimit;
                     timeRemaining = questionLimit * 60; // Adjust time if it was higher than new question limit
                 }

             }


            shuffledQuestions = await selectQuestions(
                filteredQuestions, // Use filtered questions
                questionLimit,     // Use the potentially adjusted limit
                subjectName,
                selectedLesson // Pass selectedLesson to selectQuestions
            ); // Await the Promise
        } else {
            console.error("Subject not found:", subjectName);
            displayError("Subject not found. Please refresh the page.");
            return;
        }
    } else {
        console.warn("Subject name not yet received from parent window.");
        displayError("Loading subject...");
        return;
    }

    if (shuffledQuestions.length === 0) {
        displayError("No questions could be selected for the quiz.");
        return; // Stop quiz start if no questions
    } else {
        if (errorMessage) errorMessage.classList.add("hide"); // Ensure error message is hidden if questions are found
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

    // Use typeText for the quiz heading
    if (quizHeading) typeText(quizHeading, subjectName, 30);

    startTimer(); // Start the timer
    displayQuestion(); // Display the first question
}

async function selectQuestions(allQuestions, limit, subject, lesson) {
    // Added lesson parameter
    let selectedQuestions = [];
    const historyKey = lesson === "সকল পাঠ" ? subject : `${subject}-${lesson}`; // Create history key

     // Ensure limit is not greater than the number of available questions
     const actualLimit = Math.min(limit, allQuestions.length);
     if (limit > allQuestions.length) {
         console.warn(`Requested limit ${limit} exceeds available questions ${allQuestions.length}. Using ${actualLimit}.`);
     }


    if (!questionHistory[subject]) {
        // Ensure subject history object exists
        questionHistory[subject] = {};
    }

    if (!questionHistory[subject][historyKey]) {
        // Initialize history for this lesson within the subject
        questionHistory[subject][historyKey] = [];
    }

    let availableQuestions = allQuestions.filter(
        (q) => q && q.question && !questionHistory[subject][historyKey].includes(q.question) // Add safety checks
    );

    if (availableQuestions.length < actualLimit) {
        // Not enough new questions, need to reuse from history
        let historyQuestions = [...questionHistory[subject][historyKey]];

        // Filter out invalid entries from history before checking length
        const validHistoryQuestions = allQuestions.filter(q => q && q.question && historyQuestions.includes(q.question));


        if (
            availableQuestions.length === 0 &&
            validHistoryQuestions.length === allQuestions.length && // Compare valid history size against all questions
            allQuestions.length > 0 // Only reset if there are actually questions
        ) {
            console.log(`All questions for "${historyKey}" seen. Resetting history.`);
            questionHistory[subject][historyKey] = [];
            historyQuestions = []; // Start fresh with selection
             // Re-filter available questions as history is now empty
             availableQuestions = allQuestions.filter(q => q && q.question); // Filter valid questions
        }


         // Add all available new questions first
         selectedQuestions.push(...availableQuestions);
         availableQuestions.forEach(q => {
             if (q && q.question && !questionHistory[subject][historyKey].includes(q.question)) {
                  questionHistory[subject][historyKey].push(q.question);
             }
         });


        // Now fill remaining spots from history (if needed)
         const neededFromHistory = actualLimit - selectedQuestions.length;
         if (neededFromHistory > 0 && historyQuestions.length > 0) {
              // Shuffle history questions to pick randomly
              historyQuestions = shuffleArray(historyQuestions);
              const questionsToReuse = historyQuestions.slice(0, neededFromHistory);

              questionsToReuse.forEach(questionText => {
                  const question = allQuestions.find((q) => q && q.question === questionText); // Add check for q
                  if (question && !selectedQuestions.some(sq => sq.question === question.question)) { // Avoid duplicates if logic allows
                       selectedQuestions.push(question);
                   }
              });
         }

    } else {
        // Enough new questions available
        availableQuestions = shuffleArray(availableQuestions); // Shuffle before picking
        while (selectedQuestions.length < actualLimit && availableQuestions.length > 0) {
             const question = availableQuestions.pop(); // Take from the end after shuffle
             if (question && question.question) { // Add safety check
                 selectedQuestions.push(question);
                 if (!questionHistory[subject][historyKey].includes(question.question)) {
                      questionHistory[subject][historyKey].push(question.question); // Add to history
                 }
             }
        }
    }

   // Fallback: If still not enough questions (e.g., empty data), fill with whatever is possible
   // This part might be less necessary with the improved logic above but kept as safety
   while (selectedQuestions.length < actualLimit && allQuestions.length > selectedQuestions.length) {
      const randomIndex = Math.floor(Math.random() * allQuestions.length);
      const question = allQuestions[randomIndex];
       // Ensure we don't add duplicates and question is valid
       if (question && question.question && !selectedQuestions.some(sq => sq.question === question.question)) {
           selectedQuestions.push(question);
       }
   }


    await saveQuestionHistory();
    return shuffleArray(selectedQuestions); // Final shuffle of the selected list
}

function convertNewlinesToHtml(text) {
    // Ensure text is a string before replacing
    if (typeof text !== 'string') {
        return ''; // Return empty string or handle as appropriate
    }
    return text.replace(/\n/g, "<br>");
}

function processTextWithImages(text) {
    // Ensure text is a string before processing
     if (typeof text !== 'string') {
         return ''; // Return empty string or handle appropriately
     }
    return text.replace(
        /(\(image\/[^\)]+\))|(<img.*?src=["'](image\/[^"']+)["'].*?>)/g,
        (match, inlineImage, imgTag, imgSrc) => {
            let filename;
            if (inlineImage) {
                filename = inlineImage.slice(1, -1); // Extract filename from (image/filename)
                 // Check if filename already includes 'image/' prefix, avoid doubling
                 if (!filename.startsWith('image/')) {
                     filename = 'image/' + filename;
                 }
            } else if (imgSrc) {
                filename = imgSrc; // Filename from <img src="image/filename" ...>
            } else {
                return match; // Should not happen with this regex, but safety first
            }

            // Basic validation: Check if filename seems reasonable (e.g., not empty)
             if (!filename || typeof filename !== 'string' || filename.trim() === 'image/') {
                 console.warn("Invalid image source detected:", match);
                 return match; // Return original match if filename is invalid
             }


            // Always return an img tag
            return `<div><img src="${filename}" style="width: 100%; height: 100%;" alt="Image" ondragstart="return false;"></div>`;
        }
    );
}


function displayQuestion() {
    // Add checks for required elements
    if (!questionElement || !answerWrapperElement || !previousButton || !nextButton || !pauseButton) {
        console.error("Required elements missing for displayQuestion");
        stopQuiz();
        return;
    }
    if (
        !shuffledQuestions ||
        currentQuestion < 0 ||
        currentQuestion >= shuffledQuestions.length ||
        !shuffledQuestions[currentQuestion] // Add check for undefined question object
    ) {
        displayError("Invalid question index or question data missing.");
        // Optionally stop the quiz or navigate to end screen
        stopQuiz(); // Example: Stop the quiz on critical error
        return;
    }


    const questionData = shuffledQuestions[currentQuestion];
    pauseButton.classList.add('hide'); // Ensure pause button is hidden on new question
    // isPaused = false; // Reset pause state on new question - Handled in next/prev now
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

    // Try rendering MathJax
    try {
        if (typeof MathJax !== 'undefined' && MathJax.Hub) {
            MathJax.Hub.Queue(["Typeset", MathJax.Hub, questionElement]);
        } else {
             console.warn("MathJax not available or not configured.");
        }
    } catch (error) {
         console.error("Error rendering MathJax for question:", error);
    }


    // Display the answers
    displayAnswers(questionData);

    // Fade-in animation for answers
    answerWrapperElement.style.opacity = "1";
    answerWrapperElement.style.animation = "fadeInUp 1s";

    // Disable the previous button if this is the first question
    previousButton.disabled = currentQuestion === 0;

    // Disable both next and previous buttons if questionLimit is 1 (or if only 1 question selected)
    if (shuffledQuestions.length <= 1) {
        nextButton.disabled = true;
        previousButton.disabled = true;
    } else {
         // Ensure next button is enabled unless it's the last question AND answered
         nextButton.disabled = questionData.answered && (currentQuestion === shuffledQuestions.length - 1);
     }


    // Update the question counter
    updateQuestionCounter();

    // Add CSS for highlighting dynamically (if not already added)
    if (!document.getElementById('highlight-styles')) {
         addHighlightCSS();
    }
}

// Function to add CSS dynamically
function addHighlightCSS() {
    // Check if style already exists
    if (document.getElementById('highlight-styles')) return;

    const style = document.createElement("style");
    style.id = 'highlight-styles'; // Add an ID to prevent duplication
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

  .explanation-container {
    margin-top: 20px; /* Space above the entire explanation block */
    animation: fadeInUp 1s;
  }

  .explanation-heading {
    font-size: 18px; /* Larger font size for the heading */
    font-weight: bold; /* Make the heading bold */
    color: #0056b3; /* Example heading color, adjust as needed */
    margin-bottom: 10px; /* Space below the heading */
    display: flex;        /* Enable flexbox for alignment */
    align-items: center; /* Vertically align items in the heading */
    text-align: left;    /* Align heading text to the left */
  }

  .explanation-heading-text {
    margin-right: 5px; /* Add some space between text and arrow */
  }

  .explanation-arrow-image {
    width: 24px;         /* Adjust size as needed */
    height: auto;
    transform: rotate(350deg); /* Rotate the arrow */
    display: inline-block; /* Treat as inline element */
    vertical-align: middle; /* Align arrow vertically with text */
    margin-left: 1px;
    margin-top: 15.5px;
  }


  .question-explanation {
    padding: 15px;
    background-color: #f9f9f9;
    border: 1px solid #ddd;
    border-radius: 8px;
    text-align: left;
    color: #333;
    font-size: 16px;
    line-height: 1.6; /* Improved line height for readability */
    box-shadow: 2px 2px 5px rgba(0,0,0,0.05); /* Subtle shadow for depth */
    word-wrap: break-word; /* Ensure long words break and wrap */
    overflow-y: auto; /* Add vertical scroll when content overflows */
    max-height: 300px; /* Set a maximum height for the explanation area */
  }


    `;
    document.head.appendChild(style);
}

function showError(_message) {
     displayError(_message); // Use the main displayError function
}

function clearPreviousContent() {
    if (answerWrapperElement) answerWrapperElement.innerHTML = "";
    if (questionElement) questionElement.innerHTML = "";
    if (answerWrapperElement) answerWrapperElement.style.opacity = "0";
    // Clear any existing auto-next timeout
    clearTimeout(autoNextTimeout);
    // Clear any typing interval if needed (though usually associated with typeText)
    clearInterval(typingInterval);
}

function updateQuestionCounter() {
    const currentEl = document.querySelector(".current");
    const totalEl = document.querySelector(".total");
    if (currentEl) currentEl.innerHTML = currentQuestion + 1;
    if (totalEl) totalEl.innerHTML = shuffledQuestions.length; // Use actual number of selected questions
}

// --- START OF UPDATED HELPER FUNCTION ---
function addExplanationBlock(questionData, targetElement) {
    // Ensure questionData, explanation, and targetElement are valid
    if (!questionData || !questionData.explanation || typeof questionData.explanation !== 'string' || questionData.explanation.trim() === "" || !targetElement) {
        // Added check for explanation being a string
        return; // Do nothing if no explanation or target is invalid
    }

    // Prevent adding multiple explanation blocks if somehow called twice
    if (targetElement.querySelector('.explanation-container')) {
        return;
    }

    // Container for the whole explanation block
    const explanationContainer = document.createElement('div');
    explanationContainer.className = 'explanation-container';

    // Heading for "Explanation"
    const explanationHeading = document.createElement('h4');
    explanationHeading.className = 'explanation-heading';

    // Text for "Explanation"
    const headingTextSpan = document.createElement('span');
    headingTextSpan.className = 'explanation-heading-text';
    headingTextSpan.textContent = 'Explanation';

    // Arrow Image
    const arrowImage = document.createElement('img');
    arrowImage.src = '12arrow.png'; // Path to your arrow image
    arrowImage.alt = 'Arrow';
    arrowImage.className = 'explanation-arrow-image';

    explanationHeading.appendChild(headingTextSpan); // Add text to heading
    explanationHeading.appendChild(arrowImage);       // Add arrow image to heading

    // Div for the explanation content itself
    const explanationDiv = document.createElement('div');
    explanationDiv.className = 'question-explanation'; // Renamed class to question-explanation

    // --- MODIFIED PART ---
    // 1. Process explanation text for images first
    let explanationContent = processTextWithImages(questionData.explanation);

    // 2. Then, process the result for MathJax ('mathy' class)
    explanationContent = explanationContent.replace(
        /<[^>]*class="mathy"[^>]*>(.*?)<\/[^>]*>/g, // Regex to find mathy elements
        function (_match, p1) { // p1 is the captured content inside the mathy element
            // Strip out any potential HTML tags *inside* the math content itself
            const cleanedContent = p1.replace(/<[^>]*>/g, ""); // Remove all HTML tags
            // Return the MathJax script tag
            return `<script type="math/asciimath">${cleanedContent}</script>`;
        }
    );

    // 3. Assign the fully processed content to innerHTML
    explanationDiv.innerHTML = explanationContent;
    // --- END OF MODIFIED PART ---

    explanationContainer.appendChild(explanationHeading); // Add heading to container
    explanationContainer.appendChild(explanationDiv);     // Add content to container
    targetElement.appendChild(explanationContainer); // Add container to the target element (e.g., answerWrapperElement)

    // Try rendering MathJax in explanation (this will now pick up the <script> tags)
    try {
        if (typeof MathJax !== 'undefined' && MathJax.Hub) {
             MathJax.Hub.Queue(["Typeset", MathJax.Hub, explanationDiv]); // Render MathJax in explanation
        }
    } catch (error) {
        console.error("Error rendering MathJax for explanation:", error);
    }
}
// --- END OF UPDATED HELPER FUNCTION ---

function displayAnswers(questionData) {
    if (!answerWrapperElement) return; // Safety check
    answerWrapperElement.innerHTML = ''; // Clear previous answers

    if (!questionData || !questionData.options || !Array.isArray(questionData.options)) {
         displayError("Invalid or missing options for the current question.");
         return;
     }

    questionData.options.forEach((option) => {
        const answerButton = document.createElement("div");
        answerButton.classList.add("answer");

        // Get the option text and its correctness (key = option text, value = is correct)
        // Add checks for valid option format
         if (typeof option !== 'object' || option === null || Object.keys(option).length === 0) {
             console.warn("Skipping invalid option format:", option);
             return; // Skip this iteration if option format is wrong
         }
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
             /<[^>]*class="mathy"[^>]*>(.*?)<\/[^>]*>/g, // Corrected regex
            function (match, p1) {
                const cleanedContent = p1.replace(/<[^>]*>/g, ""); // Remove all HTML tags from capture group
                return `<script type="math/asciimath">${cleanedContent}</script>`;
            }
        );


        // Render the content inside the button
        displayTextAndImage(answerButton, content);

        if (questionData.answered) {
            // For answered questions, just display without event listeners
            if (isCorrect) {
                answerButton.classList.add("correct");
            } else if (optionText === questionData.selectedAnswer) {
                // Check if this was the selected wrong answer
                answerButton.classList.add("wrong");
            }
            answerButton.classList.add("disabled");
        } else {
            // For unanswered questions, add click listener
            answerButton.addEventListener("click", () =>
                selectAnswer(answerButton, option)
            );
        }
        answerWrapperElement.appendChild(answerButton);

    });

    // --- ADDED PART ---
    // After displaying all answer buttons, check if the question was answered
    // and if it has an explanation. If so, display the explanation block.
    if (questionData.answered) {
        addExplanationBlock(questionData, answerWrapperElement);
        // NOTE: We do NOT show the pause button or set the auto-next timeout here.
        // That only happens when the answer is initially selected in `selectAnswer`.
    }
    // --- END OF ADDED PART ---

     // Trigger MathJax to render any math content that was inserted dynamically
     try {
         if (typeof MathJax !== 'undefined' && MathJax.Hub) {
             MathJax.Hub.Queue(["Typeset", MathJax.Hub, answerWrapperElement]);
         }
     } catch (error) {
         console.error("Error rendering MathJax for answers:", error);
     }
}


function displayTextAndImage(element, content) {
    // Ensure element is a valid DOM element
     if (!(element instanceof Element)) {
         console.error("Invalid element passed to displayTextAndImage");
         return;
     }
    element.innerHTML = ''; // Clear previous content first

    if (typeof content === "string") {
        // Use processTextWithImages which already handles creating img tags correctly
        element.innerHTML = processTextWithImages(content);

         // If the content WAS NOT processed into an image (i.e., it's text)
         // and contains newlines, convert them to <br>
         if (!element.querySelector('img')) {
             element.innerHTML = convertNewlinesToHtml(element.innerHTML);
         }

    } else if (typeof content === "object" && content !== null) {
        // Handling object structure { text: "...", image: "..." } - less common now?
        if (content.text) {
            const textDiv = document.createElement('div');
            textDiv.innerHTML = convertNewlinesToHtml(processTextWithImages(content.text));
            element.appendChild(textDiv);
        }
        if (content.image) {
             const imgContainer = document.createElement('div');
             imgContainer.innerHTML = processTextWithImages(`(image/${content.image})`); // Use standard processing
            element.appendChild(imgContainer);
        }
    } else {
        // Handle cases where content might be number or other type - display as text
         const textDiv = document.createElement('div');
         textDiv.textContent = String(content); // Convert to string
         element.appendChild(textDiv);
     }
}


// Helper function to check if an answer is correct
function isCorrectAnswer(option) {
    // Add validation
     if (typeof option !== 'object' || option === null || Object.keys(option).length === 0) {
         return false;
     }
    return Object.values(option)[0] === true; // Assuming the option value is a boolean indicating correctness
}

function selectAnswer(answerButton, selectedOption) {
    if (!answerWrapperElement || !nextButton || !pauseButton) return; // Safety check

    if (!shuffledQuestions[currentQuestion] || shuffledQuestions[currentQuestion].answered) {
        return; // Prevent selecting an answer if the question is already answered or invalid
    }

    // Clear any auto-next timeout triggered by a previous answer selection (if any)
    clearTimeout(autoNextTimeout);

    let selectedAnswerElement = answerButton; // Rename variable for clarity
    selectedAnswerElement.classList.add("selected");

    const isCorrect = isCorrectAnswer(selectedOption); // Check if the selected answer is correct

    const allAnswers = answerWrapperElement.querySelectorAll(".answer");

    // Disable further clicks on all answers
    allAnswers.forEach((answer) => {
        answer.classList.add("disabled");
        // Remove event listener safely - requires storing the handler if complex
        // For this simple case, cloning and replacing might be safer if listeners were added dynamically complexly
        // But since we add simply, just disabling visually and logically should suffice
    });

    // If the selected answer is wrong, find and highlight the correct answer immediately
    if (!isCorrect) {
        const correctAnswerElement = answerWrapperElement.querySelector(".answer.c");
        if (correctAnswerElement) {
            correctAnswerElement.classList.add("correct"); // Highlight the correct answer
        }
        selectedAnswerElement.classList.add("wrong");
    } else {
        selectedAnswerElement.classList.add("correct");
        score++; // Increment score for correct answer
    }

    // Mark the question as answered and store the selected answer text and correctness
    shuffledQuestions[currentQuestion].answered = true;
    shuffledQuestions[currentQuestion].selectedAnswer = Object.keys(selectedOption)[0]; // Store the text of the selected option
    shuffledQuestions[currentQuestion].isCorrect = isCorrect;

    // Enable the next button (unless it's the last question)
    nextButton.disabled = (currentQuestion === shuffledQuestions.length - 1);


    const questionData = shuffledQuestions[currentQuestion];
    if (questionData.explanation && questionData.explanation.trim() !== "") {
        // Add the explanation block using the helper function
        addExplanationBlock(questionData, answerWrapperElement);

        pauseButton.classList.remove('hide'); // Show pause button when explanation appears
        autoNextTimeout = setTimeout(nextQuestion, 3000); // 3 seconds delay with explanation
    } else {
        // No explanation, move faster
        autoNextTimeout = setTimeout(nextQuestion, 500); // 500ms delay without explanation
    }
}

function findNextUnansweredQuestion() {
     // Start searching from the question *after* the current one
    for (let i = currentQuestion + 1; i < shuffledQuestions.length; i++) {
        if (shuffledQuestions[i] && !shuffledQuestions[i].answered) {
            return i;
        }
    }
     // If not found after current, check from the beginning up to current
     for (let i = 0; i < currentQuestion; i++) {
         if (shuffledQuestions[i] && !shuffledQuestions[i].answered) {
             return i;
         }
     }
    return -1; // No unanswered questions found
}

function countUnansweredQuestions() {
    return shuffledQuestions.filter((q) => q && !q.answered).length;
}

function nextQuestion() {
    if (!pauseButton || !quizScreen || !endScreen) return; // Safety check
    // Clear intervals/timeouts from previous question state
    clearInterval(typingInterval);
    clearTimeout(autoNextTimeout);
    pauseButton.classList.add('hide'); // Hide pause button when manually going next/prev

    const isCurrentlyPaused = isPaused; // Store current pause state

    if (isCurrentlyPaused) {
         isPaused = false; // Set back to not paused before potentially starting timer
         console.log("Resuming from pause via Next button");
     }

    const nextUnansweredIndex = findNextUnansweredQuestion();

    if (nextUnansweredIndex !== -1) {
        currentQuestion = nextUnansweredIndex;
        selectedAnswer = null;
        displayQuestion();
        if (isCurrentlyPaused) {
             startTimer(); // Resume timer only if it was paused
         }
    } else {
        // No more unanswered questions, end the quiz
        clearInterval(timerInterval);
        quizScreen.classList.add("hide");
        endScreen.classList.remove("hide");
        endQuiz();
    }
}

function previousQuestion() {
     if (!pauseButton || !nextButton) return; // Safety check
    // Clear intervals/timeouts from previous question state
    clearInterval(typingInterval);
    clearTimeout(autoNextTimeout);
    pauseButton.classList.add('hide'); // Hide pause button when manually going next/prev

    const isCurrentlyPaused = isPaused; // Store current pause state

    if (isCurrentlyPaused) {
         isPaused = false; // Set back to not paused before potentially starting timer
         console.log("Resuming from pause via Previous button");
     }

    if (currentQuestion > 0) {
        currentQuestion--;
        selectedAnswer = null; // Reset selected answer state
        displayQuestion(); // Display the previous question
        nextButton.disabled = false; // Previous implies next is possible

        if (isCurrentlyPaused) {
             startTimer(); // Resume timer only if it was paused
         }

    }
    // Do nothing if already on the first question
}

function stopQuiz() {
    if (!quizScreen || !endScreen || !pauseButton || !nextButton) return; // Safety check
    clearInterval(timerInterval); // Stop the timer
    clearTimeout(autoNextTimeout); // Stop any auto-next
    quizScreen.classList.add("hide");
    endScreen.classList.remove("hide");
    pauseButton.classList.add('hide'); // Hide pause button when quiz is stopped
    hideQuiz(); // Hide quiz elements if necessary
    calculateAndDisplayResults();
    nextButton.disabled = false; // Reset next button state
}

function displayFinalResults() {
    if (!quizScreen || !endScreen || !pauseButton) return; // Safety check
    clearInterval(timerInterval); // Ensure timer is stopped
    clearTimeout(autoNextTimeout); // Ensure auto-next is stopped
    quizScreen.classList.add("hide");
    endScreen.classList.remove("hide");
    pauseButton.classList.add('hide'); // Hide pause button on end quiz
    calculateAndDisplayResults();
}

function calculateAndDisplayResults() {
    if (!scoreElement || !totalScoreElement) return; // Safety check
    clearInterval(timerInterval); // Ensure timer is stopped again

    let correctCount = 0,
        wrongCount = 0,
        totalScore = 0;

    // Iterate through all SHUFFLED questions used in this quiz instance
    shuffledQuestions.forEach((q) => {
        if (q && q.answered) { // Check if question exists and was answered
            if (q.isCorrect) {
                correctCount++;
                totalScore++; // Add 1 point for each correct answer (or adjust scoring logic here)
            } else {
                wrongCount++;
            }
        }
    });

    const totalAttempted = correctCount + wrongCount;
    const notAnsweredCount = shuffledQuestions.length - totalAttempted;
    const totalQuestionsInQuiz = shuffledQuestions.length; // Base score on actual questions shown

    // Clear existing content safely
    scoreElement.textContent = "";
    totalScoreElement.textContent = "";
    // Select elements inside the function as they are on the end screen
    const correctCountEl = document.querySelector(".correct-count");
    const wrongCountEl = document.querySelector(".wrong-count");
    const notAnsweredCountEl = document.querySelector(".not-answered-count");

    if (correctCountEl) correctCountEl.textContent = "";
    if (wrongCountEl) wrongCountEl.textContent = "";
    if (notAnsweredCountEl) notAnsweredCountEl.textContent = "";


    // Create an array of results to type out
    const results = [
        { element: scoreElement, value: totalScore.toString() }, // Display total score achieved
        { element: totalScoreElement, value: totalQuestionsInQuiz.toString() }, // Display total possible score (number of questions)
        {
            element: correctCountEl,
            value: correctCount.toString(),
        },
        {
            element: wrongCountEl,
            value: wrongCount.toString(),
        },
        {
            element: notAnsweredCountEl,
            value: notAnsweredCount.toString(),
        },
    ];

    // Type out each result sequentially
    function typeOutResults(index) {
         // Check if elements exist before trying to type
        if (results && Array.isArray(results) && index < results.length && results[index].element) {
            typeText(results[index].element, results[index].value, 150).then(() => { // Faster typing for results
                typeOutResults(index + 1);
            });
        } else if (index >= results.length) {
             // All results typed
         } else {
             // Element missing, skip to next
             console.warn("Result element missing for index:", index);
             typeOutResults(index + 1);
         }
    }

    // Start typing results
    typeOutResults(0);
}

function endQuiz() {
    displayFinalResults();
}

function startTimer() {
    console.log("startTimer called (resuming or starting)");
    clearInterval(timerInterval); // Clear any existing interval first
     if (!timeLimitInput || !progressText) return; // Safety check

    // DO NOT RESET timeRemaining here. It's set in startQuiz() initially.
    const progressBar = document.querySelector(".progress-bar");

     // Ensure progressBar exists
     if (!progressBar) {
         console.error("Progress bar element not found!");
         return;
     }

    // Calculate initial percentage based on current timeRemaining
    const totalDuration = parseInt(timeLimitInput.value) * 60;
     // Avoid division by zero or negative duration
     const initialPercentage = totalDuration > 0 ? (timeRemaining / totalDuration) * 100 : 0;
     progressBar.style.width = `${initialPercentage}%`;
     progressText.style.color = initialPercentage >= 49.5 ? "#fff" : "#000";


    timerInterval = setInterval(() => {
        if (!isPaused) { // Only decrement time if not paused
            if (timeRemaining > 0) {
                 timeRemaining--;
             }


            const hours = Math.floor(timeRemaining / 3600);
            const minutes = Math.floor((timeRemaining % 3600) / 60);
            const seconds = timeRemaining % 60;

            // Format time string
             let timeString = "";
             if (hours > 0) {
                 timeString = `${hours}h ${minutes}m ${seconds}s`;
             } else if (minutes > 0) {
                 timeString = `${minutes}m ${seconds}s`;
             } else {
                 timeString = `${seconds}s`;
             }
             // Check progressText again inside interval
             if(progressText) progressText.innerHTML = timeString;


            const currentTotalDuration = parseInt(timeLimitInput.value) * 60;
             // Avoid division by zero
             const percentageRemaining = currentTotalDuration > 0 ? (timeRemaining / currentTotalDuration) * 100 : 0;

            if(progressBar) progressBar.style.width = `${percentageRemaining}%`;
            if(progressText) progressText.style.color = percentageRemaining >= 49.5 ? "#fff" : "#000";


            if (timeRemaining <= 0) {
                console.log("Time ran out!");
                clearInterval(timerInterval);
                if(quizScreen) quizScreen.classList.add("hide");
                if(endScreen) endScreen.classList.remove("hide");
                if(pauseButton) pauseButton.classList.add('hide'); // Hide pause button when time runs out
                hideQuiz();
                endQuiz(); // Go directly to end results when time runs out
            }
        }
    }, 1000);
}

function restartQuiz() {
     if (!endScreen || !quizScreen || !startScreen || !pauseButton || !errorMessage) return; // Safety check
    clearInterval(timerInterval); // Stop any running timer
    clearTimeout(autoNextTimeout); // Stop any auto-next
    endScreen.classList.add("hide");
    quizScreen.classList.add("hide"); // Ensure quiz screen is hidden too
    startScreen.classList.remove("hide");
    pauseButton.classList.add('hide'); // Hide pause button on restart
    hideQuiz(); // Reset UI elements if needed
    // Reset necessary variables for a fresh start
    currentQuestion = 0;
    score = 0;
    selectedAnswer = null;
    shuffledQuestions = [];
    isPaused = false;
    timeRemaining = 0; // Will be set again in startQuiz

     // Reset input fields to defaults (optional, based on desired behavior)
     // if(questionLimitInput) questionLimitInput.value = 30;
     // if(timeLimitInput) timeLimitInput.value = 30;
     // if(quizLessonDropdown) quizLessonDropdown.value = "সকল পাঠ";
     // updateMinLimitsForLesson(); // Update limits based on default lesson

     // Clear potential error messages
     errorMessage.textContent = "";
     errorMessage.classList.add("hide");

     // Re-enable start button if it was disabled by errors
     // validateInputs(); // Re-validate to potentially enable start button


    // We don't reset questionHistory here by default, so it persists between quiz attempts
}

function handlePauseButtonClick() {
    if (!pauseButton) return; // Safety check
    // Only pause if the button is visible (meaning explanation is shown) and not already paused
    if (!pauseButton.classList.contains('hide') && !isPaused) {
        isPaused = true; // Set pause flag FIRST
        clearInterval(timerInterval); // Stop timer
        clearTimeout(autoNextTimeout); // Stop auto-next
        pauseButton.classList.add('hide'); // Hide pause button
        console.log("Quiz paused via button, isPaused:", isPaused);
    } else {
         console.log("Pause button clicked but already paused or hidden.");
     }
}

window.addEventListener("message", async function (event) {
    // Marked function as async
    if (event.data === "closeQuiz") {
        closeQuiz();
    } else if (event.data.subjectName) {
        subjectName = event.data.subjectName;
        console.log("Received subject name:", subjectName);

        // Get elements needed for setting text (ensure they are assigned in DOMContentLoaded)
        const quizHeadingElement = quizHeading; // Use variable assigned in DOMContentLoaded
        const endScreenHeadingElement = document.getElementById("end-screen-heading"); // Can get this here if needed
        const timeLimitLabelElement = document.getElementById("time-limit-label");
        const questionLimitLabelElement = document.getElementById("question-limit-label");
        const startButtonElement = document.getElementById("start-button"); // Assuming start button has id="start-button"
        const quizLessonLabelElement = document.getElementById("quiz-lesson-label");


        // Use the subjectName to set the headings (typing effect)
        if (quizHeadingElement) { // Check if element exists
             typeText(quizHeadingElement, subjectName, 30);
         } else { console.warn("Quiz heading element not ready for typing.")}
        if (endScreenHeadingElement) { // Check if element exists
             typeText(endScreenHeadingElement, subjectName, 30);
         }


        // Reset input fields to default values (add null checks)
        if (timeLimitInput) timeLimitInput.value = 30;
        if (questionLimitInput) questionLimitInput.value = 30;
        if (quizLessonDropdown) quizLessonDropdown.value = "সকল পাঠ"; // Reset lesson dropdown to default


        // Reset error message safely
        if(errorMessage) {
            errorMessage.textContent = "";
            errorMessage.classList.add("hide");
        }


        // --- RESTORED TYPETEXT CALLS ---
        // Apply typing effect to labels and button
        if (timeLimitLabelElement) {
             typeText(timeLimitLabelElement, "মিনিট নির্ধারণ করুন :", 30);
         }
        if (questionLimitLabelElement) {
             typeText(questionLimitLabelElement, "প্রশ্নের সংখ্যা নির্ধারণ করুন :", 30);
         }
        if (startButtonElement) { // Check if element exists
             typeText(startButtonElement, "কুইজ শুরু করুন", 30);
         }
        if (quizLessonLabelElement) {
             typeText(quizLessonLabelElement, "পাঠ নির্বাচন করুন :", 30); // Type lesson label
         }
        // --- END OF RESTORED CALLS ---

        if (lessonDropdownMenu) lessonDropdownMenu.classList.add("hide"); // Initially hide, visibility will be handled later


        // Load history and then data
        try {
             await loadQuestionHistory();
             const fetchedData = await loadQuestionData(); // Assuming loadQuestionData is async or returns promise

             if (fetchedData) {
                 data = fetchedData;
                 // Now safe to populate dropdown and show screen
                 populateLessonDropdown(subjectName); // Populate lesson dropdown first
                 showStartScreen(subjectName); // Then show the start screen which uses the data/lessons
             } else {
                 // Handle the case where data is null
                 console.error("Data is null after load attempt.");
                 displayError("Error loading questions. Please refresh the page.");
             }
         } catch (error) {
             console.error("Error loading history or data:", error);
             displayError("Failed to load quiz setup data. Please refresh.");
         }


    } else if (event.data === "reloadQuiz") {
        // Handle quiz reload if needed
        console.log("Received reloadQuiz message");
        await loadQuestionHistory(); // Reload question history on quiz reload
        // Potentially reload data as well if needed
        // await loadQuestionData();
        // Reset UI?
        // restartQuiz(); // Example: Go back to start screen on reload
    }
});

function closeQuiz() {
    window.parent.postMessage("closeQuiz", "*");
    // Optionally clear intervals/state before closing
    clearInterval(timerInterval);
    clearTimeout(autoNextTimeout);
    // window.location.reload(); // Reloading might not be desired if parent handles closing
}

function typeText(element, text, speed, callback) {
    return new Promise((resolve) => {
         // Ensure element exists and text is a string
         if (!element || typeof text !== 'string') {
             console.warn("typeText: Invalid element or text provided.");
             if (callback) callback();
             resolve();
             return;
         }

        let i = 0;
        element.innerHTML = ""; // Clear existing content

        // Clear previous interval on this specific element if it exists
        if (element.typingInterval) {
            clearInterval(element.typingInterval);
            element.typingInterval = null;
        }


        const interval = setInterval(function () {
            if (i >= text.length) {
                clearInterval(interval);
                element.typingInterval = null; // Clear the stored interval ID
                if (callback) callback();
                resolve(); // Resolve the promise here
                return;
            }

            const char = text.charAt(i);

             // Simplified logic - assumes pre-processed text for complex HTML
             if (char === '\n') {
                 element.appendChild(document.createElement('br'));
             } else {
                  // Append character by character for typing effect
                  element.innerHTML += char;
             }
             i++;

        }, speed);

        element.typingInterval = interval; // Store interval ID on the element
    });
}

function shuffleArray(array) {
     // Make a copy to avoid modifying the original array if it's passed by reference elsewhere
     const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; // Swap elements
    }
    return shuffled;
}

function showQuiz() {
     if (!quizScreen || !quizHeading) return; // Safety check
    const quizContainer = quizScreen; // Use assigned variable
    if (quizContainer) {
         quizContainer.classList.add("show");
         quizContainer.classList.remove("hide"); // Explicitly remove hide
     }
    document.body.style.backgroundColor = "#fff"; // Set background for quiz

    // Clear the quiz heading before applying the typing effect
    quizHeading.textContent = "";
    typeText(quizHeading, subjectName || "Quiz", 30); // Use subjectName or default
}

function hideQuiz() {
     if (!quizScreen) return; // Safety check
    const quizContainer = quizScreen; // Use assigned variable
     if (quizContainer) {
         quizContainer.classList.remove("show");
         quizContainer.classList.add("hide"); // Explicitly add hide
     }
    document.body.style.backgroundColor = ""; // Reset background
}

function populateLessonDropdown(subjectName) {
     if (!quizLessonDropdown || !lessonDropdownMenu || !data || !data.sections) {
         console.warn("Cannot populate lesson dropdown: Elements or data not ready.");
         if(lessonDropdownMenu) lessonDropdownMenu.classList.add("hide"); // Hide if possible
         return;
     }
    // Use assigned variable
    const lessonDropdown = quizLessonDropdown;
    lessonDropdown.innerHTML = '<option value="সকল পাঠ">সকল পাঠ</option>'; // Reset dropdown with default option

    const section = data.sections.find((s) => s.section === subjectName);
    if (section && section.questions && Array.isArray(section.questions)) {
        const lessons = new Set(); // Use Set for unique lessons
        section.questions.forEach((question) => {
            if (question && question.lesson) { // Check question and lesson exist
                lessons.add(question.lesson);
            }
        });

        if (lessons.size > 0) {
            // Sort lessons alphabetically or numerically if needed
            const sortedLessons = Array.from(lessons).sort();

             sortedLessons.forEach((lesson) => {
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
        console.log("Section or questions not found for subject:", subjectName, ", hiding dropdown.");
    }
}

function updateMinLimitsForLesson() {
     // Add safety checks for elements
     if (!questionLimitInput || !timeLimitInput || !quizLessonDropdown) {
          console.warn("Cannot update limits: Input elements not ready.");
          return;
      }

     // Ensure questions array is populated before proceeding
     if (!questions || questions.length === 0) {
         console.warn("Cannot update limits: questions array is empty or not yet loaded for the subject.");
         // Set defaults or disable inputs if needed
         questionLimitInput.min = 1;
         timeLimitInput.min = 1;
         questionLimitInput.max = 1; // Set max to 1 if no questions
         timeLimitInput.max = 1;
         questionLimitInput.value = 1;
         timeLimitInput.value = 1;
         validateInputs();
         return;
     }

    const selectedLessonForLimit = quizLessonDropdown.value;
    let filteredQuestionsForLimit = questions; // Start with all questions for the subject
    let maxQuestionsForLesson;

    if (selectedLessonForLimit !== "সকল পাঠ") {
        filteredQuestionsForLimit = questions.filter(
            (q) => q && q.lesson === selectedLessonForLimit // Add check for q existence
        );
    }
     // If filtering results in an empty array (e.g., bad data), fall back?
     if (!Array.isArray(filteredQuestionsForLimit)) {
          console.error("Filtered questions is not an array for lesson:", selectedLessonForLimit);
          filteredQuestionsForLimit = []; // Default to empty array
      }

     maxQuestionsForLesson = filteredQuestionsForLimit.length;


    let newMinLimit;
     // Determine minimum based on available questions
     if (maxQuestionsForLesson <= 0) {
         newMinLimit = 1; // Absolute minimum
         maxQuestionsForLesson = 1; // Can't have 0 max
     } else if (maxQuestionsForLesson < 10) {
         newMinLimit = 1;
     } else if (maxQuestionsForLesson < 30) {
         newMinLimit = 10;
     } else {
         newMinLimit = 30; // Default min if 30+ questions
     }


    // Ensure min is not greater than max
    newMinLimit = Math.min(newMinLimit, maxQuestionsForLesson);

    questionLimitInput.min = newMinLimit;
    timeLimitInput.min = newMinLimit; // Keep time min same as question min for simplicity
    questionLimitInput.max = maxQuestionsForLesson; // Update max limit
    timeLimitInput.max = maxQuestionsForLesson; // Update max limit

    // Set default value to the calculated minimum, but don't exceed max
     const currentQVal = parseInt(questionLimitInput.value) || newMinLimit;
     const currentTVal = parseInt(timeLimitInput.value) || newMinLimit;
     questionLimitInput.value = Math.min(Math.max(currentQVal, newMinLimit), maxQuestionsForLesson);
     timeLimitInput.value = Math.min(Math.max(currentTVal, newMinLimit), maxQuestionsForLesson);


    validateInputs(); // Re-validate inputs to update error message if needed
}

function showStartScreen(subjectName) {
    // Add safety checks for elements
    if (!startScreen || !startScreenHeading || !data || !data.sections || !questionLimitInput || !timeLimitInput || !quizLessonDropdown || !startButton || !quizScreen || !endScreen || !lessonDropdownMenu) {
         console.error("Cannot show start screen: Required elements or data not ready.");
         displayError("Initialization error. Please refresh.");
         return;
     }

    // Apply typing effect to the heading:
    typeText(startScreenHeading, subjectName || "Quiz Setup", 30); // Use subject or default

    // Find the section data for the current subject
    const section = data.sections.find((s) => s.section === subjectName);

    if (section && section.questions) {
        questions = section.questions; // Set the global 'questions' for the current subject

         // updateMinLimitsForLesson depends on the dropdown's CURRENT value
         // and the global 'questions' array being set.
         updateMinLimitsForLesson(); // Call to set initial min/max limits based on dropdown value

    } else {
        console.error("Subject data or questions not found for:", subjectName);
         // Handle missing subject data - maybe disable inputs, show error
         questions = []; // Reset questions if subject not found
         questionLimitInput.min = 1;
         timeLimitInput.min = 1;
         questionLimitInput.max = 1;
         timeLimitInput.max = 1;
         questionLimitInput.value = 1;
         timeLimitInput.value = 1;
         questionLimitInput.disabled = true;
         timeLimitInput.disabled = true;
         quizLessonDropdown.disabled = true;
         startButton.disabled = true;
        displayError(`Data for subject "${subjectName}" not found.`);
        lessonDropdownMenu.classList.add("hide"); // Ensure dropdown is hidden
    }

    // Make start screen visible
    startScreen.classList.remove("hide");

    // Ensure other screens are hidden
     quizScreen.classList.add("hide");
     endScreen.classList.add("hide");


     // Enable inputs that might have been disabled
     questionLimitInput.disabled = false;
     timeLimitInput.disabled = false;
     quizLessonDropdown.disabled = false;
     // Start button enabling/disabling is handled by validateInputs


     validateInputs(); // Final validation check based on loaded limits
}

// Debounce or Throttle resize events if performance is an issue
// window.addEventListener('resize', () => { /* Potentially re-adjust UI */ });


// Initial setup happens in DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
     console.log("DOM fully loaded and parsed.");

     // --- Assign all DOM elements here ---
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
     uContainer = document.getElementById("u-container");
     numberProgressContainer = document.querySelector(".number-progress");
     questionContainer = document.querySelector(".question");
     questionLimitInput = document.getElementById("question-limit");
     timeLimitInput = document.getElementById("time-limit");
     quizLessonDropdown = document.getElementById("quiz-lesson");
     lessonDropdownMenu = document.getElementById("lesson-dropdown-menu");

     // --- Initial Hiding and State ---
     if (quizScreen) quizScreen.classList.add('hide');
     if (endScreen) endScreen.classList.add('hide');
     if (startScreen) startScreen.classList.add('hide'); // Hide start screen until subject received
     if (pauseButton) pauseButton.classList.add('hide'); // Ensure pause button is hidden initially
     if (lessonDropdownMenu) lessonDropdownMenu.classList.add('hide'); // Hide lesson dropdown initially
     if (nextButton) nextButton.disabled = false; // Set initial state if needed

     // --- Add Event Listeners ---
     if (startButton) {
         startButton.addEventListener("click", startQuiz);
         startButton.disabled = true; // Disable initially until data loads/validation passes
     } else {
         console.error("Start button with class '.start' not found in DOM!");
     }

     if (nextButton) {
         nextButton.addEventListener("click", nextQuestion);
     } else { console.error("Next button not found!")};

     if (previousButton) {
         previousButton.addEventListener("click", previousQuestion);
     } else { console.error("Previous button not found!")};

     if (stopButton) {
         stopButton.addEventListener("click", stopQuiz);
     } else { console.error("Stop button not found!")};

     if (pauseButton) {
         pauseButton.addEventListener("click", handlePauseButtonClick);
     } else { console.error("Pause button not found!")};

     const restartButton = document.querySelector(".restart");
     if (restartButton) {
         restartButton.addEventListener("click", restartQuiz);
     } else { console.error("Restart button not found!")};

     if (quizLessonDropdown) {
         quizLessonDropdown.addEventListener("change", function () {
             selectedLesson = this.value; // Update selectedLesson on dropdown change
             updateMinLimitsForLesson(); // Call function to update min limits
         });
     } else {
         console.error("Lesson dropdown with id 'quiz-lesson' not found in DOM!");
     }

     if (questionLimitInput) {
         questionLimitInput.addEventListener("input", validateInputs);
         restrictToNumbers(questionLimitInput);
     } else {
         console.error("Question limit input with id 'question-limit' not found in DOM!");
     }

     if (timeLimitInput) {
         timeLimitInput.addEventListener("input", validateInputs);
         restrictToNumbers(timeLimitInput);
     } else {
         console.error("Time limit input with id 'time-limit' not found in DOM!");
     }

      // --- Check if data has loaded and potentially enable start button ---
      if (data) {
          console.log("Data was already loaded before DOMContentLoaded.")
          // We still need subjectName before enabling fully, validation handles the rest
          // if (startButton) startButton.disabled = false; // Enable if data is ready
      } else {
          console.log("Waiting for data to load...");
      }

     // Request subject name from parent immediately if possible
      console.log("Requesting subject name from parent...")
     // window.parent.postMessage("requestSubjectName", "*"); // Example message
 });

// Function to clear question history (optional, for testing or user preference)
async function clearQuestionHistory() {
    try {
        await saveQuestionHistoryToDB({}); // Save an empty history object to clear it
        questionHistory = {}; // Reset in-memory history
         if (data && data.sections) {
             data.sections.forEach((section) => {
                 // Re-initialize history structure if needed
                 questionHistory[section.section] = {};
             });
         }
         console.log("Question history cleared.");
    } catch (error) {
        console.error("Error clearing question history:", error);
         displayError("Could not clear question history.");
    }
}

// Example console command: clearQuestionHistory();