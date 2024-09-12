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

const addButton = document.getElementById("add-button");
const modifyButton = document.querySelector(".Modify");
const searchButton = document.querySelector(".btn-search");
const searchInput = document.querySelector(".input-search");
const searchResults = document.querySelector(".search-results");
const clearButton = document.querySelector(".btn-clear");
const searchBox = document.querySelector(".wrap-input-17");
const subjectDropdown = document.getElementById("subject-dropdown");

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
    const typingSpeed = 15;
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

function displaySearchResults(matchingQuestions, isAbJson) {
    const container = document.querySelector(".search-results");
    container.innerHTML = "";

    if (matchingQuestions.length === 0) {
        typeText(container, "<h6>No matching questions found.</h6>", 30);
        currentTypingElements.push(container); // Track this element
        return;
    }

    function typeNextQuestion(index) {
        if (index >= matchingQuestions.length) return;

        const { section, question, questionData, index: questionIndex } = matchingQuestions[index];
        const questionElement = document.createElement("div");
        questionElement.className = "search-result";
        questionElement.dataset.section = section;

        container.appendChild(questionElement);

        let content = "";
        if (isAbJson) {
            questionElement.dataset.subject = currentSubject;
            questionElement.dataset.questionIndex = questionIndex;
            content = `
                <h4>${currentSubject}</h4>
                <h5>${processTextWithImages(questionData.question)}</h5>
                <p>Explanation: ${processTextWithImages(questionData.explanation)}</p>
                <button class="edit-button" onclick="editQuestion(this, true)">Modify</button>
                <button class="delete-button" onclick="deleteQuestion(this, true)">Delete</button>
            `;
        } else {
            content = `
                <h4>${section}</h4>
                <h5>${processTextWithImages(question.question)}</h5>
                <ul>${question.options.map(option => `<li>${processTextWithImages(option)}</li>`).join("")}</ul>
                <p>Answer: ${processTextWithImages(question.correctAnswer)}</p>
                <button class="edit-button" onclick="editQuestion(this)">Modify</button>
                <button class="delete-button" onclick="deleteQuestion(this)">Delete</button>
            `;
        }

        typeText(questionElement, content, 2.5, () => {
            typeNextQuestion(index + 1);
            addImageZoomListeners(questionElement);
        });

        currentTypingElements.push(questionElement); // Track this element
    }

    typeNextQuestion(0);
}

async function fetchData(file) {
    try {
        const response = await fetch(`http://localhost:3001/${file}`);
        return await response.json();
    } catch (error) {
        console.error("Fetch error:", error);
        throw error;
    }
}

function processAndDisplayResults(data, searchTerm, isAbJson = false, section = "") {
    const searchResultsContainer = document.querySelector(".search-results");
    const term = searchTerm.toLowerCase();
    let matchingQuestions = [];

    if (isAbJson) {
        const sectionData = data[currentSubject]?.[section] || [];
        matchingQuestions = sectionData
            .map((q, index) => ({
                section,
                questionData: q,
                matchLength: q.question.trim().toLowerCase().length - term.length,
                index
            }))
            .filter(q => q.questionData.question.trim().toLowerCase().includes(term) ||
                q.questionData.explanation.trim().toLowerCase().includes(term));
    } else {
        const sectionData = data.sections?.find(s => s.section?.toLowerCase() === currentSubject.toLowerCase())?.questions || [];
        matchingQuestions = sectionData
            .map(q => ({
                section: currentSubject,
                question: q,
                matchLength: q.question.trim().toLowerCase().length - term.length
            }))
            .filter(q => q.question.question.trim().toLowerCase().includes(term) ||
                q.question.options.some(option => option.trim().toLowerCase().includes(term)) ||
                q.question.correctAnswer.trim().toLowerCase().includes(term));
    }

    matchingQuestions.sort((a, b) => a.matchLength - b.matchLength);
    displaySearchResults(matchingQuestions, isAbJson);
}

function processTextWithImages(text) {
    return text.replace(/\(image\/[^\)]+\)/g, match => {
        const imgSrc = match.slice(1, -1); // Remove surrounding parentheses
        return `<div class="image-container"><img src="${imgSrc}" class="image-zoom" alt="Image"></div>`;
    });
}

function addImageZoomListeners(container) {
    container.querySelectorAll('.image-container').forEach(imgContainer => {
        const img = imgContainer.querySelector('.image-zoom');
        let currentZoom = 1;
        let isDragging = false;
        let startX, startY, scrollLeft, scrollTop;

        function updateImagePosition() {
            const rect = imgContainer.getBoundingClientRect();
            const imgRect = img.getBoundingClientRect();
            
            const maxScrollX = imgRect.width - rect.width;
            const maxScrollY = imgRect.height - rect.height;
            
            imgContainer.scrollLeft = Math.max(0, Math.min(imgContainer.scrollLeft, maxScrollX));
            imgContainer.scrollTop = Math.max(0, Math.min(imgContainer.scrollTop, maxScrollY));
        }

        img.addEventListener('dblclick', (e) => {
            e.preventDefault();
            const oldZoom = currentZoom;
            currentZoom = (currentZoom % 3) + 1; // Cycle through zoom levels 1, 2, 3
            
            const rect = imgContainer.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            img.style.transformOrigin = `${0*x}px ${0*y}px`;
            img.style.transform = `scale(${currentZoom})`;
            
            imgContainer.style.overflow = currentZoom > 1 ? 'auto' : 'hidden';
            
            if (currentZoom > oldZoom) {
                imgContainer.scrollLeft += x * (currentZoom - oldZoom);
                imgContainer.scrollTop += y * (currentZoom - oldZoom);
            }
            
            updateImagePosition();
        });

        imgContainer.addEventListener('mousedown', (e) => {
            if (currentZoom > 1) {
                isDragging = true;
                imgContainer.classList.add('dragging');
                startX = e.pageX - imgContainer.offsetLeft;
                startY = e.pageY - imgContainer.offsetTop;
                scrollLeft = imgContainer.scrollLeft;
                scrollTop = imgContainer.scrollTop;
            }
        });

        imgContainer.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const x = e.pageX - imgContainer.offsetLeft;
            const y = e.pageY - imgContainer.offsetTop;
            const walkX = (x - startX) * 1.5; // Adjust the multiplier for smoother dragging
            const walkY = (y - startY) * 1.5;
            imgContainer.scrollLeft = scrollLeft - walkX;
            imgContainer.scrollTop = scrollTop - walkY;
            updateImagePosition();
        });

        imgContainer.addEventListener('mouseup', () => {
            isDragging = false;
            imgContainer.classList.remove('dragging');
        });

        imgContainer.addEventListener('mouseleave', () => {
            isDragging = false;
            imgContainer.classList.remove('dragging');
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    addImageZoomListeners(document);
});


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




async function editQuestion(button, isAbJson = false) {
    const questionElement = button.parentElement;
    const section = questionElement.dataset.section;
    const subject = questionElement.querySelector("h4")?.textContent || null;
    const questionIndex = questionElement.dataset.questionIndex || null;
    const questionId = questionElement.dataset.questionId || null;

    // Hide all other search results
    document.querySelectorAll(".search-result").forEach(result => {
        if (result !== questionElement) result.style.display = "none";
    });

    // Hide current question view
    questionElement.querySelectorAll("h4, h5, p, button").forEach(el => el.style.display = "none");

    // Create editing elements
    const createEditElement = (className, tagName = "textarea") => {
        const el = document.createElement(tagName);
        el.classList.add(className);
        return el;
    };

    const sectionDisplay = document.createElement("div");
    sectionDisplay.classList.add("section-display");
    
    const editInput = createEditElement("edit-input");
    const editExplanationInput = createEditElement("edit-explanation-input");
    const saveButton = createEditElement("save-button", "button");
    saveButton.textContent = "Save";
    const cancelButton = createEditElement("cancel-button", "button");
    cancelButton.textContent = "Cancel";

    const handleSave = async () => {
        const newQuestion = editInput.value.trim();
        const newExplanation = editExplanationInput.value.trim();
        if (newQuestion.length === 0 || newExplanation.length === 0) {
            alert("Question and explanation cannot be empty.");
            return;
        }
        isModifyActive = false;
        const updatedData = { subject, section, newQuestion, newExplanation, questionIndex };
        try {
            saveButton.disabled = true;
            sendDataToServer(updatedData, "PUT", subject, section, questionIndex);
            reloadQuiz();
            performSearch();
        } catch (error) {
            console.error("Error during save operation:", error);
        } finally {
            saveButton.disabled = false;
        }
    };

    const handleCancel = () => {
        isModifyActive = false;
        document.querySelectorAll(".search-result").forEach(result => result.style.display = "block");
        performSearch();
    };

    if (isAbJson) {
        try {
            const response = await fetch(`http://localhost:3001/${currentDataFile}`);
            const data = await response.json();
            if (data[subject]?.[section]?.[questionIndex]) {
                const questionData = data[subject][section][questionIndex];
                sectionDisplay.textContent = `${subject}`;
                editInput.value = questionData.question;
                editExplanationInput.value = questionData.explanation;
                questionElement.append(sectionDisplay, editInput, editExplanationInput, saveButton, cancelButton);
                saveButton.addEventListener("click", handleSave);
            }
        } catch (error) {
            console.error("Error fetching ab.json:", error);
        }
    } else {
        const sectionName = questionElement.querySelector("h4").textContent;
        const questionText = questionElement.querySelector("h5").textContent;
        const options = Array.from(questionElement.querySelectorAll("li")).map(li => li.textContent);
        const answer = questionElement.querySelector("p").textContent.replace("Answer: ", "");

        sectionDisplay.textContent = sectionName;
        editInput.value = questionText;
        questionElement.querySelectorAll("h4, h5, ul, p, button").forEach(el => el.style.display = "none");

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

        questionElement.append(sectionDisplay, editInput, editOptionsList, editAnswerInput, saveButton, cancelButton);

        saveButton.addEventListener("click", async () => {
            const newQuestion = editInput.value.trim();
            const newOptions = Array.from(editOptionsList.querySelectorAll("textarea")).map(input => input.value.trim());
            const newAnswer = editAnswerInput.value.trim();
            if (newQuestion.length === 0 || newOptions.some(option => option.length === 0) || newAnswer.length === 0) {
                alert("Please fill in all fields.");
                return;
            }
            isModifyActive = false;
            const questionData = {
                oldQuestion: questionText,
                oldOptions: options,
                oldAnswer: answer,
                newQuestion,
                newOptions,
                newAnswer,
                questionId,
                section: sectionName
            };
            try {
                saveButton.disabled = true;
                await sendDataToServer(questionData, "PUT", sectionName);
                reloadQuiz();
                performSearch();
            } catch (error) {
                console.error("Error during save operation:", error);
            } finally {
                saveButton.disabled = false;
            }
        });
    }

    cancelButton.addEventListener("click", handleCancel);
    isModifyActive = true;
}


// Ensure this function returns a promise
async function sendDataToServer(data, method, sectionName, questionIndex) {
    const response = await fetch(`http://localhost:3001/${sectionName}${questionIndex ? `/${questionIndex}` : ''}`, {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return response.json();
}

function reloadQuiz() {
    console.log("Quiz reloaded");
}




addButton.addEventListener("click", function () {
    addButtonClickedCount++;

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
            isModifyActive = false;
        }
    }
});

function switchToAddFormAB() {
    const formMCQ = document.getElementById("add-question-form-mcq");
    const formAB = document.getElementById("add-question-form-ab");

    if (formMCQ.style.display === "block" && currentDataFile === "ab.json") {
        formMCQ.style.display = "none";
        formAB.style.display = "block";
        isModifyActive = false;
    }
}

function switchToAddFormMcq() {
    const formMCQ = document.getElementById("add-question-form-mcq");
    const formAB = document.getElementById("add-question-form-ab");

    if (formAB.style.display === "block" && currentDataFile === "questions.json") {
        formAB.style.display = "none";
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

// Function to handle image uploads and insert placeholders in the textarea
function handleImageUploads(textareaSelector, fileInputSelector, messageSelector) {
    const fileInput = document.querySelector(fileInputSelector);
    const messageDiv = document.querySelector(messageSelector);

    if (!fileInput) {
        console.error(`Element not found for selector: ${fileInputSelector}`);
        return;
    }

    if (!messageDiv) {
        console.error(`Element not found for selector: ${messageSelector}`);
        return;
    }

    let imageFiles = [];

    fileInput.addEventListener('change', event => {
        const files = event.target.files;
        if (files.length === 0) return;

        const textarea = document.querySelector(textareaSelector);
        if (!textarea) {
            console.error(`Element not found for selector: ${textareaSelector}`);
            return;
        }

        const imagePlaceholders = [];

        Array.from(files).forEach(file => {
            if (file.type.startsWith('image/')) {
                const sanitizedFileName = file.name.replace(/\s+/g, '_');
                const reader = new FileReader();

                reader.onload = function(e) {
                    const imgPlaceholder = `<span class="highlighted-placeholder">(${sanitizedFileName})</span>`;
                    imagePlaceholders.push(imgPlaceholder);

         
                    // Add placeholder to textarea
                    const cursorPos = textarea.selectionStart;
                    const textBefore = textarea.value.substring(0, cursorPos);
                    const textAfter = textarea.value.substring(cursorPos);
                    textarea.value = textBefore + sanitizedFileName + textAfter; // Simple text placeholder, style will be applied via CSS
                    textarea.focus();
                    textarea.selectionStart = textarea.selectionEnd = cursorPos + sanitizedFileName.length;

                    // Show message about inserting images
                    const message = `Put this text = ${imagePlaceholders.join(' ')} <br> <b>where you want to add the images</b>`;
                    messageDiv.style.display = 'block';
                    messageDiv.innerHTML = '';
                    typeText(messageDiv, message, 50); // Optional typing effect

                    // Display image previews
                    messageDiv.innerHTML += `<div>${imageFiles.map(img => `<img src="${img.src}" style="max-width: 200px; margin-left: 5px;">`).join('')}</div>`;
                };

                reader.readAsDataURL(file);
                imageFiles.push(new File([file], sanitizedFileName, { type: file.type }));
            } else {
                alert('Please upload only image files.');
                fileInput.value = ''; // Clear the file input
            }
        });
    });

    // Return a function to get the image files
    return () => imageFiles;
}
function addPlaceholdersToContentEditable(containerSelector, placeholders) {
    const container = document.querySelector(containerSelector);
    if (!container) {
        console.error(`Element not found for selector: ${containerSelector}`);
        return;
    }

    container.innerHTML = placeholders.join(' ');
}

// Function to validate form inputs
function validateFormInputs(questionText, optionsText, answerText, explanationText, isMCQ) {
    // Helper function to check if a field is valid (contains text or image link)
    function isFieldValid(field) {
        return field.trim() !== "" || /\(.*\.(?:gif|jpe?g|tiff?|png|webp|bmp|svg|ico|avif)\)/.test(field);
    }

    if (isMCQ) {
        // Check question, all options, and answer for MCQ
        if (!isFieldValid(questionText)) return false;
        if (optionsText.some(opt => !isFieldValid(opt))) return false;
        if (!isFieldValid(answerText)) return false;
    } else {
        // Check question and explanation for AB question
        if (!isFieldValid(questionText)) return false;
        if (!isFieldValid(explanationText)) return false;
    }

    return true;
}

// Function to save question (MCQ or AB) with images and text
function saveQuestion({ questionText, optionsText = [], answerText, explanationText, isMCQ, imageFiles }) {
    if (!validateFormInputs(questionText, optionsText, answerText, explanationText, isMCQ)) {
        return displayAlert("Please fill all required fields with either text or image placeholders.");
    }

    function formatImageFileNames(text) {
        if (typeof text !== 'string') return text;
        const imageFileNamePattern = /\b([A-Za-z0-9_-]+\.(gif|jpe?g|tiff?|png|webp|bmp|svg|ico|avif))\b/g;
        return text.replace(imageFileNamePattern, (match) => `image/${match}`);
    }

    function attachMatchedImagesToFormData(formData) {
        function getImagePlaceholdersFromText(text) {
            if (typeof text !== 'string') return [];
            return text.match(/\b([A-Za-z0-9_-]+\.(gif|jpe?g|tiff?|png|webp|bmp|svg|ico|avif))\b/g) || [];
        }

        const placeholders = [
            ...getImagePlaceholdersFromText(questionText),
            ...optionsText.flatMap(opt => getImagePlaceholdersFromText(opt)),
            ...getImagePlaceholdersFromText(answerText),
            ...getImagePlaceholdersFromText(explanationText)
        ];

        if (placeholders.length === 0) return;

        placeholders.forEach(placeholder => {
            const matchingFile = imageFiles.find(file => file.name === placeholder);
            if (matchingFile) {
                formData.append('images[]', matchingFile);
            }
        });
    }

    const formattedQuestionText = formatImageFileNames(questionText);
    const formattedOptionsText = optionsText.map(opt => formatImageFileNames(opt));
    const formattedAnswerText = formatImageFileNames(answerText);
    const formattedExplanationText = formatImageFileNames(explanationText);

    checkIfQuestionExists(formattedQuestionText, isMCQ).then(exists => {
        if (exists) return displayAlert("This question already exists.");

        const formData = new FormData();
        if (formattedQuestionText.trim()) formData.append('question', formattedQuestionText);
        if (isMCQ) {
            if (formattedOptionsText.length) formData.append('options', JSON.stringify(formattedOptionsText));
            if (formattedAnswerText.trim()) formData.append('correctAnswer', formattedAnswerText);
            formData.append('section', currentSubject);
        } else {
            if (formattedExplanationText.trim()) formData.append('explanation', formattedExplanationText);
            formData.append('subject', currentSubject);
            formData.append('section', currentSection);
        }

        attachMatchedImagesToFormData(formData);

        const endpoint = isMCQ ? '/questions.json' : '/ab.json';
        fetch(`http://localhost:3001${endpoint}`, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            console.log('Success:', data);
            resetAddForm();
            document.getElementById(isMCQ ? "add-question-form-mcq" : "add-question-form-ab").style.display = "none";
            addButton.click(); // Hide form after submission
        })
        .catch(error => {
            console.error('Error:', error);
        });
    });
}

// Event listeners for MCQ form
document.getElementById("save-new-question-mcq").addEventListener("click", () => {
    const questionText = document.getElementById("new-question-text").value;
    const optionsElements = Array.from(document.querySelectorAll(".new-option-input"));
    const optionsText = optionsElements.map(input => input.value);
    const answerText = document.getElementById("new-answer-text").value;
    const imageFiles = getMCQImageFiles(); // Get the uploaded image files

    if (!validateFormInputs(questionText, optionsText, answerText, "", true)) {
        return displayAlert("Please fill all required fields with either text or image placeholders.");
    }

    saveQuestion({ questionText, optionsText, answerText, isMCQ: true, imageFiles });
});

// Event listeners for AB form
document.getElementById("save-new-question-ab").addEventListener("click", () => {
    const questionText = document.querySelector(".question-input").value;
    const explanationText = document.querySelector(".edit-explanation-input").value;
    const imageFiles = getABImageFiles(); // Get the uploaded image files

    if (!validateFormInputs(questionText, [], "", explanationText, false)) {
        return displayAlert("Please fill all required fields with either text or image placeholders.");
    }

    saveQuestion({ questionText, explanationText, isMCQ: false, imageFiles });
});

// Check if question exists
async function checkIfQuestionExists(questionText, isMCQ = false) {
    try {
        const response = await fetch(`http://localhost:3001/${currentDataFile}`);
        if (!response.ok) throw new Error('Network response was not ok.');
        const data = await response.json();
        return isMCQ ? 
            data.sections.some(section => section.questions?.some(q => q.question === questionText.trim())) :
            Object.values(data).some(section => section.a?.some(q => q.question === questionText.trim()) || section.b?.some(q => q.question === questionText.trim()));
    } catch (error) {
        console.error('Error checking if question exists:', error);
        return false;
    }
}

// Function to display alert messages
function displayAlert(message) {
    alert(message); // Replace with a custom alert implementation if needed
}

// Function to reset the form
function resetAddForm() {
    // Clear text inputs and set min-height
    ['#new-question-text', '.new-option-input', '#new-answer-text', '.question-input', '.edit-explanation-input']
        .forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                el.value = '';
                el.style.minHeight = '50px';
            });
        });

    // Clear image uploads and hide placeholder messages
    ['#upload-question-images', '#upload-ab-images']
        .forEach(selector => document.querySelector(selector).value = '');
    
    ['#image-placeholder-message', '#image-placeholder-message-ab']
        .forEach(selector => document.querySelector(selector).style.display = 'none');
}


// Initialize image file handlers
const getMCQImageFiles = handleImageUploads('#new-question-text', '#upload-question-images', '#image-placeholder-message');
const getABImageFiles = handleImageUploads('.question-input', '#upload-ab-images', '#image-placeholder-message-ab');




function reloadQuiz() {
    window.parent.postMessage("reloadQuiz", "*");

    setTimeout(() => {
        performSearch();
        setTimeout(() => {
            performSearch();
        }, 100);
    }, 200);
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








async function deleteQuestion(button, isAbJson = false) {
    const questionElement = button.parentElement;
    const questionText = questionElement.querySelector('h5')?.textContent?.trim() || null;
    const subject = questionElement.querySelector('h4')?.textContent?.trim() || null;
    const sectionName = questionElement.dataset.section;
    const questionIndex = questionElement.dataset.questionIndex;

    if (!confirm("Are you sure you want to delete this question?")) return;

    const data = isAbJson 
        ? { subject, section: sectionName, questionIndex }
        : { question: questionText, section: sectionName };

    const endpoint = isAbJson ? 'http://localhost:3001/ab.json' : 'http://localhost:3001/questions.json';

    try {
        await fetch(endpoint, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });
        questionElement.remove();
        isModifyActive = false;
        reloadQuiz();
       
    } catch (error) {
        console.error("Error deleting question:", error);
    }
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

document.addEventListener('DOMContentLoaded', function () {
    const editButtons = document.querySelectorAll(".edit-button");
    editButtons.forEach(button => {
        button.addEventListener("click", editQuestion);
    });
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

    // Reset the typing effects
    currentTypingElements.forEach(({ typingInterval }) => clearInterval(typingInterval));
    currentTypingElements = [];

    // Hide buttons
    toggleButtons(false);
    buttonsVisible = false;
}



  function typeText(element, text, speed, callback) {
    let i = 0;
    let interval = null;

    // Function to type out text without breaking HTML tags
    function typeChar() {
        // Don't update if we're in the middle of an HTML tag
        if (text[i] === '<') {
            // Find the closing tag
            const closeIndex = text.indexOf('>', i);
            if (closeIndex !== -1) {
                // Skip over the entire tag before typing more content
                i = closeIndex + 1;
            }
        }

        // Safely set the element's content while avoiding incomplete HTML tags
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = text.substring(0, i);
        const safeText = tempDiv.innerHTML;

        element.innerHTML = safeText;
        i++;

        // Stop when we've typed out the full content
        if (i > text.length) {
            clearInterval(interval);
            element.typingInterval = null;
            if (callback) callback();
        }
    }

    // Clear any existing interval for this element
    if (element.typingInterval) {
        clearInterval(element.typingInterval);
        element.typingInterval = null;
    }

    // Start typing
    interval = setInterval(typeChar, speed);

    // Store the interval reference in the element
    element.typingInterval = interval;
}

