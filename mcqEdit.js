// mcqEdit.js
document.addEventListener('DOMContentLoaded', function () {
    const editButtons = document.querySelectorAll(".edit-button");
    editButtons.forEach(button => {
        button.addEventListener("click", editQuestion);
    });
});

function editQuestion(button) {
    if (isModifyActive) {
        alert("Finish the current edit before modifying another question.");
        return;
    }

    const questionElement = button.parentElement;
    const section = questionElement.querySelector("h4").textContent; // Fetch the section
    const question = questionElement.querySelector("h5").textContent;
    const options = Array.from(questionElement.querySelectorAll("li")).map((li) => li.textContent);
    const answer = questionElement.querySelector("p").textContent.replace("Answer: ", "");
    editingQuestionId = questionElement.dataset.questionId;

    editedSection = section; // Save the current section (non-editable)
    editedQuestion = question;
    editedOptions = options;
    editedAnswer = answer;

    // Display the section as non-editable text
    const sectionDisplay = document.createElement("div");
    sectionDisplay.textContent = `${section}`;
    sectionDisplay.classList.add("section-display");

    // Create editable input fields for question, options, and answer
    const editInput = document.createElement("textarea");
    editInput.value = question;
    editInput.classList.add("edit-input");

    const editOptionsList = document.createElement("ul");
    options.forEach((option) => {
        const optionItem = document.createElement("li");
        const optionInput = document.createElement("textarea");
        optionInput.classList.add("option-input");
        optionInput.value = option;
        optionItem.appendChild(optionInput);
        editOptionsList.appendChild(optionItem);
    });

    const editAnswerInput = document.createElement("textarea");
    editAnswerInput.value = answer;
    editAnswerInput.classList.add("edit-answer-input");

    // Hide the current question, section, and options
    questionElement.querySelectorAll("h4, h5, ul, p, button").forEach((el) => {
        el.style.display = "none";
    });

    // Append non-editable section and editable elements
    questionElement.appendChild(sectionDisplay); // Non-editable section
    questionElement.appendChild(editInput);
    questionElement.appendChild(editOptionsList);
    questionElement.appendChild(editAnswerInput);

    // Create save and cancel buttons
    const saveButton = document.createElement("button");
    saveButton.textContent = "Save";
    saveButton.classList.add("save-button");
    saveButton.addEventListener("click", function () {
        const newQuestion = editInput.value;
        const newOptions = Array.from(editOptionsList.querySelectorAll("textarea")).map((input) => input.value);
        const newAnswer = editAnswerInput.value;

        const questionData = {
            oldQuestion: question,
            oldOptions: options,
            oldAnswer: answer,
            newQuestion: newQuestion,
            newOptions: newOptions,
            newAnswer: newAnswer,
            section: section,
            questionId: editingQuestionId,
        };

        sendDataToServer(questionData, "PUT", section); // Send the data to the server

        isModifyActive = false;
        resetEdit();
    });

    const cancelButton = document.createElement("button");
    cancelButton.textContent = "Cancel";
    cancelButton.classList.add("cancel-button");
    cancelButton.addEventListener("click", function () {
        isModifyActive = false;
        resetEdit();
    });

    // Append buttons
    questionElement.appendChild(saveButton);
    questionElement.appendChild(cancelButton);

    isModifyActive = true; // Set modify flag when editing starts
}

function resetEdit() {
    if (!isModifyActive) return;

    const questionElement = document.querySelector(`[data-question-id='${editingQuestionId}']`);

    // Restore the original question view
    questionElement.querySelectorAll("h4, h5, ul, p, button").forEach((el) => {
        el.style.display = ""; // Restore original display
    });

    // Remove editing elements
    questionElement.querySelectorAll(".edit-input, .edit-answer-input, .option-input, .save-button, .cancel-button").forEach(el => el.remove());

    isModifyActive = false;  // Reset modify flag
}

function sendDataToServer(data, method) {
    // Simulate server interaction
    console.log("Sending data to the server:", data);
}

function reloadQuiz() {
    // Simulate reloading the quiz after saving
    console.log("Quiz reloaded");
}

function deleteQuestion(button) {
    const questionElement = button.parentElement;
    const questionId = questionElement.dataset.questionId;
    const sectionName = questionElement.dataset.section;

    if (confirm("Are you sure you want to delete this question?")) {
        sendDataToServer({ questionId: questionId, section: sectionName }, "DELETE");
        questionElement.remove();
        reloadQuiz();
    }
}
// Add event listener for saving a new MCQ question
document.getElementById("save-new-question-mcq").addEventListener("click", function () {
    const questionText = document.getElementById("new-question-text").value;
    const optionsText = Array.from(document.querySelectorAll(".new-option-input")).map((input) => input.value);
    const answerText = document.getElementById("new-answer-text").value;

    if (questionText.trim() === "") {
        alert("Question field cannot be empty.");
        return;
    }

    if (!currentSubject) {
        alert("Please select a subject before adding a question.");
        return;
    }

    const newQuestionData = {
        question: questionText,
        options: optionsText,
        correctAnswer: answerText,
        
    };

    sendDataToServer(newQuestionData, "POST", currentSubject);
    resetAddForm();
    document.getElementById("add-question-form-mcq").style.display = "none";
    performSearch();
    reloadQuiz();

    searchBox.style.display = "block";
    addButton.textContent = "Add";
    
});
document.getElementById("cancel-add-question-mcq").addEventListener("click", function () {
    const form = document.getElementById("add-question-form-mcq");
    form.style.display = "none";

    addButton.click();
    resetAddForm();
});