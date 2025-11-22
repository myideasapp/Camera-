import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.API_KEY || '';

const ai = new GoogleGenAI({ apiKey: API_KEY });

export const analyzeTimeFrame = async (imageData: string): Promise<string> => {
  if (!API_KEY) {
    return "Error: API Key missing. Cannot analyze time stream.";
  }

  try {
    // Remove the data URL prefix (e.g., "data:image/jpeg;base64,") to get just the base64 string
    const base64Data = imageData.split(',')[1];

    const model = 'gemini-2.5-flash';
    
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data
            }
          },
          {
            text: "Analyze this image from a past timeline. Describe what is happening in a mix of Hindi and English (Hinglish). Keep it concise and analytical."
          }
        ]
      },
      config: {
        systemInstruction: "You are Chronos, a time machine AI. You analyze past events. Speak in Hinglish (Hindi written in English script). Example: 'Scene me ek vyakti dikh raha hai jo car chala raha hai.' Keep tone robotic but helpful.",
        temperature: 0.7,
      }
    });

    return response.text || "No analysis data retrieved from the timeline.";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "Sampark toot gaya. Analysis nahi ho paya.";
  }
};