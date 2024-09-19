const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const EventEmitter = require('events');

const app = express();
const port1 = 3001; // First port
const port2 = 8080; // Second port
const port3 = 5500; // Third port

// Enable CORS for all origins
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, '/')));

// Create an EventEmitter for SSE
const abChangeEmitter = new EventEmitter();

// Set up Multer storage engine to store images in 'image' folder
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const imagePath = path.join(__dirname, 'image');
    cb(null, imagePath);
  },
  filename: (_req, file, cb) => {
    cb(null, file.originalname);
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
      await fs.unlink(fullImagePath);
      console.log(`Image deleted: ${imagePath}`);
    } catch (err) {
      console.error(`Error deleting image: ${imagePath}`, err);
    }
  } else {
    console.log(`Invalid image format, skipping deletion: ${imagePath}`);
  }
}

// Helper function to find image links in text
function findImageLinks(text) {
  return text ? text.match(/\(image\/[^)]+\)/g) || [] : [];
}

// Helper function to delete unused images
async function deleteUnusedImages(oldImages, newImages) {
  const imagesToDelete = oldImages.filter(img => !newImages.includes(img));
  for (const img of imagesToDelete) {
    const imagePath = img.replace(/[()]/g, ''); // Remove parentheses
    await deleteImageFile(imagePath);
  }
}

const normalizeLineBreaks = (text) => text.replace(/(\r\n|\r|\\n)/g, '\n');

app.use(express.json()); // To parse JSON request bodies

app.post('/start-server', (req, res) => {
  console.log('Server start request received!');
  res.send('Server starting...'); 
});

// POST route for handling image uploads
app.post('/upload', upload.array('images[]'), (req, res) => {
  try {
    const fileNames = req.files.map(file => file.filename);
    res.json({ message: 'Images uploaded successfully', files: fileNames });
  } catch (error) {
    console.error('Error during image upload:', error);
    res.status(500).json({ error: 'Error uploading images' });
  }
});

// SSE route for ab.json changes for all ports
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

// Merged routes for questions.json and ab.json
const endpoints = ['questions.json', 'ab.json'];

endpoints.forEach(endpoint => {
  // GET route
  app.get(`/${endpoint}`, async (_req, res) => {
    try {
      const data = await readJsonFile(endpoint);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: `Error reading ${endpoint}` });
    }
  });

  // POST route
app.post(`/${endpoint}`, upload.array('images[]'), async (req, res) => {
  try {
    const data = await readJsonFile(endpoint);
    let newData;

    if (endpoint === 'questions.json') {
      let { section, question, options, correctAnswer } = req.body;
      question = normalizeLineBreaks(question);
      correctAnswer = normalizeLineBreaks(correctAnswer);

      // Temporarily replace line breaks in options with a placeholder
      const placeholder = '__LINE_BREAK__';
      const optionsWithoutLineBreaks = options.replace(/\r?\n/g, placeholder);

      let parsedOptions;
      try {
        parsedOptions = Array.isArray(options) ? options : JSON.parse(optionsWithoutLineBreaks);
      } catch (parseError) {
        return res.status(400).json({ error: 'Invalid options format' });
      }

      // Restore line breaks in parsedOptions
      parsedOptions = parsedOptions.map(option => option.replace(new RegExp(placeholder, 'g'), '\n'));

      const sectionIndex = data.sections.findIndex(s => s.section === section);
      if (sectionIndex === -1) {
        data.sections.push({ section, questions: [] });
      }

      newData = {
        question,
        options: parsedOptions,
        correctAnswer,
        answered: false,
        selectedAnswer: null
      };

      data.sections[sectionIndex].questions.push(newData);
    } else if (endpoint === 'ab.json') {
      let { subject, section, question, explanation } = req.body;
      question = normalizeLineBreaks(question);
      explanation = normalizeLineBreaks(explanation);

      if (!data[subject]) {
        data[subject] = { a: [], b: [] };
      }

      newData = { question, explanation };
      data[subject][section].push(newData);

      abChangeEmitter.emit('update', { type: 'add', subject, section, question: newData });
    }

    await writeJsonFile(endpoint, data);
    res.json({ message: 'Question added successfully' });
  } catch (error) {
    console.error(`Error adding question to ${endpoint}:`, error.message);
    res.status(500).json({ error: `Error adding question to ${endpoint}` });
  }
});


  // PUT route
  app.put(`/${endpoint}`, async (req, res) => {
    try {
      const data = await readJsonFile(endpoint);
      const isQuestionsFile = endpoint === 'questions.json';
      const body = req.body;
  
      const getSectionIndex = (sections, section) => sections.findIndex(s => s.section === section);
      const validateIndex = (index, array) => index >= 0 && index < array.length;
  
      const { section, questionIndex } = body;
      let sectionData, oldQuestion, oldImageLinks = [], newImageLinks = [];
  
      if (isQuestionsFile) {
        const { newQuestion, newOptions, newAnswer } = body;
        const parsedOptions = Array.isArray(newOptions) ? newOptions : JSON.parse(newOptions);
  
        const sectionIndex = getSectionIndex(data.sections, section);
        if (sectionIndex === -1 || !validateIndex(questionIndex, data.sections[sectionIndex].questions)) {
          return res.status(404).json({ error: 'Invalid section or question index' });
        }
  
        sectionData = data.sections[sectionIndex].questions[questionIndex];
        oldImageLinks = [
          ...findImageLinks(sectionData.question),
          ...sectionData.options.flatMap(findImageLinks),
          ...findImageLinks(sectionData.correctAnswer)
        ];
        newImageLinks = [
          ...findImageLinks(newQuestion),
          ...parsedOptions.flatMap(findImageLinks),
          ...findImageLinks(newAnswer)
        ];
  
        sectionData = { question: newQuestion, options: parsedOptions, correctAnswer: newAnswer, answered: false, selectedAnswer: null };
        data.sections[sectionIndex].questions[questionIndex] = sectionData;
      } else {
        const { subject, newQuestion, newExplanation } = body;
  
        if (!data[subject] || !data[subject][section] || !validateIndex(questionIndex, data[subject][section])) {
          return res.status(404).json({ error: 'Invalid subject, section, or question index' });
        }
  
        sectionData = data[subject][section][questionIndex];
        oldImageLinks = [
          ...findImageLinks(sectionData.question),
          ...findImageLinks(sectionData.explanation)
        ];
        newImageLinks = [
          ...findImageLinks(newQuestion),
          ...findImageLinks(newExplanation)
        ];
  
        sectionData = { question: newQuestion, explanation: newExplanation };
        data[subject][section][questionIndex] = sectionData;
  
        abChangeEmitter.emit('update', { type: 'modify', subject, section, questionIndex, question: sectionData });
      }
  
      await deleteUnusedImages(oldImageLinks, newImageLinks);
      await writeJsonFile(endpoint, data);
      res.json({ message: 'Question updated successfully' });
    } catch (error) {
      console.error(`Error updating question in ${endpoint}:`, error);
      res.status(500).json({ error: `Error updating question in ${endpoint}` });
    }
  });
  

  // DELETE route
  app.delete(`/${endpoint}`, async (req, res) => {
    try {
      const data = await readJsonFile(endpoint);

      if (endpoint === 'questions.json') {
        const { section, questionIndex } = req.body;

        const sectionIndex = data.sections.findIndex(s => s.section === section);
        if (sectionIndex === -1) {
          return res.status(404).json({ error: 'Section not found' });
        }

        if (questionIndex < 0 || questionIndex >= data.sections[sectionIndex].questions.length) {
          return res.status(404).json({ error: 'Question not found by index' });
        }

        const questionData = data.sections[sectionIndex].questions[questionIndex];
        const { question, options, correctAnswer } = questionData;

        const imageLinks = [
          ...findImageLinks(question),
          ...options.flatMap(option => findImageLinks(option)),
          ...findImageLinks(correctAnswer)
        ];

        await Promise.all(imageLinks.map(async (link) => {
          const imagePath = link.replace(/[()]/g, '');
          await deleteImageFile(imagePath);
        }));

        data.sections[sectionIndex].questions.splice(questionIndex, 1);
      } else if (endpoint === 'ab.json') {
        const { subject, section, questionIndex } = req.body;

        if (!data[subject] || !data[subject][section]) {
          return res.status(404).json({ error: 'Subject or section not found' });
        }

        if (questionIndex < 0 || questionIndex >= data[subject][section].length) {
          return res.status(404).json({ error: 'Question not found' });
        }

        const questionData = data[subject][section][questionIndex];
        const { question: questionText, explanation } = questionData;

        const imageLinks = [
          ...findImageLinks(questionText),
          ...findImageLinks(explanation)
        ];

        await Promise.all(imageLinks.map(async (link) => {
          const imagePath = link.replace(/[()]/g, '');
          await deleteImageFile(imagePath);
        }));

        const deletedQuestion = data[subject][section].splice(questionIndex, 1)[0];
        abChangeEmitter.emit('update', { type: 'delete', subject, section, questionIndex, question: deletedQuestion });
      }

      await writeJsonFile(endpoint, data);
      res.json({ message: 'Question and associated images deleted successfully' });
    } catch (error) {
      console.error(`Error deleting question from ${endpoint}:`, error);
      res.status(500).json({ error: `Error deleting question from ${endpoint}` });
    }
  });
});

// Start servers on all ports
app.listen(port1, () => {
  console.log(`Server running on port ${port1}`);
});

app.listen(port2, () => {
  console.log(`Server running on port ${port2}`);
});

app.listen(port3, () => {
  console.log(`Server running on port ${port3}`);
});