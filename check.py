import json
import re

def check_options(questions_data, section_name):
    """
    Checks options in a specified section and provides a count of issues.

    Args:
      questions_data: Parsed JSON data (dictionary).
      section_name: Name of the section to check (string).
    """
    bengali_roman_numbers = r"^(?:[i|I]{1}(?:\s*\.)?|[ii|II]{2}(?:\s*\.)?|[iii|III]{3}(?:\s*\.)?)$"
    bengali_numbers = r"^(?:১(?:\s*\.)?|২(?:\s*\.)?|৩(?:\s*\.)?)$"

    problem_count = 0
    found_section = False
    for section in questions_data["sections"]:
        if section["section"] == section_name:
            found_section = True
            for question in section["questions"]:
                if len(question["options"]) == 3:
                    for i, option in enumerate(question["options"]):
                        cleaned_option = option.strip()
                        if not re.match(bengali_roman_numbers, cleaned_option) and not re.match(bengali_numbers, cleaned_option):
                            problem_count += 1
                            print(f"\nQuestion: {question['question']}")
                            print(f"Options: {question['options']}")
                            print(f"Problematic Option ({i+1}): '{option}' contains extra text.")

    if found_section:
        print(f"\nTotal problems found in section '{section_name}': {problem_count}")
    else:
        print(f"Error: Section '{section_name}' not found in questions.json")


try:
    with open("questions.json", "r", encoding='utf-8') as f:
        questions_data = json.load(f)

    section_to_check = input("Enter the section name to check (e.g., 'গদ্য : অপরিচিতা'): ")
    check_options(questions_data, section_to_check)

except FileNotFoundError:
    print("Error: questions.json not found.")
except json.JSONDecodeError:
    print("Error: Invalid JSON format in questions.json.")
except Exception as e:
    print(f"An unexpected error occurred: {e}")
    