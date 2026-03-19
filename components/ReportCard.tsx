import React, { useState } from 'react';
import { SchoolData, Class, Student, Subject, Grade, Period } from '../types';
import { dbService } from '../services/dbService';
import { useDialog } from '../DialogContext';
import { 
  FileText, 
  Plus, 
  Trash2, 
  ChevronRight, 
  Save, 
  GraduationCap, 
  BookOpen, 
  User, 
  X,
  Search,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Calculator
} from 'lucide-react';

interface ReportCardProps {
  data: SchoolData;
  updateData: (newData: Partial<SchoolData>) => void;
}

const ReportCard: React.FC<ReportCardProps> = ({ data, updateData }) => {
  const { showAlert, showConfirm } = useDialog();
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newPeriodName, setNewPeriodName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showConfigManager, setShowConfigManager] = useState(false);
  const [configTab, setConfigTab] = useState<'subjects' | 'periods'>('subjects');
  const [studentGrades, setStudentGrades] = useState<Record<string, Record<string, number>>>({}); // subjectId -> periodId -> value

  const subjects = data.subjects || [];
  const periods = data.periods || [];
  const grades = data.grades || [];

  const handleAddSubject = () => {
    if (!newSubjectName.trim()) {
      showAlert('Atenção', '⚠️ Por favor, informe o nome da disciplina.', 'warning');
      return;
    }
    const newSubject: Subject = {
      id: crypto.randomUUID(),
      name: newSubjectName.trim()
    };
    const updatedSubjects = [...subjects, newSubject];
    updateData({ subjects: updatedSubjects });
    dbService.saveData({ ...data, subjects: updatedSubjects });
    setNewSubjectName('');
  };

  const handleAddPeriod = () => {
    if (!newPeriodName.trim()) {
      showAlert('Atenção', '⚠️ Por favor, informe o nome do período.', 'warning');
      return;
    }
    const newPeriod: Period = {
      id: crypto.randomUUID(),
      name: newPeriodName.trim()
    };
    const updatedPeriods = [...periods, newPeriod];
    updateData({ periods: updatedPeriods });
    dbService.saveData({ ...data, periods: updatedPeriods });
    setNewPeriodName('');
  };

  const handleDeleteSubject = (id: string) => {
    showConfirm(
      'Excluir Disciplina', 
      '⚠️ Tem certeza que deseja excluir esta disciplina? Todas as notas vinculadas serão perdidas.',
      () => {
        const updatedSubjects = subjects.filter(s => s.id !== id);
        const updatedGrades = grades.filter(g => g.subjectId !== id);
        updateData({ subjects: updatedSubjects, grades: updatedGrades });
        dbService.saveData({ ...data, subjects: updatedSubjects, grades: updatedGrades });
      }
    );
  };

  const handleDeletePeriod = (id: string) => {
    showConfirm(
      'Excluir Período', 
      '⚠️ Tem certeza que deseja excluir este período? Todas as notas vinculadas serão perdidas.',
      () => {
        const updatedPeriods = periods.filter(p => p.id !== id);
        const updatedGrades = grades.filter(g => g.period !== id);
        updateData({ periods: updatedPeriods, grades: updatedGrades });
        dbService.saveData({ ...data, periods: updatedPeriods, grades: updatedGrades });
      }
    );
  };

  const handleOpenStudentGrades = (student: Student) => {
    setSelectedStudent(student);
    const initialGrades: Record<string, Record<string, number>> = {};
    
    subjects.forEach(subject => {
      initialGrades[subject.id] = {};
      periods.forEach(period => {
        const existingGrade = grades.find(g => g.studentId === student.id && g.subjectId === subject.id && g.period === period.id);
        initialGrades[subject.id][period.id] = existingGrade ? existingGrade.value : 0;
      });
    });
    
    setStudentGrades(initialGrades);
  };

  const handleSaveGrades = () => {
    if (!selectedStudent) return;

    const newGradesList: Grade[] = [...grades.filter(g => g.studentId !== selectedStudent.id)];

    Object.entries(studentGrades).forEach(([subjectId, periodGrades]) => {
      Object.entries(periodGrades).forEach(([periodId, value]) => {
        if (value > 0) {
          newGradesList.push({
            id: crypto.randomUUID(),
            studentId: selectedStudent.id,
            subjectId,
            period: periodId,
            value
          });
        }
      });
    });

    updateData({ grades: newGradesList });
    dbService.saveData({ ...data, grades: newGradesList });
    setSelectedStudent(null);
    showAlert('Sucesso', '✅ Notas salvas com sucesso!', 'success');
  };

  const calculateGeneralAverage = () => {
    let totalSum = 0;
    let totalCount = 0;

    Object.values(studentGrades).forEach(subjectPeriods => {
      const periodValues = Object.values(subjectPeriods).filter((v): v is number => typeof v === 'number' && v > 0);
      if (periodValues.length > 0) {
        const subjectSum = periodValues.reduce((a, b) => a + b, 0);
        const subjectAvg = subjectSum / periodValues.length;
        totalSum += subjectAvg;
        totalCount++;
      }
    });

    return totalCount > 0 ? (totalSum / totalCount).toFixed(2) : '0.00';
  };

  const getStudentGeneralAverage = (studentId: string) => {
    const studentGradesList = grades.filter(g => g.studentId === studentId);
    if (studentGradesList.length === 0) return '0.00';

    const subjectAverages: number[] = [];
    const subjectsWithGrades = new Set(studentGradesList.map(g => g.subjectId));

    subjectsWithGrades.forEach(subId => {
      const subGrades = studentGradesList.filter(g => g.subjectId === subId);
      const sum = subGrades.reduce((a, b) => a + b.value, 0);
      subjectAverages.push(sum / subGrades.length);
    });

    if (subjectAverages.length === 0) return '0.00';
    const totalSum = subjectAverages.reduce((a, b) => a + b, 0);
    return (totalSum / subjectAverages.length).toFixed(2);
  };

  const filteredClasses = data.classes.filter(c => 
    (c.name || '').toLowerCase().includes((searchTerm || '').toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Boletim Escolar</h2>
          <p className="text-slate-500 font-medium">Gerencie as notas e o desempenho dos alunos.</p>
        </div>
        <button 
          onClick={() => setShowConfigManager(!showConfigManager)}
          className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors font-bold text-sm flex items-center gap-2"
        >
          <Plus size={18} /> {showConfigManager ? 'Ver Boletins' : 'Configurações'}
        </button>
      </header>

      {showConfigManager ? (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xl space-y-6 animate-in slide-in-from-top-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3 text-indigo-600">
              <div className="p-2 bg-indigo-50 rounded-lg">
                <Plus size={20} />
              </div>
              <h3 className="text-lg font-black text-slate-800">Gerenciar Configurações</h3>
            </div>
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button 
                onClick={() => setConfigTab('subjects')}
                className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${configTab === 'subjects' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                DISCIPLINAS
              </button>
              <button 
                onClick={() => setConfigTab('periods')}
                className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${configTab === 'periods' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                PERÍODOS
              </button>
            </div>
          </div>

          {configTab === 'subjects' ? (
            <div className="space-y-6">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Nome da disciplina (ex: Matemática, Inglês...)" 
                  className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                />
                <button 
                  onClick={handleAddSubject}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all flex items-center gap-2"
                >
                  <Plus size={18} /> Adicionar
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {subjects.map(subject => (
                  <div key={subject.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 group">
                    <span className="font-bold text-slate-700">{subject.name}</span>
                    <button 
                      onClick={() => handleDeleteSubject(subject.id)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {subjects.length === 0 && (
                  <div className="col-span-full py-8 text-center text-slate-400 italic text-sm">Nenhuma disciplina cadastrada.</div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Nome do período (ex: 1º Bimestre, Recuperação...)" 
                  className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                  value={newPeriodName}
                  onChange={(e) => setNewPeriodName(e.target.value)}
                />
                <button 
                  onClick={handleAddPeriod}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all flex items-center gap-2"
                >
                  <Plus size={18} /> Adicionar
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {periods.map(period => (
                  <div key={period.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 group">
                    <span className="font-bold text-slate-700">{period.name}</span>
                    <button 
                      onClick={() => handleDeletePeriod(period.id)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {periods.length === 0 && (
                  <div className="col-span-full py-8 text-center text-slate-400 italic text-sm">Nenhum período cadastrado.</div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {!selectedClass ? (
            <>
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input 
                  type="text" 
                  placeholder="Buscar turmas..." 
                  className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm shadow-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredClasses.map(cls => {
                  const course = data.courses.find(c => c.id === cls.courseId);
                  const studentCount = data.students.filter(s => s.classId === cls.id).length;
                  return (
                    <div 
                      key={cls.id} 
                      onClick={() => setSelectedClass(cls)}
                      className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all cursor-pointer group relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <BookOpen size={80} />
                      </div>
                      <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                          <GraduationCap size={24} />
                        </div>
                        <div>
                          <h3 className="font-black text-slate-800 text-lg">{cls.name}</h3>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{course?.name || 'Curso não encontrado'}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500 font-medium">{studentCount} Alunos Matriculados</span>
                        <ChevronRight size={20} className="text-slate-300 group-hover:text-indigo-500 transform group-hover:translate-x-1 transition-all" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="space-y-6 animate-in slide-in-from-left-4">
              <button 
                onClick={() => setSelectedClass(null)}
                className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-bold text-sm transition-colors"
              >
                <X size={18} /> Voltar para Turmas
              </button>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xl">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-2xl font-black text-slate-800">{selectedClass.name}</h3>
                    <p className="text-slate-500 font-medium">Selecione um aluno para preencher as notas.</p>
                  </div>
                  <div className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-bold text-sm">
                    {data.students.filter(s => s.classId === selectedClass.id).length} Alunos
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.students
                    .filter(s => s.classId === selectedClass.id)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(student => (
                    <div 
                      key={student.id} 
                      className="p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-200 transition-all flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400">
                          <User size={20} />
                        </div>
                        <span className="font-bold text-slate-700 truncate max-w-[150px]">{student.name}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="hidden sm:flex flex-col items-end">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Média Geral</span>
                          <span className={`text-sm font-black ${parseFloat(getStudentGeneralAverage(student.id)) >= 6 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {getStudentGeneralAverage(student.id)}
                          </span>
                        </div>
                        <button 
                          onClick={() => handleOpenStudentGrades(student)}
                          className="px-3 py-1.5 bg-white text-indigo-600 border border-indigo-100 rounded-lg hover:bg-indigo-600 hover:text-white transition-all font-bold text-xs flex items-center gap-1.5 shadow-sm"
                        >
                          <FileText size={14} /> Notas
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* GRADES MODAL */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50/30">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-indigo-600">
                  <GraduationCap size={28} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800">{selectedStudent.name}</h3>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Boletim Escolar • {selectedClass?.name}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedStudent(null)}
                className="p-2 bg-white text-slate-400 hover:text-red-500 rounded-xl shadow-sm transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-8 custom-scrollbar">
              {subjects.length === 0 || periods.length === 0 ? (
                <div className="text-center py-12 space-y-4">
                  <AlertCircle size={48} className="mx-auto text-amber-500 opacity-50" />
                  <p className="text-slate-500 font-medium">
                    {subjects.length === 0 ? 'Nenhuma disciplina cadastrada.' : 'Nenhum período cadastrado.'} 
                    Por favor, complete as configurações primeiro.
                  </p>
                  <button 
                    onClick={() => { setSelectedStudent(null); setShowConfigManager(true); }}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm"
                  >
                    Ir para Configurações
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {subjects.map(subject => (
                    <div key={subject.id} className="bg-slate-50 rounded-2xl p-6 border border-slate-100 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-indigo-600">
                          <BookOpen size={18} />
                          <h4 className="font-black text-slate-800 uppercase tracking-wider text-sm">{subject.name}</h4>
                        </div>
                        <div className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-black text-slate-500">
                          MÉDIA: {(() => {
                            const subjectGrades = studentGrades[subject.id] || {};
                            const vals = Object.values(subjectGrades).filter((v): v is number => typeof v === 'number' && v > 0);
                            return vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '0.0';
                          })()}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        {periods.map(period => (
                          <div key={period.id} className="space-y-1.5">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">{period.name}</label>
                            <input 
                              type="number" 
                              min="0" 
                              max="10" 
                              step="0.1"
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-bold text-center"
                              value={studentGrades[subject.id]?.[period.id] || 0}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setStudentGrades(prev => ({
                                  ...prev,
                                  [subject.id]: {
                                    ...prev[subject.id],
                                    [period.id]: val
                                  }
                                }));
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* General Average Summary */}
                  <div className="bg-indigo-600 rounded-2xl p-6 text-white flex items-center justify-between shadow-xl shadow-indigo-100">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-white/20 rounded-xl">
                        <Calculator size={24} />
                      </div>
                      <div>
                        <h4 className="text-lg font-black">Média Geral</h4>
                        <p className="text-xs text-indigo-100 font-medium">Calculada automaticamente com base em todas as disciplinas.</p>
                      </div>
                    </div>
                    <div className="text-4xl font-black">
                      {calculateGeneralAverage()}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button 
                onClick={() => setSelectedStudent(null)}
                className="px-6 py-3 bg-white text-slate-600 border border-slate-200 rounded-xl font-bold text-sm hover:bg-slate-100 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveGrades}
                className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center gap-2"
              >
                <Save size={18} /> Salvar Notas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportCard;
