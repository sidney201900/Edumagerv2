import React, { useState } from 'react';
import { SchoolData } from '../types';
import { geminiService } from '../services/geminiService';
import { Send, Sparkles, User, Bot, Loader2 } from 'lucide-react';

interface AIHelperProps {
  data: SchoolData;
}

const AIHelper: React.FC<AIHelperProps> = ({ data }) => {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'bot'; content: string }[]>([
    { role: 'bot', content: 'Olá! Sou seu assistente de IA. Posso ajudar a gerar contratos, analisar a saúde financeira da escola ou criar relatórios. O que você precisa hoje?' }
  ]);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;

    const userMsg = prompt;
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setPrompt('');
    setIsLoading(true);

    const response = await geminiService.getAIAnalysis(userMsg, data);
    
    setMessages(prev => [...prev, { role: 'bot', content: response }]);
    setIsLoading(false);
  };

  const quickActions = [
    "Resumo da situação financeira",
    "Template de contrato de matrícula",
    "Sugestão de cursos em alta",
    "Alunos com mensalidades atrasadas"
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] space-y-6 animate-in fade-in duration-300">
      <header>
        <h2 className="text-3xl font-extrabold text-slate-800 flex items-center gap-3 tracking-tight">
          <Sparkles className="text-indigo-600" /> Assistente IA
        </h2>
        <p className="text-slate-500 font-medium">Insights inteligentes para otimizar sua gestão.</p>
      </header>

      <div className="flex-1 bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-slate-50/20">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''} animate-in slide-in-from-bottom-2 duration-300`}>
              <div className={`p-5 rounded-[2rem] max-w-[85%] shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-indigo-600 text-white rounded-tr-none' 
                  : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'
              }`}>
                <div className={`flex items-center gap-2 mb-2 text-[10px] font-black uppercase tracking-[0.2em] ${msg.role === 'user' ? 'text-indigo-200' : 'text-slate-400'}`}>
                  {msg.role === 'user' ? <><User size={12}/> Você</> : <><Bot size={12}/> EduManager AI</>}
                </div>
                <div className="text-sm whitespace-pre-wrap leading-relaxed font-medium">
                  {msg.content}
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-4 animate-pulse">
              <div className="bg-white border border-slate-100 p-5 rounded-[2rem] rounded-tl-none text-slate-400 shadow-sm flex items-center gap-3">
                <Loader2 className="animate-spin text-indigo-500" size={20} />
                <span className="text-xs font-bold uppercase tracking-wider">Analisando dados...</span>
              </div>
            </div>
          )}
        </div>

        <div className="p-8 bg-white border-t border-slate-100">
          <div className="flex flex-wrap gap-2 mb-5">
            {quickActions.map((action, i) => (
              <button 
                key={i}
                onClick={() => setPrompt(action)}
                className="text-[11px] font-bold bg-slate-50 border border-slate-200 px-4 py-2 rounded-2xl text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition-all hover:shadow-md hover:-translate-y-0.5"
              >
                {action}
              </button>
            ))}
          </div>
          <form onSubmit={handleAsk} className="relative group">
            <input 
              type="text"
              placeholder="Digite sua dúvida ou solicitação aqui..."
              className="w-full pl-6 pr-16 py-5 bg-white text-black border-2 border-slate-200 rounded-[2rem] focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 shadow-lg transition-all text-sm font-medium"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
            />
            <button 
              disabled={isLoading}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-4 bg-indigo-600 text-white rounded-[1.5rem] hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg active:scale-95 group-hover:scale-105"
            >
              <Send size={20} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AIHelper;