// abtyping.js with IndexedDB caching

// IndexedDB Utility Functions
const IndexedDBHelper = {
  dbName: 'QuizAppDB',
  storeName: 'questionData',
  version: 1,

  async openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async saveData(data) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(data, 'questionData');

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  },

  async getData() {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get('questionData');

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
};

// Global variable to store question data
let questionData = null;

// Initialize typing for header elements
const typingTexts = document.querySelectorAll(".typing-text");
typingTexts.forEach((text) => {
  text.textContent = text.dataset.text; // Directly set the text content

  // After the header text is set, show the buttons
  const abButtons = text.parentElement.querySelectorAll(
    ".a-button, .b-button, .partial-button"
  );
  abButtons.forEach((button) => {
    button.style.display = "inline-block";
    button.textContent = button.dataset.text; // Directly set the button text
  });

  // Adjust container top margin based on header height
  const container = document.querySelector(".container");
  container.style.marginTop = `${getHeaderHeight()}px`;
});

// Function to get the header's height
function getHeaderHeight() {
  const header = document.querySelector(".header");
  return header.offsetHeight;
}

function getSubjectMargin() {
  return 7.5; // Example margin value
}

function createQuestionAndExplanation(
  subjectName,
  section,
  question,
  explanation,
  index
) {
  const contentContainer = document.getElementById(
    `content-container-${subjectName}`
  );

  // Create the question box
  const questionDiv = document.createElement("div");
  questionDiv.classList.add(`${section}-box`);
  questionDiv.id = `${section}-question-${subjectName}-${index}`;
  questionDiv.style.marginTop = `${getSubjectMargin()}px`;
  questionDiv.style.marginBottom = `${getSubjectMargin()}px`;

  // Handle question text or image
  if (question.startsWith("(image/")) {
    const imagePath = question.match(/\(image\/(.+?)\)/)[1]; // Extract image path
    const questionImage = document.createElement("img");
    questionImage.src = `image/${imagePath}`; // Add extracted path to src
    questionImage.alt = "Question Image";
    questionImage.style.width = "100%";
    questionImage.style.marginTop = "10px";
    questionImage.draggable = false;

    questionImage.style.border = "1px solid #ccc"; // Optional styling
    questionDiv.appendChild(questionImage);
  } else {
    // Add prefix "ক" for section 'a' or "খ" for section 'b'
    questionDiv.textContent = `${section === "a" ? "ক" : "খ"}. ${question}`;
  }

  contentContainer.appendChild(questionDiv);

  // Create the explanation box
  const explanationDiv = document.createElement("div");
  explanationDiv.classList.add(`${section}-explanation`);
  explanationDiv.id = `${section}-explanation-${subjectName}-${index}`;
  explanationDiv.style.marginTop = `${getSubjectMargin()}px`;
  explanationDiv.style.marginBottom = `${getSubjectMargin()}px`;

  const explanationBox = document.createElement("div");
  explanationBox.classList.add(`${section}-explanation-box`);
  explanationBox.id = `${section}-explanation-box-${subjectName}-${index}`;

  // Handle explanation text or image
  if (explanation.startsWith("(image/")) {
    const imagePath = explanation.match(/\(image\/(.+?)\)/)[1]; // Extract image path
    const explanationImage = document.createElement("img");
    explanationImage.src = `image/${imagePath}`; // Add extracted path to src
    explanationImage.alt = "Explanation Image";
    explanationImage.style.width = "100%";
    explanationImage.style.marginTop = "10px";
    explanationImage.draggable = false;

    explanationImage.style.border = "1px solid #ccc"; // Optional styling
    explanationBox.appendChild(explanationImage);
  } else {
    const explanationText = document.createElement("div");
    explanationText.textContent = `উত্তর: ${explanation}`;
    explanationText.style.marginBottom = "10px"; // Optional spacing
    explanationBox.appendChild(explanationText);
  }

  explanationDiv.appendChild(explanationBox);
  contentContainer.appendChild(explanationDiv);

  // Add event listener to the question box to toggle explanation visibility
  questionDiv.addEventListener("click", function () {
    const isHidden = explanationBox.style.display === "none";
    explanationBox.style.display = isHidden ? "block" : "none";
  });
}


function toggleSection(button, section, subjectName) {
  const isButtonActive = button.classList.contains("active");
  const buttons = button.parentElement.querySelectorAll(".a-button, .b-button");
  buttons.forEach((b) => b.classList.remove("active"));

  if (!isButtonActive) {
    button.classList.add("active");
  }

  if (questionData) {
    const questionExplanationArrayA = questionData[subjectName]["a"];
    const questionExplanationArrayB = questionData[subjectName]["b"];

    const handleVisibility = (array, sectionPrefix) => {
      array.forEach((item, index) => {
        const questionId = `${sectionPrefix}-question-${subjectName}-${index}`;
        const explanationBoxId = `${sectionPrefix}-explanation-box-${subjectName}-${index}`;

        if (!document.getElementById(questionId)) {
          createQuestionAndExplanation(
            subjectName,
            sectionPrefix,
            item.question,
            item.explanation,
            index
          );
        } else {
          const questionElement = document.getElementById(questionId);
          questionElement.textContent = `${sectionPrefix === "a" ? "ক" : "খ"}. ${
            item.question
          }`;
        }

        const questionElement = document.getElementById(questionId);
        const explanationBox = document.getElementById(explanationBoxId);

        if (questionElement && explanationBox) {
          questionElement.style.display = button.classList.contains("active")
            ? "block"
            : "none";
          explanationBox.style.display = "none";
        }
      });
    };

    handleVisibility(questionExplanationArrayA, "a");
    handleVisibility(questionExplanationArrayB, "b");

    const otherSection = section === "a" ? "b" : "a";
    [questionExplanationArrayA, questionExplanationArrayB].forEach((array) => {
      array.forEach((_item, index) => {
        const questionElement = document.getElementById(
          `${otherSection}-question-${subjectName}-${index}`
        );
        const explanationBoxElement = document.getElementById(
          `${otherSection}-explanation-box-${subjectName}-${index}`
        );

        if (questionElement) {
          questionElement.style.display = "none";
        }

        if (explanationBoxElement) {
          explanationBoxElement.style.display = "none";
        }
      });
    });
  }
}

function toggleCollapse(button) {
  const collapsibleContent = button.parentElement.nextElementSibling;

  if (collapsibleContent) {
    const isActive = collapsibleContent.classList.toggle("active");
    button.classList.toggle("active", isActive);

    if (isActive) {
      // Populate content from data-text attributes when expanding
      collapsibleContent.querySelectorAll(".collapsible-box").forEach((box) => {
        if (box.dataset.text) {
          box.textContent = box.dataset.text;
        }

        // Set margin-top and margin-bottom dynamically based on subject name
        const subjectName = box.parentElement.parentElement.dataset.subjectName;
        const marginValue = getSubjectMargin(subjectName);

        box.style.marginTop = `${marginValue}px`;
        box.style.marginBottom = `${marginValue * 0.6667}px`;
      });
    } else {
      // Clear content when collapsing
      collapsibleContent.querySelectorAll(".collapsible-box").forEach((box) => {
        // Optional: Clear content if needed
      });
    }
  }
}

window.addEventListener("message", function (event) {
  if (event.data === "closeQuiz") {
    const quizContainer = document.getElementById("quiz-container");
    quizContainer.style.display = "none";
  }
});

function getSubjectNames() {
  const subjectNames = [];
  document.querySelectorAll(".subject").forEach((subject) => {
    subjectNames.push(subject.dataset.subjectName);
  });
  return subjectNames;
}
function openQuiz(subjectName) {
  const quizIframe = document.getElementById("quiz-iframe");
  const quizContainer = document.getElementById("quiz-container");

  if (!quizIframe || !quizContainer) {
    console.error("Quiz iframe or container not found.");
    return;
  }

  // Set the iframe source immediately
  quizIframe.src = "quiz.html";

  // Post the message as soon as the iframe content window is available
  try {
    // Directly post the message after setting the iframe's src
    quizIframe.onload = () => {
      quizIframe.contentWindow.postMessage({ subjectName: subjectName }, "*");
    };
  } catch (error) {
    console.error("Failed to post message to the iframe:", error);
  }

  // Make the quiz container visible immediately
  quizContainer.style.display = "block";
}


async function loadQuestionData() {
  try {
    // First, load data from IndexedDB
    const cachedData = await IndexedDBHelper.getData();

    // Check if abData exists and update IndexedDB accordingly
    if (typeof abData !== "undefined" && abData) {
      questionData = abData; // Load abData as the source of truth

      // If no cached data exists or if cached data differs from abData
      if (!cachedData || JSON.stringify(cachedData) !== JSON.stringify(abData)) {
        console.log("Updating IndexedDB with new abData...");
        await IndexedDBHelper.saveData(abData);
      } else {
        console.log("Cached data matches abData. No update needed.");
      }
      return;
    }

    // If abData is not available, fall back to cached data
    if (cachedData) {
      console.log("Using cached data from IndexedDB.");
      questionData = cachedData;
      return;
    }

    // If neither abData nor cached data is available
    console.error("No abData available and no cached data found.");
    const errorMessage = document.getElementById("error-message");
    if (errorMessage) {
      errorMessage.textContent =
        "Error loading questions. Please refresh the page.";
      errorMessage.classList.remove("hide");
    }
  } catch (error) {
    console.error("Error loading question data:", error);
    const errorMessage = document.getElementById("error-message");
    if (errorMessage) {
      errorMessage.textContent =
        "Error loading questions. Please refresh the page.";
      errorMessage.classList.remove("hide");
    }
  }
}



// Load initial data when the page loads
document.addEventListener('DOMContentLoaded', loadQuestionData);