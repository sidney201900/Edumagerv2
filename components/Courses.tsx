import React, { useState } from 'react';
import { SchoolData, Course } from '../types';
import { useDialog } from '../DialogContext';
import { Plus, Edit2, Trash2, X, Clock, DollarSign, BookText, Info, AlertTriangle } from 'lucide-react';

interface CoursesProps {
  data: SchoolData;
  updateData: (newData: Partial<SchoolData>) => void;
}

const Courses: React.FC<CoursesProps> = ({ data, updateData }) => {
  const { showAlert, showConfirm } = useDialog();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  
  const [formData, setFormData] = useState<Omit<Course, 'id'>>({
    name: '',
    duration: '',
    durationMonths: 12, // Default value
    registrationFee: 0,
    monthlyFee: 0,
    description: '',
    finePercentage: 0,
    interestPercentage: 0
  });

  const extractMonths = (text: string): number => {
    const match = text.match(/\d+/);
    return match ? parseInt(match[0]) : 12;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.duration || formData.monthlyFee <= 0) {
      showAlert('Atenção', '⚠️ Por favor, preencha o nome, duração e valor da mensalidade.', 'warning');
      return;
    }
    
    // Auto-calculate months from text if possible, otherwise keep default or existing
    const calculatedMonths = extractMonths(formData.duration);
    const finalData = { 
      ...formData, 
      durationMonths: calculatedMonths 
    };

    if (editingCourse) {
      const updated = data.courses.map(c => c.id === editingCourse.id ? { ...finalData, id: c.id } : c);
      updateData({ courses: updated });
    } else {
      const newCourse: Course = { ...finalData, id: crypto.randomUUID() };
      updateData({ courses: [...data.courses, newCourse] });
    }
    closeModal();
  };

  const closeModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsModalOpen(false);
      setIsClosing(false);
      setEditingCourse(null);
      setFormData({ name: '', duration: '', durationMonths: 12, registrationFee: 0, monthlyFee: 0, description: '', finePercentage: 0, interestPercentage: 0 });
    }, 400);
  };

  const handleEdit = (course: Course) => {
    setEditingCourse(course);
    setFormData({
      name: course.name || '',
      duration: course.duration || '',
      durationMonths: course.durationMonths || 12,
      registrationFee: course.registrationFee || 0,
      monthlyFee: course.monthlyFee || 0,
      description: course.description || '',
      finePercentage: course.finePercentage || 0,
      interestPercentage: course.interestPercentage || 0
    });
    setIsModalOpen(true);
  };

  const checkAndDelete = (id: string) => {
    const hasClasses = data.classes.some(c => c.courseId === id);
    if (hasClasses) {
      showAlert('Atenção', 'Não é possível excluir um curso que possui turmas vinculadas.', 'warning');
      return;
    }
    
    showConfirm(
      'Excluir Curso', 
      'Tem certeza que deseja excluir este curso?',
      () => {
        updateData({ courses: data.courses.filter(c => c.id !== id) });
      }
    );
  };

  const inputClass = "w-full px-4 py-3 bg-white text-black border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm";

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Cursos</h2>
          <p className="text-slate-500">Gerencie os cursos oferecidos pela escola.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="bg-indigo-600 text-white px-6 py-3 rounded-xl flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg font-bold"><Plus size={20} /> Novo Curso</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data.courses.map(course => (
          <div key={course.id} className="bg-white p-7 rounded-xl border border-slate-200 shadow-sm hover:shadow-xl transition-all group flex flex-col h-full relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white/80 backdrop-blur-sm rounded-bl-2xl">
                <button onClick={() => handleEdit(course)} className="p-2 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-all"><Edit2 size={16} /></button>
                <button onClick={() => checkAndDelete(course.id)} className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-all"><Trash2 size={16} /></button>
             </div>
             
             <div className="mb-6">
               <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 mb-4">
                 <BookText size={24} />
               </div>
               <h3 className="text-xl font-black text-slate-900 leading-tight mb-2">{course.name}</h3>
               <p className="text-sm text-slate-500 line-clamp-2">{course.description || 'Sem descrição definida.'}</p>
             </div>

             <div className="space-y-3 mt-auto">
               <div className="flex items-center gap-3 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">
                  <Clock size={18} className="text-indigo-500" />
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400">Duração</p>
                    <p className="font-semibold text-slate-800">{course.duration}</p>
                  </div>
               </div>
               <div className="flex items-center gap-3 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">
                  <DollarSign size={18} className="text-emerald-500" />
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400">Investimento Mensal</p>
                    <p className="font-semibold text-slate-800">R$ {course.monthlyFee.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
               </div>
             </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className={`fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto transition-opacity duration-400 ${isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'}`}>
          <div className={`bg-white rounded-xl w-full max-w-2xl shadow-2xl my-auto transition-all duration-400 relative overflow-hidden ${isClosing ? 'animate-slide-down-fade-out' : 'animate-slide-up'}`}>
            {/* Blue Top Bar */}
            <div className="bg-indigo-600 h-1.5 w-full absolute top-0 left-0 z-10"></div>
            
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-indigo-50/30">
              <div><h3 className="text-2xl font-black text-slate-800 tracking-tight">{editingCourse ? 'Editar Curso' : 'Novo Curso'}</h3><p className="text-sm text-slate-500">Defina os detalhes e valores do curso.</p></div>
              <button onClick={closeModal} className="p-3 bg-white text-slate-400 hover:text-red-500 rounded-xl shadow-sm transition-all hover:rotate-90"><X size={24} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="space-y-4">
                 <div>
                   <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Nome do Curso</label>
                   <input required className={inputClass} placeholder="Ex: Informática Básica" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                 </div>
                 <div>
                   <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Descrição</label>
                   <textarea rows={3} className={inputClass} placeholder="Breve resumo do conteúdo..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
                 </div>
                 <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Duração</label>
                      <input required className={inputClass} placeholder="Ex: 12 meses" value={formData.duration} onChange={e => setFormData({...formData, duration: e.target.value})} />
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Taxa de Matrícula (R$)</label>
                      <input type="number" required min="0" step="0.01" className={inputClass} value={formData.registrationFee} onChange={e => setFormData({...formData, registrationFee: parseFloat(e.target.value)})} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Mensalidade (R$)</label>
                      <input type="number" required min="0" step="0.01" className={inputClass} value={formData.monthlyFee} onChange={e => setFormData({...formData, monthlyFee: parseFloat(e.target.value)})} />
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Multa por Atraso (%)</label>
                      <input type="number" min="0" step="0.01" className={inputClass} value={formData.finePercentage} onChange={e => setFormData({...formData, finePercentage: parseFloat(e.target.value) || 0})} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Juros ao Mês (%)</label>
                      <input type="number" min="0" step="0.01" className={inputClass} value={formData.interestPercentage} onChange={e => setFormData({...formData, interestPercentage: parseFloat(e.target.value) || 0})} />
                    </div>
                 </div>
              </div>
              <div className="pt-4 flex gap-4">
                <button type="button" onClick={closeModal} className="flex-1 px-6 py-4 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors font-bold">Cancelar</button>
                <button type="submit" className="flex-1 px-6 py-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-lg font-bold">Salvar Curso</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM MODAL */}
    </div>
  );
};

export default Courses;