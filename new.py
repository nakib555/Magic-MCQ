
# --- START OF FILE new_enhanced.py ---

import sys
import os
import subprocess # For pip install
import importlib # For checking and installing modules
import re
from io import StringIO, BytesIO
import json
from datetime import datetime, timezone
import time
import uuid # For session ID
import textwrap # For wrapping long lines in boxes
import shutil # For file operations like copying, and terminal size

# --- Add new imports ---
try:
    from duckduckgo_search import DDGS
except ImportError:
    DDGS = None # Handle if not installed yet

# --- Imports for Web Reading ---
try:
    import requests
except ImportError:
    requests = None
try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

# Attempt to import colorama for styled output
try:
    import colorama
    colorama.init(autoreset=True) # Initialize colorama
    Fore = colorama.Fore
    Style = colorama.Style
    STYLISH_OUTPUT = True
except ImportError:
    print("⚠️ WARNING: colorama library not found. Output will not be styled. Install with: pip install colorama")
    class DummyStyle:
        def __getattr__(self, name): return ""
    Fore = DummyStyle()
    Style = DummyStyle()
    STYLISH_OUTPUT = False

# --- Terminal Style Constants ---
SESSION_ID = str(uuid.uuid4()).split('-')[0].upper()
DEFAULT_TERMINAL_WIDTH = 80 # Fallback terminal width

# --- Box Drawing Characters (UTF-8 for better compatibility) ---
BOX_HLINE = "─"
BOX_VLINE = "│"
BOX_TL = "┌"
BOX_TR = "┐"
BOX_BL = "└"
BOX_BR = "┘"
BOX_LTEE = "├"
BOX_RTEE = "┤"

def get_current_terminal_width():
    try:
        return shutil.get_terminal_size().columns
    except Exception:
        return DEFAULT_TERMINAL_WIDTH

# --- [ print_terminal_style function remains unchanged - keep the existing code ] ---
def print_terminal_style(message, style_type="info", end="\n",
                         color_override=None, text_color_override=None,
                         box_color_override=None,
                         prefix_override=None,
                         align_char=None, align_pos=None):
    current_terminal_width = get_current_terminal_width()

    if not STYLISH_OUTPUT:
        if message is None and ("border" in style_type or "header" in style_type or "footer" in style_type or "separator" in style_type or "line" in style_type):
            if "border" in style_type or "footer" in style_type or "header" in style_type or "separator" in style_type or "line" in style_type:
                 print("-" * current_terminal_width, end=end)
                 return
        print(f"{prefix_override or ''}{message or ''}", end=end)
        return

    default_box_color = Fore.BLUE
    default_text_color = Fore.WHITE
    default_header_color = Fore.CYAN + Style.BRIGHT
    prefix_str = prefix_override if prefix_override is not None else ""

    if style_type == "system_info_major":
        prefix_color = color_override if color_override else Fore.GREEN + Style.BRIGHT
        msg_color = text_color_override if text_color_override else Fore.GREEN + Style.BRIGHT
        print(f"{prefix_color}{prefix_str}{Style.RESET_ALL}{msg_color}{message}{Style.RESET_ALL}", end=end)
        return
    elif style_type == "system_info_minor":
        prefix_color = color_override if color_override else Fore.CYAN
        msg_color = text_color_override if text_color_override else Fore.CYAN
        print(f"{prefix_color}{prefix_str}{Style.RESET_ALL}{msg_color}{message}{Style.RESET_ALL}", end=end)
        return
    elif style_type == "system_header_full_line":
        line_char = prefix_override if prefix_override else BOX_HLINE
        line_color = color_override if color_override else default_box_color
        print(f"{line_color}{line_char * current_terminal_width}{Style.RESET_ALL}", end=end)
        return
    elif style_type == "system_banner_center_text":
        side_char_text = prefix_override if prefix_override else "::"
        banner_color = color_override if color_override else default_header_color
        if message is None: message = ""

        max_message_len = current_terminal_width - (len(f" {side_char_text}  {side_char_text} ") + 4)
        max_message_len = max(0, max_message_len)
        if len(message) > max_message_len:
            message = message[:max_message_len-3] + "..." if max_message_len > 3 else message[:max_message_len]

        title_segment = f" {side_char_text} {message} {side_char_text} "
        padding_len_total = current_terminal_width - len(title_segment)
        padding_len_half = max(0, padding_len_total // 2)
        padding = BOX_HLINE * padding_len_half
        current_len = (padding_len_half * 2) + len(title_segment)
        remaining_padding = BOX_HLINE * max(0, current_terminal_width - current_len)
        print(f"{banner_color}{padding}{Style.BRIGHT}{title_segment}{Style.NORMAL}{padding}{remaining_padding}{Style.RESET_ALL}", end=end)
        return
    elif style_type == "key_value_status_line":
        key_color = text_color_override if text_color_override else Fore.WHITE
        value_color = color_override if color_override else Fore.CYAN
        if align_char and align_pos and align_char in message:
            key_part, val_part = message.split(align_char, 1)
            key_part = key_part.rstrip(); val_part = val_part.lstrip()
            prefix_len_visual = len(re.sub(r'\x1b\[[0-9;]*m', '', prefix_str))
            padding_needed = max(0, align_pos - (prefix_len_visual + len(key_part) + 1))
            available_width = current_terminal_width - (prefix_len_visual + len(key_part) + padding_needed + len(align_char) + 1)
            if len(val_part) > available_width and available_width > 3:
                val_part = val_part[:available_width-3] + "..."
            elif len(val_part) > available_width:
                val_part = val_part[:available_width]
            print(f"{prefix_str}{key_color}{key_part}{' ' * padding_needed}{align_char} {value_color}{val_part}{Style.RESET_ALL}", end=end)
        else:
            available_width = current_terminal_width - len(re.sub(r'\x1b\[[0-9;]*m', '', prefix_str))
            if len(message) > available_width and available_width > 3:
                message = message[:available_width-3] + "..."
            elif len(message) > available_width:
                message = message[:available_width]
            print(f"{prefix_str}{key_color}{message}{Style.RESET_ALL}", end=end)
        return
    elif style_type == "boxed_content_top":
        b_color = box_color_override if box_color_override else default_box_color
        title_color = text_color_override if text_color_override else (b_color + Style.BRIGHT)
        title_segment = f" {message} " if message else ""
        line_len = current_terminal_width - 2 - len(title_segment)
        left_len = max(0, line_len // 2); right_len = max(0, line_len - left_len)
        if len(title_segment) > current_terminal_width -2:
            title_segment = title_segment[:current_terminal_width-5] + "... " if current_terminal_width-2 > 5 else title_segment[:current_terminal_width-2]
            left_len=0; right_len=0
        print(f"{b_color}{BOX_TL}{BOX_HLINE * left_len}{Style.RESET_ALL}{title_color}{title_segment}{Style.RESET_ALL}{b_color}{BOX_HLINE * right_len}{BOX_TR}{Style.RESET_ALL}", end=end)
        return
    elif style_type == "boxed_content_line":
        b_color = box_color_override if box_color_override else default_box_color
        content_color = text_color_override if text_color_override else default_text_color
        content_width = current_terminal_width - 4
        content_width = max(1, content_width)
        message_str = str(message) if message is not None else ""
        original_lines = message_str.splitlines()
        if not original_lines and message_str is not None: original_lines = [""]
        elif not original_lines and message_str is None: original_lines = [""]
        processed_lines_for_display = []
        for line_content_from_original in original_lines:
            current_display_line = line_content_from_original
            if align_char and align_pos and align_char in current_display_line:
                key_part, val_part = current_display_line.split(align_char, 1)
                key_part = key_part.rstrip(); val_part = val_part.lstrip()
                padding_needed = max(0, align_pos - len(key_part) -1)
                key_segment_len = len(key_part) + padding_needed + len(align_char) + 1
                if key_segment_len >= content_width:
                    current_display_line = key_part[:content_width-3]+"..." if content_width > 3 else key_part[:content_width]
                else:
                    remaining_width_for_val = content_width - key_segment_len
                    if len(val_part) > remaining_width_for_val:
                         val_part = val_part[:remaining_width_for_val-3]+"..." if remaining_width_for_val > 3 else val_part[:remaining_width_for_val]
                    current_display_line = f"{key_part}{' ' * padding_needed}{align_char} {val_part}"
            wrapped_sub_lines = textwrap.wrap(current_display_line, width=content_width, drop_whitespace=False, replace_whitespace=False, fix_sentence_endings=False, break_long_words=True, break_on_hyphens=True)
            if not wrapped_sub_lines: processed_lines_for_display.append("".ljust(content_width))
            else:
                for sub_line in wrapped_sub_lines: processed_lines_for_display.append(sub_line.ljust(content_width))
        if not processed_lines_for_display: processed_lines_for_display.append("".ljust(content_width))
        for i, padded_line in enumerate(processed_lines_for_display):
            actual_end_char = end if (i == len(processed_lines_for_display) - 1) else "\n"
            print(f"{b_color}{BOX_VLINE} {Style.RESET_ALL}{content_color}{padded_line}{Style.RESET_ALL}{b_color} {BOX_VLINE}{Style.RESET_ALL}", end=actual_end_char)
        return
    elif style_type == "boxed_content_separator":
        b_color = box_color_override if box_color_override else default_box_color
        print(f"{b_color}{BOX_LTEE}{BOX_HLINE * max(0, current_terminal_width - 2)}{BOX_RTEE}{Style.RESET_ALL}", end=end)
        return
    elif style_type == "boxed_content_bottom":
        b_color = box_color_override if box_color_override else default_box_color
        print(f"{b_color}{BOX_BL}{BOX_HLINE * max(0, current_terminal_width - 2)}{BOX_BR}{Style.RESET_ALL}", end=end)
        return
    elif style_type == "status_emoji_line":
        line_color = color_override if color_override else Fore.CYAN
        available_width = current_terminal_width - len(re.sub(r'\x1b\[[0-9;]*m', '', prefix_str)) - 1
        msg_content = f"{message}"
        if len(msg_content) > available_width: msg_content = msg_content[:available_width-3]+"..." if available_width > 3 else msg_content[:available_width]
        print(f"{line_color}{prefix_str} {msg_content}{Style.RESET_ALL}", end=end)
        return
    elif style_type == "command_item_line":
        cmd_color = text_color_override if text_color_override else Fore.YELLOW
        desc_color = color_override if color_override else Fore.WHITE
        if align_char and align_pos and align_char in message:
            cmd_part, desc_part = message.split(align_char, 1)
            cmd_part = cmd_part.rstrip(); desc_part = desc_part.lstrip()
            prefix_len_visual = len(re.sub(r'\x1b\[[0-9;]*m', '', prefix_str))
            padding_needed = max(0, align_pos - (prefix_len_visual + len(cmd_part) + 1))
            available_width_for_desc = current_terminal_width - (prefix_len_visual + len(cmd_part) + padding_needed + len(align_char) + 1)
            if len(desc_part) > available_width_for_desc and available_width_for_desc > 3: desc_part = desc_part[:available_width_for_desc-3] + "..."
            elif len(desc_part) > available_width_for_desc: desc_part = desc_part[:available_width_for_desc]
            print(f"{prefix_str}{cmd_color}{cmd_part}{' ' * padding_needed}{align_char} {desc_color}{desc_part}{Style.RESET_ALL}", end=end)
        else:
            available_width = current_terminal_width - len(re.sub(r'\x1b\[[0-9;]*m', '', prefix_str))
            if len(message) > available_width and available_width > 3: message = message[:available_width-3] + "..."
            elif len(message) > available_width: message = message[:available_width]
            print(f"{prefix_str}{cmd_color}{message}{Style.RESET_ALL}", end=end)
        return
    elif style_type == "response_box_inner_hline_indented":
        b_color = box_color_override if box_color_override else default_box_color
        indent_spaces = prefix_override if prefix_override is not None else "  "
        line_width = current_terminal_width - 4 - (len(indent_spaces) * 2); line_width = max(0, line_width)
        print(f"{b_color}{BOX_VLINE}{indent_spaces}{BOX_HLINE * line_width}{indent_spaces}{BOX_VLINE}{Style.RESET_ALL}", end=end)
        return
    elif style_type == "response_box_inner_line_indented":
        b_color = box_color_override if box_color_override else default_box_color
        content_color = text_color_override if text_color_override else default_text_color
        indent_spaces_str = "  "; inner_prefix_literal = "| "; inner_prefix_visual_len = len(inner_prefix_literal)
        text_wrap_width = current_terminal_width - (1 + len(indent_spaces_str) + inner_prefix_visual_len + 1 + len(indent_spaces_str) + 1)
        text_wrap_width = max(1, text_wrap_width)
        message_to_wrap = str(message) if message is not None else ""
        processed_lines_for_display = []
        original_lines = message_to_wrap.splitlines()
        if not original_lines and message_to_wrap: original_lines = [message_to_wrap]
        elif not original_lines: original_lines = [""]
        for line_content_from_original in original_lines:
            current_display_line = line_content_from_original
            if align_char and align_pos and align_char in current_display_line:
                key_part, val_part = current_display_line.split(align_char, 1)
                key_part = key_part.rstrip(); val_part = val_part.lstrip()
                key_padding_needed = max(0, align_pos - len(key_part) -1)
                key_segment_len = len(key_part) + key_padding_needed + len(align_char) + 1
                if key_segment_len >= text_wrap_width: current_display_line = key_part[:text_wrap_width-3]+"..." if text_wrap_width > 3 else key_part[:text_wrap_width]
                else:
                    remaining_width_for_val = text_wrap_width - key_segment_len
                    if len(val_part) > remaining_width_for_val: val_part = val_part[:remaining_width_for_val-3]+"..." if remaining_width_for_val > 3 else val_part[:remaining_width_for_val]
                    current_display_line = f"{key_part}{' ' * key_padding_needed}{align_char} {val_part}"
            wrapped_sub_lines = textwrap.wrap(current_display_line, width=text_wrap_width, drop_whitespace=False, replace_whitespace=False, fix_sentence_endings=False, break_long_words=True, break_on_hyphens=True)
            if not wrapped_sub_lines: processed_lines_for_display.append("".ljust(text_wrap_width))
            else:
                for sub_line in wrapped_sub_lines: processed_lines_for_display.append(sub_line.ljust(text_wrap_width))
        if not processed_lines_for_display: processed_lines_for_display.append("".ljust(text_wrap_width))
        for i, padded_line_text in enumerate(processed_lines_for_display):
            actual_end_char = end if (i == len(processed_lines_for_display) - 1) else "\n"
            print(f"{b_color}{BOX_VLINE}{Style.RESET_ALL}{indent_spaces_str}", end="")
            print(f"{b_color}{inner_prefix_literal}{Style.RESET_ALL}{content_color}{padded_line_text}{Style.RESET_ALL}", end="")
            print(f"{indent_spaces_str}{b_color}{BOX_VLINE}{Style.RESET_ALL}", end=actual_end_char)
        return
    elif style_type == "response_box_arrow_line":
        b_color = box_color_override if box_color_override else default_box_color
        arrow_color = color_override if color_override else Fore.CYAN
        text_col = text_color_override if text_color_override else Fore.WHITE
        indent_spaces_str = "  "; arrow_str_literal = "=> "
        content_width_for_message = current_terminal_width - (1 + len(indent_spaces_str) + len(arrow_str_literal) + 1 + 1)
        content_width_for_message = max(1, content_width_for_message)
        message_str = str(message) if message is not None else ""
        processed_lines_for_display = []
        original_lines = message_str.splitlines()
        if not original_lines and message_str: original_lines = [message_str]
        elif not original_lines: original_lines = [""]
        for line_content_from_original in original_lines:
            wrapped_sub_lines = textwrap.wrap(line_content_from_original, width=content_width_for_message, drop_whitespace=False, replace_whitespace=False, fix_sentence_endings=False, break_long_words=True, break_on_hyphens=True)
            if not wrapped_sub_lines: processed_lines_for_display.append("".ljust(content_width_for_message))
            else:
                for sub_line in wrapped_sub_lines: processed_lines_for_display.append(sub_line.ljust(content_width_for_message))
        if not processed_lines_for_display: processed_lines_for_display.append("".ljust(content_width_for_message))
        for i, padded_line_text in enumerate(processed_lines_for_display):
            actual_end_char = end if (i == len(processed_lines_for_display) - 1) else "\n"
            print(f"{b_color}{BOX_VLINE}{Style.RESET_ALL}{indent_spaces_str}"
                  f"{arrow_color}{arrow_str_literal}{Style.RESET_ALL}"
                  f"{text_col}{padded_line_text}{Style.RESET_ALL}"
                  f"{b_color} {BOX_VLINE}{Style.RESET_ALL}", end=actual_end_char)
        return
    elif style_type == "user_prompt_ready_text":
        prefix_color = color_override if color_override else Fore.GREEN + Style.BRIGHT
        msg_color = text_color_override if text_color_override else Fore.GREEN + Style.BRIGHT
        available_width = current_terminal_width - len(re.sub(r'\x1b\[[0-9;]*m', '', prefix_str))
        msg_content = f"{message}"
        if len(msg_content) > available_width and available_width > 3: msg_content = msg_content[:available_width-3]+"..."
        elif len(msg_content) > available_width: msg_content = msg_content[:available_width]
        print(f"{prefix_color}{prefix_str}{Style.RESET_ALL}{msg_color}{msg_content}{Style.RESET_ALL}", end=end)
        return
    elif style_type == "user_prompt_cursor_line":
        prefix_color = color_override if color_override else Fore.GREEN + Style.BRIGHT
        available_width = current_terminal_width - len(re.sub(r'\x1b\[[0-9;]*m', '', prefix_str))
        msg_content = f"{message}"
        if len(msg_content) > available_width: msg_content = msg_content[:available_width]
        print(f"{prefix_color}{prefix_str}{msg_content}{Style.RESET_ALL}", end="", flush=True)
        return
    elif style_type == "general_info":
        prefix = "ℹ️ "; available_width = current_terminal_width - len(prefix)
        msg_content = f"{message}"
        if len(msg_content) > available_width and available_width > 3: msg_content = msg_content[:available_width-3]+"..."
        elif len(msg_content) > available_width: msg_content = msg_content[:available_width]
        print(f"{Fore.CYAN}{prefix}{msg_content}{Style.RESET_ALL}", end=end)
        return
    elif style_type == "general_success":
        prefix = "✅ "; available_width = current_terminal_width - len(prefix)
        msg_content = f"{message}"
        if len(msg_content) > available_width and available_width > 3: msg_content = msg_content[:available_width-3]+"..."
        elif len(msg_content) > available_width: msg_content = msg_content[:available_width]
        print(f"{Fore.GREEN}{prefix}{msg_content}{Style.RESET_ALL}", end=end)
        return
    elif style_type == "general_warning":
        prefix = "⚠️ "; available_width = current_terminal_width - len(prefix)
        msg_content = f"{message}"
        if len(msg_content) > available_width and available_width > 3: msg_content = msg_content[:available_width-3]+"..."
        elif len(msg_content) > available_width: msg_content = msg_content[:available_width]
        print(f"{Fore.YELLOW}{prefix}{msg_content}{Style.RESET_ALL}", end=end)
        return
    elif style_type == "general_error":
        prefix = "🚨 "; available_width = current_terminal_width - len(prefix)
        msg_content = f"{message}"
        if len(msg_content) > available_width and available_width > 3: msg_content = msg_content[:available_width-3]+"..."
        elif len(msg_content) > available_width: msg_content = msg_content[:available_width]
        print(f"{Fore.RED}{prefix}{msg_content}{Style.RESET_ALL}", end=end)
        return
    elif style_type == "ai_raw_response_snippet": return # Suppress raw output unless debugging
    else: # Default fallback
        available_width = current_terminal_width - len(re.sub(r'\x1b\[[0-9;]*m', '', prefix_str))
        msg_content = f"{message}"
        if len(msg_content) > available_width and available_width > 3: msg_content = msg_content[:available_width-3]+"..."
        elif len(msg_content) > available_width: msg_content = msg_content[:available_width]
        print(f"{default_text_color}{prefix_str}{msg_content}{Style.RESET_ALL}", end=end)


def get_terminal_input(prompt_message, prompt_color=Fore.GREEN + Style.BRIGHT, show_cursor=True):
    print_terminal_style(prompt_message, "user_prompt_ready_text", prefix_override="> ", color_override=prompt_color, text_color_override=prompt_color)
    cursor_line_prefix = "> "; cursor_text = "_ █" if show_cursor else ""
    print_terminal_style(cursor_text, "user_prompt_cursor_line", prefix_override=cursor_line_prefix, color_override=prompt_color)
    return input()

# --- Gemini and Script Configuration ---
if STYLISH_OUTPUT: pass
else: pass
import google.generativeai as genai

# Check for PIL (Pillow) and the necessary SDK Part class/method
_PartClass = None
_part_class_origin = "unknown"
_part_class_has_from_data = False # We won't rely on this for sending, but check for info

try: from PIL import ImageGrab, Image
except ImportError: ImageGrab = None; Image = None

# Check for SDK Part class and from_data method for informational purposes
try:
    from google.generativeai.types import Part as GenAiPart
    _PartClass = GenAiPart
    _part_class_origin = "google.generativeai.types.Part"
    if callable(getattr(_PartClass, "from_data", None)):
        _part_class_has_from_data = True
except (ImportError, AttributeError, ModuleNotFoundError):
    try:
        _PartClass = genai.Part
        _part_class_origin = "genai.Part"
        if callable(getattr(_PartClass, "from_data", None)):
            _part_class_has_from_data = True
    except AttributeError:
        pass # _PartClass remains None or doesn't have from_data


# --- Update IMPORT_TO_PACKAGE_MAP ---
IMPORT_TO_PACKAGE_MAP = {
    "cv2": "opencv-python",
    "pyautogui": "PyAutoGUI",
    "pygetwindow": "PyGetWindow",
    "pywinauto": "pywinauto",
    "selenium": "selenium",
    "win32api": "pywin32",
    "win32gui": "pywin32",
    "win32con": "pywin32",
    "autopy": "autopy",
    "pynput": "pynput",
    "numpy": "numpy",
    "requests": "requests",
    "duckduckgo_search": "duckduckgo-search",
    "bs4": "beautifulsoup4" # Added mapping for BeautifulSoup
}
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
DOWNLOADS_DIR = "ai_downloads"
# AUTONOMOUS_LOG_FILE = "autonomous_agent_log.jsonl" # REMOVED LOG FILE
DEFAULT_MODEL_NAME = "gemini-1.5-flash-latest" # Changed default to Flash for potentially faster iteration
SELECTED_MODEL_NAME = os.environ.get("GEMINI_SELECTED_MODEL", DEFAULT_MODEL_NAME)
SCREENSHOT_FILENAME = "current_visual_context.png"; MAX_AUTONOMOUS_ITERATIONS = 30
USER_CONFIRM_INSTALL = True
current_goal = ""; history_of_actions = []; ai_model_instance = None # Initialize globally

# --- [ configure_gemini_apikey, select_model_cli, extract_json_from_ai_response functions remain unchanged ] ---
def configure_gemini_apikey():
    global GEMINI_API_KEY
    if not GEMINI_API_KEY:
        print_terminal_style("GEMINI_API_KEY environment variable not set.", "general_error")
        api_key_env = get_terminal_input("Please enter your Gemini API Key (or press Enter to exit):", prompt_color=Fore.YELLOW)
        if not api_key_env: print_terminal_style("No API key provided. Exiting.", "general_error"); sys.exit(1)
        GEMINI_API_KEY = api_key_env
    try: genai.configure(api_key=GEMINI_API_KEY)
    except Exception as e:
        print_terminal_style(f"Gemini API Key Config: FAILED ({e})", "key_value_status_line", prefix_override=f"{Fore.RED}[✗] {Style.RESET_ALL}", text_color_override=Fore.WHITE, color_override=Fore.RED, align_char=":", align_pos=25); sys.exit(1)

def select_model_cli(model_names_list, default_model_name_to_use):
    global SELECTED_MODEL_NAME
    print_terminal_style(None, "system_header_full_line")
    print_terminal_style("SELECT AI MODEL", "system_banner_center_text", color_override=Fore.CYAN, prefix_override="::")
    if not model_names_list:
        print_terminal_style(f"No specific AI models found. Using default: {default_model_name_to_use}", "general_warning")
        SELECTED_MODEL_NAME = default_model_name_to_use; return default_model_name_to_use
    display_list = sorted(list(set(model_names_list)))
    default_in_list_marked = False
    for i, name in enumerate(display_list):
        if name == default_model_name_to_use:
            display_list[i] = f"{name} (current default)"; default_in_list_marked = True
            item = display_list.pop(i); display_list.insert(0, item); break
    if not default_in_list_marked and default_model_name_to_use: display_list.insert(0, f"{default_model_name_to_use} (current default, may not be in discovered list)")
    for i, name in enumerate(display_list):
        item_color = Fore.GREEN if '(current default)' in name else Fore.WHITE
        print_terminal_style(f"{i+1}. {name.split('/')[-1]}", "system_info_minor", prefix_override="  ", text_color_override=item_color)
    while True:
        try:
            prompt_msg = f"Choose model (1-{len(display_list)}) or Enter for current default '{default_model_name_to_use.split('/')[-1]}'"
            choice_str = get_terminal_input(prompt_msg, show_cursor=True).strip()
            if not choice_str:
                print_terminal_style(f"Default '{default_model_name_to_use.split('/')[-1]}' selected.", "general_info")
                SELECTED_MODEL_NAME = default_model_name_to_use; return default_model_name_to_use
            choice = int(choice_str)
            if 1 <= choice <= len(display_list):
                final_selected_name = display_list[choice-1].split(" (")[0]
                print_terminal_style(f"AI Model Selected: {final_selected_name.split('/')[-1]}", "general_success")
                SELECTED_MODEL_NAME = final_selected_name; return final_selected_name
            else: print_terminal_style(f"Invalid choice. Enter 1-{len(display_list)}.", "general_warning")
        except ValueError: print_terminal_style("Invalid input. Enter a number.", "general_warning")
        except Exception as e:
            print_terminal_style(f"An error occurred during model selection: {e}", "general_error")
            SELECTED_MODEL_NAME = default_model_name_to_use; return default_model_name_to_use

def extract_json_from_ai_response(text_response):
    if not text_response: return None
    json_str = None; match = re.search(r"```(?:json\n)?(.*?)\s*```", text_response, re.DOTALL)
    if match: json_str = match.group(1).strip()
    else:
        first_brace = text_response.find('{'); last_brace = text_response.rfind('}')
        if first_brace != -1 and last_brace > first_brace: json_str = text_response[first_brace : last_brace + 1]
        elif '"tool_name":' in text_response: json_str = text_response # Basic fallback
    if json_str:
        try: return json.loads(json_str)
        except json.JSONDecodeError as e:
            print_terminal_style(f"JSON Decode Error: {str(e)[:50]}", "general_warning")
            # Try to extract tool_name even if JSON is broken
            tool_name_match = re.search(r'"tool_name"\s*:\s*"([^"]+)"', json_str)
            if tool_name_match:
                 print_terminal_style(f"Attempting recovery: Found tool_name '{tool_name_match.group(1)}' despite JSON error.", "general_warning")
                 return {"tool_name": tool_name_match.group(1), "tool_input": {}, "thought": "JSON parsing failed, extracted tool_name only."}
            else:
                 print_terminal_style(f"Raw JSON tried: {json_str[:100]}...", "ai_raw_response_snippet") # Show snippet only if recovery fails
    return None

# --- REMOVED log_interaction function ---
# def log_interaction(log_entry, log_file=AUTONOMOUS_LOG_FILE):
#     try:
#         with open(log_file, "a", encoding="utf-8") as f: f.write(json.dumps(log_entry) + "\n")
#     except Exception as e: print_terminal_style(f"Error writing to log file {log_file}: {e}", "general_error")


# --- [ take_screenshot_tool_internal, install_package functions remain unchanged ] ---
def take_screenshot_tool_internal(filename_suffix=""):
    if ImageGrab is None: return {"status": "error", "message": "Pillow (PIL) library not found for screenshots."}
    try:
        os.makedirs(DOWNLOADS_DIR, exist_ok=True)
        base, ext = os.path.splitext(SCREENSHOT_FILENAME)
        safe_suffix = re.sub(r'[^\w_.)( -]', '', filename_suffix) if filename_suffix else ""
        actual_filename = f"{base}_{safe_suffix}{ext}" if safe_suffix else SCREENSHOT_FILENAME
        path = os.path.join(DOWNLOADS_DIR, actual_filename)
        ImageGrab.grab().save(path, "PNG")
        return {"status": "success", "screenshot_path": path, "message": f"Screenshot captured: {os.path.basename(path)}"}
    except Exception as e: return {"status": "error", "message": f"Screenshot capture failed: {e}"}

def install_package(package_name):
    print_terminal_style(f"Attempting to install missing package: {package_name}...", "general_info")
    try: subprocess.check_call([sys.executable, "-m", "pip", "install", package_name]); print_terminal_style(f"Successfully installed {package_name}.", "general_success"); return True
    except subprocess.CalledProcessError as e: print_terminal_style(f"Failed to install {package_name}. Pip error: {e}", "general_error"); return False
    except Exception as e: print_terminal_style(f"An unexpected error occurred during installation of {package_name}: {e}", "general_error"); return False

# --- [ check_and_install_dependencies function remains unchanged ] ---
def check_and_install_dependencies(code_string, check_web_scraping=False):
    global DDGS, requests, BeautifulSoup # Ensure we can modify globals if installed

    modules_to_check = set()
    # Check for direct imports in code string
    imports = re.findall(r"^\s*(?:from\s+([\w.]+)\s+import\s+[\w.*]+|import\s+([\w.]+))", code_string, re.MULTILINE)
    for imp_group in imports:
        module_name = imp_group[0] or imp_group[1]
        if module_name:
            base_module_name = module_name.split('.')[0]
            modules_to_check.add(base_module_name)

    # Add web scraping dependencies if requested by the tool
    if check_web_scraping:
        modules_to_check.add("requests")
        modules_to_check.add("bs4") # BeautifulSoup is imported from bs4

    # Check for duckduckgo_search if it's used directly or needed by web_search
    if 'duckduckgo_search' in code_string or 'web_search' in code_string or check_web_scraping: # Check if web_search tool might be used
        modules_to_check.add("duckduckgo_search")

    missing_packages_to_install = set()
    all_base_modules_checked = set()

    for base_module_name in modules_to_check:
        if base_module_name in all_base_modules_checked: continue
        all_base_modules_checked.add(base_module_name)

        # Check if already loaded globally
        if base_module_name == "requests" and requests is not None: continue
        if base_module_name == "bs4" and BeautifulSoup is not None: continue
        if base_module_name == "duckduckgo_search" and DDGS is not None: continue

        try:
            importlib.import_module(base_module_name)
            # If import succeeds, update global reference if it was None
            if base_module_name == "requests":
                globals()['requests'] = importlib.import_module("requests")
            elif base_module_name == "bs4":
                globals()['BeautifulSoup'] = importlib.import_module("bs4").BeautifulSoup
            elif base_module_name == "duckduckgo_search":
                globals()['DDGS'] = importlib.import_module("duckduckgo_search").DDGS
        except ImportError:
            package_name = IMPORT_TO_PACKAGE_MAP.get(base_module_name)
            if package_name:
                print_terminal_style(f"Module '{base_module_name}' (for pip package '{package_name}') appears to be missing.", "general_warning")
                missing_packages_to_install.add((base_module_name, package_name))
            else:
                print_terminal_style(f"Module '{base_module_name}' is missing, and no known pip package mapping exists for it.", "general_warning")

    if not missing_packages_to_install: return True # Return early if nothing else is missing

    # Install missing packages
    for base_module_name_to_check, package_name_to_install in missing_packages_to_install:
        if USER_CONFIRM_INSTALL:
            confirm = get_terminal_input(f"Tool requires '{package_name_to_install}' (for module '{base_module_name_to_check}'). Install it? (y/n): ", show_cursor=True).strip().lower()
            if confirm != 'y':
                print_terminal_style(f"Installation of '{package_name_to_install}' skipped by user. Tool execution may fail.", "general_warning")
                return False # Stop if dependency skipped
        if not install_package(package_name_to_install):
            print_terminal_style(f"Failed to install '{package_name_to_install}'. Tool execution may fail.", "general_error")
            return False # Stop if install fails
        try:
            importlib.invalidate_caches()
            module_instance = importlib.import_module(base_module_name_to_check)
            # Update global references after successful install
            if base_module_name_to_check == "requests":
                globals()['requests'] = module_instance
            elif base_module_name_to_check == "bs4":
                globals()['BeautifulSoup'] = getattr(module_instance, 'BeautifulSoup', None) # Get BeautifulSoup class
            elif base_module_name_to_check == "duckduckgo_search":
                 globals()['DDGS'] = getattr(module_instance, 'DDGS', None) # Get DDGS class

            print_terminal_style(f"Successfully imported '{base_module_name_to_check}' after installation.", "general_success")

        except ImportError:
            print_terminal_style(f"Still unable to import '{base_module_name_to_check}' even after attempting to install '{package_name_to_install}'.", "general_error")
            return False
        except AttributeError:
             print_terminal_style(f"Imported '{base_module_name_to_check}' but couldn't find expected class/object after install.", "general_error")
             return False

    # Final check if web scraping libs are loaded if they were required
    if check_web_scraping:
        if requests is None:
            print_terminal_style("`requests` library still not available after checks.", "general_error")
            return False
        if BeautifulSoup is None:
            print_terminal_style("`BeautifulSoup` library still not available after checks.", "general_error")
            return False
    if ('web_search' in code_string or check_web_scraping) and DDGS is None: # Re-check DDGS specifically if web_search was intended
         print_terminal_style("`duckduckgo-search` library still not available after checks.", "general_error")
         return False

    return True


# --- Tool Implementations ---

# --- [ run_python_script_in_sandbox, run_powershell_subprocess functions remain unchanged ] ---
def run_python_script_in_sandbox(code_string):
    if not code_string: return {"status": "error", "stdout": "", "stderr": "No code provided."}
    print_terminal_style("Python Dependency Check for AI Code", "system_banner_center_text", color_override=Fore.CYAN, prefix_override="::")
    # Pass the code string to check for its specific imports
    if not check_and_install_dependencies(code_string):
        return {"status": "error", "stdout": "", "stderr": "Dependency check or installation failed. Cannot execute code."}
    print_terminal_style("Dependencies OK or handled.", "general_success")
    stdout_val, stderr_val, downloaded_file_val = execute_generated_code_internal(code_string)
    result = {"status": "success" if not stderr_val or ("error" not in stderr_val.lower() and "failed" not in stderr_val.lower()) else "error_in_script", "stdout": stdout_val, "stderr": stderr_val}
    if downloaded_file_val: result["downloaded_file"] = downloaded_file_val
    return result

def run_powershell_subprocess(command):
    if os.name != 'nt': return {"status": "error", "stdout": "", "stderr": "PowerShell execution is only supported on Windows."}
    if not command: return {"status": "error", "stdout": "", "stderr": "No PowerShell command provided."}
    ps_exec = r"C:\Program Files\PowerShell\7\pwsh.exe" if os.path.exists(r"C:\Program Files\PowerShell\7\pwsh.exe") else "powershell.exe"
    try:
        process = subprocess.run([ps_exec, "-NoProfile", "-NonInteractive", "-Command", command], capture_output=True, text=True, check=False, timeout=60)
        return {"status": "success" if process.returncode == 0 else "error_in_script", "stdout": process.stdout.strip(), "stderr": process.stderr.strip(), "return_code": process.returncode}
    except subprocess.TimeoutExpired: return {"status": "error", "stdout": "", "stderr": "PowerShell command timed out (60 seconds).", "return_code": -1}
    except Exception as e: return {"status": "error", "stdout": "", "stderr": f"Python error during PowerShell execution: {e}", "return_code": -1}

# --- [ read_own_code_tool_internal, modify_own_code_tool_internal, revert_to_previous_code_version_tool_internal, change_ai_model_tool_internal functions remain unchanged ] ---
def read_own_code_tool_internal():
    try:
        script_path = os.path.abspath(__file__)
        with open(script_path, "r", encoding="utf-8") as f: current_code = f.read()
        return {"status": "success", "current_code_content": current_code, "message": f"Successfully read own source code from {script_path}."}
    except Exception as e: return {"status": "error", "message": f"Failed to read own code: {e}"}

def modify_own_code_tool_internal(new_code_content):
    if not new_code_content or not isinstance(new_code_content, str): return {"status": "error", "message": "No new code content provided or content is not a string."}
    try:
        script_path = os.path.abspath(__file__); backup_path = script_path + ".bak"
        print_terminal_style(f"Attempting to modify own code at: {script_path}", "general_info")
        print_terminal_style(f"Backup of current script will be saved to: {backup_path}", "general_info")
        try: shutil.copy2(script_path, backup_path); print_terminal_style(f"Backup successful: {backup_path}", "general_success")
        except Exception as e_bak:
            print_terminal_style(f"CRITICAL: Could not create backup of script to {backup_path}: {e_bak}", "general_error")
            return {"status": "error", "message": f"Failed to create backup {backup_path}. Code modification aborted. Error: {e_bak}"}
        with open(script_path, "w", encoding="utf-8") as f: f.write(new_code_content)
        return {"status": "code_modified_restart_required", "message": f"Successfully updated own code at {script_path}. Backup at {backup_path}. RESTART SCRIPT MANUALLY."}
    except Exception as e: return {"status": "error", "message": f"Failed to modify own code: {e}. Backup might exist at {backup_path}."}

def revert_to_previous_code_version_tool_internal():
    try:
        script_path = os.path.abspath(__file__); backup_path = script_path + ".bak"
        print_terminal_style(f"Attempting to revert code from backup: {backup_path}", "general_info")
        if not os.path.exists(backup_path): return {"status": "error", "message": f"No backup file found at {backup_path}."}
        temp_current_script_path = script_path + ".tmp_revert_issue"
        try:
            shutil.copy2(script_path, temp_current_script_path); shutil.copy2(backup_path, script_path)
        except Exception as e_revert:
            if os.path.exists(temp_current_script_path):
                try: shutil.copy2(temp_current_script_path, script_path)
                except Exception as e_restore_tmp: return {"status": "error", "message": f"CRITICAL: Failed to revert: {e_revert}. Failed to restore temp: {e_restore_tmp}."}
                finally:
                    try: os.remove(temp_current_script_path)
                    except Exception as e_remove_tmp: print_terminal_style(f"Warning: Failed to remove temp file {temp_current_script_path}: {e_remove_tmp}", "general_warning")
            return {"status": "error", "message": f"Failed to revert code from backup: {e_revert}."}
        finally:
             if os.path.exists(temp_current_script_path):
                 try: os.remove(temp_current_script_path)
                 except Exception as e_remove_tmp: print_terminal_style(f"Warning: Failed to remove temp file {temp_current_script_path}: {e_remove_tmp}", "general_warning")

        return {"status": "code_reverted_restart_required", "message": f"Successfully reverted code from {backup_path} to {script_path}. RESTART SCRIPT MANUALLY."}
    except Exception as e: return {"status": "error", "message": f"Unexpected error during revert: {e}"}

def change_ai_model_tool_internal(args):
    global SELECTED_MODEL_NAME, ai_model_instance # These globals will be modified

    reason = args.get("reason_for_change", "AI initiated model change.")
    print_terminal_style(f"AI requested model change. Reason: {reason}", "general_info")

    previous_model_name_before_change_attempt = SELECTED_MODEL_NAME
    all_models_for_change = []

    try:
        print_terminal_style("Re-discovering compatible models from Gemini API...", "system_info_minor", prefix_override=">> ")
        all_models_for_change = sorted([m.name for m in genai.list_models() if 'generateContent' in m.supported_generation_methods])
        if not all_models_for_change:
            msg = "No models supporting 'generateContent' found via API. Cannot change model now."
            print_terminal_style(msg, "general_warning")
            return {"status": "error_no_models_found", "message": msg, "model_changed": False}
    except Exception as e:
        msg = f"Error listing models from Gemini API: {e}. Cannot change model now."
        print_terminal_style(msg, "general_warning")
        return {"status": "error_api_listing_failed", "message": msg, "model_changed": False}

    # select_model_cli updates SELECTED_MODEL_NAME globally via user interaction
    select_model_cli(all_models_for_change, previous_model_name_before_change_attempt)

    if SELECTED_MODEL_NAME != previous_model_name_before_change_attempt:
        print_terminal_style(f"Attempting to switch to new model: {SELECTED_MODEL_NAME.split('/')[-1]}", "general_info")
        try:
            ai_model_instance = genai.GenerativeModel(SELECTED_MODEL_NAME) # Re-assign global ai_model_instance
            msg = f"AI Model successfully changed to: {SELECTED_MODEL_NAME.split('/')[-1]}. Chat session will be re-initialized by the system."
            print_terminal_style(msg, "general_success")
            return {"status": "success_model_changed", "message": msg, "new_model_name": SELECTED_MODEL_NAME, "model_changed": True}
        except Exception as e:
            msg = f"CRITICAL FAILURE: Could not initialize new AI model '{SELECTED_MODEL_NAME}': {e}"
            print_terminal_style(msg, "general_error")
            print_terminal_style(f"Reverting to previous model: {previous_model_name_before_change_attempt.split('/')[-1]}.", "general_warning")
            SELECTED_MODEL_NAME = previous_model_name_before_change_attempt # Revert global name
            try:
                ai_model_instance = genai.GenerativeModel(SELECTED_MODEL_NAME) # Re-init global instance with old
                print_terminal_style(f"Successfully reverted to model: {SELECTED_MODEL_NAME.split('/')[-1]}", "general_success")
                return {"status": "error_reverted_to_previous", "message": f"Failed to switch model, reverted to {SELECTED_MODEL_NAME.split('/')[-1]}. Error: {e}", "model_changed": False}
            except Exception as e_revert:
                critical_msg = f"CRITICAL FAILURE: Could not re-initialize previous model '{SELECTED_MODEL_NAME}' after a failed switch: {e_revert}. Agent may be unstable."
                print_terminal_style(critical_msg, "general_error")
                return {"status": "error_critical_revert_failed", "message": critical_msg, "model_changed": False}
    else:
        msg = f"Model selection cancelled or model unchanged. Current model remains: {SELECTED_MODEL_NAME.split('/')[-1]}"
        print_terminal_style(msg, "general_info")
        return {"status": "success_no_change", "message": msg, "model_changed": False}

# --- [ web_search_tool_internal function remains unchanged ] ---
def web_search_tool_internal(query, num_results=5, num_pages_to_read=3):
    """
    Performs a web search using DuckDuckGo, optionally fetches and reads
    content from the top results.
    """
    global DDGS, requests, BeautifulSoup # Allow access to globals

    # --- Dependency Checks ---
    if DDGS is None or requests is None or BeautifulSoup is None:
        print_terminal_style("Web search/read dependencies missing. Checking/installing...", "general_warning")
        # Pass check_web_scraping=True to ensure requests and bs4 are checked
        if not check_and_install_dependencies("web_search", check_web_scraping=True): # Pass a string that implies web_search tool
            return {"status": "error", "message": "Required libraries (duckduckgo-search, requests, beautifulsoup4) not installed or failed to install."}
        # Re-check after install attempt
        if DDGS is None or requests is None or BeautifulSoup is None:
             return {"status": "error", "message": "Required libraries failed to load even after install attempt."}

    if not query:
        return {"status": "error", "message": "No search query provided."}

    # Clamp num_pages_to_read to a reasonable maximum (e.g., 5)
    MAX_PAGES_TO_READ = 5
    actual_num_pages_to_read = min(max(0, num_pages_to_read), MAX_PAGES_TO_READ)
    if num_pages_to_read > MAX_PAGES_TO_READ:
        print_terminal_style(f"Requested to read {num_pages_to_read} pages, but clamping to {MAX_PAGES_TO_READ} to limit runtime.", "general_warning")

    try:
        print_terminal_style(f"Performing web search for: '{query}' (max {num_results} results)", "general_info")
        search_results_list = []
        with DDGS() as ddgs:
            # Get slightly more results initially if reading pages, in case some fail
            fetch_num = max(num_results, actual_num_pages_to_read)
            ddgs_results_gen = ddgs.text(query, max_results=fetch_num)
            search_results_list = list(ddgs_results_gen) # Convert generator to list

        if not search_results_list:
            return {"status": "success_no_results", "message": f"Search for '{query}' completed, but no results were found."}

        processed_results = []
        pages_read_count = 0
        # Process results: add basic info first
        for r in search_results_list[:num_results]: # Limit to requested num_results for final output list
             processed_results.append({
                "title": r.get('title', 'N/A'),
                "url": r.get('href', 'N/A'),
                "snippet": r.get('body', 'N/A'),
                "read_content_snippet": None # Placeholder
            })

        # Attempt to read content for the top pages if requested
        if actual_num_pages_to_read > 0:
            print_terminal_style(f"Attempting to read content from top {actual_num_pages_to_read} results...", "general_info")
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'} # Basic user agent
            READ_SNIPPET_LENGTH = 1000 # Max characters to store from read page

            for i in range(min(len(processed_results), actual_num_pages_to_read)):
                result_item = processed_results[i]
                url = result_item.get('url')
                if not url or not url.startswith(('http://', 'https://')):
                    result_item['read_content_snippet'] = "[Read Skipped: Invalid URL]"
                    continue

                print_terminal_style(f"  Reading [{i+1}/{actual_num_pages_to_read}]: {url[:70]}...", "system_info_minor", prefix_override="  -> ")
                try:
                    response = requests.get(url, headers=headers, timeout=15, allow_redirects=True) # Increased timeout
                    response.raise_for_status() # Check for HTTP errors

                    content_type = response.headers.get('content-type', '').lower()
                    if 'html' not in content_type:
                        result_item['read_content_snippet'] = f"[Read Skipped: Content-Type not HTML ({content_type})]"
                        continue

                    # Basic text extraction using BeautifulSoup
                    soup = BeautifulSoup(response.text, 'html.parser')

                    # Remove script and style elements
                    for script_or_style in soup(["script", "style"]):
                        script_or_style.decompose()

                    # Get text, try to remove excess whitespace
                    text = soup.get_text()
                    lines = (line.strip() for line in text.splitlines())
                    chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
                    text = '\n'.join(chunk for chunk in chunks if chunk)

                    if not text:
                         result_item['read_content_snippet'] = "[Read Success: No text content found after parsing]"
                    else:
                        result_item['read_content_snippet'] = text[:READ_SNIPPET_LENGTH] + ('...' if len(text) > READ_SNIPPET_LENGTH else '')
                        pages_read_count += 1

                except requests.exceptions.Timeout:
                    result_item['read_content_snippet'] = "[Read Failed: Request timed out]"
                    print_terminal_style(f"    Timeout reading {url}", "general_warning")
                except requests.exceptions.RequestException as e_req:
                    result_item['read_content_snippet'] = f"[Read Failed: Request error ({type(e_req).__name__})]"
                    print_terminal_style(f"    Request error reading {url}: {e_req}", "general_warning")
                except Exception as e_parse: # Catch potential BS4 errors or others
                    result_item['read_content_snippet'] = f"[Read Failed: Parsing error ({type(e_parse).__name__})]"
                    print_terminal_style(f"    Parsing error reading {url}: {e_parse}", "general_warning")

        message = f"Found {len(processed_results)} results for '{query}'."
        if actual_num_pages_to_read > 0:
            message += f" Attempted to read content from {actual_num_pages_to_read} pages, successfully extracted text snippet from {pages_read_count}."

        return {"status": "success", "results": processed_results, "message": message}

    except Exception as e:
        return {"status": "error", "message": f"Web search/read failed: {e}"}


# --- [ list_directory_tool_internal, read_file_tool_internal, write_file_tool_internal functions remain unchanged ] ---
def list_directory_tool_internal(path="."):
    """Lists the contents of a directory."""
    try:
        target_path = os.path.abspath(path)
        if not os.path.isdir(target_path):
            return {"status": "error", "message": f"Path '{path}' is not a valid directory or does not exist."}

        contents = os.listdir(target_path)
        items = []
        for item in contents:
            item_path = os.path.join(target_path, item)
            try:
                is_dir = os.path.isdir(item_path)
                size = os.path.getsize(item_path) if not is_dir else None
                modified_timestamp = os.path.getmtime(item_path)
                modified_time = datetime.fromtimestamp(modified_timestamp).strftime('%Y-%m-%d %H:%M:%S')
                items.append({
                    "name": item,
                    "type": "directory" if is_dir else "file",
                    "size_bytes": size,
                    "last_modified": modified_time
                })
            except OSError: # Handle potential permission errors for individual items
                 items.append({
                    "name": item,
                    "type": "inaccessible",
                    "size_bytes": None,
                    "last_modified": None
                 })

        return {"status": "success", "path": target_path, "contents": items, "message": f"Listed contents of '{target_path}'."}
    except Exception as e:
        return {"status": "error", "message": f"Failed to list directory '{path}': {e}"}

def read_file_tool_internal(filepath):
    """
    Reads the *entire* content of a specified file.
    WARNING: Reading very large files can consume significant memory and time,
             and the full content might exceed AI context limits if processed directly.
    The full content is returned in the 'content' key of the result dictionary.
    """
    try:
        target_path = os.path.abspath(filepath)
        if not os.path.isfile(target_path):
            return {"status": "error", "message": f"File '{filepath}' does not exist or is not a file."}

        file_size = 0
        try:
            file_size = os.path.getsize(target_path)
            # Example threshold: 50 MB (adjust as needed) - Just a user warning
            if file_size > 50 * 1024 * 1024:
                 print_terminal_style(f"Warning: File '{filepath}' is very large ({file_size / (1024*1024):.2f} MB). Reading entire content.", "general_warning")
        except OSError as e_size:
            print_terminal_style(f"Warning: Could not get size for '{filepath}': {e_size}. Proceeding with read.", "general_warning")
            pass # Ignore size check errors if getting size fails

        content = ""
        # Try reading as UTF-8, fallback to latin-1 for potentially mixed/binary data
        try:
            # Read the entire file
            with open(target_path, "r", encoding="utf-8", errors='replace') as f: # Use errors='replace' for robustness
                content = f.read()
        except UnicodeDecodeError:
            print_terminal_style(f"Warning: Could not decode '{filepath}' as UTF-8. Trying latin-1.", "general_warning")
            try:
                # Read the entire file with fallback encoding
                with open(target_path, "r", encoding="latin-1") as f: # latin-1 rarely fails
                    content = f.read()
            except Exception as e_fallback:
                 # If even latin-1 fails, it might be binary or heavily corrupted
                 print_terminal_style(f"Error: Failed to read file '{filepath}' even with fallback encoding: {e_fallback}. Treating as binary.", "general_error")
                 # Option: Read as bytes and return info about it? Or just fail? Let's fail for now.
                 return {"status": "error", "message": f"Failed to read file '{filepath}' as text (tried utf-8, latin-1): {e_fallback}"}
        except MemoryError:
             print_terminal_style(f"Error: MemoryError reading large file '{filepath}' ({file_size} bytes). File is too large to fit in memory.", "general_error")
             return {"status": "error", "message": f"MemoryError reading file '{filepath}'. File too large ({file_size} bytes)."}
        except Exception as e_read:
             return {"status": "error", "message": f"Failed to read file '{filepath}': {e_read}"}

        # Return the full content, but the message indicates size.
        # The calling code will handle not displaying/logging the full content.
        content_len = len(content)
        return {
            "status": "success",
            "filepath": target_path,
            "content": content, # The full content IS returned here
            "content_length": content_len, # Add length for easy access
            "message": f"Successfully read entire content ({content_len} characters) from '{target_path}'."
        }
    except Exception as e:
        # Catch potential abspath errors etc.
        return {"status": "error", "message": f"Failed to process file path '{filepath}': {e}"}

def write_file_tool_internal(filepath, content, overwrite=False):
    """Writes content to a specified file."""
    try:
        target_path = os.path.abspath(filepath)
        # Prevent overwriting existing files unless explicitly allowed
        if os.path.exists(target_path) and not overwrite:
            return {"status": "error", "message": f"File '{filepath}' already exists. Use overwrite=true to replace it."}
        if os.path.isdir(target_path):
             return {"status": "error", "message": f"Path '{filepath}' points to an existing directory, cannot write file."}

        # Create parent directories if they don't exist
        parent_dir = os.path.dirname(target_path)
        if parent_dir: # Ensure parent_dir is not empty (e.g., for root files)
            os.makedirs(parent_dir, exist_ok=True)

        with open(target_path, "w", encoding="utf-8") as f:
            f.write(content)

        return {"status": "success", "filepath": target_path, "message": f"Successfully wrote content to '{target_path}'."}
    except Exception as e:
        return {"status": "error", "message": f"Failed to write file '{filepath}': {e}"}


# --- Update AVAILABLE_TOOLS dictionary (Descriptions remain mostly the same, functionality is unchanged here) ---
AVAILABLE_TOOLS = {
    # --- Existing Tools (Keep them) ---
    "execute_python_code": {"description": "Executes Python code. Automatically checks and offers to install missing dependencies (e.g., numpy, pandas, requests, etc.) from a predefined list if detected in imports. A screenshot is automatically taken after execution (unless it's a final step) and provided in the next prompt.", "args_schema": {"code_string": "string (the Python code to execute)"}, "python_function": lambda args: run_python_script_in_sandbox(args.get("code_string"))},
    "automate_gui_with_pyautogui": {"description": "Uses `pyautogui` library for GUI automation. Ensure your script includes `import pyautogui`. Dependencies like `PyAutoGUI` will be checked. A screenshot is automatically taken after execution and provided in the next prompt.", "args_schema": {"pyautogui_script": "string (Python code using pyautogui for GUI automation)"}, "python_function": lambda args: run_python_script_in_sandbox(args.get("pyautogui_script"))},
    "execute_powershell_command": {"description": "Executes a PowerShell command (Windows only). A screenshot is automatically taken after execution and provided in the next prompt.", "args_schema": {"command": "string (the PowerShell command to execute)"}, "python_function": lambda args: run_powershell_subprocess(args.get("command"))},
    "get_window_info_with_pygetwindow": {"description": "Uses `pygetwindow` library to get information about open windows (e.g., list all, find by title). Ensure your script includes `import pygetwindow as gw`. Dependencies like `PyGetWindow` will be checked. A screenshot is automatically taken after execution and provided in the next prompt.", "args_schema": {"action": "string (e.g., 'list_all_windows', 'get_window_by_title')", "window_title": "string (optional, required if action is 'get_window_by_title', can be a regex pattern)"}, "python_function": lambda args: run_python_script_in_sandbox(f"""import pygetwindow as gw
import json
import re # Ensure re is imported here too

action = '{args.get('action')}'
# Use raw string literal for regex patterns, escape potential issues
title_pattern_str = r'''{args.get('window_title', '').replace("'", "\\'").replace('"', '\\"')}'''

results = []

try:
    if action == 'list_all_windows':
        for win in gw.getAllWindows():
            if win.title: # Ensure title is not empty
                results.append({{ 'title': win.title, 'size': (win.width, win.height), 'pos': (win.left, win.top), 'isActive': win.isActive, 'isVisible': win.isVisible }})
        print(json.dumps(results))

    elif action == 'get_window_by_title' and title_pattern_str:
        # Use regex=True for pattern matching
        wins = gw.getWindowsWithTitle(re.compile(title_pattern_str))
        for win in wins:
             results.append({{ 'title': win.title, 'size': (win.width, win.height), 'pos': (win.left, win.top), 'isActive': win.isActive, 'isVisible': win.isVisible }})
        if results:
            print(json.dumps(results))
        else:
            print(json.dumps([])) # Return empty list if no match

    else:
        print(json.dumps({{"error": "Invalid action or missing title_pattern for get_window_by_title."}}))

except Exception as e:
    print(json.dumps({{"error": f"Error in pygetwindow script: {{str(e)}}"}}))

""")},
    "request_screenshot": {"description": "Requests an immediate screenshot of the current screen. The screenshot taken by THIS tool will be provided in the next prompt. Use this if you need an updated view or the previous screenshot was unclear.", "args_schema": {}, "python_function": lambda args: take_screenshot_tool_internal("explicit_request")},
    "read_own_code": {"description": "Reads and returns the agent's own current source code (this script). Useful before modifying code. No automatic screenshot is taken after this tool.", "args_schema": {}, "python_function": lambda args: read_own_code_tool_internal()},
    "modify_own_code": {"description": "Modifies the agent's own source code (this script). MUST provide the *entire* new code content. A backup (.bak) is created. Requires MANUAL RESTART. Use with EXTREME CAUTION. No automatic screenshot is taken after this tool.", "args_schema": {"new_code_content": "string (the complete new Python code for the agent)"}, "python_function": lambda args: modify_own_code_tool_internal(args.get("new_code_content"))},
    "revert_to_previous_code_version": {"description": "Reverts agent's source code to the backup file (script_name.py.bak). Requires MANUAL RESTART. Use if a code modification was problematic. No automatic screenshot is taken after this tool.", "args_schema": {}, "python_function": lambda args: revert_to_previous_code_version_tool_internal()},
    "change_ai_model": {"description": "Allows changing the underlying AI model. Presents a list of available models to the user for selection. Use if a different model might be better suited or if requested by the user. Changing models re-initializes the chat session. No automatic screenshot is taken after this tool.", "args_schema": {"reason_for_change": "string (optional, your reason for wanting to change the model)"}, "python_function": lambda args: change_ai_model_tool_internal(args)},
    "ask_user_for_clarification": {"description": "If stuck, unsure, need more info, or require confirmation for a risky action, use this to ask the user a specific question. No automatic screenshot is taken after this tool.", "args_schema": {"question_for_user": "string (the question to ask the user)"}, "python_function": lambda args: {"status": "clarification_needed", "question": args.get("question_for_user")}},
    "final_answer": {"description": "Use ONLY when the GOAL is fully and successfully achieved. Provide a concise summary of the outcome and how it was achieved.", "args_schema": {"summary_of_result": "string (a concise summary of how the goal was achieved and the final outcome)"}, "python_function": lambda args: {"status": "goal_achieved", "summary": args.get("summary_of_result")}},
    "report_failure": {"description": "Use if the goal cannot be achieved or a critical error prevents progress after attempting reasonable recovery steps (like searching for error info). Provide a clear reason for the failure.", "args_schema": {"reason_for_failure": "string (a concise explanation of why the goal could not be achieved)"}, "python_function": lambda args: {"status": "goal_failed", "reason": args.get("reason_for_failure")}},

    # --- MODIFIED web_search ---
    "web_search": {
        "description": "Performs a web search using DuckDuckGo. Optionally attempts to fetch and read text content from the top N results. Returns a list including title, URL, original snippet, and potentially a 'read_content_snippet' (first ~1000 chars of parsed text or an error message). Use this to find information, understand errors, or learn how to perform a task. Reading pages takes extra time and may fail. Requires `duckduckgo-search`, `requests`, `beautifulsoup4`. No automatic screenshot is taken after this tool.",
        "args_schema": {
            "query": "string (the search query)",
            "num_results": "integer (optional, default: 5, the maximum number of search results to return in the list)",
            "num_pages_to_read": "integer (optional, default: 3, max: 5, the number of top results to attempt to fetch and read content from)"
        },
        "python_function": lambda args: web_search_tool_internal(
            args.get("query"),
            args.get("num_results", 5),
            args.get("num_pages_to_read", 3) # Default to reading 3 pages
        )
    },
    "list_directory": {
        "description": "Lists files and subdirectories within a specified directory path. Returns names, types, sizes (for files), and modification times. Defaults to the current directory if no path is provided. No automatic screenshot is taken after this tool.",
        "args_schema": {
            "path": "string (optional, the directory path to list, e.g., '.', './documents', '/tmp/data')"
        },
        "python_function": lambda args: list_directory_tool_internal(args.get("path", "."))
    },
    # --- MODIFIED read_file description ---
    "read_file": {
        "description": "Reads the *entire* text content of a specified file. Handles basic text encodings (UTF-8, fallback to Latin-1). Returns the full content in the result dictionary's 'content' key. WARNING: The full content is **NOT** shown in the terminal output or automatically included in the next prompt due to potential size limits. You **MUST** refer to the content from the previous step's output dictionary in your thought process to analyze or summarize it. Reading very large files can consume significant memory/time.",
        "args_schema": {
            "filepath": "string (the full path to the file to read)"
        },
        "python_function": lambda args: read_file_tool_internal(args.get("filepath"))
    },
    "write_file": {
        "description": "Writes the given string content to a specified file path. Creates parent directories if needed. By default, it prevents overwriting existing files; set overwrite=true to allow overwriting. No automatic screenshot is taken after this tool.",
        "args_schema": {
            "filepath": "string (the full path where the file should be written)",
            "content": "string (the text content to write into the file)",
            "overwrite": "boolean (optional, default: false. Set to true to allow overwriting an existing file)"
        },
        "python_function": lambda args: write_file_tool_internal(args.get("filepath"), args.get("content"), args.get("overwrite", False))
    }
}

# --- ENHANCED Prompt Generation Functions ---
def get_tools_definition_for_prompt():
    prompt_str = "You have access to the following tools. You must respond with a single JSON object containing 'tool_name', 'tool_input' (an object with arguments for the chosen tool), and 'thought' (your detailed reasoning, plan, and analysis).\n"
    # --- Updated list of tools that DON'T trigger auto-screenshot ---
    no_auto_screenshot_tools = [
        'final_answer', 'report_failure', 'ask_user_for_clarification',
        'read_own_code', 'modify_own_code', 'revert_to_previous_code_version',
        'change_ai_model', 'request_screenshot', # request_screenshot provides its own
        'web_search', 'list_directory', 'read_file', 'write_file' # Added new tools here
    ]
    prompt_str += f"IMPORTANT SCREENSHOTS: After most tool executions (exceptions: {', '.join(f'`{t}`' for t in no_auto_screenshot_tools)}), a screenshot of the screen is automatically taken and will be provided to you in the NEXT prompt. You MUST analyze this visual feedback. "
    prompt_str += "In your 'thought', explicitly describe relevant details from the screenshot (e.g., 'The screenshot shows the file explorer open at C:\\Users\\...', 'The error message dialog box is visible', 'The website content appears as expected'). Explain how the screenshot confirms the success or failure of your last action and how it informs your next step. "
    prompt_str += "If the provided screenshot is insufficient, unclear, or if you need an updated view before a critical step (like clicking a specific button), use the `request_screenshot` tool. The new screenshot taken by that tool will be available in the subsequent prompt. "
    prompt_str += "Screenshot images are provided as PIL Image objects directly in the prompt.\n\n"
    for name, tool_info in AVAILABLE_TOOLS.items():
        prompt_str += f"Tool: `{name}`\nDescription: {tool_info['description']}\nArguments Schema: {json.dumps(tool_info['args_schema'])}\n\n"
    prompt_str += "RESPONSE FORMAT: Always respond with a single, valid JSON object: `{\"thought\": \"...\", \"tool_name\": \"...\", \"tool_input\": {...}}`.\n"
    prompt_str += "PLANNING & EXECUTION:\n"
    prompt_str += "1.  **Analyze:** Understand the main GOAL.\n"
    prompt_str += "2.  **Plan:** Break the GOAL into logical STEPS. Outline these steps in your 'thought'.\n"
    prompt_str += "3.  **Execute Step:** Choose the best tool for the *current* step.\n"
    prompt_str += "4.  **Verify & Adapt:** After execution, analyze the tool output AND the screenshot (if provided). Did the step succeed? Does the screenshot confirm this? If it failed, analyze the error message and screenshot. Use `web_search` if the error is unclear. Update your plan if necessary (e.g., try a different approach, break the step into smaller SUBSTEPS). Explain this analysis and adaptation in your 'thought' for the *next* action.\n"
    prompt_str += "5.  **Proceed:** Continue to the next step or substep.\n\n"
    prompt_str += "TOOL USAGE NOTES:\n"
    prompt_str += "- Use `web_search` proactively if you lack information, encounter unknown errors, or need to learn how to perform a task.\n"
    prompt_str += "- Use `ask_user_for_clarification` if you are genuinely stuck, need confirmation for a potentially destructive action, or require information only the user can provide.\n"
    prompt_str += "- Use `final_answer` ONLY when the entire GOAL is verifiably complete.\n"
    prompt_str += "- Use `report_failure` if you've tried reasonable steps (including searching for solutions) and cannot proceed.\n"
    # --- ADDED INSTRUCTION FOR read_file ---
    prompt_str += "**CRITICAL NOTE ON `read_file`:** This tool returns the *entire* file content in its output dictionary (key: 'content'). However, this full content is **NOT** automatically shown in the terminal or added to your next prompt text due to size limits. You **MUST** process the content based on the output dictionary you received in the *previous* step. Use your 'thought' process to summarize, extract key information, or decide on the next action based on the content you just received. Do not expect the full text to appear again in the prompt history details or the next input prompt.**\n"
    prompt_str += "**NOTE ON `web_search` with reading:** When you set `num_pages_to_read` > 0, the tool attempts to fetch and parse text. The results will include a `read_content_snippet` field for those pages, containing the first ~1000 characters of text found or an error message. Use these snippets for quick insights.**\n"
    prompt_str += "To modify your own code: first use `read_own_code` to get the current script, then carefully plan your changes, and finally use `modify_own_code` with the *entire new script content*. This is a powerful and risky operation. If a modification is problematic after restart, you can use `revert_to_previous_code_version` to restore the code from the last backup, then restart again.\n"
    return prompt_str

def get_autonomous_system_persona_with_tools():
    # --- Updated list of tools that DON'T trigger auto-screenshot ---
    no_auto_screenshot_tools = [
        'final_answer', 'report_failure', 'ask_user_for_clarification',
        'read_own_code', 'modify_own_code', 'revert_to_previous_code_version',
        'change_ai_model', 'request_screenshot', # request_screenshot provides its own
        'web_search', 'list_directory', 'read_file', 'write_file' # Added new tools here
    ]
    return (
        "You are an advanced autonomous AI assistant, acting like AutoGPT. Your primary objective is to achieve the user's GOAL through a sequence of thoughtful planning, execution, and adaptation. "
        "**Core Workflow:**\n"
        "1.  **Decomposition:** Break the user's GOAL into smaller, logical STEPS.\n"
        "2.  **Execution:** Execute one STEP at a time using the available tools.\n"
        "3.  **Verification (CRITICAL):** After each step, meticulously analyze the tool's output AND the provided screenshot (if available). In your 'thought', explicitly state what the screenshot shows and how it confirms success or indicates failure/unexpected results. This visual verification is essential.\n"
        "4.  **Adaptation:** If a step fails or the outcome isn't as expected (based on output and screenshot), analyze the reason (use `web_search` for unknown errors). Revise your plan: try an alternative method, break the failed step into smaller SUBSTEPS, or ask the user for clarification if necessary. Clearly state the plan adaptation in your 'thought'.\n"
        "5.  **Progression:** Proceed to the next step/substep only after verifying the previous one.\n\n"
        f"**Screenshots:** A screenshot is automatically taken after most tool executions (exceptions: {', '.join(f'`{t}`' for t in no_auto_screenshot_tools)}). YOU MUST ANALYZE IT. Describe relevant visual elements in your 'thought' and explain their significance for verifying the last action and planning the next. Use `request_screenshot` if you need an updated view before a critical action. Screenshots are provided as PIL Image objects.\n\n"
        "**Tool Usage:**\n"
        "- Use tools strategically to progress through your planned steps.\n"
        "- Use `web_search` to gather information, understand errors, or find solutions.\n"
        "- Use file system tools (`list_directory`, `read_file`, `write_file`) carefully.\n"
        # --- ADDED INSTRUCTION FOR read_file ---
        "**Remember for `read_file`:** It reads the *entire* file, returning the full content in the tool output dictionary (key 'content'). This full content is **NOT** shown in the terminal or repeated in subsequent prompts. You **MUST** analyze or summarize it in your thought process based on the output dictionary from the previous step.**\n"
        "**For `web_search`:** If you request pages to be read (`num_pages_to_read` > 0), check the `read_content_snippet` field in the results for extracted text or errors.**\n"
        "- Python code execution (`execute_python_code`, `automate_gui_with_pyautogui`) dependencies will be checked; confirm installation if prompted.\n"
        f"- You are currently using AI model: {SELECTED_MODEL_NAME.split('/')[-1]}. Use `change_ai_model` if needed.\n"
        "- Use `ask_user_for_clarification` for genuine blockers or confirmation.\n"
        "- Use `final_answer` ONLY upon successful completion of the *entire* GOAL.\n"
        "- Use `report_failure` if the GOAL is truly unachievable after trying alternatives.\n\n"
        "**Self-Modification:** You can read (`read_own_code`) and modify (`modify_own_code`) your own source code. This is HIGHLY RISKY. Plan carefully, provide the *entire* new code, and understand it requires a manual script restart. Use `revert_to_previous_code_version` (also requires restart) if a modification fails.\n\n"
        "**Response Format:** You MUST respond with a single JSON object: `{\"thought\": \"Detailed plan, analysis of previous step/screenshot, reasoning for current action...\", \"tool_name\": \"chosen_tool_name\", \"tool_input\": {\"arg1\": \"value1\", ...}}`."
    )

# --- [ execute_generated_code_internal function remains unchanged ] ---
def execute_generated_code_internal(code_string):
    if not code_string: return "", "No code provided to execute.", None
    # Add newly imported modules to the execution context if they exist
    exec_globals = {
        'os': os, 'sys': sys, 'subprocess': subprocess, 're': re, 'json': json,
        'datetime': datetime, 'time': time, 'timezone': timezone, 'shutil': shutil,
        'ImageGrab': ImageGrab, 'Image': Image, 'BytesIO': BytesIO,
        'DDGS': DDGS, # Add DDGS if available
        'requests': requests, # Add requests if available
        'BeautifulSoup': BeautifulSoup, # Add BS4 if available
        '__builtins__': globals()['__builtins__']
    }
    # Dynamically add other potentially installed modules from the map
    for import_name, package_name in IMPORT_TO_PACKAGE_MAP.items():
        # Avoid re-adding modules already explicitly added
        base_module_name = import_name.split('.')[0]
        if base_module_name not in exec_globals:
            try:
                module_instance = importlib.import_module(base_module_name)
                exec_globals[base_module_name] = module_instance
            except ImportError:
                pass # Ignore if not installed/available

    captured_stdout, captured_stderr = StringIO(), StringIO()
    original_stdout, original_stderr = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = captured_stdout, captured_stderr
    downloaded_file_path_val = None
    try:
        exec(code_string, exec_globals)
        stdout_val = captured_stdout.getvalue(); stderr_val = captured_stderr.getvalue()
    except Exception as e:
        stdout_val = captured_stdout.getvalue(); stderr_val = captured_stderr.getvalue() + f"\n--- Python Execution Exception ---\n{type(e).__name__}: {e}\n"
    finally: sys.stdout, sys.stderr = original_stdout, original_stderr
    for line in stdout_val.splitlines():
        if line.startswith("DOWNLOADED_FILE_PATH:"): downloaded_file_path_val = line.split(":",1)[1].strip(); break
    return stdout_val, stderr_val, downloaded_file_path_val


# --- [ print_response_box function remains unchanged ] ---
def print_response_box(title, status_text, status_color, ai_decision_lines, tool_output_lines=None, box_color=Fore.BLUE):
    current_terminal_width = get_current_terminal_width()
    print_terminal_style(title, "boxed_content_top", box_color_override=box_color, text_color_override=box_color + Style.BRIGHT)
    print_terminal_style(None, "boxed_content_separator", box_color_override=box_color)
    print_terminal_style(" ", "boxed_content_line", box_color_override=box_color) # Empty line for padding
    # Inner separator for status
    print_terminal_style(None, "response_box_inner_hline_indented", box_color_override=box_color)
    # Status line
    print_terminal_style(f"Status : {status_text}", "response_box_inner_line_indented", box_color_override=box_color, text_color_override=status_color, align_char=":", align_pos=15)
    # Inner separator after status
    print_terminal_style(None, "response_box_inner_hline_indented", box_color_override=box_color)
    print_terminal_style(" ", "boxed_content_line", box_color_override=box_color) # Empty line for padding

    if ai_decision_lines:
        # Add a header for AI Decision Summary
        available_text_width_for_arrow_line = max(1, current_terminal_width - 8) # Width inside the inner box arrows
        sub_header_text = " AI Decision Summary "; separator_display_string = ""
        if len(sub_header_text) >= available_text_width_for_arrow_line:
            separator_display_string = sub_header_text[:available_text_width_for_arrow_line-3]+"..." if available_text_width_for_arrow_line > 3 else sub_header_text[:available_text_width_for_arrow_line]
        else:
            sep_len_total = available_text_width_for_arrow_line - len(sub_header_text)
            sep_len_half = max(0, sep_len_total // 2); sep_char = BOX_HLINE
            left_padding = sep_char * sep_len_half; right_padding = sep_char * (sep_len_total - sep_len_half)
            separator_display_string = left_padding + sub_header_text + right_padding
            # Ensure it doesn't exceed width due to rounding/calculation
            if len(separator_display_string) > available_text_width_for_arrow_line:
                 separator_display_string = separator_display_string[:available_text_width_for_arrow_line]

        print_terminal_style(separator_display_string, "response_box_arrow_line", box_color_override=box_color, color_override=Fore.BLUE, text_color_override=Fore.BLUE + Style.BRIGHT)

        # Print decision lines
        for line_data in ai_decision_lines:
            line_text, line_color = line_data if isinstance(line_data, tuple) else (line_data, Fore.WHITE)
            # Sanitize potentially large inputs for display
            if isinstance(line_text, str) and "Input: " in line_text:
                 try:
                     prefix, json_str = line_text.split("Input: ", 1)
                     input_data = json.loads(json_str)
                     if isinstance(input_data, dict):
                         if 'new_code_content' in input_data:
                             input_data['new_code_content'] = f"<Code: {len(input_data.get('new_code_content',''))} bytes>"
                         if 'content' in input_data: # For write_file
                             input_data['content'] = f"<Content: {len(input_data.get('content',''))} bytes>"
                     line_text = prefix + "Input: " + json.dumps(input_data)
                 except (ValueError, json.JSONDecodeError):
                     pass # Keep original if parsing fails

            print_terminal_style(line_text, "response_box_arrow_line", box_color_override=box_color, color_override=Fore.CYAN, text_color_override=line_color)
        # Add space before tool output if both exist
        if tool_output_lines:
             print_terminal_style(" ", "boxed_content_line", box_color_override=box_color) # Empty line for padding

    if tool_output_lines:
        # Add a header for Tool Output
        available_text_width_for_arrow_line = max(1, current_terminal_width - 8)
        sub_header_text = " Tool Output "; separator_display_string = ""
        if len(sub_header_text) >= available_text_width_for_arrow_line:
            separator_display_string = sub_header_text[:available_text_width_for_arrow_line-3]+"..." if available_text_width_for_arrow_line > 3 else sub_header_text[:available_text_width_for_arrow_line]
        else:
            sep_len_total = available_text_width_for_arrow_line - len(sub_header_text)
            sep_len_half = max(0, sep_len_total // 2); sep_char = BOX_HLINE
            left_padding = sep_char * sep_len_half; right_padding = sep_char * (sep_len_total - sep_len_half)
            separator_display_string = left_padding + sub_header_text + right_padding
            if len(separator_display_string) > available_text_width_for_arrow_line:
                 separator_display_string = separator_display_string[:available_text_width_for_arrow_line]

        print_terminal_style(separator_display_string, "response_box_arrow_line", box_color_override=box_color, color_override=Fore.BLUE, text_color_override=Fore.BLUE + Style.BRIGHT)

        # Print output lines
        for line_data in tool_output_lines:
            line_text, line_color = line_data if isinstance(line_data, tuple) else (line_data, Fore.WHITE)
            print_terminal_style(line_text, "response_box_arrow_line", box_color_override=box_color, color_override=Fore.CYAN, text_color_override=line_color)

    # Final bottom border
    print_terminal_style(None, "boxed_content_bottom", box_color_override=box_color)


# --- Update get_next_action_prompt for history sanitization and clarity ---
def get_next_action_prompt(goal, history, screenshot_path_from_after_last_action=None):
    # Use "Action History" in the prompt
    history_str = "This is the first action, so there is no action history for this goal yet."
    MAX_HISTORY_ITEMS = 5 # Show slightly more history for better context
    if history:
        history_str = f"Action History (your previous steps for this goal, most recent first, max {MAX_HISTORY_ITEMS} shown):\n"
        # Determine status color for history items
        status_colors = {
            "success": Fore.GREEN,
            "error": Fore.RED,
            "error_in_script": Fore.RED,
            "clarification_needed": Fore.YELLOW,
            "goal_achieved": Fore.GREEN + Style.BRIGHT,
            "goal_failed": Fore.RED + Style.BRIGHT,
            "user_input_clarification": Fore.YELLOW,
            # Add others as needed
        }

        for i, item in enumerate(history[-MAX_HISTORY_ITEMS:][::-1]):
             action_tool_input = item.get('tool_input', {})
             display_input_for_history = action_tool_input
             # Sanitize potentially large inputs for history display
             if item.get('tool_used') == 'modify_own_code' and isinstance(action_tool_input, dict) and 'new_code_content' in action_tool_input:
                 display_input_for_history = action_tool_input.copy()
                 content_len = len(display_input_for_history.get('new_code_content', ''))
                 display_input_for_history['new_code_content'] = f"<Code content: {content_len} bytes>"
             elif item.get('tool_used') == 'write_file' and isinstance(action_tool_input, dict) and 'content' in action_tool_input:
                 display_input_for_history = action_tool_input.copy()
                 content_len = len(display_input_for_history.get('content', ''))
                 display_input_for_history['content'] = f"<File content: {content_len} bytes>"

             # --- Sanitize read_file and web_search output for history ---
             tool_output_for_history = item.get('tool_output', {})
             tool_output_str = str(tool_output_for_history) # Default string representation
             action_status = "N/A"
             status_color = Fore.WHITE # Default

             if isinstance(tool_output_for_history, dict):
                 action_status = tool_output_for_history.get('status', 'N/A')
                 status_color = status_colors.get(action_status, Fore.WHITE) # Get color based on status

                 if item.get('tool_used') == 'read_file':
                     temp_output_display = tool_output_for_history.copy()
                     if 'content' in temp_output_display:
                         content_len = temp_output_display.get('content_length', len(temp_output_display.get('content', '')))
                         temp_output_display['content'] = f"<Content Read: {content_len} characters>"
                         temp_output_display.pop('content_length', None)
                     tool_output_str = json.dumps(temp_output_display)

                 elif item.get('tool_used') == 'web_search' and 'results' in tool_output_for_history:
                     temp_output_display = tool_output_for_history.copy()
                     # Sanitize the read_content_snippet within results for history
                     if isinstance(temp_output_display.get('results'), list):
                         for res_idx, res_item in enumerate(temp_output_display['results']): # Iterate with index
                             if isinstance(res_item, dict) and 'read_content_snippet' in res_item:
                                 if res_item['read_content_snippet'] is not None and not res_item['read_content_snippet'].startswith("["):
                                     # Ensure we are modifying the item in the list
                                     temp_output_display['results'][res_idx]['read_content_snippet'] = f"<Read Snippet: {len(res_item['read_content_snippet'])} chars>"
                     tool_output_str = json.dumps(temp_output_display)
                 elif item.get('tool_used') == 'read_own_code' and 'current_code_content' in tool_output_for_history:
                     temp_output_display = tool_output_for_history.copy()
                     temp_output_display['current_code_content'] = f"<Code Read: {len(temp_output_display.get('current_code_content',''))} bytes>"
                     tool_output_str = json.dumps(temp_output_display)
                 elif item.get('tool_used') == 'user_input_clarification':
                     tool_output_str = json.dumps(tool_output_for_history) # Show user response


             action_tool_input_str = json.dumps(display_input_for_history)
             truncated_input_str = action_tool_input_str[:150] + ('...' if len(action_tool_input_str) > 150 else '')

             # Truncate tool output snippet more aggressively
             truncated_output_str = tool_output_str[:100] + ('...' if len(tool_output_str) > 100 else '')

             # Add status indicator to history line
             history_str += (f"  {i+1}. Thought: {item.get('thought', 'N/A')}\n"
                             f"     Tool Used: {item.get('tool_used', 'N/A')}, Input: {truncated_input_str}\n"
                             f"     Status: {status_color}{action_status.upper()}{Style.RESET_ALL}, Output Snippet: {truncated_output_str}\n" # Use sanitized/truncated output with status
                             f"     Screenshot After: {item.get('screenshot_taken_after_action', 'N/A')}\n\n") # Keep screenshot info

    screenshot_info = "No screenshot was taken after the last action, or this is the first action."
    if screenshot_path_from_after_last_action:
        screenshot_info = f"A screenshot ('{os.path.basename(screenshot_path_from_after_last_action)}') was taken after the last action. It is included in this prompt for your analysis.\n"

    # Combine persona and tools definition
    system_instructions = f"{get_autonomous_system_persona_with_tools()}\n\n{get_tools_definition_for_prompt()}"

    return (f"{system_instructions}\n\n"
            f"Current GOAL: \"{goal}\"\n\n{history_str}\n{screenshot_info}\n"
            "Based on the GOAL, your PLAN (include/update this in your 'thought'), the Action History, the last tool output, and ESPECIALLY the latest screenshot (if provided), decide the next single tool to use. Respond with a single, valid JSON object as specified.")


# --- Main Function ---
def main():
    global SELECTED_MODEL_NAME, current_goal, history_of_actions, _PartClass, SESSION_ID, ai_model_instance, _part_class_has_from_data, DDGS, requests, BeautifulSoup

    # --- [ Initial setup print statements remain largely unchanged, but added web scraping libs ] ---
    print_terminal_style("SYSTEM ONLINE...", "system_info_major", prefix_override="> ", color_override=Fore.GREEN, text_color_override=Fore.GREEN)
    print_terminal_style(f"MODEL: {SELECTED_MODEL_NAME.split('/')[-1]} (pending config)", "system_info_major", prefix_override="> ", color_override=Fore.CYAN, text_color_override=Fore.CYAN)
    print_terminal_style(f"SESSION TOKEN: {SESSION_ID}", "system_info_major", prefix_override="> ", color_override=Fore.CYAN, text_color_override=Fore.CYAN)
    print_terminal_style(None, "system_header_full_line"); print_terminal_style("AI INTELLIGENCE STACK REPORT", "system_banner_center_text"); print_terminal_style(None, "system_header_full_line")
    configure_gemini_apikey()
    key_value_align_pos = 28 # Adjusted alignment slightly
    print_terminal_style("Gemini API Key : CONFIGURED", "key_value_status_line", prefix_override=f"{Fore.GREEN}[✓] {Style.RESET_ALL}", text_color_override=Fore.WHITE, color_override=Fore.GREEN, align_char=":", align_pos=key_value_align_pos)
    pil_status = "Found & Enabled" if ImageGrab and Image else "NOT FOUND (Screenshots Disabled)"
    pil_prefix = f"{Fore.GREEN}[✓] {Style.RESET_ALL}" if ImageGrab and Image else f"{Fore.RED}[✗] {Style.RESET_ALL}"
    print_terminal_style(f"Pillow (PIL) : {pil_status}", "key_value_status_line", prefix_override=pil_prefix, text_color_override=Fore.WHITE, color_override=(Fore.GREEN if ImageGrab and Image else Fore.RED), align_char=":", align_pos=key_value_align_pos)

    # Check for DuckDuckGo Search library status
    ddgs_status = "Found & Enabled" if DDGS else "NOT FOUND (Web Search Disabled)"
    ddgs_prefix = f"{Fore.GREEN}[✓] {Style.RESET_ALL}" if DDGS else f"{Fore.RED}[✗] {Style.RESET_ALL}"
    print_terminal_style(f"DuckDuckGo Search : {ddgs_status}", "key_value_status_line", prefix_override=ddgs_prefix, text_color_override=Fore.WHITE, color_override=(Fore.GREEN if DDGS else Fore.RED), align_char=":", align_pos=key_value_align_pos)
    if not DDGS: print_terminal_style("  └─ Install with: pip install duckduckgo-search", "system_info_minor")

    # Check for Web Reading Libraries
    requests_status = "Found & Enabled" if requests else "NOT FOUND (Web Reading Disabled)"
    requests_prefix = f"{Fore.GREEN}[✓] {Style.RESET_ALL}" if requests else f"{Fore.RED}[✗] {Style.RESET_ALL}"
    print_terminal_style(f"Requests Lib : {requests_status}", "key_value_status_line", prefix_override=requests_prefix, text_color_override=Fore.WHITE, color_override=(Fore.GREEN if requests else Fore.RED), align_char=":", align_pos=key_value_align_pos)
    if not requests: print_terminal_style("  └─ Install with: pip install requests", "system_info_minor")

    bs4_status = "Found & Enabled" if BeautifulSoup else "NOT FOUND (Web Reading Disabled)"
    bs4_prefix = f"{Fore.GREEN}[✓] {Style.RESET_ALL}" if BeautifulSoup else f"{Fore.RED}[✗] {Style.RESET_ALL}"
    print_terminal_style(f"BeautifulSoup4 Lib : {bs4_status}", "key_value_status_line", prefix_override=bs4_prefix, text_color_override=Fore.WHITE, color_override=(Fore.GREEN if BeautifulSoup else Fore.RED), align_char=":", align_pos=key_value_align_pos)
    if not BeautifulSoup: print_terminal_style("  └─ Install with: pip install beautifulsoup4", "system_info_minor")


    # Informational check for _PartClass and from_data
    gemini_part_status = f"SDK Part Class ({_part_class_origin})"
    gemini_part_val = "Available (from_data method found)" if _part_class_has_from_data else "Not fully available or missing 'from_data'"
    gemini_part_prefix = f"{Fore.GREEN}[✓] {Style.RESET_ALL}" if _part_class_has_from_data else f"{Fore.YELLOW}[!] {Style.RESET_ALL}"
    # Shorten the key slightly for alignment
    print_terminal_style(f"Gemini SDK Part : {gemini_part_val}", "key_value_status_line", prefix_override=gemini_part_prefix, text_color_override=Fore.WHITE, color_override=(Fore.GREEN if _part_class_has_from_data else Fore.YELLOW), align_char=":", align_pos=key_value_align_pos)

    # Update Image Sending status based on PIL availability
    image_sending_status = "ENABLED (Sending PIL Image object directly)" if Image else "DISABLED (Pillow not found)"
    image_sending_prefix = f"{Fore.GREEN}[✓] {Style.RESET_ALL}" if Image else f"{Fore.RED}[✗] {Style.RESET_ALL}"
    print_terminal_style(f"Image Sending : {image_sending_status}", "key_value_status_line", prefix_override=image_sending_prefix, text_color_override=Fore.WHITE, color_override=(Fore.GREEN if Image else Fore.RED), align_char=":", align_pos=key_value_align_pos)
    print()

    # --- [ Model discovery and selection remain unchanged ] ---
    all_models = []
    try:
        print_terminal_style("Discovering compatible models from Gemini API...", "system_info_minor", prefix_override=">> ")
        all_models = sorted([m.name for m in genai.list_models() if 'generateContent' in m.supported_generation_methods])
        if not all_models: print_terminal_style("No models supporting 'generateContent' found. Will use default.", "general_warning")
        else: print_terminal_style(f"Found {len(all_models)} models.", "general_success")
    except Exception as e: print_terminal_style(f"Error listing models: {e}. Will use default.", "general_warning")
    SELECTED_MODEL_NAME = select_model_cli(all_models, SELECTED_MODEL_NAME)
    print_terminal_style(f"Active Model Set To: {SELECTED_MODEL_NAME.split('/')[-1]}", "system_info_minor", prefix_override=">> ", color_override=Fore.GREEN)
    print()
    print_terminal_style("✦ WELCOME TO ENHANCED AUTONOMOUS AGENT ✦", "boxed_content_top", box_color_override=Fore.MAGENTA, text_color_override=Fore.MAGENTA + Style.BRIGHT)
    print_terminal_style(None, "boxed_content_separator", box_color_override=Fore.MAGENTA)
    box_key_align = 18
    print_terminal_style(f"Name       : {SELECTED_MODEL_NAME.split('/')[-1]}", "boxed_content_line", box_color_override=Fore.MAGENTA, text_color_override=Fore.WHITE, align_char=":", align_pos=box_key_align)
    print_terminal_style(f"Mode       : Autonomous (Plan-Execute-Verify-Adapt)", "boxed_content_line", box_color_override=Fore.MAGENTA, text_color_override=Fore.WHITE, align_char=":", align_pos=box_key_align)
    print_terminal_style(None, "boxed_content_bottom", box_color_override=Fore.MAGENTA)
    print()
    os.makedirs(DOWNLOADS_DIR, exist_ok=True)
    try: ai_model_instance = genai.GenerativeModel(SELECTED_MODEL_NAME)
    except Exception as e: print_terminal_style(f"CRITICAL FAILURE: Could not initialize AI model '{SELECTED_MODEL_NAME}': {e}", "general_error"); sys.exit(1)
    print_terminal_style("Autonomous core engaged. STANDBY FOR GOAL.", "status_emoji_line", prefix_override="🚀", color_override=Fore.GREEN); print()

    # --- Main Loop ---
    while True:
        current_goal = ""
        while not current_goal.strip():
            try:
                prompt_text = "Enter your GOAL (or 'exit' to quit)"
                current_goal = get_terminal_input(prompt_text, show_cursor=True).strip()
                if current_goal.lower() == 'exit': print_terminal_style("Exiting agent mode.", "general_info"); return
            except KeyboardInterrupt: print_terminal_style("\nUser interrupted. Exiting agent mode.", "general_warning"); return
        print_terminal_style(f"NEW GOAL RECEIVED: \"{current_goal}\"", "system_info_minor", prefix_override=">> ", color_override=Fore.YELLOW)
        history_of_actions = []; chat_session = ai_model_instance.start_chat(history=[])
        iteration_count = 0; screenshot_path_for_current_prompt = None

        while iteration_count < MAX_AUTONOMOUS_ITERATIONS:
            iteration_count += 1
            print_terminal_style(f"ITERATION {iteration_count}/{MAX_AUTONOMOUS_ITERATIONS} | GOAL: \"{current_goal}\"", "system_banner_center_text", color_override=Fore.MAGENTA, prefix_override="🎯")

            current_prompt_text = get_next_action_prompt(current_goal, history_of_actions, screenshot_path_for_current_prompt)
            message_parts = [current_prompt_text]

            # --- [ Image Sending Logic remains unchanged ] ---
            if screenshot_path_for_current_prompt:
                if os.path.exists(screenshot_path_for_current_prompt):
                    if Image: # Check if Pillow is available
                        print_terminal_style(f"Processing screenshot '{os.path.basename(screenshot_path_for_current_prompt)}' using PIL Image object for AI.", "general_info")
                        try:
                            pil_image = Image.open(screenshot_path_for_current_prompt)
                            message_parts.append(pil_image) # Append the PIL Image object directly
                            print_terminal_style(f"Screenshot '{os.path.basename(screenshot_path_for_current_prompt)}' prepared as PIL Image object.", "general_success")
                        except Exception as e_img:
                            print_terminal_style(f"Error processing screenshot file '{os.path.basename(screenshot_path_for_current_prompt)}' into PIL Image: {e_img}", "general_warning")
                            print_terminal_style("Screenshot will NOT be sent in this prompt.", "general_warning")
                    else: # Pillow not available
                        print_terminal_style(f"Local screenshot '{os.path.basename(screenshot_path_for_current_prompt)}' exists but Pillow (Image module) is not available to process it. Not sent.", "general_warning")
                else:
                    print_terminal_style(f"Screenshot file '{os.path.basename(screenshot_path_for_current_prompt)}' was expected but not found on disk. Not sent to AI.", "general_warning")


            print_terminal_style("Awaiting AI decision (planning/analysis)...", "system_info_minor", prefix_override=">> ", color_override=Fore.BLUE)
            ai_tool_choice_json = None
            try:
                # Send message_parts which now can contain text and PIL Image objects
                response = chat_session.send_message(message_parts)
                ai_response_text = response.text.strip()
                # print_terminal_style(f"Raw AI response snippet: {ai_response_text[:100]}...", "ai_raw_response_snippet") # Keep suppressed unless debugging
                ai_tool_choice_json = extract_json_from_ai_response(ai_response_text)
            except Exception as e:
                print_terminal_style(f"Error during AI communication: {e}", "general_error")
                # Attempt recovery by asking user
                ai_tool_choice_json = {"tool_name": "ask_user_for_clarification", "tool_input": {"question_for_user": f"Error getting AI action ({type(e).__name__}). Guidance needed."}, "thought": "Recovering from AI API/parsing error."}

            if not ai_tool_choice_json or "tool_name" not in ai_tool_choice_json:
                print_terminal_style("AI failed to provide valid tool choice JSON. Asking for clarification.", "general_warning")
                ai_tool_choice_json = {"tool_name": "ask_user_for_clarification", "tool_input": {"question_for_user": "Malformed decision or no tool chosen. Clarify next step?"}, "thought": "AI response invalid."}

            chosen_tool_name = ai_tool_choice_json.get("tool_name")
            tool_input = ai_tool_choice_json.get("tool_input", {})
            ai_thought = ai_tool_choice_json.get("thought", "N/A")

            # --- [ AI Decision Display remains unchanged, uses print_response_box ] ---
            ai_decision_display_lines = [
                (f"Thought: {ai_thought}", Fore.CYAN),
                (f"Tool: {chosen_tool_name}", Fore.YELLOW),
                # Input line is handled inside print_response_box for sanitization
                (f"Input: {json.dumps(tool_input)}", Fore.WHITE)
            ]
            print_response_box(f"AI DECISION (Iter: {iteration_count})", "EXECUTING...", Fore.YELLOW, ai_decision_display_lines, box_color=Fore.BLUE)


            print_terminal_style(f"⚙️  Executing tool: {chosen_tool_name}...", "status_emoji_line", prefix_override="", color_override=Fore.CYAN); time.sleep(0.5) # Short delay

            tool_output = {}
            if chosen_tool_name in AVAILABLE_TOOLS:
                try: tool_output = AVAILABLE_TOOLS[chosen_tool_name]["python_function"](tool_input)
                except Exception as e_tool: tool_output = {"status": "error", "message": f"Critical error executing tool '{chosen_tool_name}': {e_tool}"}
            else: tool_output = {"status": "error", "message": f"Unknown tool '{chosen_tool_name}'."}

            # --- [ Model Change Handling remains unchanged ] ---
            if chosen_tool_name == "change_ai_model" and tool_output.get("model_changed") is True:
                new_model_display_name = tool_output.get('new_model_name', 'unknown').split('/')[-1]
                print_terminal_style(f"Model changed to {new_model_display_name}. Re-initializing chat session.", "general_info")
                chat_session = ai_model_instance.start_chat(history=[]) # Re-initialize chat

            # --- Tool Result Display ---
            result_title = f"TOOL RESULT (Iter: {iteration_count})"
            final_status_text = str(tool_output.get("status", "UNKNOWN")).upper().replace("_", " ")
            final_status_color = Fore.WHITE; final_box_color = Fore.BLUE # Default colors
            if "SUCCESS" in final_status_text or "ACHIEVED" in final_status_text or "MODIFIED" in final_status_text or "REVERTED" in final_status_text: final_status_color = Fore.GREEN; final_box_color = Fore.GREEN
            elif "ERROR" in final_status_text or "FAILED" in final_status_text: final_status_color = Fore.RED; final_box_color = Fore.RED
            elif "CLARIFICATION" in final_status_text: final_status_color = Fore.YELLOW; final_box_color = Fore.YELLOW

            tool_output_details = []
            # Prioritize specific keys for cleaner output
            if 'summary' in tool_output: tool_output_details.append((f"Response: {str(tool_output['summary'])}", Fore.GREEN))
            if 'reason' in tool_output: tool_output_details.append((f"Reason: {str(tool_output['reason'])}", Fore.RED))
            if 'question' in tool_output: tool_output_details.append((f"Question: {str(tool_output['question'])}", Fore.YELLOW))

            # --- MODIFIED Output for web_search ---
            if 'results' in tool_output and chosen_tool_name == "web_search":
                 tool_output_details.append((f"Search Results ({len(tool_output['results'])}):", Fore.CYAN))
                 for idx, res in enumerate(tool_output['results']): # Show all results returned by tool
                     title = res.get('title', 'N/A')
                     url = res.get('url', '')
                     snippet = res.get('snippet', 'N/A')
                     read_snippet = res.get('read_content_snippet') # May be None, a snippet, or an error

                     tool_output_details.append((f"  {idx+1}. {title} ({url})", Fore.WHITE))
                     tool_output_details.append((f"     DDG Snippet: '{snippet[:100]}...'", Fore.WHITE + Style.DIM))
                     if read_snippet is not None:
                         # Display read snippet differently based on content (error vs text)
                         if read_snippet.startswith("[Read Failed:") or read_snippet.startswith("[Read Skipped:"):
                             tool_output_details.append((f"     Read Status: {read_snippet}", Fore.YELLOW + Style.DIM))
                         elif read_snippet.startswith("[Read Success: No text"):
                             tool_output_details.append((f"     Read Status: {read_snippet}", Fore.WHITE + Style.DIM))
                         else:
                             # Show only a small part of the read snippet in the terminal
                             display_read_snippet = read_snippet[:150] + ('...' if len(read_snippet) > 150 else '')
                             tool_output_details.append((f"     Read Snippet: '{display_read_snippet}'", Fore.WHITE + Style.DIM))
                 # Add the overall message from the tool
                 if 'message' in tool_output:
                      tool_output_details.append(("", Fore.WHITE)) # Add a blank line
                      tool_output_details.append((f"Overall Status: {tool_output['message']}", Fore.CYAN))


            if 'contents' in tool_output and chosen_tool_name == "list_directory":
                 tool_output_details.append((f"Directory Listing ({tool_output.get('path', '?')}):", Fore.CYAN))
                 for item in tool_output['contents'][:10]: # Limit display
                     type_char = "[D]" if item['type'] == 'directory' else "[F]" if item['type'] == 'file' else "[?]"
                     size_str = f"{item['size_bytes']}b" if item['size_bytes'] is not None else ""
                     tool_output_details.append((f"  {type_char} {item['name']} {size_str} ({item.get('last_modified', 'N/A')})", Fore.WHITE))
                 if len(tool_output['contents']) > 10:
                     tool_output_details.append((f"  ... ({len(tool_output['contents']) - 10} more items not shown)", Fore.WHITE + Style.DIM))
            # --- MODIFIED output handling for read_file (NO CONTENT SHOWN) ---
            if chosen_tool_name == "read_file":
                 if tool_output.get("status") == "success":
                     content_len = tool_output.get('content_length', 'N/A')
                     tool_output_details.append((f"File Read ({tool_output.get('filepath','?')})", Fore.CYAN))
                     tool_output_details.append((f"  Size: {content_len} characters", Fore.WHITE))
                     # Do NOT add content snippet here by default
                     if 'message' in tool_output: # Show the status message
                         tool_output_details.append((f"  Status: {tool_output['message']}", Fore.CYAN))
                 else:
                     # Show error message if read failed
                     if 'message' in tool_output:
                         tool_output_details.append((f"File Read Error ({tool_input.get('filepath','?')})", Fore.RED))
                         tool_output_details.append((f"  Error: {tool_output['message']}", Fore.RED))

            # --- Output for existing tools ---
            if 'stdout' in tool_output and tool_output['stdout']: tool_output_details.append((f"STDOUT: {str(tool_output['stdout']).strip()[:500]}...", Fore.WHITE)) # Limit stdout display
            if 'stderr' in tool_output and tool_output['stderr']: tool_output_details.append((f"STDERR: {str(tool_output['stderr']).strip()[:500]}...", Fore.RED)) # Limit stderr display
            if 'current_code_content' in tool_output: tool_output_details.append((f"Code Read: {len(tool_output['current_code_content'])} bytes", Fore.CYAN))
            # General message display (check if it's not already handled, e.g., by read_file error or web_search)
            if 'message' in tool_output and not any(k in tool_output for k in ['summary', 'reason', 'question', 'stdout', 'stderr', 'current_code_content', 'results', 'contents']) and chosen_tool_name not in ['read_file', 'web_search']:
                 tool_output_details.append((f"Message: {str(tool_output['message'])}", Fore.CYAN))
            if 'screenshot_path' in tool_output and chosen_tool_name == "request_screenshot":
                tool_output_details.append((f"Screenshot Taken: {os.path.basename(str(tool_output['screenshot_path']))}", Fore.MAGENTA))
            if 'downloaded_file' in tool_output: tool_output_details.append((f"Downloaded: {os.path.basename(str(tool_output['downloaded_file']))}", Fore.GREEN))
            # Fallback for unhandled output structures
            if not tool_output_details and tool_output:
                 try:
                     # Avoid dumping large content in fallback too
                     temp_fallback_output = tool_output.copy()
                     if 'content' in temp_fallback_output: # Sanitize read_file content
                         temp_fallback_output['content'] = f"<Content: {len(temp_fallback_output['content'])} bytes>"
                     if 'results' in temp_fallback_output: # Sanitize web_search results
                         if isinstance(temp_fallback_output.get('results'), list):
                             for res_idx, res_item in enumerate(temp_fallback_output['results']):
                                 if isinstance(res_item, dict) and 'read_content_snippet' in res_item:
                                     if res_item['read_content_snippet'] is not None and not res_item['read_content_snippet'].startswith("["):
                                         temp_fallback_output['results'][res_idx]['read_content_snippet'] = f"<Read Snippet: {len(res_item['read_content_snippet'])} chars>"

                     raw_out_str = json.dumps(temp_fallback_output)
                     tool_output_details.append((f"Raw Output: {raw_out_str[:200]}...", Fore.WHITE + Style.DIM)) # Show limited raw output
                 except TypeError: # Handle non-serializable output
                      tool_output_details.append((f"Raw Output: <Non-serializable: {type(tool_output)}>", Fore.WHITE + Style.DIM))


            # --- [ print_response_box call for TOOL RESULT remains unchanged ] ---
            print_response_box(result_title, final_status_text, final_status_color, [(f"Tool: {chosen_tool_name}", Fore.YELLOW)], tool_output_lines=tool_output_details, box_color=final_box_color)


            # --- Prepare Action for History (Sanitize before adding) ---
            history_tool_input = tool_input
            if chosen_tool_name == 'modify_own_code' and isinstance(tool_input, dict) and 'new_code_content' in tool_input:
                history_tool_input = tool_input.copy()
                history_tool_input['new_code_content'] = f"<Code: {len(history_tool_input.get('new_code_content', ''))} bytes>"
            if chosen_tool_name == 'write_file' and isinstance(tool_input, dict) and 'content' in tool_input:
                history_tool_input = tool_input.copy()
                history_tool_input['content'] = f"<Content: {len(history_tool_input.get('content', ''))} bytes>"

            # --- MODIFIED history logging for read_file and web_search ---
            history_tool_output = tool_output.copy() if isinstance(tool_output, dict) else tool_output
            if isinstance(history_tool_output, dict): # Ensure it's a dict before modifying
                if chosen_tool_name == 'read_file' and 'content' in history_tool_output:
                    content_len = history_tool_output.get('content_length', len(history_tool_output.get('content', '')))
                    history_tool_output['content'] = f"<Content Read: {content_len} characters>"
                    # Keep content_length if present, it's useful info
                    # history_tool_output.pop('content_length', None) # Don't remove

                elif chosen_tool_name == 'web_search' and 'results' in history_tool_output:
                    if isinstance(history_tool_output.get('results'), list):
                        # Create a new list for history results to avoid modifying original output dict
                        history_results = []
                        for res_item in history_tool_output['results']:
                            history_res_item = res_item.copy() # Copy each result item
                            if isinstance(history_res_item, dict) and 'read_content_snippet' in history_res_item:
                                # Keep errors, but replace actual snippets with length for history
                                if history_res_item['read_content_snippet'] is not None and not history_res_item['read_content_snippet'].startswith("["):
                                    history_res_item['read_content_snippet'] = f"<Read Snippet: {len(history_res_item['read_content_snippet'])} chars>"
                            history_results.append(history_res_item)
                        history_tool_output['results'] = history_results # Replace results with sanitized copy

                if chosen_tool_name == 'read_own_code' and 'current_code_content' in history_tool_output:
                    history_tool_output['current_code_content'] = f"<Code Read: {len(history_tool_output.get('current_code_content',''))} bytes>"

            current_action_history_entry = {
                "iteration": iteration_count,
                "goal": current_goal, # Keep goal for context if needed later
                "thought": ai_thought,
                "tool_used": chosen_tool_name,
                "tool_input": history_tool_input, # Use sanitized input
                "tool_output": history_tool_output # Use sanitized output
                # Screenshot path added below
            }
            # history_of_actions.append(current_action_log) # Add to history *after* screenshot logic

            # --- [ Code Modification Restart Logic remains unchanged ] ---
            if tool_output.get("status") == "code_modified_restart_required" or tool_output.get("status") == "code_reverted_restart_required":
                print_terminal_style(tool_output.get("message", "Code changed. Restart script."), "general_success")
                # log_interaction({**current_action_log, "final_status": "SCRIPT_EXIT_RESTART_REQ", "timestamp": datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')}); # REMOVED LOG
                sys.exit(0)

            # --- Screenshot Logic ---
            new_screenshot_path_for_next_prompt = None
            # --- Updated list of tools that DON'T trigger auto-screenshot ---
            no_screenshot_tools = [
                "final_answer", "report_failure", "ask_user_for_clarification",
                "read_own_code", "modify_own_code", "revert_to_previous_code_version",
                "change_ai_model", "request_screenshot", # Provides its own
                "web_search", "list_directory", "read_file", "write_file" # Added new tools
            ]

            screenshot_status_for_history = "not_applicable" # Default for history entry
            if chosen_tool_name == "request_screenshot" and tool_output.get("status") == "success":
                new_screenshot_path_for_next_prompt = tool_output.get("screenshot_path")
                if new_screenshot_path_for_next_prompt:
                    screenshot_status_for_history = new_screenshot_path_for_next_prompt # Log path
                    print_terminal_style(f"Screenshot from 'request_screenshot' for next prompt: {os.path.basename(new_screenshot_path_for_next_prompt)}", "general_info")
                else:
                    screenshot_status_for_history = "request_screenshot_success_but_no_path"
            elif chosen_tool_name not in no_screenshot_tools:
                if ImageGrab and Image: # Pillow must be available for automatic screenshots
                    ss_result = take_screenshot_tool_internal(f"tool_{chosen_tool_name}_iter_{iteration_count}")
                    if ss_result.get("status") == "success":
                        new_screenshot_path_for_next_prompt = ss_result.get("screenshot_path")
                        screenshot_status_for_history = new_screenshot_path_for_next_prompt # Log path
                        print_terminal_style(f"Automatic screenshot for next prompt: {os.path.basename(new_screenshot_path_for_next_prompt)}", "general_info")
                    else:
                        screenshot_status_for_history = "failed_auto: " + ss_result.get('message','Unknown error')
                else:
                    screenshot_status_for_history = "skipped_auto_no_pillow"
            # else: screenshot_status_for_history remains "not_applicable"

            # Add screenshot info to the history entry *before* appending
            current_action_history_entry["screenshot_taken_after_action"] = screenshot_status_for_history
            history_of_actions.append(current_action_history_entry) # Add completed entry to history

            screenshot_path_for_current_prompt = new_screenshot_path_for_next_prompt # Prepare for the *next* iteration

            # --- REMOVED Log interaction call and print statement ---
            # log_interaction({**current_action_log, "tool_output": log_tool_output, "timestamp": datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')})
            # print_terminal_style(f"[LOG ID: #{SESSION_ID}-{iteration_count}] Action logged.", "system_info_major", prefix_override="> ", color_override=Fore.WHITE + Style.DIM, text_color_override=Fore.WHITE + Style.DIM);
            print() # Keep the newline for spacing

            # --- Check for End Conditions ---
            if chosen_tool_name == "final_answer" and tool_output.get("status") == "goal_achieved": print_terminal_style("GOAL ACHIEVED!", "system_banner_center_text", color_override=Fore.GREEN + Style.BRIGHT, prefix_override="🎉"); break
            if chosen_tool_name == "report_failure" and tool_output.get("status") == "goal_failed": print_terminal_style("GOAL FAILED!", "system_banner_center_text", color_override=Fore.RED + Style.BRIGHT, prefix_override="❌"); break
            if chosen_tool_name == "ask_user_for_clarification" and tool_output.get("status") == "clarification_needed":
                print_terminal_style("AI REQUIRES CLARIFICATION", "system_banner_center_text", color_override=Fore.YELLOW + Style.BRIGHT, prefix_override="❓")
                user_response = ""
                try: user_response = get_terminal_input(f"AI Asks: \"{tool_output.get('question', 'Input needed...')}\"\nYour response (or 'ABORT_GOAL'):", show_cursor=True).strip()
                except KeyboardInterrupt: user_response = "ABORT_GOAL"
                if user_response.upper() == "ABORT_GOAL": print_terminal_style("User aborted goal.", "general_info"); break
                # Add user response to history for context in the next iteration
                # Ensure the logged output here is also sanitized if needed (user_response is usually short)
                history_of_actions.append({
                    "iteration": iteration_count + 0.5, # Mark as intermediate step
                    "thought": "User provided clarification.",
                    "tool_used": "user_input_clarification",
                    "tool_input": {"ai_question": tool_output.get('question')},
                    "tool_output": {"status": "user_input_clarification", "user_response": user_response}, # Add status here too
                    # Carry over the screenshot path from *before* the clarification was asked
                    "screenshot_taken_after_action": current_action_history_entry.get("screenshot_taken_after_action")
                })
                continue # Go to next iteration with user input added to history

        # --- End of Iteration Loop ---
        if iteration_count >= MAX_AUTONOMOUS_ITERATIONS: print_terminal_style(f"MAX ITERATIONS ({MAX_AUTONOMOUS_ITERATIONS}) REACHED.", "system_banner_center_text", color_override=Fore.RED + Style.BRIGHT, prefix_override="🚫")
        print_terminal_style(f"SESSION FOR GOAL \"{current_goal}\" ENDED.", "system_banner_center_text", color_override=Fore.BLUE, prefix_override="🏁")
        print_terminal_style(None, "system_header_full_line"); print_terminal_style("AWAITING NEW GOAL.", "system_info_minor", prefix_override=">> ", color_override=Fore.GREEN); print()


# --- Entry Point ---
if __name__ == "__main__":
    # --- [ Disclaimer and Confirmation remain unchanged ] ---
    warning_color = Fore.RED + Style.BRIGHT; box_title = "☢️ CRITICAL WARNING & DISCLAIMER ☢️"
    print_terminal_style(box_title, "boxed_content_top", box_color_override=warning_color, text_color_override=warning_color)
    messages = ["THIS IS AN AUTONOMOUS AI AGENT.", "IT CAN ACCESS FILES, EXECUTE CODE, CONTROL GUI, INSTALL SOFTWARE,", "SEARCH THE WEB, AND MODIFY ITS OWN SOURCE CODE. IT TAKES SCREENSHOTS.", "MONITOR ITS ACTIONS CLOSELY. USE AT YOUR OWN EXTREME RISK.", "DEVELOPER(S)/PROVIDER(S) ARE NOT RESPONSIBLE FOR ANY DAMAGE/LOSS."]
    current_term_width_for_warning = get_current_terminal_width(); content_width_for_warning = max(1, current_term_width_for_warning - 4)
    for msg_line in messages:
        display_msg = msg_line
        if len(msg_line) <= content_width_for_warning: display_msg = (" " * max(0, (content_width_for_warning - len(msg_line)) // 2)) + msg_line
        print_terminal_style(display_msg, "boxed_content_line", text_color_override=warning_color, box_color_override=warning_color)
    print_terminal_style(None, "boxed_content_bottom", box_color_override=warning_color); print()
    try:
        confirmation = get_terminal_input("TYPE 'UNDERSTAND_THE_RISKS_AND_PROCEED' TO CONTINUE:", show_cursor=True).strip()
        if confirmation == "UNDERSTAND_THE_RISKS_AND_PROCEED": print_terminal_style("Confirmation received. Initializing agent...", "general_success"); time.sleep(1); main()
        else: print_terminal_style("Confirmation not received or incorrect. Aborting.", "general_info")
    except KeyboardInterrupt: print_terminal_style("\nScript startup aborted by user (Ctrl+C).", "general_info")
    except Exception as e_confirm: print_terminal_style(f"Unexpected error during confirmation: {e_confirm}. Aborting.", "general_error")

# --- END OF FILE new_enhanced.py ---
