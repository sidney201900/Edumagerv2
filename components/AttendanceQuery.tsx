import React, { useState, useEffect } from 'react';
import { SchoolData, Attendance, Class, Student } from '../types';
import { dbService } from '../services/dbService';
import { useDialog } from '../DialogContext';
import { Search, Calendar, User, Clock, CheckCircle, XCircle, FileDown, BookOpen, Plus, X, AlertCircle, RefreshCw, ChevronRight, Trash2, FileSignature, Paperclip } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { addHeader } from '../services/pdfService';
import SearchableSelect from './SearchableSelect';

interface AttendanceQueryProps {
  data: SchoolData;
  updateData: (newData: Partial<SchoolData>) => void;
  deepLinkStudentId?: string | null;
  clearDeepLink?: () => void;
}

const AttendanceQuery: React.FC<AttendanceQueryProps> = ({ data, updateData, deepLinkStudentId, clearDeepLink }) => {
  const { showAlert } = useDialog();

  useEffect(() => {
    if (deepLinkStudentId) {
      const student = data.students.find(s => s.id === deepLinkStudentId);
      if (student) {
        const classObj = data.classes.find(c => c.id === student.classId);
        if (classObj) {
          setSelectedClass(classObj);
          setSelectedStudent(student);
          setShowStudentHistoryModal(true);
          if (clearDeepLink) clearDeepLink();
        }
      }
    }
  }, [deepLinkStudentId, data.students, data.classes, clearDeepLink]);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [showStudentListModal, setShowStudentListModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showStudentHistoryModal, setShowStudentHistoryModal] = useState(false);
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isClosing2, setIsClosing2] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  
  // Absence Form State
  const [absenceStudentId, setAbsenceStudentId] = useState('');
  const [absenceJustification, setAbsenceJustification] = useState('');
  const [viewingAttachment, setViewingAttachment] = useState<string | null>(null);
  const [attendanceForAttachment, setAttendanceForAttachment] = useState<Attendance | null>(null);

  const handleDeleteAttachmentRecord = () => {
    if (!attendanceForAttachment || !attendanceForAttachment.justification) return;
    
    try {
      const parsed = JSON.parse(attendanceForAttachment.justification);
      delete parsed.arquivo_base64;
      const updatedJustification = JSON.stringify(parsed);
      
      const updatedAttendance = (data.attendance || []).map(a => 
        a.id === attendanceForAttachment.id ? { ...a, justification: updatedJustification } : a
      );
      
      updateData({ attendance: updatedAttendance });
      dbService.saveData({ ...data, attendance: updatedAttendance });
      setViewingAttachment(null);
      setAttendanceForAttachment(null);
      showAlert('Sucesso', 'Arquivo removido com sucesso.', 'success');
    } catch(e) {
      console.error('Erro ao excluir anexo do registro', e);
    }
  };

  const closeModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowStudentListModal(false);
      setShowAbsenceModal(false);
      setIsClosing(false);
      setAbsenceStudentId('');
      setAbsenceJustification('');
    }, 400);
  };

  const closeHistoryModal = () => {
    setIsClosing2(true);
    setTimeout(() => {
      setShowStudentHistoryModal(false);
      setSelectedStudent(null);
      setIsClosing2(false);
    }, 400);
  };

  const handleAddAbsence = () => {
    if (!absenceStudentId || !absenceJustification) {
      showAlert('Atenção', "⚠️ Por favor, selecione um aluno e informe a justificativa.", 'warning');
      return;
    }

    const student = data.students.find(s => s.id === absenceStudentId);
    if (!student) return;

    const newAbsence: Attendance = {
      id: crypto.randomUUID(),
      studentId: absenceStudentId,
      classId: student.classId,
      date: new Date().toISOString(),
      verified: true,
      type: 'absence',
      justification: absenceJustification
    };

    const updatedAttendance = [...(data.attendance || []), newAbsence];
    updateData({ attendance: updatedAttendance });
    dbService.saveData({ ...data, attendance: updatedAttendance });

    setAbsenceStudentId('');
    setAbsenceJustification('');
    closeModal();
    showAlert('Sucesso', "Falta justificada registrada com sucesso!", 'success');
  };

  const handleExportPDF = async (classObj: Class) => {
    setIsGeneratingPDF(true);
    try {
      const doc = new jsPDF();
      const startY = await addHeader(doc, data);
      
      doc.setFontSize(18);
      doc.text('Relatório de Frequência', 14, startY + 10);
      
      doc.setFontSize(11);
      doc.text(`Data: ${new Date(selectedDate).toLocaleDateString()}`, 14, startY + 18);
      doc.text(`Turma: ${classObj.name}`, 14, startY + 24);

      const classAttendance = (data.attendance || []).filter(record => 
        record.classId === classObj.id && record.date.startsWith(selectedDate)
      );

      const tableData = classAttendance.map(record => {
        const student = data.students.find(s => s.id === record.studentId);
        const time = new Date(record.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        let justMotivo = record.justification || '-';
        if (justMotivo.startsWith('{')) {
          try {
            const parsed = JSON.parse(justMotivo);
            justMotivo = parsed.motivo || justMotivo;
          } catch(e) {}
        }
        
        return [
          student?.name || 'Desconhecido',
          time,
          record.type === 'absence' ? (record.justificationAccepted ? 'Falta Justificada' : 'Falta') : 'Presente',
          justMotivo
        ];
      });

      (doc as any).autoTable({
        startY: startY + 30,
        head: [['Aluno', 'Horário', 'Status', 'Justificativa']],
        body: tableData,
      });

      doc.save(`frequencia_${classObj.name}_${selectedDate}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Registro de Frequência</h2>
          <p className="text-slate-500 font-medium">Gerencie a frequência por turma e registre faltas justificadas.</p>
        </div>
        <div className="flex items-center gap-3">
          <input 
            type="date" 
            className="p-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
          />
          <button 
            onClick={() => setShowAbsenceModal(true)}
            className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-bold text-sm flex items-center gap-2 shadow-lg shadow-amber-100"
          >
            <Plus size={18} /> Justificar Falta
          </button>
        </div>
      </header>

      {/* Class Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data.classes.map(classObj => {
          const classStudents = data.students.filter(s => s.classId === classObj.id && s.status === 'active');
          const attendanceCount = (data.attendance || []).filter(a => a.classId === classObj.id && a.date.startsWith(selectedDate)).length;
          const course = data.courses.find(c => c.id === classObj.courseId);
          
          return (
            <div 
              key={classObj.id}
              onClick={() => {
                setSelectedClass(classObj);
                setShowStudentListModal(true);
              }}
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-indigo-300 transition-all cursor-pointer group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>
              
              <div className="relative z-10">
                <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 mb-4">
                  <BookOpen size={24} />
                </div>
                <h3 className="text-xl font-black text-slate-800 mb-1">{classObj.name}</h3>
                <p className="text-sm text-slate-500 font-medium mb-4">{course?.name}</p>
                
                <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
                    <User size={14} />
                    {classStudents.length} Alunos • {attendanceCount} Registros
                  </div>
                  <div className="text-indigo-600 font-bold text-xs flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    Ver Alunos <ChevronRight size={14} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* === MODAL 1: Lista de Alunos da Turma === */}
      {showStudentListModal && selectedClass && (
        <div className={`fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity duration-400 ${isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'}`}>
          <div className={`bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl transition-all duration-400 relative flex flex-col ${isClosing ? 'animate-slide-down-fade-out' : 'animate-slide-up'}`}>
            <div className="bg-indigo-600 h-1.5 w-full absolute top-0 left-0 z-10"></div>
            
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-xl font-black text-slate-800">Alunos: {selectedClass.name}</h3>
                <p className="text-sm text-slate-500 font-medium">Clique em um aluno para ver seu histórico individual.</p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleExportPDF(selectedClass)}
                  disabled={isGeneratingPDF}
                  className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
                  title="Exportar PDF"
                >
                  {isGeneratingPDF ? (
                    <RefreshCw size={20} className="animate-spin" />
                  ) : (
                    <FileDown size={20} />
                  )}
                </button>
                <button 
                  onClick={closeModal}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {(() => {
                const classStudents = data.students
                  .filter(s => s.classId === selectedClass.id && s.status === 'active')
                  .sort((a, b) => a.name.localeCompare(b.name));

                if (classStudents.length === 0) {
                  return (
                    <div className="text-center py-12 text-slate-400">
                      <User size={48} className="mx-auto mb-4 opacity-20" />
                      <p className="font-bold">Nenhum aluno ativo nesta turma.</p>
                    </div>
                  );
                }

                return classStudents.map(student => {
                  const studentAttendance = (data.attendance || []).filter(a => a.studentId === student.id && a.classId === selectedClass.id);
                  const presences = studentAttendance.filter(a => a.type === 'presence' || a.type !== 'absence').length;
                  const absences = studentAttendance.filter(a => a.type === 'absence').length;
                  const justified = studentAttendance.filter(a => a.type === 'absence' && a.justificationAccepted).length;

                  return (
                    <div 
                      key={student.id}
                      onClick={() => {
                        setSelectedStudent(student);
                        setShowStudentHistoryModal(true);
                      }}
                      className="flex items-center justify-between p-4 bg-slate-50 hover:bg-indigo-50 rounded-xl border border-slate-100 hover:border-indigo-200 cursor-pointer transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-black text-sm flex-shrink-0 overflow-hidden">
                          {student.photo ? (
                            <img src={student.photo} alt={student.name} className="w-full h-full object-cover" />
                          ) : (
                            student.name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{student.name}</p>
                          <p className="text-[10px] text-slate-500">Matrícula: {student.enrollmentNumber || '—'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1.5 text-[10px] font-bold">
                          <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">{presences}P</span>
                          <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded">{absences}F</span>
                          {justified > 0 && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">{justified}J</span>}
                        </div>
                        <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* === MODAL 2: Histórico Individual do Aluno === */}
      {showStudentHistoryModal && selectedStudent && selectedClass && (
        <div className={`fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4 transition-opacity duration-400 ${isClosing2 ? 'opacity-0' : 'opacity-100 animate-in fade-in'}`}>
          <div className={`bg-white rounded-3xl w-full max-w-3xl max-h-[85vh] overflow-hidden shadow-2xl transition-all duration-400 relative flex flex-col ${isClosing2 ? 'animate-slide-down-fade-out' : 'animate-slide-up'}`}>
            <div className="bg-indigo-600 h-1.5 w-full absolute top-0 left-0 z-10"></div>

            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-black overflow-hidden flex-shrink-0">
                  {selectedStudent.photo ? (
                    <img src={selectedStudent.photo} alt={selectedStudent.name} className="w-full h-full object-cover" />
                  ) : (
                    <User size={24} />
                  )}
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800">{selectedStudent.name}</h3>
                  <p className="text-sm text-slate-500 font-medium">Histórico de Frequência • {selectedClass.name}</p>
                </div>
              </div>
              <button 
                onClick={closeHistoryModal}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {(() => {
                const now = new Date();
                const actualRecords = (data.attendance || [])
                  .filter(a => a.studentId === selectedStudent.id && a.classId === selectedClass.id);
                
                const classLessons = (data.lessons || [])
                  .filter(l => l.classId === selectedClass.id && l.status !== 'cancelled');

                const virtualRecords: any[] = [];
                
                classLessons.forEach(lesson => {
                  // Check if there's any record (presence or absence) for this date
                  const hasRecord = actualRecords.some(a => a.date.startsWith(lesson.date));
                  
                  if (!hasRecord) {
                    const lessonDate = new Date(lesson.date + 'T12:00:00Z');
                    // Calculate difference in days. 1 day = 86400000ms
                    const diffMs = now.getTime() - lessonDate.getTime();
                    const diffDays = diffMs / (1000 * 60 * 60 * 24);

                    if (diffDays >= -1) { // Starting from 1 day before
                      if (diffDays <= 1) {
                        // Window: 1 day before to 1 day after
                        virtualRecords.push({
                          id: `v-${lesson.id}`,
                          studentId: selectedStudent.id,
                          classId: selectedClass.id,
                          date: lesson.date,
                          type: 'awaiting',
                          isVirtual: true
                        });
                      } else {
                        // After 1 day
                        virtualRecords.push({
                          id: `v-${lesson.id}`,
                          studentId: selectedStudent.id,
                          classId: selectedClass.id,
                          date: lesson.date,
                          type: 'absence',
                          isVirtual: true
                        });
                      }
                    }
                  }
                });

                const studentRecords = [...actualRecords, ...virtualRecords]
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                if (studentRecords.length === 0) {
                  return (
                    <div className="text-center py-16 text-slate-400">
                      <Calendar size={48} className="mx-auto mb-4 opacity-20" />
                      <p className="font-bold">Nenhum registro de frequência ou aula agendada.</p>
                    </div>
                  );
                }

                const presences = studentRecords.filter(a => a.type === 'presence' || (!a.type && !a.isVirtual)).length;
                const absences = studentRecords.filter(a => a.type === 'absence').length;
                const justified = studentRecords.filter(a => a.type === 'absence' && a.justificationAccepted).length;
                const awaits = studentRecords.filter(a => a.type === 'awaiting').length;

                return (
                  <>
                    {/* Summary bar */}
                    <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-4 text-sm font-bold">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg">
                        <CheckCircle size={16} /> {presences} Presenças
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg">
                        <XCircle size={14} /> {absences} Faltas
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg">
                        <AlertCircle size={14} /> {justified} Justificadas
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg">
                        <BookOpen size={14} /> {studentRecords.length} Aulas
                      </div>
                      {awaits > 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg animate-pulse">
                          <Clock size={14} /> {awaits} Aguardando Justificativa
                        </div>
                      )}
                    </div>

                    {/* Attendance table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-wider sticky top-0">
                          <tr>
                            <th className="px-6 py-4 text-sm">Data</th>
                            <th className="px-6 py-4 text-sm">Horário</th>
                            <th className="px-6 py-4 text-sm">Status</th>
                            <th className="px-6 py-4 text-sm">Justificativa</th>
                            <th className="px-6 py-4 text-sm text-center">Anexo</th>
                            <th className="px-6 py-4 text-sm text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {studentRecords.map(record => {
                            const recordDate = new Date(record.date);
                            const time = recordDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            
                            let justMotivo = record.justification || '';
                            let justAttachment: string | null = null;
                            if (justMotivo.startsWith('{')) {
                              try {
                                const parsed = JSON.parse(justMotivo);
                                justMotivo = parsed.motivo || justMotivo;
                                justAttachment = parsed.arquivo_base64 || null;
                              } catch(e) {}
                            }

                            const isAbsence = record.type === 'absence';
                            const isAwaiting = record.type === 'awaiting';
                            const isJustified = isAbsence && record.justificationAccepted;
                            const hasPendingJustification = isAbsence && record.justification && !record.justificationAccepted;

                            return (
                              <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-6 py-4 text-base font-bold text-slate-800">
                                  {recordDate.toLocaleDateString('pt-BR')}
                                </td>
                                <td className="px-6 py-4 text-sm text-slate-500 flex items-center gap-1.5 pt-5">
                                  <Clock size={14} /> {record.isVirtual ? "--:--" : time}
                                </td>
                                <td className="px-6 py-4">
                                  {isAwaiting ? (
                                    <span className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-xs font-black uppercase tracking-wider inline-flex items-center gap-1.5 animate-pulse">
                                      <Clock size={12} /> Aguardando Justificativa
                                    </span>
                                  ) : isJustified ? (
                                    <span className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-full text-xs font-black uppercase tracking-wider inline-flex items-center gap-1.5">
                                      <AlertCircle size={12} /> Falta Justificada
                                    </span>
                                  ) : isAbsence ? (
                                    <span className="px-3 py-1.5 bg-red-100 text-red-700 rounded-full text-xs font-black uppercase tracking-wider inline-flex items-center gap-1.5">
                                      <XCircle size={12} /> Falta
                                    </span>
                                  ) : (
                                    <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-black uppercase tracking-wider inline-flex items-center gap-1.5">
                                      <CheckCircle size={12} /> Presente
                                    </span>
                                  )}
                                </td>
                                <td className="px-6 py-4">
                                  {isAwaiting ? (
                                    <span className="text-xs italic text-indigo-400">Aula recente, aguardando portal...</span>
                                  ) : justMotivo ? (
                                    <p className="text-sm text-slate-600 truncate max-w-[200px]" title={justMotivo}>{justMotivo}</p>
                                  ) : (
                                    <span className="text-sm text-slate-300">—</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-center">
                                  {justAttachment ? (
                                    <button 
                                      onClick={() => {
                                        setViewingAttachment(justAttachment!);
                                        setAttendanceForAttachment(record);
                                      }}
                                      className="p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-all animate-pulse shadow-md border border-indigo-200"
                                      title="Ver Anexo"
                                    >
                                      <Paperclip size={18} />
                                    </button>
                                  ) : (
                                    <span className="text-sm text-slate-200"><Paperclip size={18} /></span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-right">
                                  {hasPendingJustification && (
                                    <button 
                                      onClick={() => {
                                        const updated = (data.attendance || []).map(a => a.id === record.id ? { ...a, justificationAccepted: true } : a);
                                        updateData({ attendance: updated });
                                        dbService.saveData({ ...data, attendance: updated });
                                        showAlert('Sucesso', 'Justificativa aceita com sucesso.', 'success');
                                      }}
                                      className="text-[10px] px-2 py-1.5 bg-indigo-600 text-white font-bold rounded hover:bg-indigo-700 transition-colors"
                                    >
                                      Aceitar
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Justified Absence Modal */}
      {showAbsenceModal && (
        <div className={`fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity duration-400 ${isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'}`}>
          <div className={`bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl transition-all duration-400 relative ${isClosing ? 'animate-slide-down-fade-out' : 'animate-slide-up'}`}>
            {/* Blue Top Bar */}
            <div className="bg-indigo-600 h-1.5 w-full absolute top-0 left-0 z-10"></div>
            
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-amber-50/50">
              <h3 className="text-xl font-black text-amber-800 flex items-center gap-2">
                <AlertCircle size={24} /> Justificar Falta
              </h3>
              <button 
                onClick={closeModal}
                className="p-2 text-amber-400 hover:text-amber-600 hover:bg-amber-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <SearchableSelect
                  label="Aluno"
                  placeholder="Selecione ou digite o nome do aluno..."
                  value={absenceStudentId}
                  onChange={(val) => setAbsenceStudentId(val)}
                  options={data.students
                    .filter(s => s.status === 'active')
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(student => ({ id: student.id, name: student.name }))}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Justificativa</label>
                <textarea 
                  className="w-full px-4 py-3 bg-slate-50 text-black border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-sm min-h-[100px]"
                  placeholder="Informe o motivo da falta..."
                  value={absenceJustification}
                  onChange={(e) => setAbsenceJustification(e.target.value)}
                />
              </div>

              <button 
                onClick={handleAddAbsence}
                className="w-full py-4 bg-amber-500 text-white rounded-2xl font-black text-lg hover:bg-amber-600 shadow-lg shadow-amber-100 flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                Salvar Justificativa
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingAttachment && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b flex items-center justify-between bg-slate-50">
              <h3 className="font-black text-slate-800 flex items-center gap-2">
                <FileSignature size={20} className="text-indigo-600" /> Visualização do Documento
              </h3>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleDeleteAttachmentRecord}
                  className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 size={14} /> Excluir Arquivo
                </button>
                <button 
                  onClick={() => { setViewingAttachment(null); setAttendanceForAttachment(null); }}
                  className="p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-slate-200 p-4 flex items-center justify-center">
              {viewingAttachment.startsWith('data:application/pdf') || viewingAttachment.includes('.pdf') ? (
                <iframe src={viewingAttachment} className="w-full h-full min-h-[70vh] rounded-lg shadow-sm bg-white" />
              ) : (
                <img src={viewingAttachment} className="max-w-full max-h-full object-contain rounded-lg shadow-sm" alt="Documento" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceQuery;
