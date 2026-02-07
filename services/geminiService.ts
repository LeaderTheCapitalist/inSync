import { GoogleGenAI, Type } from "@google/genai";
import { Activity, ScheduleItem, MicroActivity, Priority, Timeframe } from "../types";

const retryWrapper = async <T,>(fn: () => Promise<T>, retries = 2): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    if (error?.message?.includes('429')) {
      throw new Error("QUOTA_EXCEEDED");
    }
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 2000));
      return retryWrapper(fn, retries - 1);
    }
    throw error;
  }
};

// Gemini 3 models
const LITE_MODEL = 'gemini-2.0-flash-lite';
const MAIN_MODEL = 'gemini-2.0-flash';

export const geminiService = {
  async generateSchedule(activities: Activity[], timeframes: Timeframe[]): Promise<ScheduleItem[]> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const activeTimeframes = timeframes.filter(tf => tf.isActive);
    
    return retryWrapper(async () => {
      const response = await ai.models.generateContent({
        model: MAIN_MODEL,
        contents: `Generate a COMPREHENSIVE 24-HOUR daily schedule.
        
        Mission Deck: ${JSON.stringify(activities)}
        
        Busy Hours (MANDATORY BLOCKED SLOTS - AI MUST PLAN AROUND THESE):
        ${JSON.stringify(activeTimeframes)}
        
        Logic & Intelligence Rules:
        1. SLEEP: 11 PM - 7 AM is strictly 'Rest'.
        2. MISSIONS: Distribute based on difficulty and priority.
        3. BUSY HOURS INTEGRATION: You MUST include EVERY busy hour entry in the schedule. 
           Strategic Planning: Analyze what the busy hour is for. If it is "Dinner", add "Dinner Prep" before it. If it is "Exam", add "Pre-Exam Review". Plan logical transitions.
        4. VARIETY: Interleave 'Task' with 'Break' and 'Habit'.
        5. NO REPETITION: Do not output multiple consecutive rows of the exact same title/type (e.g., don't list "Rest" 4 times in a row). Merge long durations into single blocks.
        6. ICONS (MANDATORY): Suggest a contextually appropriate EMOJI character for the icon field. DO NOT use solar/iconify strings. ONLY an emoji.
        7. NOTES: One encouraging cognitive note per item using Markdown.
        8. CASING: All titles and types must be Title Case.
        
        Return a chronological JSON array. Time format: 'HH:MM AM/PM'.`,
        config: {
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                time: { type: Type.STRING },
                title: { type: Type.STRING },
                type: { type: Type.STRING, enum: ['task', 'break', 'habit', 'rest', 'busy'] },
                aiNote: { type: Type.STRING },
                priority: { type: Type.STRING, enum: ['Urgent', 'Important', 'Normal'] },
                icon: { type: Type.STRING }
              },
              required: ["time", "title", "type", "aiNote", "priority", "icon"]
            }
          }
        }
      });
      
      const rawItems = JSON.parse(response.text || '[]') as ScheduleItem[];
      
      if (rawItems.length === 0) return [];

      // Logic to merge consecutive identical items
      const merged: ScheduleItem[] = [];
      for (const curr of rawItems) {
        if (merged.length > 0) {
          const prev = merged[merged.length - 1];
          if (prev.title.toLowerCase() === curr.title.toLowerCase() && prev.type === curr.type) {
            continue; 
          }
        }
        merged.push(curr);
      }
      
      return merged;
    });
  },

  async generateMicroActivities(activities: Activity[]): Promise<MicroActivity[]> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    return retryWrapper(async () => {
      const response = await ai.models.generateContent({
        model: LITE_MODEL,
        contents: `Suggest 4 quick (2-min) micro-activities based on current missions: ${JSON.stringify(activities)}. 
        The "text" field MUST contain the activity name. DO NOT truncate.
        Put a single emoji in the "icon" field. Use Title Case.`,
        config: {
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                icon: { type: Type.STRING }
              },
              required: ["text", "icon"]
            }
          }
        }
      });
      
      const rawData = JSON.parse(response.text || '[]');
      return rawData.map((item: any) => ({
        ...item,
        id: crypto.randomUUID()
      }));
    });
  },

  async getDailyInsights(activities: Activity[]): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    return retryWrapper(async () => {
      const response = await ai.models.generateContent({
        model: LITE_MODEL,
        contents: `Provide a strategic focus insight (15 words max) for missions: ${JSON.stringify(activities)}. Use Markdown. Title Case.`,
        config: {
          thinkingConfig: { thinkingBudget: 0 },
          systemInstruction: "You are an elite high-performance coach. Markdown enabled. Title Case strictly."
        }
      });
      return response.text?.trim() || "Focus On The High-Impact Missions Today.";
    });
  },

  async askGrowthLab(query: string, activities: Activity[]): Promise<{ text: string, sources?: { title: string, uri: string }[] }> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    return retryWrapper(async () => {
      const response = await ai.models.generateContent({
        model: MAIN_MODEL,
        contents: `Query: "${query}". Context: ${JSON.stringify(activities)}.`,
        config: {
          thinkingConfig: { thinkingBudget: 0 },
          tools: [{ googleSearch: {} }],
          systemInstruction: "You are the inSync Growth Lab. Ground your answers in science. Cite sources."
        }
      });

      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const sources = groundingChunks?.map((chunk: any) => ({
        web: {
          title: chunk.web?.title || 'Source',
          uri: chunk.web?.uri || '#'
        }
      })).filter((s: any) => s.web.uri !== '#').map((s: any) => s.web);

      return {
        text: response.text || "Analyzing cognitive request...",
        sources
      };
    });
  }
};