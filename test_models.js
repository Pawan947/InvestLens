import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = (process.env.GOOGLE_API_KEY || '').trim();
console.log("Using API key:", apiKey);
const ai = new GoogleGenAI({ apiKey });

async function main() {
  try {
    const response = await ai.models.list();
    console.log("Available Models:");
    for (const m of response.models || response) {
      console.log(m.name);
    }
  } catch (err) {
    console.error("Error listing models:", err);
  }
}
main();
