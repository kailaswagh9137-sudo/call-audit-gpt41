import express from "express";
import multer from "multer";
import { exec } from "child_process";
import fs from "fs";
import OpenAI from "openai";

const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const upload = multer({ dest: "uploads/" });

app.post("/transcribe", upload.single("audio"), async (req, res) => {
  console.log("🔥 Received /transcribe request");
  console.log("File:", req.file);

  const input = req.file.path;
  const agent = `processed/${req.file.filename}_agent.wav`;
  const customer = `processed/${req.file.filename}_customer.wav`;

  try {
    // ensure processed folder exists
    if (!fs.existsSync("processed")) fs.mkdirSync("processed");

    console.log("🎧 Splitting channels...");

    await runFFMPEG(`ffmpeg -i ${input} -map_channel 0.0.0 ${agent} -map_channel 0.0.1 ${customer}`);

    console.log("✔ FFMPEG complete");
    console.log("🎙 Sending to GPT-4.1...");

    const [agentTxt, customerTxt] = await Promise.all([
      transcribe(agent),
      transcribe(customer)
    ]);

    console.log("✔ TRANSCRIPTION DONE");

    return res.json({
      status: "ok",
      message: "Transcription completed",
      agent_text: agentTxt,
      customer_text: customerTxt
    });

  } catch (err) {
    console.log("❗ ERROR:", err);
    return res.json({ status: "error", error: err.message });
  }
});

/************** HELPERS ******************/

function runFFMPEG(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.log("🚨 FFMPEG ERROR:", stderr);
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

async function transcribe(filePath) {
  const result = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: "gpt-4o-mini-tts", 
    response_format: "text"
  });

  return result;
}

app.get("/", (req, res) => res.send("OK: SERVER LIVE"));

app.listen(4000, () => console.log("🚀 Server running on port 4000"));
