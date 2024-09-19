// Edit.js
let currentSubject = null;
let currentDataFile = null;
let currentSection = null;
let addButtonClickedCount = 0;
let editedQuestion = null;
let editedOptions = null;
let editedAnswer = null;
let editedSection = null;
let editingQuestionId = null;
let searchResultsOpen = false;
let searchTimeout = null;
let isModifyActive = false;
let editsudject = null;
let editedSectionab = null;
let imageReferences = [];
let formData = new FormData(); 
const addButton = document.getElementById("add-button");
const modifyButton = document.querySelector(".Modify");
const searchButton = document.querySelector(".btn-search");
const searchInput = document.querySelector(".input-search");
const searchResults = document.querySelector(".search-results");
const clearButton = document.querySelector(".btn-clear");
const searchBox = document.querySelector(".wrap-input-17");
const subjectDropdown = document.getElementById("subject-dropdown");
const urls = [
    'http://localhost:5500/',
    'http://localhost:3001/',
    'http://localhost:8080/'
  ];
  
searchResults.style.display = "none";
subjectDropdown.disabled = true;

window.addEventListener("message", ({ data: { subjectNames } = {} }) => {
    if (subjectNames) {
        const dropdown = document.getElementById("subject-dropdown");
        dropdown.innerHTML = `<option value="">Select Subject</option>${subjectNames.map(s => `<option value="${s}">${s}</option>`).join('')}`;
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const heading = document.querySelector(".heading-floating-edit .heading");
    const nav = document.querySelector("nav");
    const subjectDropdown = document.getElementById("subject-dropdown");
    const subjectSelection = document.querySelector(".subject-selection");
    const subjectLabel = subjectSelection.querySelector("label");

    const headingText = "Add & Modify";
    const navItemsText = ["(ক)", "(খ)", "MCQ"];
    const typingSpeed = 40;
    let subjectLabelTyped = false;

    function typeHeading() {
        typeText(heading, headingText, typingSpeed, typeNavItems);
    }

    function typeNavItems() {
        const navItems = nav.querySelectorAll("a");
        let i = 0;
        function typeNext() {
            if (i < navItems.length) {
                typeText(navItems[i], navItemsText[i], typingSpeed, () => {
                    i++;
                    typeNext();
                });
            }
        }
        typeNext();
    }

    function typeSubjectLabel() {
        if (!subjectLabelTyped) {
            subjectLabel.textContent = "";
            typeText(subjectLabel, "Subject select: ", typingSpeed);
            subjectLabelTyped = true;
        }
    }

    function adjustDropdownHeight() {
        const optionHeight = subjectDropdown.querySelector("option:checked")?.offsetHeight;
        if (optionHeight) subjectDropdown.style.height = `${optionHeight + 25}px`;
    }

    function typeDropdownOption() {
        const selectedOption = subjectDropdown.querySelector("option:checked");
        if (selectedOption) {
            const text = selectedOption.textContent;
            selectedOption.textContent = "";
            typeText(selectedOption, text, typingSpeed, adjustDropdownHeight);
        }
    }

    nav.querySelectorAll("a").forEach(item => {
        item.addEventListener("click", () => {
            subjectSelection.style.display = "block";
            typeSubjectLabel();
        });
    });

    subjectDropdown.addEventListener("change", typeDropdownOption);

    typeHeading();
});



  
function closeEdit() {
    window.parent.postMessage("closeEdit", "*");

    const addButton = document.getElementById("add-button");
    if (addButton.textContent === "Cancel Add") {
        addButton.click();
    }
    const modifyButton = document.querySelector(".Modify");
    if (modifyButton.classList.contains("active")) {
        modifyButton.click();
    }
    resetEverything();
    const form = document.getElementById("add-question-form-mcq");
    form.style.display = "none";
    const formAB = document.getElementById("add-question-form-ab");
    formAB.style.display = "none";
    const searchResults = document.querySelector(".search-results");
    searchResults.style.display = "none";
    const searchInput = document.querySelector(".input-search");
    searchInput.style.width = "50px";
    searchInput.style.borderRadius = "50%";
    searchInput.style.backgroundColor = "#fff";
    searchInput.style.borderBottom = "none";
    searchInput.value = "";
    clearButton.style.display = "none";

    const subjectDropdown = document.getElementById("subject-dropdown");
    subjectDropdown.selectedIndex = 0;

    const searchResultsContainer = document.querySelector(".search-results");
    searchResultsContainer.innerHTML = "";
    isModifyActive = false;
    addButton.textContent = "Add";

    resetAddForm();

    editedQuestion = null;
    editedOptions = null;
    editedAnswer = null;
    editingQuestionId = null;

    resetNavBar();
}

subjectDropdown.addEventListener("change", function () {
    const selectedSubject = this.value;
    window.parent.postMessage({ subjectName: selectedSubject }, "*");
    currentSubject = selectedSubject;

    const searchResultsContainer = document.querySelector(".search-results");
    searchResultsContainer.innerHTML = "";

    // Apply typing effect to headings
    const headingElement1 = document.getElementById("add-question-form-heading");
    const headingElement2 = document.getElementById("add-question-form-heading-ab");
    headingElement1.innerHTML = "";
    headingElement2.innerHTML = "";

    // Adjust typing speed as desired (e.g., 50ms per character)
    typeText(headingElement1, selectedSubject, 50);
    typeText(headingElement2, selectedSubject, 50);

    isModifyActive = false;
    
    if (searchInput.value.trim() !== "") performSearch();

    if (document.getElementById("add-question-form-ab").style.display === "block" &&
        selectedSubject && selectedSubject !== "Select Subject") {
        switchToAddFormMcq();
    }
});


const handleSearch = () => (clearSearchResults(), performSearch());

searchInput.addEventListener("input", handleSearch);
searchInput.addEventListener("click", () => !isModifyActive && handleSearch());
searchButton.addEventListener("click", handleSearch);
clearButton.addEventListener("click", () => {
    // Stop typing effects and clear elements
    currentTypingElements.forEach(({ typingInterval }) => clearInterval(typingInterval));
    currentTypingElements = [];

    // Clear search input and results
    searchInput.value = "";
    document.querySelector(".search-results").innerHTML = "";
});



function clearSearchResults() {
    const searchResultsContainer = document.querySelector(".search-results");
    searchResultsContainer.innerHTML = "";
}

function showSearchResults() {
    searchResults.style.display = "block";
    searchInput.style.width = "220px";
    searchInput.style.borderRadius = "0px";
    searchInput.style.backgroundColor = "transparent";
    searchInput.style.borderBottom = "1px solid rgba(255, 255, 255, 0.5)";
}
let currentTypingElements = []; // Array to keep track of elements currently being typed






function performSearch() {
    searchResultsOpen = true;
    showSearchResults();
    resetUploadedImages();
    const searchTerm = searchInput.value.trim().toLowerCase();
    const searchResultsContainer = document.querySelector(".search-results");

    // Clear any ongoing typing effects
    currentTypingElements.forEach(element => {
        if (element.typingInterval) {
            clearInterval(element.typingInterval);
            element.typingInterval = null;
        }
    });
    currentTypingElements = []; // Reset the array

    if (searchTerm === "") {
        searchResultsContainer.innerHTML = "";
        return;
    }

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        searchResultsContainer.innerHTML = "";

        fetchData(currentDataFile)
            .then(data => processAndDisplayResults(data, searchTerm, currentDataFile === "ab.json", currentSection))
            .catch(error => console.error(`Error fetching ${currentDataFile}:`, error));
    }, 100);
}

// Helper function to replace different line breaks with <br> tags


function convertNewlinesToHtml(text) {
    return text.replace(/\n/g, '<br>');
}

function displaySearchResults(matchingQuestions, isAbJson) {
    const container = document.querySelector(".search-results");
    container.innerHTML = "";

    if (matchingQuestions.length === 0) {
        typeText(container, "<p>No matching questions found.</p>", 30);
        currentTypingElements.push(container); // Track this element
        return;
    }

    function typeNextQuestion(index) {
        if (index >= matchingQuestions.length) return;

        const { section, question, questionData, index: questionIndex } = matchingQuestions[index];
        const questionElement = document.createElement("div");
        questionElement.className = "search-result";
        questionElement.dataset.section = section;
        questionElement.dataset.questionIndex = questionIndex;

        let content = "";
        if (isAbJson) {
            questionElement.dataset.subject = currentSubject;
            content = `
                <h4>${currentSubject}</h4>
                <h5>${convertNewlinesToHtml(processTextWithImages(questionData.question))}</h5>
                <h6>Explanation: ${convertNewlinesToHtml(processTextWithImages(questionData.explanation))}</h6>
                <button class="edit-button" onclick="editQuestion(this, true)">Modify</button>
                <button class="delete-button" onclick="deleteQuestion(this, true)">Delete</button>
            `;
            resetUploadedImages(); // Reset images for AB JSON
        } else {
            content = `
                <h4>${section}</h4>
                <h5>${convertNewlinesToHtml(processTextWithImages(question.question))}</h5>
                <ul>${question.options.map(option => `<li>${convertNewlinesToHtml(processTextWithImages(option))}</li>`).join("")}</ul>
                <h6>Answer: ${convertNewlinesToHtml(processTextWithImages(question.correctAnswer))}</h6>
                <button class="edit-button" onclick="editQuestion(this, false)">Modify</button>
                <button class="delete-button" onclick="deleteQuestion(this)">Delete</button>
            `;
            resetUploadedImages(); // Reset images for non-AB JSON
        }

        questionElement.innerHTML = content;
        container.appendChild(questionElement);

        typeText(questionElement, content, 2.5, () => {
            typeNextQuestion(index + 1);
            addImageZoomListeners(questionElement); // Add zoom listeners
        });

        currentTypingElements.push(questionElement); // Track this element
    }

    typeNextQuestion(0);
}




  async function fetchData(file) {
    for (const baseUrl of urls) {
      try {
        const response = await fetch(`${baseUrl}${file}`);
        if (!response.ok) {
          console.warn(`Failed to fetch from ${baseUrl}${file}. Status: ${response.status}`);
          continue; // Try the next URL
        }
        const data = await response.json();
        console.log(`Data successfully fetched from ${baseUrl}${file}`);
        return data;
      } catch (error) {
        console.error(`Error fetching from ${baseUrl}${file}:`, error);
      }
    }
    
    // If all URLs fail, throw an error
    throw new Error('Failed to fetch data from all provided URLs.');
  }
  

function processAndDisplayResults(data, searchTerm, isAbJson = false, section = "") {
    const searchResultsContainer = document.querySelector(".search-results");
    const normalizedSearchTerm = searchTerm.trim().toLowerCase().replace(/\s+/g, ' '); // Normalize search term
    let matchingQuestions = [];

    if (isAbJson) {
        const sectionData = data[currentSubject]?.[section] || [];
        matchingQuestions = sectionData
            .map((q, index) => {
                const normalizedQuestion = q.question.trim().toLowerCase().replace(/\s+/g, ' '); // Normalize question text
                return {
                    section,
                    questionData: q,
                    matchLength: normalizedQuestion.length - normalizedSearchTerm.length,
                    index,
                    normalizedQuestion
                };
            })
            .filter(q => q.normalizedQuestion.includes(normalizedSearchTerm));
    } else {
        const sectionData = data.sections?.find(s => s.section?.toLowerCase() === currentSubject.toLowerCase())?.questions || [];
        matchingQuestions = sectionData
            .map((q, index) => {
                const normalizedQuestion = q.question.trim().toLowerCase().replace(/\s+/g, ' '); // Normalize question text
                return {
                    section: currentSubject,
                    question: q,
                    matchLength: normalizedQuestion.length - normalizedSearchTerm.length,
                    index,
                    normalizedQuestion
                };
            })
            .filter(q => q.normalizedQuestion.includes(normalizedSearchTerm));
    }

    matchingQuestions.sort((a, b) => a.matchLength - b.matchLength);
    displaySearchResults(matchingQuestions, isAbJson);
}


function processTextWithImages(text, isEditMode = false) {
    if (isEditMode) {
        // In edit mode, return the original text with image links
        return text.replace(/<div class="image-container"><img src="([^"]+)"[^>]+><\/div>/g, '($1)');
    }

    // For display mode, replace image links with image elements
    return text.replace(/\(image\/[^\)]+\)/g, match => {
        const imgSrc = match.slice(1, -1); // Remove surrounding parentheses
        return `<div class="image-container"><img src="${imgSrc}" class="image-zoom" alt="Image"></div>`;
    });
}


  async function deleteQuestion(button, isAbJson = false) {
    const questionElement = button.parentElement;
    let questionText = questionElement.querySelector('h5')?.innerHTML || ""; // Use innerHTML to include HTML tags
    const subject = questionElement.querySelector('h4')?.textContent?.trim() || null;
    const sectionName = questionElement.dataset.section;
    const questionIndex = questionElement.dataset.questionIndex;
  
    // Convert HTML image tags to (image/image.png) format
    questionText = processTextWithImages(questionText, true); // Use isEditMode = true for text format
  
    if (!confirm("Are you sure you want to delete this question?")) return;
  
    const data = isAbJson 
        ? { subject, section: sectionName, questionIndex, questionText }
        : { questionText, section: sectionName, questionIndex };
  
    const endpoint = isAbJson ? 'ab.json' : 'questions.json';
  
    async function tryDelete(urls) {
      for (const baseUrl of urls) {
        try {
          const response = await fetch(`${baseUrl}${endpoint}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
  
          if (response.ok) {
            questionElement.remove();
            isModifyActive = false;
           performSearch();
            return;
          } else {
            console.warn(`Failed to delete from ${baseUrl}${endpoint}. Status: ${response.status}`);
          }
        } catch (error) {
          console.error(`Error deleting from ${baseUrl}${endpoint}:`, error);
        }
      }
  
      throw new Error('Failed to delete question from all provided URLs.');
    }
  
    try {
      await tryDelete(urls);
    } catch (error) {
      console.error('Error:', error);
    }
  }
  

function addImageZoomListeners(container) {
    container.querySelectorAll('.image-container').forEach(imgContainer => {
        const img = imgContainer.querySelector('.image-zoom');
        let currentZoom = 1, isDragging = false, startX, startY, scrollLeft, scrollTop;
        let lastTouchTime = 0, touchCount = 0, touchTimer, initialDistance = 0;
        const zoomLevels = [1, 1.5, 2, 2.5, 3];
        let zoomIndex = 0;

        function updatePosition() {
            const rect = imgContainer.getBoundingClientRect();
            const imgRect = img.getBoundingClientRect();
            imgContainer.scrollLeft = Math.max(0, Math.min(imgContainer.scrollLeft, imgRect.width - rect.width));
            imgContainer.scrollTop = Math.max(0, Math.min(imgContainer.scrollTop, imgRect.height - rect.height));
        }

        function handleZoom(e, touch = false) {
            e.preventDefault();
            const oldZoom = currentZoom;
            currentZoom = zoomLevels[zoomIndex = (zoomIndex + 1) % zoomLevels.length];
            const rect = imgContainer.getBoundingClientRect();
            const x = touch ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
            const y = touch ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
            img.style.transformOrigin = `${0*x}px ${0*y}px`;
            img.style.transform = `scale(${currentZoom})`;
            imgContainer.style.overflow = currentZoom > 1 ? 'auto' : 'hidden';
            if (currentZoom > oldZoom) {
                imgContainer.scrollLeft += x * (currentZoom - oldZoom);
                imgContainer.scrollTop += y * (currentZoom - oldZoom);
            }
            updatePosition();
        }

        function resetZoom() {
            currentZoom = zoomLevels[zoomIndex = 0];
            img.style.transform = `scale(1)`;
            imgContainer.style.overflow = 'hidden';
            updatePosition();
        }

        function startDrag(e, touch = false) {
            if (currentZoom > 1) {
                isDragging = true;
                imgContainer.classList.add('dragging');
                startX = touch ? e.touches[0].pageX : e.pageX;
                startY = touch ? e.touches[0].pageY : e.pageY;
                scrollLeft = imgContainer.scrollLeft;
                scrollTop = imgContainer.scrollTop;
            }
        }

        function drag(e, touch = false) {
            if (!isDragging) return;
            e.preventDefault();
            const x = touch ? e.touches[0].pageX : e.pageX;
            const y = touch ? e.touches[0].pageY : e.pageY;
            imgContainer.scrollLeft = scrollLeft - (x - startX);
            imgContainer.scrollTop = scrollTop - (y - startY);
            updatePosition();
        }

        function endDrag() {
            isDragging = false;
            imgContainer.classList.remove('dragging');
        }

        // Mouse events
        img.addEventListener('dblclick', handleZoom);
        imgContainer.addEventListener('mousedown', e => startDrag(e));
        imgContainer.addEventListener('mousemove', e => drag(e));
        imgContainer.addEventListener('mouseup', endDrag);
        imgContainer.addEventListener('mouseleave', endDrag);

        // Touch events
        imgContainer.addEventListener('touchstart', e => {
            const now = Date.now();
            if (now - lastTouchTime < 500) touchCount++;
            else touchCount = 1;
            lastTouchTime = now;
            clearTimeout(touchTimer);
            touchTimer = setTimeout(() => {
                if (touchCount === 2) handleZoom(e, true);
                else if (touchCount === 3) resetZoom();
                touchCount = 0;
            }, 500);
            if (e.touches.length === 1) startDrag(e, true);
            else if (e.touches.length === 2) {
                initialDistance = Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                );
            }
        });

        imgContainer.addEventListener('touchmove', e => {
            if (e.touches.length === 1) drag(e, true);
            else if (e.touches.length === 2) {
                const currentDistance = Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                );
                const zoomFactor = currentDistance / initialDistance;
                currentZoom = Math.min(Math.max(1, currentZoom * zoomFactor), 3);
                zoomIndex = zoomLevels.findIndex(z => z >= currentZoom);
                img.style.transform = `scale(${currentZoom})`;
                imgContainer.style.overflow = currentZoom > 1 ? 'auto' : 'hidden';
                updatePosition();
            }
        });

        imgContainer.addEventListener('touchend', endDrag);
    });
}

document.addEventListener('DOMContentLoaded', () => addImageZoomListeners(document));

function showSection(element, dataFile, section, isModifyActive = true) {
    setActive(element, dataFile);
    currentSection = section;

    const formMCQ = document.getElementById("add-question-form-mcq");
    if (formMCQ.style.display === "block") {
        switchToAddFormAB();
        if (isModifyActive) {
            isModifyActive = false;
        }
    }

    const searchTerm = searchInput.value.trim();
    if (searchTerm !== "") {
        performSearch();
        clearSearchResults();
    }
}
function showSectionA(element, dataFile, section) {
    showSection(element, dataFile, section, false);
}

function showSectionB(element, dataFile, section) {
    showSection(element, dataFile, section);
}



// Helper function to normalize newline characters

async function uploadImages(files, imageReferences) {
    const formData = new FormData();
    const imageMap = new Map(files.map(file => [file.name, file]));

    imageReferences.forEach(imageName => {
        const file = imageMap.get(imageName);
        if (file) formData.append('images[]', file);
    });
    for (const baseUrl of urls) {
        try {
          const response = await fetch(`${baseUrl}upload`, {
            method: 'POST',
            body: formData,
        });
        if (!response.ok) throw new Error('Image upload failed');
        const result = await response.json();
        console.log('Image upload successful:', result);
    } catch (error) {
        console.error('Error during image upload:', error);
    }
 }
}

async function editQuestion(button, isAbJson = false) {
    const questionElement = button.parentElement;
    const section = questionElement.dataset.section;
    const subject = questionElement.querySelector("h4")?.textContent || null;
    const questionIndex = questionElement.dataset.questionIndex;

    console.log("Editing question at index:", questionIndex, "isAbJson:", isAbJson);

    currentTypingElements.forEach(({ typingInterval }) => clearInterval(typingInterval));
    currentTypingElements = [];

    // Hide all other search results
    document.querySelectorAll(".search-result").forEach(result => {
        if (result !== questionElement) result.style.display = "none";
    });

    // Hide current question view
    questionElement.querySelectorAll("h4, h5, h6, ul, button").forEach(el => el.style.display = "none");

    // Create editing elements
    const createEditElement = (className, tagName = "textarea") => {
        const el = document.createElement(tagName);
        el.classList.add(className);
        return el;
    };

    const normalizeAndExtractText = (text) => {
        if (!text) return '';
        return text
            .replace(/\r\n|\r/g, '\n')          // Normalize \r\n and \r to \n
            .replace(/<br\s*\/?>/gi, '\n')     // Replace <br> tags with \n
            .replace(/\(image\/([^)]*)\)/g, '($1)'); // Remove image prefix
    };

    function addImagePrefix(text) {
        if (!text) return '';
        return text.replace(/\(([^/][^)]+)\)/g, '(image/$1)');
    }

    const sectionDisplay = document.createElement("div");
    sectionDisplay.classList.add("section-display");

    const editInput = createEditElement("edit-input");
    const saveButton = createEditElement("save-button", "button");
    saveButton.textContent = "Save";
    const cancelButton = createEditElement("cancel-button", "button");
    cancelButton.textContent = "Cancel";

    // Create file input for image uploads
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.id = "upload-question-images";
    fileInput.multiple = true;
    fileInput.classList.add("image-upload");

    // Create message div for image upload instructions
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("image-upload-message");
    messageDiv.id = "image-placeholder-message";
    messageDiv.style.display = "none";

    // Append elements to questionElement
    questionElement.append(fileInput, messageDiv);

    // Initialize handleImageUploads
    try {
        handleImageUploads(".image-upload", ".image-upload-message");
    } catch (error) {
        console.error("Error initializing handleImageUploads:", error);
    }

    if (isAbJson) {
        // Handle ab.json format
        const editExplanationInput = createEditElement("edit-explanation-input");

        sectionDisplay.textContent = `${subject}`;

        let processedQuestionText = processTextWithImages(questionElement.querySelector("h5").innerHTML, true);
        let processedExplanationText = processTextWithImages(questionElement.querySelector("h6").innerHTML, true).replace(/^Explanation:\s*/, "");

        editInput.value = normalizeAndExtractText(processedQuestionText);
        editExplanationInput.value = normalizeAndExtractText(processedExplanationText);

        questionElement.append(sectionDisplay, editInput, fileInput, messageDiv, editExplanationInput, saveButton, cancelButton);

        saveButton.addEventListener("click", async () => {
            let newQuestion = normalizeAndExtractText(editInput.value.trim());
            let newExplanation = normalizeAndExtractText(editExplanationInput.value.trim());
            if (newQuestion.length === 0 || newExplanation.length === 0) {
                alert("Question and explanation cannot be empty.");
                return;
            }
            isModifyActive = false;
            const imageReferences = [
                ...extractImageReferences(newQuestion),
                ...extractImageReferences(newExplanation)
            ];

            // Prefix image references
            newQuestion = addImagePrefix(newQuestion);
            newExplanation = addImagePrefix(newExplanation);

            if (imageFiles.length > 0) {
                try {
                    await uploadImages(imageFiles, imageReferences);
                    console.log("Images uploaded successfully.");
                } catch (error) {
                    console.error("Error during image upload:", error);
                    alert("Error uploading images. Please try again.");
                    return;
                }
            }

            const updatedData = { 
                subject, 
                section, 
                newQuestion, 
                newExplanation, 
                questionIndex,
            };
            try {
                saveButton.disabled = true;
                await sendDataToServer(updatedData, "PUT");
                performSearch();
            } catch (error) {
                console.error("Error during save operation:", error);
            } finally {
                saveButton.disabled = false;
            }
        });
    } else {
        // Handle questions.json format
        const sectionName = questionElement.querySelector("h4").textContent;
        const questionText = normalizeAndExtractText(processTextWithImages(questionElement.querySelector("h5").innerHTML, true));
        const options = Array.from(questionElement.querySelectorAll("li")).map(li => normalizeAndExtractText(processTextWithImages(li.innerHTML, true)));
        const answer = normalizeAndExtractText(processTextWithImages(questionElement.querySelector("h6").innerHTML, true)).replace(/^Answer:\s*/, "");

        sectionDisplay.textContent = sectionName;
        editInput.value = questionText;

        const editOptionsList = document.createElement("ul");
        options.forEach(option => {
            const optionItem = document.createElement("li");
            const optionInput = createEditElement("option-input");
            optionInput.value = option;
            optionItem.appendChild(optionInput);
            editOptionsList.appendChild(optionItem);
        });

        const editAnswerInput = createEditElement("edit-answer-input");
        editAnswerInput.value = answer;

        questionElement.append(sectionDisplay, editInput, fileInput, messageDiv, editOptionsList, editAnswerInput, saveButton, cancelButton);

        saveButton.addEventListener("click", async () => {
            let newQuestion = normalizeAndExtractText(editInput.value.trim());
            let newOptions = Array.from(editOptionsList.querySelectorAll("textarea")).map(input => normalizeAndExtractText(input.value.trim()));
            let newAnswer = normalizeAndExtractText(editAnswerInput.value.trim());
            if (newQuestion.length === 0 || newOptions.some(option => option.length === 0) || newAnswer.length === 0) {
                alert("Please fill in all fields.");
                return;
            }
            isModifyActive = false;
            const imageReferences = [
                ...extractImageReferences(newQuestion),
                ...newOptions.flatMap(option => extractImageReferences(option)),
                ...extractImageReferences(newAnswer)
            ];

            // Prefix image references
            newQuestion = addImagePrefix(newQuestion);
            newOptions = newOptions.map(option => addImagePrefix(option));
            newAnswer = addImagePrefix(newAnswer);

            if (imageFiles.length > 0) {
                try {
                    await uploadImages(imageFiles, imageReferences);
                    console.log("Images uploaded successfully.");
                } catch (error) {
                    console.error("Error during image upload:", error);
                    alert("Error uploading images. Please try again.");
                    return;
                }
            }

            const questionData = {
                newQuestion,
                newOptions,
                newAnswer,
                questionIndex,
                section: sectionName,
            };
            try {
                saveButton.disabled = true;
                await sendDataToServer(questionData, "PUT");
                performSearch();
            } catch (error) {
                console.error("Error during save operation:", error);
            } finally {
                saveButton.disabled = false;
            }
        });
    }

    cancelButton.addEventListener("click", () => {
        isModifyActive = false;
        document.querySelectorAll(".search-result").forEach(result => result.style.display = "block");
        questionElement.querySelectorAll("h4, h5, h6, ul, button").forEach(el => el.style.display = "block");
        performSearch();
    });
    resetUploadedImages();
    editInput.focus();
    isModifyActive = true;
}


// Function to reset uploaded images
function resetUploadedImages() {
    imageReferences = [];

    // Clear formData
    formData = new FormData();
    // Clear file inputs
    const fileInputSelectors = ['#upload-question-images', '#upload-ab-images'];
    fileInputSelectors.forEach(selector => {
        const fileInput = document.querySelector(selector);
        if (fileInput) fileInput.value = '';
    });
    
    // Hide placeholder messages
    const messageDivSelectors = ['#image-placeholder-message', '#image-placeholder-message-ab'];
    messageDivSelectors.forEach(selector => {
        const messageDiv = document.querySelector(selector);
        if (messageDiv) messageDiv.style.display = 'none';
    });
    
    // Reset global variables
    imageFiles = [];
    image = [];
    typingComplete = false;
    existingMessage = '';
    currentActivePlaceholder = null;
    buttonsEnabled = false;
    
    // Clear message text
    
    // Clear image maps and placeholders
    imageMap.clear();
    uploadedImageNames.clear();
    
    // Clear active image container
    if (activeImageContainer) {
        activeImageContainer.innerHTML = '';
        activeImageContainer = null;
    }
    
    // Remove highlighted placeholder buttons
    document.querySelectorAll('.highlighted-placeholder').forEach(button => button.remove());
    
    // Clear and hide message div
    const messageDiv = document.querySelector('#message-div');
    if (messageDiv) {
        messageDiv.innerHTML = '';
        messageDiv.style.display = 'none';
    }
    
    // Clear textarea
    const textarea = document.querySelector('#textarea-selector');
    if (textarea) textarea.value = '';
    
    // Reset file input
    const fileInput = document.querySelector('#file-input');
    if (fileInput) fileInput.value = '';
    
    console.log("Uploaded images, formData, and imageReferences have been reset.");
}

// Ensure this function returns a promise
  async function sendDataToServer(data, method) {
    for (const baseUrl of urls) {
      try {
        const response = await fetch(`${baseUrl}${currentDataFile}`, {
          method: method,
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(data)
        });
  
        if (response.ok) {
          return response.json();
        } else {
          console.warn(`Failed to send data to ${baseUrl}${currentDataFile}. Status: ${response.status}`);
        }
      } catch (error) {
        console.error(`Error sending data to ${baseUrl}${currentDataFile}:`, error);
      }
    }
  
    throw new Error('Failed to send data to all provided URLs.');
  }
  

// Utility function to extract image names from text
function extractImageReferences(text) {
    const regex = /\(([^)]+)\)/g;
    let match;
    const images = [];
    while ((match = regex.exec(text)) !== null) {
        images.push(match[1]); // Get image name without parentheses
    }
    return images;
}




addButton.addEventListener("click", function () {
    addButtonClickedCount++;
    resetAddForm()
    const formMCQ = document.getElementById("add-question-form-mcq");
    const formAB = document.getElementById("add-question-form-ab");
    const searchResults = document.querySelector(".search-results");
    const searchInput = document.querySelector(".wrap-input-17");

    if (currentDataFile === "questions.json") {
        if (addButtonClickedCount % 2 === 1) {
            if (currentSubject) {
                formMCQ.style.display = "block";

                searchResults.style.display = "none";
                searchInput.style.display = "none";
                searchInput.value = "";
                clearButton.style.display = "none";
                modifyButton.classList.remove("active");
                clearSearchResults();
                this.textContent = "Cancel Add";
                resetSearchBox();
                resetUploadedImages();
                isModifyActive = false;
            } else {
                alert("Please select a subject first.");
                searchInput.value = "";
                resetSearchBox();
                isModifyActive = false;
            }
        } else {
            formMCQ.style.display = "none";
            this.textContent = "Add";
            clearButton.style.display = "none";
            modifyButton.classList.remove("active");
            searchResults.style.display = "none";
            clearSearchResults();
            searchInput.style.display = "none";
            searchInput.value = "";
            resetSearchBox();
            resetUploadedImages();
            isModifyActive = false;
        }
    } else if (currentDataFile === "ab.json") {
        if (addButtonClickedCount % 2 === 1) {
            if (currentSubject && currentSection) {
                formAB.style.display = "block";
                searchResults.style.display = "none";
                searchInput.style.display = "none";
                searchInput.value = "";
                this.textContent = "Cancel Add";
                clearButton.style.display = "none";
                modifyButton.classList.remove("active");
                clearSearchResults();
                resetSearchBox();
                resetUploadedImages();
                isModifyActive = false;
            } else {
                alert("Please select a subject and section first.");
                searchInput.value = "";
                resetSearchBox();
                isModifyActive = false;
            }
        } else {
            formAB.style.display = "none";
            this.textContent = "Add";
            searchResults.style.display = "none";
            searchInput.style.display = "none";
            searchInput.value = "";
            clearButton.style.display = "none";
            modifyButton.classList.remove("active");
            clearSearchResults();
            resetSearchBox();
            resetUploadedImages();
            isModifyActive = false;
        }
    }
});

function switchToAddFormAB() {
    const formMCQ = document.getElementById("add-question-form-mcq");
    const formAB = document.getElementById("add-question-form-ab");

    if (formMCQ.style.display === "block" && currentDataFile === "ab.json") {
        formMCQ.style.display = "none";
        resetAddForm()
        formAB.style.display = "block";
        isModifyActive = false;
    }
}

function switchToAddFormMcq() {
    const formMCQ = document.getElementById("add-question-form-mcq");
    const formAB = document.getElementById("add-question-form-ab");

    if (formAB.style.display === "block" && currentDataFile === "questions.json") {
        formAB.style.display = "none";
        resetAddForm()
        formMCQ.style.display = "block";
        isModifyActive = false;
    }
}

document.addEventListener("click", function () {
    if (document.getElementById("add-question-form-mcq").style.display === "block" && this.value !== "" && this.value !== "Select Subject") {
        switchToAddFormAB();
        isModifyActive = false;
    }
    if (document.getElementById("add-question-form-ab").style.display === "block" && this.value !== "" && this.value !== "Select Subject") {
        switchToAddFormMcq();
        isModifyActive = false;
    }
});

document.getElementById("cancel-add-question-mcq").addEventListener("click", function () {
    const form = document.getElementById("add-question-form-mcq");
    form.style.display = "none";
    isModifyActive = false;
    addButton.click();
    resetAddForm();
});

document.getElementById("cancel-add-question-ab").addEventListener("click", function () {
    const form = document.getElementById("add-question-form-ab");
    form.style.display = "none";
    isModifyActive = false;
    addButton.click();
    resetAddForm();
});
  let imageFiles = [];
    let typingComplete = false;
    let existingMessage = '';
    let imageMap = new Map();
    let uploadedImageNames = new Set();
    let activeImageContainer = null;
    let currentActivePlaceholder = null;
    let buttonsEnabled = false;
function handleImageUploads(fileInputSelector, messageSelector, typingSpeed = 25) {
    const fileInput = document.querySelector(fileInputSelector);
    const messageDiv = document.querySelector(messageSelector);
  

    if (!fileInput || !messageDiv) {
        console.error(`Element not found for selector: ${fileInputSelector} or ${messageSelector}`);
        return () => [];
    }
 
    function resetState() {
        typingComplete = false;
        existingMessage = '';
        activeImageContainer = null;
        currentActivePlaceholder = null;
        console.log('State reset for new upload session');
    }
 
   
    
    function typeMessage(messageText, callback) {
        typingComplete = false;
        messageDiv.style.display = 'block';
        messageDiv.innerHTML = '';
        typeText(messageDiv, messageText, typingSpeed, () => {
            typingComplete = true;
            if (callback) callback();
        });
    }

    function updateButtonStates() {
        document.querySelectorAll('.highlighted-placeholder').forEach(button => {
            button.disabled = !buttonsEnabled;
        });
        console.log('Buttons ' + (buttonsEnabled ? 'enabled' : 'disabled'));
    }

    function startTyping() {
        buttonsEnabled = false;
        updateButtonStates();
    }

    fileInput.addEventListener('change', event => {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;

        

        let imageUploaded = false;
        const imagePlaceholders = [];

        files.forEach(file => {
            if (file.type.startsWith('image/')) {
                if (!imageUploaded) {
                    resetState(); // Only reset state when the first image is processed
                    imageUploaded = true;
                }

                const sanitizedFileName = file.name.replace(/\s+/g, '_');

                if (uploadedImageNames.has(sanitizedFileName)) {
                    alert('This image has already been uploaded.');
                    return;
                }

                uploadedImageNames.add(sanitizedFileName);

                const reader = new FileReader();

                reader.onload = function(e) {
                    const imgPlaceholder = `(${sanitizedFileName})`;
                    
                    imagePlaceholders.push(imgPlaceholder);
                    imageMap.set(imgPlaceholder, e.target.result);
                    console.log('Image added to map:', imgPlaceholder, e.target.result.substring(0, 50) + '...');

                    const currentPlaceholders = Array.from(imageMap.keys())
                        .map(ph => `<button class="highlighted-placeholder" data-placeholder="${ph}" aria-label="Show image ${ph}" disabled>${ph}</button>`)
                        .join(', ');

                    const messageText = `Put this text = <br> ${currentPlaceholders} <br> <strong>where you want to add the image</strong>`;

                    if (!typingComplete) {
                        existingMessage = messageText;
                        typeMessage(messageText, () => {
                            setupButtonListeners();
                            buttonsEnabled = true;
                            updateButtonStates();
                        });
                    } else {
                        const newPlaceholderText = `<button class="highlighted-placeholder" data-placeholder="${imgPlaceholder}" aria-label="Show image ${imgPlaceholder}" disabled>${imgPlaceholder}</button>`;
                        let updatedMessage;
                        if (existingMessage.includes('<strong>where you want to add the image</strong>')) {
                            updatedMessage = existingMessage.replace(/<strong>where you want to add the image<\/strong>/, ` ${newPlaceholderText} <br> <strong>where you want to add the image</strong>`);
                        } else {
                            updatedMessage = existingMessage.replace(/<br>$/, ` ${newPlaceholderText} <br>`);
                        }
                        startTyping();
                        typeMessage(updatedMessage, () => {
                            setupButtonListeners();
                            buttonsEnabled = true;
                            updateButtonStates();
                        });
                        existingMessage = updatedMessage;
                    }
                };

                reader.readAsDataURL(file);
                imageFiles.push(new File([file], sanitizedFileName, { type: file.type }));
            } else {
                alert('Please upload only image files.');
            }
        });

        if (!imageUploaded) {
            fileInput.value = ''; // Clear the file input if no valid images were uploaded
        }
    });

    function setupButtonListeners() {
        document.querySelectorAll('.highlighted-placeholder').forEach(button => {
            button.removeEventListener('click', handleButtonClick);
            button.addEventListener('click', handleButtonClick);
        });
        console.log('Button listeners set up');
    }

    function handleButtonClick(event) {
        console.log('Button clicked, buttonsEnabled:', buttonsEnabled);
        if (!buttonsEnabled) return;
    
        const placeholder = this.getAttribute('data-placeholder');
        const imageSrc = imageMap.get(placeholder);
    
        console.log('Button clicked:', placeholder);
        console.log('Image source:', imageSrc ? imageSrc.substring(0, 50) + '...' : 'not found');
    
        if (!imageSrc) {
            console.error('Image source not found for placeholder:', placeholder);
            return;
        }
    
        // Copy placeholder text to clipboard
        navigator.clipboard.writeText(placeholder).then(() => {
            console.log(`${placeholder} Copied!`);
    
            // Create and show the popup message
            const popupMessage = document.createElement('div');
            popupMessage.innerText = `${placeholder} Copied!`;
            popupMessage.style.position = 'fixed';
            popupMessage.style.bottom = '25px';
            popupMessage.style.right = '15px';
            popupMessage.style.backgroundColor = '#4CAF50';
            popupMessage.style.color = '#fff';
            popupMessage.style.padding = '5px 10px';
            popupMessage.style.borderRadius = '5px';
            popupMessage.style.boxShadow = '0 0 10px rgba(0,0,0,0.2)';
            popupMessage.style.zIndex = '1000';
            popupMessage.style.fontSize = '12px';
            document.body.appendChild(popupMessage);
    
            // Remove the popup after 3 seconds
            setTimeout(() => {
                document.body.removeChild(popupMessage);
            }, 750);
    
        }).catch(err => {
            console.error('Failed to copy placeholder:', err);
        });
    
        if (placeholder === currentActivePlaceholder) {
            this.classList.remove('active');
            if (activeImageContainer) {
                activeImageContainer.innerHTML = '';
            }
            currentActivePlaceholder = null;
        } else {
            document.querySelectorAll('.highlighted-placeholder').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
    
            // If the activeImageContainer doesn't exist yet, create it inside the messageDiv
            if (!activeImageContainer) {
                activeImageContainer = document.createElement('div');
                activeImageContainer.id = 'active-image-container';
                activeImageContainer.style.position = 'relative';  // Make sure it's positioned relative
                activeImageContainer.style.overflow = 'hidden';    // Prevent image overflow
                activeImageContainer.style.width = '100%';         // Ensure it takes up the full width
                activeImageContainer.style.maxHeight = '400px';    // Limit the max height
               
                messageDiv.appendChild(activeImageContainer);      // Append to the message div
            }
    
            // Clear out the old content if any
            activeImageContainer.innerHTML = '';
    
            // Create the image container and image element
            const imgContainer = document.createElement('div');
            imgContainer.classList.add('image-container');
            imgContainer.style.textAlign = 'center';  // Ensure the image is centered
    
            const newImageElement = document.createElement('img');
            newImageElement.src = imageSrc;
            newImageElement.classList.add('image-zoom');
            newImageElement.style.maxWidth = '100%';    // Ensure image doesn't overflow
            newImageElement.style.maxHeight = '100%';   // Ensure image doesn't overflow
            newImageElement.style.marginTop = '7.5px';   // Add margin for spacing
    
            // Append the image to the container
            imgContainer.appendChild(newImageElement);
            activeImageContainer.appendChild(imgContainer);
    
            console.log('Image element created and appended');
    
            currentActivePlaceholder = placeholder;
            setupZoomListeners(imgContainer, newImageElement);
        }
    }
    

    function setupZoomListeners(container, img) {
        let currentZoom = 1, isDragging = false, startX, startY, scrollLeft, scrollTop;
        let lastTouchTime = 0, touchCount = 0, touchTimer, initialDistance = 0;
        const zoomLevels = [1, 1.5, 2, 2.5, 3];
        let zoomIndex = 0;

        function updatePosition() {
            const rect = container.getBoundingClientRect();
            const imgRect = img.getBoundingClientRect();
            container.scrollLeft = Math.max(0, Math.min(container.scrollLeft, imgRect.width - rect.width));
            container.scrollTop = Math.max(0, Math.min(container.scrollTop, imgRect.height - rect.height));
        }

        function handleZoom(e, touch = false) {
            e.preventDefault();
            const oldZoom = currentZoom;
            currentZoom = zoomLevels[zoomIndex = (zoomIndex + 1) % zoomLevels.length];
            const rect = container.getBoundingClientRect();
            const x = touch ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
            const y = touch ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
            img.style.transformOrigin = `${x}px ${y}px`;
            img.style.transform = `scale(${currentZoom})`;
            container.style.overflow = currentZoom > 1 ? 'auto' : 'hidden';
            if (currentZoom > oldZoom) {
                container.scrollLeft += x * (currentZoom - oldZoom);
                container.scrollTop += y * (currentZoom - oldZoom);
            }
            updatePosition();
        }

        function resetZoom() {
            currentZoom = zoomLevels[zoomIndex = 0];
            img.style.transform = `scale(1)`;
            container.style.overflow = 'hidden';
            updatePosition();
        }

        function startDrag(e, touch = false) {
            if (currentZoom > 1) {
                isDragging = true;
                container.classList.add('dragging');
                startX = touch ? e.touches[0].pageX : e.pageX;
                startY = touch ? e.touches[0].pageY : e.pageY;
                scrollLeft = container.scrollLeft;
                scrollTop = container.scrollTop;
                e.preventDefault();
            }
        }

        function stopDrag() {
            isDragging = false;
            container.classList.remove('dragging');
        }

        container.addEventListener('mousedown', startDrag);
        container.addEventListener('mouseup', stopDrag);
        container.addEventListener('mousemove', e => {
            if (!isDragging) return;
            const x = e.pageX - startX;
            const y = e.pageY - startY;
            container.scrollLeft = scrollLeft - x;
            container.scrollTop = scrollTop - y;
            updatePosition();
        });

        container.addEventListener('dblclick', handleZoom);
        container.addEventListener('wheel', e => {
            e.preventDefault();
            if (e.deltaY < 0) {
                zoomIndex = Math.min(zoomIndex + 1, zoomLevels.length - 1);
            } else {
                zoomIndex = Math.max(zoomIndex - 1, 0);
            }
            handleZoom(e);
        });

        // Touch support for mobile devices
        container.addEventListener('touchstart', e => {
            if (e.touches.length === 2) {
                const touch1 = e.touches[0], touch2 = e.touches[1];
                initialDistance = Math.hypot(touch2.pageX - touch1.pageX, touch2.pageY - touch1.pageY);
            } else if (e.touches.length === 1) {
                if (e.timeStamp - lastTouchTime < 300) {
                    handleZoom(e, true);
                } else {
                    startDrag(e, true);
                }
                lastTouchTime = e.timeStamp;
            }
        });
        container.addEventListener('touchend', stopDrag);
        container.addEventListener('touchmove', e => {
            if (!isDragging) return;
            const x = e.touches[0].pageX - startX;
            const y = e.touches[0].pageY - startY;
            container.scrollLeft = scrollLeft - x;
            container.scrollTop = scrollTop - y;
            updatePosition();
        });
    }

    return () => imageFiles;
}


// Initialize image file handlers
const getMCQImageFiles = handleImageUploads('#upload-question-images', '#image-placeholder-message');
const getABImageFiles = handleImageUploads('#upload-ab-images', '#image-placeholder-message-ab');


function replacePlaceholdersWithFiles(text, imageMap) {
    // Ensure text is a string
    if (typeof text !== 'string') return text;

    return text.replace(/\(([^)]+)\)/g, (match, p1) => {
        // Check if the placeholder matches an image name in the imageMap
        if (imageMap.has(p1)) {
            return `${p1}`;
        }
        return match; // Return the original text if no image is found
    });
}


// Function to validate form inputs
function validateFormInputs(questionText, optionsText, answerText, explanationText, isMCQ) {
    function isFieldValid(field) {
        return field.trim() !== "" || /\(.*\.(?:gif|jpe?g|tiff?|png|webp|bmp|svg|ico|avif)\)/.test(field);
    }

    if (isMCQ) {
        return isFieldValid(questionText) && optionsText.every(isFieldValid) && isFieldValid(answerText);
    } else {
        return isFieldValid(questionText) && isFieldValid(explanationText);
    }
}


  
  function saveQuestion({ questionText, optionsText = [], answerText, explanationText, isMCQ, imageFiles }) {
    if (!validateFormInputs(questionText, optionsText, answerText, explanationText, isMCQ)) {
      return displayAlert("Please fill all required fields with either text or image placeholders.");
    }
  
    function formatImageFileNames(text) {
      return typeof text === 'string' ? text.replace(/\b([A-Za-z0-9_-]+\.(gif|jpe?g|tiff?|png|webp|bmp|svg|ico|avif))\b/g, "image/$1") : text;
    }
  
    const imageMap = new Map();
    imageFiles.forEach(file => imageMap.set(file.name.replace(/\s+/g, '_'), file));
  
    const formattedQuestionText = formatImageFileNames(questionText);
    const formattedOptionsText = optionsText.map(opt => formatImageFileNames(opt));
    const formattedAnswerText = formatImageFileNames(answerText);
    const formattedExplanationText = formatImageFileNames(explanationText);
  
    const referencedImages = new Set();
    function collectReferencedImages(text) {
      if (text && typeof text === 'string') {
        (text.match(/\(([^)]+)\)/g) || []).forEach(placeholder => {
          const imageName = placeholder.replace(/[()]/g, '');
          if (imageMap.has(imageName)) {
            referencedImages.add(imageName);
          }
        });
      }
    }
  
    collectReferencedImages(questionText);
    optionsText.forEach(opt => collectReferencedImages(opt));
    collectReferencedImages(answerText);
    collectReferencedImages(explanationText);
  
    const formData = new FormData();
    formData.append('question', formattedQuestionText);
  
    if (isMCQ) {
      formData.append('options', JSON.stringify(formattedOptionsText));
      formData.append('correctAnswer', formattedAnswerText);
      formData.append('section', currentSubject);
    } else {
      formData.append('explanation', formattedExplanationText);
      formData.append('subject', currentSubject);
      formData.append('section', currentSection);
    }
  
    imageFiles.forEach(file => {
      if (referencedImages.has(file.name.replace(/\s+/g, '_'))) {
        formData.append('images[]', file);
      }
    });
  
    // Determine the endpoint based on the question type
    const endpoint = isMCQ ? 'questions.json' : 'ab.json';
  
    async function fetchDataFromUrls(urls) {
      for (const baseUrl of urls) {
        try {
          const response = await fetch(`${baseUrl}${endpoint}`, { method: 'GET', mode: 'cors' });
          if (!response.ok) {
            console.warn(`Failed to fetch from ${baseUrl}${endpoint}. Status: ${response.status}`);
            continue;
          }
          return response.json();
        } catch (error) {
          console.error(`Error fetching from ${baseUrl}${endpoint}:`, error);
        }
      }
      throw new Error('Failed to fetch data from all provided URLs.');
    }
  
    async function postDataToUrl(url, formData) {
      try {
        const response = await fetch(`${url}${endpoint}`, { method: 'POST', body: formData, mode: 'cors' });
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        addButton.click();
        return response.json();
      } catch (error) {
        throw new Error(`Error posting data: ${error.message}`);
      }
    }
  
    fetchDataFromUrls(urls)
      .then(data => {
        let duplicateFound = false;
  
        function checkForDuplicate(existingQuestions) {
          existingQuestions.forEach(entry => {
            if (entry.question === formattedQuestionText) {
              duplicateFound = true;
            }
          });
        }
  
        if (!isMCQ) {
          if (data[currentSubject] && data[currentSubject][currentSection]) {
            checkForDuplicate(data[currentSubject][currentSection]);
          }
        } else {
          const sectionData = data.sections.find(section => section.section === currentSubject);
          if (sectionData) {
            checkForDuplicate(sectionData.questions);
          }
        }
  
        if (duplicateFound) {
          displayAlert('Duplicate question found. Please enter a new question.');
        } else {
          // POST data to each URL until one succeeds
          (async function tryPost() {
            for (const baseUrl of urls) {
              try {
                const result = await postDataToUrl(baseUrl, formData);
                console.log('Success:', result);
                resetAddForm();
                document.getElementById(isMCQ ? "add-question-form-mcq" : "add-question-form-ab").style.display = "none";
                return;
              } catch (error) {
                console.error('Error posting data:', error);
                // Try the next URL
              }
            }
            displayAlert('Failed to save question. Please try again later.');
          })();
        }
      })
      .catch(error => {
        console.error('Error fetching data:', error);
        displayAlert(`Failed to check existing questions. Error: ${error.message}`);
      });
  }
  



// Event listener for MCQ form
document.getElementById("save-new-question-mcq").addEventListener("click", () => {
    const questionText = document.getElementById("new-question-text").value;
    const optionsText = Array.from(document.querySelectorAll(".new-option-input")).map(input => input.value);
    const answerText = document.getElementById("new-answer-text").value;
    const imageFiles = getMCQImageFiles();
    
    saveQuestion({ questionText, optionsText, answerText, isMCQ: true, imageFiles });
});

// Event listener for AB form
document.getElementById("save-new-question-ab").addEventListener("click", () => {
    const questionText = document.querySelector(".question-input").value;
    const explanationText = document.querySelector(".edit-explanation-input").value;
    const imageFiles = getABImageFiles();
   
    saveQuestion({ questionText, explanationText, isMCQ: false, imageFiles });
});

// Function to display alert messages
function displayAlert(message) {
    alert(message); // Replace with a custom alert implementation if needed
}



// Function to reset the form
function resetAddForm() {
    // Reset text inputs
    const textInputSelectors = [
        '#new-question-text',
        '.new-option-input',
        '#new-answer-text',
        '.question-input',
        '.edit-explanation-input'
    ];
    textInputSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            el.value = '';
            el.style.Height = '50px';
        });
    });

    // Clear file inputs
    const fileInputSelectors = ['#upload-question-images', '#upload-ab-images'];
    fileInputSelectors.forEach(selector => {
        const fileInput = document.querySelector(selector);
        if (fileInput) fileInput.value = '';
    });

    // Hide placeholder messages
    const messageDivSelectors = ['#image-placeholder-message', '#image-placeholder-message-ab'];
    messageDivSelectors.forEach(selector => {
        const messageDiv = document.querySelector(selector);
        if (messageDiv) messageDiv.style.display = 'none';
    });

    // Reset global variables
    imageFiles = [];
    image = [];
    typingComplete = false;
    existingMessage = '';
    currentActivePlaceholder = null;
    buttonsEnabled = false;

    // Clear message text
    
    // Clear image maps and placeholders
    imageMap.clear();
    uploadedImageNames.clear();

    // Clear active image container
    if (activeImageContainer) {
        activeImageContainer.innerHTML = '';
        activeImageContainer = null;
    }

    // Remove highlighted placeholder buttons
    document.querySelectorAll('.highlighted-placeholder').forEach(button => button.remove());

    // Clear and hide message div
    const messageDiv = document.querySelector('#message-div');
    if (messageDiv) {
        messageDiv.innerHTML = '';
        messageDiv.style.display = 'none';
    }

    // Clear textarea
    const textarea = document.querySelector('#textarea-selector');
    if (textarea) textarea.value = '';

    // Reset file input
    const fileInput = document.querySelector('#file-input');
    if (fileInput) fileInput.value = '';

  

    console.log('Form reset complete');
}


  

modifyButton.addEventListener("click", function () {
    if (addButton.textContent === "Cancel Add") {
        addButton.click();
        this.classList.add("active");
        searchBox.style.display = "block";
        searchBox.classList.add('fade-in-up'); 
        clearSearchResults();
        resetSearchBox();
        resetAddForm();
        isModifyActive = false;
    } else if (this.classList.contains("active")) {
        this.classList.remove("active");
        searchBox.style.display = "none";
        searchResults.style.display = "none";
        clearSearchResults();
        clearButton.style.display = "none";
        resetSearchBox();
        isModifyActive = false;
    } else {
        if (currentDataFile) {
            this.classList.add("active");
            searchBox.style.display = "block";
            searchBox.classList.add('fade-in-up'); 
            clearSearchResults();
            resetSearchBox();
            resetAddForm();
            isModifyActive = false;
        } else {
            alert("Please select a subject first.");
        }
    }
});

function resetSearchBox() {
    searchInput.value = "";
    clearSearchResults();
    searchInput.style.width = "50px";
    searchInput.style.borderRadius = "50%";
    searchInput.style.backgroundColor = "#fff";
    searchInput.style.borderBottom = "none";
    isModifyActive = false;
}

searchInput.addEventListener("input", function () {
    clearButton.style.display = this.value.trim() ? "inline-block" : "none";
    if (!this.value.trim()) isModifyActive = false;
});

clearButton.addEventListener("click", function () {
    searchInput.value = "";
    isModifyActive = false;
    this.style.display = "none";
    clearSearchResults();
});

function setActive(element, dataFile) {
    const navItems = Array.from(document.querySelectorAll("nav a"));
    const itemIndex = navItems.indexOf(element);
    const itemWidth = element.offsetWidth;

    navItems.forEach(item => item.classList.remove("active"));
    element.classList.add("active");

    const animationBar = document.getElementById("animation-bar");
    animationBar.style.width = `${itemWidth}px`;
    animationBar.style.left = `${itemIndex * itemWidth}px`;

    currentDataFile = dataFile;
    if (searchInput.value.trim()) {
        performSearch();
        isModifyActive = false;
    }
    clearSearchResults();
}










function applyAutoResize(textarea) {
    textarea.style.cssText = `
            height: ${textarea.scrollHeight}px;
            min-height: 50px;
            overflow-y: hidden;
            resize: none; 
            `;

    textarea.addEventListener("input", function () {
        this.style.height = "auto";
        this.style.height = `${this.scrollHeight}px`; 
    });
}

const textareas = document.querySelectorAll("textarea");

textareas.forEach((textarea) => {
    applyAutoResize(textarea);
});

const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node.tagName === "TEXTAREA") {
                applyAutoResize(node);
            } else if (node.querySelectorAll) {
                node.querySelectorAll("textarea").forEach((textarea) => {
                    applyAutoResize(textarea);
                });
            }
        });
    });
});

observer.observe(document.body, { childList: true, subtree: true });

function stopTyping() {
    // Clear all typing intervals
    currentTypingElements.forEach(({ typingInterval }) => clearInterval(typingInterval));
    currentTypingElements = [];  // Reset the array to ensure no elements are typing
}

// Assuming you have a function to start typing, you should call stopTyping first to ensure no overlap
function startTyping() {
    stopTyping();  // Ensure no typing is active before starting
    // ... your typing logic here
}

document.addEventListener('DOMContentLoaded', function () {
    const editButtons = document.querySelectorAll(".edit-button");

    editButtons.forEach(button => {
        button.addEventListener("click", function() {
            stopTyping();  // Stop typing when edit button is clicked
            editQuestion(); // Call the edit question function
        });
    });

    // Ensure typing is stopped on load if needed
    stopTyping();
});

addButton.disabled = true;
modifyButton.disabled = true;
 


subjectDropdown.addEventListener("change", function () {
    if (this.value) {
        addButton.disabled = false;
        modifyButton.disabled = false;
        
    } else if (this.value === "") {
        addButton.disabled = true;
        modifyButton.disabled = true;
        searchBox.style.display = "none";
        searchResults.style.display = "none";
        clearButton.style.display = "none";
        addButtonClickedCount = 0;
        addButton.textContent = "Add";
        document.getElementById("add-question-form-mcq").style.display = "none";
        document.getElementById("add-question-form-ab").style.display = "none";
        modifyButton.classList.remove("active");
        resetAddForm();
        resetSearchBox();
        isModifyActive = false;
    }
});

const navItems = document.querySelectorAll("nav a");
navItems.forEach((item) => {
    item.addEventListener("click", () => {
        subjectDropdown.disabled = false;
        
    });
});



// Add a function to show the subject selection
function showSubjectSelection() {
    const subjectSelection = document.querySelector(".subject-selection");
    subjectSelection.style.display = "block";
    subjectDropdown.disabled = false; // Enable the dropdown
  }
  
  // Add the showSubjectSelection() call to the nav item click events

  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      showSubjectSelection(); 
     
    });
  });
  
 
function resetNavBar() {
    const navItems = document.querySelectorAll("nav a");
    navItems.forEach((item) => item.classList.remove("active"));

    const animationBar = document.getElementById("animation-bar");
    animationBar.style.width = "0px";
    animationBar.style.left = "0px";

    currentDataFile = null;
    currentSection = null;

    subjectDropdown.selectedIndex = 0;
    subjectDropdown.disabled = true;
}



// Function to toggle buttons' visibility and text
function toggleButtons(show) {
    const buttons = {
        addButton: document.getElementById("add-button"),
        modifyButton: document.querySelector(".Modify")
    };

    Object.keys(buttons).forEach(key => {
        const button = buttons[key];
        if (button) {
            button.style.display = show ? "inline-block" : "none";
            if (show) {
                button.classList.add('fade-in-up');
                typeText(button, key === 'addButton' ? "Add" : "Modify & Delete", 60);
            } else {
                button.innerHTML = "";
            }
        }
    });
}

// Initially hide the buttons
toggleButtons(false);

let buttonsVisible = false;


if (subjectDropdown) {
    subjectDropdown.addEventListener("change", function () {
        const showButtons = this.value !== "";
        if (showButtons !== buttonsVisible) {
            toggleButtons(showButtons);
            buttonsVisible = showButtons;
        }
    });
}


function resetEverything() {
    // Reset UI elements
    const subjectSelection = document.querySelector(".subject-selection");
    subjectSelection.style.display = "none";
    subjectDropdown.selectedIndex = 0;
    subjectDropdown.disabled = true;
    resetUploadedImages();

    // Reset buttons
    const addButton = document.getElementById("add-button");
    const modifyButton = document.querySelector(".Modify");
    addButton.textContent = "Add";
    addButtonClickedCount = 0;
    addButton.style.display = "none";
    modifyButton.style.display = "none";
    modifyButton.classList.remove("active");
    searchBox.style.display = "none";
    searchResults.style.display = "none";

    // Reset forms
    document.getElementById("add-question-form-mcq").style.display = "none";
    document.getElementById("add-question-form-ab").style.display = "none";
    resetAddForm();

    // Reset search
    const searchInput = document.querySelector(".input-search");
    searchInput.value = "";
    searchInput.style.width = "50px";
    searchInput.style.borderRadius = "50%";
    searchInput.style.backgroundColor = "#fff";
    searchInput.style.borderBottom = "none";
    clearButton.style.display = "none";
    searchResults.style.display = "none";
    clearSearchResults();

    // Reset state variables
    currentSubject = null;
    currentDataFile = null;
    currentSection = null;
    editedQuestion = null;
    editedOptions = null;
    editedAnswer = null;
    editingQuestionId = null;
    searchResultsOpen = false;
    isModifyActive = false;
    editsudject = null;
    editedSectionab = null;

    // Reset the navigation bar
    resetNavBar();
    typingInterval = null;
    
    // Reset the typing effects
    currentTypingElements.forEach(({ typingInterval }) => clearInterval(typingInterval));
    currentTypingElements = [];
    
    // Hide buttons
    toggleButtons(false);
    buttonsVisible = false;

    // Reload the page
    window.location.reload();
}




// Define the typeText function
function typeText(element, text, speed, callback) {
    let i = 0;
    let interval = null;

    // Function to type out text without breaking HTML tags
    function typeChar() {
        if (text[i] === '<') {
            // Find the end of the tag
            const closeIndex = text.indexOf('>', i);
            if (closeIndex !== -1) {
                i = closeIndex + 1;
            }
        }

        // Safely update innerHTML
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = text.substring(0, i);
        const safeText = tempDiv.innerHTML;

        // Update element with safe text
        element.innerHTML = safeText;
        i++;

        // Stop typing when text is fully typed
        if (i > text.length) {
            clearInterval(interval);
            element.typingInterval = null;
            if (callback) callback();
        }
    }

    // Clear any existing typing interval
    if (element.typingInterval) {
        clearInterval(element.typingInterval);
        element.typingInterval = null;
    }

    // Start typing interval
    interval = setInterval(typeChar, speed);
    element.typingInterval = interval;

    // Return a function to stop typing
    return () => {
        if (element.typingInterval) {
            clearInterval(element.typingInterval);
            element.typingInterval = null;
        }
    };
}


