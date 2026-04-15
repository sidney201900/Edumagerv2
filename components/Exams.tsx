import React, { useState, useRef } from 'react';
import { SchoolData, Exam, Question } from '../types';
import { FileText, Plus, Search, BookOpen, Upload, Trash2, ArrowLeft, Save, CheckCircle, Image as ImageIcon, X } from 'lucide-react';
import { uploadExamImage } from '../services/supabase';

interface ExamsProps {
  data: SchoolData;
  updateData: (newData: Partial<SchoolData>) => void;
}

const Exams: React.FC<ExamsProps> = ({ data, updateData }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentView, setCurrentView] = useState<'list' | 'builder'>('list');
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const exams = data.exams || [];

  const filteredExams = exams.filter(exam =>
    exam.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    data.classes.find(c => c.id === exam.classId)?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleStartCreate = () => {
    setEditingExam({
      id: Date.now().toString(),
      title: '',
      classId: data.classes[0]?.id || '',
      durationMinutes: 60,
      status: 'draft',
      questions: []
    });
    setCurrentView('builder');
  };

  const handleEditExam = (exam: Exam) => {
    setEditingExam({ ...exam });
    setCurrentView('builder');
  };

  const handleAddQuestion = () => {
    if (!editingExam) return;
    setEditingExam({
      ...editingExam,
      questions: [
        ...editingExam.questions,
        {
          id: Date.now().toString() + Math.random().toString(36).substring(7),
          text: '',
          options: ['', '', '', ''],
          correctOptionIndex: 0
        }
      ]
    });
  };

  const handleRemoveQuestion = (qIndex: number) => {
    if (!editingExam) return;
    const newQuestions = [...editingExam.questions];
    newQuestions.splice(qIndex, 1);
    setEditingExam({ ...editingExam, questions: newQuestions });
  };

  const handleQuestionChange = (qIndex: number, field: keyof Question, value: any) => {
    if (!editingExam) return;
    const newQuestions = [...editingExam.questions];
    newQuestions[qIndex] = { ...newQuestions[qIndex], [field]: value };
    setEditingExam({ ...editingExam, questions: newQuestions });
  };

  const handleOptionChange = (qIndex: number, oIndex: number, value: string) => {
    if (!editingExam) return;
    const newQuestions = [...editingExam.questions];
    const newOptions = [...newQuestions[qIndex].options];
    newOptions[oIndex] = value;
    newQuestions[qIndex].options = newOptions;
    setEditingExam({ ...editingExam, questions: newQuestions });
  };

  const handleAddOption = (qIndex: number) => {
    if (!editingExam) return;
    const newQuestions = [...editingExam.questions];
    newQuestions[qIndex].options.push('');
    setEditingExam({ ...editingExam, questions: newQuestions });
  };

  const handleRemoveOption = (qIndex: number, oIndex: number) => {
    if (!editingExam) return;
    const newQuestions = [...editingExam.questions];
    newQuestions[qIndex].options.splice(oIndex, 1);
    
    // Adjust correctOptionIndex if needed
    if (newQuestions[qIndex].correctOptionIndex >= newQuestions[qIndex].options.length) {
      newQuestions[qIndex].correctOptionIndex = Math.max(0, newQuestions[qIndex].options.length - 1);
    } else if (newQuestions[qIndex].correctOptionIndex === oIndex) {
      newQuestions[qIndex].correctOptionIndex = 0;
    }
    setEditingExam({ ...editingExam, questions: newQuestions });
  };

  const handleImageUpload = async (qIndex: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    try {
      const url = await uploadExamImage(file);
      if (url) {
        handleQuestionChange(qIndex, 'imageUrl', url);
      } else {
        alert('Falha ao fazer upload da imagem. Certifique-se de que o Supabase está configurado corretamente.');
      }
    } catch (error) {
      console.error(error);
      alert('Erro ao enviar imagem.');
    } finally {
      setIsUploading(false);
      if (event.target) {
        event.target.value = ''; // Reset file input
      }
    }
  };

  const handleSave = (status: 'draft' | 'published') => {
    if (!editingExam) return;
    
    if (!editingExam.title || !editingExam.classId) {
      alert('Preencha o título e a turma antes de salvar.');
      return;
    }

    const finalExam = { ...editingExam, status };
    const currentExams = data.exams || [];
    const existingIndex = currentExams.findIndex(e => e.id === finalExam.id);
    
    let newExams;
    if (existingIndex >= 0) {
      newExams = [...currentExams];
      newExams[existingIndex] = finalExam;
    } else {
      newExams = [...currentExams, finalExam];
    }
    
    updateData({ exams: newExams });
    setCurrentView('list');
    setEditingExam(null);
  };

  if (currentView === 'builder' && editingExam) {
    return (
      <div className="p-8 max-w-4xl mx-auto animate-in fade-in duration-500 pb-32">
        <div className="flex items-center gap-4 mb-8">
          <button 
            onClick={() => setCurrentView('list')}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h2 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              Criador de Provas
            </h2>
            <p className="text-slate-500 mt-1 font-medium">Configure os detalhes e as questões da avaliação.</p>
          </div>
        </div>

        {/* Informações Básicas */}
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200 mb-8">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <BookOpen className="text-indigo-500" size={20} /> Informações Básicas
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-2">Título da Avaliação</label>
              <input 
                type="text" 
                value={editingExam.title}
                onChange={e => setEditingExam({...editingExam, title: e.target.value})}
                placeholder="Ex: Prova Bimestral de Matemática"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-medium text-slate-800"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Turma Associada</label>
              <select 
                value={editingExam.classId}
                onChange={e => setEditingExam({...editingExam, classId: e.target.value})}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-medium text-slate-800"
              >
                <option value="" disabled>Selecione uma turma</option>
                {data.classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Duração (Minutos)</label>
              <input 
                type="number" 
                value={editingExam.durationMinutes}
                onChange={e => setEditingExam({...editingExam, durationMinutes: parseInt(e.target.value) || 0})}
                min="0"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-medium text-slate-800"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Disciplina (Boletim)</label>
              <select 
                value={editingExam.subjectId || ''}
                onChange={e => setEditingExam({...editingExam, subjectId: e.target.value || undefined})}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-medium text-slate-800"
              >
                <option value="">Nenhuma (não vincular)</option>
                {(data.subjects || []).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1.5">Vincule a uma disciplina do Boletim Escolar para lançar notas automaticamente.</p>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Período (Boletim)</label>
              <select 
                value={editingExam.periodId || ''}
                onChange={e => setEditingExam({...editingExam, periodId: e.target.value || undefined})}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-medium text-slate-800"
              >
                <option value="">Nenhum (não vincular)</option>
                {(data.periods || []).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1.5">Vincule a um período para que a nota apareça no campo correto do boletim.</p>
            </div>
          </div>
        </div>

        {/* Questões */}
        <div className="space-y-6 mb-8">
          {editingExam.questions.map((question, qIndex) => (
            <div key={question.id} className="bg-white rounded-2xl p-8 shadow-md border border-slate-200 relative group animate-slide-up">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500 rounded-l-2xl"></div>
              
              <div className="flex justify-between items-center mb-6">
                <h4 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm">{qIndex + 1}</span>
                  Questão
                </h4>
                <button 
                  onClick={() => handleRemoveQuestion(qIndex)}
                  className="text-slate-400 hover:text-red-500 transition-colors p-2"
                  title="Remover Questão"
                >
                  <Trash2 size={20} />
                </button>
              </div>

              <div className="space-y-6">
                {/* Enunciado */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Enunciado</label>
                  <textarea 
                    value={question.text}
                    onChange={e => handleQuestionChange(qIndex, 'text', e.target.value)}
                    placeholder="Digite o enunciado da questão..."
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-medium text-slate-800 min-h-[100px] resize-y"
                  />
                </div>

                {/* Imagem da Questão */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Imagem de Apoio (Opcional)</label>
                  {question.imageUrl ? (
                    <div className="relative inline-block mt-2 group/img">
                      <img src={question.imageUrl} alt="Apoio" className="max-w-full md:max-w-md h-auto rounded-xl border border-slate-200 shadow-sm" />
                      <button 
                        onClick={() => handleQuestionChange(qIndex, 'imageUrl', undefined)}
                        className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-lg opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600 shadow-lg"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 w-full md:w-auto px-6 py-4 bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => handleImageUpload(qIndex, e)}
                        disabled={isUploading}
                      />
                      {isUploading ? (
                        <span className="text-slate-500 font-bold text-sm">Enviando...</span>
                      ) : (
                        <>
                          <ImageIcon size={20} className="text-slate-400" />
                          <span className="text-slate-500 font-bold text-sm">Adicionar Imagem</span>
                        </>
                      )}
                    </label>
                  )}
                </div>

                {/* Alternativas */}
                <div className="pt-4 border-t border-slate-100">
                  <label className="block text-sm font-bold text-slate-700 mb-4">Alternativas</label>
                  
                  <div className="space-y-3">
                    {question.options.map((option, oIndex) => (
                      <div key={oIndex} className={`flex items-center gap-3 p-2 rounded-xl transition-colors ${question.correctOptionIndex === oIndex ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 border border-transparent'}`}>
                        <div className="flex items-center justify-center w-10">
                          <input 
                            type="radio" 
                            name={`correct-${question.id}`}
                            checked={question.correctOptionIndex === oIndex}
                            onChange={() => handleQuestionChange(qIndex, 'correctOptionIndex', oIndex)}
                            className="w-5 h-5 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            title="Marcar como correta"
                          />
                        </div>
                        <input 
                          type="text" 
                          value={option}
                          onChange={e => handleOptionChange(qIndex, oIndex, e.target.value)}
                          placeholder={`Alternativa ${String.fromCharCode(65 + oIndex)}`}
                          className="flex-1 bg-transparent border-none focus:ring-0 p-2 font-medium text-slate-800 placeholder:text-slate-400"
                        />
                        <button 
                          onClick={() => handleRemoveOption(qIndex, oIndex)}
                          className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                          disabled={question.options.length <= 2}
                          title={question.options.length <= 2 ? "Mínimo de 2 alternativas" : "Remover alternativa"}
                        >
                          <X size={18} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button 
                    onClick={() => handleAddOption(qIndex)}
                    className="mt-4 flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                  >
                    <Plus size={16} /> Adicionar Alternativa
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Botão Adicionar Questão */}
          <button 
            onClick={handleAddQuestion}
            className="w-full flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-indigo-200 rounded-2xl text-indigo-600 hover:bg-indigo-50 hover:border-indigo-400 transition-all font-bold group"
          >
            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
              <Plus size={24} className="text-indigo-600" />
            </div>
            Adicionar Nova Questão
          </button>
        </div>

        {/* Sticky Actions Bar */}
        <div className="fixed bottom-0 left-0 md:left-64 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-slate-200 flex justify-end gap-4 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] z-40">
          <button 
            onClick={() => handleSave('draft')}
            className="flex items-center gap-2 px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors"
          >
            <Save size={20} /> Salvar como Rascunho
          </button>
          <button 
            onClick={() => handleSave('published')}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-black tracking-wide hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all"
          >
            <CheckCircle size={20} /> Publicar Avaliação
          </button>
        </div>
      </div>
    );
  }

  // LIST VIEW
  return (
    <div className="p-8 max-w-7xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <BookOpen className="text-indigo-600" size={32} /> Avaliações
          </h2>
          <p className="text-slate-500 mt-2 font-medium">Gerencie as provas e testes das turmas.</p>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input 
              type="text" 
              placeholder="Buscar avaliação..." 
              className="pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-sm w-full md:w-64 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={handleStartCreate}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
          >
            <Plus size={20} />
            Nova Avaliação
          </button>
        </div>
      </div>

      {filteredExams.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-slate-100 flex flex-col items-center">
          <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
            <FileText size={32} className="text-indigo-300" />
          </div>
          <h3 className="text-xl font-bold text-slate-700 mb-2">Nenhuma avaliação encontrada</h3>
          <p className="text-slate-500 mb-6 max-w-md">Você ainda não criou nenhuma prova ou os filtros não retornaram resultados.</p>
          <button 
            onClick={handleStartCreate}
            className="px-6 py-3 bg-indigo-50 text-indigo-700 rounded-xl font-bold hover:bg-indigo-100 transition-colors"
          >
            Criar Minha Primeira Avaliação
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredExams.map(exam => {
            const classObj = data.classes.find(c => c.id === exam.classId);
            return (
              <div key={exam.id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500 rounded-l-2xl"></div>
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-bold text-lg text-slate-800 line-clamp-2 pr-4">{exam.title}</h3>
                  <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg shrink-0 ${
                    exam.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {exam.status === 'published' ? 'Publicada' : 'Rascunho'}
                  </span>
                </div>
                <div className="space-y-2 mb-6">
                  <p className="text-sm text-slate-500 flex items-center gap-2">
                    <span className="font-bold text-slate-700">Turma:</span> 
                    {classObj?.name || 'Turma não encontrada'}
                  </p>
                  <p className="text-sm text-slate-500 flex items-center gap-2">
                    <span className="font-bold text-slate-700">Questões:</span> 
                    {exam.questions?.length || 0}
                  </p>
                  <p className="text-sm text-slate-500 flex items-center gap-2">
                    <span className="font-bold text-slate-700">Duração:</span> 
                    {exam.durationMinutes} min
                  </p>
                  {exam.subjectId && (
                    <p className="text-sm text-slate-500 flex items-center gap-2">
                      <span className="font-bold text-slate-700">Disciplina:</span> 
                      {(data.subjects || []).find(s => s.id === exam.subjectId)?.name || '—'}
                    </p>
                  )}
                  {exam.periodId && (
                    <p className="text-sm text-slate-500 flex items-center gap-2">
                      <span className="font-bold text-slate-700">Período:</span> 
                      {(data.periods || []).find(p => p.id === exam.periodId)?.name || '—'}
                    </p>
                  )}
                </div>
                <div className="border-t border-slate-100 pt-4 flex justify-end">
                  <button 
                    onClick={() => handleEditExam(exam)}
                    className="text-sm font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 group-hover:translate-x-1 transition-transform"
                  >
                    Editar Avaliação
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Exams;
