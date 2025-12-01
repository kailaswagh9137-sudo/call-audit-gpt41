import express from "express";
import multer from "multer";
import fs from "fs";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(cors());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const upload = multer({ dest: "uploads/" });

app.get("/", (req, res) => {
  res.send("Call Audit GPT-4.1 Backend Running 🚀");
});

app.post("/transcribe", upload.single("audio"), async (req, res) => {

  try {
    console.log("🔥 Received /transcribe request");
    console.log("File:", req.file);

    const filePath = req.file.path;

    // CREATE LEFT & RIGHT STEREO EXTRACTS
    const left = `uploads/${req.file.filename}_LEFT.wav`;
    const right = `uploads/${req.file.filename}_RIGHT.wav`;

    // FFmpeg extract left + right separately
    await execFFMPEG(`ffmpeg -i ${filePath} -map_channel 0.0.0 ${left}`);
    await execFFMPEG(`ffmpeg -i ${filePath} -map_channel 0.0.1 ${right}`);

    console.log("🎧 Stereo channels extracted");

    // Load audio
    const leftAudio = fs.readFileSync(left);
    const rightAudio = fs.readFileSync(right);

    // Send LEFT (agent) to GPT-4.1 for BEST TEXT accuracy
    const agentTranscript = await openai.audio.transcriptions.create({
      file: leftAudio,
      model: "gpt-4.1",
      response_format: "text",
      language: "hi"
    });

    // Send RIGHT (customer)
    const customerTranscript = await openai.audio.transcriptions.create({
      file: rightAudio,
      model: "gpt-4.1",
      response_format: "text",
      language: "hi"
    });

    console.log("🧠 GPT-4.1 transcription complete");

    // Now MERGE conversation
    const mergedDialogue = `
Agent: ${agentTranscript}
---
Customer: ${customerTranscript}
`;

    res.json({
      status: "ok",
      stereoMode: true,
      agent: agentTranscript,
      customer: customerTranscript,
      merged: mergedDialogue
    });

  } catch (err) {
    console.error("❗ ERROR:", err);
    res.json({
      status: "error",
      message: err.message
    });
  }
});

function execFFMPEG(command) {
  return new Promise((resolve, reject) => {
    const child = require("child_process").exec(command, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

app.listen(4000, () => console.log("Server running on port 4000"));
