import React, { useState } from 'react';
import { SchoolData, Class } from '../types';
import { useDialog } from '../DialogContext';
import { Plus, Edit2, Trash2, X, Clock, User, Book, GraduationCap, Printer, AlertTriangle, RefreshCw } from 'lucide-react';
import { pdfService } from '../services/pdfService';

interface ClassesProps {
  data: SchoolData;
  updateData: (newData: Partial<SchoolData>) => void;
}

const Classes: React.FC<ClassesProps> = ({ data, updateData }) => {
  const { showAlert, showConfirm } = useDialog();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<Omit<Class, 'id'>>({
    name: '',
    courseId: '',
    teacher: '',
    schedule: '',
    maxStudents: 15
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.courseId || !formData.teacher || !formData.schedule) {
      showAlert('Atenção', '⚠️ Por favor, preencha todos os campos obrigatórios.', 'warning');
      return;
    }

    if (editingClass) {
      const updated = data.classes.map(c => c.id === editingClass.id ? { ...formData, id: c.id } : c);
      updateData({ classes: updated });
    } else {
      const newClass: Class = { ...formData, id: crypto.randomUUID() };
      updateData({ classes: [...data.classes, newClass] });
    }
    closeModal();
  };

  const closeModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsModalOpen(false);
      setIsClosing(false);
      setEditingClass(null);
      setFormData({ name: '', courseId: '', teacher: '', schedule: '', maxStudents: 15 });
    }, 400);
  };

  const handleEdit = (cls: Class) => {
    setEditingClass(cls);
    setFormData({ ...cls });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    showConfirm(
      'Excluir Turma', 
      '⚠️ Tem certeza que deseja excluir esta turma? Isso não removerá os alunos, mas eles ficarão sem turma.',
      () => {
        updateData({ classes: data.classes.filter(c => c.id !== id) });
      }
    );
  };

  const handleDownloadClassList = async (cls: Class) => {
    setIsGeneratingPDF(cls.id);
    try {
      await pdfService.generateClassListPDF(cls, data);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsGeneratingPDF(null);
    }
  };

  const inputClass = "w-full px-4 py-3 bg-white text-black border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm";

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Turmas</h2>
          <p className="text-slate-500">Controle de horários e ocupação das salas.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-indigo-600 text-white px-6 py-3 rounded-xl flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg font-bold"
        >
          <Plus size={20} /> Nova Turma
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data.classes.map(cls => {
          const studentCount = data.students.filter(s => s.classId === cls.id).length;
          const occupancyPercent = Math.min(100, (studentCount / cls.maxStudents) * 100);
          const course = data.courses.find(c => c.id === cls.courseId);
          
          return (
            <div key={cls.id} className="bg-white p-7 rounded-xl border border-slate-200 shadow-sm hover:shadow-xl transition-all group border-b-4 border-b-indigo-500/20 hover:border-b-indigo-500 flex flex-col h-full">
              <div className="flex justify-between items-start mb-5">
                <div>
                  <h3 className="text-xl font-black text-slate-900 leading-tight">{cls.name}</h3>
                  <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em]">{course?.name || 'Sem Curso Vinculado'}</span>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => handleDownloadClassList(cls)} 
                    disabled={isGeneratingPDF === cls.id}
                    className="p-2 text-slate-400 hover:text-indigo-600 rounded-lg transition-all disabled:opacity-50" 
                    title="Imprimir Diário"
                  >
                    {isGeneratingPDF === cls.id ? (
                      <RefreshCw size={16} className="animate-spin" />
                    ) : (
                      <Printer size={16} />
                    )}
                  </button>
                  <button onClick={() => handleEdit(cls)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-all">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(cls.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-slate-50 rounded-lg transition-all">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              
              <div className="space-y-3 mb-8 flex-1">
                <div className="flex items-center gap-3 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">
                  <User size={18} className="text-indigo-500" /> 
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400">Professor</p>
                    <p className="font-semibold text-slate-800">{cls.teacher}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">
                  <Clock size={18} className="text-indigo-500" /> 
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400">Horário</p>
                    <p className="font-semibold text-slate-800">{cls.schedule}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-end text-xs font-bold text-slate-500 px-1">
                  <span>OCUPAÇÃO</span>
                  <span>{studentCount} / {cls.maxStudents}</span>
                </div>
                <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ${
                      occupancyPercent > 90 ? 'bg-red-500' : occupancyPercent > 50 ? 'bg-indigo-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${occupancyPercent}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
        {data.classes.length === 0 && (
          <div className="col-span-full py-20 text-center text-slate-400 border-4 border-dashed border-slate-200 rounded-xl">
            <Book size={48} className="mx-auto mb-4 opacity-10" />
            <p className="font-bold text-lg">Nenhuma turma cadastrada ainda.</p>
            <p className="text-sm">Vincule um curso a uma nova turma para começar.</p>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className={`fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto transition-opacity duration-400 ${isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'}`}>
          <div className={`bg-white rounded-xl w-full max-w-md shadow-2xl my-auto transition-all duration-400 relative overflow-hidden ${isClosing ? 'animate-slide-down-fade-out' : 'animate-slide-up'}`}>
            {/* Blue Top Bar */}
            <div className="bg-indigo-600 h-1.5 w-full absolute top-0 left-0 z-10"></div>
            
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-indigo-50/30">
              <div>
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">
                  {editingClass ? 'Editar Turma' : 'Criar Turma'}
                </h3>
                <p className="text-sm text-slate-500">Selecione o curso e horários.</p>
              </div>
              <button onClick={closeModal} className="p-3 bg-white text-slate-400 hover:text-red-500 rounded-xl shadow-sm transition-all hover:rotate-90">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Nome da Turma</label>
                <input required className={inputClass} placeholder="Ex: TURMA A - NOITE"
                  value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Curso Vinculado</label>
                <select required className={inputClass}
                  value={formData.courseId} onChange={e => setFormData({...formData, courseId: e.target.value})}>
                  <option value="">Selecione um curso...</option>
                  {data.courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Professor Responsável</label>
                <input required className={inputClass} 
                  value={formData.teacher} onChange={e => setFormData({...formData, teacher: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Horário</label>
                  <input placeholder="Ex: Seg/Qua 14h" required className={inputClass}
                    value={formData.schedule} onChange={e => setFormData({...formData, schedule: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Vagas</label>
                  <input type="number" required className={inputClass}
                    value={formData.maxStudents} onChange={e => setFormData({...formData, maxStudents: parseInt(e.target.value) || 0})} />
                </div>
              </div>
              <div className="pt-6 flex gap-4">
                <button type="button" onClick={closeModal} className="flex-1 px-6 py-4 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors font-bold">
                  Cancelar
                </button>
                <button type="submit" className="flex-1 px-6 py-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-lg font-bold">
                  {editingClass ? 'Salvar Alterações' : 'Criar Turma'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Classes;