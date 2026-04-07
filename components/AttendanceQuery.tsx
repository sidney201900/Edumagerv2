import React, { useState } from 'react';
import { SchoolData, Attendance, Class, Student } from '../types';
import { dbService } from '../services/dbService';
import { useDialog } from '../DialogContext';
import { Search, Calendar, User, Clock, CheckCircle, XCircle, FileDown, BookOpen, Plus, X, AlertCircle, RefreshCw } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { addHeader } from '../services/pdfService';
import SearchableSelect from './SearchableSelect';

interface AttendanceQueryProps {
  data: SchoolData;
  updateData: (newData: Partial<SchoolData>) => void;
}

const AttendanceQuery: React.FC<AttendanceQueryProps> = ({ data, updateData }) => {
  const { showAlert } = useDialog();
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  
  // Absence Form State
  const [absenceStudentId, setAbsenceStudentId] = useState('');
  const [absenceJustification, setAbsenceJustification] = useState('');

  const closeModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowAttendanceModal(false);
      setShowAbsenceModal(false);
      setIsClosing(false);
      setAbsenceStudentId('');
      setAbsenceJustification('');
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
          record.type === 'absence' ? 'Falta Justificada' : 'Presente',
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
          const attendanceCount = (data.attendance || []).filter(a => a.classId === classObj.id && a.date.startsWith(selectedDate)).length;
          const course = data.courses.find(c => c.id === classObj.courseId);
          
          return (
            <div 
              key={classObj.id}
              onClick={() => {
                setSelectedClass(classObj);
                setShowAttendanceModal(true);
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
                    {attendanceCount} Registros
                  </div>
                  <div className="text-indigo-600 font-bold text-xs flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    Ver Lista <Plus size={14} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Attendance List Modal */}
      {showAttendanceModal && selectedClass && (
        <div className={`fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity duration-400 ${isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'}`}>
          <div className={`bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl transition-all duration-400 relative flex flex-col ${isClosing ? 'animate-slide-down-fade-out' : 'animate-slide-up'}`}>
            {/* Blue Top Bar */}
            <div className="bg-indigo-600 h-1.5 w-full absolute top-0 left-0 z-10"></div>
            
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-xl font-black text-slate-800">Frequência: {selectedClass.name}</h3>
                <p className="text-sm text-slate-500 font-medium">Data: {new Date(selectedDate).toLocaleDateString()}</p>
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

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {(data.attendance || [])
                .filter(a => a.classId === selectedClass.id && a.date.startsWith(selectedDate))
                .map(record => {
                  const student = data.students.find(s => s.id === record.studentId);
                  const time = new Date(record.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  
                  let justMotivo = record.justification;
                  let justAttachment = null;
                  if (record.justification && record.justification.startsWith('{')) {
                    try {
                      const parsed = JSON.parse(record.justification);
                      justMotivo = parsed.motivo || record.justification;
                      justAttachment = parsed.arquivo_base64 || null;
                    } catch(e) {}
                  }

                  return (
                    <div key={record.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-slate-200 overflow-hidden border border-slate-200 flex-shrink-0">
                          {record.photo ? (
                            <img src={record.photo} alt="Proof" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                              <User size={20} />
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800">{student?.name || 'Aluno Desconhecido'}</p>
                          <p className="text-xs text-slate-500 font-medium">{selectedClass.name}</p>
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 mb-1">
                          <Clock size={12} /> {time}
                        </div>
                        {record.type === 'absence' ? (
                          <div className="flex flex-col items-end gap-2">
                            <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${record.justification ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                              <AlertCircle size={10} /> {record.justification ? 'Falta Justificada' : 'Falta Registrada'}
                            </span>
                            {record.justification && (
                              <div className="text-xs text-slate-600 bg-amber-50 border border-amber-200 p-2 rounded-lg max-w-[200px] text-left shadow-sm">
                                <p className="font-bold text-amber-800 mb-1 flex items-center gap-1">
                                  <AlertCircle size={12} /> Justificativa do Aluno:
                                </p>
                                <p className="mb-2 text-[11px] leading-relaxed break-words line-clamp-4" title={justMotivo}>{justMotivo}</p>
                                {justAttachment && (
                                  <a href={justAttachment} download={`atestado_${student?.name?.replace(/\s+/g, '_')}.png`} className="flex items-center gap-1.5 w-full justify-center px-2 py-1.5 mb-2 bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50 font-bold rounded text-[10px] transition-colors">
                                    <FileDown size={14} /> Baixar Anexo
                                  </a>
                                )}
                                <button 
                                  onClick={() => {
                                    const updated = (data.attendance || []).map(a => a.id === record.id ? { ...a, type: 'presence' } : a);
                                    updateData({ attendance: updated });
                                    dbService.saveData({ ...data, attendance: updated });
                                    showAlert('Sucesso', 'Falta abonada com sucesso. Type alterado para presença.', 'success');
                                  }}
                                  className="w-full text-center text-[10px] px-2 py-1.5 bg-indigo-600 text-white font-bold rounded hover:bg-indigo-700 transition-colors"
                                >
                                  Aceitar (Abonar Falta)
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-end gap-2">
                            <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                              <CheckCircle size={10} /> Presente {record.justification && '(Abonada)'}
                            </span>
                            {record.justification && (
                              <div className="text-[10px] text-slate-500 max-w-[150px] text-right" title={`Justificativa aceita: ${record.justification}`}>
                                <p className="truncate"><span className="font-bold text-emerald-600">Aceita:</span> {record.justification}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              
              {(data.attendance || []).filter(a => a.classId === selectedClass.id && a.date.startsWith(selectedDate)).length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  <Calendar size={48} className="mx-auto mb-4 opacity-20" />
                  <p>Nenhum registro para esta turma nesta data.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Justified Absence Modal */}
      {showAbsenceModal && (
        <div className={`fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity duration-400 ${isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'}`}>
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
                <CheckCircle size={24} /> Registrar Falta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceQuery;

