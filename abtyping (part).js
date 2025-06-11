// --- START OF FILE abtyping.js ---

// abtyping.js with IndexedDB caching, Edit Iframe Integration,
// Dynamic Edit Button, Dynamic Edit Iframe Container, Debug Logging,
// and LAZY LOADING data from individual subject files using <script> tags.

// IndexedDB Utility Functions
const IndexedDBHelper = {
    dbName: 'QuizAppDB',
    storeName: 'questionData', // Store the combined data here
    version: 1, // Increment version if schema changes

    async openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName); // No key path needed for single entry
                }
                console.log("IndexedDB upgrade needed or database created.");
            };

            request.onsuccess = () => {
                resolve(request.result);
            };
            request.onerror = (event) => {
                console.error("IndexedDB error:", event.target.error);
                reject(event.target.error);
            }
        });
    },

    async saveData(data) { // Saves the combined data object
        try {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                if (!db.objectStoreNames.contains(this.storeName)) {
                     console.error(`Object store "${this.storeName}" not found during save.`);
                     db.close();
                     reject(new Error(`Object store "${this.storeName}" not found.`));
                     return;
                }
                const transaction = db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                // Store the entire combined data object under a single key
                const request = store.put(data, 'combinedQuestionData'); // Use a specific key

                request.onsuccess = () => {
                    resolve(true);
                };
                request.onerror = (event) => {
                     console.error("IndexedDB save error:", event.target.error);
                     reject(event.target.error);
                }
                transaction.oncomplete = () => db.close();
                transaction.onerror = (event) => {
                    console.error("IndexedDB save transaction error:", event.target.error);
                    db.close();
                    reject(event.target.error);
                };
            });
        } catch (error) {
            console.error("Error opening DB for save:", error);
            return Promise.reject(error);
        }
    },

    async getData() { // Retrieves the combined data object
        try {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                 if (!db.objectStoreNames.contains(this.storeName)) {
                     console.warn(`Object store "${this.storeName}" not found during get.`);
                     db.close();
                     resolve(null);
                     return;
                }
                const transaction = db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                // Retrieve the combined data using the specific key
                const request = store.get('combinedQuestionData');

                request.onsuccess = () => {
                    resolve(request.result);
                };
                request.onerror = (event) => {
                    console.error("IndexedDB get error:", event.target.error);
                    reject(event.target.error);
                }
                transaction.oncomplete = () => db.close();
                 transaction.onerror = (event) => {
                    console.error("IndexedDB get transaction error:", event.target.error);
                    db.close();
                    reject(event.target.error);
                };
            });
         } catch (error) {
            console.error("Error opening DB for get:", error);
            return Promise.reject(error);
        }
    }
};

// Global variable to store the combined question data
// Initialize the global object where individual scripts will add data
window.allSubjectData = window.allSubjectData || {};
let questionData = null; // This will point to window.allSubjectData after loading
let loadingSubjects = new Set(); // Keep track of scripts currently being loaded

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
        // Ensure content container exists for each subject div
        const subjectName = subjectDiv.dataset.subjectName;
        if (subjectName && !document.getElementById(`content-container-${subjectName}`)) {
            const contentContainer = document.createElement('div');
            contentContainer.className = 'content-container';
            contentContainer.id = `content-container-${subjectName}`;
            contentContainer.style.display = 'none'; // Initially hidden
            subjectDiv.appendChild(contentContainer); // Append it inside the subject div
        }

        const buttons = subjectDiv.querySelectorAll(".a-button, .b-button, .partial-button");
        buttons.forEach((button) => {
            if (button.dataset.text) {
                button.style.display = "inline-block"; // Make buttons visible
                button.textContent = button.dataset.text;
            }
        });
    });

     // Handle collapsible box text if needed
     document.querySelectorAll(".collapsible-box").forEach(box => {
         if (box.dataset.text && !box.closest('.collapsible-content')?.classList.contains('active')) {
             // box.textContent = "Click '(Partial)' to view details"; // Optional placeholder
         }
     });
     console.log("Static content initialized.");
}

// Adjust container margin based on header height
function adjustContainerMargin() {
    const container = document.querySelector(".container");
    if (container) {
        const headerHeight = getHeaderHeight();
        container.style.marginTop = `${headerHeight}px`;
    }
}

// Function to create question and explanation elements
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
        // Basic check for common image extensions
        if (/\.(jpg|jpeg|png|gif|bmp|svg|webp)$/i.test(srcPath)) {
             // Correct path assuming 'image' folder is relative to the HTML file's location
             img.src = `image/${srcPath}`;
        } else {
            console.warn(`Invalid image path format detected: ${srcPath}`);
            img.alt = "Invalid image path";
            return document.createTextNode(`[Invalid Image: ${srcPath}]`);
        }
        img.alt = altText;
        img.style.maxWidth = "100%";
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

    // Handle question text or image
    const questionPrefix = `${section === "a" ? "ক" : "খ"}. `;
    if (typeof question === 'string' && question.startsWith("(image/")) {
        const imagePathMatch = question.match(/\(image\/(.+?)\)/);
        if (imagePathMatch && imagePathMatch[1]) {
            questionDiv.appendChild(createImageElement(imagePathMatch[1], "Question Image"));
        } else {
             console.warn(`Malformed image tag in question: ${question}`);
             questionDiv.textContent = questionPrefix + question;
        }
    } else {
        questionDiv.textContent = questionPrefix + (question || '');
    }

    contentContainer.appendChild(questionDiv);

    // Create the explanation container div (initially hidden)
    const explanationContainerDiv = document.createElement("div");
    explanationContainerDiv.classList.add(`${section}-explanation-container`);
    explanationContainerDiv.id = `${section}-explanation-container-${subjectName}-${index}`;
    explanationContainerDiv.style.display = 'none';

    // Create the explanation box inside the container
    const explanationBox = document.createElement("div");
    explanationBox.classList.add(`${section}-explanation-box`);
    explanationBox.id = `${section}-explanation-box-${subjectName}-${index}`;

    // Handle explanation text or image
    const explanationPrefix = `উত্তর: `;
     if (typeof explanation === 'string' && explanation.startsWith("(image/")) {
        const imagePathMatch = explanation.match(/\(image\/(.+?)\)/);
         if (imagePathMatch && imagePathMatch[1]) {
            explanationBox.appendChild(createImageElement(imagePathMatch[1], "Explanation Image"));
         } else {
             console.warn(`Malformed image tag in explanation: ${explanation}`);
             const explanationText = document.createElement("div");
             explanationText.textContent = explanationPrefix + explanation;
             explanationBox.appendChild(explanationText);
         }
    } else {
        const explanationText = document.createElement("div");
        explanationText.textContent = explanationPrefix + (explanation || '');
        explanationBox.appendChild(explanationText);
    }

    explanationContainerDiv.appendChild(explanationBox);
    contentContainer.appendChild(explanationContainerDiv);

    // Add event listener to the question box to toggle explanation
    questionDiv.addEventListener("click", function () {
        const isHidden = explanationContainerDiv.style.display === "none";
        explanationContainerDiv.style.display = isHidden ? "block" : "none";
    });
}

// Function to display content for a specific section AFTER data is loaded
function displaySectionContent(subjectName, section) {
    const contentContainer = document.getElementById(`content-container-${subjectName}`);
    if (!contentContainer) {
        console.error(`Cannot display content: Container not found for ${subjectName}`);
        return;
    }
    contentContainer.innerHTML = ''; // Clear previous content or loading message

    // *** Use the globally populated questionData ***
    if (questionData && questionData[subjectName] && questionData[subjectName][section]) {
        const questionExplanationArray = questionData[subjectName][section];
        if (questionExplanationArray.length > 0) {
            contentContainer.style.display = 'block';
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
             contentContainer.style.display = 'block';
             contentContainer.innerHTML = `<p style="text-align: center; margin: 20px 0; color: #555;">No questions available for this section.</p>`;
        }
    } else {
        console.warn(`No data found for subject: ${subjectName}, section: ${section} even after attempting load.`);
        contentContainer.style.display = 'block';
        contentContainer.innerHTML = `<p style="text-align: center; margin: 20px 0; color: #888;">Content for this section could not be loaded.</p>`;
    }
}


// Function to toggle A/B sections (with lazy loading)
function toggleSection(button, section, subjectName) {
    const parentSubjectDiv = button.closest('.subject');
    if (!parentSubjectDiv) {
        console.error("Could not find parent subject div for button:", button);
        return;
    }

    const isActive = button.classList.contains("active");
    const contentContainer = document.getElementById(`content-container-${subjectName}`);
    const partialButton = parentSubjectDiv.querySelector('.partial-button');
    const collapsibleContent = parentSubjectDiv.nextElementSibling;

    // --- Deactivation Logic ---
    parentSubjectDiv.querySelectorAll(".a-button, .b-button").forEach((b) => b.classList.remove("active"));
    if (partialButton) partialButton.classList.remove("active");
    if (collapsibleContent && collapsibleContent.classList.contains('collapsible-content')) {
        collapsibleContent.classList.remove("active");
        collapsibleContent.style.display = 'none';
    }
    if (contentContainer) {
        contentContainer.innerHTML = ''; // Clear content container on any toggle
        contentContainer.style.display = 'none';
    }
    // --- End Deactivation Logic ---

    // If the button was clicked to ACTIVATE it (was not previously active)
    if (!isActive) {
        button.classList.add("active"); // Activate the clicked button

        if (!contentContainer) {
            console.warn(`Content container not found for ${subjectName}, cannot display section ${section}.`);
            return;
        }

        // Check if data for this subject is already loaded
        if (questionData && questionData[subjectName]) {
            console.log(`Data for ${subjectName} already loaded. Displaying section ${section}.`);
            displaySectionContent(subjectName, section); // Display directly
        }
        // If data is NOT loaded and NOT currently being loaded
        else if (!loadingSubjects.has(subjectName)) {
            console.log(`Data for ${subjectName} not loaded. Attempting to load script...`);
            loadingSubjects.add(subjectName); // Mark as loading

            // Show loading indicator
            contentContainer.innerHTML = `<p style="text-align: center; margin: 20px 0; color: #555;">Loading...</p>`;
            contentContainer.style.display = 'block';

            // Construct filename WITHOUT the colon
            let filenamePart = subjectName.replace(/[\\/*?:"<>|]/g, '').trim();
            const filename = filenamePart + '.js';
            const filePath = `ab/${filename}`; // Relative path

            const script = document.createElement('script');
            script.src = filePath;
            script.async = true;
            script.type = 'text/javascript';
            script.charset = 'utf-8';

            script.onload = () => {
                console.log(`Successfully loaded script: ${filePath}`);
                loadingSubjects.delete(subjectName); // Remove from loading set
                questionData = window.allSubjectData; // Update local pointer

                // Now display the content for the section that was originally clicked
                displaySectionContent(subjectName, section);

                // Cache the updated combined data
                IndexedDBHelper.saveData(questionData)
                    .then(() => console.log(`Cached data after loading ${subjectName}.`))
                    .catch(err => console.error(`Failed to cache data after loading ${subjectName}:`, err));
            };

            script.onerror = (error) => {
                console.error(`Error loading script: ${filePath}`, error);
                loadingSubjects.delete(subjectName); // Remove from loading set even on error
                contentContainer.innerHTML = `<p style="text-align: center; margin: 20px 0; color: red;">Error loading data for this subject.</p>`;
                // Optionally remove the failed script tag: script.remove();
            };

            (document.head || document.getElementsByTagName('head')[0]).appendChild(script);

        } else {
            console.log(`Script for ${subjectName} is already loading. Please wait.`);
            // Optionally update the loading message if needed
            contentContainer.innerHTML = `<p style="text-align: center; margin: 20px 0; color: #555;">Loading...</p>`;
            contentContainer.style.display = 'block';
        }
    }
    // If the button was clicked to DEACTIVATE it (was already active), the deactivation logic above handled it.
}

// Function to toggle Partial/Collapsible section
function toggleCollapse(button) {
    const subjectDiv = button.closest('.subject');
    if (!subjectDiv) {
        console.error("Could not find parent subject div for partial button:", button);
        return;
    }

    const subjectName = subjectDiv.dataset.subjectName;
    const collapsibleContent = subjectDiv.nextElementSibling;

    if (!collapsibleContent || !collapsibleContent.classList.contains('collapsible-content')) {
        console.warn("Collapsible content not found immediately after subject div:", subjectDiv);
        return;
    }

    const wasActive = button.classList.contains("active");
    const contentContainer = document.getElementById(`content-container-${subjectName}`);

    // --- Deactivation Logic ---
    subjectDiv.querySelectorAll(".a-button, .b-button").forEach((b) => b.classList.remove("active"));
    button.classList.remove("active");
    collapsibleContent.classList.remove("active");
    collapsibleContent.style.display = 'none';
    if (contentContainer) {
        contentContainer.innerHTML = '';
        contentContainer.style.display = 'none';
    }
    // --- End Deactivation Logic ---

    if (!wasActive) {
        button.classList.add("active");
        collapsibleContent.classList.add("active");
        collapsibleContent.style.display = 'flex';
        console.log(`Toggled collapsible content for ${subjectName} to active`);

        // Populate content from data-text attributes
        collapsibleContent.querySelectorAll(".collapsible-box").forEach((box) => {
            if (box.dataset.text && box.textContent !== box.dataset.text) {
                box.textContent = box.dataset.text;
            }
        });
    } else {
        console.log(`Toggled collapsible content for ${subjectName} to inactive.`);
    }
}


// Function to get subject names from the current page
function getSubjectNames() {
    const subjectNames = [];
    document.querySelectorAll(".subject").forEach((subject) => {
        if (subject.dataset.subjectName) {
            subjectNames.push(subject.dataset.subjectName);
        }
    });
    return subjectNames;
}

// Function to open the Quiz Iframe
function openQuiz(subjectName) {
    console.log(`Opening quiz for: ${subjectName}`);
    const quizIframe = document.getElementById("quiz-iframe");
    const quizContainer = document.getElementById("quiz-container");

    if (!quizIframe || !quizContainer) {
        console.error("Quiz iframe or container not found.");
        alert("Could not open the quiz interface.");
        return;
    }

    quizIframe.src = "quiz.html";

    quizIframe.onload = () => {
        console.log("Quiz iframe loaded.");
        try {
            quizIframe.contentWindow.postMessage({ type: 'loadQuiz', subjectName: subjectName }, "*");
            console.log("Sent 'loadQuiz' message to Quiz iframe.");
        } catch (error) {
            console.error("Failed to post message to Quiz iframe:", error);
        }
    };
     quizIframe.onerror = (e) => {
        console.error("Error loading Quiz iframe:", e);
        alert("Error loading the quiz interface.");
        quizContainer.style.display = "none";
     };

    quizContainer.style.display = "block";
}

// Function to open the Edit Iframe
function openEdit() {
    console.log("openEdit function called.");
    const editContainer = document.getElementById('edit-container');
    const editIframe = document.getElementById('edit-iframe');

    if (!editContainer || !editIframe) {
        console.error("Edit iframe or container not found.");
        alert("Edit interface components not found.");
        return;
    }

    const subjectNames = getSubjectNames();
    if (subjectNames.length === 0) {
        console.warn("No subject names found on this page to send to Edit iframe.");
    }

    console.log("Setting editIframe src to Edit.html");
    editIframe.src = 'Edit.html';

    editIframe.onload = () => {
        console.log("Edit iframe finished loading.");
        try {
            // Pass the combined data object to the edit iframe
            const message = {
                type: 'loadEdit',
                subjectNames: subjectNames, // Still send names for potential UI listing
                allData: window.allSubjectData // Send the actual combined data
            };
            editIframe.contentWindow.postMessage(message, '*');
            console.log("Sent 'loadEdit' message with all data to Edit iframe.");
        } catch (error) {
            console.error("Failed to post message to Edit iframe:", error);
        }
    };

    editIframe.onerror = (e) => {
        console.error("Error loading Edit iframe:", e);
        editContainer.style.display = 'none';
        alert("Error loading the editor interface.");
    };

    console.log("Setting editContainer display to block.");
    editContainer.style.display = 'block';
}

// Main Message Listener for iframe communication
window.addEventListener("message", function (event) {
    // console.log("Parent received message:", event.data, "from origin:", event.origin); // Debug

    const quizContainer = document.getElementById("quiz-container");
    const editContainer = document.getElementById("edit-container");
    const quizIframe = document.getElementById("quiz-iframe");
    const editIframe = document.getElementById("edit-iframe");

    if (typeof event.data === 'object' && event.data !== null && event.data.type) {
        switch (event.data.type) {
            case "closeQuiz":
                console.log("Processing 'closeQuiz' message.");
                if (quizContainer) quizContainer.style.display = "none";
                if (quizIframe) quizIframe.src = 'about:blank';
                break;

            case "closeEdit":
                console.log("Processing 'closeEdit' message.");
                if (editContainer) editContainer.style.display = "none";
                if (editIframe) editIframe.src = 'about:blank';
                break;

            case "editDataSaved": // Message from Edit.html after saving
                 console.log("Received 'editDataSaved' message with new data:", event.data.updatedData);
                 if (event.data.updatedData) {
                     // Update the global data object
                     window.allSubjectData = event.data.updatedData;
                     questionData = window.allSubjectData; // Update the pointer

                     // Update the cache
                     IndexedDBHelper.saveData(window.allSubjectData)
                         .then(() => console.log("Updated IndexedDB cache with data from Edit iframe."))
                         .catch(err => console.error("Error updating IndexedDB cache after edit:", err));

                     // Optionally, refresh the view if a section was active
                     // Or just close the editor and let the user re-select
                     if (editContainer) editContainer.style.display = "none";
                     if (editIframe) editIframe.src = 'about:blank';
                     alert("Data saved successfully! Refresh the page or re-select the section to see changes."); // Inform user
                 } else {
                     console.error("Received 'editDataSaved' message but no updatedData was provided.");
                 }
                 break;

            default:
                console.log("Received unknown message type from iframe:", event.data.type);
        }
    } else {
        console.warn("Received message from iframe with unexpected format:", event.data);
    }
});


// Function to load initial data (cache check only)
async function loadInitialData() {
    console.log("Attempting to load initial data from cache...");
    try {
        const cachedData = await IndexedDBHelper.getData();
        if (cachedData && Object.keys(cachedData).length > 0) {
            console.log("Using cached combined data from IndexedDB for initial load.");
            window.allSubjectData = cachedData;
            questionData = window.allSubjectData;
        } else {
            console.log("No valid cached data found. Will load subjects on demand.");
            window.allSubjectData = {}; // Ensure it's an empty object
            questionData = window.allSubjectData;
        }
    } catch (cacheError) {
        console.warn("Error reading from IndexedDB cache during initial load:", cacheError);
        window.allSubjectData = {}; // Ensure it's an empty object on cache error
        questionData = window.allSubjectData;
    }
}

// Function to dynamically create and add the Edit button
function createEditButton() {
    if (document.getElementById('dynamic-edit-button')) return;

    const button = document.createElement('button');
    button.id = 'dynamic-edit-button';
    button.textContent = 'Edit';
    button.title = 'Edit Question Data';
    button.style.position = 'fixed';
    button.style.top = '10px';
    button.style.right = '10px';
    button.style.zIndex = '1001';
    button.style.padding = '5px 12px';
    button.style.backgroundColor = '#ebe6e6';
    button.style.color = '#202020';
    button.style.border = 'none';
    button.style.borderRadius = '15px';
    button.style.cursor = 'pointer';
    button.style.fontSize = '14px';
    button.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    button.style.transition = 'background-color 0.3s ease, transform 0.1s ease';
    button.onmouseover = () => { button.style.backgroundColor = '#d9d9d9'; };
    button.onmouseout = () => { button.style.backgroundColor = '#ebe6e6'; };
    button.onmousedown = () => { button.style.transform = 'scale(0.95)'; };
    button.onmouseup = () => { button.style.transform = 'scale(1)'; };
    button.addEventListener('click', openEdit);
    document.body.appendChild(button);
    console.log("Dynamically created Edit button added.");
}

// Function to dynamically create the Edit Iframe Container
function createEditIframeContainer() {
    if (document.getElementById('edit-container')) return;

    const container = document.createElement('div');
    container.id = 'edit-container';
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100vw';
    container.style.height = '100vh';
    container.style.zIndex = '2100';
    container.style.display = 'none';
    container.style.backgroundColor = 'rgba(0,0,0,0.1)';

    const iframe = document.createElement('iframe');
    iframe.id = 'edit-iframe';
    iframe.src = 'about:blank';
    iframe.title = 'Data Editor';
    iframe.style.height = '100%';
    iframe.style.width = '100%';
    iframe.style.border = '0px';
    iframe.style.display = 'block';

    container.appendChild(iframe);
    document.body.appendChild(container);
    console.log("Dynamically created Edit iframe container added.");
}

// Function to display an error message if data loading fails
function displayLoadError(message) {
     const container = document.querySelector('.container');
     if (container) {
         if (container.querySelector('.load-error-message')) return;
         const errorElement = document.createElement('p');
         errorElement.className = 'load-error-message';
         errorElement.style.color = 'red';
         errorElement.style.backgroundColor = '#ffebee';
         errorElement.style.border = '1px solid red';
         errorElement.style.padding = '15px';
         errorElement.style.margin = '20px';
         errorElement.style.borderRadius = '5px';
         errorElement.style.textAlign = 'center';
         errorElement.textContent = message;
         container.prepend(errorElement);
     } else {
         console.error("Could not find '.container' element to display load error.");
         alert(message);
     }
}


// --- Run Initialization on DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed");

    // Create UI elements dynamically first
    createEditButton();
    createEditIframeContainer();

    // Initialize static parts of the page
    initializeStaticContent(); // This now also ensures content containers exist
    adjustContainerMargin();

    // Load initial data from cache (if available)
    loadInitialData().then(() => {
        console.log("Initial data check/load from cache finished.");
        // Data is now ready if it was cached, otherwise subjects will load on demand.
    }).catch(error => {
        console.error("Error during initial data cache check:", error);
        // Even if cache check fails, proceed, lazy loading will attempt script tags
    });
});

// Adjust margin on resize as well
window.addEventListener('resize', adjustContainerMargin);

// --- END OF FILE abtyping.js ---