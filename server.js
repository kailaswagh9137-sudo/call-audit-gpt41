import express from "express";
import multer from "multer";
import OpenAI from "openai";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const app = express();
const upload = multer({ dest: "uploads/" });

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const splitStereo = (input, baseName) => {
  execSync(`ffmpeg -y -i ${input} -map_channel 0.0.0 processed/${baseName}_agent.wav -map_channel 0.0.1 processed/${baseName}_customer.wav`);
};

async function gptTranscribe(filePath) {
  const result = await client.chat.completions.create({
    model: "gpt-4.1",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `
Transcribe audio EXACTLY as spoken.
No grammar correction.
No rewriting.
Maintain filler words.
Maintain original words.
Add frequent timestamps.
`
      },
      {
        role: "user",
        content: [
          {
            type: "input_audio",
            audio: fs.readFileSync(filePath),
            format: "wav"
          }
        ]
      }
    ]
  });

  return result.choices[0].message.content;
}

app.post("/upload", upload.single("audio"), async (req, res) => {
  try {
    const file = req.file;
    const base = path.basename(file.filename);

    fs.mkdirSync("processed", { recursive: true });

    splitStereo(file.path, base);

    const agentText = await gptTranscribe(`processed/${base}_agent.wav`);
    const customerText = await gptTranscribe(`processed/${base}_customer.wav`);

    const merged = await client.chat.completions.create({
      model: "gpt-4.1",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
Merge two transcripts into realistic dialog.

DO NOT THINK.
JUST ALIGN.

FORMAT:

[time] Agent:
[time] Customer:

`
        },
        {
          role: "user",
          content: "AGENT TRANSCRIPT:\n" + agentText
        },
        {
          role: "user",
          content: "CUSTOMER TRANSCRIPT:\n" + customerText
        }
      ]
    });

    const finalTranscript = merged.choices[0].message.content;

    const qa = await client.chat.completions.create({
      model: "gpt-4.1",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
You are a professional NBFC call QA evaluator.
Analyze transcript.

Return JSON ONLY:

{
  "call_summary":"",
  "agent_professionalism_score":1-10,
  "urgency_creation_score":1-10,
  "customer_sentiment":"",
  "abusive_language_detected":true/false,
  "legal_violation_detected":true/false,
  "rbi_violation_detected":true/false
}
`
        },
        {
          role: "user",
          content: finalTranscript
        }
      ]
    });

    res.json({
      status: "ok",
      final_transcript: finalTranscript,
      QA: qa.choices[0].message.content
    });

  } catch (e) {
    res.json({
      status: "error",
      message: e.message
    });
  }
});

app.listen(4000, () => console.log("GPT-4.1 Audit Server running on 4000"));
