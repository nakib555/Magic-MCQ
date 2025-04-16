// abtyping.js with IndexedDB caching and Edit Iframe Integration

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
          request.onerror = (event) => {
              console.error("IndexedDB error:", event.target.error);
              reject(event.target.error);
          }
      });
  },

  async saveData(data) {
      try {
          const db = await this.openDB();
          return new Promise((resolve, reject) => {
              const transaction = db.transaction([this.storeName], 'readwrite');
              const store = transaction.objectStore(this.storeName);
              const request = store.put(data, 'questionData'); // Use a fixed key

              request.onsuccess = () => resolve(true);
              request.onerror = (event) => {
                   console.error("IndexedDB save error:", event.target.error);
                   reject(event.target.error);
              }
              transaction.oncomplete = () => {
                  db.close(); // Close DB after transaction completes
              };
              transaction.onerror = (event) => {
                  console.error("IndexedDB save transaction error:", event.target.error);
                  reject(event.target.error);
              };
          });
      } catch (error) {
          console.error("Error opening DB for save:", error);
          return Promise.reject(error);
      }
  },

  async getData() {
      try {
          const db = await this.openDB();
          return new Promise((resolve, reject) => {
              const transaction = db.transaction([this.storeName], 'readonly');
              const store = transaction.objectStore(this.storeName);
              const request = store.get('questionData'); // Use the fixed key

              request.onsuccess = () => resolve(request.result);
              request.onerror = (event) => {
                  console.error("IndexedDB get error:", event.target.error);
                  reject(event.target.error);
              }
              transaction.oncomplete = () => {
                  db.close(); // Close DB after transaction completes
              };
               transaction.onerror = (event) => {
                  console.error("IndexedDB get transaction error:", event.target.error);
                  reject(event.target.error);
              };
          });
       } catch (error) {
          console.error("Error opening DB for get:", error);
          return Promise.reject(error);
      }
  }
};

// Global variable to store question data
let questionData = null;

// Function to get the header's height
function getHeaderHeight() {
  const header = document.querySelector(".header");
  return header ? header.offsetHeight : 100; // Provide a fallback height
}

// Function to set initial text content and button visibility
function initializeStaticContent() {
  const staticTexts = document.querySelectorAll(".typing-text");
  staticTexts.forEach((text) => {
      if (text.dataset.text) {
          text.textContent = text.dataset.text;
      }
  });

  const subjectDivs = document.querySelectorAll(".subject");
  subjectDivs.forEach(subjectDiv => {
      const buttons = subjectDiv.querySelectorAll(".a-button, .b-button, .partial-button");
      buttons.forEach((button) => {
          if (button.dataset.text) {
              button.style.display = "inline-block"; // Make buttons visible
              button.textContent = button.dataset.text;
          }
      });
  });

   // Handle collapsible box text if needed (though it's populated on expand)
   document.querySelectorAll(".collapsible-box").forEach(box => {
       if (box.dataset.text && !box.closest('.collapsible-content')?.classList.contains('active')) {
           // Optionally set placeholder text or leave empty until expanded
           // box.textContent = "Click '(Partial)' to view details";
       }
   });
}

// Adjust container margin based on header height
function adjustContainerMargin() {
  const container = document.querySelector(".container");
  if (container) {
      container.style.marginTop = `${getHeaderHeight()}px`;
  }
}

// --- Run Initialization on DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM fully loaded and parsed");

  initializeStaticContent(); // Set text/button visibility immediately
  adjustContainerMargin(); // Adjust margin based on initial header height

  // Add listener for Edit Trigger Button
  const editTrigger = document.getElementById('edit-trigger-button');
  if (editTrigger) {
      console.log("Found edit trigger button, attaching listener.");
      editTrigger.addEventListener('click', openEdit);
  } else {
      console.error("Edit trigger button not found.");
  }

  // Load question data asynchronously
  loadQuestionData();
});

// Adjust margin on resize as well
window.addEventListener('resize', adjustContainerMargin);


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
  if (!contentContainer) {
      console.error(`Content container not found for ${subjectName}`);
      return;
  }

  // Function to create an image element
  const createImageElement = (srcPath, altText) => {
      const img = document.createElement("img");
      // Basic check for common image extensions - improve if needed
      if (/\.(jpg|jpeg|png|gif|bmp|svg|webp)$/i.test(srcPath)) {
           img.src = `image/${srcPath}`; // Assuming images are in an 'image' folder relative to HTML
      } else {
          console.warn(`Invalid image path format detected: ${srcPath}`);
          img.alt = "Invalid image path";
          // Optionally display placeholder text or hide the element
          return document.createTextNode(`[Invalid Image: ${srcPath}]`);
      }
      img.alt = altText;
      img.style.maxWidth = "100%"; // Use max-width for responsiveness
      img.style.height = "auto";
      img.style.marginTop = "10px";
      img.draggable = false;
      img.style.border = "1px solid #ccc";
      img.style.borderRadius = "4px";
      return img;
  };

  // Create the question box
  const questionDiv = document.createElement("div");
  questionDiv.classList.add(`${section}-box`);
  questionDiv.id = `${section}-question-${subjectName}-${index}`;
  // Margins/padding are handled by CSS for .a-box/.b-box

  // Handle question text or image
  const questionPrefix = `${section === "a" ? "ক" : "খ"}. `;
  if (typeof question === 'string' && question.startsWith("(image/")) {
      const imagePathMatch = question.match(/\(image\/(.+?)\)/);
      if (imagePathMatch && imagePathMatch[1]) {
          questionDiv.appendChild(createImageElement(imagePathMatch[1], "Question Image"));
      } else {
           console.warn(`Malformed image tag in question: ${question}`);
           questionDiv.textContent = questionPrefix + question; // Fallback to text
      }
  } else {
      questionDiv.textContent = questionPrefix + (question || ''); // Handle null/undefined/empty question
  }

  contentContainer.appendChild(questionDiv);

  // Create the explanation container div (initially hidden)
  const explanationContainerDiv = document.createElement("div");
  explanationContainerDiv.classList.add(`${section}-explanation-container`);
  explanationContainerDiv.id = `${section}-explanation-container-${subjectName}-${index}`;
  // display: none is handled by CSS

  // Create the explanation box inside the container
  const explanationBox = document.createElement("div");
  explanationBox.classList.add(`${section}-explanation-box`);
  explanationBox.id = `${section}-explanation-box-${subjectName}-${index}`;
  // Margins/padding handled by CSS

  // Handle explanation text or image
  const explanationPrefix = `উত্তর: `;
   if (typeof explanation === 'string' && explanation.startsWith("(image/")) {
      const imagePathMatch = explanation.match(/\(image\/(.+?)\)/);
       if (imagePathMatch && imagePathMatch[1]) {
          explanationBox.appendChild(createImageElement(imagePathMatch[1], "Explanation Image"));
       } else {
           console.warn(`Malformed image tag in explanation: ${explanation}`);
           const explanationText = document.createElement("div");
           explanationText.textContent = explanationPrefix + explanation; // Fallback to text
           explanationBox.appendChild(explanationText);
       }
  } else {
      const explanationText = document.createElement("div");
      explanationText.textContent = explanationPrefix + (explanation || ''); // Handle null/undefined/empty explanation
      explanationBox.appendChild(explanationText);
  }

  explanationContainerDiv.appendChild(explanationBox);
  contentContainer.appendChild(explanationContainerDiv);

  // Add event listener to the question box to toggle explanation container visibility
  questionDiv.addEventListener("click", function () {
      const isHidden = explanationContainerDiv.style.display === "none";
      explanationContainerDiv.style.display = isHidden ? "block" : "none";
      console.log(`Toggled explanation for ${subjectName}-${section}-${index} to ${isHidden ? 'visible' : 'hidden'}`);
  });
}


function toggleSection(button, section, subjectName) {
  console.log(`Toggling section ${section} for subject ${subjectName}`);
  const parentSubjectDiv = button.closest('.subject');
  if (!parentSubjectDiv) {
      console.error("Could not find parent subject div for button:", button);
      return;
  }

  const isActive = button.classList.contains("active");
  const buttons = parentSubjectDiv.querySelectorAll(".a-button, .b-button");

  // Clear existing content for this subject first
  const contentContainer = document.getElementById(`content-container-${subjectName}`);
  if (contentContainer) {
      contentContainer.innerHTML = ''; // Clear previous questions/explanations
  } else {
      console.error(`Content container not found for ${subjectName}`);
      return;
  }

  // Deactivate all buttons first
  buttons.forEach((b) => b.classList.remove("active"));

  // If the clicked button was not active, activate it and load content
  if (!isActive) {
      button.classList.add("active");
      console.log(`Button for section ${section} activated.`);

      if (questionData && questionData[subjectName] && questionData[subjectName][section]) {
          const questionExplanationArray = questionData[subjectName][section];
          console.log(`Loading ${questionExplanationArray.length} items for ${subjectName} - ${section}`);

          if (questionExplanationArray.length > 0) {
              questionExplanationArray.forEach((item, index) => {
                  createQuestionAndExplanation(
                      subjectName,
                      section,
                      item.question,
                      item.explanation,
                      index
                  );
              });
          } else {
               contentContainer.innerHTML = `<p style="text-align: center; margin: 20px 0; color: #555;">No questions available for this section.</p>`;
          }
      } else {
          console.warn(`No data found for subject: ${subjectName}, section: ${section}`);
          contentContainer.innerHTML = `<p style="text-align: center; margin: 20px 0; color: #888;">Content for this section is currently unavailable.</p>`;
      }
  } else {
      console.log(`Button for section ${section} deactivated.`);
      // Button was active, clicking again deactivates it. Content is already cleared.
  }
}


function toggleCollapse(button) {
  const subjectDiv = button.closest('.subject');
  if (!subjectDiv) return;

  const collapsibleContent = subjectDiv.nextElementSibling;

  if (collapsibleContent && collapsibleContent.classList.contains('collapsible-content')) {
      const isActive = collapsibleContent.classList.toggle("active");
      button.classList.toggle("active", isActive);
      console.log(`Toggled collapsible content for ${subjectDiv.dataset.subjectName} to ${isActive ? 'active' : 'inactive'}`);

      if (isActive) {
          // Populate content from data-text attributes when expanding
          collapsibleContent.querySelectorAll(".collapsible-box").forEach((box) => {
              if (box.dataset.text && box.textContent !== box.dataset.text) { // Avoid re-setting if already correct
                  box.textContent = box.dataset.text;
              }
              // Apply margins (handled by CSS now, but could be adjusted here if needed)
              // const marginValue = getSubjectMargin();
              // box.style.marginTop = `${marginValue}px`;
              // box.style.marginBottom = `${marginValue * 0.6667}px`;
          });
      }
      // Hiding is handled by CSS when 'active' class is removed
  } else {
      console.warn("Collapsible content not found immediately after subject div:", subjectDiv);
  }
}

// Function to get subject names
function getSubjectNames() {
  const subjectNames = [];
  document.querySelectorAll(".subject").forEach((subject) => {
      if (subject.dataset.subjectName) {
          subjectNames.push(subject.dataset.subjectName);
      }
  });
  console.log("Retrieved subject names:", subjectNames);
  return subjectNames;
}

// Function to open the Quiz Iframe
function openQuiz(subjectName) {
  console.log(`Opening quiz for: ${subjectName}`);
  const quizIframe = document.getElementById("quiz-iframe");
  const quizContainer = document.getElementById("quiz-container");

  if (!quizIframe || !quizContainer) {
      console.error("Quiz iframe or container not found.");
      return;
  }

  quizIframe.src = "quiz.html"; // Set src first

  quizIframe.onload = () => {
      console.log("Quiz iframe loaded.");
      try {
          quizIframe.contentWindow.postMessage({ subjectName: subjectName }, "*"); // Use specific origin in production
          console.log("Sent subject name to Quiz iframe.");
      } catch (error) {
          console.error("Failed to post message to Quiz iframe:", error);
      }
  };
   quizIframe.onerror = (e) => console.error("Error loading Quiz iframe:", e);


  quizContainer.style.display = "block";
}

// Function to open the Edit Iframe
function openEdit() {
  console.log("openEdit function called.");
  const editContainer = document.getElementById('edit-container');
  const editIframe = document.getElementById('edit-iframe');

  if (!editContainer || !editIframe) {
      console.error("Edit iframe or container not found.");
      return;
  }
  console.log("Found edit container and iframe.");

  const subjectNames = getSubjectNames();
  if (subjectNames.length === 0) {
      console.warn("No subject names found to send to Edit iframe.");
      // Optionally alert the user or handle this case
  }

  console.log("Setting editIframe src to Edit.html");
  editIframe.src = 'Edit.html'; // Make sure Edit.html is accessible

  editIframe.onload = () => {
      console.log("Edit iframe finished loading.");
      try {
          // Send the subject names to the Edit iframe
          editIframe.contentWindow.postMessage({ subjectNames: subjectNames }, '*'); // Use specific origin in production
          console.log("Sent subject names to Edit iframe:", subjectNames);
      } catch (error) {
          console.error("Failed to post message to Edit iframe:", error);
          // Might happen if Edit.html hasn't fully initialized its listener yet
          // Could implement a retry mechanism or a handshake if needed
      }
  };

  editIframe.onerror = (e) => {
      console.error("Error loading Edit iframe:", e);
      // Optionally hide the container and show an error message to the user
      editContainer.style.display = 'none';
      alert("Error loading the editor. Please check the console for details.");
  };

  console.log("Setting editContainer display to block.");
  editContainer.style.display = 'block';
  console.log("editContainer display style is now:", editContainer.style.display);
}

// Main Message Listener
window.addEventListener("message", function (event) {
  // --- Security Best Practice: Check the origin ---
  // Replace 'http://localhost:5500' with the actual origin of your Edit.html and Quiz.html if different
  // Or use a more dynamic check if origins can vary
  // const expectedOrigin = window.location.origin;
  // if (event.origin !== expectedOrigin) {
  //     console.warn(`Message rejected from origin: ${event.origin}. Expected: ${expectedOrigin}`);
  //     return;
  // }
  // console.log("Message received from origin:", event.origin, "Data:", event.data); // Log received messages

  const quizContainer = document.getElementById("quiz-container");
  const editContainer = document.getElementById("edit-container");
  const quizIframe = document.getElementById("quiz-iframe");
  const editIframe = document.getElementById("edit-iframe");

  if (event.data === "closeQuiz") {
      console.log("Received 'closeQuiz' message.");
      if (quizContainer) {
          quizContainer.style.display = "none";
      }
      if (quizIframe) {
          quizIframe.src = 'about:blank'; // Reset src to clear state
      }
  } else if (event.data === "closeEdit") {
      console.log("Received 'closeEdit' message.");
      if (editContainer) {
          editContainer.style.display = "none";
      }
      if (editIframe) {
          editIframe.src = 'about:blank'; // Reset src to clear state
      }
  }
  // Handle other potential messages if needed
});


async function loadQuestionData() {
  console.log("Attempting to load question data...");
  try {
      // 1. Try loading from IndexedDB first
      const cachedData = await IndexedDBHelper.getData();

      if (cachedData) {
          console.log("Using cached data from IndexedDB.");
          questionData = cachedData;
          return; // Data loaded successfully
      } else {
           console.log("No cached data found in IndexedDB.");
      }

      // 2. If no cached data, try fetching from a potential source (e.g., a JSON file or API)
      //    Replace 'ab.json' with your actual data source if applicable.
      //    This fetch is commented out by default, assuming data might be local or cached.
      /*
      try {
          console.log("Attempting to fetch fresh data from ab.json...");
          const response = await fetch('ab.json'); // Adjust path if needed
          if (response.ok) {
              const fetchedData = await response.json();
              console.log("Fetched fresh data successfully.");
              questionData = fetchedData;
              await IndexedDBHelper.saveData(fetchedData); // Cache the fresh data
              console.log("Cached fresh data to IndexedDB.");
              return; // Data loaded successfully
          } else {
              console.warn(`Failed to fetch fresh data (Status: ${response.status}). Trying local variable.`);
          }
      } catch (fetchError) {
          console.warn("Network error fetching data. Trying local variable.", fetchError);
      }
      */

      // 3. Fallback: If fetch fails or is skipped, try loading from a local 'abData' variable
      //    (This requires 'abData' to be defined globally *before* this script runs)
      if (typeof abData !== "undefined" && abData) {
          console.log("Using local 'abData' variable.");
          questionData = abData;
          await IndexedDBHelper.saveData(abData); // Cache it for next time
          console.log("Cached local 'abData' to IndexedDB.");
          return; // Data loaded successfully
      }

      // 4. If all methods fail
      console.error("FATAL: No question data source found (cache, fetch, or local variable).");
      displayLoadError("Error: Could not load question data. Please ensure data is available or try refreshing.");

  } catch (error) {
      console.error("Error during question data loading process:", error);
      displayLoadError("An error occurred while loading question data. Please check the console.");
  }
}

function displayLoadError(message) {
   const container = document.querySelector('.container');
   if (container) {
       // Prepend error message to avoid overwriting content if some exists
       const errorElement = document.createElement('p');
       errorElement.style.color = 'red';
       errorElement.style.backgroundColor = '#ffebee';
       errorElement.style.border = '1px solid red';
       errorElement.style.padding = '10px';
       errorElement.style.margin = '20px';
       errorElement.style.textAlign = 'center';
       errorElement.textContent = message;
       container.prepend(errorElement); // Add error at the top
   }
}

// Note: The 'abData' variable mentioned in loadQuestionData is assumed to be
// potentially defined in a separate file or inline script loaded before this one.
// If you are *not* using such a variable, you can remove that part of the logic.