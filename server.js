const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const multer = require('multer'); // Import multer for handling file uploads
const EventEmitter = require('events');
const app = express();
const port = 3001;

// Enable CORS for all origins
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // For form data
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});

// Create an EventEmitter for SSE
const abChangeEmitter = new EventEmitter();

// Set up Multer storage engine to store images in 'image' folder
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const imagePath = path.join(__dirname, 'image');
    cb(null, imagePath); // Save in 'image' folder
  },
  filename: (_req, file, cb) => {
    cb(null, file.originalname); // Use original file name
  }
});

// Create the upload middleware using multer
const upload = multer({ 
  storage, 
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Please upload a valid image file.'), false);
    }
    cb(null, true);
  }
});

// Helper function to read JSON file
async function readJsonFile(filename) {
  const filePath = path.join(__dirname, filename);
  const data = await fs.readFile(filePath, 'utf8');
  return JSON.parse(data);
}

// Helper function to write JSON file
async function writeJsonFile(filename, data) {
  const filePath = path.join(__dirname, filename);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

// Helper function to delete an image file if it has a valid extension
async function deleteImageFile(imagePath) {
  const validImageRegex = /\.(gif|jpe?g|tiff?|png|webp|bmp|svg|ico|avif)$/i;
  
  if (validImageRegex.test(imagePath)) {
    try {
      const fullImagePath = path.join(__dirname, imagePath);
      await fs.unlink(fullImagePath); // Delete the file from the filesystem
      console.log(`Image deleted: ${imagePath}`);
    } catch (err) {
      console.error(`Error deleting image: ${imagePath}`, err);
    }
  } else {
    console.log(`Invalid image format, skipping deletion: ${imagePath}`);
  }
}

// SSE route for ab.json changes
app.get('/sse/ab.json', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Cache-Control', 'no-cache');
  
  const listener = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  abChangeEmitter.on('update', listener);
  
  req.on('close', () => {
    abChangeEmitter.off('update', listener);
  });
});

// GET route for questions.json
app.get('/questions.json', async (req, res) => {
  try {
    const data = await readJsonFile('questions.json');
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Error reading questions.json' });
  }
});

// GET route for ab.json
app.get('/ab.json', async (req, res) => {
  try {
    const data = await readJsonFile('ab.json');
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Error reading ab.json' });
  }
});

// POST route for questions.json (with multiple image uploads)
app.post('/questions.json', upload.array('images[]'), async (req, res) => {
  try {
    const data = await readJsonFile('questions.json');
    const { section, question, options, correctAnswer } = req.body;

    const parsedOptions = Array.isArray(options) ? options : JSON.parse(options);

    const sectionIndex = data.sections.findIndex(s => s.section === section);
    if (sectionIndex === -1) {
      data.sections.push({ section, questions: [] });
    }

    const newQuestion = {
      question,
      options: parsedOptions,
      correctAnswer,
      answered: false,
      selectedAnswer: null
    };

    data.sections[sectionIndex].questions.push(newQuestion);

    await writeJsonFile('questions.json', data);
    res.json({ message: 'Question added successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error adding question to questions.json' });
  }
});

// POST route for ab.json (with multiple image uploads)
app.post('/ab.json', upload.array('images[]'), async (req, res) => {
  try {
    const data = await readJsonFile('ab.json');
    const { subject, section, question, explanation } = req.body;

    if (!data[subject]) {
      data[subject] = { a: [], b: [] };
    }

    const newQuestion = {
      question,
      explanation
    };

    data[subject][section].push(newQuestion);

    await writeJsonFile('ab.json', data);
    abChangeEmitter.emit('update', { type: 'add', subject, section, question: newQuestion });
    res.json({ message: 'Question added successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error adding question to ab.json' });
  }
});

// PUT route for questions.json
app.put('/questions.json', async (req, res) => {
  try {
    const data = await readJsonFile('questions.json');
    const { oldQuestion, oldOptions, oldAnswer, newQuestion, newOptions, newAnswer, section } = req.body;

    const parsedOldOptions = Array.isArray(oldOptions) ? oldOptions : JSON.parse(oldOptions);
    const parsedNewOptions = Array.isArray(newOptions) ? newOptions : JSON.parse(newOptions);

    const sectionIndex = data.sections.findIndex(s => s.section === section);
    if (sectionIndex === -1) {
      return res.status(404).json({ error: 'Section not found' });
    }

    const questionIndex = data.sections[sectionIndex].questions.findIndex(q =>
      q.question === oldQuestion &&
      JSON.stringify(q.options) === JSON.stringify(parsedOldOptions) &&
      q.correctAnswer === oldAnswer
    );

    if (questionIndex === -1) {
      return res.status(404).json({ error: 'Question not found' });
    }

    data.sections[sectionIndex].questions[questionIndex] = {
      question: newQuestion,
      options: parsedNewOptions,
      correctAnswer: newAnswer,
      answered: false,
      selectedAnswer: null
    };

    await writeJsonFile('questions.json', data);
    res.json({ message: 'Question updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error updating question in questions.json' });
  }
});

// PUT route for ab.json
app.put('/ab.json', async (req, res) => {
  try {
    const { subject, section, newQuestion, newExplanation, questionIndex } = req.body;
    const data = await readJsonFile('ab.json');

    if (!data[subject] || !data[subject][section]) {
      return res.status(404).json({ error: 'Subject or section not found' });
    }

    if (questionIndex < 0 || questionIndex >= data[subject][section].length) {
      return res.status(404).json({ error: 'Question not found' });
    }

    data[subject][section][questionIndex] = {
      question: newQuestion,
      explanation: newExplanation
    };

    await writeJsonFile('ab.json', data);
    abChangeEmitter.emit('update', { type: 'modify', subject, section, questionIndex, question: data[subject][section][questionIndex] });
    res.json({ message: 'Question updated successfully', updatedData: data[subject][section][questionIndex] });
  } catch (error) {
    console.error('Error updating question in ab.json:', error);
    res.status(500).json({ error: 'Error updating question in ab.json' });
  }
});

// DELETE route for questions.json (supports multiple images in question, options, and answer)
app.delete('/questions.json', async (req, res) => {
  try {
    const { question, section } = req.body;

    // Read the questions.json file
    const data = await readJsonFile('questions.json');

    // Find the section index
    const sectionIndex = data.sections.findIndex(s => s.section === section);
    if (sectionIndex === -1) {
      return res.status(404).json({ error: 'Section not found' });
    }

    // Find the question index
    const questionIndex = data.sections[sectionIndex].questions.findIndex(q => q.question === question);
    if (questionIndex === -1) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // Get the question data and look for images
    const questionData = data.sections[sectionIndex].questions[questionIndex];
    const { question: questionText, options, correctAnswer } = questionData;

    // Find all image references in question text, options, and answer
    const findImages = text => text ? text.match(/\((image\/[^)]+)\)/g) : [];
    const imageLinks = [
      ...(findImages(questionText) || []),
      ...(Array.isArray(options) ? options.flatMap(findImages) : []),
      ...(findImages(correctAnswer) || [])
    ].filter(link => link); // Filter out any null values

    // Delete image files if any images are found
    if (imageLinks.length > 0) {
      await Promise.all(imageLinks.map(async (link) => {
        const imagePath = link.replace(/[()]/g, ''); // Remove parentheses
        await deleteImageFile(imagePath);
      }));
    }

    // Delete the question from the array
    data.sections[sectionIndex].questions.splice(questionIndex, 1);

    // Write the updated data back to the questions.json file
    await writeJsonFile('questions.json', data);

    res.json({ message: 'Question and associated images deleted successfully' });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({ error: 'Error deleting question from questions.json' });
  }
});



// DELETE route for ab.json (supports multiple images in question and explanation)
app.delete('/ab.json', async (req, res) => {
  try {
    const { subject, section, questionIndex } = req.body;

    // Read the ab.json file
    const data = await readJsonFile('ab.json');

    // Check if subject and section exist
    if (!data[subject] || !data[subject][section]) {
      return res.status(404).json({ error: 'Subject or section not found' });
    }

    // Check if the question index is valid
    if (questionIndex < 0 || questionIndex >= data[subject][section].length) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // Get the question data and look for images
    const questionData = data[subject][section][questionIndex];
    const { question: questionText, explanation } = questionData;

    // Find all image references in question text and explanation
    const findImages = text => text ? text.match(/\((image\/[^)]+)\)/g) : [];
    const imageLinks = [
      ...(findImages(questionText) || []),
      ...(findImages(explanation) || [])
    ].filter(link => link); // Filter out any null values

    // Delete image files if any images are found
    if (imageLinks.length > 0) {
      await Promise.all(imageLinks.map(async (link) => {
        const imagePath = link.replace(/[()]/g, ''); // Remove parentheses
        await deleteImageFile(imagePath);
      }));
    }

    // Delete the question from the array
    const deletedQuestion = data[subject][section].splice(questionIndex, 1)[0];

    // Write the updated data back to the ab.json file
    await writeJsonFile('ab.json', data);

    // Emit the SSE event for question deletion
    abChangeEmitter.emit('update', { type: 'delete', subject, section, questionIndex, question: deletedQuestion });

    res.json({ message: 'Question and associated images deleted successfully' });
  } catch (error) {
    console.error('Error deleting question from ab.json:', error);
    res.status(500).json({ error: 'Error deleting question from ab.json' });
  }
});




app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
