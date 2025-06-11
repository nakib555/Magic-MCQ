import google.generativeai as genai
import os
import json
import re
from bs4 import BeautifulSoup # Still needed for contains_image and extract_image_parts
from dotenv import load_dotenv
import time
import sys
from pathlib import Path

# --- Configuration ---
load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")
JS_FILE_PATH = "questions.js"
STATE_FILE_PATH = "processing_state.json"
IMAGE_FOLDER = "image"
TEXT_BATCH_SIZE = 100 # <<< Process 100 TEXT questions per API call
# State saving happens after each successful JS file save

# --- Helper Functions ---

# clean_html function is REMOVED

def contains_image(html_content):
    """Checks if HTML content contains an <img> tag."""
    if not html_content or not isinstance(html_content, str): return False
    # Use html.parser for basic check without needing external libraries like lxml
    soup = BeautifulSoup(html_content, "html.parser")
    return bool(soup.find('img'))

def extract_image_parts(html_content, base_image_folder_path: Path):
    """
    Extracts image paths from HTML and prepares them for Gemini API.
    Handles src="filename.ext" and src="folder/filename.ext".
    Returns a tuple: (list_of_image_parts, has_image_tag_in_html)
    """
    image_parts = []
    if not html_content or not isinstance(html_content, str):
        return image_parts, False

    soup = BeautifulSoup(html_content, "html.parser")
    img_tags = soup.find_all('img')
    img_found_in_html = len(img_tags) > 0

    if not img_found_in_html:
        return image_parts, False

    script_dir = base_image_folder_path.parent

    for img in img_tags:
        img_src = img.get('src')
        if not img_src:
            print("    - Warning: Found <img> tag with no src attribute.")
            continue

        normalized_src = img_src.replace('\\', '/')
        image_path = None

        if normalized_src.startswith(base_image_folder_path.name + '/'):
            potential_path = script_dir / normalized_src
            if potential_path.exists() and potential_path.is_file():
                 image_path = potential_path
        else:
            potential_path = base_image_folder_path / Path(normalized_src).name
            if potential_path.exists() and potential_path.is_file():
                image_path = potential_path

        if image_path:
            try:
                mime_type = get_mime_type(image_path)
                if mime_type:
                    with open(image_path, 'rb') as f: image_bytes = f.read()
                    image_parts.append({"mime_type": mime_type, "data": image_bytes})
            except Exception as e: print(f"    - Warning: Error reading image file {image_path}: {e}")
        else: print(f"    - Warning: Could not find image file for src='{img_src}' at expected locations.")

    return image_parts, img_found_in_html


def get_mime_type(file_path):
    """Determines the MIME type based on file extension."""
    extension = file_path.suffix.lower()
    mime_map = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
                '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic',
                '.heif': 'image/heif'}
    return mime_map.get(extension)

def extract_json_from_js(js_content):
    """Extracts the main data object from the JS file content using start/end markers."""
    start_pattern = r'const\s+questionsData\s*=\s*'
    end_pattern = r';\s*module\.exports\s*=\s*questionsData\s*;'
    match_start = re.search(start_pattern, js_content)
    if not match_start: raise ValueError("Could not find 'const questionsData =' marker.")
    match_end = re.search(end_pattern, js_content)
    if not match_end:
        end_pattern_alt = r'module\.exports\s*=\s*questionsData\s*;'
        match_end = re.search(end_pattern_alt, js_content)
        if not match_end: raise ValueError("Could not find 'module.exports' marker.")
    start_index = match_start.end()
    end_index = match_end.start()
    json_str = js_content[start_index:end_index].strip()
    if json_str.endswith(','): json_str = json_str[:-1]
    if not json_str.startswith('{') or not json_str.endswith('}'):
         if json_str.endswith('};'): json_str = json_str[:-1].strip()
         elif not json_str.endswith('}'): print("Warning: Extracted string doesn't look like a valid JS object literal.")
    try:
        json_str_cleaned = re.sub(r',\s*([\}\]])', r'\1', json_str) # Clean trailing commas
        data = json.loads(json_str_cleaned)
        return data
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON: {e}")
        lines = json_str.splitlines()
        error_line_in_snippet = json_str[:e.pos].count('\n')
        context_start = max(0, error_line_in_snippet - 3)
        context_end = min(len(lines), error_line_in_snippet + 4)
        print("--- JSON Snippet ---"); print("\n".join(lines[context_start:context_end])); print("--- End Snippet ---")
        raise

def format_options_raw(options_list):
    """Formats the options list into a readable string using RAW HTML keys."""
    texts = []
    for option_dict in options_list:
        if option_dict and isinstance(option_dict, dict):
            try:
                # Use the raw HTML key directly
                key = list(option_dict.keys())[0]
                texts.append(key)
            except IndexError: pass # Ignore empty option dicts
    return "; ".join(texts)

def get_lessons_for_batch(batch_questions_data, lesson_list, model_to_use):
    """Sends a batch of TEXT questions (raw HTML) to Gemini and parses the response."""
    prompt_lines = [
        f"Analyze the following batch of {len(batch_questions_data)} multiple-choice questions (provided as raw HTML) and their options.",
        "For each question, determine which single lesson topic it best belongs to from the provided list.",
        f"Available Lesson Topics: {', '.join(lesson_list)}\n",
        "Instructions:",
        "1. For each question number below, analyze its raw HTML content and options.",
        "2. Identify the *single best* matching lesson topic from the list.",
        "3. If a question clearly fits *exactly one* topic, state the name of that topic.",
        "4. If a question does not clearly fit any *single* topic, or if it fits *multiple* topics equally well, state the exact word: None",
        "5. Respond with a numbered list, where each line corresponds to the question number in the input batch.",
        "   Format each line as: `Number. AssignedLessonNameOrNone` (e.g., `1. Logic Gates`, `2. None`, `3. Number Systems`)",
        "   Ensure you provide a response line for every question number in the batch.\n",
        "--- Batch Start ---"
    ]
    for i, q_data in enumerate(batch_questions_data):
        q_num = i + 1
        # Use RAW HTML for question
        q_html_raw = q_data.get("question", "")
        # Use RAW HTML keys for options
        opt_html_raw = format_options_raw(q_data.get("options", []))
        prompt_lines.append(f"\n{q_num}. Question HTML: {q_html_raw}")
        prompt_lines.append(f"   Options HTML: {opt_html_raw}")
    prompt_lines.append("\n--- Batch End ---"); prompt_lines.append("\nProvide the numbered list of lesson assignments below:")
    full_prompt = "\n".join(prompt_lines)

    try:
        model = genai.GenerativeModel(model_to_use)
        time.sleep(1.5)
        safety_settings = [ {"category": c, "threshold": "BLOCK_MEDIUM_AND_ABOVE"} for c in ["HARM_CATEGORY_HARASSMENT", "HARM_CATEGORY_HATE_SPEECH", "HARM_CATEGORY_SEXUALLY_EXPLICIT", "HARM_CATEGORY_DANGEROUS_CONTENT"]]
        response = model.generate_content(full_prompt, safety_settings=safety_settings)
        if not response.candidates:
             print("  Warning: Response was blocked for the batch."); return None
        response_text = response.text.strip()
        assignments = []
        lines = response_text.splitlines()
        processed_indices = set()
        for line in lines:
            line = line.strip()
            match = re.match(r"^\s*(\d+)\s*[.:-]?\s*(.+)$", line)
            if match:
                try:
                    q_index_in_batch = int(match.group(1)) - 1
                    lesson_name = match.group(2).strip()
                    if 0 <= q_index_in_batch < len(batch_questions_data) and q_index_in_batch not in processed_indices:
                         assignments.append((q_index_in_batch, lesson_name))
                         processed_indices.add(q_index_in_batch)
                except Exception as parse_e: print(f"  Warning: Error processing response line '{line}': {parse_e}")
        if len(assignments) != len(batch_questions_data):
            print(f"  Warning: Parsed {len(assignments)} assignments, expected {len(batch_questions_data)}.")
            print(f"  Raw Response Snippet:\n{response_text[:500]}..."); return None
        assignments.sort(key=lambda x: x[0])
        return [lesson for _, lesson in assignments]
    except Exception as e:
        print(f"  Error calling/processing Gemini API for batch: {e}")
        if "token limit" in str(e).lower(): print("  Error: Batch likely exceeded model's token limit.")
        return None

def get_lesson_from_gemini_multimodal(question_html_raw, options_html_raw, image_parts, lesson_list, model_to_use):
    """Uses Gemini API (multimodal) for a SINGLE question with image(s) and RAW HTML."""
    try:
        model = genai.GenerativeModel(model_to_use)
        text_prompt_part = f"""
Analyze the following multiple-choice question (provided as raw HTML, plus any accompanying image(s)) and its options (also raw HTML) to determine which single lesson topic it best belongs to from the provided list.

Question HTML:
{question_html_raw}

Options HTML:
{options_html_raw}

Available Lesson Topics:
{', '.join(lesson_list)}

Instructions:
1. Consider both the raw HTML text and any images provided for the question.
2. Compare the content to the available lesson topics.
3. Identify the *single best* matching lesson topic from the list.
4. If the question clearly fits *exactly one* topic, respond with only the name of that topic from the list.
5. If the question does not clearly fit any *single* topic, or if it fits *multiple* topics equally well, respond with the exact word: None

Respond with only the chosen lesson topic name or the word "None". Do not add any explanation or extra text.

Chosen Lesson Topic:"""
        contents = [text_prompt_part] + image_parts # Image parts come after text
        time.sleep(1.2)
        safety_settings = [ {"category": c, "threshold": "BLOCK_MEDIUM_AND_ABOVE"} for c in ["HARM_CATEGORY_HARASSMENT", "HARM_CATEGORY_HATE_SPEECH", "HARM_CATEGORY_SEXUALLY_EXPLICIT", "HARM_CATEGORY_DANGEROUS_CONTENT"]]
        response = model.generate_content(contents, safety_settings=safety_settings)
        if not response.candidates:
             print("  Warning: Response was blocked."); return None
        result = response.text.strip().replace('*', '').strip()
        return result
    except Exception as e:
        print(f"  Error calling Gemini API for image question: {e}")
        return None

def load_state(state_file):
    """Loads the processing state from a JSON file."""
    if os.path.exists(state_file):
        try:
            with open(state_file, 'r', encoding='utf-8') as f: return json.load(f)
        except Exception as e: print(f"Warning: Could not load state file '{state_file}'. Starting fresh. Error: {e}")
    return {}

def save_state(state_file, state_data):
    """Saves the processing state to a JSON file."""
    try:
        with open(state_file, 'w', encoding='utf-8') as f: json.dump(state_data, f, indent=2)
    except IOError as e: print(f"Error: Could not save state to '{state_file}'. Error: {e}")

def write_js_file(file_path, data_object, original_js_content):
     """Writes the updated data object back into the JS file structure."""
     try:
        match_start = re.search(r'const\s+questionsData\s*=\s*', original_js_content)
        match_end_marker = re.search(r';\s*module\.exports\s*=\s*questionsData\s*;', original_js_content)
        if not match_start or not match_end_marker:
             match_end_marker = re.search(r'module\.exports\s*=\s*questionsData\s*;', original_js_content)
             if not match_end_marker: raise ValueError("Could not find original JS structure markers.")

        prefix = original_js_content[:match_start.end()]
        suffix = original_js_content[match_end_marker.start():]
        updated_json_str = json.dumps(data_object, indent=2, ensure_ascii=False)
        updated_js_content = prefix + updated_json_str + suffix

        with open(file_path, 'w', encoding='utf-8') as f: f.write(updated_js_content)
        return True
     except Exception as e:
        print(f"    Error writing updated data back to '{file_path}': {e}")
        return False

# --- Main Script ---
if __name__ == "__main__":
    print(f"--- MCQ Lesson Assigner (Text Batch={TEXT_BATCH_SIZE}, Image Single, Raw HTML, Immediate Save, Force Lesson) ---")

    # --- API Key & Model Setup ---
    if not API_KEY: print("\nError: GEMINI_API_KEY not set."); sys.exit(1)
    try: genai.configure(api_key=API_KEY); print("Gemini API Key configured.")
    except Exception as e: print(f"Error configuring Gemini API: {e}"); sys.exit(1)

    print("\nFetching available models...")
    all_models_list = []
    recommended_models = [] # Must support multimodal
    try:
        for m in genai.list_models():
            model_name = m.name
            all_models_list.append(model_name)
            if 'generateContent' in m.supported_generation_methods:
                 if 'vision' in model_name or 'flash' in model_name or '1.5' in model_name:
                      recommended_models.append(model_name)
    except Exception as e: print(f"Warning: Error fetching models: {e}. Some models might be missing.")
    if not all_models_list: print("Error: Could not fetch any models from the API."); sys.exit(1)
    recommended_models = sorted(list(set(recommended_models)), key=lambda x: (0 if 'flash' in x else (1 if '1.5-pro' in x else 2), x))
    all_models_list.sort()

    print("\n--- ALL Available Models ---")
    for i, model_name in enumerate(all_models_list): print(f"{i + 1}. {model_name.split('/')[-1]} ({model_name})")
    print("\n--- Recommended Models for this Task (MUST BE MULTIMODAL) ---")
    recommended_indices = {}
    for rec_model in recommended_models:
        try:
            idx = all_models_list.index(rec_model)
            recommended_indices[idx + 1] = rec_model
            print(f"{idx + 1}. {rec_model.split('/')[-1]} ({rec_model})")
        except ValueError: pass

    chosen_model_name = None
    while True:
        try:
            default_idx = list(recommended_indices.keys())[0] if recommended_indices else 1
            default_index_str = f" [{default_idx}]"
            model_choice_input = input(f"Select MULTIMODAL model number from FULL list{default_index_str}: ")
            model_choice = default_idx if not model_choice_input.strip() else int(model_choice_input)
            if 1 <= model_choice <= len(all_models_list):
                chosen_model_name = all_models_list[model_choice - 1]
                if model_choice not in recommended_indices:
                    print(f"!! Warning: Model '{chosen_model_name.split('/')[-1]}' might not support image input. !!")
                break
            else: print(f"Invalid choice.")
        except ValueError: print("Invalid input.")
        except IndexError: print("Invalid default index logic.")
    print(f"\nUsing model: {chosen_model_name}")

    # --- File and Section Setup ---
    file_path_input = input(f"Enter JS file path [{JS_FILE_PATH}]: ")
    if file_path_input.strip(): JS_FILE_PATH = file_path_input.strip()
    if not os.path.exists(JS_FILE_PATH): print(f"Error: File not found: '{JS_FILE_PATH}'"); sys.exit(1)

    script_dir = Path(__file__).parent
    image_base_dir = script_dir / IMAGE_FOLDER
    print(f"Image folder: {image_base_dir}")
    if not image_base_dir.is_dir(): print(f"Warning: Image folder not found.")

    try:
        with open(JS_FILE_PATH, 'r', encoding='utf-8') as f: js_content_original = f.read()
        questions_data = extract_json_from_js(js_content_original)
        if "sections" not in questions_data: raise ValueError("'sections' key missing.")
    except Exception as e: print(f"Error processing JS file: {e}"); sys.exit(1)

    # --- Load State & Select Section ---
    processing_state = load_state(STATE_FILE_PATH)
    last_processed_indices = processing_state.get("last_processed_indices", {})

    print("\nAvailable Sections:")
    for i, sec in enumerate(questions_data["sections"]): print(f"{i + 1}. {sec.get('section', 'Unnamed')}")
    while True:
        try:
            choice = int(input("Select section number: "))
            if 1 <= choice <= len(questions_data["sections"]): selected_section_index = choice - 1; break
            else: print("Invalid choice.")
        except ValueError: print("Invalid input.")

    selected_section = questions_data["sections"][selected_section_index]
    section_name = selected_section.get('section', f'Section {selected_section_index + 1}')
    print(f"\nProcessing Section: {section_name}")

    lesson_input = input(f"Enter comma-separated lesson names for '{section_name}': ")
    possible_lessons = [name.strip() for name in lesson_input.split(',') if name.strip()]
    if not possible_lessons: print("No lessons provided. Exiting."); sys.exit(1)
    print(f"Target lessons: {', '.join(possible_lessons)}")

    # --- Determine Start Index ---
    section_key = str(selected_section_index)
    start_index = last_processed_indices.get(section_key, 0) # Start from 0 if no state
    if start_index > 0: print(f"\nResuming from question {start_index + 1}.")
    else: print("\nStarting from beginning."); start_index = 0

    # --- Process Questions (Hybrid Approach) ---
    questions_to_process = selected_section.get("questions", [])
    total_questions_in_section = len(questions_to_process)
    updated_in_run = 0
    forced_assignments_in_run = 0
    skipped_missing_data_in_run = 0
    errors_in_run = 0
    questions_processed_count = 0
    current_text_batch_data = [] # Holds dicts: {'index': i, 'data': q}
    last_successful_save_index = start_index - 1

    print(f"\nFound {total_questions_in_section} questions.")
    if start_index >= total_questions_in_section:
        print("All questions processed based on state.")
    else:
        print(f"Starting analysis from question {start_index + 1}...")

        # --- Main Loop ---
        i = start_index
        while i < total_questions_in_section:
            q = questions_to_process[i]
            question_html = q.get("question", "") # Use raw HTML
            options_list = q.get("options", [])
            # current_lesson = q.get("lesson") # Not needed here

            print(f"\nProcessing question {i + 1}/{total_questions_in_section}...")

            # --- Check for images and extract parts ---
            image_parts, has_image_tag = extract_image_parts(question_html, image_base_dir)
            process_as_image = has_image_tag and len(image_parts) > 0

            if not question_html or not options_list:
                print("  Skipping (missing Q or O).")
                skipped_missing_data_in_run += 1
                i += 1
                continue

            # --- Decide Processing Path ---
            if process_as_image:
                # 1. Process any pending text batch FIRST
                if current_text_batch_data:
                    print(f"--- Processing pending text batch (size {len(current_text_batch_data)}) before image question ---")
                    batch_indices = [item['index'] for item in current_text_batch_data]
                    batch_q_data = [item['data'] for item in current_text_batch_data]
                    batch_results = get_lessons_for_batch(batch_q_data, possible_lessons, chosen_model_name)

                    if batch_results is None:
                        print(f"  ERROR: Failed to process pending text batch ending before Q {i + 1}. Stopping run.")
                        errors_in_run += len(current_text_batch_data)
                        break # Stop processing

                    # Update data for the text batch
                    batch_updated_count = 0
                    batch_forced_count = 0
                    for idx_in_batch, assigned_lesson_str in enumerate(batch_results):
                        global_q_index = batch_indices[idx_in_batch]
                        q_batch = questions_data["sections"][selected_section_index]["questions"][global_q_index]
                        
                        chosen_lesson = None
                        api_suggestion_was_valid = assigned_lesson_str in possible_lessons

                        if api_suggestion_was_valid:
                            chosen_lesson = assigned_lesson_str
                        else:
                            chosen_lesson = possible_lessons[0] # Force to the first lesson
                            batch_forced_count += 1
                            if assigned_lesson_str.lower() != "none":
                                print(f"  Info: API returned '{assigned_lesson_str}' for Q {global_q_index + 1}. Forcing to: '{chosen_lesson}'.")
                            else:
                                print(f"  Info: API suggested 'None' for Q {global_q_index + 1}. Forcing to: '{chosen_lesson}'.")
                        
                        old_lesson_val = q_batch.get("lesson")
                        if old_lesson_val != chosen_lesson:
                            q_batch["lesson"] = chosen_lesson
                            batch_updated_count += 1
                            
                    print(f"  Text Batch Summary: Updated/Set={batch_updated_count}, Forced assignments={batch_forced_count}")
                    updated_in_run += batch_updated_count
                    forced_assignments_in_run += batch_forced_count
                    questions_processed_count += len(current_text_batch_data)

                    # Save JS and State after processing text batch
                    print(f"  Saving changes from text batch to {JS_FILE_PATH}...")
                    if write_js_file(JS_FILE_PATH, questions_data, js_content_original):
                        last_successful_save_index = batch_indices[-1]
                        last_processed_indices[section_key] = last_successful_save_index + 1
                        processing_state["last_processed_indices"] = last_processed_indices
                        save_state(STATE_FILE_PATH, processing_state)
                        print(f"    JS file and resume state (up to Q {last_successful_save_index + 1}) saved.")
                    else:
                        print(f"    FATAL: Failed to save {JS_FILE_PATH} after text batch. Stopping."); sys.exit(1)
                    current_text_batch_data = [] # Clear the batch

                # 2. Process the image question individually
                print(f"--- Processing Image Question {i + 1} ---")
                q_html_raw = question_html # Use raw HTML
                opt_html_raw = format_options_raw(options_list) # Use raw option keys

                if not q_html_raw or not opt_html_raw: # Check if raw strings are empty
                    print("  Skipping image question (empty raw Q or O).")
                    skipped_missing_data_in_run += 1
                    i += 1
                    continue

                assigned_lesson = get_lesson_from_gemini_multimodal(
                    q_html_raw, opt_html_raw, image_parts, possible_lessons, chosen_model_name
                )

                img_lesson_forced = False
                if assigned_lesson: # API returned a string response
                    chosen_lesson_img = None
                    api_suggestion_valid_img = assigned_lesson in possible_lessons

                    if api_suggestion_valid_img:
                        chosen_lesson_img = assigned_lesson
                    else: 
                        chosen_lesson_img = possible_lessons[0] # Force to the first lesson
                        img_lesson_forced = True
                        if assigned_lesson.lower() != "none":
                            print(f"  Info: API returned '{assigned_lesson}' for Image Q {i + 1}. Forcing to: '{chosen_lesson_img}'.")
                        else:
                            print(f"  Info: API suggested 'None' for Image Q {i + 1}. Forcing to: '{chosen_lesson_img}'.")
                    
                    old_lesson_val = q.get("lesson")
                    if old_lesson_val != chosen_lesson_img:
                        q["lesson"] = chosen_lesson_img
                        updated_in_run += 1
                    
                    if img_lesson_forced:
                        forced_assignments_in_run += 1
                    
                    print(f"  Image Q {i+1}: Lesson set to '{chosen_lesson_img}' (Forced: {img_lesson_forced}).")

                else: # API call itself failed (assigned_lesson is None, not the string "None")
                    old_lesson_val = q.get("lesson")
                    new_lesson_val_on_error = None 
                    print(f"  Error: API call failed for Image Q {i + 1}. Setting lesson to null.")
                    if old_lesson_val != new_lesson_val_on_error:
                        q["lesson"] = new_lesson_val_on_error
                        updated_in_run += 1
                    errors_in_run += 1
                
                questions_processed_count += 1

                # Save JS and State immediately after processing image question
                print(f"  Saving changes for Image Q {i + 1} to {JS_FILE_PATH}...")
                if write_js_file(JS_FILE_PATH, questions_data, js_content_original):
                    last_successful_save_index = i
                    last_processed_indices[section_key] = last_successful_save_index + 1
                    processing_state["last_processed_indices"] = last_processed_indices
                    save_state(STATE_FILE_PATH, processing_state)
                    print(f"    JS file and resume state (up to Q {i + 1}) saved.")
                else:
                    print(f"    FATAL: Failed to save {JS_FILE_PATH} after image Q {i + 1}. Stopping."); sys.exit(1)

                i += 1 # Move to the next question index

            else: # --- It's a text-only question ---
                current_text_batch_data.append({'index': i, 'data': q})
                # print(f"  Added Q {i + 1} to text batch (current size: {len(current_text_batch_data)}).") # Less verbose

                # Check if batch is full or if it's the last question
                if len(current_text_batch_data) >= TEXT_BATCH_SIZE or i == total_questions_in_section - 1:
                    print(f"--- Processing text batch (size {len(current_text_batch_data)}) ---")
                    batch_indices = [item['index'] for item in current_text_batch_data]
                    batch_q_data = [item['data'] for item in current_text_batch_data]
                    batch_results = get_lessons_for_batch(batch_q_data, possible_lessons, chosen_model_name)

                    if batch_results is None:
                        print(f"  ERROR: Failed to process text batch ending at Q {i + 1}. Stopping run.")
                        errors_in_run += len(current_text_batch_data)
                        break # Stop processing

                    # Update data for the text batch
                    batch_updated_count = 0
                    batch_forced_count = 0
                    for idx_in_batch, assigned_lesson_str in enumerate(batch_results):
                        global_q_index = batch_indices[idx_in_batch]
                        q_batch = questions_data["sections"][selected_section_index]["questions"][global_q_index]
                        
                        chosen_lesson = None
                        api_suggestion_was_valid = assigned_lesson_str in possible_lessons

                        if api_suggestion_was_valid:
                            chosen_lesson = assigned_lesson_str
                        else:
                            chosen_lesson = possible_lessons[0] # Force to the first lesson
                            batch_forced_count += 1
                            if assigned_lesson_str.lower() != "none":
                                print(f"  Info: API returned '{assigned_lesson_str}' for Q {global_q_index + 1}. Forcing to: '{chosen_lesson}'.")
                            else:
                                print(f"  Info: API suggested 'None' for Q {global_q_index + 1}. Forcing to: '{chosen_lesson}'.")
                        
                        old_lesson_val = q_batch.get("lesson")
                        if old_lesson_val != chosen_lesson:
                            q_batch["lesson"] = chosen_lesson
                            batch_updated_count += 1
                            
                    print(f"  Text Batch Summary: Updated/Set={batch_updated_count}, Forced assignments={batch_forced_count}")
                    updated_in_run += batch_updated_count
                    forced_assignments_in_run += batch_forced_count
                    questions_processed_count += len(current_text_batch_data)


                    # Save JS and State after processing text batch
                    print(f"  Saving changes from text batch to {JS_FILE_PATH}...")
                    if write_js_file(JS_FILE_PATH, questions_data, js_content_original):
                        last_successful_save_index = batch_indices[-1]
                        last_processed_indices[section_key] = last_successful_save_index + 1
                        processing_state["last_processed_indices"] = last_processed_indices
                        save_state(STATE_FILE_PATH, processing_state)
                        print(f"    JS file and resume state (up to Q {last_successful_save_index + 1}) saved.")
                    else:
                        print(f"    FATAL: Failed to save {JS_FILE_PATH} after text batch. Stopping."); sys.exit(1)

                    current_text_batch_data = [] # Clear the batch

                i += 1 # Move to the next question index

        print("\n--- Section processing finished ---")


    print("\n--- Overall Summary ---")
    final_updated = 0; final_null = 0
    # Recalculate final counts directly from the data structure
    for q_final in questions_data["sections"][selected_section_index]["questions"]:
        lesson = q_final.get("lesson")
        if lesson and isinstance(lesson, str) and lesson.strip(): final_updated += 1
        else: final_null +=1
    print(f"Section Processed: {section_name} (Index {selected_section_index})")
    print(f"Total Questions in Section: {total_questions_in_section}")
    print(f"Final Count with Assigned Lesson: {final_updated}")
    print(f"Final Count with Null Lesson: {final_null}")
    print("--- Run Specific Stats ---")
    print(f"Questions Processed/Attempted in this run: {questions_processed_count}")
    print(f"Lessons Updated/Set in this run: {updated_in_run}")
    print(f"Forced assignments (due to API 'None' or unexpected): {forced_assignments_in_run}")
    print(f"Skipped (Missing Q/O data): {skipped_missing_data_in_run}")
    print(f"API/Processing Errors in this run: {errors_in_run}")
    print(f"\nFinal data is in '{JS_FILE_PATH}'.")
    print(f"Resume state is in '{STATE_FILE_PATH}'.")