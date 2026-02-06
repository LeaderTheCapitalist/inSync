import { GoogleGenAI, Type } from "@google/genai";
import { Activity, ScheduleItem, MicroActivity, Priority, Timeframe } from "../types";

/* ===============================
   🔑 ADD YOUR API KEY HERE
   =============================== */
const API_KEY = "sk-61j5CqwUm7jX7gW1kec8DCfHqgnHeRQAQYrHEBReVpyEcfp1";

/* Single shared AI instance */
const ai = new GoogleGenAI({ apiKey: API_KEY });

const retryWrapper = async <T,>(fn: () => Promise<T>, retries = 2): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    if (error?.message?.includes("429")) {
      throw new Error("QUOTA_EXCEEDED");
    }
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 2000));
      return retryWrapper(fn, retries - 1);
    }
    throw error;
  }
};

const LITE_MODEL = "gemini-flash-lite-latest";
const MAIN_MODEL = "gemini-3-flash-preview";

export const geminiService = {
  async generateSchedule(
    activities: Activity[],
    timeframes: Timeframe[]
  ): Promise<ScheduleItem[]> {
    const activeTimeframes = timeframes.filter(tf => tf.isActive);

    return retryWrapper(async () => {
      const response = await ai.models.generateContent({
        model: MAIN_MODEL,
        contents: `Generate a COMPREHENSIVE 24-HOUR daily schedule.
        
Mission Deck: ${JSON.stringify(activities)}

Busy Hours (BLOCKED TIME - DO NOT SCHEDULE MISSIONS HERE):
${JSON.stringify(activeTimeframes)}

Logic:
1. SLEEP: 11 PM - 7 AM is 'Rest'.
2. MISSIONS: Distribute based on difficulty.
3. BLOCKED SLOTS: If a busy hour entry is present, mark that time as type 'busy' and title it using that entry's title.
4. VARIETY: Interleave 'Task' with 'Break' and 'Habit'.
5. ICONS: Choose any contextually appropriate icon from the Solar Icon set.
   FORMAT: 'solar:[icon-name]-outline'.
   RESTRICTION: ONLY use the '-outline' variant.
6. NOTES: One encouraging cognitive note per item. Use MARKDOWN (**bold**, *italics*) for emphasis.
7. CASING: All titles and types must be Title Case.

Return a chronological JSON array. Time format: 'HH:MM AM/PM'.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                time: { type: Type.STRING },
                title: { type: Type.STRING },
                type: { type: Type.STRING },
                aiNote: { type: Type.STRING },
                priority: {
                  type: Type.STRING,
                  enum: ["Urgent", "Important", "Normal"]
                },
                icon: { type: Type.STRING }
              },
              required: [
                "time",
                "title",
                "type",
                "aiNote",
                "priority",
                "icon"
              ]
            }
          }
        }
      });

      return JSON.parse(response.text || "[]");
    });
  },

  async generateMicroActivities(
    activities: Activity[]
  ): Promise<MicroActivity[]> {
    return retryWrapper(async () => {
      const response = await ai.models.generateContent({
        model: LITE_MODEL,
        contents: `Suggest 4 quick (2-min) micro-activities based on current missions: ${JSON.stringify(
          activities
        )}.
Icons MUST be standard emojis. Ensure activity text is Title Case.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                text: { type: Type.STRING },
                icon: { type: Type.STRING }
              },
              required: ["id", "text", "icon"]
            }
          }
        }
      });

      return JSON.parse(response.text || "[]");
    });
  },

  async getDailyInsights(activities: Activity[]): Promise<string> {
    return retryWrapper(async () => {
      const response = await ai.models.generateContent({
        model: LITE_MODEL,
        contents: `Provide a strategic focus insight (15 words max) for these missions: ${JSON.stringify(
          activities
        )}. Use Markdown for **emphasis**. Ensure All Text Is Title Case.`,
        config: {
          systemInstruction:
            "You are an elite high-performance coach. Be punchy, wise, and use markdown. Use Title Case for all sentences."
        }
      });

      return (
        response.text?.trim() ||
        "Focus On The High-Impact Missions Today."
      );
    });
  },

  async askGrowthLab(
    query: string,
    activities: Activity[]
  ): Promise<{ text: string; sources?: { title: string; uri: string }[] }> {
    return retryWrapper(async () => {
      const response = await ai.models.generateContent({
        model: MAIN_MODEL,
        contents: `Query: "${query}". Context: ${JSON.stringify(
          activities
        )}. Explain using cognitive science.`,
        config: {
          systemInstruction:
            "You are the inSync Growth Lab. Provide scientific advice using clean Markdown formatting."
        }
      });

      return {
        text: response.text || "Analyzing Your Cognitive Request..."
      };
    });
  }
};
