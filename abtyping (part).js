// abtyping (part).js
// Function to type text letter by letter
function typeText(element, text, speed, callback) {
  let i = 0;
  let interval = null;

  // Clear any existing interval for this element
  if (element.typingInterval) {
    clearInterval(element.typingInterval);
    element.typingInterval = null;
  }

  interval = setInterval(function () {
    // Function to process and insert images
    function insertImage(url) {
      const img = document.createElement('img');
      img.src = url;
      img.classList.add('img');
      img.style.width = "100%";
      img.style.height = "100%"
      img.style.marginTop = "7.5px";
      img.style.marginLeft = "0px"; // Set margin-left
      img.onerror = () => console.error(`Failed to load image: ${url}`);
      element.appendChild(img);
    }

    // Check for the start of an image link
    if (text.charAt(i) === '(') {
      // Find the end of the parentheses
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
        element.innerHTML += text.charAt(i);
        i++;
      }
    } else {
      // Handle plain image links
      let j = i + 1;
      while (j < text.length && text.charAt(j).match(/[a-zA-Z0-9._\-\/]/)) j++;
      const link = text.substring(i, j).trim();
      if (link.match(/\.(gif|jpe?g|tiff?|png|webp|bmp|svg|ico|avif)$/i)) {
        insertImage(link);
        i = j;
      } else {
        element.innerHTML += text.charAt(i);
        i++;
      }
    }

    // Stop the interval when all text is processed
    if (i === text.length) {
      clearInterval(interval);
      if (callback) callback();
    }
  }, speed);

  // Store the interval ID on the element
  element.typingInterval = interval;
}



// Initialize typing for header elements
const typingTexts = document.querySelectorAll(".typing-text");
typingTexts.forEach((text) => {
  typeText(text, text.dataset.text, 20, function () {
    // After the header text is finished typing, show the buttons
    const abButtons = text.parentElement.querySelectorAll(
      ".a-button, .b-button, .partial-button"
    );
    abButtons.forEach((button) => {
      button.style.display = "inline-block"; 
      typeText(button, button.dataset.text, 30);
    });

    // Adjust container top margin based on header height
    const container = document.querySelector('.container');
    container.style.marginTop = `${getHeaderHeight()}px`; 
  });
});

// Function to get the header's height
function getHeaderHeight() {
  const header = document.querySelector('.header');
  return header.offsetHeight;
}



function getSubjectMargin() {
  // Your code to calculate or retrieve the subject margin
  return 10; // Example return value
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
  questionDiv.style.marginTop = `${getSubjectMargin(subjectName)}px`; // Set margin-top dynamically
  questionDiv.style.marginBottom = `${getSubjectMargin(subjectName)}px`; // Set margin-bottom dynamically
  questionDiv.innerHTML = ""; // Initially empty
  contentContainer.appendChild(questionDiv);

  // Create the explanation box
  const explanationDiv = document.createElement("div");
  explanationDiv.classList.add(`${section}-explanation`);
  explanationDiv.id = `${section}-explanation-${subjectName}-${index}`;
  explanationDiv.style.marginTop = `${getSubjectMargin(subjectName)}px`; // Set margin-top dynamically
  explanationDiv.style.marginBottom = `${getSubjectMargin(subjectName)}px`; // Set margin-bottom dynamically

  const explanationBox = document.createElement("div");
  explanationBox.classList.add(`${section}-explanation-box`);
  explanationBox.id = `${section}-explanation-box-${subjectName}-${index}`;
  explanationBox.innerHTML = ""; // Initially empty
  explanationDiv.appendChild(explanationBox);
  contentContainer.appendChild(explanationDiv);

  // Add event listener to the question box to toggle explanation
  questionDiv.addEventListener("click", function () {
    if (explanationBox.style.display === "none") {
      // Clear the explanation text before typing again
      explanationBox.innerHTML = ""; 
      explanationBox.style.display = "block";
      const stopTyping = typeText(explanationBox, `উত্তর  : ${explanation}`, 10); 
      explanationBox.stopTyping = stopTyping; 
    } else {
      explanationBox.style.display = "none";
      explanationBox.innerHTML = ""; 
      if (explanationBox.stopTyping) {
        explanationBox.stopTyping();
        delete explanationBox.stopTyping; 
      }
    }
  });

  // Type the question text
  let prefix = "";
  if (section === "a") {
    prefix = "ক";
  } else if (section === "b") {
    prefix = "খ";
  }
  typeText(questionDiv, `${prefix}. ${question}`, 10);

  // Type the explanation text with image insertion
  typeText(explanationBox, `${explanation} `, 10); 
}

function toggleSection(button, section, subjectName) {
  // Check if the button is already active
  const isButtonActive = button.classList.contains("active");

  // Deactivate all buttons in the group (ensuring only one button is active at a time)
  const buttons = button.parentElement.querySelectorAll(".a-button, .b-button");
  buttons.forEach((b) => b.classList.remove("active"));

  // Toggle the clicked button's state only if it was not active
  if (!isButtonActive) {
    button.classList.add("active");
  }

  if (questionData) {
    // Fetch the question and explanation from JSON using the unique subjectName
    const questionExplanationArrayA = questionData[subjectName]["a"];
    const questionExplanationArrayB = questionData[subjectName]["b"];

    // Function to handle question and explanation visibility
    const handleVisibility = (array, sectionPrefix) => {
      array.forEach((item, index) => {
        const question = item.question;
        const explanation = item.explanation;
        const questionId = `${sectionPrefix}-question-${subjectName}-${index}`;
        const explanationBoxId = `${sectionPrefix}-explanation-box-${subjectName}-${index}`;

        // Create or update question and explanation
        if (!document.getElementById(questionId)) {
          createQuestionAndExplanation(
            subjectName,
            sectionPrefix,
            question,
            explanation,
            index
          );
        } else {
          const questionElement = document.getElementById(questionId);
          questionElement.innerHTML = ""; 
          typeText(questionElement, `${sectionPrefix === 'a' ? 'ক' : 'খ'}. ${question}`, 1);
        }

        // Show or hide based on button state
        const questionElement = document.getElementById(questionId);
        const explanationBox = document.getElementById(explanationBoxId);

        if (questionElement && explanationBox) {
          if (button.classList.contains("active")) {
            questionElement.style.display = "block";
            explanationBox.style.display = "none";
            explanationBox.innerHTML = ""; 
          } else {
            questionElement.style.display = "none";
            explanationBox.style.display = "none";
            explanationBox.innerHTML = ""; 
          }
        }
      });
    };

    // Handle visibility for both sections
    handleVisibility(questionExplanationArrayA, 'a');
    handleVisibility(questionExplanationArrayB, 'b');

    // Hide the questions and explanations of the other section
    const otherSection = section === "a" ? "b" : "a";
    [questionExplanationArrayA, questionExplanationArrayB].forEach(array => {
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
          explanationBoxElement.innerHTML = ""; 
        }
      });
    });

    // Set margin for explanation boxes
    ['a', 'b'].forEach(sectionPrefix => {
      [questionExplanationArrayA, questionExplanationArrayB].forEach(array => {
        array.forEach((_item, index) => {
          const explanationBox = document.getElementById(`${sectionPrefix}-explanation-box-${subjectName}-${index}`);
          if (explanationBox) {
            explanationBox.style.marginTop = `${getSubjectMargin(subjectName)}px`; // Update margin-top dynamically
            explanationBox.style.marginBottom = `${getSubjectMargin(subjectName)}px`; // Update margin-bottom dynamically
          }
        });
      });
    });
  }
}

function toggleCollapse(button) {
  const collapsibleContent = button.parentElement.nextElementSibling;

  if (collapsibleContent) {
    const isActive = collapsibleContent.classList.toggle('active');

    // Toggle the active class on the button
    button.classList.toggle('active', isActive);

    if (!isActive) {
      // Reset the collapsible-box content
      collapsibleContent.querySelectorAll('.collapsible-box').forEach(box => {
        box.textContent = '';
        if (box.typingEffect) {
          box.typingEffect();
          delete box.typingEffect;
        }
      });
    } else {
      collapsibleContent.querySelectorAll('.collapsible-box').forEach(box => {
        const text = box.getAttribute('data-text');
        box.textContent = '';
        box.style.marginTop = `${getSubjectMargin(box.parentElement.parentElement.dataset.subjectName)}px`; // Set margin-top dynamically
        box.style.marginBottom = `${getSubjectMargin(box.parentElement.parentElement.dataset.subjectName)}*0px`; // Set margin-bottom dynamically
        box.typingEffect = typeText(box, text, 4);
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

// Function to get all subject names
function getSubjectNames() {
    const subjectNames = [];
    const subjects = document.querySelectorAll('.subject');
    subjects.forEach(subject => {
        subjectNames.push(subject.dataset.subjectName);
    });
    return subjectNames;
}

// Function to open quiz iframe
function openQuiz(subjectName) {
  // Refresh the quiz iframe before opening it
  const quizIframe = document.getElementById("quiz-iframe");
  quizIframe.src = 'quiz.html'; // Assuming the quiz iframe's src is 'Quiz.html'
  quizIframe.onload = () => {
    // Send the subject name to the quiz iframe after it loads
    quizIframe.contentWindow.postMessage({ subjectName: subjectName }, "*");
  };
  const quizContainer = document.getElementById("quiz-container");
  quizContainer.style.display = "block";
}


function openEdit() {
  const editContainer = document.getElementById('Edit-container');
  const editIframe = document.getElementById('Edit-iframe');

  if (editContainer && editIframe) {
      editContainer.style.display = 'block';
      const subjectNames = getSubjectNames();
      try {
          editIframe.contentWindow.postMessage({ subjectNames }, '*');
      } catch (error) {
          console.error('Message sending failed:', error);
      }
  } else {
      console.error('Edit-container or Edit-iframe not found.');
  }
}

function openmultiselection(subjectName) {
  const container = document.getElementById('quiz-container');
  const iframe = document.getElementById('quiz-iframe');
  
  if (!container || !iframe) {
      console.error('quiz-container or quiz-iframe not found.');
      return;
  }

  iframe.src = 'Topic Selection.html'; // Load the Topic Selection page
  
  iframe.onload = () => {
    // Send the specific subject name to the quiz iframe after it loads
    iframe.contentWindow.postMessage({ subjectName: subjectName }, "*");
    
    // Send all the subject names to the iframe after it loads
    const subjectNames = getSubjectNames(); // Function to get all subject names
    try {
        iframe.contentWindow.postMessage({ subjectNames: subjectNames }, '*');
    } catch (error) {
        console.error('Message sending failed:', error);
    }
  };

  container.style.display = 'block'; // Show the quiz container
}



function closeEdit() {
    document.getElementById('Edit-container').style.display = 'none';
}

window.addEventListener('message', function (event) {
    if (event.data === 'closeEdit') {
        closeEdit();
    } else if (event.data.subjectName) {
        // Handle subject selection from Edit.html (if needed)
        const selectedSubject = event.data.subjectName;
        console.log('Selected Subject:', selectedSubject);
    }
});


// Initialize Server-Sent Events
function initializeSSE() {
  async function attemptConnection(urlIndex = 0) {
    if (urlIndex >= urls.length) {
      console.warn('All SSE URLs failed. Retrying in 5 seconds...');
      // Retry from the first URL after a delay
      setTimeout(() => attemptConnection(0), 5000);
      return;
    }

    const url = `${urls[urlIndex]}sse/ab.json`;
    const eventSource = new EventSource(url);

    eventSource.onmessage = function(event) {
      const update = JSON.parse(event.data);
      handleUpdate(update);
    };

    eventSource.onerror = function(error) {
      console.error(`EventSource failed for ${url}:`, error);
      eventSource.close();
      // Retry with the next URL after 5 seconds
      setTimeout(() => attemptConnection(urlIndex + 1), 5000);
    };

    window.addEventListener('beforeunload', () => {
      eventSource.close();
    });
  }

  attemptConnection(); // Start with the first URL
}
// Function to handle updates from the server
function handleUpdate(update) {
  const { type, subject, section, questionIndex, question } = update;

  switch (type) {
    case 'add':
      if (!questionData[subject]) {
        questionData[subject] = { a: [], b: [] };
      }
      questionData[subject][section].push(question);
      createQuestionAndExplanation(subject, section, question.question, question.explanation, questionData[subject][section].length - 1);
      break;
    case 'modify':
      if (questionData[subject] && questionData[subject][section][questionIndex]) {
        questionData[subject][section][questionIndex] = question;
        updateQuestionAndExplanation(subject, section, question.question, question.explanation, questionIndex);
      }
      break;
    case 'delete':
      if (questionData[subject] && questionData[subject][section][questionIndex]) {
        questionData[subject][section].splice(questionIndex, 1);
        removeQuestionAndExplanation(subject, section, questionIndex);
      }
      break;
    default:
      console.warn('Unknown update type:', type);
  }
}

// Function to update existing question and explanation
function updateQuestionAndExplanation(subjectName, section, question, explanation, index) {
  const questionId = `${section}-question-${subjectName}-${index}`;
  const explanationId = `${section}-explanation-box-${subjectName}-${index}`;

  const questionElement = document.getElementById(questionId);
  const explanationElement = document.getElementById(explanationId);

  if (questionElement && explanationElement) {
    questionElement.innerHTML = ""; // Clear existing content
    typeText(questionElement, `${section === 'a' ? 'ক' : 'খ'}. ${question}`, 10); // Assuming typeText is a function to add typing effect

    explanationElement.innerHTML = ""; // Clear existing content
    typeText(explanationElement, `উত্তর : ${explanation}`, 10);
  }
}

// Function to remove question and explanation
function removeQuestionAndExplanation(subjectName, section, index) {
  const questionId = `${section}-question-${subjectName}-${index}`;
  const explanationId = `${section}-explanation-${subjectName}-${index}`;

  const questionElement = document.getElementById(questionId);
  const explanationElement = document.getElementById(explanationId);

  if (questionElement) questionElement.remove();
  if (explanationElement) explanationElement.remove();

  // Reindex remaining questions, starting from the deleted one
  for (let i = index; i < questionData[subjectName][section].length; i++) {
    const oldQuestionId = `${section}-question-${subjectName}-${i + 1}`;
    const oldExplanationId = `${section}-explanation-${subjectName}-${i + 1}`;
    const newQuestionId = `${section}-question-${subjectName}-${i}`;
    const newExplanationId = `${section}-explanation-${subjectName}-${i}`;

    const questionElement = document.getElementById(oldQuestionId);
    const explanationElement = document.getElementById(oldExplanationId);

    if (questionElement) questionElement.id = newQuestionId;
    if (explanationElement) explanationElement.id = newExplanationId;
  }

  // Trigger a reflow to ensure changes reflect visually
  forceReflow();
}

const forceReflow = () => document.body.offsetHeight;


// Load the JSON data from ab.json
let questionData = null;
const urls = [
'http://localhost:8080/',
  'http://localhost:3001/',
'http://localhost:5500/'
];

async function loadQuestionData() {
  for (const baseUrl of urls) {
    try {
      const response = await fetch(`${baseUrl}ab.json`);
      if (!response.ok) {
        console.warn(`Failed to fetch from ${baseUrl}ab.json. Status: ${response.status}`);
        continue; // Try the next URL
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Error fetching or parsing data from ${baseUrl}ab.json:`, error);
    }
  }

  // If all URLs fail, display an error message and return null
  console.error("Failed to fetch data from all provided URLs.");
  return null;
}


// Load initial data
async function loadQuestionData() {
  for (const baseUrl of urls) {
    try {
      const response = await fetch(`${baseUrl}ab.json`);
      if (!response.ok) {
        console.warn(`Failed to fetch from ${baseUrl}ab.json. Status: ${response.status}`);
        continue; // Try the next URL
      }
      const data = await response.json();
      questionData = data;
      initializeSSE();
      return; // Exit function after successful fetch
    } catch (error) {
      console.error(`Error fetching or parsing data from ${baseUrl}ab.json:`, error);
    }
  }

  // If all URLs fail, update the UI to show an error message
  const errorMessage = document.getElementById('error-message');
  if (errorMessage) {
    errorMessage.textContent = "Error loading questions. Please refresh the page.";
    errorMessage.classList.remove("hide");
  }
}

loadQuestionData();



