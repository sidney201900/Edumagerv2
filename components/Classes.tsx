import React, { useState } from 'react';
import { SchoolData, Class } from '../types';
import { useDialog } from '../DialogContext';
import { Plus, Edit2, Trash2, X, Clock, User, Book, Printer, RefreshCw, Calendar, Settings } from 'lucide-react';
import { pdfService } from '../services/pdfService';
import LessonSchedule from './LessonSchedule';
import { dbService } from '../services/dbService';

interface ClassesProps {
  data: SchoolData;
  updateData: (newData: Partial<SchoolData>) => void;
  onNavigateToClass: (classId: string, studentId?: string) => void;
}

const Classes: React.FC<ClassesProps> = ({ data, updateData, onNavigateToClass }) => {
  const { showAlert, showConfirm } = useDialog();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState<string | null>(null);
  const [scheduleClass, setScheduleClass] = useState<Class | null>(null); // For LessonSchedule component
  const [viewingStudentsClass, setViewingStudentsClass] = useState<Class | null>(null); // For student list modal
  
  const [formData, setFormData] = useState<Omit<Class, 'id'>>({
    name: '',
    courseId: '',
    teacher: '',
    schedule: '',
    scheduleDay: '',
    maxStudents: 15,
    startDate: '',
    endDate: '',
    defaultStartTime: '',
    defaultEndTime: ''
  });

  const DAY_NAMES = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

  const [quickTimeClass, setQuickTimeClass] = useState<Class | null>(null);
  const [quickStartTime, setQuickStartTime] = useState('');
  const [quickEndTime, setQuickEndTime] = useState('');

  // Auto-calculate end date based on course durationMonths
  React.useEffect(() => {
    if (formData.courseId && formData.startDate) {
      const course = data.courses.find(c => c.id === formData.courseId);
      if (course && course.durationMonths) {
        const start = new Date(formData.startDate + 'T12:00:00Z');
        const end = new Date(start);
        end.setUTCMonth(end.getUTCMonth() + course.durationMonths);
        const endString = end.toISOString().split('T')[0];
        setFormData(prev => ({ ...prev, endDate: endString }));
      }
    }
  }, [formData.courseId, formData.startDate, data.courses]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.courseId || !formData.teacher) {
      showAlert('Atenção', '⚠️ Por favor, preencha todos os campos obrigatórios.', 'warning');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    const todayStr = new Date().toISOString().split('T')[0];

    // Removido bloqueio de data retroativa para permitir planejamento histórico
    const newClassId = editingClass ? editingClass.id : crypto.randomUUID();
    const resolvedScheduleName = formData.scheduleDay ? DAY_NAMES[parseInt(formData.scheduleDay)] : formData.schedule;

    const newClass: Class = { 
      ...formData, 
      id: newClassId,
      schedule: resolvedScheduleName
    };

    let updatedLessons = [...(data.lessons || [])];

    // Gerar cronograma automaticamente
    if (newClass.startDate && newClass.endDate && newClass.scheduleDay && newClass.defaultStartTime && newClass.defaultEndTime) {
      
      let generationStartStr = newClass.startDate;

      if (editingClass) {
        // Ao editar, removemos apenas as aulas que coincidem ou são futuras em relação ao ponto de alteração
        // Mas o sistema agora permite gerar todo o período do curso (mesmo retroativo) se solicitado.
        updatedLessons = updatedLessons.filter(l => !(l.classId === newClass.id && l.date >= generationStartStr));
      }

      const generatedLessons = [];
      let currentDate = new Date(generationStartStr + 'T12:00:00Z');
      const endObject = new Date(newClass.endDate + 'T12:00:00Z');
      const targetDay = parseInt(newClass.scheduleDay);

      // Avançar até o primeiro dia da semana alvo a partir da data de início (nunca para trás)
      while (currentDate.getUTCDay() !== targetDay) {
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      }

      while (currentDate <= endObject) {
         const dateString = currentDate.toISOString().split('T')[0];
         generatedLessons.push({
            id: crypto.randomUUID(),
            classId: newClass.id,
            date: dateString,
            startTime: newClass.defaultStartTime,
            endTime: newClass.defaultEndTime,
            status: 'scheduled',
            type: 'regular'
         });
         currentDate.setUTCDate(currentDate.getUTCDate() + 7);
      }

      updatedLessons = [...updatedLessons, ...generatedLessons];
    }

    let updatedClasses = [];
    if (editingClass) {
      updatedClasses = data.classes.map(c => c.id === editingClass.id ? newClass : c);
    } else {
      updatedClasses = [...data.classes, newClass];
    }

    updateData({ classes: updatedClasses, lessons: updatedLessons });
    dbService.saveData({ ...data, classes: updatedClasses, lessons: updatedLessons });

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


  const handleQuickTimeSave = () => {
    if (!quickTimeClass || !quickStartTime || !quickEndTime) {
      showAlert('Atenção', 'Preencha início e término.', 'warning');
      return;
    }

    if (quickStartTime >= quickEndTime) {
      showAlert('Atenção', 'Fim deve ser maior que início.', 'warning');
      return;
    }

    // Save class default times
    const updatedClass = { ...quickTimeClass, defaultStartTime: quickStartTime, defaultEndTime: quickEndTime };
    const updatedClasses = data.classes.map(c => c.id === quickTimeClass.id ? updatedClass : c);
    
    // Update all future scheduled lessons for this class
    const today = new Date().toISOString().split('T')[0];
    const updatedLessons = (data.lessons || []).map(l => {
      if (l.classId === quickTimeClass.id && l.status === 'scheduled' && l.date >= today) {
        return { ...l, startTime: quickStartTime, endTime: quickEndTime };
      }
      return l;
    });

    updateData({ classes: updatedClasses, lessons: updatedLessons });
    dbService.saveData({ ...data, classes: updatedClasses, lessons: updatedLessons });

    setQuickTimeClass(null);
    showAlert('Sucesso', 'Horário alterado para a turma e todas as aulas futuras atualizadas!', 'success');
  };

  const calculateAge = (birthDate: string) => {
    if (!birthDate) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
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
          
          const now = new Date();
          const clsLessons = (data.lessons || []).filter(l => l.classId === cls.id && l.status !== 'cancelled');
          const isOngoing = clsLessons.some(l => {
             if (!l.startTime || !l.endTime) return false;
             const lDate = new Date(l.date + 'T12:00:00Z');
             if (lDate.getDate() !== now.getDate() || lDate.getMonth() !== now.getMonth() || lDate.getFullYear() !== now.getFullYear()) return false;
             const [sh, sm] = l.startTime.split(':').map(Number);
             const lStart = new Date(now); lStart.setHours(sh, sm, 0, 0);
             const [eh, em] = l.endTime.split(':').map(Number);
             const lEnd = new Date(now); lEnd.setHours(eh, em, 0, 0);
             return now >= lStart && now <= lEnd;
          });
          
          return (
            <div key={cls.id} className={`bg-white p-7 rounded-xl border shadow-sm hover:shadow-xl transition-all group flex flex-col h-full ${isOngoing ? 'border-blue-400 border-b-4 border-b-blue-500 shadow-blue-100' : 'border-slate-200 border-b-4 border-b-indigo-500/20 hover:border-b-indigo-500'}`}>
              <div className="flex justify-between items-start mb-5 relative">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-xl font-black text-slate-900 leading-tight">{cls.name}</h3>
                    {isOngoing && (
                      <span className="px-2 py-0.5 bg-blue-600 text-white text-[9px] font-black uppercase rounded-full animate-pulse shadow-sm flex items-center gap-1">
                        <Clock size={10} /> Em andamento
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em]">{course?.name || 'Sem Curso Vinculado'}</span>
                  {cls.defaultStartTime && cls.defaultEndTime && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-100">
                      <Clock size={12} /> {cls.defaultStartTime} - {cls.defaultEndTime}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDownloadClassList(cls); }} 
                    disabled={isGeneratingPDF === cls.id}
                    className="p-2 text-slate-400 hover:text-indigo-600 rounded-lg transition-all disabled:opacity-50 bg-slate-50 hover:bg-indigo-50" 
                    title="Imprimir Diário"
                  >
                    {isGeneratingPDF === cls.id ? <RefreshCw size={16} className="animate-spin" /> : <Printer size={16} />}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleEdit(cls); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-all" title="Editar Turma">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(cls.id); }} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Excluir Turma">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              
              <div className="space-y-3 mb-5 flex-1">
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
                    <p className="text-[10px] uppercase font-bold text-slate-400">Dias de Aula</p>
                    <p className="font-semibold text-slate-800 flex items-center gap-2">
                       {cls.scheduleDay ? DAY_NAMES[parseInt(cls.scheduleDay)] : cls.schedule}
                       {cls.defaultStartTime && cls.defaultEndTime && (
                         <span className="text-indigo-600 font-black">
                           {cls.defaultStartTime} às {cls.defaultEndTime}
                         </span>
                       )}
                    </p>
                  </div>
                </div>
                {/* Contagem de Aulas */}
                {(() => {
                  const now = new Date();
                  const totalLessons = clsLessons.length;
                  const completedLessons = clsLessons.filter(l => {
                    if (l.status === 'cancelled') return false;
                    const lDate = new Date(l.date + 'T12:00:00Z');
                    if (!l.endTime) return lDate < now;
                    const [eh, em] = l.endTime.split(':').map(Number);
                    const lEnd = new Date(lDate);
                    lEnd.setUTCHours(eh, em, 0, 0);
                    return now > lEnd;
                  }).length;
                  const cancelledLessons = clsLessons.filter(l => l.status === 'cancelled').length;
                  const remainingLessons = totalLessons - completedLessons - cancelledLessons;
                  return totalLessons > 0 ? (
                    <div className="flex items-center gap-2 flex-wrap text-[10px] font-black">
                      <span className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg flex items-center gap-1">
                        <Calendar size={10} /> {totalLessons} Total
                      </span>
                      <span className="px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg">
                        {completedLessons} Concluídas
                      </span>
                      <span className="px-2 py-1 bg-amber-50 text-amber-600 rounded-lg">
                        {remainingLessons} Restantes
                      </span>
                    </div>
                  ) : null;
                })()}
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

              <div className="grid grid-cols-2 gap-3 mt-5">
                <button
                  onClick={() => setViewingStudentsClass(cls)}
                  className="bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                >
                  <User size={18} /> Ver Alunos
                </button>
                <button
                   onClick={() => setScheduleClass(cls)}
                   className="bg-indigo-50 border border-indigo-100 text-indigo-700 hover:bg-indigo-600 hover:text-white py-3 rounded-xl font-black flex items-center justify-center gap-2 transition-all shadow-sm group-hover:shadow-md"
                >
                  <Calendar size={18} /> Cronograma
                </button>
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
        <div className={`fixed inset-0 bg-transparent flex items-center justify-center p-4 z-50 overflow-y-auto transition-opacity duration-400 ${isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'}`}>
          <div className={`bg-white rounded-xl w-full max-w-2xl shadow-2xl my-auto transition-all duration-400 relative overflow-hidden ${isClosing ? 'animate-slide-down-fade-out' : 'animate-slide-up'}`}>
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
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              
              <div className="grid grid-cols-2 gap-6">
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
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Data de Início</label>
                  <input type="date" required className={inputClass}
                    value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Data de Fim (Automática)</label>
                  <input type="date" required className={inputClass}
                    value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Dia da Semana</label>
                  <select required className={inputClass}
                    value={formData.scheduleDay} onChange={e => setFormData({...formData, scheduleDay: e.target.value})}>
                    <option value="">Selecione...</option>
                    {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Início (Hora)</label>
                  <input type="time" required className={inputClass}
                    value={formData.defaultStartTime} onChange={e => setFormData({...formData, defaultStartTime: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Término (Hora)</label>
                  <input type="time" required className={inputClass}
                    value={formData.defaultEndTime} onChange={e => setFormData({...formData, defaultEndTime: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Vagas Locais</label>
                  <input type="number" required className={inputClass}
                    value={formData.maxStudents} onChange={e => setFormData({...formData, maxStudents: parseInt(e.target.value) || 0})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Professor Responsável</label>
                  <select required className={inputClass}
                    value={formData.teacher} onChange={e => setFormData({...formData, teacher: e.target.value})}>
                    <option value="">Selecione um professor...</option>
                    {(data.employees || [])
                      .filter(e => {
                        const catName = (data.employeeCategories || []).find(c => c.id === e.categoryId)?.name?.toLowerCase() || '';
                        return catName.includes('professor') || catName.includes('prof');
                      })
                      .map(emp => (
                        <option key={emp.id} value={emp.name}>{emp.name}</option>
                      ))}
                    {formData.teacher && !(data.employees || []).some(e => e.name === formData.teacher) && (
                      <option value={formData.teacher}>{formData.teacher} (Manual)</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="pt-4 flex gap-4 border-t border-slate-100">
                <button type="button" onClick={closeModal} className="flex-1 px-6 py-4 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors font-bold">
                  Cancelar
                </button>
                <button type="submit" className="flex-1 px-6 py-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-lg font-bold">
                  {editingClass ? 'Atualizar e Sincronizar Calendário' : 'Criar Turma e Gerar Calendário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lesson Schedule Modal */}
      {scheduleClass && (
        <LessonSchedule 
          classObj={scheduleClass} 
          data={data} 
          updateData={updateData} 
          onClose={() => setScheduleClass(null)} 
        />
      )}

      {/* Viewing Students Modal */}
      {viewingStudentsClass && (
        <div className="fixed inset-0 bg-transparent flex items-center justify-center p-4 z-50 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl my-auto relative overflow-hidden animate-slide-up">
            <div className="bg-indigo-600 h-1.5 w-full absolute top-0 left-0 z-10"></div>
            
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-indigo-50/30">
              <div>
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">Alunos da Turma</h3>
                <p className="text-sm text-slate-500 mt-1">{viewingStudentsClass.name} • {data.students.filter(s => s.classId === viewingStudentsClass.id).length} alunos matriculados</p>
              </div>
              <button 
                onClick={() => setViewingStudentsClass(null)} 
                className="p-2 bg-white text-slate-400 hover:text-red-500 rounded-lg shadow-sm transition-all hover:rotate-90"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] uppercase text-slate-400 font-black tracking-widest">
                    <th className="p-4">Aluno</th>
                    <th className="p-4">Idade</th>
                    <th className="p-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.students
                    .filter(s => s.classId === viewingStudentsClass.id)
                    .sort((a,b) => (a.name || '').localeCompare(b.name || ''))
                    .map(student => (
                      <tr key={student.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                              {student.photo ? (
                                <img src={student.photo} alt={student.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-300">
                                  <User size={20} />
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="font-bold text-slate-800 text-sm">{student.name}</p>
                              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{student.enrollmentNumber || 'Sem matrícula'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-sm font-bold text-slate-600">
                          {calculateAge(student.birthDate) !== null ? `${calculateAge(student.birthDate)} anos` : '-'}
                        </td>
                        <td className="p-4 text-right">
                          <button 
                            onClick={() => onNavigateToClass(viewingStudentsClass.id, student.id)}
                            className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                          >
                            Ver Perfil
                          </button>
                        </td>
                      </tr>
                    ))}
                  {data.students.filter(s => s.classId === viewingStudentsClass.id).length === 0 && (
                    <tr>
                      <td colSpan={3} className="p-10 text-center text-slate-400 italic text-sm">Nenhum aluno matriculado nesta turma.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setViewingStudentsClass(null)} 
                className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-colors shadow-sm"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Classes;