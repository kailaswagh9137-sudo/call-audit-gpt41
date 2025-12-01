import express from "express";
import multer from "multer";
import fs from "fs";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

fs.mkdirSync("uploads", { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

// ROOT TEST ENDPOINT
app.get("/", (req, res) => {
  res.send("Call Audit GPT-4.1 Backend Running 🚀");
});

// AUDIO UPLOAD
app.post("/upload", upload.single("audio"), async (req, res) => {
  try {
    console.log("Received:", req.file?.originalname);

    if (!req.file) {
      return res.json({ status: "error", message: "No audio uploaded" });
    }

    // send to GPT-4.1 audio-to-text
    const response = await client.audio.transcriptions.create({
      model: "gpt-4o-transcribe",
      file: fs.createReadStream(req.file.path)
    });

    console.log("Transcription:", response.text);

    res.json({
      status: "ok",
      transcript: response.text
    });

  } catch (err) {
    console.log("❗ ERROR:", err);
    res.json({ status: "error", error: err.message });
  }
});

// PORT for Render
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log("Running on port", PORT));
