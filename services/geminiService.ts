
import { GoogleGenAI } from "@google/genai";
import { SchoolData } from "../types";

export const geminiService = {
  getAIAnalysis: async (prompt: string, context: SchoolData) => {
    // Always initialize GoogleGenAI with a named parameter using process.env.API_KEY directly.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Minimal data extraction to avoid token overflow
    const summaryContext = {
      totalStudents: context.students.length,
      activeStudents: context.students.filter(s => s.status === 'active').length,
      // Fix: Resolve course name from courseId since Class doesn't have courseName
      classes: context.classes.map(c => {
        const course = context.courses.find(crs => crs.id === c.courseId);
        return { name: c.name, course: course?.name || 'N/A' };
      }),
      totalPendingPayments: context.payments.filter(p => p.status !== 'paid').length
    };

    const systemInstruction = `
      Você é um assistente especializado em gestão escolar para escolas de informática.
      Use os dados fornecidos para gerar relatórios, sugestões de contratos ou insights financeiros.
      Responda de forma profissional e concisa em Português do Brasil.
    `;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Contexto da Escola: ${JSON.stringify(summaryContext)}\n\nUsuário pergunta: ${prompt}`,
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });

      // Directly access .text property as per GenerateContentResponse definition.
      return response.text || "Desculpe, não consegui processar sua solicitação.";
    } catch (error) {
      console.error("Gemini Error:", error);
      return "Erro ao conectar com a IA. Verifique sua chave de API.";
    }
  }
};
