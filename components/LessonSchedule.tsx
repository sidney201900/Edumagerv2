import React, { useState } from 'react';
import { SchoolData, Class, Lesson, Notification } from '../types';
import { useDialog } from '../DialogContext';
import { Calendar, Plus, X, AlertCircle, RefreshCw, Send, CheckCircle, Search, Clock, Trash2 } from 'lucide-react';
import { dbService } from '../services/dbService';

interface LessonScheduleProps {
  classObj: Class;
  data: SchoolData;
  updateData: (newData: Partial<SchoolData>) => void;
  onClose: () => void;
}

const LessonSchedule: React.FC<LessonScheduleProps> = ({ classObj, data, updateData, onClose }) => {
  const { showAlert, showConfirm } = useDialog();
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showLessonDetail, setShowLessonDetail] = useState<Lesson | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  // Form states for generation
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState('1'); 
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [extraCount, setExtraCount] = useState<number | ''>('');

  React.useEffect(() => {
    if (extraCount && startDate && dayOfWeek) {
      let current = new Date(startDate + 'T12:00:00Z');
      const day = parseInt(dayOfWeek, 10);
      while (current.getUTCDay() !== day) {
         current.setUTCDate(current.getUTCDate() + 1);
      }
      current.setUTCDate(current.getUTCDate() + (7 * (Number(extraCount) - 1)));
      setEndDate(current.toISOString().split('T')[0]);
    }
  }, [extraCount, startDate, dayOfWeek]);

  // Form states for cancellation
  const [cancelReason, setCancelReason] = useState('');
  const [wantReplacement, setWantReplacement] = useState(false);
  const [replacementDate, setReplacementDate] = useState('');
  const [replacementStartTime, setReplacementStartTime] = useState('');
  const [replacementEndTime, setReplacementEndTime] = useState('');

  const checkCollision = (date: string, start: string, end: string, ignoreLessonId?: string) => {
    return (data.lessons || []).find(l => {
      // Ignore if it's the lesson being replaced (if any) or if it's cancelled
      if (l.id === ignoreLessonId || l.status === 'cancelled') return false;
      if (l.date !== date) return false;
      if (!l.startTime || !l.endTime) return false;
      // Regra: NovoInicio < HorarioFimExistente AND NovoFim > HorarioInicioExistente
      return (start < l.endTime) && (end > l.startTime);
    });
  };

  const classLessons = (data.lessons || [])
    .filter(l => l.classId === classObj.id)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const handleGenerateLessons = () => {
    if (!startDate || !endDate || !dayOfWeek || !startTime || !endTime) {
      showAlert('Atenção', 'Preencha todos os campos, incluindo horários de início e término.', 'warning');
      return;
    }

    if (startTime >= endTime) {
      showAlert('Atenção', 'O horário de término deve ser maior que o de início.', 'warning');
      return;
    }

    // Só pode gerar a partir da data de início da turma (nunca para trás)
    const turmaStartDate = classObj.startDate || '';
    if (turmaStartDate && startDate < turmaStartDate) {
      showAlert('Atenção', `A data de início não pode ser anterior à data de início da turma (${new Date(turmaStartDate + 'T12:00:00Z').toLocaleDateString('pt-BR')}).`, 'warning');
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const day = parseInt(dayOfWeek, 10);
    const newLessons: Lesson[] = [];
    const ignoredDates: string[] = [];

    // Increment date until finding the exact day
    let current = new Date(start);
    while (current.getUTCDay() !== day) {
      current.setUTCDate(current.getUTCDate() + 1);
    }

    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      
      // Validação de Choque de Horários
      if (checkCollision(dateStr, startTime, endTime)) {
        ignoredDates.push(new Date(dateStr + 'T12:00:00Z').toLocaleDateString('pt-BR'));
      } else {
        newLessons.push({
          id: crypto.randomUUID(),
          classId: classObj.id,
          date: dateStr,
          startTime,
          endTime,
          status: 'scheduled',
          type: 'regular'
        });
      }
      current.setUTCDate(current.getUTCDate() + 7); // advance one week
    }

    if (newLessons.length === 0 && ignoredDates.length === 0) {
      showAlert('Atenção', 'Nenhuma data encontrada nesse período para o dia da semana selecionado.', 'warning');
      return;
    }

    if (newLessons.length === 0 && ignoredDates.length > 0) {
      showAlert('⚠️ Choque de Horários!', `Nenhuma aula gerada. Todas as datas pretendidas deram choque com horários existentes: ${ignoredDates.join(', ')}`, 'warning');
      return;
    }

    const updatedLessons = [...(data.lessons || []), ...newLessons];
    updateData({ lessons: updatedLessons });
    dbService.saveData({ ...data, lessons: updatedLessons });

    setShowGenerateModal(false);
    
    if (ignoredDates.length > 0) {
      showAlert('Aviso de Agendamento Parcial', `Aulas geradas, porém os dias ${ignoredDates.join(', ')} foram ignorados devido a choque de horário no mesmo intervalo (⚠️ Choque de Horários!).`, 'warning');
    } else {
      showAlert('Sucesso', `${newLessons.length} aulas geradas com sucesso!`, 'success');
    }
  };

  const notifyLessonAction = (title: string, notificationMessage: string, waMessage: string) => {
    const students = data.students.filter(s => s.status === 'active' && s.classId === classObj.id);
    
    // Notificações Portal do Aluno
    const newNotifs: Notification[] = students.map(s => ({
      id: crypto.randomUUID(),
      studentId: s.id,
      title,
      message: notificationMessage,
      read: false,
      createdAt: new Date().toISOString()
    }));

    // Mensagens WhatsApp
    try {
      const payloadAlunos = students.map(student => {
        const birthDateStr = student.birthDate || '';
        let age = 18;
        if (birthDateStr && birthDateStr.includes('-')) {
          const [year, month, day] = birthDateStr.split('-').map(Number);
          const birthDate = new Date(year, month - 1, day);
          const today = new Date();
          age = today.getFullYear() - birthDate.getFullYear();
          const m = today.getMonth() - birthDate.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
        }
        const isMinor = age < 18;
        
        let targetPhone = isMinor && student.guardianPhone?.trim() ? student.guardianPhone : student.phone;
        if (!targetPhone) targetPhone = student.guardianPhone || student.phone || '';

        let targetName = isMinor && student.guardianName?.trim() ? student.guardianName : student.name;
        if (!targetName) targetName = student.guardianName || student.name || '';

        return {
          nome: targetName,
          telefone: targetPhone,
          nome_responsavel: student.guardianName,
          telefone_responsavel: student.guardianPhone
        };
      });

      fetch('/api/enviar-massa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alunos: payloadAlunos, mensagem: waMessage })
      }).catch(e => console.warn(e));
    } catch (e) {
      console.warn("Falha silenciosa api enviar-massa", e);
    }

    return newNotifs;
  };

  const handleCancelLesson = async (lesson: Lesson) => {
    if (!cancelReason) {
      showAlert('Atenção', 'Informe o motivo do cancelamento.', 'warning');
      return;
    }
    if (wantReplacement) {
      if (!replacementDate || !replacementStartTime || !replacementEndTime) {
        showAlert('Atenção', 'Informe a data e os horários da reposição.', 'warning');
        return;
      }
      if (replacementStartTime >= replacementEndTime) {
        showAlert('Atenção', 'O horário de término da reposição deve ser maior que o de início.', 'warning');
        return;
      }
      if (checkCollision(replacementDate, replacementStartTime, replacementEndTime, lesson.id)) {
        showAlert('⚠️ Choque de Horários!', 'Já existe uma aula marcada para este dia neste intervalo de tempo. Por favor, escolha outro horário.', 'warning');
        return;
      }
    }

    setIsClosing(true);

    const updatedLessons: Lesson[] = (data.lessons || []).map(l => 
      l.id === lesson.id ? { ...l, status: 'cancelled', cancelReason } : l
    );

    let replacementStr = '';
    if (wantReplacement && replacementDate) {
      updatedLessons.push({
        id: crypto.randomUUID(),
        classId: classObj.id,
        date: replacementDate,
        startTime: replacementStartTime,
        endTime: replacementEndTime,
        status: 'scheduled',
        type: 'reposicao',
        originalLessonId: lesson.id
      });
      replacementStr = `\n✅ *Reposição agendada:* ${new Date(replacementDate + 'T12:00:00Z').toLocaleDateString('pt-BR')}`;
    }

    const lessonDateStr = new Date(lesson.date + 'T12:00:00Z').toLocaleDateString('pt-BR');
    const notifMsg = `A aula do dia ${lessonDateStr} foi cancelada. Motivo: ${cancelReason}. ${wantReplacement ? `Uma reposição foi agendada para o dia ${new Date(replacementDate + 'T12:00:00Z').toLocaleDateString('pt-BR')}.` : ''}`;
    const waMsg = `🚨 *Aviso Importante: Aula Cancelada*\n\nOlá, {nome}!\nInformamos que a aula da turma *${classObj.name}* do dia *${lessonDateStr}* foi cancelada.\n\n*Motivo:* ${cancelReason}${replacementStr}\n\nAgradecemos a compreensão.`;

    const newNotifs = notifyLessonAction('Aula Cancelada', notifMsg, waMsg);
    const updatedNotifications = [...(data.notifications || []), ...newNotifs];

    updateData({ lessons: updatedLessons, notifications: updatedNotifications });
    await dbService.saveData({ ...data, lessons: updatedLessons, notifications: updatedNotifications });



    setTimeout(() => {
      setShowLessonDetail(null);
      setIsClosing(false);
      setCancelReason('');
      setWantReplacement(false);
      setReplacementDate('');
      setReplacementStartTime('');
      setReplacementEndTime('');
      showAlert('Sucesso', 'Aula cancelada e alunos notificados.', 'success');
    }, 400);
  };

  const handleUncancelLesson = async (lesson: Lesson) => {
    setIsClosing(true);
    const updatedLessons: Lesson[] = (data.lessons || []).map(l => 
      l.id === lesson.id ? { ...l, status: 'scheduled', cancelReason: undefined } : l
    );
    updateData({ lessons: updatedLessons });
    await dbService.saveData({ ...data, lessons: updatedLessons });

    setTimeout(() => {
      setShowLessonDetail(null);
      setIsClosing(false);
      showAlert('Sucesso', 'Aula reativada com sucesso.', 'success');
    }, 400);
  };

  const handleRescheduleLesson = async (lesson: Lesson) => {
    if (!replacementDate || !replacementStartTime || !replacementEndTime) {
      showAlert('Atenção', 'Informe nova data e horários.', 'warning');
      return;
    }
    if (replacementStartTime >= replacementEndTime) {
      showAlert('Atenção', 'Horário de término deve ser maior que o de início.', 'warning');
      return;
    }
    if (checkCollision(replacementDate, replacementStartTime, replacementEndTime, lesson.id)) {
      showAlert('⚠️ Choque de Horários!', 'Já existe uma aula marcada para este intervalo de tempo.', 'warning');
      return;
    }
    if (!cancelReason) {
      showAlert('Atenção', 'Informe o motivo do reagendamento.', 'warning');
      return;
    }

    setIsClosing(true);
    const updatedLessons: Lesson[] = (data.lessons || []).map(l => 
      l.id === lesson.id ? { ...l, date: replacementDate, startTime: replacementStartTime, endTime: replacementEndTime, status: 'rescheduled', cancelReason: undefined } : l
    );

    const oldDateStr = new Date(lesson.date + 'T12:00:00Z').toLocaleDateString('pt-BR');
    const newDateStr = new Date(replacementDate + 'T12:00:00Z').toLocaleDateString('pt-BR');

    const notifMsg = `A aula do dia ${oldDateStr} foi reagendada para ${newDateStr} (${replacementStartTime} às ${replacementEndTime}). Motivo: ${cancelReason}.`;
    const waMsg = `📅 *Aviso de Reagendamento*\n\nOlá, {nome}!\nInformamos que a aula da turma *${classObj.name}* originalmente do dia *${oldDateStr}* foi reagendada.\n\n*Nova Data:* ${newDateStr}\n*Novo Horário:* ${replacementStartTime} às ${replacementEndTime}\n*Motivo:* ${cancelReason}\n\nAgradecemos a compreensão!`;

    const newNotifs = notifyLessonAction('Aula Reagendada', notifMsg, waMsg);
    const updatedNotifications = [...(data.notifications || []), ...newNotifs];

    updateData({ lessons: updatedLessons, notifications: updatedNotifications });
    await dbService.saveData({ ...data, lessons: updatedLessons, notifications: updatedNotifications });

    setTimeout(() => {
      setShowLessonDetail(null);
      setIsClosing(false);
      setReplacementDate('');
      setReplacementStartTime('');
      setReplacementEndTime('');
      showAlert('Sucesso', 'Aula reagendada com sucesso.', 'success');
    }, 400);
  };

  const handleCancelAllFuture = () => {
    showConfirm('Cancelar Cronograma', 'Deseja realmente cancelar TODAS as aulas futuras não realizadas? Não haverá reposição e a ação atualizará todas para Cancelada.', async () => {
      const today = new Date().toISOString().split('T')[0];
      const updatedLessons = (data.lessons || []).map(l => {
        if (l.classId === classObj.id && l.status === 'scheduled' && l.date >= today) {
          return { ...l, status: 'cancelled', cancelReason: 'Cancelamento Geral de Cronograma' };
        }
        return l;
      });
      updateData({ lessons: updatedLessons as Lesson[] });
      await dbService.saveData({ ...data, lessons: updatedLessons as Lesson[] });
      showAlert('Sucesso', 'Cronograma futuro cancelado.', 'success');
    });
  };

  const handleUncancelAllFuture = () => {
    showConfirm('Reativar Cronograma', 'Deseja realmente reativar TODAS as aulas futuras que estavam canceladas?', async () => {
      const today = new Date().toISOString().split('T')[0];
      const updatedLessons = (data.lessons || []).map(l => {
        if (l.classId === classObj.id && l.status === 'cancelled' && l.date >= today) {
          return { ...l, status: 'scheduled', cancelReason: undefined };
        }
        return l;
      });
      updateData({ lessons: updatedLessons as Lesson[] });
      await dbService.saveData({ ...data, lessons: updatedLessons as Lesson[] });
      showAlert('Sucesso', 'Cronograma futuro reativado com sucesso.', 'success');
    });
  };

  const handleDeleteAllSchedule = () => {
    showConfirm('Excluir Cronograma Completo', '⚠️ Tem certeza? Isso removerá TODAS as aulas desta turma permanentemente (agendadas, canceladas e reposições). Esta ação NÃO pode ser desfeita.', async () => {
      const updatedLessons = (data.lessons || []).filter(l => l.classId !== classObj.id);
      updateData({ lessons: updatedLessons });
      await dbService.saveData({ ...data, lessons: updatedLessons });
      showAlert('Sucesso', 'Cronograma completo excluído.', 'success');
    });
  };

  const closeLessonDetail = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowLessonDetail(null);
      setIsClosing(false);
      setCancelReason('');
      setWantReplacement(false);
      setReplacementDate('');
      setReplacementStartTime('');
      setReplacementEndTime('');
    }, 400);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto animate-in fade-in">
      <div className="bg-slate-50 rounded-2xl w-full max-w-4xl shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-indigo-600 h-1.5 w-full absolute top-0 left-0 z-10"></div>
        
        {/* Header */}
        <div className="p-4 md:p-6 border-b border-slate-200 bg-white flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 z-10 sticky top-0">
          <button onClick={onClose} className="absolute top-4 right-4 md:top-6 md:right-6 p-2 bg-slate-100 text-slate-500 hover:text-red-500 rounded-xl transition-all">
            <X size={20} />
          </button>
          <div className="pr-12">
            <h3 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
              <Calendar className="text-indigo-600" /> Cronograma de Aulas
            </h3>
            <p className="text-sm text-slate-500 font-medium">Turma: {classObj.name}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <button 
              onClick={handleDeleteAllSchedule}
              className="px-3 py-1.5 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600 transition-colors flex items-center gap-1.5 shadow-sm text-xs md:text-sm"
              title="Exclui todo o cronograma permanentemente"
            >
              <Trash2 size={16} /> Excluir Tudo
            </button>
            <button 
              onClick={handleCancelAllFuture}
              className="px-3 py-1.5 bg-red-100 text-red-700 font-bold rounded-lg hover:bg-red-200 transition-colors flex items-center gap-1.5 text-xs md:text-sm"
              title="Cancela todas as próximas aulas da turma"
            >
              <AlertCircle size={16} /> Cancelar Todas
            </button>
            <button 
              onClick={handleUncancelAllFuture}
              className="px-3 py-1.5 bg-emerald-100 text-emerald-700 font-bold rounded-lg hover:bg-emerald-200 transition-colors flex items-center gap-1.5 text-xs md:text-sm"
              title="Reativa todas as próximas aulas canceladas"
            >
              <RefreshCw size={16} /> Reativar Todas
            </button>
            <button 
              onClick={() => setShowGenerateModal(true)}
              className="px-3 py-1.5 bg-indigo-100 text-indigo-700 font-bold rounded-lg hover:bg-indigo-200 transition-colors flex items-center gap-1.5 text-xs md:text-sm"
            >
              <Plus size={16} /> Adicionar Extra
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {classLessons.length === 0 ? (
            <div className="py-20 text-center text-slate-400">
              <Calendar size={64} className="mx-auto mb-4 opacity-20" />
              <p className="font-bold text-xl">Nenhuma aula gerada ainda.</p>
              <p className="text-sm mt-2">Clique em "Gerar Aulas do Ano" para preencher o cronograma.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {classLessons.map(lesson => {
                const dateObj = new Date(lesson.date);
                // Adjusting for timezone to correctly display the UTC date visually since input type date returns YYYY-MM-DD
                const displayDate = new Date(dateObj.getTime() + dateObj.getTimezoneOffset() * 60000);
                const isCancelled = lesson.status === 'cancelled';
                const isRescheduled = lesson.status === 'rescheduled';
                const isReposicao = lesson.type === 'reposicao';

                return (
                  <div 
                    key={lesson.id}
                    onClick={() => setShowLessonDetail(lesson)}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all hover:scale-105 ${
                      isCancelled 
                        ? 'bg-red-50 border-red-200 opacity-80' 
                        : isRescheduled
                        ? 'bg-orange-50 border-orange-300 shadow-sm'
                        : isReposicao
                        ? 'bg-emerald-50 border-emerald-200'
                        : 'bg-white border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    <div className="text-center">
                      <p className={`text-2xl font-black mb-0 ${isCancelled ? 'text-red-600 line-through' : 'text-slate-800'}`}>
                        {displayDate.getDate().toString().padStart(2, '0')}
                      </p>
                      <p className={`text-[10px] uppercase font-bold tracking-widest ${isCancelled ? 'text-red-400' : 'text-slate-400'}`}>
                        {displayDate.toLocaleString('pt-BR', { month: 'short' })} {displayDate.getFullYear()}
                      </p>
                      {lesson.startTime && lesson.endTime && (
                        <p className={`text-[9px] font-black tracking-wider mt-1 ${isCancelled ? 'text-red-400' : 'text-indigo-500'}`}>
                          {lesson.startTime} - {lesson.endTime}
                        </p>
                      )}
                      {isCancelled && (
                        <span className="inline-block mt-2 px-2 py-0.5 bg-red-100 text-red-700 text-[9px] font-black uppercase rounded-full">
                          Cancelada
                        </span>
                      )}
                      {isRescheduled && !isCancelled && !isReposicao && (
                        <span className="inline-block mt-2 px-2 py-0.5 bg-orange-100 text-orange-700 text-[9px] font-black uppercase rounded-full">
                          Reagendada
                        </span>
                      )}
                      {isReposicao && !isCancelled && (
                        <span className="inline-block mt-2 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-black uppercase rounded-full">
                          Reposição
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Generate Lessons Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95">
            <h3 className="text-xl font-black text-slate-800 mb-4">Adicionar Aula Extra</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Quantidade de Aulas Adicionais</label>
                <input type="number" min="1" className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm" 
                  value={extraCount} onChange={e => setExtraCount(parseInt(e.target.value) || '')} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Data Início</label>
                <input type="date" className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm" 
                  value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Data Fim (Automática)</label>
                <input type="date" className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm" 
                  value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Dia da Semana</label>
                <select className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                  value={dayOfWeek} onChange={e => setDayOfWeek(e.target.value)}>
                  <option value="0">Domingo</option>
                  <option value="1">Segunda-feira</option>
                  <option value="2">Terça-feira</option>
                  <option value="3">Quarta-feira</option>
                  <option value="4">Quinta-feira</option>
                  <option value="5">Sexta-feira</option>
                  <option value="6">Sábado</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Horário Início</label>
                  <input type="time" className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm" 
                    value={startTime} onChange={e => setStartTime(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Horário Fim</label>
                  <input type="time" className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm" 
                    value={endTime} onChange={e => setEndTime(e.target.value)} />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button onClick={() => setShowGenerateModal(false)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-lg transition-colors">Cancelar</button>
                <button onClick={handleGenerateLessons} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors">Adicionar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lesson Details & Cancellation Modal */}
      {showLessonDetail && (
        <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity duration-400 ${isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'}`}>
          <div className={`bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl transition-all duration-400 ${isClosing ? 'animate-slide-down-fade-out' : 'animate-slide-up'}`}>
            <div className={`p-6 border-b flex justify-between items-center ${showLessonDetail.status === 'cancelled' ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
              <h3 className="text-xl font-black text-slate-800">Detalhes da Aula</h3>
              <button onClick={closeLessonDetail} className="text-slate-400 hover:text-red-500 transition-colors"><X size={20}/></button>
            </div>

            <div className="p-6">
              <p className="text-sm font-bold text-slate-500 mb-1">Data Agendada</p>
              <p className="text-2xl font-black text-slate-800">
                {new Date(showLessonDetail.date + 'T12:00:00Z').toLocaleDateString('pt-BR')}
              </p>
              {showLessonDetail.startTime && showLessonDetail.endTime && (
                <p className="text-indigo-600 font-bold mb-6 mt-1 flex items-center gap-1.5 text-sm">
                  <Clock size={16} /> {showLessonDetail.startTime} às {showLessonDetail.endTime}
                </p>
              )}
              {!showLessonDetail.startTime && <div className="mb-6"></div>}

              {showLessonDetail.status === 'cancelled' ? (
                <div className="space-y-4">
                  <div className="p-4 bg-red-50 rounded-xl border border-red-100 text-red-800">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle size={18} /> <span className="font-bold">Aula Cancelada</span>
                    </div>
                    <p className="text-sm"><strong>Motivo:</strong> {showLessonDetail.cancelReason}</p>
                  </div>
                  {!wantReplacement ? (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleUncancelLesson(showLessonDetail)}
                        className="flex-1 py-4 bg-emerald-500 text-white rounded-xl font-black flex items-center justify-center gap-2 hover:bg-emerald-600 transition-colors shadow-sm"
                      >
                        <RefreshCw size={18} /> Reativar
                      </button>
                      <button 
                        onClick={() => setWantReplacement(true)}
                        className="flex-1 py-4 bg-indigo-500 text-white rounded-xl font-black flex items-center justify-center gap-2 hover:bg-indigo-600 transition-colors shadow-sm"
                      >
                        <Calendar size={18} /> Reagendar
                      </button>
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 mt-2 animate-in fade-in slide-in-from-top-2 space-y-4">
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-bold text-slate-700">Reagendar Aula Cancelada</label>
                        <button onClick={() => setWantReplacement(false)} className="text-slate-400 hover:text-red-500"><X size={16}/></button>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Nova Data</label>
                        <input type="date" className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                          value={replacementDate} onChange={e => setReplacementDate(e.target.value)} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Início</label>
                          <input type="time" className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            value={replacementStartTime} onChange={e => setReplacementStartTime(e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Fim</label>
                          <input type="time" className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            value={replacementEndTime} onChange={e => setReplacementEndTime(e.target.value)} />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-1">Motivo do Reagendamento</label>
                        <textarea 
                          className="w-full p-3 bg-white border border-indigo-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm placeholder-slate-300"
                          placeholder="Ex: Confirmação de disponibilidade..."
                          value={cancelReason}
                          onChange={e => setCancelReason(e.target.value)}
                        />
                      </div>
                      <button 
                        onClick={() => handleRescheduleLesson(showLessonDetail)}
                        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors"
                      >
                        Salvar e Notificar Alunos
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded"
                        checked={wantReplacement} onChange={e => {
                          setWantReplacement(e.target.checked);
                          if (e.target.checked) setCancelReason('');
                        }} />
                      <span className="text-sm font-bold text-slate-700">Reagendar esta aula (manter existente, alterar dia)</span>
                    </label>
                    <p className="text-[10px] text-slate-500 mt-1 mb-2 leading-tight">Marque se deseja apenas trocar a data/horário. Os alunos serão notificados do reagendamento.</p>

                    {wantReplacement && (
                      <div className="mt-2 animate-in fade-in slide-in-from-top-2 space-y-4">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Nova Data</label>
                          <input type="date" className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            value={replacementDate} onChange={e => setReplacementDate(e.target.value)} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Início</label>
                            <input type="time" className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                              value={replacementStartTime} onChange={e => setReplacementStartTime(e.target.value)} />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Fim</label>
                            <input type="time" className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                              value={replacementEndTime} onChange={e => setReplacementEndTime(e.target.value)} />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-1">Motivo da Alteração</label>
                          <textarea 
                            className="w-full p-3 bg-white border border-indigo-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm placeholder-slate-300"
                            placeholder="Ex: Mudança a pedido da turma..."
                            value={cancelReason}
                            onChange={e => setCancelReason(e.target.value)}
                          />
                        </div>
                        <button 
                          onClick={() => handleRescheduleLesson(showLessonDetail)}
                          className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors"
                        >
                          Salvar e Notificar Alunos
                        </button>
                      </div>
                    )}
                  </div>

                  {!wantReplacement && (
                    <div className="p-4 bg-red-50/50 rounded-xl border border-red-100 mt-4 animate-in fade-in">
                      <label className="block text-[10px] font-bold text-red-500 uppercase tracking-widest mb-1">Cancelar Aula - Informe o Motivo</label>
                      <textarea 
                        className="w-full p-3 bg-white border border-red-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 text-sm placeholder-slate-300"
                        placeholder="Ex: Doença do professor..."
                        value={cancelReason}
                        onChange={e => setCancelReason(e.target.value)}
                      />
                      <button 
                        onClick={() => handleCancelLesson(showLessonDetail)}
                        className="w-full mt-4 py-4 bg-red-500 text-white rounded-xl font-black flex items-center justify-center gap-2 hover:bg-red-600 transition-colors shadow-lg shadow-red-200"
                      >
                        <AlertCircle size={20} /> Cancelar e Notificar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LessonSchedule;
