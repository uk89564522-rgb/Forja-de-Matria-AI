const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();
const app = express();
const port = 5000;
app.use(express.json({ limit: '4.5mb' }));
app.use(express.urlencoded({ limit: '4.5mb', extended: true }));

const frontendURL = 'http://localhost:5173';
const corsOptions = { origin: frontendURL };
app.use(cors(corsOptions));
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// Helper: Clean CSVs (remove code block markers)
const cleanCsv = (csv) => {
  if (!csv) return '';
  if (csv.includes('```')) {
    const match = csv.match(/```(?:csv)?\s*([\s\S]*?)\s*```/i);
    if (match) return match[1].trim();
  }
  return csv.trim();
};

const prompt = `Role: A meticulous and highly accurate data extraction assistant. you are designed to be a reliable tool for pulling specific, structured information from user-provided PDF documents data.
Core Objective: To accurately extract user-requested information from an uploaded PDF, format it into a csv format, and rigorously verify the output against the source document to eliminate hallucinations and ensure factual correctness.
... (your full prompt here, unchanged) ...
Error Handling: If the verification step reveals significant discrepancies or low confidence in the extracted data, the agent should not present a potentially incorrect table. Instead, it should write NA in that cell?`;

// Main route: Extract text from multiple PDFs and process with selected LLM
app.post("/extract-multi-file-data", upload.array("files"), async (req, res) => {
  try {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }
    if (!req.body.fields) {
      return res.status(400).json({ error: "All fields are important" });
    }
    const llmModel = req.body.llmModel || "gemini";
    const apiKey = req.body.apiKey;
    if (!apiKey) {
      return res.status(400).json({ error: "API key is required" });
    }

    // Dynamically require SDKs as needed
    let ai, openai, grok, deepseek, claude, kimi;
    if (llmModel === "gemini") {
      const { GoogleGenAI } = require("@google/genai");
      ai = new GoogleGenAI({ apiKey });
    } else if (llmModel === "openai") {
      const OpenAI = require("openai");
      openai = new OpenAI({ apiKey });
    } else if (llmModel === "grok") {
      // Grok (xAI) - using axios for HTTP API
      grok = axios.create({
        baseURL: "https://api.grok.x.ai/v1",
        headers: { Authorization: `Bearer ${apiKey}` }
      });
    } else if (llmModel === "deepseek") {
      // Deepseek - using axios for HTTP API
      deepseek = axios.create({
        baseURL: "https://api.deepseek.com/v1",
        headers: { Authorization: `Bearer ${apiKey}` }
      });
    } else if (llmModel === "claude") {
      // Claude (Anthropic) - using anthropic SDK
      const { Anthropic } = require("@anthropic-ai/sdk");
      claude = new Anthropic({ apiKey });
    } else if (llmModel === "kimi") {
      // KIMI - using axios for HTTP API
      kimi = axios.create({
        baseURL: "https://api.moonshot.cn/v1",
        headers: { Authorization: `Bearer ${apiKey}` }
      });
    } else {
      return res.status(400).json({ error: "Unsupported LLM model" });
    }

    // Process all files in parallel
    const results = await Promise.all(req.files.map(async (file) => {
      try {
        const pdfData = await pdfParse(file.buffer);
        const rawText = pdfData.text;
        let result = '';

        if (llmModel === "gemini") {
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `${prompt}. Here is the extracted PDF text:\n\n${rawText} please extract according to these specific data columns: ${req.body?.fields}`,
          });
          result = response.text || JSON.stringify(response);
        } else if (llmModel === "openai") {
          const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: prompt },
              { role: "user", content: `Here is the extracted PDF text:\n\n${rawText} please extract according to these specific data columns: ${req.body?.fields}` },
            ],
          });
          result = response.choices[0].message.content;
        } else if (llmModel === "grok") {
          // Grok API (xAI)
          const response = await grok.post("/chat/completions", {
            model: "grok-1.5",
            messages: [
              { role: "system", content: prompt },
              { role: "user", content: `Here is the extracted PDF text:\n\n${rawText} please extract according to these specific data columns: ${req.body?.fields}` }
            ]
          });
          result = response.data.choices[0].message.content;
        } else if (llmModel === "deepseek") {
          // Deepseek API
          const response = await deepseek.post("/chat/completions", {
            model: "deepseek-chat",
            messages: [
              { role: "system", content: prompt },
              { role: "user", content: `Here is the extracted PDF text:\n\n${rawText} please extract according to these specific data columns: ${req.body?.fields}` }
            ]
          });
          result = response.data.choices[0].message.content;
        } else if (llmModel === "claude") {
          // Claude (Anthropic)
          const response = await claude.messages.create({
            model: "claude-3-opus-20240229",
            max_tokens: 2048,
            messages: [
              { role: "user", content: `System: ${prompt}\n\nHere is the extracted PDF text:\n\n${rawText} please extract according to these specific data columns: ${req.body?.fields}` }
            ]
          });
          result = response.content[0].text;
        } else if (llmModel === "kimi") {
          // KIMI (Moonshot)
          const response = await kimi.post("/chat/completions", {
            model: "moonshot-v1-8k",
            messages: [
              { role: "system", content: prompt },
              { role: "user", content: `Here is the extracted PDF text:\n\n${rawText} please extract according to these specific data columns: ${req.body?.fields}` }
            ]
          });
          result = response.data.choices[0].message.content;
        }

        return { filename: file.originalname, result };
      } catch (err) {
        return { filename: file.originalname, error: `Failed to extract PDF with ${llmModel}` };
      }
    }));

    // Combine CSVs
    const csvsWithFilenames = results.map(r => `Filename: ${r.filename}\n${cleanCsv(r.result)}`).join('\n\n');
    const combinePrompt = `You are a CSV data assistant. You will be given multiple CSVs, each extracted from a different PDF file. Each CSV is preceded by its filename. Combine all the CSVs into a single CSV table. Add a new column called 'filename' as the first column, and for each row, fill it with the corresponding filename. Ensure the header row appears only once at the top. If the columns differ, use all unique columns and leave missing values blank. Output only the final combined CSV, nothing else.\n\n${csvsWithFilenames}`;

    let combinedCsv = '';
    try {
      // Use the same LLM for combining
      if (llmModel === "gemini") {
        const combineResponse = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: combinePrompt,
        });
        combinedCsv = cleanCsv(combineResponse.text || JSON.stringify(combineResponse));
      } else if (llmModel === "openai") {
        const combineResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: combinePrompt }
          ]
        });
        combinedCsv = cleanCsv(combineResponse.choices[0].message.content);
      } else if (llmModel === "grok") {
        const combineResponse = await grok.post("/chat/completions", {
          model: "grok-1.5",
          messages: [
            { role: "system", content: combinePrompt }
          ]
        });
        combinedCsv = cleanCsv(combineResponse.data.choices[0].message.content);
      } else if (llmModel === "deepseek") {
        const combineResponse = await deepseek.post("/chat/completions", {
          model: "deepseek-chat",
          messages: [
            { role: "system", content: combinePrompt }
          ]
        });
        combinedCsv = cleanCsv(combineResponse.data.choices[0].message.content);
      } else if (llmModel === "claude") {
        const combineResponse = await claude.messages.create({
          model: "claude-3-opus-20240229",
          max_tokens: 2048,
          messages: [
            { role: "user", content: `System: ${combinePrompt}` }
          ]
        });
        combinedCsv = cleanCsv(combineResponse.content[0].text);
      } else if (llmModel === "kimi") {
        const combineResponse = await kimi.post("/chat/completions", {
          model: "moonshot-v1-8k",
          messages: [
            { role: "system", content: combinePrompt }
          ]
        });
        combinedCsv = cleanCsv(combineResponse.data.choices[0].message.content);
      }
    } catch (combineErr) {
      console.error(`Error combining CSVs with ${llmModel}:`, combineErr);
      combinedCsv = '';
    }

    res.json({ results, combinedCsv });
  } catch (err) {
    console.error("Error extracting multiple PDFs:", err);
    res.status(500).json({ error: "Failed to extract multiple PDFs" });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString()
  });
});

app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});
