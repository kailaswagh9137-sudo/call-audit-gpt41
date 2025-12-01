import express from "express";
import multer from "multer";
import fs from "fs";
import { exec } from "child_process";
import OpenAI from "openai";

const app = express();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const upload = multer({ dest: "uploads/" });

function runFFMPEG(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) reject(stderr);
      else resolve(stdout);
    });
  });
}

async function transcribeChannel(filePath, speakerLabel) {
  console.log(`🎤 Transcribing ${speakerLabel} from:`, filePath);

  const response = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: "gpt-4o-transcribe",
    prompt: `
Transcribe EXACT spoken words for ${speakerLabel}.
Rules:
- DO NOT summarize
- DO NOT paraphrase
- EXACT raw speech
- Keep Hindi/English mix
- Keep bad words
`
  });

  return response.text.trim();
}

app.post("/transcribe", upload.single("audio"), async (req, res) => {
  try {
    const input = req.file.path;
    console.log("🔥 Received file:", input);

    const agentFile = `processed/${req.file.filename}_agent.wav`;
    const customerFile = `processed/${req.file.filename}_customer.wav`;

    console.log("🎧 Splitting stereo...");

    await runFFMPEG(
      `ffmpeg -y -i ${input} -map_channel 0.0.0 ${agentFile} -map_channel 0.0.1 ${customerFile}`
    );

    console.log("✔ Split OK");

    const [agentText, customerText] = await Promise.all([
      transcribeChannel(agentFile, "AGENT"),
      transcribeChannel(customerFile, "CUSTOMER")
    ]);

    console.log("✔ Transcription complete");

    res.json({
      status: "ok",
      agent_text: agentText,
      customer_text: customerText,
      combined: `
[AGENT]
${agentText}

[CUSTOMER]
${customerText}
`
    });

  } catch (err) {
    console.error("❗ ERROR:", err);
    res.status(500).json({ error: err.message || err });
  }
});

app.listen(10000, () => console.log("🚀 Running on 10000"));
