from PIL import Image
from tkinter import Tk, filedialog
import os

def convert_multiple_to_webp_0_quality():
    """
    Converts multiple selected images to WebP format with 0 quality.
    Allows the user to choose multiple input image files using a file dialog.
    """

    # Hide the main tkinter window
    Tk().withdraw()

    # Open file dialog to select multiple image files (note 'askopenfilenames')
    file_paths = filedialog.askopenfilenames(
        title="Select Multiple Image Files",
        filetypes=[("Image files", "*.png *.jpg *.jpeg *.bmp *.gif *.tiff *.webp")]
    )

    if not file_paths: # file_paths will be an empty tuple if no files are selected
        print("No image files selected. Conversion cancelled.")
        return

    for file_path in file_paths:
        try:
            img = Image.open(file_path)

            # Create output file name
            base, ext = os.path.splitext(file_path)
            output_file = base + ".webp"

            # Save as WebP with quality=0
            img.save(output_file, "webp", quality=0)

            print(f"Converted: {file_path}  ->  {output_file} (WebP, 0 quality)")

        except FileNotFoundError:
            print(f"Error: Image file not found at '{file_path}'.")
        except Exception as e:
            print(f"Error converting {file_path}: {e}")

    print("Batch conversion complete.")

if __name__ == "__main__":
    convert_multiple_to_webp_0_quality()