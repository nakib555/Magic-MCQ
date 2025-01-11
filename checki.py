import json

def check_duplicate_questions(questions_data, section):
    """Checks for duplicate questions within a specific section in the JSON data."""
    duplicate_questions = []
    question_texts = set()

    for section_obj in questions_data["sections"]:
        if section_obj["section"] == section:
            for question in section_obj["questions"]:
                question_text = question["question"]
                if question_text in question_texts:
                    duplicate_questions.append(question)
                else:
                    question_texts.add(question_text)

    return len(duplicate_questions), duplicate_questions

def delete_duplicate_questions(questions_data, section):
    """Deletes duplicate questions from a specific section in the JSON data."""
    duplicate_count, duplicate_list = check_duplicate_questions(questions_data, section)

    if duplicate_count > 0:
        print(f"There are {duplicate_count} duplicate questions found in section '{section}'.")
        print("Duplicate questions:")
        for question in duplicate_list:
            print(question["question"])

        confirm = input("Do you want to delete these duplicate questions? (yes/no): ")
        if confirm.lower() == "yes":
            for question in duplicate_list:
                for section_obj in questions_data["sections"]:
                    if section_obj["section"] == section:
                        section_obj["questions"].remove(question)
            print(f"Duplicate questions from section '{section}' have been deleted.")
        else:
            print(f"Duplicate questions in section '{section}' were not deleted.")
    else:
        print(f"No duplicate questions found in section '{section}'.")

# Load the JSON data from the file
try:
    with open('questions.json', 'r', encoding='utf-8') as f:
        questions_data = json.load(f)
except (FileNotFoundError, json.JSONDecodeError) as e:
    print(f"Error loading questions data: {e}")
    exit()

# Display available sections
print("Available sections:")
for section_obj in questions_data["sections"]:
    print(section_obj["section"])

# Get the section to check and delete duplicates from
section = input("Enter the section to check and delete duplicates from: ")

# Delete duplicate questions
delete_duplicate_questions(questions_data, section)

# Save the updated JSON data to the file
try:
    with open('questions.json', 'w', encoding='utf-8') as f:
        json.dump(questions_data, f, indent=2, ensure_ascii=False)
    print("Questions data updated successfully.")
except IOError as e:
    print(f"Error saving questions data: {e}")
